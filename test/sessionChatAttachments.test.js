// Tests for follow-up (Session Chat) attachments and Session-configuration
// immutability (src/services/sessionChat.js + sessionEngine.js):
//   - a follow-up's materials travel through the same validated pipeline
//     (normalizeMaterials/imageParts/materialsMetadata) as the initial run;
//   - attachment metadata is attributed to the one chat turn it arrived on,
//     never merged into the session-level attachments record, never leaked
//     onto earlier or later turns;
//   - a Scholar's/Judge's recorded provider+model (captured at session start)
//     keeps answering follow-ups even if live config changes afterward;
//   - Archives records survive an unrelated Session Reset.
//
// Runs against an isolated temp .env.local + Archive dir (via ENV_FILE_PATH /
// ARCHIVE_DIR) — never the real ones.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let config;
let providers;
let sessionEngine;
let sessionChat;
let archives;
let council;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-chat-attach-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");

  config = await import("../src/config.js");
  providers = (await import("../src/providers/index.js")).providers;
  sessionEngine = await import("../src/services/sessionEngine.js");
  sessionChat = await import("../src/services/sessionChat.js");
  archives = await import("../src/services/archives.js");
  council = await import("../src/services/council.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  sessionEngine.resetSession();
});

// Captures whatever the mocked provider.complete() was called with, so tests
// can assert on the prompt/images a follow-up actually sent — without any
// real network call.
let captured = null;
function mockProvider(id, reply = "A reply.") {
  config.config.providers[id].apiKey = "test-key";
  providers[id].complete = async (args) => {
    captured = args;
    return reply;
  };
}

function installSingleSession(overrides = {}) {
  return sessionEngine.startSession({
    question: "What is the capital of France?",
    mode: "single",
    scholars: {
      scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-original", status: "ok", answer: "Paris." },
    },
    judge: null,
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle" } },
    attachments: [],
    ...overrides,
  });
}

function installCouncilSession(overrides = {}) {
  return sessionEngine.startSession({
    question: "What is the capital of France?",
    mode: "council",
    scholars: {
      scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-original", status: "ok", answer: "Paris." },
    },
    judge: { status: "ok", provider: "anthropic", model: "claude-original", answer: "## Ruling\nParis." },
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle" } },
    attachments: [],
    ...overrides,
  });
}

test("Mentor follow-up: a document attachment reaches the Scholar's prompt, framed distinctly from the original question", async () => {
  captured = null;
  mockProvider("openai");
  installSingleSession();

  await sessionChat.sessionChatReply("Tell me more.", [
    { kind: "document", name: "notes.txt", text: "Paris has the Eiffel Tower.", language: null },
  ]);

  assert.ok(captured, "the mocked Scholar provider was called");
  assert.match(captured.prompt, /## Materials attached to this message/);
  assert.match(captured.prompt, /Paris has the Eiffel Tower\./);
  // Distinct from the initial-question framing so the model never mistakes
  // this for something the original question came with.
  assert.doesNotMatch(captured.prompt, /## Attached materials/);
  assert.deepEqual(captured.images, [], "no image material was sent, so images stays empty");
});

test("Mentor follow-up: an image attachment reaches images[] for the Scholar's provider", async () => {
  captured = null;
  mockProvider("openai");
  installSingleSession();

  await sessionChat.sessionChatReply("What do you see?", [
    { kind: "image", name: "pic.png", mediaType: "image/png", data: "QUFBQQ==" },
  ]);

  assert.deepEqual(captured.images, [{ mediaType: "image/png", data: "QUFBQQ==" }]);
});

test("Council follow-up (Grand Sage/Judge): an attachment reaches the Judge's prompt and images", async () => {
  captured = null;
  mockProvider("anthropic");
  installCouncilSession();

  await sessionChat.sessionChatReply("Summarize the new material.", [
    { kind: "webpage", name: "Wiki", url: "https://example.com/paris", text: "Paris is on the Seine." },
  ]);

  assert.match(captured.prompt, /## Materials attached to this message/);
  assert.match(captured.prompt, /Paris is on the Seine\./);
  assert.deepEqual(captured.images, []);
});

test("a follow-up attachment is attributed to its own turn only — never merged into session.attachments, never leaked onto other turns", async () => {
  mockProvider("openai");
  const session = installSingleSession();
  assert.deepEqual(session.attachments, [], "session-level attachments starts empty (no initial materials)");

  await sessionChat.sessionChatReply("First follow-up.", [
    { kind: "document", name: "first.txt", text: "First content.", language: null },
  ]);
  await sessionChat.sessionChatReply("Second follow-up.", []); // no attachment this time

  assert.deepEqual(session.attachments, [], "session-level attachments record is still untouched");
  assert.equal(session.chat.length, 4, "two full turns (user+assistant) recorded");

  const [firstUser, firstAssistant, secondUser, secondAssistant] = session.chat;
  assert.deepEqual(firstUser.attachments, [
    { kind: "document", name: "first.txt", preview: { text: "First content." } },
  ]);
  assert.equal(firstAssistant.attachments, undefined, "assistant turns never carry attachment metadata");
  assert.equal(secondUser.attachments, undefined, "a turn with no attachment gets no attachments field at all");
  assert.equal(secondAssistant.attachments, undefined);
});

test("malformed or unsupported follow-up materials are dropped by the same validation the initial run uses, never sent to the provider", async () => {
  captured = null;
  mockProvider("openai");
  installSingleSession();

  await sessionChat.sessionChatReply("Ignore the bad one.", [
    { kind: "image" /* no data */ },
    { kind: "document", name: "ok.txt", text: "kept", language: null },
  ]);

  assert.match(captured.prompt, /kept/);
  assert.doesNotMatch(captured.prompt, /### Attached image/);
});

test("Scholar follow-ups keep using the Session's own recorded provider/model even after live config changes", async () => {
  captured = null;
  mockProvider("openai");
  installSingleSession(); // scholar1 recorded as openai/gpt-original

  // Simulate a Settings change made mid-Session (never actually reachable
  // from the UI without the new confirm-and-reset gate, but the backend
  // guarantee must hold regardless of how config drifts).
  config.config.scholarSlots = config.config.scholarSlots.map((s) =>
    s.slot === "scholar1" ? { ...s, provider: "anthropic", model: "claude-new" } : s
  );

  await sessionChat.sessionChatReply("Still there?", []);
  assert.equal(captured.model, "gpt-original", "the Session's own recorded model, not the live config's new one");
});

test("Judge follow-ups keep using the Session's own recorded provider/model even after live config changes", async () => {
  captured = null;
  mockProvider("anthropic", "A ruling follow-up.");
  installCouncilSession(); // judge recorded as anthropic/claude-original

  config.config.judgeProvider = "openai";
  config.config.judgeModel = "gpt-new";

  await sessionChat.sessionChatReply("Any updates?", []);
  assert.equal(captured.model, "claude-original", "the ruling Judge's own recorded model survives a live config change");
});

test("per-turn metadata persists safe preview data: image pixels (capped), document/webpage text — restorable after reload/Archives", async () => {
  mockProvider("openai");
  const session = installSingleSession();

  await sessionChat.sessionChatReply("Look at these.", [
    { kind: "image", name: "small.png", mediaType: "image/png", data: "QUFBQQ==" },
    { kind: "image", name: "huge.png", mediaType: "image/png", data: "A".repeat(2_000_004) },
    { kind: "webpage", name: "Wiki", url: "https://example.com/x", text: "Page text." },
  ]);

  const turn = session.chat[0];
  const [small, huge, page] = turn.attachments;
  assert.deepEqual(small.preview, { mediaType: "image/png", data: "QUFBQQ==" }, "small image keeps its pixels for preview");
  assert.equal(huge.preview, undefined, "an image over the persistence cap records name/kind only — preview degrades gracefully");
  assert.equal(huge.name, "huge.png", "the oversized image's chip metadata still persists");
  assert.deepEqual(page, { kind: "webpage", name: "Wiki", url: "https://example.com/x", preview: { text: "Page text." } });
});

test("Use Vault off: Librarian retrieval is bypassed, the librarian event says skipped, and the Session records the option", async () => {
  captured = null;
  mockProvider("openai", "An answer.");
  // A vault path that doesn't exist — with Use Vault ON this would still be
  // *attempted* (and fail safely); with it OFF, no search may even start.
  config.config.vaultPath = path.join(tmpRoot, "no-such-vault");

  const events = [];
  const session = await council.runSessionEvents(
    "A question needing no vault.",
    { mode: "single", scholars: [1], useVault: false },
    (type, data) => events.push({ type, data })
  );

  const librarian = events.find((e) => e.type === "librarian");
  assert.equal(librarian.data.skipped, true, "the librarian event reports the search was skipped, not empty");
  assert.deepEqual(librarian.data.sources, []);
  assert.match(captured.prompt, /No vault context is provided for this session/);
  assert.doesNotMatch(captured.prompt, /Vault note:/);
  assert.equal(session.useVault, false, "the Session records the option it started with (for UI restore)");
});

test("Use Vault defaults to on: absent option keeps the existing retrieval behavior and records useVault: true", async () => {
  captured = null;
  mockProvider("openai", "An answer.");
  config.config.vaultPath = path.join(tmpRoot, "no-such-vault");

  const events = [];
  const session = await council.runSessionEvents(
    "A default question.",
    { mode: "single", scholars: [1] },
    (type, data) => events.push({ type, data })
  );

  const librarian = events.find((e) => e.type === "librarian");
  assert.equal(librarian.data.skipped, false, "a real search ran (and found nothing in the missing vault)");
  assert.equal(session.useVault, true);
});

test("Archives record survives an unrelated Session Reset", async () => {
  const session = installSingleSession();
  session.status = "saved";
  session.finishedAt = new Date().toISOString();
  const record = await archives.archiveSession(session);
  assert.ok(record, "session was archivable and got recorded");

  sessionEngine.resetSession();

  const fetched = await archives.getArchive(session.id);
  assert.ok(fetched, "the archive record is still readable after Reset");
  assert.equal(fetched.id, session.id);
});
