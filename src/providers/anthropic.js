// Anthropic / Claude provider — Messages API over plain fetch.
// https://platform.claude.com/docs — POST /v1/messages

import { config } from "../config.js";
import { wrapProviderError, httpError } from "./errors.js";
import { startTimeoutClock, resolveTimeoutProfile, readSSE } from "./timeouts.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODELS_URL = "https://api.anthropic.com/v1/models";

// Small maintained fallback, used only if the models endpoint is unavailable.
const FALLBACK_MODELS = ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"];

// Streaming completion, accumulated to the same full-text return value as
// before — streaming makes the inactivity timeout meaningful (see
// timeouts.js): every delta event resets the inactivity window, so a long
// healthy generation is never killed at a fixed deadline.
// `maxTokens` (optional): caps output tokens for the Council Pre-check's
// minimal request — overrides the normal fixed 8192 ceiling below. Omitted
// for a real completion call, which keeps its existing 8192 behavior.
export async function complete({ system, prompt, model, images = [], timeouts, onActivity, maxTokens, signal }) {
  const { apiKey, model: defaultModel } = config.providers.anthropic;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.local");

  // Attached images (Session Materials) ride along as content blocks.
  const content = images.length
    ? [
        ...images.map((img) => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.data },
        })),
        { type: "text", text: prompt },
      ]
    : prompt;

  const useModel = model || defaultModel;
  const profile =
    timeouts || resolveTimeoutProfile({ providerId: "anthropic", model: useModel, hasFiles: images.length > 0, promptChars: prompt.length });
  const clock = startTimeoutClock(profile, "Anthropic", signal);

  let text = "";
  let stopReason = null;
  try {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          max_tokens: maxTokens || 8192,
          stream: true,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content }],
        }),
        signal: clock.signal,
      });
    } catch (err) {
      throw clock.classify(err) || wrapProviderError(err, "Anthropic");
    }
    clock.connected();

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw httpError("Anthropic", res.status, data.error?.message || res.statusText);
    }

    try {
      await readSSE(res, clock, (payload) => {
        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          return;
        }
        if (data.type === "error") {
          throw httpError("Anthropic", res.status, data.error?.message || "stream error");
        }
        if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && data.delta.text) {
          text += data.delta.text;
          onActivity?.();
        }
        if (data.type === "message_delta" && data.delta?.stop_reason) {
          stopReason = data.delta.stop_reason;
        }
      });
    } catch (err) {
      throw clock.classify(err) || wrapProviderError(err, "Anthropic");
    }
  } finally {
    clock.done();
  }

  if (stopReason === "refusal") {
    throw new Error("Anthropic model declined the request (stop_reason: refusal).");
  }
  if (!text) throw new Error("Anthropic API returned no text content.");
  return text;
}

// GET /v1/models (paginated with after_id/has_more).
export async function listModels() {
  const { apiKey } = config.providers.anthropic;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.local");

  const models = [];
  let afterId = "";
  for (let page = 0; page < 10; page++) {
    const url = `${MODELS_URL}?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`;
    let res;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw wrapProviderError(err, "Anthropic");
    }
    if (!res.ok) {
      if (res.status === 404 && models.length === 0) return [...FALLBACK_MODELS];
      const data = await res.json().catch(() => ({}));
      throw httpError("Anthropic", res.status, data.error?.message || res.statusText);
    }
    const data = await res.json();
    for (const m of data.data || []) {
      if (m.id) models.push(m.id);
    }
    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }
  return models.sort();
}
