// LocalVaultAdapter — writes a Session to the local Markdown vault on disk.
//
// This is the ONLY place Session persistence touches the filesystem. The
// Session Engine calls the active adapter's saveSession(); it never writes
// directly. Future adapters (Google Drive, Browser Folder, OneDrive) will
// implement the same saveSession(session) -> { adapter, path, savedAt }
// contract without the engine changing.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { identityTitles } from "../localization.js";

// Saved sessions live under the working area, not the curated knowledge.
const SESSIONS_SUBDIR = path.join("20-working", "sessions");

export const localVaultAdapter = {
  id: "local",
  label: "Local Vault",

  // Writes the session as one Markdown file and returns where it landed.
  // Filenames are human-readable (the question itself — no UUID); the
  // session's immutable ID lives only in the frontmatter (`session_id`).
  // Re-saving the same session updates its own file rather than spawning
  // duplicates, and an existing note is never overwritten — name collisions
  // get a " (2)" style suffix instead.
  async saveSession(session) {
    if (!config.vaultPath) {
      const err = new Error("No Vault connected. Connect a Vault from the header before saving to it.");
      err.status = 409;
      throw err;
    }
    const dir = path.join(config.vaultPath, SESSIONS_SUBDIR);
    await fs.mkdir(dir, { recursive: true });

    const filePath = await resolveSessionFilePath(dir, session);
    await fs.writeFile(filePath, renderSessionMarkdown(session), "utf8");

    return { adapter: this.id, path: filePath, savedAt: new Date().toISOString() };
  },
};

// Windows-illegal filename characters (superset of every other platform),
// plus control characters.
const INVALID_FS_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
// Windows also reserves a handful of bare device names.
const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// Human-readable filename stem from the question: the original text with
// illegal filesystem characters removed, whitespace collapsed, length capped,
// and Windows quirks (trailing dots/spaces, device names) neutralized.
function readableName(question) {
  let name = String(question || "")
    .replace(INVALID_FS_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  name = [...name].slice(0, 60).join("").trim().replace(/[. ]+$/g, "");
  if (!name) return "session";
  return RESERVED_NAMES.test(name) ? `${name} session` : name;
}

// True when the file at absPath is THIS session's own note — its frontmatter
// carries the matching session_id. This is what makes updating safe: a file
// the user replaced or authored themselves never matches and is never touched.
async function isOwnSessionFile(absPath, sessionId) {
  try {
    const head = (await fs.readFile(absPath, "utf8")).slice(0, 500);
    return head.includes(`session_id: ${sessionId}`);
  } catch {
    return false;
  }
}

async function fileExists(absPath) {
  return fs.access(absPath).then(
    () => true,
    () => false
  );
}

// Where this save should land:
//   1. the session's own previous file (re-save updates in place) — but only
//      after verifying the frontmatter still matches this session;
//   2. else the readable name, adopting an existing file only when it is this
//      session's own; any other collision moves on to "name (2).md", (3), …
// An existing note that is not ours is NEVER overwritten.
async function resolveSessionFilePath(dir, session) {
  const previous = session.vault?.path;
  if (previous && (await isOwnSessionFile(previous, session.id))) return previous;

  const base = readableName(session.question);
  let candidate = path.join(dir, `${base}.md`);
  for (let n = 2; await fileExists(candidate); n++) {
    if (await isOwnSessionFile(candidate, session.id)) return candidate;
    candidate = path.join(dir, `${base} (${n}).md`);
  }
  return candidate;
}

// Provider/model are technical metadata — recorded, but never used as the
// character's identity (which stays the localized persona name).
function providerTag(entry) {
  if (!entry?.provider) return "";
  return entry.model ? ` (${entry.provider} · ${entry.model})` : ` (${entry.provider})`;
}

// PRODUCT TERMINOLOGY RULE: the markdown frontmatter is read by humans (and
// their Obsidian tooling), so it always uses the official Aether Library
// terms shown in the UI — never internal implementation names. The runtime
// keeps using "single"/"council" internally; only this rendering translates.
// Future frontmatter fields must follow the same rule.
//
// council's product name is now "council" itself (matching modeCouncil in
// src/locales/*.js) — kept as an explicit mapping rather than relying on
// that coincidence, so a future product-name change only touches this
// line. Pre-MVP terminology correction: this used to read "debate" ("Debate
// Mode"), retired in favor of "Council Mode" / 智囊團模式 since the
// pipeline has no Scholar-to-Scholar rebuttal. Existing saved notes that
// already say "mode: debate" are NOT rewritten — only new saves use this.
const MODE_PRODUCT_NAMES = { single: "mentor", council: "council" };

function productMode(mode) {
  return MODE_PRODUCT_NAMES[mode] || mode;
}

// Canonical product name for a fixed Scholar slot ("analyst"), independent of
// the localized persona the session happened to run under (理者 → analyst).
function productScholarName(scholar) {
  const canonical = identityTitles().scholars?.[scholar?.slot];
  return (canonical || scholar?.persona || "").toLowerCase();
}

// The same note saveSession() would write, without touching disk: filename
// from the question, content from the record. Reused by the Obsidian archive
// sync (services/obsidianExport.js) when an archived Session has no readable
// native-Vault file to copy — archive records carry the full Session shape,
// so they render identically.
export function renderSessionNote(session) {
  return { filename: `${readableName(session.question)}.md`, content: renderSessionMarkdown(session) };
}

function renderSessionMarkdown(session) {
  const scholars = Object.values(session.scholars || {}).sort((a, b) => a.slot - b.slot);
  const answered = scholars.filter((s) => s.status === "ok");

  const attachments = Array.isArray(session.attachments) ? session.attachments : [];

  // Mentor sessions have exactly one Scholar — name it (and its provider and
  // model) directly in the frontmatter. Council sessions list the count; the
  // per-Scholar details live in the body sections.
  const soleScholar = session.mode === "single" ? scholars[0] : null;

  const front = [
    "---",
    `session_id: ${session.id}`,
    "type: aether-session",
    `mode: ${productMode(session.mode)}`,
    `status: ${session.status}`,
    soleScholar ? `scholar: ${productScholarName(soleScholar)}` : null,
    `scholar_count: ${scholars.length}`,
    soleScholar?.provider ? `provider: ${soleScholar.provider}` : null,
    soleScholar?.model ? `model: ${soleScholar.model}` : null,
    `attachment_count: ${attachments.length}`,
    `started: ${session.startedAt}`,
    `finished: ${session.finishedAt || ""}`,
    `display_language: ${session.identity?.language || ""}`,
    // Archive Discussion Threads lineage (see continuationLineageFrom() in
    // src/services/materials.js). thread_id defaults to this session's own
    // id for a session that isn't a continuation — every note always has
    // one. parent_session_id is only written when this note continues
    // another one; a legacy note simply lacks both lines, exactly like
    // session_id-less notes never existed but new fields still may be
    // absent on old files.
    `thread_id: ${session.threadId || session.id}`,
    session.parentSessionId ? `parent_session_id: ${session.parentSessionId}` : null,
    "source: aether-library",
    "---",
    "",
  ].filter((line) => line !== null);

  const body = [`# ${session.question}`, ""];

  // Attachment metadata only: what the Session consulted, never the content.
  // Uploaded files are temporary Session materials and are not copied here.
  if (attachments.length > 0) {
    const icons = { image: "🖼", document: "📄", webpage: "🌐", archive: "↩" };
    body.push("## Attached materials", "");
    for (const a of attachments) {
      body.push(`- ${icons[a.kind] || "📎"} ${a.name}${a.url ? ` (${a.url})` : ""}`);
    }
    body.push("");
  }

  // Council: the Judge summary leads. Single Scholar: no summary section.
  if (session.mode === "council" && session.judge?.status === "ok") {
    const judgeName = session.identity?.judge || "Judge";
    body.push(`## Summary — ${judgeName}${providerTag(session.judge)}`, "", session.judge.answer, "");
  }

  for (const s of scholars) {
    body.push(`## ${s.persona}${providerTag(s)}`, "");
    body.push(s.status === "ok" ? s.answer : `_(no answer: ${s.error || s.status})_`, "");
  }

  if ((session.chat || []).length > 0) {
    const assistantName =
      session.mode === "single"
        ? answered[0]?.persona || "Scholar"
        : session.identity?.judge || "Judge";
    body.push("## Conversation", "");
    for (const m of session.chat) {
      const who = m.role === "assistant" ? assistantName : "You";
      body.push(`**${who}:** ${m.text}`);
      // This turn's own attachments (a follow-up upload) — distinct from the
      // session-level "## Attached materials" section above, which is only
      // ever the original question's attachments.
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        const icons = { image: "🖼", document: "📄", webpage: "🌐", archive: "↩" };
        for (const a of m.attachments) {
          body.push(`_${icons[a.kind] || "📎"} ${a.name}${a.url ? ` (${a.url})` : ""}_`);
        }
      }
      body.push("");
    }
  }

  return front.join("\n") + body.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
