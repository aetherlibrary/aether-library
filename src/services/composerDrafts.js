// Batch C — Draft Autosave.
//
// The composer's unsent text is the one thing in this application that has
// no other home: a Session lives on the server, materials are re-attachable,
// but a half-written question exists nowhere except the textarea. A refresh,
// an accidental tab close, or a stray navigation destroys it outright.
//
// This module owns ALL of that persistence: the storage keys, the emptiness
// rule, the per-session scoping, and the bounded pruning. public/app.js is a
// plain global script that cannot import, so it mirrors these helpers inline
// (same convention as animationPlayback.js / appSplitLayout.js / appLinks.js)
// — this file is the source of truth those mirrors are tested against.
//
// Every function takes the storage object explicitly instead of reaching for
// a global `localStorage`. That is what makes the real behaviour (including
// a storage that throws on every call) testable in Node with no DOM, and it
// is also what guarantees the rule below can never be quietly bypassed:
//
//   NOTHING here is ever persisted except the unsent text of the two
//   composers. No API keys, no provider state, no answers, no attachments,
//   no Vault content, no session content, and no network access of any kind.

// Two keys, and only two. The main composer's draft is a bare string — there
// is exactly one of it, so JSON would buy nothing. Follow-up drafts are
// session-scoped, and live together in ONE key as a map rather than one key
// per session: a per-session key scheme grows without bound as Sessions come
// and go, with no moment at which the orphans could be swept.
export const DRAFT_KEYS = {
  main: "aether.draft.main",
  followUps: "aether.draft.followups",
};

// How many Sessions' follow-up drafts are retained. Only the most recently
// touched survive a write; the rest are dropped. Keeps the single key
// bounded without a separate cleanup pass, exactly like saveFailureMemory()
// prunes its own expired records on write.
export const FOLLOW_UP_DRAFT_LIMIT = 20;

// A draft is "empty" when it holds no non-whitespace character. Such a draft
// is never stored — an untouched or cleared composer must not leave a
// meaningless entry behind. Note this decides only *whether* to store; the
// text itself is always stored verbatim, so the user's own leading blank
// lines and trailing spaces come back exactly as typed.
export function isBlankDraft(text) {
  return typeof text !== "string" || text.trim() === "";
}

// ---------------------------------------------------------------- storage
// Every read and write is wrapped. A storage that is absent, disabled
// (private browsing), full, or throwing must degrade to "no drafts are
// remembered" — never to a broken composer. Reads answer "" and writes
// answer false; no caller is ever expected to handle an exception.

function safeGet(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------- main composer

// Blank-checked on read for the same reason as readFollowUpDraft below: a
// blank entry can only arrive by hand-editing, and must never be restored
// into an otherwise empty composer as invisible whitespace.
export function readMainDraft(storage) {
  const text = safeGet(storage, DRAFT_KEYS.main);
  return isBlankDraft(text) ? "" : text;
}

// Writing a blank draft REMOVES the entry rather than storing "" — that is
// the "an empty composer should not leave a meaningless stored draft" rule,
// and it means clearMainDraft() is just this function with no text.
export function writeMainDraft(storage, text) {
  if (isBlankDraft(text)) return safeRemove(storage, DRAFT_KEYS.main);
  return safeSet(storage, DRAFT_KEYS.main, text);
}

export function clearMainDraft(storage) {
  return safeRemove(storage, DRAFT_KEYS.main);
}

// ------------------------------------------------------ follow-up composer
// Scoped to the Session the draft was written in. The identity used is the
// server-installed Session id — the frontend's only stable Session identity,
// and the same one chatReady() already gates the follow-up composer on, so a
// follow-up can never be typed without it. No parallel identity is invented.

function readFollowUpMap(storage) {
  const raw = safeGet(storage, DRAFT_KEYS.followUps);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // corrupt entry — fail open, exactly like loadFailureMemory()
  }
}

// Prunes to the most recently touched FOLLOW_UP_DRAFT_LIMIT entries, and
// drops anything that isn't a well-formed non-blank draft (a hand-edited or
// truncated value can never resurrect as a phantom draft).
function writeFollowUpMap(storage, map) {
  const entries = Object.entries(map)
    .filter(([id, entry]) => id && entry && typeof entry.text === "string" && !isBlankDraft(entry.text))
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, FOLLOW_UP_DRAFT_LIMIT);
  if (entries.length === 0) return safeRemove(storage, DRAFT_KEYS.followUps);
  return safeSet(storage, DRAFT_KEYS.followUps, JSON.stringify(Object.fromEntries(entries)));
}

// A usable Session identity, or null. Anything that isn't a non-empty string
// means "this state has no stable identity" — the caller then keeps the
// draft in memory only, rather than filing it under a key that could collide
// with, or leak into, a different Session.
export function followUpDraftId(sessionId) {
  return typeof sessionId === "string" && sessionId.trim() ? sessionId : null;
}

// The blank check is applied on READ as well as on write. The write path
// already refuses to store a blank draft, but a hand-edited or truncated
// entry could still hold one — and the composer's restore only asks "is
// there text?", so a stored "   " would silently push whitespace into an
// otherwise empty composer.
export function readFollowUpDraft(storage, sessionId) {
  const id = followUpDraftId(sessionId);
  if (!id) return "";
  const entry = readFollowUpMap(storage)[id];
  if (!entry || isBlankDraft(entry.text)) return "";
  return entry.text;
}

export function writeFollowUpDraft(storage, sessionId, text, now = Date.now()) {
  const id = followUpDraftId(sessionId);
  if (!id) return false; // no stable identity — nothing is persisted at all
  const map = readFollowUpMap(storage);
  if (isBlankDraft(text)) delete map[id];
  else map[id] = { text, at: now };
  return writeFollowUpMap(storage, map);
}

export function clearFollowUpDraft(storage, sessionId) {
  const id = followUpDraftId(sessionId);
  if (!id) return false;
  const map = readFollowUpMap(storage);
  if (!(id in map)) return true;
  delete map[id];
  return writeFollowUpMap(storage, map);
}

// Clears a Session's follow-up draft ONLY if it still holds the exact text
// that was accepted. Two things depend on this:
//
//   * A Quick Question chip sends without touching the composer. If the user
//     had a half-written follow-up sitting there, that draft is not theirs
//     to discard — the texts differ, so it survives.
//   * If anything reaches the composer between send and confirmation, the
//     newer text wins rather than being silently dropped.
//
// Comparison is on trimmed text because the accepted message is the trimmed
// form of what the composer held.
export function clearFollowUpDraftIfUnchanged(storage, sessionId, sentText) {
  const id = followUpDraftId(sessionId);
  if (!id) return false;
  const stored = readFollowUpDraft(storage, id);
  if (stored.trim() !== String(sentText ?? "").trim()) return false;
  return clearFollowUpDraft(storage, id);
}
