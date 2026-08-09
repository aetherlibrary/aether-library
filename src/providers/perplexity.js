// Perplexity SONAR provider — the web-grounded Sonar family, over
// Perplexity's OpenAI-compatible chat endpoint.
//
//   POST https://api.perplexity.ai/chat/completions      (Sonar, supported)
//
// SCOPE: Sonar only. Perplexity also runs an AGENT API that routes
// third-party models (openai/*, anthropic/*, google/*, xai/*, nvidia/*) and
// is discoverable at GET /v1/models — but it is a different transport in
// every respect that matters here: it lives at POST /v1/agent, takes an
// `input` array instead of `messages` (sending `messages` is rejected with
// `unknown field "messages"`), returns Responses-style events, and bills
// per tool invocation on top of tokens. Sonar ids are rejected by the Agent
// endpoint and Agent ids are rejected by this one, so the two catalogs
// cannot be merged behind one adapter. Agent support is deliberately
// deferred rather than faked.
//
// NO LIVE DISCOVERY: GET https://api.perplexity.ai/models returns 404 — the
// Sonar API simply has no model-listing endpoint. This module therefore
// declares its catalog explicitly instead of issuing a request that is known
// to fail and silently falling back, which is how a retired model
// (`sonar-reasoning`) stayed on offer long after the API began refusing it.
// Keeping the list here means retirements are a visible edit, not a silent
// omission.

import { openAICompatProvider } from "./openai-compat.js";

// The Sonar family, exactly. Mirrors SUPPORTED_MODELS.perplexity in
// src/config/supported-models.js — the two are asserted equal in
// test/perplexitySonar.test.js so they cannot drift.
export const SONAR_MODELS = ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"];

export const { complete, listModels } = openAICompatProvider({
  id: "perplexity",
  label: "Perplexity / Sonar",
  baseUrl: "https://api.perplexity.ai",
  keyName: "PERPLEXITY_API_KEY",
  staticModels: SONAR_MODELS,
});
