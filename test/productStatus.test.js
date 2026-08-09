// AI / Product Status (Batch A) — behavioral coverage of the ONE shared
// status representation (src/services/productStatus.js) that both the Core
// Book modal and the Product Status view render from, plus wiring guards for
// the two guarantees that matter most and have no DOM available to test here:
// opening either UI performs no provider API call, and no secret ever
// reaches the browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  providerStatusList,
  councilAssignments,
  modelCheckStatus,
  vaultStatus,
  buildProductStatus,
  MODEL_CHECK,
} from "../src/services/productStatus.js";

const provider = (o = {}) => ({ label: "OpenAI", configured: false, enabled: false, model: "gpt-5.1", ...o });

// --------------------------------------------------------------- providers

test("no providers configured: every provider reports not-configured and not-ready", () => {
  const list = providerStatusList({
    providers: {
      openai: provider({ label: "OpenAI" }),
      anthropic: provider({ label: "Anthropic" }),
      google: provider({ label: "Google" }),
    },
  });
  assert.equal(list.length, 3);
  assert.ok(list.every((p) => p.configured === false && p.ready === false));
});

test("one provider configured: only that one reports configured", () => {
  const list = providerStatusList({
    providers: {
      openai: provider({ label: "OpenAI", configured: true, enabled: true }),
      anthropic: provider({ label: "Anthropic" }),
      google: provider({ label: "Google" }),
    },
  });
  assert.deepEqual(
    list.map((p) => [p.id, p.configured]),
    [["openai", true], ["anthropic", false], ["google", false]]
  );
  assert.equal(list.find((p) => p.id === "openai").ready, true);
});

test("multiple providers configured: each is reported independently", () => {
  const list = providerStatusList({
    providers: {
      openai: provider({ configured: true, enabled: true }),
      anthropic: provider({ label: "Anthropic", configured: true, enabled: true }),
      google: provider({ label: "Google" }),
    },
  });
  assert.equal(list.filter((p) => p.configured).length, 2);
});

test("configured-but-disabled stays configured:true — credentials existing is a separate fact from being switched on", () => {
  const [p] = providerStatusList({ providers: { openai: provider({ configured: true, enabled: false }) } });
  assert.equal(p.configured, true, "a key IS present; reporting otherwise would misstate credential state");
  assert.equal(p.enabled, false);
  assert.equal(p.ready, false, "…but it cannot start a session");
});

test("providerStatusList never surfaces an apiKey even if one were present on the input", () => {
  const [p] = providerStatusList({ providers: { openai: { ...provider({ configured: true }), apiKey: "sk-SECRET" } } });
  assert.ok(!("apiKey" in p));
  assert.ok(!JSON.stringify(p).includes("SECRET"));
});

// ----------------------------------------------------------------- council

const councilCfg = {
  judgeProvider: "openai",
  judgeModel: "gpt-5.4-mini",
  providers: {
    openai: provider({ label: "OpenAI", configured: true, enabled: true }),
    google: provider({ label: "Google", configured: true, enabled: true }),
  },
  scholarSlots: [
    { slot: 1, provider: "openai", model: "gpt-5.1", enabled: true, configured: true, providerEnabled: true, ready: true },
    { slot: 2, provider: "openai", model: "gpt-5.4-mini", enabled: true, configured: true, providerEnabled: true, ready: true },
    { slot: 3, provider: "google", model: "gemini-3.1-flash-lite", enabled: true, configured: true, providerEnabled: true, ready: true },
  ],
};

test("Council does NOT require three distinct providers — several slots may share one and all stay ready", () => {
  const c = councilAssignments(councilCfg);
  const usedProviders = new Set(c.scholars.map((s) => s.provider));
  assert.equal(usedProviders.size, 2, "two providers cover three slots");
  assert.ok(c.scholars.every((s) => s.ready), "sharing a provider must never mark a slot unready");
});

test("Council reports Grand Sage + all three Scholar slots with resolved provider/model", () => {
  const c = councilAssignments(councilCfg);
  assert.equal(c.judge.provider, "openai");
  assert.equal(c.judge.model, "gpt-5.4-mini");
  assert.equal(c.judge.ready, true);
  assert.deepEqual(c.scholars.map((s) => s.slot), [1, 2, 3]);
  assert.deepEqual(c.scholars.map((s) => s.model), ["gpt-5.1", "gpt-5.4-mini", "gemini-3.1-flash-lite"]);
});

test("Grand Sage falls back to the judge provider's own model when no explicit judgeModel is set", () => {
  const c = councilAssignments({ ...councilCfg, judgeModel: "" });
  assert.equal(c.judge.model, "gpt-5.1", "the provider's configured model stands in");
});

test("an unconfigured slot provider makes that slot not-ready without affecting the others", () => {
  const c = councilAssignments({
    ...councilCfg,
    providers: { ...councilCfg.providers, google: provider({ label: "Google", configured: false, enabled: false }) },
    scholarSlots: [
      ...councilCfg.scholarSlots.slice(0, 2),
      { slot: 3, provider: "google", model: "x", enabled: true, configured: false, providerEnabled: false, ready: false },
    ],
  });
  assert.deepEqual(c.scholars.map((s) => s.ready), [true, true, false]);
});

// ------------------------------------------------------------ model check

test("pre-check never run: no acknowledgement persisted -> Not checked", () => {
  assert.equal(modelCheckStatus({ ackSignature: "", currentSignature: "sig-A" }).state, MODEL_CHECK.NOT_CHECKED);
});

test("successful pre-check observed THIS session -> Passed (the precise, session-scoped outcome)", () => {
  const s = modelCheckStatus({
    ackSignature: "sig-A",
    currentSignature: "sig-A",
    observed: { signature: "sig-A", result: "passed" },
  });
  assert.equal(s.state, MODEL_CHECK.PASSED);
  assert.equal(s.fromSession, true);
});

test("failed pre-check observed THIS session -> Failed, even though a failure persists nothing", () => {
  const s = modelCheckStatus({
    ackSignature: "", // a failed check deliberately never acknowledges
    currentSignature: "sig-A",
    observed: { signature: "sig-A", result: "failed" },
  });
  assert.equal(s.state, MODEL_CHECK.FAILED);
  assert.equal(s.fromSession, true);
});

test("acknowledged for exactly this configuration, with nothing observed this session -> Acknowledged, NOT Passed", () => {
  // This is the honest limit of the persisted data: the same signature is
  // written both by a passing check AND by an informed "Start Without
  // Checking", so after a reload it cannot be reported as verified.
  const s = modelCheckStatus({ ackSignature: "sig-A", currentSignature: "sig-A", observed: null });
  assert.equal(s.state, MODEL_CHECK.ACKNOWLEDGED);
  assert.equal(s.fromSession, false);
});

test("configuration changed since it was acknowledged -> Needs re-check", () => {
  assert.equal(
    modelCheckStatus({ ackSignature: "sig-A", currentSignature: "sig-B" }).state,
    MODEL_CHECK.NEEDS_RECHECK
  );
});

test("a session-observed result is discarded once the configuration changes — a pass never carries over to a different model", () => {
  const s = modelCheckStatus({
    ackSignature: "sig-A",
    currentSignature: "sig-B",
    observed: { signature: "sig-A", result: "passed" },
  });
  assert.equal(s.state, MODEL_CHECK.NEEDS_RECHECK);
  assert.equal(s.fromSession, false);
});

test("a stale FAILED observation likewise does not leak onto a newly changed configuration", () => {
  const s = modelCheckStatus({
    ackSignature: "",
    currentSignature: "sig-B",
    observed: { signature: "sig-A", result: "failed" },
  });
  assert.equal(s.state, MODEL_CHECK.NOT_CHECKED);
});

// ------------------------------------------------------------------ vault

test("Vault connected reports configured + exists + path", () => {
  const v = vaultStatus({ configured: true, exists: true, path: "D:/vault" });
  assert.deepEqual(v, { configured: true, exists: true, path: "D:/vault" });
});

test("Vault unconfigured reports not connected and an empty path", () => {
  assert.deepEqual(vaultStatus({}), { configured: false, exists: false, path: "" });
});

test("Vault configured but folder missing is distinguishable from not-configured", () => {
  const v = vaultStatus({ configured: true, exists: false, path: "D:/gone" });
  assert.equal(v.configured, true);
  assert.equal(v.exists, false);
});

// -------------------------------------------------------------- aggregate

test("buildProductStatus assembles every section from one call, and tolerates a completely empty input", () => {
  const s = buildProductStatus({});
  assert.deepEqual(s.providers, []);
  assert.deepEqual(s.council.scholars, []);
  assert.equal(s.modelCheck.state, MODEL_CHECK.NOT_CHECKED);
  assert.equal(s.vault.configured, false);
  assert.equal(s.autoCheck, false);
});

test("buildProductStatus end-to-end on a realistic config", () => {
  const s = buildProductStatus({
    config: { ...councilCfg, councilAckSignature: "sig-A", councilAutoCheck: true },
    vault: { configured: true, exists: true, path: "D:/vault" },
    currentSignature: "sig-A",
  });
  assert.equal(s.providers.filter((p) => p.configured).length, 2);
  assert.equal(s.council.scholars.length, 3);
  assert.equal(s.modelCheck.state, MODEL_CHECK.ACKNOWLEDGED);
  assert.equal(s.autoCheck, true);
  assert.equal(s.vault.path, "D:/vault");
});

test("the whole aggregate is serializable without leaking a secret", () => {
  const s = buildProductStatus({
    config: {
      ...councilCfg,
      providers: { openai: { ...provider({ configured: true, enabled: true }), apiKey: "sk-LEAK" } },
    },
    vault: {},
  });
  assert.ok(!JSON.stringify(s).includes("sk-LEAK"));
});

// ------------------------------------------------- no-API-call / no-secret

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
const moduleSrc = fs.readFileSync(path.join(process.cwd(), "src", "services", "productStatus.js"), "utf8");
const configJs = fs.readFileSync(path.join(process.cwd(), "src", "config.js"), "utf8");

function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

test("the status module itself performs no I/O of any kind", () => {
  assert.doesNotMatch(moduleSrc, /\bfetch\(|XMLHttpRequest|require\(|import\s+.*from\s+["']node:/);
});

test("opening the Core Book renders status from already-fetched config — no fetch, and no pre-check is started", () => {
  const open = extractFn(appJs, "function openModeModal()");
  assert.match(open, /renderCoreBookAiStatus\(\)/);
  assert.doesNotMatch(open, /fetch\(|runCouncilPrecheck|runCouncilConfigGate|runPrecheckAndProceed/);
  const render = extractFn(appJs, "function renderCoreBookAiStatus()");
  assert.doesNotMatch(render, /fetch\(|runCouncilPrecheck|await /);
});

test("opening Product Status likewise performs no request and starts no check", () => {
  const open = extractFn(appJs, "function openProductStatus()");
  assert.doesNotMatch(open, /fetch\(|runCouncilPrecheck|await /);
  const render = extractFn(appJs, "function renderProductStatus()");
  assert.doesNotMatch(render, /fetch\(|runCouncilPrecheck|await /);
});

test("publicConfig sends only a boolean `configured` and a non-secret fingerprint — never an API key", () => {
  const fn = extractFn(configJs, "export function publicConfig()");
  assert.match(fn, /configured: Boolean\(p\.apiKey\)/, "presence is reduced to a boolean");
  assert.match(fn, /keyFingerprint: keyFingerprint\(p\.apiKey\)/);
  // The raw key must never be assigned onto the wire payload.
  assert.doesNotMatch(fn, /apiKey:\s*p\.apiKey|apiKey:\s*config\./);
});

test("the send-time pre-check gate is untouched by Batch A — status display never weakened it", () => {
  const gate = extractFn(appJs, "async function runCouncilConfigGate(slots)");
  assert.match(gate, /runPrecheckAndProceed\(slots, signature/);
  assert.match(gate, /councilAckSignature === signature/, "the unchanged-config fast path still exists");
  assert.match(gate, /confirmCouncilCheckDialog\(\)/, "the notice still interrupts an unacknowledged config");
});

test("a failed check still acknowledges nothing — Batch A only records the outcome for display", () => {
  const fn = extractFn(appJs, "async function runPrecheckAndProceed(slots, signature");
  const failTail = fn.slice(fn.indexOf("noteModelCheckObserved(signature, \"failed\")"));
  assert.doesNotMatch(failTail, /persistCouncilAck/, "the failure path must never persist an acknowledgement");
});
