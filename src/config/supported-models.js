// Curated supported-model catalog — the single source of truth for which
// models Refresh Model List is willing to show, per provider.
//
// A provider's live model-list endpoint (src/providers/*.js listModels())
// answers "what does this API key have access to?" — it says nothing about
// whether a model is stable, general-purpose, or actually reliable to call
// (Gemini 2.5 Pro is a documented example: it passes every name-pattern and
// probe filter, yet can hang 2+ minutes or fail outright in practice). This
// file answers the separate question "what should Aether Library ever offer
// by default?" The two lists are intersected in server.js — only models that
// are BOTH curated here AND actually present for the current API key are
// shown.
//
// Best-effort snapshot, not a guarantee: review and edit this file whenever
// a provider ships or retires a model. Each entry is one object; add/remove
// a line, nothing else changes. `fast`/`reasoning`/`budget`/`experimental`
// are independent booleans — set each deliberately per model, never derive
// one from another (a Fast model is not automatically Budget, and vice
// versa). There is deliberately NO `recommended` field here: "Recommended"
// is always computed against the live `config.providers[id].model` default
// (see classifyModelBadges() in public/app.js) so there is exactly one
// source of truth for "current default," not two that can drift apart.
//
// `experimental: true` entries (preview/alpha/beta/release-candidate/
// short-lived) are excluded from the default intersection — see
// supportedModelIds()'s `includeExperimental` option, reserved for a future
// "Show Preview / Experimental Models" Settings toggle (not built yet).

export const SUPPORTED_MODELS = {
  openai: [
    // Current generation, general text + reasoning. Excludes chat-latest
    // floating aliases, *-search-preview* (specialized tool-use variant),
    // *-codex*/gpt-5-search-api* (coding-agent / specialized), gpt-5.6-luna/
    // sol/terra (unversioned internal codenames, no plain "gpt-5.6" exists),
    // and legacy gpt-3.5/gpt-4/gpt-4-turbo (superseded).
    { id: "gpt-5.5", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-5.5-pro", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "gpt-5.4", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-5.4-mini", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gpt-5.4-nano", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gpt-5.4-pro", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "gpt-5.2", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-5.2-pro", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "gpt-5.1", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-5", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-4.1", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-4.1-mini", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gpt-4.1-nano", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gpt-4o", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "gpt-4o-mini", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "o3", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "o3-mini", fast: true, reasoning: true, budget: true, experimental: false },
    { id: "o4-mini", fast: true, reasoning: true, budget: true, experimental: false },
    { id: "o1", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "o1-pro", fast: false, reasoning: true, budget: false, experimental: false },
  ],
  anthropic: [
    // Current mainstream Claude families (Opus/Sonnet/Haiku). Excludes
    // claude-opus-4-5 (superseded by 4-6/4-7/4-8) and claude-fable-5 (naming
    // outside the usual tier system, purpose unclear — add back if a future
    // review confirms it's a general text model).
    { id: "claude-opus-4-8", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "claude-opus-4-7", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "claude-sonnet-5", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "claude-sonnet-4-6", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "claude-sonnet-4-5", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "claude-haiku-4-5", fast: true, reasoning: false, budget: true, experimental: false },
  ],
  google: [
    // Stable text-generation models only. Excludes every *-preview* variant,
    // deep-research-*, *computer-use*, *robotics*, antigravity-*,
    // gemini-omni-*, gemma-* (separate open-weight product line), and
    // nano-banana-* (image generation).
    { id: "gemini-2.5-pro", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "gemini-2.5-flash", fast: true, reasoning: false, budget: false, experimental: false },
    { id: "gemini-2.5-flash-lite", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gemini-2.0-flash", fast: true, reasoning: false, budget: false, experimental: false },
    { id: "gemini-2.0-flash-lite", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gemini-pro-latest", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "gemini-flash-latest", fast: true, reasoning: false, budget: false, experimental: false },
    { id: "gemini-flash-lite-latest", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gemini-3.1-flash-lite", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "gemini-3.5-flash", fast: true, reasoning: false, budget: false, experimental: false },
  ],
  // xAI GROK text models, reachable through POST /v1/chat/completions.
  //
  // Excluded on purpose, all of them non-text or non-general:
  //   grok-imagine-image*      image generation
  //   grok-imagine-video*      video generation
  //   grok-voice-*             voice/audio
  //   grok-build-*             coding/agent build, the same reason openai's
  //                            list drops *-codex*
  //
  // The grok-4.20-0309-* entries are dated internal builds in the same spirit
  // as the gpt-5.6 codenames openai's list excludes, so they are carried as
  // `experimental` — visible only once a "Show Preview / Experimental Models"
  // toggle exists, never in the default intersection.
  //
  // The Grok 4 family are reasoning models, and `reasoning: true` is not
  // cosmetic: it is what stops the Council Pre-check sending an output cap
  // that a reasoning model cannot answer within.
  xai: [
    { id: "grok-4.6", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "grok-4.5", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "grok-4.3", fast: false, reasoning: true, budget: false, experimental: false },
    { id: "grok-4.20-0309-reasoning", fast: false, reasoning: true, budget: false, experimental: true },
    { id: "grok-4.20-0309-non-reasoning", fast: false, reasoning: false, budget: false, experimental: true },
    { id: "grok-4.20-multi-agent-0309", fast: false, reasoning: true, budget: false, experimental: true },
  ],
  deepseek: [
    // The only two general-purpose models DeepSeek documents.
    { id: "deepseek-chat", fast: false, reasoning: false, budget: true, experimental: false },
    { id: "deepseek-reasoner", fast: false, reasoning: true, budget: true, experimental: false },
  ],
  // Perplexity SONAR only — the web-grounded family reachable through
  // POST /chat/completions. Perplexity's Agent API catalog (openai/*,
  // anthropic/*, google/*, xai/*, nvidia/*, perplexity/*) needs a different
  // endpoint and payload and is deliberately absent; see perplexity.js.
  //
  // This provider has no live discovery endpoint, so this list is the whole
  // truth rather than a filter over one — which is exactly why a retired
  // model has to be removed here by hand. `sonar-reasoning` was removed
  // after the API began answering it with
  // "has been deprecated and is no longer available".
  perplexity: [
    { id: "sonar", fast: true, reasoning: false, budget: true, experimental: false },
    { id: "sonar-pro", fast: false, reasoning: false, budget: false, experimental: false },
    { id: "sonar-reasoning-pro", fast: false, reasoning: true, budget: false, experimental: false },
    // Reasoning, so the Council Pre-check sends NO output cap: deep research
    // cannot answer inside the 16-token floor the API enforces.
    { id: "sonar-deep-research", fast: false, reasoning: true, budget: false, experimental: false },
  ],
};

export function catalogFor(providerId) {
  return SUPPORTED_MODELS[providerId] || [];
}

export function supportedModelIds(providerId, { includeExperimental = false } = {}) {
  return catalogFor(providerId)
    .filter((m) => includeExperimental || !m.experimental)
    .map((m) => m.id);
}

// A catalog id matches a live id that equals it, or that is a dated
// snapshot/version of it ("claude-sonnet-4-5" matches a live-only
// "claude-sonnet-4-5-20250929" or "…@version") — mirrors the alias matching
// already used client-side in modelAvailable() (public/app.js).
function liveMatchesCatalogId(liveModels, catalogId) {
  if (liveModels.includes(catalogId)) return true;
  return liveModels.some(
    (m) => m.startsWith(`${catalogId}@`) || (m.startsWith(`${catalogId}-`) && /^\d{8}$/.test(m.slice(catalogId.length + 1)))
  );
}

// Returns the curated ids that are actually present (directly or via alias)
// in `liveModels` — the set Refresh Model List actually shows.
export function intersectWithCatalog(liveModels, providerId, opts = {}) {
  const list = Array.isArray(liveModels) ? liveModels : [];
  return supportedModelIds(providerId, opts).filter((id) => liveMatchesCatalogId(list, id));
}

// { [id]: {fast,reasoning,budget,experimental} } for badge rendering —
// callers intersect this against whatever intersectWithCatalog() returned.
export function modelMetadataMap(providerId, opts = {}) {
  const map = {};
  for (const m of catalogFor(providerId)) {
    if (!opts.includeExperimental && m.experimental) continue;
    map[m.id] = { fast: m.fast, reasoning: m.reasoning, budget: m.budget, experimental: m.experimental };
  }
  return map;
}
