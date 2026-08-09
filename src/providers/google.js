// Google / Gemini provider — generateContent API over plain fetch.
// https://ai.google.dev/api/generate-content

import { config } from "../config.js";
import { wrapProviderError, httpError } from "./errors.js";
import { startTimeoutClock, resolveTimeoutProfile, readSSE } from "./timeouts.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Streaming completion via :streamGenerateContent?alt=sse, accumulated to
// the same full-text return value as before — streaming makes the inactivity
// timeout meaningful (see timeouts.js): every chunk resets the inactivity
// window, so a long healthy generation is never killed at a fixed deadline
// (Gemini 2.5 Pro's documented 2+-minute runs were the original motivation
// for the old hard 60s cap).
// `maxTokens` (optional): caps output tokens (generationConfig.maxOutputTokens)
// for the Council Pre-check's minimal request. Omitted for a real completion
// call, which keeps using the model's own default ceiling.
export async function complete({ system, prompt, model, images = [], timeouts, onActivity, maxTokens, signal }) {
  const { apiKey, model: defaultModel } = config.providers.google;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set in .env.local");

  // Attached images (Session Materials) ride along as inline data parts.
  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
    { text: prompt },
  ];

  const useModel = model || defaultModel;
  const profile =
    timeouts || resolveTimeoutProfile({ providerId: "google", model: useModel, hasFiles: images.length > 0, promptChars: prompt.length });
  const clock = startTimeoutClock(profile, "Google", signal);

  let text = "";
  let finishReason = null;
  let blockReason = null;
  try {
    let res;
    try {
      res = await fetch(`${API_BASE}/${encodeURIComponent(useModel)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
          contents: [{ role: "user", parts }],
        }),
        signal: clock.signal,
      });
    } catch (err) {
      throw clock.classify(err) || wrapProviderError(err, "Google");
    }
    clock.connected();

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw httpError("Google", res.status, data.error?.message || res.statusText);
    }

    try {
      await readSSE(res, clock, (payload) => {
        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          return;
        }
        if (data.error) throw httpError("Google", res.status, data.error.message || "stream error");
        if (data.promptFeedback?.blockReason) blockReason = data.promptFeedback.blockReason;
        const candidate = data.candidates?.[0];
        if (!candidate) return;
        if (candidate.finishReason) finishReason = candidate.finishReason;
        const chunk = (candidate.content?.parts || []).map((part) => part.text || "").join("");
        if (chunk) {
          text += chunk;
          onActivity?.();
        }
      });
    } catch (err) {
      throw clock.classify(err) || wrapProviderError(err, "Google");
    }
  } finally {
    clock.done();
  }

  if (!text) {
    if (blockReason) throw new Error(`Google API blocked the prompt: ${blockReason}`);
    throw new Error(`Google API returned no text (finishReason: ${finishReason || "unknown"}).`);
  }
  return text;
}

// Model families that pass the generateContent filter but cannot serve this
// app's text-in/text-out calls: TTS and image models demand responseModalities
// the council never sends, and Live / native-audio models only speak the
// bidirectional API.
const NON_TEXT_RE = /-(tts|image|image-generation|native-audio|audio|live|dialog)(-|$)|^(imagen|veo|lyria)-/;

// ListModels presence does not prove callability: Google keeps retired
// previews/experimentals in the list, and they 404 on use. countTokens is free
// and rate-limited separately from generateContent, so it can probe the whole
// list without spending tokens. Only a definite 404 removes a model — 429s,
// 5xx and timeouts prove nothing about availability.
const PROBE_CONCURRENCY = 8;
const PROBE_TTL_MS = 10 * 60_000;
const probeCache = new Map(); // `${apiKey}:${model}` -> { callable, at } (in-memory only)

async function probeCallable(model, apiKey) {
  const cacheKey = `${apiKey}:${model}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.callable;

  let callable = true;
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:countTokens`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
      signal: AbortSignal.timeout(10_000),
    });
    callable = res.status !== 404;
    res.body?.cancel().catch(() => {});
  } catch {
    // Network error / timeout: keep the model rather than hide a usable one.
  }
  probeCache.set(cacheKey, { callable, at: Date.now() });
  return callable;
}

// ModelService.ListModels — generateContent models, text-capable families
// only, each verified callable for this key via a free countTokens probe.
export async function listModels() {
  const { apiKey } = config.providers.google;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set in .env.local");

  const models = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const url = `${API_BASE}?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    let res;
    try {
      res = await fetch(url, {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw wrapProviderError(err, "Google");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError("Google", res.status, data.error?.message || res.statusText);
    }
    for (const m of data.models || []) {
      const name = m.name.replace(/^models\//, "");
      if ((m.supportedGenerationMethods || []).includes("generateContent") && !NON_TEXT_RE.test(name)) {
        models.push(name);
      }
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  // Probe callability with a small worker pool; drop only confirmed 404s.
  const callable = new Array(models.length).fill(true);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, models.length) }, async () => {
      while (next < models.length) {
        const i = next++;
        callable[i] = await probeCallable(models[i], apiKey);
      }
    })
  );
  return models.filter((_, i) => callable[i]).sort();
}
