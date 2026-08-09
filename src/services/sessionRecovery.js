// Session recovery — the pure decision logic for "the server no longer has
// the Session this page is showing".
//
// WHY THIS EXISTS
//
// The active Session lives ONLY in the server process's memory (see the
// `current` module variable in services/sessionEngine.js — assigned in exactly
// three places: initialised to null, set by startSession(), cleared by
// resetSession()). There is no TTL and no timer: Save to Vault does not clear
// it, and neither does idling. So the one and only way it disappears while a
// browser tab still shows the discussion is a SERVER PROCESS RESTART — a
// `node --watch` reload after a file edit, a crash, a machine sleep/wake, or a
// manual restart.
//
// Nothing pushed that fact to the page, so public/app.js's chatReady() kept
// answering "yes" from its local mirror and left the follow-up composer
// enabled. The next Send then failed with the engine's 409:
//
//     "No active session — start one by asking a question first."
//
// RESTORATION IS DELIBERATELY UNSUPPORTED. Rebuilding the live Session after a
// restart would mean persisting it outside the Vault Adapter — a second,
// parallel session store, which the engine's own contract rules out ("never
// touches disk directly, only the active Vault Adapter"). Re-animating an
// Archive as an ACTIVE Session would be worse: an Archive is a finished
// record, and follow-ups would then mutate a saved artifact whose startedAt /
// outcome describe a run that no longer exists in this process.
//
// So the recovery is the flow the product already has. A Session that was
// Saved to Vault was also archived under the SAME id (POST /api/session/save
// calls archiveSession(session), which upserts by session id), so the
// discussion is not lost — it is an Archive, and Archives already have a
// first-class "Continue Discussion" flow that reopens one as `kind: "archive"`
// material on a NEW run. That is what a lost Session converts into.
//
// This module is deliberately free of DOM, timer and fetch access so it is
// testable in Node; public/app.js mirrors it inline (it is a classic script
// and cannot import), with source-assertion tests keeping the two in step.

// The three states a displayed discussion can be in, once the server has been
// asked. Exported as data so tests can assert the SET, not just one path.
export const RECOVERY_STATES = ["live", "lost_continuable", "lost_unrecoverable"];

// What the UI may offer in each state.
export const RECOVERY_ACTIONS = { CONTINUE: "continue", RESET: "reset" };

/**
 * Decide what a page showing a discussion should do, given what the server
 * just said about the active Session.
 *
 * @param {object}  input
 * @param {boolean} input.hasLocalSession  this page is displaying a discussion
 * @param {boolean} input.serverActive     GET /api/session -> active
 * @param {?string} input.serverSessionId  the server's active Session id, if any
 * @param {?string} input.localSessionId   the id this page is displaying
 * @param {boolean} input.archiveExists    an Archive exists under localSessionId
 * @returns {{state: string, composerEnabled: boolean, action: ?string, keepDiscussionVisible: boolean}}
 */
export function decideRecovery({
  hasLocalSession = false,
  serverActive = false,
  serverSessionId = null,
  localSessionId = null,
  archiveExists = false,
} = {}) {
  // Nothing displayed: there is no recovery question to answer. The page is
  // simply pre-session, and the composer's enabled state is owned by the run
  // flow, not by this module.
  if (!hasLocalSession) {
    return { state: "live", composerEnabled: false, action: null, keepDiscussionVisible: false };
  }

  // The server has an active Session AND it is the one on screen. Note the id
  // comparison: a server that restarted and then ran a DIFFERENT session is
  // still "lost" from this page's point of view, even though `active` is true
  // — sending a follow-up would otherwise append to a stranger's discussion.
  const sameSession = serverActive && (!localSessionId || !serverSessionId || serverSessionId === localSessionId);
  if (sameSession) {
    return { state: "live", composerEnabled: true, action: null, keepDiscussionVisible: true };
  }

  // Lost. The discussion STAYS on screen either way — it is the user's
  // content and destroying it would lose the only remaining copy of an
  // unsaved run — but the composer closes, because there is nothing on the
  // server for a follow-up to continue.
  if (archiveExists) {
    return {
      state: "lost_continuable",
      composerEnabled: false,
      action: RECOVERY_ACTIONS.CONTINUE,
      keepDiscussionVisible: true,
    };
  }
  return {
    state: "lost_unrecoverable",
    composerEnabled: false,
    action: RECOVERY_ACTIONS.RESET,
    keepDiscussionVisible: true,
  };
}

/**
 * The follow-up composer's enabled state, in ONE place.
 *
 * This is the invariant the bug violated: a composer may only be enabled when
 * the displayed Session is ready AND the server still has it AND no reply is
 * already in flight. `sessionLost` is latched by the recovery flow above and
 * is the term that was missing entirely.
 */
export function composerEnabled({ sessionReady = false, sessionLost = false, chatBusy = false } = {}) {
  return Boolean(sessionReady) && !sessionLost && !chatBusy;
}

/**
 * Whether a failed request proves the Session is gone.
 *
 * The engine answers 409 for this and phrases it one way (see sessionChat.js
 * and council.js). A 409 alone is NOT enough — the run-safety gate also
 * answers 409, with code "run_in_progress", and that means the opposite (a
 * Session is very much alive). Both terms are required.
 */
export function isSessionLostError({ status = 0, code = null, message = "" } = {}) {
  if (code === "run_in_progress") return false;
  if (status !== 409) return false;
  return /no active session/i.test(String(message || ""));
}

/**
 * The per-tab pointer to the last displayed Session, used to offer
 * continuation AFTER a reload (when the in-memory discussion is gone from the
 * page too). Deliberately just an id plus whether it reached the Vault — it is
 * a POINTER, never a copy of the Session, so it cannot become a second source
 * of truth for session content.
 */
export function sessionPointer(session) {
  if (!session?.id) return null;
  return { id: session.id, saved: session?.vault?.state === "saved" };
}

/**
 * After a reload with no active Session on the server: may this pointer be
 * offered as a continuation? Only a Session that reached the Vault has an
 * Archive to continue from — an unsaved one left no trace, and offering it
 * would produce a 404 the user cannot act on.
 */
export function pointerIsContinuable(pointer) {
  return Boolean(pointer?.id && pointer.saved);
}
