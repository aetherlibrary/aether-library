// Tests for the Session Engine (src/services/sessionEngine.js), focused on
// Archive Discussion Threads lineage: a Session's threadId/parentSessionId
// default vs. what Continue Discussion propagates. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { startSession, getActiveSession, resetSession } from "../src/services/sessionEngine.js";

function minimalScholars() {
  return { scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-5.1", status: "ok", answer: "Paris." } };
}

test("a brand-new session is its own thread root: threadId === id, parentSessionId is null", () => {
  const session = startSession({ question: "Q1", mode: "single", scholars: minimalScholars(), identity: {} });
  assert.equal(session.threadId, session.id);
  assert.equal(session.parentSessionId, null);
  resetSession();
});

test("Continue Discussion propagation: a session started with parentSessionId/threadId carries them exactly", () => {
  const a = startSession({ question: "Q-A", mode: "single", scholars: minimalScholars(), identity: {} });
  const b = startSession({
    question: "Q-B",
    mode: "single",
    scholars: minimalScholars(),
    identity: {},
    parentSessionId: a.id,
    threadId: a.threadId,
  });
  assert.equal(b.threadId, a.threadId);
  assert.equal(b.parentSessionId, a.id);
  resetSession();
});

test("chained continuation: C continues B, which continued A — all three share one threadId", () => {
  const a = startSession({ question: "Q-A", mode: "single", scholars: minimalScholars(), identity: {} });
  const b = startSession({
    question: "Q-B",
    mode: "single",
    scholars: minimalScholars(),
    identity: {},
    parentSessionId: a.id,
    threadId: a.threadId,
  });
  const c = startSession({
    question: "Q-C",
    mode: "single",
    scholars: minimalScholars(),
    identity: {},
    parentSessionId: b.id,
    threadId: b.threadId,
  });
  assert.equal(c.threadId, a.threadId);
  assert.equal(c.parentSessionId, b.id);
  assert.notEqual(c.threadId, c.id, "C's thread predates C itself");
  resetSession();
});

test("Reset destroys the active session — no lineage or any other state survives it", () => {
  startSession({ question: "Q", mode: "single", scholars: minimalScholars(), identity: {} });
  assert.ok(getActiveSession());
  resetSession();
  assert.equal(getActiveSession(), null);
});

test("starting a fresh session discards the previous one entirely, never inheriting its thread by accident", () => {
  const a = startSession({ question: "Q-A", mode: "single", scholars: minimalScholars(), identity: {} });
  const unrelated = startSession({ question: "Q-unrelated", mode: "single", scholars: minimalScholars(), identity: {} });
  assert.notEqual(unrelated.threadId, a.threadId);
  assert.equal(unrelated.parentSessionId, null);
  resetSession();
});
