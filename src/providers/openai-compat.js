// Shared implementation for OpenAI-compatible chat APIs (OpenAI, Perplexity,
// DeepSeek, and most future providers). Each concrete provider module wraps
// this factory with its base URL.

import { config } from "../config.js";
import { wrapProviderError, httpError } from "./errors.js";
import { startTimeoutClock, resolveTimeoutProfile, readSSE } from "./timeouts.js";

const LIST_TIMEOUT_MS = 30_000;

// Refresh Model List hides model families this app can never use: it only
// ever calls {baseUrl}/chat/completions with a text prompt. Mirrors the
// intent of google.js's NON_TEXT_RE for OpenAI-shaped catalogs — embeddings,
// moderation, TTS/whisper/speech, image/video generation, realtime/audio,
// and the legacy completion-only base models (babbage/davinci/curie/ada,
// *-instruct) that 400 on the chat endpoint. Matches whole hyphen-delimited
// tokens anywhere in the id — `(^|-)…(-|$)` — so it catches a token whether
// it opens the id ("tts-1", "sora-2"), closes it ("…-instruct"), or sits in
// the middle ("chatgpt-image-latest"), not just ones with hyphens on both
// sides. Best-effort by name; the provider's own /models listing already
// scopes to what this API key can see.
// `voice` was added for xAI, whose /v1/models lists grok-voice-* alongside
// the chat models; they 400 on /chat/completions like every other family
// here. It is a whole-token match, and no curated model of any existing
// provider contains a `voice` token, so this widens the filter for xAI
// without changing what OpenAI/DeepSeek/Perplexity list.
const NON_TEXT_RE =
  /(^|-)(embeddings?|tts|transcribe|transcription|whisper|audio|realtime|speech|voice|moderation|images?|dall-?e|sora|video|instruct|babbage|davinci|curie|ada)(-|$)/i;

// `tokenLimitField` (optional, default "max_tokens"): the JSON field name
// this provider's /chat/completions actually accepts for an output-token
// cap. OpenAI itself now REJECTS "max_tokens" outright — confirmed live
// against the real API: gpt-5.4-mini and gpt-5.1 (both non-reasoning, so
// the Council Pre-check does send a cap) both 400 with
// `{"error":{"param":"max_tokens","code":"unsupported_parameter","message":
// "Unsupported parameter: 'max_tokens' is not supported with this model.
// Use 'max_completion_tokens' instead."}}`, while the exact same request
// with "max_completion_tokens" instead returns 200. Normal Council
// generation never hit this because it never sends a token cap at all
// (maxTokens is only ever passed by the Pre-check). DeepSeek/Perplexity
// mirror the ORIGINAL OpenAI Chat Completions spec and still expect
// "max_tokens" — only OpenAI itself made this breaking rename — so this is
// opted into per-provider (openai.js), not changed here by default.
// `staticModels` (optional): this provider has NO model-discovery endpoint,
// and the given list IS its catalog. listModels() then returns it directly
// without any HTTP call — honest about the fact that nothing is being
// discovered, instead of firing a request that is known to 404 and quietly
// falling back. `fallbackModels` keeps its original meaning for providers
// that DO have an endpoint which may be unavailable on some accounts.
export function openAICompatProvider({
  id,
  label,
  baseUrl,
  keyName,
  fallbackModels = [],
  staticModels = null,
  supportsImages = false,
  tokenLimitField = "max_tokens",
}) {
  function requireKey() {
    const apiKey = config.providers[id]?.apiKey;
    if (!apiKey) throw new Error(`${keyName} is not set in .env.local`);
    return apiKey;
  }

  // Streaming completion, accumulated to the same full-text return value as
  // before. Streaming is what makes the inactivity timeout meaningful: every
  // delta chunk is provider activity that resets the inactivity window, so a
  // long-but-healthy generation is never killed at a fixed deadline (see
  // timeouts.js). `timeouts` is a profile from resolveTimeoutProfile();
  // `onActivity` (optional) fires on each received content delta so callers
  // can surface "receiving response" progress.
  // `maxTokens` (optional): caps output tokens — used by the Council
  // Pre-check to keep its minimal request cheap. Omitted entirely for a
  // normal completion call, preserving today's provider-default behavior.
  async function complete({ system, prompt, model, images = [], timeouts, onActivity, maxTokens, signal }) {
    const apiKey = requireKey();
    // Attached images (Session Materials) ride along as data-URL content
    // parts on vision-capable providers; text-only providers ignore them
    // (the context package still describes the attachments).
    const content =
      supportsImages && images.length
        ? [
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mediaType};base64,${img.data}` },
            })),
            { type: "text", text: prompt },
          ]
        : prompt;

    const useModel = model || config.providers[id].model;
    const profile =
      timeouts || resolveTimeoutProfile({ providerId: id, model: useModel, hasFiles: images.length > 0, promptChars: prompt.length });
    const clock = startTimeoutClock(profile, label, signal);

    let text = "";
    try {
      let res;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: useModel,
            stream: true,
            ...(maxTokens ? { [tokenLimitField]: maxTokens } : {}),
            messages: [
              ...(system ? [{ role: "system", content: system }] : []),
              { role: "user", content },
            ],
          }),
          signal: clock.signal,
        });
      } catch (err) {
        throw clock.classify(err) || wrapProviderError(err, label);
      }
      clock.connected();

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw httpError(label, res.status, data.error?.message || res.statusText);
      }

      try {
        await readSSE(res, clock, (payload) => {
          let data;
          try {
            data = JSON.parse(payload);
          } catch {
            return; // tolerate non-JSON keep-alive payloads
          }
          // Mid-stream errors arrive as an SSE data event on some
          // OpenAI-compatible providers.
          if (data.error) throw httpError(label, res.status, data.error.message || "stream error");
          const delta = data.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            text += delta;
            onActivity?.();
          }
        });
      } catch (err) {
        throw clock.classify(err) || wrapProviderError(err, label);
      }
    } finally {
      clock.done();
    }

    if (!text) throw new Error(`${label} API returned no text content.`);
    return text;
  }

  // GET {baseUrl}/models. If the provider does not expose the endpoint
  // (404/405) and a maintained fallback list exists, use the fallback.
  //
  // A provider declared with `staticModels` skips all of that: it has no
  // such endpoint, so there is nothing to ask. The key is still required, so
  // "Refresh Model List" keeps reporting an unconfigured provider.
  async function listModels() {
    const apiKey = requireKey();
    if (staticModels) return [...staticModels];
    let res;
    try {
      res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      });
    } catch (err) {
      throw wrapProviderError(err, label);
    }

    if (!res.ok) {
      if ((res.status === 404 || res.status === 405) && fallbackModels.length > 0) {
        return [...fallbackModels];
      }
      const data = await res.json().catch(() => ({}));
      throw httpError(label, res.status, data.error?.message || res.statusText);
    }

    const data = await res.json().catch(() => ({}));
    const ids = (data.data || [])
      .map((m) => m.id)
      .filter((id) => id && !NON_TEXT_RE.test(id))
      .sort();
    if (ids.length === 0 && fallbackModels.length > 0) return [...fallbackModels];
    return ids;
  }

  return { complete, listModels };
}
