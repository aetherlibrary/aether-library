// xAI / Grok provider — OpenAI-compatible chat + models endpoints.
// https://docs.x.ai/docs/api-reference
//
// Everything below was checked against the current official xAI docs rather
// than copied from a sibling provider:
//
//   * Base URL is https://api.x.ai/v1 — the version segment is part of the
//     base here, unlike DeepSeek (https://api.deepseek.com), so the factory's
//     `${baseUrl}/chat/completions` resolves to the documented
//     POST /v1/chat/completions.
//   * Auth is a bearer token, which is what the factory already sends.
//   * GET /v1/models is the OpenAI-compatible listing — {"data":[{"id":…}],
//     "object":"list"}. xAI also exposes /v1/language-models with richer
//     metadata (modalities, fingerprint, aliases) in a NON-OpenAI shape
//     ({"models":[…]}); that is deliberately not used, because the shared
//     factory understands the OpenAI shape and nothing here needs the extras.
//   * Streaming is SSE with `stream: true`, terminated by `data: [DONE]` —
//     exactly what readSSE() already parses.
export const XAI_BASE_URL = "https://api.x.ai/v1";

import { openAICompatProvider } from "./openai-compat.js";

export const { complete, listModels } = openAICompatProvider({
  id: "xai",
  label: "xAI",
  baseUrl: XAI_BASE_URL,
  keyName: "XAI_API_KEY",
  // VERIFIED, not assumed. The image-understanding guide documents the newer
  // /v1/responses endpoint with a different content shape ("type":
  // "input_image", and image_url as a bare string) — but this integration
  // speaks /v1/chat/completions, and THAT endpoint documents the ordinary
  // OpenAI content part, {"type":"image_url","image_url":{"url":…}}, which is
  // precisely what the shared factory emits. So attachments ride along
  // unchanged; no xAI-specific payload branch is needed.
  supportsImages: true,
  // Same breaking rename OpenAI made: xAI's /v1/chat/completions documents
  // "max_completion_tokens", and "max_tokens" is deprecated for the Grok 4
  // family. Only the Council Pre-check ever sends a cap, so getting this
  // wrong would show up exactly as the OpenAI Pre-check false-negative did —
  // a 400 on an otherwise healthy provider. Opted in here rather than in the
  // factory, so DeepSeek/Perplexity keep the original spelling.
  tokenLimitField: "max_completion_tokens",
});
