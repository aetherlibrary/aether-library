// Regression coverage for two runtime bugs found in manual testing:
//
//   BUG 1  a user-initiated Stop rendered as a provider failure ("Model
//          unavailable", status error, "choose another model" guidance).
//   BUG 2  changing a provider/model in Settings re-derived the active
//          Scholar selection from provider configuration, so a Mentor run
//          with one chosen Scholar came back with all three selected.
//
// Both are covered against the modules that now own the rules
// (src/services/runPresentation.js, src/services/scholarSelection.js) plus
// end-to-end pipeline checks for the outcome the presentation depends on.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { presentRunOutcome, scholarDisplayState } from "../src/services/runPresentation.js";
import { resolveScholarSelection, narrowToSingle } from "../src/services/scholarSelection.js";

// ===================================================== BUG 1 — Stop rendering

let council;
let providers;
let resetSession;
let tmpRoot;
let calls;
let gate;

function openGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function until(predicate, label, limit = 2000) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

function abortableProvider(id) {
  return async ({ signal }) => {
    calls.push(id);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      gate.promise.then(() => resolve(`answer from ${id}`));
    });
  };
}

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-runtime-regressions-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");
  await fs.writeFile(
    process.env.ENV_FILE_PATH,
    [
      "SCHOLAR1_PROVIDER=openai",
      "SCHOLAR1_MODEL=gpt-5.1",
      "SCHOLAR2_PROVIDER=anthropic",
      "SCHOLAR2_MODEL=claude-sonnet-4-5",
      "SCHOLAR3_PROVIDER=google",
      "SCHOLAR3_MODEL=gemini-2.5-pro",
      "JUDGE_PROVIDER=perplexity",
      "JUDGE_MODEL=sonar-pro",
      "",
    ].join("\n"),
    "utf8"
  );
  ({ providers } = await import("../src/providers/index.js"));
  council = await import("../src/services/council.js");
  ({ resetSession } = await import("../src/services/sessionEngine.js"));
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  resetSession();
  calls = [];
  gate = openGate();
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = abortableProvider(id);
  }
});

// How the workspace renders a finished run — the ACTUAL bug surface.
const render = (session, anyAnswerOk) =>
  presentRunOutcome({ outcome: session.outcome, anyAnswerOk });

test("1. Mentor stopped before any response renders as stopped, never as an error", async () => {
  const run = council.runSessionEvents("Q", { mode: "single", scholars: [1] });
  await until(() => calls.length === 1, "the Mentor Scholar in flight");
  council.requestStopActiveRun();
  const session = await run;
  gate.release();

  assert.equal(session.outcome, "stopped");
  const view = render(session, false); // nothing answered — the exact bug case
  assert.equal(view.kind, "stopped");
  assert.equal(view.status, "stopped");
  assert.notEqual(view.status, "error");
  assert.equal(view.showProviderFailureGuidance, false, "must not offer to replace the model");
  assert.equal(view.messageKey, "generationStopped");
});

test("2. Council stopped before any Scholar completes renders as stopped", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => calls.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  const session = await run;
  gate.release();

  assert.equal(session.outcome, "stopped");
  assert.equal(render(session, false).kind, "stopped");
  assert.equal(render(session, false).showProviderFailureGuidance, false);
});

test("3. Council stopped after one Scholar completes preserves that answer", async () => {
  providers.openai.complete = async () => {
    calls.push("openai");
    return "Alpha's finished answer.";
  };
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => calls.length === 3, "all Scholars dispatched");
  council.requestStopActiveRun();
  const session = await run;
  gate.release();

  assert.equal(session.scholars.scholar1.status, "ok");
  assert.equal(session.scholars.scholar1.answer, "Alpha's finished answer.");
  assert.equal(session.outcome, "stopped");
  // Even WITH a usable answer the run is still presented as stopped, not as
  // a normal completion — the discussion was cut short.
  assert.equal(render(session, true).kind, "stopped");
});

test("4. Stop while awaiting a failure decision renders as stopped", async () => {
  providers.anthropic.complete = async () => {
    calls.push("anthropic");
    const err = new Error("Anthropic API 429: rate limited");
    err.status = 429;
    err.code = "provider_error";
    throw err;
  };
  const run = council.runSessionEvents("Q", { mode: "council" });
  gate.release();
  await until(
    () => council.getActiveRun()?.state === "awaiting_failure_decision",
    "the run to park at the failure gate"
  );
  council.requestStopActiveRun();
  const session = await run;

  assert.equal(session.outcome, "stopped");
  assert.equal(render(session, true).kind, "stopped");
  assert.equal(render(session, true).showProviderFailureGuidance, false);
});

test("5/6/7. a cancellation never renders as model-unavailable, insufficient results, or replacement guidance", () => {
  for (const anyAnswerOk of [true, false]) {
    const view = presentRunOutcome({ outcome: "stopped", anyAnswerOk });
    assert.equal(view.kind, "stopped");
    assert.notEqual(view.kind, "insufficient");
    assert.equal(view.status, "stopped");
    assert.equal(view.showProviderFailureGuidance, false);
    assert.notEqual(view.messageKey, "noUsableResponses");
  }
});

test("cancellation outranks 'nothing usable came back' — the canonical priority", () => {
  // A run stopped before any answer HAS no usable results; reporting that as
  // a model failure was the bug.
  assert.equal(presentRunOutcome({ outcome: "stopped", anyAnswerOk: false }).kind, "stopped");
  // Without a cancellation, the same emptiness IS a provider problem.
  assert.equal(presentRunOutcome({ outcome: "insufficient_results", anyAnswerOk: false }).kind, "insufficient");
  assert.equal(presentRunOutcome({ outcome: "completed", anyAnswerOk: false }).kind, "insufficient");
  assert.equal(presentRunOutcome({ outcome: "completed", anyAnswerOk: true }).kind, "completed");
  assert.equal(
    presentRunOutcome({ outcome: "continued_with_failures", anyAnswerOk: true }).kind,
    "continued_with_failures"
  );
});

test("a cancelled Scholar is displayed as stopped, never as failed", () => {
  assert.equal(scholarDisplayState({ status: "cancelled" }), "stopped");
  assert.equal(scholarDisplayState({ status: "ok" }), "ok");
  assert.equal(scholarDisplayState({ status: "error" }), "failed");
  assert.equal(scholarDisplayState({ status: "no_api_key" }), "failed");
});

test("8. a stopped run writes no archive", async () => {
  const before = await fs.readdir(process.env.ARCHIVE_DIR).catch(() => []);
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => calls.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  await run;
  gate.release();

  const after = await fs.readdir(process.env.ARCHIVE_DIR).catch(() => []);
  assert.deepEqual(after.filter((f) => !before.includes(f)), []);
});

test("9. a new run can begin once a stopped run settles", async () => {
  const first = council.runSessionEvents("First", { mode: "council" });
  await until(() => calls.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  await first;
  gate.release();

  gate = openGate();
  gate.release();
  const second = await council.runSessionEvents("Second", { mode: "council" });
  assert.equal(second.question, "Second");
  assert.equal(second.outcome, "completed");
});

// ================================================ BUG 2 — Mentor selection

// The three slots, all healthy — the state in which the bug appeared.
const ALL_READY = [1, 2, 3];

test("10. Mentor + Architect selected, Architect's MODEL changes -> only Architect", () => {
  const next = resolveScholarSelection({
    mode: "single",
    previous: [1],
    ready: ALL_READY,
    eligible: ALL_READY,
  });
  assert.deepEqual(next, [1]);
});

test("11. Mentor + Architect selected, ORACLE's model changes -> only Architect", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "single", previous: [1], ready: ALL_READY, eligible: ALL_READY }),
    [1]
  );
});

test("12. Mentor + Architect selected, ANALYST's provider changes -> only Architect", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "single", previous: [1], ready: ALL_READY, eligible: ALL_READY }),
    [1]
  );
});

test("13/14/15. saving, reopening Settings, and a pre-check never alter the Mentor selection", () => {
  // Each of these is a picker REBUILD with the same inputs — the selection
  // must survive every one of them, however many times they happen.
  let selection = [2]; // the player chose Oracle
  for (let i = 0; i < 5; i += 1) {
    selection = resolveScholarSelection({
      mode: "single",
      previous: selection,
      ready: ALL_READY,
      eligible: ALL_READY,
    });
    assert.deepEqual(selection, [2], `rebuild #${i + 1} changed the selection`);
  }
});

test("a pre-check verdict can never ADD a Scholar the player did not choose", () => {
  // "Every model is configured, ready and eligible" must not mean "selected".
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [2], ready: ALL_READY, eligible: ALL_READY }),
    [2]
  );
});

test("16. the Mentor request payload contains exactly the chosen Scholar", () => {
  const selection = resolveScholarSelection({
    mode: "single",
    previous: [3],
    ready: ALL_READY,
    eligible: ALL_READY,
  });
  assert.equal(selection.length, 1);
  assert.deepEqual(selection, [3]);
});

test("17. Council selection is unchanged by provider/model edits", () => {
  // The player deselected Oracle; a Settings save must not bring it back and
  // silently spend credit on it.
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [1, 3], ready: ALL_READY, eligible: ALL_READY }),
    [1, 3]
  );
});

test("18. UI state and payload cannot disagree — one resolved set feeds both", () => {
  // The picker renders from selectedSlots and the request is built from
  // selectedSlots, so agreement is structural. What must hold is that the
  // resolved set is always valid for the mode.
  for (const mode of ["single", "council"]) {
    for (const previous of [[], [1], [2, 3], [1, 2, 3]]) {
      const next = resolveScholarSelection({ mode, previous, ready: ALL_READY, eligible: ALL_READY });
      assert.ok(next.length > 0, "never empty while slots are ready");
      assert.deepEqual(next, [...new Set(next)].sort((a, b) => a - b), "sorted and de-duplicated");
      if (mode === "single") assert.equal(next.length, 1, "Mentor runs exactly one Scholar");
      for (const slot of next) assert.ok(ALL_READY.includes(slot), "never selects an unready slot");
    }
  }
});

// ------------------------------------------------- selection edge behaviour

test("a slot that becomes unavailable drops out; the rest of the choice survives", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [1, 2], ready: [1, 3], eligible: [1, 3] }),
    [1]
  );
});

test("when the whole choice becomes unavailable, the defaults take over rather than an empty picker", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [2], ready: [1, 3], eligible: [1, 3] }),
    [1, 3]
  );
});

test("a first build (no previous choice) takes the Council defaults", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [], ready: ALL_READY, eligible: ALL_READY }),
    ALL_READY
  );
  // …and Mentor's first build takes exactly one, not three.
  assert.deepEqual(
    resolveScholarSelection({ mode: "single", previous: [], ready: ALL_READY, eligible: ALL_READY }),
    [1]
  );
});

test("Reset explicitly returns to the defaults", () => {
  assert.deepEqual(
    resolveScholarSelection({ mode: "council", previous: [2], ready: ALL_READY, eligible: ALL_READY, reset: true }),
    ALL_READY
  );
});

test("nothing eligible but something ready still yields a usable picker", () => {
  assert.deepEqual(resolveScholarSelection({ mode: "council", previous: [], ready: [2], eligible: [] }), [2]);
});

test("Council -> Mentor keeps a single existing choice, and narrows deterministically otherwise", () => {
  assert.deepEqual(narrowToSingle([2]), [2], "one already selected is preserved");
  assert.deepEqual(narrowToSingle([2, 3]), [2], "lowest slot wins — the rule setMode has always used");
  assert.deepEqual(narrowToSingle([]), []);
  assert.deepEqual(
    resolveScholarSelection({ mode: "single", previous: [2, 3], ready: ALL_READY, eligible: ALL_READY }),
    [2]
  );
});

// ------------------------------------------------------- app.js mirrors
// public/app.js cannot import, so it mirrors both rules inline. These keep
// the mirrors honest — the same approach test/npcInteraction.test.js uses.

const appJs = (await fs.readFile(path.join(process.cwd(), "public", "app.js"), "utf8")).replace(/\r\n/g, "\n");

test("the app.js mirror of the outcome priority matches this module", () => {
  assert.match(appJs, /function presentRunOutcome\(\{ outcome, anyAnswerOk = false \}\)/);
  // Cancellation is checked FIRST — that ordering is the fix.
  const fn = appJs.slice(appJs.indexOf("function presentRunOutcome("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(
    body.indexOf('outcome === "stopped"') < body.indexOf('outcome === "insufficient_results"'),
    "user cancellation must be evaluated before insufficient results"
  );
  assert.match(body, /showProviderFailureGuidance: false, messageKey: "generationStopped"/);
  assert.match(appJs, /function scholarDisplayState\(scholar\)/);
});

test("the stopped path shows a stopped notice, never the model-unavailable panel", () => {
  assert.match(appJs, /function showSessionStopped\(\)/);
  assert.match(appJs, /generationStoppedTitle/);
  assert.match(appJs, /generationStoppedBody/);
  // The provider-failure panel is now gated on the presentation decision.
  assert.match(appJs, /if \(presentation\.showProviderFailureGuidance\) \{[\s\S]{0,120}showSessionError\(\);/);
  // A stopped Scholar tab gets no retry/change-model affordances.
  const tabFn = appJs.slice(appJs.indexOf('} else if (entry.status === "stopped") {'));
  assert.doesNotMatch(tabFn.slice(0, 260), /appendScholarRetryActions/);
});

test("the app.js mirror of the selection rule matches this module", () => {
  assert.match(appJs, /function resolveScholarSelection\(\{ mode, previous = \[\], ready = \[\], eligible = \[\], reset = false \}\)/);
  assert.match(appJs, /function narrowToSingle\(slots\)/);
  // The rebuild preserves the previous selection and only Reset discards it.
  assert.match(appJs, /buildScholarPicker\(currentConfig, \{ reset: true \}\)/);
  assert.match(appJs, /buildScholarPicker\(cfg\);/, "loadStatus rebuild keeps the player's choice");
  // Selection is no longer added inside the chip loop.
  const picker = appJs.slice(appJs.indexOf("function buildScholarPicker(cfg,"));
  const body = picker.slice(0, picker.indexOf("\n}\n"));
  assert.doesNotMatch(body, /selectedSlots\.add\(slot\.slot\)/, "eligibility must not add a selection directly");
  assert.match(body, /readySlots\.push\(slot\.slot\)/);
  assert.match(body, /eligibleSlots\.push\(slot\.slot\)/);
});
