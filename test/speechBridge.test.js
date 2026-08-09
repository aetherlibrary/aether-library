// Speech Bridge — pure Conversation-lifecycle -> Role mapping
// (src/services/speechBridge.js). Pure module, no DOM/fetch — the actual
// trigger call, DOM state, and triggerCharacterSpeechState itself live only
// in public/app.js (mirrored by hand, verified live via E2E — see the
// character-speech-bubble-mapping memory for why browser-only pieces of
// this feature have no node-test harness).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPEECH_SCHOLAR_ROLE_BY_SLOT,
  SPEECH_SAGE_ROLE_ID,
  scholarRoleIdForSlot,
  scholarRoleIdForKey,
  participatingScholarRoleIds,
  sageParticipates,
  shouldTriggerVaultGathering,
  PRE_IDLE_INITIAL_DELAY_MS,
  PRE_DIALOGUE_MIN_GAP_MS,
  PRE_DIALOGUE_WINDOW_MS,
  PRE_DIALOGUE_MAX_PER_WINDOW,
  POST_IDLE_DURATION_MS,
  isPastInitialIdleDelay,
  pruneToWindow,
  isWithinRateLimit,
  hasMinGapPassed,
  isPreDialogueEligible,
  pickIdleRoleId,
  STAGGER_MIN_MS,
  STAGGER_MAX_MS,
  STAGGER_MIN_SEPARATION_MS,
  GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY,
  GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY,
  POST_IDLE_INITIAL_DELAY_MIN_MS,
  POST_IDLE_INITIAL_DELAY_MAX_MS,
  HOVER_THOUGHT_MIN_LIFETIME_MS,
  HOVER_THOUGHT_MAX_LIFETIME_MS,
  randomBetween,
  staggeredDelays,
  filterEligibleByProbability,
  isStaleSpeechDispatch,
  isHoverCacheValid,
  computeHoverCacheExpiry,
  computePostFirstEligibleAt,
  hasInterfaceLanguageChanged,
} from "../src/services/speechBridge.js";

test("SPEECH_SCHOLAR_ROLE_BY_SLOT: the fixed slot -> Role convention (Part 4)", () => {
  assert.deepEqual(SPEECH_SCHOLAR_ROLE_BY_SLOT, { 1: "alpha", 2: "beta", 3: "gamma" });
  assert.equal(SPEECH_SAGE_ROLE_ID, "sage");
});

test("scholarRoleIdForSlot: maps 1/2/3 to alpha/beta/gamma, unrecognized slots are null", () => {
  assert.equal(scholarRoleIdForSlot(1), "alpha");
  assert.equal(scholarRoleIdForSlot(2), "beta");
  assert.equal(scholarRoleIdForSlot(3), "gamma");
  assert.equal(scholarRoleIdForSlot(4), null);
  assert.equal(scholarRoleIdForSlot("2"), "beta"); // numeric string, as slot ids arrive from JSON
});

test("scholarRoleIdForKey: a Scholar answering/thinking event maps ONLY its own target Role", () => {
  assert.equal(scholarRoleIdForKey("scholar1"), "alpha");
  assert.equal(scholarRoleIdForKey("scholar2"), "beta");
  assert.equal(scholarRoleIdForKey("scholar3"), "gamma");
  assert.notEqual(scholarRoleIdForKey("scholar2"), "alpha");
  assert.notEqual(scholarRoleIdForKey("scholar2"), "gamma");
});

test("scholarRoleIdForKey: malformed/unknown keys are a safe null, never throw", () => {
  assert.equal(scholarRoleIdForKey("scholar9"), null);
  assert.equal(scholarRoleIdForKey("nonsense"), null);
  assert.equal(scholarRoleIdForKey(""), null);
  assert.equal(scholarRoleIdForKey(undefined), null);
});

test("participatingScholarRoleIds: question submitted / completion — maps only the participating slots to Roles", () => {
  assert.deepEqual(participatingScholarRoleIds([1, 2, 3]), ["alpha", "beta", "gamma"]);
  assert.deepEqual(participatingScholarRoleIds([1]), ["alpha"]); // Single mode, one Scholar
  assert.deepEqual(participatingScholarRoleIds([2, 3]), ["beta", "gamma"]); // Council with alpha disabled
});

test("participatingScholarRoleIds: empty/absent slots is a safe empty result, never throws", () => {
  assert.deepEqual(participatingScholarRoleIds([]), []);
  assert.deepEqual(participatingScholarRoleIds(undefined), []);
});

test("sageParticipates: only Council mode — Single mode has no Grand Sage synthesis at all", () => {
  assert.equal(sageParticipates("council"), true);
  assert.equal(sageParticipates("single"), false);
  assert.equal(sageParticipates(undefined), false);
});

test("shouldTriggerVaultGathering: only when Use Vault is genuinely on", () => {
  assert.equal(shouldTriggerVaultGathering(true), true);
  assert.equal(shouldTriggerVaultGathering(false), false);
  assert.equal(shouldTriggerVaultGathering(undefined), false);
});

test("Sage is never produced by the Scholar-slot mapping (regression guard for Part 23's timeline rule)", () => {
  for (const slot of [1, 2, 3, 4, 5]) {
    assert.notEqual(scholarRoleIdForSlot(slot), SPEECH_SAGE_ROLE_ID);
  }
  assert.ok(!participatingScholarRoleIds([1, 2, 3]).includes(SPEECH_SAGE_ROLE_ID));
});

// ============================================================
// Idle Controller timing — PRE THINKING / POST THINKING lifecycle
// ============================================================

test("timing constants match the task's own numbers exactly", () => {
  assert.equal(PRE_IDLE_INITIAL_DELAY_MS, 30_000);
  assert.equal(PRE_DIALOGUE_MIN_GAP_MS, 60_000);
  assert.equal(PRE_DIALOGUE_WINDOW_MS, 5 * 60_000);
  assert.equal(PRE_DIALOGUE_MAX_PER_WINDOW, 3);
  assert.equal(POST_IDLE_DURATION_MS, 3 * 60_000);
});

test("isPastInitialIdleDelay: no PRE dialogue eligibility before 30s of inactivity, eligible at/after", () => {
  const lastActivityAt = 1_000_000;
  assert.equal(isPastInitialIdleDelay(lastActivityAt, lastActivityAt + 29_999), false);
  assert.equal(isPastInitialIdleDelay(lastActivityAt, lastActivityAt + 30_000), true);
  assert.equal(isPastInitialIdleDelay(lastActivityAt, lastActivityAt + 600_000), true);
});

test("pruneToWindow: drops timestamps older than the rolling window, keeps recent ones", () => {
  const now = 1_000_000;
  const timestamps = [now - 6 * 60_000, now - 4 * 60_000, now - 1000];
  assert.deepEqual(pruneToWindow(timestamps, now), [now - 4 * 60_000, now - 1000]);
});

test("isWithinRateLimit: at most 3 automatic PRE dialogues within any 5-minute window", () => {
  assert.equal(isWithinRateLimit([]), true);
  assert.equal(isWithinRateLimit([1, 2]), true);
  assert.equal(isWithinRateLimit([1, 2, 3]), false); // already at the max — no more this window
  assert.equal(isWithinRateLimit([1, 2, 3, 4]), false);
});

test("hasMinGapPassed: at least 60 seconds must pass between two automatic PRE dialogues", () => {
  const lastAt = 1_000_000;
  assert.equal(hasMinGapPassed(lastAt, lastAt + 59_999), false);
  assert.equal(hasMinGapPassed(lastAt, lastAt + 60_000), true);
  assert.equal(hasMinGapPassed(0, lastAt + 1), true); // never fired yet — nothing to be too close to
});

test("isPreDialogueEligible: composite check requires ALL rules to pass", () => {
  const now = 10_000_000;
  // Too soon after activity — ineligible regardless of everything else.
  assert.equal(
    isPreDialogueEligible({ lastActivityAt: now - 10_000, now, preDialogueTimestamps: [], lastPreDialogueAt: 0 }),
    false
  );
  // Past initial delay, no rate-limit/gap issues — eligible.
  assert.equal(
    isPreDialogueEligible({ lastActivityAt: now - 40_000, now, preDialogueTimestamps: [], lastPreDialogueAt: 0 }),
    true
  );
  // Rate limit already at the max within the window — ineligible.
  assert.equal(
    isPreDialogueEligible({
      lastActivityAt: now - 40_000,
      now,
      preDialogueTimestamps: [now - 60_000, now - 120_000, now - 180_000],
      lastPreDialogueAt: now - 180_000,
    }),
    false
  );
  // Min gap not yet passed since the last dialogue — ineligible even with
  // room left in the rate-limit window.
  assert.equal(
    isPreDialogueEligible({ lastActivityAt: now - 40_000, now, preDialogueTimestamps: [now - 10_000], lastPreDialogueAt: now - 10_000 }),
    false
  );
});

test("isPreDialogueEligible: the task's own long-idle scenario stays eligible far into a 10-minute window with room in the rate limit", () => {
  const now = 20 * 60_000; // 20 minutes of wall-clock time
  const result = isPreDialogueEligible({
    lastActivityAt: 0, // inactive the whole time
    now,
    preDialogueTimestamps: [now - 4 * 60_000], // one dialogue 4 minutes ago, outside the min-gap window
    lastPreDialogueAt: now - 4 * 60_000,
  });
  assert.equal(result, true);
});

test("pickIdleRoleId: excludes the currently-hovered Role — hover takes priority over an automatic trigger on the same Character", () => {
  const roleIds = ["sage", "alpha", "beta", "gamma"];
  for (let i = 0; i < 30; i++) {
    const picked = pickIdleRoleId(roleIds, "alpha");
    assert.notEqual(picked, "alpha");
    assert.ok(roleIds.includes(picked));
  }
});

test("pickIdleRoleId: at most one Role is ever returned per call — never multiple characters speaking together", () => {
  const picked = pickIdleRoleId(["sage", "alpha", "beta", "gamma"], null);
  assert.equal(typeof picked, "string");
});

test("pickIdleRoleId: null when every candidate is excluded (only one Role exists and it's the hovered one)", () => {
  assert.equal(pickIdleRoleId(["alpha"], "alpha"), null);
  assert.equal(pickIdleRoleId([], null), null);
});

test("pickIdleRoleId: deterministic with an injected random function, for exact-selection testing", () => {
  const roleIds = ["sage", "alpha", "beta", "gamma"];
  assert.equal(pickIdleRoleId(roleIds, null, () => 0), "sage");
  assert.equal(pickIdleRoleId(roleIds, null, () => 0.99), "gamma");
  // Excluding "sage" shifts the candidate list — the same randomFn(0) now
  // lands on the new first candidate, not a fixed index into the original.
  assert.equal(pickIdleRoleId(roleIds, "sage", () => 0), "alpha");
});

// ============================================================
// Conversation Bridge state-flow fixes
// ============================================================

test("randomBetween: bounded by min/max, exact at the randomFn extremes", () => {
  assert.equal(randomBetween(1000, 3000, () => 0), 1000);
  assert.equal(randomBetween(1000, 3000, () => 1), 3000);
  assert.equal(randomBetween(1000, 3000, () => 0.5), 2000);
});

test("staggeredDelays: independently randomized per role, within [min,max], sorted ascending", () => {
  let i = 0;
  const seq = [0.9, 0.1, 0.5]; // deliberately out of order — sort must fix it
  const delays = staggeredDelays(3, {}, () => seq[i++]);
  assert.equal(delays.length, 3);
  for (const d of delays) {
    assert.ok(d >= STAGGER_MIN_MS && d <= STAGGER_MAX_MS + STAGGER_MIN_SEPARATION_MS * 2);
  }
  assert.deepEqual([...delays].sort((a, b) => a - b), delays);
});

test("staggeredDelays: enforces the minimum separation between consecutive delays", () => {
  // All three randomFn calls land on the exact same value — without the
  // nudge pass every delay would collide on one frame (Part 3's bug).
  const delays = staggeredDelays(4, {}, () => 0.5);
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i] - delays[i - 1] >= STAGGER_MIN_SEPARATION_MS);
  }
});

test("staggeredDelays: zero/negative count is a safe empty array, never throws", () => {
  assert.deepEqual(staggeredDelays(0), []);
  assert.deepEqual(staggeredDelays(-1), []);
  assert.deepEqual(staggeredDelays(undefined), []);
});

test("staggeredDelays: a custom range/separation is honored", () => {
  const delays = staggeredDelays(2, { minMs: 2000, maxMs: 5000, minSeparationMs: 1000 }, () => 0);
  assert.equal(delays[0], 2000);
  assert.ok(delays[1] - delays[0] >= 1000);
});

test("filterEligibleByProbability: probability >= 1 always keeps every role (default group reaction)", () => {
  assert.deepEqual(filterEligibleByProbability(["alpha", "beta", "gamma"], 1, () => 0.999), ["alpha", "beta", "gamma"]);
});

test("filterEligibleByProbability: an unlucky role is dropped entirely, not merely delayed", () => {
  // 0.5 probability, randomFn always returns 0.6 — every role fails the roll.
  assert.deepEqual(filterEligibleByProbability(["alpha", "beta"], 0.5, () => 0.6), []);
  // randomFn always returns 0.1 — every role passes a 0.5 threshold.
  assert.deepEqual(filterEligibleByProbability(["alpha", "beta"], 0.5, () => 0.1), ["alpha", "beta"]);
});

test("filterEligibleByProbability: falsy role ids and empty input are safely dropped", () => {
  assert.deepEqual(filterEligibleByProbability([null, "alpha", undefined], 1), ["alpha"]);
  assert.deepEqual(filterEligibleByProbability([], 1), []);
  assert.deepEqual(filterEligibleByProbability(undefined, 1), []);
});

test("Scholar reaction probabilities for grand_sage_gathering/answering are genuinely 'lower frequency', not guaranteed", () => {
  assert.ok(GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY > 0 && GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY < 1);
  assert.ok(GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY > 0 && GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY < 1);
});

test("isStaleSpeechDispatch: a generation OR token mismatch makes a scheduled callback stale", () => {
  const fresh = { generation: 5, currentGeneration: 5, token: 2, currentToken: 2 };
  assert.equal(isStaleSpeechDispatch(fresh), false);
  assert.equal(isStaleSpeechDispatch({ ...fresh, currentGeneration: 6 }), true); // Reset/new question happened
  assert.equal(isStaleSpeechDispatch({ ...fresh, currentToken: 3 }), true); // a newer trigger for this Role happened
  assert.equal(isStaleSpeechDispatch({ ...fresh, currentGeneration: 6, currentToken: 3 }), true);
});

test("isHoverCacheValid: valid strictly before expiresAt, invalid at/after, and when absent", () => {
  const entry = { text: "hmm", style: "thought", expiresAt: 1000 };
  assert.equal(isHoverCacheValid(entry, 999), true);
  assert.equal(isHoverCacheValid(entry, 1000), false);
  assert.equal(isHoverCacheValid(entry, 1001), false);
  assert.equal(isHoverCacheValid(null, 500), false);
  assert.equal(isHoverCacheValid(undefined, 500), false);
});

test("computeHoverCacheExpiry: 30-60s randomized lifetime from now (Part 9)", () => {
  const now = 1_000_000;
  assert.equal(computeHoverCacheExpiry(now, () => 0), now + HOVER_THOUGHT_MIN_LIFETIME_MS);
  assert.equal(computeHoverCacheExpiry(now, () => 1), now + HOVER_THOUGHT_MAX_LIFETIME_MS);
});

test("computePostFirstEligibleAt: 8-20s randomized delay before the FIRST possible post-answer reaction (Part 8)", () => {
  const now = 1_000_000;
  assert.equal(computePostFirstEligibleAt(now, () => 0), now + POST_IDLE_INITIAL_DELAY_MIN_MS);
  assert.equal(computePostFirstEligibleAt(now, () => 1), now + POST_IDLE_INITIAL_DELAY_MAX_MS);
});

test("hasInterfaceLanguageChanged: true only when both values are known and genuinely differ", () => {
  assert.equal(hasInterfaceLanguageChanged("zh-TW", "en"), true);
  assert.equal(hasInterfaceLanguageChanged("en", "zh-TW"), true);
  assert.equal(hasInterfaceLanguageChanged("en", "en"), false);
  assert.equal(hasInterfaceLanguageChanged("zh-TW", "zh-TW"), false);
});

test("hasInterfaceLanguageChanged: the very first config load (no previous value) is never a 'change'", () => {
  assert.equal(hasInterfaceLanguageChanged(undefined, "en"), false);
  assert.equal(hasInterfaceLanguageChanged(null, "zh-TW"), false);
  assert.equal(hasInterfaceLanguageChanged("", "en"), false);
});

test("hasInterfaceLanguageChanged: a missing next value is never a change (defensive — should not happen from a real config response)", () => {
  assert.equal(hasInterfaceLanguageChanged("en", undefined), false);
  assert.equal(hasInterfaceLanguageChanged("en", null), false);
});
