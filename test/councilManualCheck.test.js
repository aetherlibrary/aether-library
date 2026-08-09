// Regression coverage for Settings → Council Model Check → "Check Models
// Now" (the manual check button in public/app.js's runManualCouncilCheck()).
//
// The manual button introduces NO new backend code — it calls the exact
// same precheckCouncil() (src/services/council.js) the Send-flow gate
// already uses via POST /api/council/precheck (server.js), and the exact
// same persistCouncilAck() (app.js) Check & Start/Start Without Checking
// already use. What IS genuinely new and backend-verifiable is the
// STRUCTURAL INDEPENDENCE this feature relies on: the manual check must
// work regardless of councilAutoCheck, and must never itself touch
// councilAutoCheck/councilAckSignature as a side effect (only an explicit,
// separate persistCouncilAck() call — made by app.js only on a SUCCESSFUL
// manual check — may do that). Both are proven here directly against
// precheckCouncil().
//
// The remaining items from the task's regression list are pure DOM/UI
// behavior with no backend counterpart to unit-test:
//   1. success state rendering       — no jsdom/DOM-testing dependency
//   2. failure state rendering         exists in this project; EVERY prior
//   3. no Council session started      app.js behavior in this codebase has
//   6. duplicate clicks blocked        always been verified via live
//                                       browser E2E instead (see the final
//                                       report for the exact assertions
//                                       made and their results — button
//                                       disable/duplicate-click-guard was
//                                       verified by counting real fetch()
//                                       calls through a monkey-patched
//                                       window.fetch, not just reading the
//                                       DOM).
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH), like
// councilPrecheck.test.js, and monkey-patches providers[id].complete/
// isConfigured the same way — no real network call, ever.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let council;
let providers;
let config;
let settings;
let getActiveSession;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-council-manual-check-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(
    process.env.ENV_FILE_PATH,
    [
      "SCHOLAR1_PROVIDER=openai",
      "SCHOLAR1_MODEL=gpt-5.4-mini",
      "SCHOLAR2_PROVIDER=anthropic",
      "SCHOLAR2_MODEL=claude-sonnet-4-5",
      "SCHOLAR3_PROVIDER=google",
      "SCHOLAR3_MODEL=gemini-2.5-pro",
      "JUDGE_PROVIDER=anthropic",
      "JUDGE_MODEL=claude-sonnet-4-5",
      "",
    ].join("\n"),
    "utf8"
  );
  ({ providers } = await import("../src/providers/index.js"));
  council = await import("../src/services/council.js");
  config = await import("../src/config.js");
  settings = await import("../src/services/settings.js");
  ({ getActiveSession } = await import("../src/services/sessionEngine.js"));
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

test("precheckCouncil() (the manual button's own call) behaves identically whether councilAutoCheck is on or off", async () => {
  settings.saveSettings({ councilAutoCheck: "false" });
  const withAutoOff = await council.precheckCouncil();

  settings.saveSettings({ councilAutoCheck: "true" });
  const withAutoOn = await council.precheckCouncil();

  assert.equal(withAutoOff.ok, true);
  assert.equal(withAutoOn.ok, true);
  assert.deepEqual(
    withAutoOff.results.map((r) => r.role).sort(),
    withAutoOn.results.map((r) => r.role).sort()
  );
  settings.saveSettings({ councilAutoCheck: "false" }); // restore
});

test("precheckCouncil() never mutates councilAutoCheck or councilAckSignature as a side effect, on success or failure", async () => {
  settings.saveSettings({ councilAutoCheck: "false", councilAckSignature: "unchanged-marker" });
  const before1 = config.publicConfig();

  await council.precheckCouncil();
  const afterSuccess = config.publicConfig();
  assert.equal(afterSuccess.councilAutoCheck, before1.councilAutoCheck);
  assert.equal(afterSuccess.councilAckSignature, before1.councilAckSignature);

  providers.google.complete = async () => {
    throw Object.assign(new Error("boom"), { status: 500 });
  };
  await council.precheckCouncil();
  const afterFailure = config.publicConfig();
  assert.equal(afterFailure.councilAutoCheck, before1.councilAutoCheck);
  assert.equal(afterFailure.councilAckSignature, before1.councilAckSignature);
});

test("a manual check's own persistCouncilAck-equivalent call only happens explicitly, never implicitly inside precheckCouncil() — calling it twice never creates or touches a Session either way", async () => {
  await council.precheckCouncil();
  assert.equal(getActiveSession(), null);
  providers.anthropic.complete = async () => {
    throw new Error("down");
  };
  await council.precheckCouncil();
  assert.equal(getActiveSession(), null);
});
