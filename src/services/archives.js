// Archive Store — automatic local history of completed Sessions.
//
// An archive record is a read-only snapshot of a finished Session (question,
// Scholar answers, Judge synthesis) kept so the player can browse past
// discussions from the Archives screen. This is independent of the Vault:
// Save to Vault writes a curated Markdown note the player asked for, while an
// archive record is captured automatically for every completed Session.
// Deleting an archive record never touches a Vault file — the two
// persistence paths intentionally never share storage.
//
// One JSON file per Session, keyed by the Session's own immutable id, mirrors
// the one-Markdown-file-per-Session pattern in localVaultAdapter.js: writing
// the same Session twice overwrites its own file instead of duplicating it.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_DEFS } from "../config.js";
import { IDENTITY_PACKS, UI_STRINGS } from "../localization.js";
import { renderSessionNote } from "../vault/localVaultAdapter.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real data directory.
const ARCHIVE_DIR = process.env.ARCHIVE_DIR
  ? path.resolve(process.env.ARCHIVE_DIR)
  : path.join(projectRoot, "data", "archives");

const TITLE_MAX_LENGTH = 60;

// First meaningful line of the question, trimmed and capped. Never makes an
// extra AI request just to name a Session.
export function generateTitle(question) {
  const firstLine =
    String(question || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) || "Untitled session";
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

// A Session is archivable once it has reached the completed state this
// feature cares about: at least one Scholar answered, and — in Council mode
// — the Judge's synthesis is in. Sessions that never got that far (every
// Scholar failed, or the Judge could not rule) are skipped rather than
// mislabeled: the Session model has no reliable "failed"/"interrupted"
// status yet to record them under instead.
export function isSessionComplete(session) {
  const hasScholarAnswer = Object.values(session?.scholars || {}).some(
    (s) => s?.status === "ok" && s.answer
  );
  if (!hasScholarAnswer) return false;
  if (session.mode === "council") {
    return session.judge?.status === "ok" && Boolean(session.judge.answer);
  }
  return true;
}

function filePathFor(id) {
  return path.join(ARCHIVE_DIR, `${id}.json`);
}

// Reuses the Session shape directly (scholars, judge, identity, vault,
// attachments, chat) instead of a parallel schema; only `title` and
// `archivedAt` are added. `archiveSession()` is called again on every
// re-save (see saveActiveSessionToVault()), so the record's `chat` always
// reflects the conversation as of the most recent save — the same
// re-save-updates-in-place guarantee the Vault file itself has.
function toRecord(session) {
  return {
    id: session.id,
    title: generateTitle(session.question),
    question: session.question,
    mode: session.mode,
    status: "completed",
    startedAt: session.startedAt,
    finishedAt: session.finishedAt || new Date().toISOString(),
    scholars: session.scholars || {},
    judge: session.judge || null,
    identity: session.identity || null,
    vault: session.vault || null,
    attachments: Array.isArray(session.attachments) ? session.attachments : [],
    chat: Array.isArray(session.chat) ? session.chat : [],
    // Where this Session's Obsidian copy landed, if it was ever exported
    // (live export row or the Archives "Sync to Obsidian" action — both keep
    // the Session and its archive record in sync). Carried through re-saves
    // so a later sync updates that same note instead of minting a second.
    obsidianExport: session.obsidianExport || null,
    // Archive Discussion Threads lineage (see continuationLineageFrom() in
    // services/materials.js, the one place that decides these on the active
    // Session). A thread root's own id doubles as its threadId; see
    // normalizeThread() below for how an older record without these fields
    // reads exactly the same way at load time, with nothing rewritten here.
    threadId: session.threadId || session.id,
    parentSessionId: session.parentSessionId || null,
    archivedAt: new Date().toISOString(),
  };
}

// Saves (or re-saves) one Session's archive record. Safe to call more than
// once for the same Session (e.g. once when it completes, again after a
// later Save to Vault to pick up the Vault reference) — the file is keyed by
// the Session's own id, so this always updates the one record, never adds a
// second. Returns null (a no-op) for a Session that isn't archivable yet;
// never throws, so a storage problem here can't block the run that produced
// the answer.
export async function archiveSession(session) {
  if (!session || !isSessionComplete(session)) return null;
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  const record = toRecord(session);
  await fs.writeFile(filePathFor(record.id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

async function readAllRecords() {
  let files;
  try {
    files = await fs.readdir(ARCHIVE_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const records = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          return JSON.parse(await fs.readFile(path.join(ARCHIVE_DIR, f), "utf8"));
        } catch (err) {
          console.error(`[archives] skipping unreadable archive file ${f}:`, err.message);
          return null;
        }
      })
  );
  return records.filter(Boolean);
}

function byNewestFirst(a, b) {
  const at = new Date(a.finishedAt || a.startedAt).getTime();
  const bt = new Date(b.finishedAt || b.startedAt).getTime();
  return bt - at;
}

// ------------------------------------------------------------ search text
// One lowercase haystack per record, DERIVED at read time from the metadata
// the record already carries (the stored format is unchanged): title +
// question, plus structured metadata — mode, Scholar personas, providers,
// models, display language, status. Vocabulary is widened with the known
// vendor names ("google" → Gemini) and every locale's names for the modes
// and character slots, so "mentor", "導師", "analyst", or "gemini" all match
// regardless of which interface language the session ran under.

// "google" -> ["google", "Google / Gemini", "Gemini"]
function providerTerms(providerId) {
  if (!providerId) return [];
  const def = PROVIDER_DEFS.find((d) => d.id === providerId);
  return def ? [def.id, def.label, def.short] : [providerId];
}

// "single" -> ["single", "Mentor", "導師"], "council" -> ["council", "Council", "智囊團"]
function modeTerms(mode) {
  const key = mode === "single" ? "modeMentor" : "modeCouncil";
  const names = Object.values(UI_STRINGS).map((strings) => strings[key]);
  return [mode, ...names].filter(Boolean);
}

// Every locale's name for a fixed Scholar slot (3 -> ["Analyst", "理者"]).
function scholarSlotNames(slot) {
  return Object.values(IDENTITY_PACKS)
    .map((pack) => pack.scholars?.[slot])
    .filter(Boolean);
}

function searchTextFor(record) {
  const terms = [
    record.title,
    record.question,
    ...modeTerms(record.mode),
    record.identity?.language,
    record.status,
  ];
  for (const s of Object.values(record.scholars || {})) {
    terms.push(s.persona, s.model, ...providerTerms(s.provider), ...scholarSlotNames(s.slot));
  }
  // The Judge counts only when one actually ruled (council sessions).
  if (record.judge) {
    terms.push(record.judge.model, ...providerTerms(record.judge.provider));
    terms.push(
      record.identity?.judge,
      ...Object.values(IDENTITY_PACKS).map((pack) => pack.judge)
    );
  }
  return terms.filter(Boolean).join("\n").toLowerCase();
}

// Participating AI providers: the Scholars' (in slot order), then the
// Judge's, deduplicated. Provider ids only — the UI maps them to product
// names (GPT, Claude, Gemini, …) for the Archive cards.
function participatingProviders(record) {
  const ids = Object.values(record.scholars || {})
    .sort((a, b) => (a.slot || 0) - (b.slot || 0))
    .map((s) => s.provider);
  if (record.judge?.provider) ids.push(record.judge.provider);
  return [...new Set(ids.filter(Boolean))];
}

// Historical archives from before this app settled on "council" as both the
// internal AND product-facing mode name (see the terminology note on
// MODE_PRODUCT_NAMES in localVaultAdapter.js) may still say "debate" — the
// old product name for this same multi-Scholar + Grand Sage mode. Applied
// at READ time only, to the `mode` field alone: the file on disk is never
// rewritten, and a record's own free-text content (title/question/answers)
// is left untouched even if it happens to mention "debate" in prose. New
// archives are always written with mode: "council" already (see toRecord).
function normalizeMode(mode) {
  return mode === "debate" ? "council" : mode;
}

// Archive Discussion Threads: a record saved before this feature existed has
// no threadId/parentSessionId on disk. Applied at READ time only, exactly
// like normalizeMode() above — the file is never rewritten. A record with no
// threadId behaves as a single-item thread rooted at itself, with no parent,
// which is the correct behavior for every pre-existing Archive: it groups
// alone until something is ever continued from it.
function normalizeThread(record) {
  return {
    threadId: record.threadId || record.id,
    parentSessionId: record.parentSessionId || null,
  };
}

// Lightweight projection for list rendering — omits the (potentially long)
// answer text, which the detail view fetches separately via getArchive().
// `searchText` and `providers` are derived here for the list UI; they are
// never written back to disk.
function toSummary(record) {
  return {
    id: record.id,
    title: record.title,
    question: record.question,
    mode: normalizeMode(record.mode),
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    scholarCount: Object.keys(record.scholars || {}).length,
    judgeName: record.identity?.judge || null,
    judgeProvider: record.judge?.provider || null,
    judgeModel: record.judge?.model || null,
    vaultState: record.vault?.state || "unsaved",
    providers: participatingProviders(record),
    searchText: searchTextFor(record),
    ...normalizeThread(record),
  };
}

// Lists archive summaries, newest first. `query` matches case-insensitively
// against the title, the original question, and the structured metadata
// (mode, Scholars, providers, models, display language) — search stays
// local, no AI call.
export async function listArchives(query) {
  const summaries = (await readAllRecords()).sort(byNewestFirst).map(toSummary);
  const q = String(query || "").trim().toLowerCase();
  return q ? summaries.filter((s) => s.searchText.includes(q)) : summaries;
}

// Groups archive summaries into discussion threads (Continue Discussion
// lineage — threadId/parentSessionId, see toRecord()/normalizeThread()
// above). One row per thread instead of one row per Session: a thread with
// only one Session behaves exactly like a plain archive summary always has;
// a thread with several groups them together under the root's own title.
//
// Search matches per-Session (the same haystack listArchives() uses), but a
// match on any child keeps its whole thread in the results — the caller
// should never have to guess a root's title just to find a buried reply
// (section 11 of the Archive Discussion Threads spec). Grouping itself is
// never affected by `query`; only which threads survive the filter is.
export async function listArchiveThreads(query) {
  const summaries = (await readAllRecords()).map(toSummary);
  const q = String(query || "").trim().toLowerCase();

  const groups = new Map();
  for (const s of summaries) {
    const list = groups.get(s.threadId);
    if (list) list.push(s);
    else groups.set(s.threadId, [s]);
  }

  const threads = [];
  for (const [threadId, sessions] of groups) {
    if (q && !sessions.some((s) => s.searchText.includes(q))) continue;

    // Oldest -> newest communicates how the discussion evolved (section 9).
    // finishedAt (when each Session actually concluded) takes priority over
    // startedAt, the same way byNewestFirst() above already orders the flat
    // list — an in-progress or never-finished Session falls back to when it
    // started.
    sessions.sort((a, b) => new Date(a.finishedAt || a.startedAt) - new Date(b.finishedAt || b.startedAt));

    // Root = the Session with no parent. If it was deleted, the oldest
    // surviving Session stands in (section 12) — deterministic, and grouping
    // itself still relies only on threadId, never on a currently-existing
    // root record.
    const root = sessions.find((s) => !s.parentSessionId) || sessions[0];
    const latest = sessions[sessions.length - 1];
    const updatedAt = sessions.reduce((max, s) => {
      const t = new Date(s.finishedAt || s.startedAt).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, -Infinity);

    threads.push({
      threadId,
      title: root.title,
      count: sessions.length,
      updatedAt: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : null,
      latest,
      sessions,
    });
  }

  // Threads move to the top of the Archive list based on latest activity
  // among ALL their Sessions (section 9) — a thread continued minutes ago
  // outranks one that has sat untouched for months, even if it was created
  // first.
  threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return threads;
}

// Full archive record (includes Scholar answers + Judge synthesis), or null
// if no archive with that id exists.
export async function getArchive(id) {
  try {
    const record = JSON.parse(await fs.readFile(filePathFor(id), "utf8"));
    return { ...record, mode: normalizeMode(record.mode), ...normalizeThread(record) };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// "Continue Discussion" (Archives detail action): the archive's own saved
// Markdown, reused as-is — never a second rendering path. Uses the SAME
// renderSessionNote() the Obsidian archive-sync fallback already renders
// from (see exportArchiveToObsidian), but always from the archive record
// itself — never from a possibly-hand-edited on-disk Vault file the way
// that export path prefers, since this is meant to be a pure, deterministic
// function of the archive alone. Read-only: never touches the archive file,
// the Vault, or the active Session. Returns null for an unknown id.
//
// `threadId` is this archive's EFFECTIVE thread id (already normalized by
// getArchive() — defaults to its own id for a legacy or standalone record)
// — the frontend carries it back on the run request that saves the new
// Session, so continuationLineageFrom() can put the new Session in the same
// thread. This travels as its own field, never recovered by re-parsing the
// Markdown text.
export async function archiveContinuationText(id) {
  const record = await getArchive(id);
  if (!record) return null;
  const { content } = renderSessionNote(record);
  return { id: record.id, title: record.title, question: record.question, markdown: content, threadId: record.threadId };
}

// Records where an archive's Obsidian sync landed (see exportArchiveToObsidian
// in services/obsidianExport.js). Persisted on the record so a later re-sync
// updates the same note instead of minting a new one, and so the UI can show
// the synced state. Returns the updated record, or null if no such archive.
export async function setArchiveObsidianExport(id, exportRecord) {
  const record = await getArchive(id);
  if (!record) return null;
  record.obsidianExport = exportRecord;
  await fs.writeFile(filePathFor(id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

// Deletes only the archive record. The Session's Vault Markdown file (if it
// was also saved there) lives at a different path under the Vault and is
// never touched by this call — and neither is any Obsidian copy the archive
// was synced to. Returns false if the archive didn't exist.
export async function deleteArchive(id) {
  try {
    await fs.unlink(filePathFor(id));
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}
