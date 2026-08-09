// Speech Bridge — pure Conversation-lifecycle -> Role mapping (Part 20/25 of
// the Conversation<->Speech Bubble synchronization task). This is the ONLY
// piece of the bridge that can be isolated from the browser runtime: the
// actual trigger call (triggerRoleSpeech), the DOM (tabAnswers,
// showCharacterBubble/hideCharacterBubble), and triggerCharacterSpeechState
// itself all live only in public/app.js (classic script, no module system —
// same mirrored-duplication convention as every other browser-only piece of
// this feature; see the character-speech-bubble-mapping memory). This module
// is mirrored BY HAND into app.js's own SPEECH_SCHOLAR_ROLE_BY_SLOT /
// scholarRoleIdForKey / participatingScholarRoleIds, kept behaviorally
// identical — this file is the one with real test coverage.
//
// The Conversation pipeline identifies Scholars by fixed SLOT NUMBER
// (scholar1/2/3 — a provider/model assignment, config.scholarSlots), which
// has NO existing connection to the Character Role Roster's Role ids
// (alpha/beta/gamma, scene-layout.json's characterRoles) — two independent
// systems. This table is the ONE place that connection is declared.

export const SPEECH_SCHOLAR_ROLE_BY_SLOT = { 1: "alpha", 2: "beta", 3: "gamma" };
export const SPEECH_SAGE_ROLE_ID = "sage";

// Slot number (1/2/3, number or numeric string) -> Role id, or null for an
// unrecognized slot — never throws, never guesses.
export function scholarRoleIdForSlot(slot) {
  return SPEECH_SCHOLAR_ROLE_BY_SLOT[Number(slot)] || null;
}

// A Conversation-pipeline scholar key ("scholar1", "scholar2", …) -> Role
// id, or null. This is the SAME table scholarRoleIdForSlot uses — one
// authoritative mapping, not duplicated with different values.
export function scholarRoleIdForKey(key) {
  return scholarRoleIdForSlot(String(key ?? "").replace("scholar", ""));
}

// Every Scholar Role participating given the run's slot list (e.g. [1,3] for
// a 2-Scholar Council run) — deduplicated in the sense that an unrecognized
// slot number is simply dropped, never producing a bogus Role id.
export function participatingScholarRoleIds(slots) {
  return (Array.isArray(slots) ? slots : []).map((s) => scholarRoleIdForSlot(s)).filter(Boolean);
}

// The Grand Sage only participates in Council mode — Single mode has no
// Judge/Grand Sage synthesis step at all (see council.js's runSessionEvents:
// the judge() call is gated on mode === "council"). A waiting/thinking Sage
// reaction in Single mode would misrepresent a Role that isn't actually
// part of that exchange.
export function sageParticipates(mode) {
  return mode === "council";
}

// vault_gathering only fires when Use Vault is genuinely on — showing a
// "checking my notes" reaction when no search will ever run would be
// dishonest decoration (the pipeline has no distinct retrieval-start
// lifecycle point separate from submission — see Part 1's trace).
export function shouldTriggerVaultGathering(useVault) {
  return useVault === true;
}

// ============================================================
// Idle Controller — PRE THINKING / POST THINKING lifecycle timing
// ============================================================
// The ONE canonical declaration of every idle-lifecycle timing constant —
// mirrored (same VALUES, hand-copied — public/app.js is a classic script,
// no module system) into public/app.js's own Idle Controller section, never
// re-derived or hardcoded a second time inside app.js itself. The actual
// controller (activity listeners, the tick loop, hover DOM wiring,
// showCharacterBubble/hideCharacterBubble calls) is browser-only and lives
// entirely in app.js — this file holds only the PURE eligibility/rate-limit
// math, so it can be unit-tested without a DOM.

// "After 30 seconds of no user interaction, the character becomes eligible
// for PRE THINKING idle dialogue... this must work immediately after
// entering the library" — no prior question required.
export const PRE_IDLE_INITIAL_DELAY_MS = 30_000;
// "At least 60 seconds must pass between two automatic PRE dialogues."
export const PRE_DIALOGUE_MIN_GAP_MS = 60_000;
// "Maximum 3 automatically triggered PRE dialogues within any 5-minute window."
export const PRE_DIALOGUE_WINDOW_MS = 5 * 60_000;
export const PRE_DIALOGUE_MAX_PER_WINDOW = 3;
// "After a session fully finishes, enter POST THINKING/POST IDLE... maximum
// 3 minutes... after 3 minutes, automatically transition back to PRE THINKING."
export const POST_IDLE_DURATION_MS = 3 * 60_000;

// True once `now - lastActivityAt` has reached the initial delay — the
// FIRST gate an automatic PRE dialogue attempt must clear, independent of
// whether a question was ever asked (Part 1).
export function isPastInitialIdleDelay(lastActivityAt, now) {
  return now - lastActivityAt >= PRE_IDLE_INITIAL_DELAY_MS;
}

// Drops timestamps that have aged out of the rolling rate-limit window —
// call this before checking isWithinRateLimit so the window never grows
// unbounded across a long-running session.
export function pruneToWindow(timestamps, now, windowMs = PRE_DIALOGUE_WINDOW_MS) {
  return (Array.isArray(timestamps) ? timestamps : []).filter((t) => now - t < windowMs);
}

// True when firing ANOTHER automatic PRE dialogue right now would stay
// within "maximum 3 within any 5-minute window" — pass ALREADY-PRUNED
// timestamps (pruneToWindow).
export function isWithinRateLimit(prunedTimestamps, maxPerWindow = PRE_DIALOGUE_MAX_PER_WINDOW) {
  return (Array.isArray(prunedTimestamps) ? prunedTimestamps.length : 0) < maxPerWindow;
}

// True once the minimum gap since the last automatic PRE dialogue has
// passed — `lastAt` of 0/falsy (never fired yet) always passes, since there
// is no prior dialogue to be too close to.
export function hasMinGapPassed(lastAt, now, minGapMs = PRE_DIALOGUE_MIN_GAP_MS) {
  return !lastAt || now - lastAt >= minGapMs;
}

// The single combined eligibility check an idle tick runs BEFORE even
// rolling the random-chance die — every rule from Part 2 except the
// probabilistic one itself (that stays a bare Math.random() call at the
// point of use, so it's never accidentally "seeded" or made deterministic).
export function isPreDialogueEligible({ lastActivityAt, now, preDialogueTimestamps, lastPreDialogueAt }) {
  if (!isPastInitialIdleDelay(lastActivityAt, now)) return false;
  const pruned = pruneToWindow(preDialogueTimestamps, now);
  if (!isWithinRateLimit(pruned)) return false;
  if (!hasMinGapPassed(lastPreDialogueAt, now)) return false;
  return true;
}

// One Role at random from `roleIds`, excluding `excludeRoleId` (the
// currently-hovered Role, if any — Part 6/8: "if several characters are
// eligible, select at most one" + hover takes priority over an automatic
// trigger landing on the same Character). Returns null when nothing remains.
export function pickIdleRoleId(roleIds, excludeRoleId, randomFn = Math.random) {
  const candidates = (Array.isArray(roleIds) ? roleIds : []).filter((id) => id !== excludeRoleId);
  if (!candidates.length) return null;
  return candidates[Math.floor(randomFn() * candidates.length)];
}

// ============================================================
// Conversation Bridge state-flow fixes (staggering, generation/token
// ownership, merged research-window pools, POST initial delay, hover cache)
// ============================================================
// Pure math/decision helpers only — the actual setTimeout scheduling, DOM
// bubble calls, and fetch-based Markdown resolution live only in
// public/app.js (same mirrored-duplication convention as the rest of this
// file's Idle Controller section above).

// A per-character randomized initial reaction delay (Part 3): "several
// characters immediately show dialogue at essentially the same time...
// looks mechanical." 1-3s per character by default.
export const STAGGER_MIN_MS = 1000;
export const STAGGER_MAX_MS = 3000;
// "A reasonable minimum separation is approximately 0.8-1.5 seconds when
// multiple character reactions are produced from the same state
// transition" — enforced as a floor between consecutive sorted delays, not
// a fixed grid, so timing still reads as organic rather than lockstep.
export const STAGGER_MIN_SEPARATION_MS = 900;

// Scholars are secondary/lower-probability speakers during grand_sage_
// gathering and grand_sage_answering (Part 6/7) — the Grand Sage is always
// triggered separately (primary, its own short delay), these only gate
// whether a given Scholar ALSO reacts, and how long after.
export const GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY = 0.35;
export const GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MIN_MS = 1500;
export const GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MAX_MS = 4000;
export const GRAND_SAGE_ANSWERING_SAGE_DELAY_MIN_MS = 300;
export const GRAND_SAGE_ANSWERING_SAGE_DELAY_MAX_MS = 800;
export const GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY = 0.35;
export const GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MIN_MS = 2000;
export const GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MAX_MS = 5000;

// "A reasonable starting timing range would be roughly 8-20 seconds before
// a possible post-answer reaction" (Part 8) — the FIRST eligible moment
// after entering POST, not a fixed cadence for every reaction after that
// (the existing per-tick probability roll already randomizes the rest).
export const POST_IDLE_INITIAL_DELAY_MIN_MS = 8_000;
export const POST_IDLE_INITIAL_DELAY_MAX_MS = 20_000;

// "Assign that cached line a randomized lifetime of 30-60 seconds" (Part 9).
export const HOVER_THOUGHT_MIN_LIFETIME_MS = 30_000;
export const HOVER_THOUGHT_MAX_LIFETIME_MS = 60_000;

export function randomBetween(min, max, randomFn = Math.random) {
  return min + randomFn() * (max - min);
}

// One independently-randomized delay per role (Part 3), nudged so no two
// land within `minSeparationMs` of each other. Returns a delay array of the
// SAME length as `count`, sorted ascending — callers zip it against
// whatever role list they're dispatching; role IDENTITY never affects which
// delay it draws (every eligible character is interchangeable for this
// purpose), only the resulting SET of delays matters.
export function staggeredDelays(count, opts = {}, randomFn = Math.random) {
  const { minMs = STAGGER_MIN_MS, maxMs = STAGGER_MAX_MS, minSeparationMs = STAGGER_MIN_SEPARATION_MS } = opts;
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const delays = Array.from({ length: n }, () => randomBetween(minMs, maxMs, randomFn)).sort((a, b) => a - b);
  for (let i = 1; i < delays.length; i++) {
    if (delays[i] - delays[i - 1] < minSeparationMs) delays[i] = delays[i - 1] + minSeparationMs;
  }
  return delays;
}

// Independent per-role coin flip (Part 6/7: Scholars are eligible at LOWER
// probability, not guaranteed) — an unlucky role simply doesn't react at
// all this time, rather than being staggered-but-silenced downstream.
// probability >= 1 always keeps every role (the default group-reaction
// case, e.g. Part 3's pre_thinking/scholar_thinking dispatch).
export function filterEligibleByProbability(roleIds, probability, randomFn = Math.random) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  if (probability >= 1) return ids;
  return ids.filter(() => randomFn() < probability);
}

// The ownership check a stale scheduled speech callback (Part 10/11) must
// pass before it's allowed to touch a bubble: the session-level generation
// captured when it was scheduled must still be current (no Reset/new
// question submitted since), AND the per-role dispatch token captured at
// that same moment must still be current (no NEWER trigger for the SAME
// role has since superseded it — e.g. an individual Scholar completing
// faster than its own staggered "still thinking" reaction was due to fire).
export function isStaleSpeechDispatch({ generation, currentGeneration, token, currentToken }) {
  return generation !== currentGeneration || token !== currentToken;
}

// A cached hover thought/dialogue line stays valid — and must be reused
// verbatim, never rerolled — for its whole randomized lifetime regardless
// of how many times the Bubble was hidden/reshown in between (Part 9:
// "hiding the thought bubble must not invalidate the cached text").
export function isHoverCacheValid(cacheEntry, now) {
  return Boolean(cacheEntry) && now < cacheEntry.expiresAt;
}

export function computeHoverCacheExpiry(now, randomFn = Math.random) {
  return now + randomBetween(HOVER_THOUGHT_MIN_LIFETIME_MS, HOVER_THOUGHT_MAX_LIFETIME_MS, randomFn);
}

export function computePostFirstEligibleAt(now, randomFn = Math.random) {
  return now + randomBetween(POST_IDLE_INITIAL_DELAY_MIN_MS, POST_IDLE_INITIAL_DELAY_MAX_MS, randomFn);
}

// Interface Language hot-switch — the ONE detection point for "the runtime
// must reload language-dependent dialogue data now." Deliberately keyed on
// interfaceLanguage alone (never defaultReplyLanguage, which currentSpeechLocale()
// never reads and must go on affecting only the Grand Sage's ruling
// language, per the task that added this). `previous` falsy (the very
// first config load) never counts as a change — there is nothing stale to
// invalidate yet.
export function hasInterfaceLanguageChanged(previous, next) {
  return Boolean(previous) && Boolean(next) && previous !== next;
}
