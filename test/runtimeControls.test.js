// Tests for Runtime Stop (user-initiated cancellation) and the Provider
// Failure Gate — the two runtime controls layered on the Run Safety registry
// in src/services/council.js.
//
// Same offline harness as runSafety.test.js: providers are monkey-patched on
// the shared registry, archives are redirected to a temp dir (ARCHIVE_DIR)
// and config to a temp .env.local (ENV_FILE_PATH). Every provider call here
// is deterministic and gated on an explicit promise, so "in flight" is a real
// state the tests can hold open and inspect — no timers, no sleeps, no
// network.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let council;
let providers;
let getActiveSession;
let resetSession;
let tmpRoot;

let completeCalls;
let callsByProvider;
let gate;

function openGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

// Waits until `predicate()` is true, yielding to the microtask/macrotask
// queue between checks. Used to observe a state the pipeline reaches
// asynchronously (e.g. "the run has parked at the failure gate") without
// sleeping for a fixed duration.
async function until(predicate, label, limit = 2000) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

// A provider that never resolves on its own — it settles only when the test
// releases the gate, or rejects with an AbortError when the run's signal
// fires. This is what makes "Stop aborts an in-flight request" observable.
function abortableProvider(id, result = () => `answer from ${id}`) {
  return async ({ signal }) => {
    completeCalls += 1;
    callsByProvider.push(id);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      gate.promise.then(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(typeof result === "function" ? result() : result);
      });
    });
  };
}

// Fails immediately with a classified provider error (the shape errors.js
// produces), so the failure gate sees a real terminal failure.
function failingProvider(status, message, code = "provider_error") {
  return async () => {
    completeCalls += 1;
    const err = new Error(message);
    err.status = status;
    err.code = code;
    throw err;
  };
}

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-runtime-controls-test-"));
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
  ({ getActiveSession, resetSession } = await import("../src/services/sessionEngine.js"));
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// The Grand Sage runs on its OWN provider (perplexity) in this file, so
// "did the Sage start?" is answerable by looking at callsByProvider alone.
beforeEach(() => {
  resetSession();
  completeCalls = 0;
  callsByProvider = [];
  gate = openGate();
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = abortableProvider(id);
  }
});

const sageStarted = () => callsByProvider.includes("perplexity");

// ============================================================ USER STOP

test("1. Stop aborts an active Council run", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "all three Scholars in flight");

  const result = council.requestStopActiveRun();
  assert.equal(result.stopped, true);
  assert.equal(result.run.state, "cancellation_requested");

  const session = await run;
  assert.equal(session.outcome, "stopped");
  for (const key of ["scholar1", "scholar2", "scholar3"]) {
    assert.equal(session.scholars[key].status, "cancelled", `${key} was aborted, not failed`);
  }
  gate.release();
});

test("2. Stop aborts an active Mentor run", async () => {
  const run = council.runSessionEvents("Q", { mode: "single", scholars: [1] });
  await until(() => callsByProvider.length === 1, "the Mentor Scholar in flight");

  council.requestStopActiveRun();
  const session = await run;

  assert.equal(session.mode, "single");
  assert.equal(session.outcome, "stopped");
  assert.equal(session.scholars.scholar1.status, "cancelled");
  gate.release();
});

test("3. Stop is idempotent — repeated calls never throw and never re-abort", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");

  const first = council.requestStopActiveRun();
  const second = council.requestStopActiveRun();
  const third = council.requestStopActiveRun();

  assert.equal(first.run.runId, second.run.runId);
  assert.equal(second.run.runId, third.run.runId);
  for (const r of [first, second, third]) assert.equal(r.run.state, "cancellation_requested");

  await run;
  gate.release();
});

test("4. Stop with no active run is safe", () => {
  assert.equal(council.getActiveRun(), null);
  const result = council.requestStopActiveRun();
  assert.deepEqual(result, { stopped: false, run: null });
});

test("5. the run slot is released after cancellation settles", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  await run;
  assert.equal(council.getActiveRun(), null);
  gate.release();
});

test("6+7. no later provider stage — including the Grand Sage — starts after Stop", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  const session = await run;

  assert.equal(sageStarted(), false, "the Grand Sage must never start after Stop");
  assert.equal(completeCalls, 3, "no provider call beyond the three already in flight");
  assert.equal(session.judge?.status, "cancelled");
  gate.release();
});

test("8. completed results are preserved when Stop arrives mid-run", async () => {
  // Scholar 1 answers immediately; 2 and 3 are still in flight when Stop hits.
  providers.openai.complete = async () => {
    completeCalls += 1;
    callsByProvider.push("openai");
    return "Alpha's finished answer.";
  };
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "all Scholars dispatched");
  council.requestStopActiveRun();
  const session = await run;

  assert.equal(session.scholars.scholar1.status, "ok");
  assert.equal(session.scholars.scholar1.answer, "Alpha's finished answer.");
  assert.equal(session.scholars.scholar2.status, "cancelled");
  assert.equal(session.outcome, "stopped");
  gate.release();
});

test("9. user cancellation is never reported as a provider failure", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  const session = await run;

  for (const s of Object.values(session.scholars)) {
    assert.equal(s.status, "cancelled");
    assert.equal(s.error, null, "a stop carries no error message");
    assert.equal(s.errorCategory, undefined, "a stop is never given a failure category");
  }
  gate.release();
});

test("10. a new run can start once cancellation settles", async () => {
  const first = council.runSessionEvents("First", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");
  council.requestStopActiveRun();
  await first;
  gate.release();

  gate = openGate();
  gate.release();
  const second = await council.runSessionEvents("Second", { mode: "council" });
  assert.equal(second.question, "Second");
  assert.equal(second.outcome, "completed");
});

test("11. refresh state exposes running and cancellation_requested", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");

  const running = council.publicRunState();
  assert.equal(running.state, "running");
  assert.match(running.runId, /^run-/);
  assert.equal(running.mode, "council");
  assert.equal(running.failure, null);

  council.requestStopActiveRun();
  assert.equal(council.publicRunState().state, "cancellation_requested");

  await run;
  assert.equal(council.publicRunState(), null, "terminal: nothing left to restore");
  gate.release();
});

test("the public run projection never exposes internals", async () => {
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length === 3, "Scholars in flight");
  const projected = council.publicRunState();
  for (const secret of ["controller", "resolveDecision", "decision"]) {
    assert.equal(projected[secret], undefined, `${secret} must stay server-side`);
  }
  council.requestStopActiveRun();
  await run;
  gate.release();
});

// ====================================================== FAILURE GATE

// Scholar 2 (anthropic) fails terminally; 1 and 3 answer once released.
function stageScholar2Failure(status, message, code) {
  providers.anthropic.complete = failingProvider(status, message, code);
}

// Starts a Council run that parks at the failure gate, and resolves once it
// is parked. The run promise is returned WRAPPED in an object on purpose: a
// bare promise returned from an async function would be flattened by the
// caller's `await`, which would wait for the run to finish — and it cannot
// finish until the test submits a decision. Callers do
// `const { run } = await parkAtGate();` and await `run` at the end.
async function parkAtGate(question = "Q") {
  const run = council.runSessionEvents(question, { mode: "council" });
  gate.release(); // let the healthy Scholars finish so the gate can be reached
  await until(
    () => council.getActiveRun()?.state === "awaiting_failure_decision",
    "the run to park at the failure gate"
  );
  return { run };
}

test("13. a Scholar timeout parks the run at awaiting_failure_decision", async () => {
  stageScholar2Failure(undefined, "Anthropic stalled — no activity for 90s.", "inactivity_timeout");
  const { run } = await parkAtGate();

  const state = council.publicRunState();
  assert.equal(state.state, "awaiting_failure_decision");
  assert.equal(state.failure.scholars.length, 1);
  assert.equal(state.failure.scholars[0].key, "scholar2");
  assert.equal(state.failure.scholars[0].category, "TIMEOUT");

  council.submitFailureDecision(state.runId, "stop");
  await run;
});

test("14. model-unavailable parks the run at awaiting_failure_decision", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  assert.equal(council.publicRunState().failure.scholars[0].category, "MODEL_UNAVAILABLE");
  council.submitFailureDecision(council.publicRunState().runId, "stop");
  await run;
});

test("15. a rate limit parks the run at awaiting_failure_decision", async () => {
  stageScholar2Failure(429, "Anthropic API 429: rate limit exceeded");
  const { run } = await parkAtGate();
  assert.equal(council.publicRunState().failure.scholars[0].category, "RATE_LIMITED");
  council.submitFailureDecision(council.publicRunState().runId, "stop");
  await run;
});

test("16+17. the Grand Sage — and every later stage — is held until the decision", async () => {
  stageScholar2Failure(429, "Anthropic API 429: rate limit exceeded");
  const { run } = await parkAtGate();

  assert.equal(sageStarted(), false, "the Sage must not start before the user decides");
  const callsWhileParked = completeCalls;

  council.submitFailureDecision(council.publicRunState().runId, "continue");
  await run;

  assert.equal(sageStarted(), true, "the Sage runs only after Continue");
  assert.equal(completeCalls, callsWhileParked + 1, "exactly one new call: the Sage");
});

test("18+19+20. Continue resumes at the Sage, reruns nothing, and excludes the failed Scholar's answer", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  const callsBefore = [...callsByProvider];

  council.submitFailureDecision(council.publicRunState().runId, "continue");
  const session = await run;

  // Nothing rerun: the only new call is the Sage's.
  assert.deepEqual(callsByProvider, [...callsBefore, "perplexity"]);
  assert.equal(callsByProvider.filter((p) => p === "openai").length, 1);
  assert.equal(callsByProvider.filter((p) => p === "google").length, 1);

  assert.equal(session.scholars.scholar1.status, "ok");
  assert.equal(session.scholars.scholar3.status, "ok");
  assert.equal(session.scholars.scholar2.status, "error", "the failure is preserved, not erased");
  assert.equal(session.scholars.scholar2.answer, null, "no answer is fabricated for it");
  assert.equal(session.judge.status, "ok");
  assert.equal(session.outcome, "continued_with_failures");
});

test("21. Stop from the failure gate terminates the run safely", async () => {
  stageScholar2Failure(429, "Anthropic API 429: rate limited");
  const { run } = await parkAtGate();

  council.submitFailureDecision(council.publicRunState().runId, "stop");
  const session = await run;

  assert.equal(sageStarted(), false);
  assert.equal(session.outcome, "stopped");
  assert.equal(session.scholars.scholar1.status, "ok", "completed work survives a gate Stop");
  assert.equal(council.getActiveRun(), null, "the slot is released");
});

test("the Stop BUTTON also releases a run parked at the gate", async () => {
  stageScholar2Failure(429, "Anthropic API 429: rate limited");
  const { run } = await parkAtGate();

  const result = council.requestStopActiveRun();
  assert.equal(result.stopped, true);

  const session = await run;
  assert.equal(session.outcome, "stopped");
  assert.equal(sageStarted(), false);
  assert.equal(council.getActiveRun(), null);
});

test("22. repeating the same decision is harmless", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  const runId = council.publicRunState().runId;

  const first = council.submitFailureDecision(runId, "continue");
  const second = council.submitFailureDecision(runId, "continue");
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  const session = await run;
  assert.equal(callsByProvider.filter((p) => p === "perplexity").length, 1, "the Sage ran exactly once");
  assert.equal(session.outcome, "continued_with_failures");
});

test("23. a stale runId is rejected and cannot steer the live run", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  const realRunId = council.publicRunState().runId;

  assert.throws(
    () => council.submitFailureDecision("run-not-a-real-id", "continue"),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, "stale_decision");
      return true;
    }
  );
  assert.equal(council.publicRunState().state, "awaiting_failure_decision", "still parked");
  assert.equal(sageStarted(), false);

  council.submitFailureDecision(realRunId, "stop");
  await run;
});

test("23b. a conflicting decision after the run resumed is rejected", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  const runId = council.publicRunState().runId;
  council.submitFailureDecision(runId, "continue");

  assert.throws(() => council.submitFailureDecision(runId, "stop"), /no longer waiting/i);
  await run;
});

test("an unknown decision value is rejected before anything happens", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  const runId = council.publicRunState().runId;

  assert.throws(
    () => council.submitFailureDecision(runId, "maybe"),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, "invalid_decision");
      return true;
    }
  );
  council.submitFailureDecision(runId, "stop");
  await run;
});

test("24. a reloaded page can restore the decision UI from the run state alone", async () => {
  stageScholar2Failure(undefined, "Anthropic stalled.", "inactivity_timeout");
  const { run } = await parkAtGate();

  // Exactly what GET /api/session hands a refreshed page.
  const restored = council.publicRunState();
  assert.equal(restored.state, "awaiting_failure_decision");
  assert.equal(restored.mode, "council");
  assert.ok(restored.runId);
  assert.equal(restored.failure.scholars[0].persona.length > 0, true, "a name to show the user");
  assert.equal(restored.failure.scholars[0].category, "TIMEOUT", "a safe category, not raw text");
  assert.equal(JSON.stringify(restored).includes("stalled"), false, "raw provider text is never sent");

  // …and the restored page can answer it.
  council.submitFailureDecision(restored.runId, "continue");
  const session = await run;
  assert.equal(session.judge.status, "ok");
});

test("25. duplicate Send stays blocked while awaiting a decision", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();

  await assert.rejects(
    () => council.runSessionEvents("sneaky second run", { mode: "council" }),
    /already in progress/i
  );

  council.submitFailureDecision(council.publicRunState().runId, "stop");
  await run;
});

test("26+27. one archive per session, and the session stays recoverable", async () => {
  const archiveDir = process.env.ARCHIVE_DIR;
  const before = await fs.readdir(archiveDir).catch(() => []);

  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const { run } = await parkAtGate();
  council.submitFailureDecision(council.publicRunState().runId, "continue");
  const session = await run;

  const after = await fs.readdir(archiveDir).catch(() => []);
  const added = after.filter((f) => !before.includes(f));
  assert.equal(added.length, 1, "exactly one archive for one run");
  assert.equal(added[0], `${session.id}.json`);
  assert.equal(getActiveSession().id, session.id, "still the active, restorable session");
});

test("a stopped run writes no archive, but keeps its session", async () => {
  const archiveDir = process.env.ARCHIVE_DIR;
  const before = await fs.readdir(archiveDir).catch(() => []);

  stageScholar2Failure(429, "Anthropic API 429: rate limited");
  const { run } = await parkAtGate();
  council.submitFailureDecision(council.publicRunState().runId, "stop");
  const session = await run;

  const after = await fs.readdir(archiveDir).catch(() => []);
  assert.deepEqual(
    after.filter((f) => !before.includes(f)),
    [],
    "an incomplete run must never leave an archive behind"
  );
  assert.equal(getActiveSession().id, session.id, "but the session is still inspectable");
});

test("28. when every Scholar fails, the Sage is never invoked and no gate opens", async () => {
  for (const id of ["openai", "anthropic", "google"]) {
    providers[id].complete = failingProvider(404, `${id} API 404: model not found`);
  }
  const session = await council.runSessionEvents("Q", { mode: "council" });

  assert.equal(sageStarted(), false, "nothing to synthesize — the Sage never runs");
  assert.equal(session.judge.status, "skipped");
  assert.equal(session.outcome, "insufficient_results");
  assert.equal(council.getActiveRun(), null, "no gate parked the run");
});

test("29. Mentor failure policy: the sole Scholar failing never opens the gate", async () => {
  providers.openai.complete = failingProvider(404, "OpenAI API 404: model not found");
  const session = await council.runSessionEvents("Q", { mode: "single", scholars: [1] });

  // "Continue without the only participant" has no meaning, so Mentor settles
  // on its existing terminal path instead of asking an unanswerable question.
  assert.equal(session.mode, "single");
  assert.equal(session.scholars.scholar1.status, "error");
  assert.equal(session.outcome, "insufficient_results");
  assert.equal(council.getActiveRun(), null);
});

test("30. a provider failure and a user cancellation are never conflated", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  const run = council.runSessionEvents("Q", { mode: "council" });
  await until(() => callsByProvider.length >= 2, "the healthy Scholars in flight");
  council.requestStopActiveRun();
  const session = await run;

  assert.equal(session.scholars.scholar2.status, "error", "a real failure stays a failure");
  assert.equal(session.scholars.scholar2.errorCategory, "MODEL_UNAVAILABLE");
  assert.equal(session.scholars.scholar1.status, "cancelled", "a stop stays a stop");
  assert.equal(session.outcome, "stopped");
  // A Stop must win over the gate: no decision was ever requested.
  assert.equal(sageStarted(), false);
  gate.release();
});

test("failureGate:false keeps the legacy routes' original behavior", async () => {
  stageScholar2Failure(404, "Anthropic API 404: model not found");
  gate.release();
  const session = await council.runSessionEvents("Q", { mode: "council", failureGate: false });

  assert.equal(sageStarted(), true, "no gate — the Sage rules on whoever answered");
  assert.equal(session.outcome, "completed");
  assert.equal(council.getActiveRun(), null);
});

// ====================================================== CLIENT STATES
// public/app.js cannot be imported (it is browser-only and has no exports),
// so its wiring is asserted against the source text — the same approach
// test/npcInteraction.test.js already uses for the app.js mirrors. These
// cover the state transitions the runtime controls depend on, not styling.

// Line endings are normalized: a checked-out tree may have CRLF (git's eol
// conversion) while the working tree has LF, and these assertions are about
// code structure, not whitespace.
const readSource = async (...parts) =>
  (await fs.readFile(path.join(process.cwd(), ...parts), "utf8")).replace(/\r\n/g, "\n");
const appJs = await readSource("public", "app.js");
const indexHtml = await readSource("public", "index.html");

// The text of a top-level function, for assertions about what happens INSIDE
// it (and in what order) rather than anywhere in the file.
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n}\n") + 1);
}

test("31. Send -> Stop -> Stopping -> Send: every transition is wired", () => {
  // The three modes exist and are the only ones.
  assert.match(appJs, /const RUN_BUTTON_MODES = \["send", "stop", "stopping"\]/);
  // Starting a run shows Stop, and it is NOT disabled (Stop must be pressable).
  assert.match(appJs, /setRunButtonMode\("stop"\);\s*\n\s*\/\/ With Use Vault off/);
  assert.match(appJs, /els\.run\.disabled = false; \/\/ Stop must always be pressable/);
  // Pressing Stop shows Stopping… and only then asks the server to cancel —
  // the UI must never wait on the network to acknowledge the click.
  const stopBody = functionBody(appJs, "async function requestStopRun()");
  assert.match(stopBody, /setRunButtonMode\("stopping"\)/);
  assert.match(stopBody, /api\("\/api\/session\/stop"/);
  assert.ok(
    stopBody.indexOf('setRunButtonMode("stopping")') < stopBody.indexOf('api("/api/session/stop"'),
    "the button flips to Stopping… before the request is sent"
  );
  // The run's finally returns the button to Send.
  assert.match(appJs, /closeFailureDecision\(\);\s*\n\s*setRunButtonMode\("send"\);/);
});

test("31b. the composer button dispatches Stop before any send path", () => {
  const body = functionBody(appJs, "function handleSend()");
  const stopAt = body.indexOf('runButtonMode === "stop"');
  const startAt = body.indexOf("startSessionRun()");
  const chatAt = body.indexOf("sendChat");
  assert.ok(stopAt >= 0, "handleSend must handle the Stop mode");
  assert.ok(stopAt < startAt, "Stop is dispatched before starting a new run");
  if (chatAt >= 0) assert.ok(stopAt < chatAt, "Stop is dispatched before sending a follow-up");
  assert.match(body, /runButtonMode === "stopping"\) return/, "a stopping run ignores further presses");
});

test("12/31c. repeated Stop clicks produce exactly one request", () => {
  assert.match(appJs, /if \(stopRequestInFlight \|\| runButtonMode !== "stop"\) return;/);
  assert.match(appJs, /stopRequestInFlight = true;/);
  assert.match(appJs, /stopRequestInFlight = false;/);
});

test("32/33. the failure gate drives both Continue and Stop back to a normal lifecycle", () => {
  // Both stream events are handled.
  assert.match(appJs, /case "failure_gate":/);
  assert.match(appJs, /case "failure_decision":/);
  // Continue -> back to active progress (Stop button, Sage stage).
  assert.match(appJs, /if \(decision === "continue"\) \{[\s\S]{0,160}setRunButtonMode\("stop"\)/);
  // Stop -> Stopping… immediately, exactly like the composer Stop.
  assert.match(appJs, /if \(decision === "stop"\) setRunButtonMode\("stopping"\);/);
  // The decision is always submitted against a server-supplied runId.
  assert.match(appJs, /body: JSON\.stringify\(\{ runId, decision \}\)/);
});

test("34. decision buttons cannot double-submit", () => {
  assert.match(appJs, /if \(failureDecisionSubmitting\) return;/);
  assert.match(appJs, /failureDecisionSubmitting = true;\s*\n\s*els\.failureDecision\.continue\.disabled = true;\s*\n\s*els\.failureDecision\.stop\.disabled = true;/);
  // Re-opening an already-open panel is a no-op (a refresh poll fires often).
  assert.match(appJs, /if \(failureDecisionOpen\) return;/);
});

test("the failure gate panel exists and cannot be dismissed into an undefined state", () => {
  assert.match(indexHtml, /<dialog id="failure-decision-dialog">/);
  for (const id of ["failure-decision-title", "failure-decision-body", "failure-decision-reason", "failure-decision-stop", "failure-decision-continue"]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `${id} is missing from the panel`);
  }
  // Escape must not resolve a parked run by accident.
  assert.match(appJs, /oncancel = \(event\) => event\.preventDefault\(\)/);
});

test("refresh restores each runtime state, and raw provider text is never rendered", () => {
  assert.match(appJs, /run\.state === "awaiting_failure_decision"/);
  assert.match(appJs, /run\.state === "cancellation_requested"/);
  assert.match(appJs, /applyRecoveredRunState\(data\.run\)/);
  // The reason shown comes from the category map, never from an error string.
  assert.match(appJs, /const FAILURE_REASON_KEYS = \{/);
  assert.doesNotMatch(appJs, /failureDecision\.reason\.textContent = .*\.error/);
});

test("every runtime-control string exists in both locales", async () => {
  const keys = [
    "stopGeneration", "stopGenerationHint", "stopping", "generationStopped",
    "failureGateTitle", "failureGateQuestion", "failureGateContinue", "failureGateStop",
    "awaitingDecision", "continuedWithout", "noUsableResponses", "nameSeparator",
    "failureReasonTimeout", "failureReasonUnavailable", "failureReasonRateLimit",
    "failureReasonAuth", "failureReasonBilling", "failureReasonProvider",
  ];
  const { default: en } = await import("../src/locales/en.js");
  const { default: zh } = await import("../src/locales/zh-TW.js");
  for (const key of keys) {
    assert.ok(en.strings[key], `en is missing ${key}`);
    assert.ok(zh.strings[key], `zh-TW is missing ${key}`);
  }
  // The two placeholder strings must keep their {name} slot in both locales.
  for (const pack of [en, zh]) {
    for (const key of ["failureGateTitle", "failureGateQuestion", "failureGateContinue", "continuedWithout"]) {
      assert.match(pack.strings[key], /\{name\}/, `${key} lost its {name} placeholder`);
    }
  }
});
