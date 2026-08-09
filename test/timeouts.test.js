// Tests for the three-phase timeout architecture (src/providers/timeouts.js):
//   - profile selection: files / long context / reasoning models / normal,
//     with values coming from config (env-overridable, not hard-coded);
//   - the timeout clock against a real local HTTP stream:
//       connection_timeout  — provider never starts responding,
//       inactivity_timeout  — stream goes silent mid-response,
//       hard_task_timeout   — still active but past the task ceiling,
//       success             — activity RESETS inactivity, so a request is
//                             never killed merely because time passed.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH) that overrides
// every timeout knob, proving the config plumbing end to end.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

let timeouts;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-timeouts-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(
    process.env.ENV_FILE_PATH,
    [
      "TIMEOUT_CONNECT_MS=1111",
      "TIMEOUT_INACTIVITY_MS=2222",
      "TIMEOUT_TASK_NORMAL_MS=3333",
      "TIMEOUT_TASK_REASONING_MS=4444",
      "TIMEOUT_TASK_FILE_MS=5555",
      "",
    ].join("\n"),
    "utf8"
  );
  timeouts = await import("../src/providers/timeouts.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ------------------------------------------------------------ profiles

test("timeout values come from config, not hard-coded constants", () => {
  const p = timeouts.resolveTimeoutProfile({});
  assert.equal(p.connectMs, 1111);
  assert.equal(p.inactivityMs, 2222);
  assert.equal(p.taskMs, 3333);
});

test("profile selection: files and long context get the file ceiling, reasoning models the reasoning one", () => {
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "gpt-5.1" }).taskMs, 3333);
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "gpt-5.1", hasFiles: true }).taskMs, 5555);
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "gpt-5.1", promptChars: 50_000 }).taskMs, 5555);
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "o3" }).taskMs, 4444);
  // Dated snapshots of a reasoning model still count as that model.
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "o3-20250416" }).taskMs, 4444);
  // Files beat the reasoning tier (600 > 300): a reasoning model reading a
  // PDF gets the file ceiling.
  assert.equal(timeouts.resolveTimeoutProfile({ providerId: "openai", model: "o3", hasFiles: true }).taskMs, 5555);
});

// ------------------------------------------------------------ the clock
// A tiny local SSE server whose behavior each test scripts: `plan` is an
// async function receiving (res) and driving the stream.

let server;
let planFn = null;
function serverUrl() {
  return `http://127.0.0.1:${server.address().port}/`;
}

before(async () => {
  server = http.createServer((req, res) => {
    planFn(res).catch(() => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
});

after(() => server?.close());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mimics exactly what a provider module does: fetch with the clock's signal,
// mark connected, read SSE with activity resets, classify aborts.
async function runRequest(profile, plan) {
  planFn = plan;
  const clock = timeouts.startTimeoutClock(profile, "TestProvider");
  const chunks = [];
  try {
    let res;
    try {
      res = await fetch(serverUrl(), { signal: clock.signal });
    } catch (err) {
      throw clock.classify(err) || err;
    }
    clock.connected();
    try {
      await timeouts.readSSE(res, clock, (payload) => chunks.push(payload));
    } catch (err) {
      throw clock.classify(err) || err;
    }
  } finally {
    clock.done();
  }
  return chunks;
}

test("connection_timeout: provider never starts responding", async () => {
  await assert.rejects(
    () =>
      runRequest({ kind: "normal", connectMs: 80, inactivityMs: 1000, taskMs: 5000 }, async (res) => {
        await sleep(500); // headers far too late
        res.end();
      }),
    (err) => {
      assert.equal(err.code, "connection_timeout");
      assert.match(err.message, /did not start responding/);
      return true;
    }
  );
});

test("inactivity_timeout: the stream goes silent mid-response", async () => {
  await assert.rejects(
    () =>
      runRequest({ kind: "normal", connectMs: 1000, inactivityMs: 80, taskMs: 5000 }, async (res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("data: one\n\n");
        await sleep(600); // silence far beyond the inactivity window
        res.end();
      }),
    (err) => {
      assert.equal(err.code, "inactivity_timeout");
      assert.match(err.message, /no activity/);
      return true;
    }
  );
});

test("hard_task_timeout: an endlessly active stream still hits the task ceiling", async () => {
  await assert.rejects(
    () =>
      runRequest({ kind: "normal", connectMs: 1000, inactivityMs: 1000, taskMs: 200 }, async (res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        for (let i = 0; i < 100; i++) {
          res.write(`data: chunk${i}\n\n`);
          await sleep(25); // constant activity — only the hard ceiling stops it
        }
        res.end();
      }),
    (err) => {
      assert.equal(err.code, "hard_task_timeout");
      assert.match(err.message, /maximum processing time/);
      return true;
    }
  );
});

test("activity resets inactivity: a slow-but-alive stream is NEVER killed by elapsed time alone", async () => {
  // Total run ≈ 300ms — far past both the 60ms connect window (headers came
  // in time) and the 90ms inactivity window (each gap is only 25ms). Under
  // the old fixed-deadline design an equivalent request died at the fixed
  // cutoff; here it completes because the task ceiling is the only absolute.
  const chunks = await runRequest(
    { kind: "normal", connectMs: 200, inactivityMs: 90, taskMs: 2000 },
    async (res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (let i = 0; i < 12; i++) {
        res.write(`data: chunk${i}\n\n`);
        await sleep(25);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    }
  );
  assert.equal(chunks.length, 12);
  assert.equal(chunks[0], "chunk0");
});
