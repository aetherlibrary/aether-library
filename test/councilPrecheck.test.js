// Tests for the Council Model Pre-check pipeline (precheckCouncil() in
// src/services/council.js) — reuses the real provider registry
// (src/providers/index.js) exactly like askScholar()/judge() do, so these
// tests monkey-patch providers[id].complete/isConfigured directly (plain
// mutable object properties on the shared registry) rather than mocking a
// network layer — every call in this file is genuinely offline and
// deterministic, never a real request to any provider.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH), like
// timeouts.test.js, so it never touches the real project config.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let council;
let providers;
let getActiveSession;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-council-precheck-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
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
  ({ getActiveSession } = await import("../src/services/sessionEngine.js"));
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Every test starts with every provider "configured" and succeeding —
// individual tests override one provider's complete()/isConfigured() to
// simulate a specific failure. Reset before each test so a failure staged
// in one case never leaks into the next.
beforeEach(() => {
  for (const id of ["openai", "anthropic", "google"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = async () => "OK";
  }
});

test("all four configured participants (3 Scholars + Grand Sage) are included", async () => {
  const result = await council.precheckCouncil();
  assert.equal(result.results.length, 4);
  assert.deepEqual(
    result.results.map((r) => r.role).sort(),
    ["judge", "scholar1", "scholar2", "scholar3"]
  );
});

test("every participant passing -> ok: true", async () => {
  const result = await council.precheckCouncil();
  assert.equal(result.ok, true);
  assert.ok(result.results.every((r) => r.ok));
});

test("any single failure prevents the overall result from being ok (atomicity) without corrupting the other results", async () => {
  providers.google.complete = async () => {
    throw Object.assign(new Error("boom"), { status: 500 });
  };
  const result = await council.precheckCouncil();
  assert.equal(result.ok, false);
  const scholar3 = result.results.find((r) => r.role === "scholar3");
  assert.equal(scholar3.ok, false);
  assert.ok(result.results.filter((r) => r.role !== "scholar3").every((r) => r.ok));
});

test("Grand Sage failure is checked exactly like a Scholar failure and fails the whole result", async () => {
  providers.anthropic.complete = async () => {
    throw Object.assign(new Error("down"), { status: 500 });
  };
  const result = await council.precheckCouncil();
  assert.equal(result.ok, false);
  const judge = result.results.find((r) => r.role === "judge");
  assert.equal(judge.ok, false);
  // scholar2 also uses anthropic in this fixture — both participants on the
  // broken provider fail independently, neither masks the other.
  const scholar2 = result.results.find((r) => r.role === "scholar2");
  assert.equal(scholar2.ok, false);
});

test("no API key configured classifies as AUTH_ERROR without making any network call", async () => {
  let called = false;
  providers.openai.isConfigured = () => false;
  providers.openai.complete = async () => {
    called = true;
    return "OK";
  };
  const result = await council.precheckCouncil();
  const scholar1 = result.results.find((r) => r.role === "scholar1");
  assert.equal(scholar1.ok, false);
  assert.equal(scholar1.category, "AUTH_ERROR");
  assert.equal(called, false);
});

test("billing/credit failure is classified as BILLING_ERROR, not a generic unavailable", async () => {
  providers.google.complete = async () => {
    throw Object.assign(new Error("Google API 429: exceeded your current quota, insufficient_quota"), { status: 429 });
  };
  const result = await council.precheckCouncil();
  assert.equal(result.results.find((r) => r.role === "scholar3").category, "BILLING_ERROR");
});

test("an invalid/unauthorized key is classified as AUTH_ERROR, distinct from billing", async () => {
  providers.google.complete = async () => {
    throw Object.assign(new Error("Google API 400: API key not valid. Please pass a valid API key."), { status: 400 });
  };
  const result = await council.precheckCouncil();
  assert.equal(result.results.find((r) => r.role === "scholar3").category, "AUTH_ERROR");
});

test("requesting a subset of Scholar slots still always includes the Grand Sage", async () => {
  const result = await council.precheckCouncil([1]);
  assert.deepEqual(
    result.results.map((r) => r.role).sort(),
    ["judge", "scholar1"]
  );
});

test("precheckCouncil never creates or touches a Session, success or failure", async () => {
  await council.precheckCouncil();
  assert.equal(getActiveSession(), null);
  providers.google.complete = async () => {
    throw new Error("boom");
  };
  await council.precheckCouncil();
  assert.equal(getActiveSession(), null);
});

test("a successful check sends a minimal prompt, not the user's real question", async () => {
  let seenPrompts = [];
  for (const id of ["openai", "anthropic", "google"]) {
    providers[id].complete = async ({ prompt }) => {
      seenPrompts.push(prompt);
      return "OK";
    };
  }
  await council.precheckCouncil();
  assert.equal(seenPrompts.length, 4);
  for (const p of seenPrompts) {
    assert.ok(p.length < 40, `expected a minimal prompt, got: ${p}`);
    assert.doesNotMatch(p, /meaning of a Council pre-check|real council question/i);
  }
});
