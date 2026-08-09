// Recommended-model selection — a computed property, never a hardcoded
// model id or "whatever is currently configured." Shared between the
// browser (classifyModelBadges() in app.js, loaded here via a plain global —
// see the bottom of this file) and the Node test suite (test/
// model-recommendation.test.js imports these exports directly), so the exact
// same logic is what's tested and what runs live. Pure functions only: no
// DOM, no fetch, no reference to modelCache/modelInfoCache/runtimeUnavailable
// — the caller assembles the `models` array from those.
//
// The general rule (see the plan this implements): among models that are (a)
// in the curated catalog, (b) currently listed, and (c) not runtime-
// unavailable, pick the newest STABLE, GENERAL-PURPOSE, BALANCED model for
// the provider — never a Pro/Mini/Nano/Haiku/reasoning-only/budget variant
// unless the provider has no better general-purpose option at all (Google's
// own naming convention has no "plain" tier — see modelTier()).

// Extracts a comparable version tuple from a model id, per the provider's
// own naming convention — never lexicographic string comparison. Returns
// null when no fixed generation could be parsed, which includes "-latest"
// floating aliases: a recommendation should point at an identifiable, PINNED
// generation, not a moving target that could silently start pointing at
// something experimental or unstable in the future.
export function parseModelVersion(providerId, modelId) {
  if (/-latest$/i.test(modelId)) return null;
  let m = null;
  if (providerId === "openai") {
    // "gpt-5.5" -> "5.5"; "gpt-4o" -> "4" (the non-digit "o" stops the
    // match, which correctly ranks it below any dotted gpt-N.M); "o3"/
    // "o4-mini"/"o1-pro" -> their leading digit.
    m = modelId.match(/^gpt-(\d+(?:\.\d+)*)/i) || modelId.match(/^o(\d+)/i);
  } else if (providerId === "anthropic") {
    // "claude-sonnet-5" -> "5"; "claude-opus-4-8" -> "4-8"; "claude-sonnet-
    // 4-5" -> "4-5" (tier word itself — sonnet/opus/haiku — is NOT part of
    // the version; see modelTier() for how the tier is scored separately).
    m = modelId.match(/^claude-(?:sonnet|opus|haiku)-(\d+(?:-\d+)*)/i);
  } else if (providerId === "google") {
    // "gemini-2.5-pro" -> "2.5"; "gemini-3.5-flash" -> "3.5".
    m = modelId.match(/^gemini-(\d+(?:\.\d+)*)/i);
  } else {
    // Generic fallback for a provider without a specific family pattern
    // (DeepSeek, Perplexity, or a future addition): the first dotted/
    // hyphenated number run anywhere in the id.
    m = modelId.match(/(\d+(?:[.\-]\d+)*)/);
  }
  if (!m) return null;
  return m[1].split(/[.\-]/).map(Number);
}

// Tuple comparison (major, minor, patch, …) — NOT string/lexicographic:
// "5.5" must beat "5.4", "5" must beat "4.9" via numeric comparison of each
// position, and a shorter tuple is padded with 0s ("gpt-5" -> [5] reads as
// [5,0] against "gpt-5.1" -> [5,1]). Returns >0 if a > b, <0 if a < b, 0 if
// equal.
export function compareVersions(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Tier 0 = plain/balanced general-purpose flagship (no fast/reasoning/
// budget tag) — always preferred when one exists (OpenAI: gpt-5.5 over
// gpt-5.5-pro/gpt-5.4-mini/o3; Anthropic: claude-sonnet-5 over claude-opus-
// 4-8/claude-haiku-4-5 — this is what makes "the latest stable Sonnet
// generation" the Anthropic default without any Anthropic-specific code, the
// catalog's own fast/reasoning/budget metadata already encodes that Sonnet
// entries are the plain tier). Tier 1 = a reasoning-leaning flagship (Pro/
// Opus-class — still a broadly-capable general model, not a narrow
// specialist) — the fallback ONLY when a provider's own naming convention
// has no plain tier at all (Google: every catalog entry is tagged Flash or
// Pro; there is no bare "gemini"). Tier 2 = fast, non-budget (Flash/Mini).
// Tier 3 = budget (Nano/Lite/Haiku, or fast+budget together). Lower tier
// number always wins over a higher one, regardless of version.
export function modelTier(meta) {
  if (meta.budget) return 3;
  if (meta.fast) return 2;
  if (meta.reasoning) return 1;
  return 0;
}

/**
 * Computes the recommended model for a provider — a pure function of the
 * candidate list, never the currently-selected/currently-configured model.
 *
 * @param {string} providerId
 * @param {Array<{id: string, fast?: boolean, reasoning?: boolean, budget?: boolean, experimental?: boolean, unavailable?: boolean}>} models
 *   Curated + currently-listed models for this provider, each carrying its
 *   catalog metadata and (client-side-only) runtime-unavailable flag. The
 *   caller is responsible for assembling this from modelCache/
 *   modelInfoCache/runtimeUnavailable — this function never reads global
 *   state, which is what makes it directly unit-testable.
 * @returns {string|null} the recommended model id, or null if nothing
 *   qualifies (e.g. every candidate is experimental/unavailable/unparseable).
 */
export function getRecommendedModel(providerId, models) {
  const candidates = (models || [])
    .filter((m) => m && m.id && !m.experimental && !m.unavailable)
    .map((m) => ({ ...m, tier: modelTier(m), version: parseModelVersion(providerId, m.id) }))
    .filter((m) => m.version !== null);
  if (candidates.length === 0) return null;

  const bestTier = Math.min(...candidates.map((m) => m.tier));
  const tierCandidates = candidates.filter((m) => m.tier === bestTier);
  tierCandidates.sort((a, b) => compareVersions(b.version, a.version));
  return tierCandidates[0].id;
}

// Browser bridge: app.js is a plain classic script (no bundler, no ES
// modules — see the project's own "no build step" architecture), so it
// cannot `import` this file directly. Loaded via <script type="module"> in
// index.html (before app.js), this attaches the one function app.js
// actually calls as a global. Module scripts are deferred but that's safe
// here: nothing in app.js invokes getRecommendedModel() until a user opens
// Settings, long after every script — deferred or not — has finished
// loading.
if (typeof window !== "undefined") {
  window.getRecommendedModel = getRecommendedModel;
}
