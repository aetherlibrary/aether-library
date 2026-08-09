// Regression coverage for the "manual check validated the SAVED
// configuration instead of the unsaved Settings form values" bug.
//
// Root cause: runManualCouncilCheck() (public/app.js) called
// runCouncilPrecheck() with no arguments, so POST /api/council/precheck's
// body carried nothing but an optional `scholars` slot-number list —
// precheckCouncil() (src/services/council.js) always read
// config.scholarSlots/judgeProvider/judgeModel (the SAVED runtime config)
// for every participant's provider/model, with no way to say "check THIS
// provider/model instead." A player who changed the Grand Sage/Scholar
// dropdown in Settings without saving would have that change silently
// ignored — the button would report success for the OLD saved model.
//
// Fix: precheckCouncil(requestedScholars, overrides) — overrides (see its
// own comment) lets a caller supply an EXPLICIT judge/scholar provider+
// model+enabled configuration to check instead. The Send-flow gate never
// passes it (byte-for-byte unchanged, covered by the "no overrides" test
// below); only Settings' manual check does, built from the live form's `sx`
// DOM refs (public/app.js's currentSettingsFormOverrides() — pure DOM
// reads, not unit-testable without a DOM environment this project doesn't
// have, so that specific plumbing was verified live in the browser: real
// POST body captured via a monkey-patched window.fetch, confirmed to carry
// the UNSAVED dropdown value; Settings dialog observed to stay open/
// unsaved throughout; councilAckSignature observed unchanged after a
// mismatched check, and correctly refreshed after a matching one).
//
// What IS fully backend-testable, and is asserted here precisely per the
// requested scenario (saved Grand Sage = gpt-5.4-mini, unsaved form value
// = gpt-5.5-pro): the request actually checks the override model and NOT
// the saved one, the result corresponds to the override model, and
// precheckCouncil() itself never mutates the runtime config or
// councilAckSignature as a side effect either way (the acknowledgment
// decision belongs entirely to the caller, never to this function).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let council;
let providers;
let config;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-council-manual-unsaved-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(
    process.env.ENV_FILE_PATH,
    [
      "JUDGE_PROVIDER=openai",
      "JUDGE_MODEL=gpt-5.4-mini",
      "SCHOLAR1_PROVIDER=openai",
      "SCHOLAR1_MODEL=gpt-5.4-mini",
      "SCHOLAR2_PROVIDER=anthropic",
      "SCHOLAR2_MODEL=claude-sonnet-4-5",
      "SCHOLAR3_PROVIDER=google",
      "SCHOLAR3_MODEL=gemini-2.5-pro",
      "",
    ].join("\n"),
    "utf8"
  );
  ({ providers } = await import("../src/providers/index.js"));
  council = await import("../src/services/council.js");
  config = await import("../src/config.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  for (const id of ["openai", "anthropic", "google"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = async () => "OK";
  }
});

test("Grand Sage: saved=gpt-5.4-mini, unsaved form=gpt-5.5-pro — the check tests gpt-5.5-pro, not the saved model", async () => {
  const seenModels = [];
  providers.openai.complete = async ({ model }) => {
    seenModels.push(model);
    if (model === "gpt-5.5-pro") throw Object.assign(new Error("OpenAI API 404: model not found"), { status: 404 });
    return "OK";
  };

  const beforeConfig = config.publicConfig();
  assert.equal(beforeConfig.judgeModel, "gpt-5.4-mini"); // sanity: fixture really is saved as gpt-5.4-mini

  const overrides = {
    judgeProvider: "openai",
    judgeModel: "gpt-5.5-pro", // the UNSAVED Settings form value
    scholarSlots: [
      { slot: 1, provider: "openai", model: "gpt-5.4-mini", enabled: true },
      { slot: 2, provider: "anthropic", model: "claude-sonnet-4-5", enabled: true },
      { slot: 3, provider: "google", model: "gemini-2.5-pro", enabled: true },
    ],
  };
  const result = await council.precheckCouncil(undefined, overrides);

  // request checks gpt-5.5-pro
  assert.ok(seenModels.includes("gpt-5.5-pro"), "the override model must actually be requested");
  const judgeResult = result.results.find((r) => r.role === "judge");
  assert.equal(judgeResult.model, "gpt-5.5-pro");
  // request does NOT check gpt-5.4-mini as Grand Sage specifically (scholar1
  // legitimately also uses gpt-5.4-mini in this fixture — assert on the
  // judge role's own result, not just "was it ever requested at all").
  assert.notEqual(judgeResult.model, "gpt-5.4-mini");

  // success/failure result corresponds to gpt-5.5-pro (stubbed to fail)
  assert.equal(judgeResult.ok, false);
  assert.equal(judgeResult.category, "MODEL_UNAVAILABLE");
  assert.equal(result.ok, false);

  // runtime config remains gpt-5.4-mini — Settings were never saved, and
  // precheckCouncil() itself has no code path that could mutate config.
  const afterConfig = config.publicConfig();
  assert.equal(afterConfig.judgeModel, "gpt-5.4-mini");
  assert.equal(afterConfig.judgeProvider, beforeConfig.judgeProvider);

  // councilAckSignature is NOT incorrectly updated for the saved
  // configuration (precheckCouncil() never writes it either way — the
  // caller decides whether to acknowledge, and only does so when the
  // checked configuration matches the saved one, verified live in-browser).
  assert.equal(afterConfig.councilAckSignature, beforeConfig.councilAckSignature);
});

test("Scholar slot: saved=claude-sonnet-4-5, unsaved form=a different model — the check tests the unsaved model, not the saved one", async () => {
  const seenModels = [];
  providers.anthropic.complete = async ({ model }) => {
    seenModels.push(model);
    if (model === "claude-bogus-unsaved-model") throw Object.assign(new Error("Anthropic API 404: model not found"), { status: 404 });
    return "OK";
  };

  const beforeConfig = config.publicConfig();
  assert.equal(beforeConfig.scholarSlots.find((s) => s.slot === 2).model, "claude-sonnet-4-5");

  const overrides = {
    judgeProvider: "openai",
    judgeModel: "gpt-5.4-mini",
    scholarSlots: [
      { slot: 1, provider: "openai", model: "gpt-5.4-mini", enabled: true },
      { slot: 2, provider: "anthropic", model: "claude-bogus-unsaved-model", enabled: true }, // unsaved
      { slot: 3, provider: "google", model: "gemini-2.5-pro", enabled: true },
    ],
  };
  const result = await council.precheckCouncil(undefined, overrides);

  assert.ok(seenModels.includes("claude-bogus-unsaved-model"));
  const scholar2 = result.results.find((r) => r.role === "scholar2");
  assert.equal(scholar2.model, "claude-bogus-unsaved-model");
  assert.notEqual(scholar2.model, "claude-sonnet-4-5");
  assert.equal(scholar2.ok, false);
  assert.equal(scholar2.category, "MODEL_UNAVAILABLE");
  assert.equal(result.ok, false);

  const afterConfig = config.publicConfig();
  assert.equal(afterConfig.scholarSlots.find((s) => s.slot === 2).model, "claude-sonnet-4-5");
  assert.equal(afterConfig.councilAckSignature, beforeConfig.councilAckSignature);
});

test("the Send-flow gate's own call shape (no overrides argument at all) is byte-for-byte unaffected by the overrides feature existing", async () => {
  const result = await council.precheckCouncil();
  const judgeResult = result.results.find((r) => r.role === "judge");
  assert.equal(judgeResult.model, "gpt-5.4-mini"); // still the saved config, exactly as before this fix
  assert.equal(result.ok, true);
});

test("a matching override (identical to the saved configuration) checks the same model as the default (no-overrides) call", async () => {
  const matching = {
    judgeProvider: "openai",
    judgeModel: "gpt-5.4-mini",
    scholarSlots: [
      { slot: 1, provider: "openai", model: "gpt-5.4-mini", enabled: true },
      { slot: 2, provider: "anthropic", model: "claude-sonnet-4-5", enabled: true },
      { slot: 3, provider: "google", model: "gemini-2.5-pro", enabled: true },
    ],
  };
  const withOverrides = await council.precheckCouncil(undefined, matching);
  const withoutOverrides = await council.precheckCouncil();
  assert.deepEqual(
    withOverrides.results.map((r) => ({ role: r.role, provider: r.provider, model: r.model })),
    withoutOverrides.results.map((r) => ({ role: r.role, provider: r.provider, model: r.model }))
  );
});
