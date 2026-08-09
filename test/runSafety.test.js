// Tests for Runtime Run Safety — the "only one initial discussion run may
// exist at a time" guard in src/services/council.js (see its Run Safety
// block). These cover the P0 concern directly: pressing Send twice, pressing
// Send again after a refresh, and repeated Sends while a run is working must
// never produce a second concurrent run (and therefore never a second round
// of provider requests).
//
// Like councilPrecheck.test.js, these monkey-patch providers[id].complete /
// isConfigured on the shared registry instead of mocking a network layer, so
// every call here is genuinely offline and deterministic. Archives are
// redirected to a temp directory (ARCHIVE_DIR) and the config to a temp
// .env.local (ENV_FILE_PATH), so nothing touches real project data.

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

// Provider call counter — the real measure of "did a duplicate run spend API
// usage". A rejected run must add nothing to this.
let completeCalls = 0;

// A run held open on purpose: complete() waits on this until the test
// releases it, so the guard can be exercised while a run is genuinely
// in flight rather than in a simulated state.
let gate = null;
function openGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-run-safety-test-"));
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
      "JUDGE_PROVIDER=anthropic",
      "JUDGE_MODEL=claude-sonnet-4-5",
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

beforeEach(() => {
  resetSession();
  completeCalls = 0;
  gate = openGate();
  for (const id of ["openai", "anthropic", "google"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = async () => {
      completeCalls += 1;
      await gate.promise;
      return `Answer from ${id}.`;
    };
  }
});

// Every test that holds a run open must let it finish, or the shared run slot
// stays claimed for the next test.
async function finish(runPromise) {
  gate.release();
  return runPromise;
}

test("duplicate Send prevention: a second run while one is in flight is rejected with 409/run_in_progress", async () => {
  const first = council.runSessionEvents("Q1", { mode: "council" });
  const callsAfterFirstStarted = completeCalls;

  await assert.rejects(
    () => council.runSessionEvents("Q1 again", { mode: "council" }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, "run_in_progress");
      assert.match(err.message, /already in progress/i);
      return true;
    }
  );
  // The whole point: the rejected run spent no provider requests at all.
  assert.equal(completeCalls, callsAfterFirstStarted);

  await finish(first);
});

test("only one run is ever active: the rejected duplicate never installs a second Session", async () => {
  const first = council.runSessionEvents("Q", { mode: "council" });
  await council.runSessionEvents("Q dup", { mode: "council" }).catch(() => {});
  const session = await finish(first);

  assert.equal(getActiveSession().id, session.id, "the active Session is the one the accepted run installed");
  assert.equal(session.question, "Q");
  // 3 Scholars + the Grand Sage, exactly once each — no doubled usage.
  assert.equal(completeCalls, 4);
});

test("refresh during generation: the active run is observable while it works, and gone afterwards", async () => {
  assert.equal(council.getActiveRun(), null, "nothing in flight before the run starts");

  const first = council.runSessionEvents("Long question", { mode: "council" });
  const run = council.getActiveRun();
  assert.ok(run, "a reloaded page can see that a run is still working");
  assert.match(run.runId, /^run-/);
  assert.equal(run.mode, "council");
  assert.equal(run.question, "Long question");
  assert.ok(run.startedAt);

  await finish(first);
  assert.equal(council.getActiveRun(), null, "the run slot is released once the run finishes");
});

test("refresh during generation: a Send from the reloaded page is rejected, not run", async () => {
  const first = council.runSessionEvents("Q", { mode: "council" });
  const callsBefore = completeCalls;

  // Exactly what a refreshed page does when the player presses Send again:
  // it has no memory of the in-flight run, so only the server can stop it.
  await assert.rejects(() => council.runSessionEvents("Q", { mode: "council" }), /already in progress/i);
  assert.equal(completeCalls, callsBefore);

  await finish(first);
});

test("repeated Send while active: every extra attempt is rejected and the run slot stays with the first", async () => {
  const first = council.runSessionEvents("Q", { mode: "council" });
  const runId = council.getActiveRun().runId;

  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(() => council.runSessionEvents(`spam ${i}`, { mode: "council" }), /already in progress/i);
    assert.equal(council.getActiveRun().runId, runId, "the original run still owns the slot");
  }

  const session = await finish(first);
  assert.equal(session.question, "Q");
  assert.equal(completeCalls, 4);
});

test("a completed run behaves normally: the next run is accepted and installs its own Session", async () => {
  const first = await finish(council.runSessionEvents("First", { mode: "council" }));

  // A fresh gate, already open, so the second run completes immediately.
  gate = openGate();
  gate.release();
  const second = await council.runSessionEvents("Second", { mode: "council" });

  assert.notEqual(second.id, first.id);
  assert.equal(second.question, "Second");
  assert.equal(getActiveSession().id, second.id);
  assert.equal(council.getActiveRun(), null);
});

test("a failed run releases the slot: the next run is not blocked by it", async () => {
  // emit() throwing propagates out of the pipeline — a run that dies partway
  // through must not wedge the slot forever.
  gate.release();
  await assert.rejects(
    () =>
      council.runSessionEvents("Doomed", { mode: "council" }, () => {
        throw new Error("emit exploded");
      }),
    /emit exploded/
  );
  assert.equal(council.getActiveRun(), null, "the slot is released even when the run throws");

  const recovered = await council.runSessionEvents("After failure", { mode: "council" });
  assert.equal(recovered.question, "After failure");
});

test("Mentor (single) mode shares the same one-run guard", async () => {
  const first = council.runSessionEvents("Q", { mode: "single", scholars: [1] });
  await assert.rejects(() => council.runSessionEvents("Q", { mode: "single", scholars: [1] }), /already in progress/i);
  assert.equal(council.getActiveRun().mode, "single");

  const session = await finish(first);
  assert.equal(session.mode, "single");
  // One Scholar, no Grand Sage — the guard changes nothing about the pipeline.
  assert.equal(completeCalls, 1);
});

test("follow-up operations are unaffected: retry and ruling regeneration never touch the run slot", async () => {
  // Scholar 2 fails so there is something to retry; the others answer.
  providers.anthropic.complete = async ({ system }) => {
    completeCalls += 1;
    await gate.promise;
    // The Judge shares this provider — only the Scholar call must fail.
    if (/final arbiter/.test(system)) return "The ruling.";
    throw new Error("scholar2 provider is down");
  };
  // failureGate off: this test predates the provider failure gate and is
  // about the run slot, not the gate. With the gate on, a failed Scholar
  // alongside two successful ones would (correctly) park the run waiting for
  // a user decision — see runtimeControls.test.js, which covers that path.
  const session = await finish(council.runSessionEvents("Q", { mode: "council", failureGate: false }));
  assert.equal(session.scholars.scholar2.status, "error");
  assert.equal(council.getActiveRun(), null);

  // A retry is not an initial run: it must be allowed with no run registered,
  // and must not claim the slot either.
  providers.anthropic.complete = async () => "scholar2 recovered";
  const retried = await council.retryScholar(2);
  assert.equal(retried.status, "ok");
  assert.equal(council.getActiveRun(), null, "a retry never claims the initial-run slot");

  const ruling = await council.regenerateJudgeRuling();
  assert.equal(ruling.status, "ok");
  assert.equal(council.getActiveRun(), null, "a ruling regeneration never claims the initial-run slot");
});
