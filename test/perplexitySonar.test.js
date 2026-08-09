// Tests for the Perplexity SONAR provider.
//
// What went wrong before, and what these tests exist to prevent:
//
//   GET https://api.perplexity.ai/models returns 404 — the Sonar API has no
//   model-listing endpoint at all. The provider issued that request anyway
//   and, on 404, silently returned a local list. Discovery therefore looked
//   live while being entirely hardcoded, which meant a RETIRED model
//   (`sonar-reasoning`, which the API now answers with "has been deprecated
//   and is no longer available") stayed on offer indefinitely: nothing ever
//   asked the API, so nothing ever noticed.
//
//   The fix is to stop pretending. The catalog is declared, so a retirement
//   is a visible edit — and these tests are what make the declaration and
//   the curated catalog impossible to drift apart.
//
// Scope is equally load-bearing: Perplexity's Agent API routes third-party
// models over a DIFFERENT endpoint and payload. Those ids are rejected by
// the Sonar endpoint, so they must never appear in this catalog.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SONAR_MODELS } from "../src/providers/perplexity.js";
import { catalogFor, supportedModelIds, intersectWithCatalog } from "../src/config/supported-models.js";
import { PROVIDER_DEFS } from "../src/config.js";
import { isReasoningModel } from "../src/providers/timeouts.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const EXPECTED = ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"];

// ------------------------------------------------------------- the catalog

test("exactly the four supported Sonar models, in the provider and the catalog alike", () => {
  assert.deepEqual(SONAR_MODELS, EXPECTED);
  assert.deepEqual(supportedModelIds("perplexity"), EXPECTED);
  // The provider's declaration and the curated catalog are the same list —
  // if they drift, Settings shows something the transport cannot run (or
  // hides something it can).
  assert.deepEqual([...SONAR_MODELS].sort(), [...supportedModelIds("perplexity")].sort());
  // And the intersection the Settings route performs is a no-op here, which
  // is the point of a declared catalog.
  assert.deepEqual(intersectWithCatalog(SONAR_MODELS, "perplexity"), EXPECTED);
});

test("the deprecated sonar-reasoning is gone from every list", async () => {
  assert.ok(!SONAR_MODELS.includes("sonar-reasoning"));
  assert.ok(!supportedModelIds("perplexity").includes("sonar-reasoning"));
  // Not merely absent from the exported arrays — absent from the source, so
  // it cannot survive in a fallback list nobody reads.
  const providerSrc = await readSource("../src/providers/perplexity.js");
  const catalogSrc = await readSource("../src/config/supported-models.js");
  const perplexityBlock = catalogSrc.slice(catalogSrc.indexOf("perplexity: ["), catalogSrc.indexOf("];", catalogSrc.indexOf("perplexity: [")));
  assert.doesNotMatch(providerSrc, /"sonar-reasoning"/);
  assert.doesNotMatch(perplexityBlock, /id: "sonar-reasoning"/);
});

test("the valid sonar-deep-research is exposed", () => {
  assert.ok(SONAR_MODELS.includes("sonar-deep-research"));
  assert.ok(supportedModelIds("perplexity").includes("sonar-deep-research"));
});

test("no Agent-API model can reach the Sonar catalog", () => {
  // These ids are answered with `invalid_model` by /chat/completions — they
  // belong to POST /v1/agent, which this provider does not speak.
  for (const id of SONAR_MODELS) {
    assert.ok(!id.includes("/"), `${id} must not be provider-qualified`);
  }
  for (const forbidden of ["perplexity/sonar", "openai/gpt-5-mini", "anthropic/claude-haiku-4-5", "google/gemini-3.5-flash", "xai/grok-4.3", "nvidia/nemotron-3-super-120b-a12b"]) {
    assert.ok(!SONAR_MODELS.includes(forbidden));
    assert.ok(!supportedModelIds("perplexity").includes(forbidden));
  }
});

// --------------------------------------------------------------- the label

test("the provider is identified as Perplexity / Sonar, with its id unchanged", () => {
  const def = PROVIDER_DEFS.find((d) => d.id === "perplexity");
  assert.equal(def.label, "Perplexity / Sonar");
  assert.equal(def.short, "Sonar");
  // The id, env prefix and default model are UNCHANGED: an existing
  // .env.local and an existing saved selection must keep working.
  assert.equal(def.id, "perplexity");
  assert.equal(def.prefix, "PERPLEXITY");
  assert.equal(def.defaultModel, "sonar-pro");
  assert.ok(SONAR_MODELS.includes(def.defaultModel), "the default model must still be supported");
});

// ----------------------------------------------------------- no discovery

test("the Sonar provider never calls the endpoint that does not exist", async () => {
  const src = await readSource("../src/providers/perplexity.js");
  // It declares a static catalog instead of a fallback-after-404.
  assert.match(src, /staticModels: SONAR_MODELS,/);
  assert.doesNotMatch(src, /fallbackModels/);

  const compat = await readSource("../src/providers/openai-compat.js");
  // staticModels short-circuits BEFORE the fetch — asserted by position, so
  // a later edit cannot quietly reintroduce the request.
  const listAt = compat.indexOf("async function listModels()");
  const shortCircuitAt = compat.indexOf("if (staticModels) return [...staticModels];");
  const fetchAt = compat.indexOf("`${baseUrl}/models`");
  assert.ok(listAt > 0 && shortCircuitAt > listAt && fetchAt > shortCircuitAt);
  // The key is still required, so an unconfigured provider still reports so.
  assert.match(compat, /const apiKey = requireKey\(\);\s*\n\s*if \(staticModels\) return \[\.\.\.staticModels\];/);
});

test("listModels resolves deterministically, with no network and no shared mutable state", async () => {
  process.env.PERPLEXITY_API_KEY = "test-key-not-a-real-credential";
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  const { listModels } = await import("../src/providers/perplexity.js");

  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (...args) => {
    called += 1;
    throw new Error(`the Sonar provider must not make network calls: ${args[0]}`);
  };
  try {
    const a = await listModels();
    const b = await listModels();
    assert.equal(called, 0, "listModels must not fetch");
    assert.deepEqual(a, EXPECTED);
    assert.deepEqual(b, EXPECTED);
    // A fresh array each time: a caller cannot mutate the catalog for
    // everyone else.
    a.push("mutated");
    assert.deepEqual(await listModels(), EXPECTED);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PERPLEXITY_API_KEY;
    reloadConfig();
  }
});

// --------------------------------------------------------------- transport

test("pre-check and generation share one transport, and the model id is sent verbatim", async () => {
  const compat = await readSource("../src/providers/openai-compat.js");
  // One completion path, one URL — the pre-check calls the same complete().
  // Counted on the fetch, not on prose: the file documents the endpoint too.
  assert.equal((compat.match(/fetch\(`\$\{baseUrl\}\/chat\/completions`/g) || []).length, 1);
  assert.match(compat, /model: useModel,/);
  // No rewriting, prefixing or aliasing of the id anywhere in the provider.
  const providerSrc = await readSource("../src/providers/perplexity.js");
  assert.doesNotMatch(providerSrc, /replace\(|split\(|prefix|toLowerCase\(/);

  const councilSrc = await readSource("../src/services/council.js");
  assert.match(councilSrc, /await provider\.complete\(\{/);
  // The pre-check omits the output cap for reasoning models — which is why
  // sonar-deep-research must be classified as reasoning (below).
  assert.match(councilSrc, /const maxTokens = isReasoningModel\(providerId, model\) \? undefined : PRECHECK_MAX_TOKENS;/);
});

test("capability metadata matches how each Sonar model actually behaves", () => {
  const byId = Object.fromEntries(catalogFor("perplexity").map((m) => [m.id, m]));
  assert.equal(byId.sonar.fast, true);
  assert.equal(byId.sonar.budget, true);
  assert.equal(byId.sonar.reasoning, false);
  assert.equal(byId["sonar-pro"].reasoning, false);
  // Both reasoning models must be flagged, or the pre-check would cap them
  // at 16 output tokens — below what either can answer in.
  assert.equal(isReasoningModel("perplexity", "sonar-reasoning-pro"), true);
  assert.equal(isReasoningModel("perplexity", "sonar-deep-research"), true);
  assert.equal(isReasoningModel("perplexity", "sonar"), false);
  // Nothing is marked experimental, so nothing is hidden from the default view.
  for (const m of catalogFor("perplexity")) assert.equal(m.experimental, false);
});

// ------------------------------------------------------- saved selections

test("supported saved selections keep working; a deprecated one is surfaced, never substituted", () => {
  // Every id an existing user could have saved and still run.
  for (const saved of EXPECTED) {
    assert.ok(intersectWithCatalog(SONAR_MODELS, "perplexity").includes(saved));
  }
  // A saved `sonar-reasoning` resolves to nothing in the catalog, which is
  // what makes the Settings dropdown mark it unavailable rather than swap it.
  assert.ok(!intersectWithCatalog(SONAR_MODELS, "perplexity").includes("sonar-reasoning"));
});

test("the UI marks an unavailable saved model instead of silently replacing it", async () => {
  const appJs = await readSource("../public/app.js");
  // The current selection is preserved in the dropdown, labelled unavailable.
  assert.match(
    appJs,
    /if \(current && !list\.includes\(current\)\) \{\s*const suffix = list\.length \? ` — \$\{str\("statusModelUnavailable"\)\}` : "";\s*select\.appendChild\(new Option\(current \+ suffix, current, true, true\)\);/
  );
  // ...and the provider status line says so too.
  assert.match(appJs, /if \(!modelAvailable\(id, model\)\) return "statusModelUnavailable";/);
  // Nothing anywhere rewrites the selection to a different model.
  assert.doesNotMatch(appJs, /select\.value = list\[0\] \|\| current/);
});

// ------------------------------------------------------------- scope + copy

test("the Sonar scope is stated in the UI, in both locales", async () => {
  const [en, zh, appJs] = await Promise.all([
    readSource("../src/locales/en.js"),
    readSource("../src/locales/zh-TW.js"),
    readSource("../public/app.js"),
  ]);
  assert.match(en, /perplexitySonarNote: "Currently supports the Perplexity Sonar model family\.",/);
  assert.match(zh, /perplexitySonarNote: "目前支援 Perplexity Sonar 系列模型。",/);
  // Shown before any refresh, and again after one — so "Refresh Model List"
  // never reads as a promise to enumerate the whole Perplexity platform.
  assert.match(appJs, /if \(id === "perplexity"\) note\.textContent = str\("perplexitySonarNote"\);/);
  assert.match(appJs, /const scope = id === "perplexity" \? ` — \$\{str\("perplexitySonarNote"\)\}` : "";/);
});

test("no Agent API and no xAI provider came with this change", async () => {
  const sources = await Promise.all([
    readSource("../src/providers/perplexity.js"),
    readSource("../src/providers/openai-compat.js"),
    readSource("../src/providers/index.js"),
    readSource("../src/config.js"),
    readSource("../src/config/supported-models.js"),
  ]);
  // Comments are stripped first: these files DOCUMENT the Agent API and the
  // xAI ids precisely so a future reader knows they were considered and
  // excluded. What must not exist is code that reaches them.
  const codeOnly = (src) =>
    src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  for (const src of sources) {
    const code = codeOnly(src);
    // No Agent transport, discovery or parser.
    assert.doesNotMatch(code, /\/v1\/agent|\/v1\/responses|max_output_tokens/);
    // No xAI provider.
    assert.doesNotMatch(code, /\bxai\b|x\.ai|grok/i);
  }
  // The provider's executable code names exactly one host, and no endpoint
  // path of its own — the transport lives in openai-compat.
  const urls = [...codeOnly(sources[0]).matchAll(/https:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(urls)], ["https://api.perplexity.ai"]);
  // The provider registry still has exactly the five known providers.
  const { PROVIDER_DEFS: defs } = await import("../src/config.js");
  assert.deepEqual(defs.map((d) => d.id), ["openai", "anthropic", "google", "perplexity", "deepseek"]);
});

test("other providers' discovery behaviour is untouched", async () => {
  const compat = await readSource("../src/providers/openai-compat.js");
  // Only Perplexity declares a static catalog.
  for (const rel of ["../src/providers/openai.js", "../src/providers/deepseek.js"]) {
    assert.doesNotMatch(await readSource(rel), /staticModels/);
  }
  // The fallback-after-404 path still exists for providers that do have an
  // endpoint which may be unavailable on some accounts.
  assert.match(compat, /if \(\(res\.status === 404 \|\| res\.status === 405\) && fallbackModels\.length > 0\) \{/);
  // Anthropic and Google keep their own dedicated discovery implementations.
  assert.match(await readSource("../src/providers/anthropic.js"), /https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.match(await readSource("../src/providers/google.js"), /generativelanguage\.googleapis\.com/);
});

test("the API key never reaches a catalog, a log or an error message", async () => {
  const providerSrc = await readSource("../src/providers/perplexity.js");
  const compat = await readSource("../src/providers/openai-compat.js");
  for (const src of [providerSrc, compat]) {
    assert.doesNotMatch(src, /console\.(log|error|warn)\([^)]*apiKey/);
    assert.doesNotMatch(src, /\$\{apiKey\}[^`]*`\s*\)/);
  }
  // The key is only ever read from config and used as a Bearer header — it
  // is never interpolated into a URL, a request body, a thrown message or a
  // log line.
  assert.match(compat, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.doesNotMatch(compat, /httpError\([^)]*apiKey|new Error\([^)]*apiKey/);
  assert.doesNotMatch(compat, /body: JSON\.stringify\(\{[^}]*apiKey/);
  assert.doesNotMatch(compat, /baseUrl\}[^`]*\$\{apiKey\}/);
});
