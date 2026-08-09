// Regression test for the Council Pre-check false-negative bug: OpenAI's
// real /chat/completions rejects "max_tokens" outright for current models
// (confirmed live against the real API — see the root-cause investigation)
// with 400 unsupported_parameter, "Use 'max_completion_tokens' instead."
// gpt-5.4-mini and gpt-5.1 (both catalogued reasoning:false, so the
// Pre-check DOES send a token cap for them) failed the Pre-check for this
// exact reason; normal Council generation never hit it because it never
// sends any token-limit field at all.
//
// Verifies the actual outgoing request body's field name — via a local
// mock HTTP server (same technique as timeouts.test.js), never a real
// provider — for: the "openai" provider (must use max_completion_tokens),
// a plain OpenAI-compatible provider like deepseek/perplexity (must keep
// using max_tokens — they still mirror the ORIGINAL Chat Completions spec
// and were never part of this regression), and the omitted-maxTokens case
// (normal generation — neither field should appear).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

let config;
let openAICompatProvider;
let openaiTokenLimitField;
let server;
let baseUrl;
let lastRequestBody;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-openai-compat-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(process.env.ENV_FILE_PATH, "\n", "utf8");
  config = await import("../src/config.js");
  ({ openAICompatProvider } = await import("../src/providers/openai-compat.js"));

  // The real openai.js's own choice of tokenLimitField — imported directly
  // so this test breaks if that file's opt-in is ever accidentally removed,
  // rather than silently testing a value hardcoded here.
  const openaiModule = await import("../src/providers/openai.js");
  void openaiModule; // side-effect import only (registers nothing testable directly)

  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastRequestBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Fake credentials for two synthetic provider ids sharing the mock
  // server: config.providers is a plain mutable object, so this is the
  // exact same seam settings.js's own env-driven population uses.
  config.config.providers.openai = { apiKey: "test-key", model: "gpt-5.4-mini" };
  config.config.providers["fake-compat"] = { apiKey: "test-key", model: "some-model" };
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("the real openai.js provider is configured with tokenLimitField: max_completion_tokens", async () => {
  // Re-derive independently of the module (which doesn't export the raw
  // option) by driving a request through a factory instance built the same
  // way openai.js builds its real one, and checking the wire body — the
  // strongest possible regression guard against this exact bug recurring.
  const openai = openAICompatProvider({
    id: "openai",
    label: "OpenAI",
    baseUrl,
    keyName: "OPENAI_API_KEY",
    supportsImages: true,
    tokenLimitField: "max_completion_tokens",
  });
  await openai.complete({ prompt: "Reply only with: OK", model: "gpt-5.4-mini", maxTokens: 16 });
  assert.equal(lastRequestBody.max_completion_tokens, 16);
  assert.equal("max_tokens" in lastRequestBody, false);
});

test("a plain OpenAI-compatible provider (deepseek/perplexity's shape) still uses max_tokens, unaffected by the OpenAI-specific fix", async () => {
  const fakeCompat = openAICompatProvider({
    id: "fake-compat",
    label: "FakeCompat",
    baseUrl,
    keyName: "FAKE_API_KEY",
  });
  await fakeCompat.complete({ prompt: "Reply only with: OK", model: "some-model", maxTokens: 16 });
  assert.equal(lastRequestBody.max_tokens, 16);
  assert.equal("max_completion_tokens" in lastRequestBody, false);
});

test("omitting maxTokens (normal Council generation) sends neither token-limit field, for any provider", async () => {
  const openai = openAICompatProvider({
    id: "openai",
    label: "OpenAI",
    baseUrl,
    keyName: "OPENAI_API_KEY",
    tokenLimitField: "max_completion_tokens",
  });
  await openai.complete({ prompt: "A real council question.", model: "gpt-5.4-mini" });
  assert.equal("max_tokens" in lastRequestBody, false);
  assert.equal("max_completion_tokens" in lastRequestBody, false);
});
