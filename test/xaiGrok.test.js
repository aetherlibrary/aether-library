// xAI / Grok provider, and the canonical provider ORDER.
//
// Grok is deliberately not a special case: it is one PROVIDER_DEFS entry plus
// one 40-line module over the existing openAICompatProvider factory. Most of
// what these tests protect is therefore that it reuses the shared machinery
// (config, env keys, enable state, discovery, streaming, persistence) rather
// than growing a parallel path — and that the two things xAI genuinely does
// differently from its OpenAI-compatible siblings are actually honoured:
//
//   1. the base URL carries the /v1 segment;
//   2. /v1/chat/completions wants "max_completion_tokens", not "max_tokens"
//      (deprecated for the Grok 4 family) — the same breaking rename that
//      caused the OpenAI Council Pre-check false negative.
//
// Both were checked against the current official xAI documentation, not
// copied from a sibling provider.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const readSource = async (rel) => (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

let config;
let openAICompatProvider;
let server;
let baseUrl;
let lastRequest;
let nextResponse;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-xai-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(process.env.ENV_FILE_PATH, "\n", "utf8");
  config = await import("../src/config.js");
  ({ openAICompatProvider } = await import("../src/providers/openai-compat.js"));

  // A mock stand-in for api.x.ai — the real provider is never called.
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastRequest = { url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null };
      if (nextResponse) {
        res.writeHead(nextResponse.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(nextResponse.json));
        nextResponse = null;
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":" Grok"}}]}\n\n');
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  config.config.providers.xai = { apiKey: "test-xai-key", model: "grok-4.6" };
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// A factory instance built exactly the way xai.js builds its real one.
const mockXai = () =>
  openAICompatProvider({
    id: "xai",
    label: "xAI",
    baseUrl,
    keyName: "XAI_API_KEY",
    supportsImages: true,
    tokenLimitField: "max_completion_tokens",
  });

// ============================================ 1. REGISTRATION AND ORDER

test("X1. the canonical provider order is OpenAI, Anthropic, Google, xAI, Perplexity, DeepSeek", async () => {
  const { PROVIDER_DEFS } = await import("../src/config.js");
  assert.deepEqual(
    PROVIDER_DEFS.map((d) => d.id),
    ["openai", "anthropic", "google", "xai", "perplexity", "deepseek"],
  );
  // THIS array is the presentation order: publicConfig() maps over it to
  // build `providers`, and every frontend list iterates that object, so
  // provider toggles, configuration sections and model selectors all follow
  // it. Object key order is insertion order for string keys, so the public
  // shape must come out in the same sequence.
  const { publicConfig } = await import("../src/config.js");
  assert.deepEqual(
    Object.keys(publicConfig().providers),
    ["openai", "anthropic", "google", "xai", "perplexity", "deepseek"],
  );
});

test("X2. xAI is registered as an ordinary provider with the full interface", async () => {
  const { providers } = await import("../src/providers/index.js");
  const xai = providers.xai;
  assert.ok(xai, "xai is in the registry");
  assert.equal(xai.id, "xai");
  assert.equal(xai.label, "xAI / Grok");
  assert.equal(xai.short, "Grok");
  // The SAME interface every other provider exposes — no extra members, no
  // missing ones, so nothing downstream needs an xAI branch.
  assert.deepEqual(Object.keys(xai).sort(), Object.keys(providers.deepseek).sort());
  for (const fn of ["isConfigured", "model", "complete", "listModels"]) {
    assert.equal(typeof xai[fn], "function", `${fn} is callable`);
  }
});

test("X3. config, env keys and enable state come from the shared PROVIDER_DEFS machinery", async () => {
  const { PROVIDER_DEFS } = await import("../src/config.js");
  const def = PROVIDER_DEFS.find((d) => d.id === "xai");
  assert.equal(def.prefix, "XAI");
  assert.equal(def.defaultModel, "grok-4.6");
  // Settings persistence is derived, not hand-written: the field->env map is
  // built by looping PROVIDER_DEFS, so these three exist by construction.
  const settingsSrc = await readSource("../src/services/settings.js");
  assert.match(settingsSrc, /FIELD_TO_ENV\[`\$\{def\.id\}ApiKey`\] = `\$\{def\.prefix\}_API_KEY`;/);
  assert.match(settingsSrc, /FIELD_TO_ENV\[`\$\{def\.id\}Model`\] = `\$\{def\.prefix\}_MODEL`;/);
  assert.match(settingsSrc, /FIELD_TO_ENV\[`\$\{def\.id\}Enabled`\] = `\$\{def\.prefix\}_ENABLED`;/);
  // …and the example env file documents them in the canonical order.
  const envExample = await readSource("../.env.example");
  for (const key of ["XAI_API_KEY=", "XAI_MODEL=grok-4.6", "XAI_ENABLED="]) {
    assert.ok(envExample.includes(key), `${key} is documented`);
  }
  const order = ["OPENAI", "ANTHROPIC", "GOOGLE", "XAI", "PERPLEXITY", "DEEPSEEK"];
  const keyLines = envExample.split("\n").filter((l) => /^[A-Z]+_API_KEY=/.test(l)).map((l) => l.split("_")[0]);
  assert.deepEqual(keyLines, order, "API key block follows the canonical order");
});

// ============================================ 2. THE VERIFIED ENDPOINTS

test("X4. the real xai.js targets https://api.x.ai/v1 with the documented options", async () => {
  const src = await readSource("../src/providers/xai.js");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  // The /v1 segment belongs to the BASE here (unlike DeepSeek), so the
  // factory's `${baseUrl}/chat/completions` resolves to the documented path.
  assert.match(code, /baseUrl: XAI_BASE_URL/);
  assert.match(code, /export const XAI_BASE_URL = "https:\/\/api\.x\.ai\/v1";/);
  assert.match(code, /id: "xai"/);
  assert.match(code, /keyName: "XAI_API_KEY"/);
  assert.match(code, /tokenLimitField: "max_completion_tokens"/);
  assert.match(code, /supportsImages: true/);
  // It is a thin wrapper over the shared factory — no bespoke transport.
  assert.match(code, /openAICompatProvider\(/);
  for (const b of ["fetch(", "readSSE", "AbortSignal", "Authorization"]) {
    assert.ok(!code.includes(b), `xai.js must not reimplement ${b}`);
  }
});

test("X5. chat requests use max_completion_tokens, never the deprecated max_tokens", async () => {
  const xai = mockXai();
  await xai.complete({ prompt: "Hello", model: "grok-4.6", maxTokens: 16 });
  assert.equal(lastRequest.body.max_completion_tokens, 16);
  assert.equal("max_tokens" in lastRequest.body, false);
  // Normal generation sends no cap at all, exactly as for every provider.
  await xai.complete({ prompt: "Hello", model: "grok-4.6" });
  assert.equal("max_tokens" in lastRequest.body, false);
  assert.equal("max_completion_tokens" in lastRequest.body, false);
});

test("X6. requests hit /chat/completions with bearer auth and SSE streaming", async () => {
  const xai = mockXai();
  const text = await xai.complete({ system: "Be brief.", prompt: "Hi", model: "grok-4.6" });
  assert.equal(lastRequest.url, "/chat/completions");
  assert.equal(lastRequest.method, "POST");
  assert.equal(lastRequest.headers.authorization, "Bearer test-xai-key");
  assert.equal(lastRequest.body.stream, true, "streaming is on, which is what makes the inactivity timeout meaningful");
  assert.equal(lastRequest.body.model, "grok-4.6");
  assert.deepEqual(lastRequest.body.messages, [
    { role: "system", content: "Be brief." },
    { role: "user", content: "Hi" },
  ]);
  // Deltas are accumulated to the same full-text return value as every other
  // provider, and `data: [DONE]` ends the stream.
  assert.equal(text, "Hello Grok");
});

test("X7. attached images ride along as ordinary OpenAI content parts", async () => {
  // VERIFIED against the docs: the newer /v1/responses endpoint uses a
  // different shape ("input_image", bare-string image_url), but the
  // /v1/chat/completions endpoint this integration speaks documents the
  // ordinary {"type":"image_url","image_url":{"url":…}} part — which is
  // exactly what the shared factory already emits.
  const xai = mockXai();
  await xai.complete({
    prompt: "What is this?",
    model: "grok-4.6",
    images: [{ mediaType: "image/png", data: "QUJD" }],
  });
  const content = lastRequest.body.messages.at(-1).content;
  assert.ok(Array.isArray(content), "multimodal content is an array of parts");
  assert.deepEqual(content[0], { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } });
  assert.deepEqual(content[1], { type: "text", text: "What is this?" });
});

// ============================================ 3. MODEL DISCOVERY

test("X8. model discovery reads the OpenAI-compatible GET /models listing", async () => {
  const xai = mockXai();
  nextResponse = {
    status: 200,
    json: {
      object: "list",
      data: [
        { id: "grok-4.6" },
        { id: "grok-4.5" },
        // Non-text families the catalog must never offer.
        { id: "grok-imagine-image-2.0" },
        { id: "grok-imagine-video" },
        { id: "grok-voice-think-fast-2.0" },
      ],
    },
  };
  const models = await xai.listModels();
  assert.equal(lastRequest.url, "/models");
  assert.equal(lastRequest.headers.authorization, "Bearer test-xai-key");
  // The provider module trims non-text families before anything else sees
  // them; `voice` was added to that shared filter for exactly grok-voice-*.
  assert.deepEqual(models, ["grok-4.5", "grok-4.6"]);
});

test("X9. Refresh Model List shows only the curated intersection", async () => {
  const { intersectWithCatalog, supportedModelIds, modelMetadataMap } = await import("../src/config/supported-models.js");
  // Everything a key might see, including things the catalog omits.
  const live = ["grok-4.6", "grok-4.5", "grok-4.3", "grok-build-0.1", "grok-4.20-0309-reasoning"];
  assert.deepEqual(intersectWithCatalog(live, "xai"), ["grok-4.6", "grok-4.5", "grok-4.3"]);
  // grok-build-* is a coding/agent build and is not catalogued at all.
  assert.ok(!supportedModelIds("xai", { includeExperimental: true }).includes("grok-build-0.1"));
  // The dated internal builds are carried but gated behind `experimental`.
  assert.ok(!supportedModelIds("xai").includes("grok-4.20-0309-reasoning"));
  assert.ok(supportedModelIds("xai", { includeExperimental: true }).includes("grok-4.20-0309-reasoning"));
  // The default model is catalogued, or Refresh would never offer it.
  const { PROVIDER_DEFS } = await import("../src/config.js");
  const def = PROVIDER_DEFS.find((d) => d.id === "xai");
  assert.ok(supportedModelIds("xai").includes(def.defaultModel), "the default model is offerable");
  // The Grok 4 family is marked reasoning, which is what stops the Council
  // Pre-check sending a cap a reasoning model cannot answer within.
  assert.equal(modelMetadataMap("xai")["grok-4.6"].reasoning, true);
});

test("X10. an unconfigured xAI reports itself unconfigured rather than calling out", async () => {
  const { providers } = await import("../src/providers/index.js");
  const saved = config.config.providers.xai;
  config.config.providers.xai = { apiKey: "", model: "grok-4.6" };
  assert.equal(providers.xai.isConfigured(), false);
  // The shared factory refuses before any network call, with the env key
  // named — the same message shape every provider gives.
  await assert.rejects(() => mockXai().listModels(), /XAI_API_KEY is not set/);
  await assert.rejects(() => mockXai().complete({ prompt: "x" }), /XAI_API_KEY is not set/);
  config.config.providers.xai = saved;
  assert.equal(providers.xai.isConfigured(), true);
});

// ============================================ 4. NO REGRESSIONS

test("X11. the existing five providers are untouched", async () => {
  const { PROVIDER_DEFS } = await import("../src/config.js");
  const byId = Object.fromEntries(PROVIDER_DEFS.map((d) => [d.id, d]));
  // Ids, env prefixes, labels and default models are exactly as before —
  // adding a provider must never rename or re-key an existing one, or every
  // saved API key and model choice would be orphaned.
  assert.deepEqual(
    { id: byId.openai.prefix, m: byId.openai.defaultModel, l: byId.openai.label },
    { id: "OPENAI", m: "gpt-5.1", l: "OpenAI / GPT" },
  );
  assert.deepEqual(
    { id: byId.anthropic.prefix, m: byId.anthropic.defaultModel, l: byId.anthropic.label },
    { id: "ANTHROPIC", m: "claude-sonnet-4-5", l: "Anthropic / Claude" },
  );
  assert.deepEqual(
    { id: byId.google.prefix, m: byId.google.defaultModel, l: byId.google.label },
    { id: "GOOGLE", m: "gemini-2.5-pro", l: "Google / Gemini" },
  );
  assert.deepEqual(
    { id: byId.perplexity.prefix, m: byId.perplexity.defaultModel, l: byId.perplexity.label },
    { id: "PERPLEXITY", m: "sonar-pro", l: "Perplexity / Sonar" },
  );
  assert.deepEqual(
    { id: byId.deepseek.prefix, m: byId.deepseek.defaultModel, l: byId.deepseek.label },
    { id: "DEEPSEEK", m: "deepseek-chat", l: "DeepSeek" },
  );
  // Their curated catalogs still resolve.
  const { supportedModelIds } = await import("../src/config/supported-models.js");
  assert.deepEqual(supportedModelIds("deepseek"), ["deepseek-chat", "deepseek-reasoner"]);
  assert.ok(supportedModelIds("perplexity").includes("sonar-pro"));
  assert.ok(supportedModelIds("openai").includes("gpt-5.1"));
});

test("X12. adding `voice` to the shared non-text filter changes nothing for the others", async () => {
  const { SUPPORTED_MODELS } = await import("../src/config/supported-models.js");
  // The filter is a whole-hyphen-token match. No curated model of ANY
  // provider carries a `voice` token, so widening it for grok-voice-* cannot
  // hide a model that used to be listed.
  for (const [providerId, list] of Object.entries(SUPPORTED_MODELS)) {
    for (const m of list) {
      assert.doesNotMatch(m.id, /(^|-)voice(-|$)/i, `${providerId}/${m.id} must be unaffected`);
    }
  }
  const src = await readSource("../src/providers/openai-compat.js");
  assert.match(src, /\|speech\|voice\|moderation\|/, "the token sits in the shared NON_TEXT_RE");
});
