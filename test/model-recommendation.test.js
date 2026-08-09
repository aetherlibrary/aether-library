// Tests for recommended-model selection (public/model-recommendation.js): a
// computed property, never a hardcoded model id or "whatever is currently
// configured." Run with `npm test` (Node's built-in test runner — no new
// dependency). These exercise the EXACT module the browser loads, not a
// reimplementation.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getRecommendedModel,
  parseModelVersion,
  compareVersions,
  modelTier,
} from "../public/model-recommendation.js";

// Shorthand for a plain (Tier 0) candidate — no fast/reasoning/budget tag.
function plain(id) {
  return { id, fast: false, reasoning: false, budget: false, experimental: false };
}
function fast(id, budget = false) {
  return { id, fast: true, reasoning: false, budget, experimental: false };
}
function reasoning(id) {
  return { id, fast: false, reasoning: true, budget: false, experimental: false };
}
function experimental(id) {
  return { id, fast: false, reasoning: false, budget: false, experimental: true };
}
function unavailable(model) {
  return { ...model, unavailable: true };
}

// ------------------------------------------------------------- parseModelVersion

test("parseModelVersion: OpenAI dotted versions", () => {
  assert.deepEqual(parseModelVersion("openai", "gpt-5.5"), [5, 5]);
  assert.deepEqual(parseModelVersion("openai", "gpt-5.4-mini"), [5, 4]);
  assert.deepEqual(parseModelVersion("openai", "gpt-5"), [5]);
  assert.deepEqual(parseModelVersion("openai", "gpt-4o"), [4]); // non-digit "o" stops the match
  assert.deepEqual(parseModelVersion("openai", "o3"), [3]);
  assert.deepEqual(parseModelVersion("openai", "o3-mini"), [3]);
});

test("parseModelVersion: Anthropic hyphenated versions (tier word excluded)", () => {
  assert.deepEqual(parseModelVersion("anthropic", "claude-sonnet-5"), [5]);
  assert.deepEqual(parseModelVersion("anthropic", "claude-sonnet-4-5"), [4, 5]);
  assert.deepEqual(parseModelVersion("anthropic", "claude-opus-4-8"), [4, 8]);
  assert.deepEqual(parseModelVersion("anthropic", "claude-haiku-4-5"), [4, 5]);
});

test("parseModelVersion: Google dotted versions", () => {
  assert.deepEqual(parseModelVersion("google", "gemini-2.5-pro"), [2, 5]);
  assert.deepEqual(parseModelVersion("google", "gemini-3.5-flash"), [3, 5]);
});

test("parseModelVersion: '-latest' floating aliases are unparseable on purpose", () => {
  assert.equal(parseModelVersion("google", "gemini-pro-latest"), null);
  assert.equal(parseModelVersion("google", "gemini-flash-latest"), null);
});

test("parseModelVersion: unparseable id returns null", () => {
  assert.equal(parseModelVersion("openai", "chat-latest"), null);
});

// -------------------------------------------------------------- compareVersions

test("compareVersions: numeric, not lexicographic (5.5 beats 5.4 beats 5.2)", () => {
  assert.ok(compareVersions([5, 5], [5, 4]) > 0);
  assert.ok(compareVersions([5, 4], [5, 2]) > 0);
  assert.ok(compareVersions([5], [4, 9]) > 0); // 5 beats 4.9 numerically
  assert.ok(compareVersions([10], [9]) > 0); // NOT a string-sort trap ("10" < "9" lexicographically)
});

test("compareVersions: shorter tuple is padded with zeros", () => {
  assert.ok(compareVersions([5], [5, 1]) < 0); // [5] reads as [5,0], loses to [5,1]
  assert.equal(compareVersions([5, 0], [5]), 0);
});

// -------------------------------------------------------------------- modelTier

test("modelTier: budget beats fast beats reasoning beats plain, in that severity order", () => {
  assert.equal(modelTier({ fast: false, reasoning: false, budget: false }), 0);
  assert.equal(modelTier({ fast: false, reasoning: true, budget: false }), 1);
  assert.equal(modelTier({ fast: true, reasoning: false, budget: false }), 2);
  assert.equal(modelTier({ fast: true, reasoning: false, budget: true }), 3);
  assert.equal(modelTier({ fast: false, reasoning: true, budget: true }), 3); // budget wins regardless of reasoning
});

// -------------------------------------------------------------- getRecommendedModel

test("Anthropic: Sonnet 5 beats Sonnet 4.5 and Sonnet 4-6", () => {
  const models = [plain("claude-sonnet-4-5"), plain("claude-sonnet-4-6"), plain("claude-sonnet-5")];
  assert.equal(getRecommendedModel("anthropic", models), "claude-sonnet-5");
});

test("Anthropic: a hypothetical Sonnet 6 beats Sonnet 5 automatically — no catalog edit needed", () => {
  const models = [plain("claude-sonnet-5"), plain("claude-sonnet-6")];
  assert.equal(getRecommendedModel("anthropic", models), "claude-sonnet-6");
});

test("Anthropic: Sonnet (plain tier) wins over Opus (reasoning tier) and Haiku (budget tier)", () => {
  const models = [reasoning("claude-opus-4-8"), plain("claude-sonnet-4-5"), fast("claude-haiku-4-5", true)];
  assert.equal(getRecommendedModel("anthropic", models), "claude-sonnet-4-5");
});

test("OpenAI: newest stable plain flagship wins over Pro/mini/nano/o-series", () => {
  const models = [
    plain("gpt-5.1"),
    plain("gpt-5.2"),
    plain("gpt-5.5"),
    reasoning("gpt-5.5-pro"),
    fast("gpt-5.4-mini", true),
    fast("gpt-5.4-nano", true),
    reasoning("o3"),
    fast("o3-mini", true),
  ];
  assert.equal(getRecommendedModel("openai", models), "gpt-5.5");
});

test("OpenAI: a hypothetical GPT 6 beats GPT 5.x automatically", () => {
  const models = [plain("gpt-5.5"), plain("gpt-6")];
  assert.equal(getRecommendedModel("openai", models), "gpt-6");
});

test("OpenAI: Mini/Nano/Pro never win merely by being present alongside a worse-version plain model", () => {
  // gpt-5.1 (plain, older) must still beat gpt-5.5-pro (reasoning, newer) —
  // tier always outranks version.
  const models = [plain("gpt-5.1"), reasoning("gpt-5.5-pro"), fast("gpt-5.4-mini", true)];
  assert.equal(getRecommendedModel("openai", models), "gpt-5.1");
});

test("Google: no plain tier exists in the naming convention, so the newest Pro (reasoning-tier) wins", () => {
  const models = [
    fast("gemini-3.5-flash"),
    fast("gemini-2.5-flash-lite", true),
    reasoning("gemini-2.5-pro"),
  ];
  assert.equal(getRecommendedModel("google", models), "gemini-2.5-pro");
});

test("Google: runtime-unavailable Pro is skipped — falls back to the newest Flash instead of staying stuck", () => {
  // The confirmed real-world case: gemini-2.5-pro's generateContent 404s
  // ("no longer available to new users") even though it's still curated and
  // still listed — countTokens alone can never prove otherwise.
  const models = [
    fast("gemini-2.0-flash"),
    fast("gemini-3.5-flash"),
    unavailable(reasoning("gemini-2.5-pro")),
  ];
  assert.equal(getRecommendedModel("google", models), "gemini-3.5-flash");
});

test("Google: '-latest' floating aliases never win even when otherwise the best tier", () => {
  const models = [reasoning("gemini-pro-latest"), fast("gemini-3.5-flash")];
  // gemini-pro-latest is tier 1 (better than flash's tier 2) but has no
  // parseable pinned version, so it's excluded entirely.
  assert.equal(getRecommendedModel("google", models), "gemini-3.5-flash");
});

test("Runtime-unavailable models are never recommended, regardless of tier or version", () => {
  const models = [unavailable(plain("gpt-5.5")), plain("gpt-5.1")];
  assert.equal(getRecommendedModel("openai", models), "gpt-5.1");
});

test("Experimental models are never recommended", () => {
  const models = [experimental("gpt-6-preview"), plain("gpt-5.5")];
  assert.equal(getRecommendedModel("openai", models), "gpt-5.5");
});

test("Recommendation is independent of the currently-selected/configured model", () => {
  // No "current model" concept is ever passed in — the function only sees
  // the candidate list. Calling it twice with the same list from a
  // different "current selection" (which doesn't exist as a parameter at
  // all) always yields the same, stable answer.
  const models = [plain("gpt-5.1"), plain("gpt-5.5")];
  assert.equal(getRecommendedModel("openai", models), "gpt-5.5");
  assert.equal(getRecommendedModel("openai", models), "gpt-5.5");
});

test("Empty or entirely-disqualified candidate lists return null, never throw", () => {
  assert.equal(getRecommendedModel("openai", []), null);
  assert.equal(getRecommendedModel("openai", [unavailable(plain("gpt-5.5")), experimental("gpt-6-preview")]), null);
});

test("The real curated OpenAI/Anthropic/Google catalogs (src/config/supported-models.js) each resolve to their documented pick", () => {
  const openai = [
    plain("gpt-5.5"), reasoning("gpt-5.5-pro"), plain("gpt-5.4"), fast("gpt-5.4-mini", true),
    fast("gpt-5.4-nano", true), reasoning("gpt-5.4-pro"), plain("gpt-5.2"), reasoning("gpt-5.2-pro"),
    plain("gpt-5.1"), plain("gpt-5"), plain("gpt-4.1"), fast("gpt-4.1-mini", true), fast("gpt-4.1-nano", true),
    plain("gpt-4o"), fast("gpt-4o-mini", true), reasoning("o3"), fast("o3-mini", true), fast("o4-mini", true),
    reasoning("o1"), reasoning("o1-pro"),
  ];
  assert.equal(getRecommendedModel("openai", openai), "gpt-5.5");

  const anthropic = [
    reasoning("claude-opus-4-8"), reasoning("claude-opus-4-7"), plain("claude-sonnet-5"),
    plain("claude-sonnet-4-6"), plain("claude-sonnet-4-5"), fast("claude-haiku-4-5", true),
  ];
  assert.equal(getRecommendedModel("anthropic", anthropic), "claude-sonnet-5");

  const google = [
    reasoning("gemini-2.5-pro"), fast("gemini-2.5-flash"), fast("gemini-2.5-flash-lite", true),
    fast("gemini-2.0-flash"), fast("gemini-2.0-flash-lite", true), reasoning("gemini-pro-latest"),
    fast("gemini-flash-latest"), fast("gemini-flash-lite-latest", true), fast("gemini-3.1-flash-lite", true),
    fast("gemini-3.5-flash"),
  ];
  assert.equal(getRecommendedModel("google", google), "gemini-2.5-pro");
});
