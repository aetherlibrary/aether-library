// Librarian: deterministic, token-frugal retrieval from the local vault.
// Keyword matching + folder routing only — no embeddings, no vector DB.
// Read-only: this module never writes to the vault.
//
// Pipeline: question keywords → score top-level folders (domains) → score
// markdown files inside the top 1-3 domains → extract the highest-scoring
// paragraphs, capped per file and by a global token budget.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const MAX_FILE_BYTES = 200 * 1024; // skip anything bigger — likely not a note
const MAX_FILES_PER_DOMAIN = 200;
const MAX_SCAN_DEPTH = 4;

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this",
  "that", "what", "when", "where", "which", "who", "why", "how", "does",
  "did", "can", "could", "should", "would", "have", "has", "had", "was",
  "were", "will", "about", "into", "from", "they", "them", "there", "their",
  "then", "than", "these", "those", "some", "any", "all", "our", "out",
  "get", "got", "just", "also", "very", "much", "more", "most", "one",
  "two", "please", "tell", "explain", "describe", "give", "make", "want",
  "need", "know", "think", "like", "use", "using", "way", "ways",
]);

function log(...args) {
  console.log("[librarian]", ...args);
}

// ~4 chars per token is a good enough estimate for budgeting.
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

const MAX_KEYWORDS = 32;
const MAX_CJK_PHRASE = 8; // keep full runs up to this length; longer runs contribute bigrams only

// English: whole words, stopwords removed. Chinese/CJK: punctuation splits
// runs naturally; each run yields the full phrase (when short enough) plus
// overlapping bigrams, e.g. 火風鼎 → 火風鼎, 火風, 風鼎.
export function extractKeywords(question) {
  const english = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const cjk = [];
  const runs = question.match(/[\p{Script=Han}぀-ヿ]+/gu) || [];
  for (const run of runs) {
    const chars = [...run];
    if (chars.length >= 2 && chars.length <= MAX_CJK_PHRASE) cjk.push(run);
    for (let i = 0; i + 1 < chars.length; i++) {
      cjk.push(chars[i] + chars[i + 1]);
    }
  }

  return {
    english: [...new Set(english)],
    cjk: [...new Set(cjk)],
    all: [...new Set([...english, ...cjk])].slice(0, MAX_KEYWORDS),
  };
}

function countMatches(haystackLower, keyword) {
  let count = 0;
  let idx = haystackLower.indexOf(keyword);
  while (idx !== -1) {
    count += 1;
    idx = haystackLower.indexOf(keyword, idx + keyword.length);
  }
  return count;
}

async function listDomainFolders() {
  const entries = await fs.readdir(config.vaultPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

// Recursively collect .md files under one domain folder (bounded).
async function collectMarkdownFiles(domain) {
  const files = [];
  async function walk(dir, depth) {
    if (depth > MAX_SCAN_DEPTH || files.length >= MAX_FILES_PER_DOMAIN) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_FILES_PER_DOMAIN) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(full);
      }
    }
  }
  await walk(path.join(config.vaultPath, domain), 0);
  return files;
}

// Domain routing: score each top-level folder by keyword hits in its own
// name and in the names of the markdown files it contains. Returns every
// domain (with its file list) so callers can fall back to a content scan.
async function scoreDomains(keywords) {
  const domains = await listDomainFolders();
  const scored = [];
  const matchedFilenames = [];

  for (const domain of domains) {
    const files = await collectMarkdownFiles(domain);
    const domainLower = domain.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (domainLower.includes(kw)) score += 3;
    }
    for (const file of files) {
      const nameLower = path.basename(file).toLowerCase();
      let nameHits = 0;
      for (const kw of keywords) {
        if (nameLower.includes(kw)) nameHits += 1;
      }
      if (nameHits > 0) matchedFilenames.push(path.basename(file));
      score += nameHits;
    }
    scored.push({ domain, files, score });
  }

  log("domain scores:", scored.map((d) => `${d.domain}=${d.score}`).join(", ") || "(no folders)");
  log("matched filenames:", matchedFilenames.join(", ") || "(none)");

  const matched = scored
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))
    .slice(0, config.librarian.maxDomains);

  return { matched, all: scored };
}

// File scoring: filename hits weigh heavily; content occurrences are capped
// per keyword so one repetitive term can't dominate.
function scoreFile(relPath, contentLower, keywords) {
  const nameLower = path.basename(relPath).toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (nameLower.includes(kw)) score += 10;
    score += Math.min(countMatches(contentLower, kw), 10);
  }
  return score;
}

// YAML frontmatter helps scoring (titles, domains) but wastes snippet budget.
function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

// Player-facing document title: frontmatter `title:`, else the first heading,
// else the filename without its extension. Never a path — the UI must present
// notes as library books, not as files.
function titleOf(relPath, content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m);
    if (t) return t[1].trim().replace(/^["']|["']$/g, "");
  }
  const heading = stripFrontmatter(content).match(/^#{1,3}\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return path.basename(relPath).replace(/\.[^.]+$/, "");
}

// Pick the highest-scoring paragraphs, then emit them in document order so
// the snippet reads coherently. Falls back to the opening paragraphs when
// only the filename matched.
function extractSnippet(content, keywords, tokenCap) {
  const paragraphs = stripFrontmatter(content)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const scored = paragraphs.map((text, order) => {
    const lower = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) score += countMatches(lower, kw);
    return { text, order, score };
  });

  let candidates = scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  if (candidates.length === 0) candidates = scored.slice(0, 2);

  const chosen = [];
  let tokens = 0;
  for (const p of candidates) {
    const cost = estimateTokens(p.text);
    if (tokens + cost > tokenCap) continue;
    chosen.push(p);
    tokens += cost;
  }

  chosen.sort((a, b) => a.order - b.order);
  return { text: chosen.map((p) => p.text).join("\n\n"), tokens };
}

// Main entry point. Returns an empty package (snippets: []) when nothing
// relevant is found; callers continue normally.
export async function retrieveVaultContext(question) {
  const empty = { snippets: [], sources: [], titles: [], domains: [], tokenEstimate: 0 };

  const extracted = extractKeywords(question);
  const keywords = extracted.all;
  log("question keywords:", keywords.join(", ") || "(none)");
  log("cjk keywords:", extracted.cjk.join(", ") || "(none)");
  if (keywords.length === 0) {
    log("no usable keywords — returning empty context package");
    return empty;
  }

  let routing;
  try {
    routing = await scoreDomains(keywords);
  } catch (err) {
    log("vault not readable:", err.message, "— returning empty context package");
    return empty;
  }

  // Fallback: when no folder or filename matches, the term may still live
  // inside note contents — scan all domains, relying on file-content scoring.
  let domains = routing.matched;
  let usedContentFallback = false;
  if (domains.length === 0) {
    log("no folder/filename match — falling back to content scan across all domains");
    domains = routing.all;
    usedContentFallback = true;
  } else {
    log("chosen domains:", domains.map((d) => `${d.domain} (score ${d.score})`).join(", "));
  }

  // Score every markdown file inside the chosen domains.
  const scoredFiles = [];
  for (const { files } of domains) {
    for (const file of files) {
      const relPath = path.relative(config.vaultPath, file).split(path.sep).join("/");
      try {
        const stat = await fs.stat(file);
        if (stat.size > MAX_FILE_BYTES) continue;
        const content = await fs.readFile(file, "utf8");
        const score = scoreFile(relPath, content.toLowerCase(), keywords);
        if (score > 0) scoredFiles.push({ relPath, content, score });
      } catch {
        // Unreadable file — skip it.
      }
    }
  }

  scoredFiles.sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath));
  const selected = scoredFiles.slice(0, config.librarian.maxFiles);

  if (selected.length === 0) {
    log("no relevant files in chosen domains — returning empty context package");
    return empty;
  }
  log("files selected:", selected.map((f) => `${f.relPath} (score ${f.score})`).join(", "));

  // Extract snippets under the global token budget.
  const snippets = [];
  let totalTokens = 0;
  for (const file of selected) {
    const remaining = config.librarian.tokenBudget - totalTokens;
    if (remaining <= 0) break;
    const cap = Math.min(config.librarian.maxFileTokens, remaining);
    const { text, tokens } = extractSnippet(file.content, keywords, cap);
    if (!text) continue;
    snippets.push({ file: file.relPath, title: titleOf(file.relPath, file.content), text, tokens });
    totalTokens += tokens;
  }

  log(`retrieved ${snippets.length} snippet(s), estimated ${totalTokens} tokens (budget ${config.librarian.tokenBudget})`);

  // Under the content fallback, report only the domains the snippets came from.
  const usedDomains = usedContentFallback
    ? [...new Set(snippets.map((s) => s.file.split("/")[0]))]
    : domains.map((d) => d.domain);

  return {
    snippets,
    sources: snippets.map((s) => s.file),
    titles: snippets.map((s) => s.title),
    domains: usedDomains,
    tokenEstimate: totalTokens,
  };
}
