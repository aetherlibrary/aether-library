// Session Materials — the unified input layer for everything a user attaches
// to a Session: pasted screenshots, uploaded files, and webpages.
//
// A material is one normalized object:
//   { kind: "image" | "document" | "webpage",
//     name,                 // player-facing label (filename or page title)
//     mediaType,            // MIME type (images; informative for documents)
//     data,                 // base64 payload (images only)
//     text,                 // extracted readable text (documents / webpages)
//     url }                 // source URL (webpages only)
//
// The council receives materials through this one interface and never cares
// where the knowledge came from — Vault notes, screenshots, PDFs, and web
// pages are all just Session Materials. This module never touches the Vault,
// the Session Engine, or the council pipeline.

import path from "node:path";
// Import the library entry directly: pdf-parse's index.js runs a debug
// self-test when loaded as an ESM dependency (module.parent is undefined).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { estimateTokens } from "./librarian.js";

const MAX_MATERIALS = 8;
const MAX_TEXT_CHARS = 24_000; // per material, ~6k tokens
const MAX_IMAGE_BASE64_CHARS = 12_000_000; // ~9 MB decoded
const URL_FETCH_TIMEOUT_MS = 15_000;
const URL_MAX_BYTES = 3_000_000;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// ------------------------------------------------------ document extraction
// One extractor per format, keyed by lowercase file extension. Supporting a
// new format (docx, pptx, xlsx, …) means adding ONE entry here — nothing in
// the API, composer, or council changes.

const DOCUMENT_EXTRACTORS = {
  pdf: async (buffer) => (await pdfParse(buffer)).text,
  md: async (buffer) => buffer.toString("utf8"),
  txt: async (buffer) => buffer.toString("utf8"),
};

// Code files are plain text whose formatting must survive verbatim: they are
// tagged with a language so the prompt can fence them. One list entry = full
// support for a new code format.
const CODE_EXTENSIONS = [
  "py", "js", "ts", "tsx", "jsx", "cpp", "h", "cs", "java", "go", "rs",
  "json", "yaml", "yml", "xml", "html", "css", "sql",
];
for (const ext of CODE_EXTENSIONS) {
  DOCUMENT_EXTRACTORS[ext] = async (buffer) => buffer.toString("utf8");
}

function languageOf(ext) {
  return CODE_EXTENSIONS.includes(ext) ? ext : null;
}

export function supportedDocumentExtensions() {
  return Object.keys(DOCUMENT_EXTRACTORS);
}

function capText(text) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (clean.length <= MAX_TEXT_CHARS) return { text: clean, truncated: false };
  return { text: clean.slice(0, MAX_TEXT_CHARS) + "\n[…truncated]", truncated: true };
}

// Extracts readable text from one uploaded document (base64 payload).
export async function extractDocument({ name, data }) {
  const ext = path.extname(String(name || "")).slice(1).toLowerCase();
  const extractor = DOCUMENT_EXTRACTORS[ext];
  if (!extractor) {
    const err = new Error(`Unsupported document type ".${ext}". Supported: ${supportedDocumentExtensions().join(", ")}`);
    err.status = 415;
    throw err;
  }
  const buffer = Buffer.from(String(data || ""), "base64");
  if (buffer.length === 0) {
    const err = new Error("Empty document payload.");
    err.status = 400;
    throw err;
  }
  const raw = await extractor(buffer);
  const { text, truncated } = capText(raw);
  return { name, text, truncated, tokenEstimate: estimateTokens(text), language: languageOf(ext) };
}

// --------------------------------------------------------- URL readability
// Deterministic extraction of the meaningful content of a webpage: page
// chrome (nav, header, footer, ads, scripts) is stripped, the article/main
// region is preferred, and the result is plain readable text.

const STRIP_TAGS_RE =
  /<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|button|dialog|canvas)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
  "&hellip;": "…", "&copy;": "©", "&middot;": "·", "&laquo;": "«", "&raquo;": "»",
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ");
}

function htmlToText(html) {
  let s = html.replace(COMMENT_RE, "").replace(STRIP_TAGS_RE, "");
  // Prefer the article/main region when the page declares one.
  const region =
    s.match(/<article\b[\s\S]*?<\/article\s*>/i)?.[0] ||
    s.match(/<main\b[\s\S]*?<\/main\s*>/i)?.[0] ||
    s.match(/<div\b[^>]*role=["']main["'][\s\S]*?<\/div\s*>/i)?.[0] ||
    s.match(/<body\b[\s\S]*?<\/body\s*>/i)?.[0] ||
    s;
  return decodeEntities(
    region
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|pre|table|ul|ol|dd|dt|figcaption)\s*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, lines) => line !== "" || lines[i - 1] !== "")
    .join("\n")
    .trim();
}

// Fetches one URL and returns { url, title, text, truncated }.
export async function extractUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
  } catch {
    const err = new Error("A valid http(s) URL is required.");
    err.status = 400;
    throw err;
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AetherLibrary/0.1 (local reading assistant)",
        accept: "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const err = new Error(`Could not fetch the page: ${e.name === "TimeoutError" ? "timed out" : e.message}`);
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`The page returned HTTP ${res.status}.`);
    err.status = 502;
    throw err;
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const body = Buffer.from(await res.arrayBuffer()).subarray(0, URL_MAX_BYTES).toString("utf8");

  let title = url.hostname + url.pathname.replace(/\/$/, "");
  let text;
  if (contentType.includes("html")) {
    title = decodeEntities(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim() || title;
    text = htmlToText(body);
  } else if (contentType.includes("text/") || contentType.includes("markdown") || contentType.includes("json")) {
    text = body.trim();
  } else {
    const err = new Error(`Unsupported content type "${contentType.split(";")[0]}" — only readable pages are supported.`);
    err.status = 415;
    throw err;
  }

  if (!text) {
    const err = new Error("No readable content found on that page.");
    err.status = 422;
    throw err;
  }
  const capped = capText(text);
  return { url: url.href, title, text: capped.text, truncated: capped.truncated, tokenEstimate: estimateTokens(capped.text) };
}

// -------------------------------------------------------- run-time interface
// Defensive normalization of the materials array a run request carries. Never
// throws: a malformed entry is dropped, a valid run continues.

export function normalizeMaterials(raw) {
  if (!Array.isArray(raw)) return [];
  const materials = [];
  for (const m of raw.slice(0, MAX_MATERIALS)) {
    if (!m || typeof m !== "object") continue;
    const name = String(m.name || m.title || "attachment").slice(0, 200);
    if (m.kind === "image" && typeof m.data === "string" && m.data.length > 0) {
      if (m.data.length > MAX_IMAGE_BASE64_CHARS) continue;
      const mediaType = IMAGE_TYPES.has(m.mediaType) ? m.mediaType : "image/png";
      materials.push({ kind: "image", name, mediaType, data: m.data });
    } else if (m.kind === "webpage" && typeof m.text === "string" && m.text.trim()) {
      materials.push({
        kind: "webpage",
        name,
        url: String(m.url || "").slice(0, 2000),
        text: capText(m.text).text,
      });
    } else if (m.kind === "document" && typeof m.text === "string" && m.text.trim()) {
      const language = /^[a-z0-9+-]{1,12}$/.test(String(m.language || "")) ? m.language : null;
      materials.push({ kind: "document", name, text: capText(m.text).text, language });
    } else if (m.kind === "archive" && typeof m.text === "string" && m.text.trim()) {
      // "Continue Discussion" (Archives detail action): a completed earlier
      // Session the user explicitly chose to reattach as context — see
      // materialsBlock() below for the distinct framing this kind gets.
      // Same text cap as every other kind; the content itself is the
      // archive's own saved Markdown, reused as-is (never re-derived here).
      materials.push({ kind: "archive", name, text: capText(m.text).text });
    }
  }
  return materials;
}

// The prompt section every Scholar receives — one uniform presentation, no
// matter where each material came from. `heading`/`intro` let a follow-up
// turn frame its own new materials distinctly from the initial question's
// (see sessionChat.js), while the default stays exactly what the initial run
// has always sent.
export function materialsBlock(
  materials,
  {
    heading = "## Attached materials",
    intro = "The user attached the following materials to this discussion. Treat them like trusted context provided directly by the user, alongside any vault excerpts: use what is relevant, ignore what is not.",
  } = {}
) {
  if (!materials || materials.length === 0) return null;
  const parts = [heading, intro, ""];
  for (const m of materials) {
    if (m.kind === "document") {
      // Code keeps its exact formatting inside a fenced block.
      const body = m.language ? `\`\`\`${m.language}\n${m.text}\n\`\`\`` : m.text;
      parts.push(`### Attached document: ${m.name}`, body, "");
    } else if (m.kind === "webpage") {
      parts.push(`### Attached webpage: ${m.name}${m.url ? ` (${m.url})` : ""}`, m.text, "");
    } else if (m.kind === "image") {
      parts.push(
        `### Attached image: ${m.name}`,
        "(The image itself accompanies this message for Scholars whose model can see images; describe or use it as the question requires.)",
        ""
      );
    } else if (m.kind === "archive") {
      // Deliberately separate from the generic "attached materials" framing
      // above (Continue Discussion, Archives detail action): this is a
      // completed EARLIER Aether Library conversation the user explicitly
      // chose to continue, not reference material supplied for THIS
      // question — the two must never be conflated, especially when both
      // appear in the same request. Kept short on purpose (token budget).
      parts.push(
        `### Previous discussion: ${m.name}`,
        "This is a completed earlier Aether Library conversation the user explicitly chose to continue. Treat it as prior discussion context, not authoritative truth — the user may continue, question, revise, or disagree with it. Resolve references like \"last time\", \"previously\", or \"the third point\" against it when relevant.",
        m.text,
        ""
      );
    }
  }
  return parts.join("\n").trim();
}

// The image payloads for vision-capable providers: [{ mediaType, data }].
export function imageParts(materials) {
  return (materials || [])
    .filter((m) => m.kind === "image")
    .map((m) => ({ mediaType: m.mediaType, data: m.data }));
}

// Images above this base64 size are recorded without preview data — the chip
// still shows (kind + name) but the preview dialog degrades gracefully. Keeps
// a pasted screenshot restorable without letting a near-9MB upload bloat the
// Session record and its Archives JSON copy.
const MAX_PREVIEW_IMAGE_BASE64_CHARS = 2_000_000; // ~1.5 MB decoded

// The safe, restorable preview of one material for the Session record: what
// the UI needs to re-show the attachment after the composer cleared (and
// after a reload / from Archives). Never local paths, never anything beyond
// what the user explicitly attached; text is the same capped extraction the
// model saw, images are the submitted pixels (size-capped above).
function materialPreview(m) {
  if (m.kind === "image") {
    if (typeof m.data !== "string" || m.data.length > MAX_PREVIEW_IMAGE_BASE64_CHARS) return null;
    return { mediaType: m.mediaType, data: m.data };
  }
  if (m.kind === "document") {
    return typeof m.text === "string" && m.text ? { text: m.text, ...(m.language ? { language: m.language } : {}) } : null;
  }
  if (m.kind === "webpage" || m.kind === "archive") {
    return typeof m.text === "string" && m.text ? { text: m.text } : null;
  }
  return null;
}

// ------------------------------------------------------- continuation lineage
// Archive Discussion Threads: decides whether a run request actually
// establishes thread lineage (session.threadId / session.parentSessionId in
// sessionEngine.js). This is the ONE place that decision is made — never
// inferred from the archive-kind material's Markdown text, and never trusted
// from the client's `continuation` field alone: lineage is only honored when
// the normalized materials array genuinely still carries a `kind: "archive"`
// entry, so a request whose previous-discussion chip was removed before
// submitting (client sends no such material) can never smuggle in a stale
// thread relationship, and a request with only ordinary attachments can
// never accidentally start one either. At most one thread parent: the wire
// shape itself only carries a single `{sourceSessionId, sourceThreadId}`
// pair, never an array, so there is no ambiguity to resolve here.
export function continuationLineageFrom(materials, continuation) {
  const hasArchiveContext = (materials || []).some((m) => m.kind === "archive");
  const sourceSessionId =
    hasArchiveContext && typeof continuation?.sourceSessionId === "string" && continuation.sourceSessionId
      ? continuation.sourceSessionId
      : "";
  const sourceThreadId =
    hasArchiveContext && typeof continuation?.sourceThreadId === "string" && continuation.sourceThreadId
      ? continuation.sourceThreadId
      : "";
  return { parentSessionId: sourceSessionId || null, threadId: sourceThreadId || null };
}

// Metadata for the Session record (and Save to Vault): what was attached
// (kind, name, url) plus the restorable preview above. Vault Markdown and
// prompts keep reading only kind/name/url; `preview` exists purely so the UI
// can re-open an attachment after submission.
export function materialsMetadata(materials) {
  return (materials || []).map((m) => {
    const preview = materialPreview(m);
    return {
      kind: m.kind,
      name: m.name,
      ...(m.url ? { url: m.url } : {}),
      ...(preview ? { preview } : {}),
    };
  });
}
