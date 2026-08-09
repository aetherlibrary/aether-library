// Tests for the Archives service (src/services/archives.js): local history
// of completed Sessions, separate from the Vault. Run with `npm test`
// (Node's built-in test runner — no new dependency).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

let archives;
let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-archives-test-"));
  process.env.ARCHIVE_DIR = tmpDir;
  archives = await import("../src/services/archives.js");
});

after(async () => {
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Builds a minimal, valid Session object (the same shape sessionEngine.js
// produces) so tests never depend on real provider calls.
function buildSession(overrides = {}) {
  const id = `session-${randomUUID()}`;
  return {
    id,
    question: "What is the capital of France?",
    mode: "council",
    status: "active",
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:05:00.000Z",
    scholars: {
      scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-5.1", status: "ok", answer: "Paris.", error: null },
    },
    judge: { status: "ok", provider: "anthropic", model: "claude-sonnet-4-5", answer: "## Agreement\nParis.", error: null },
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle", 2: "Hierophant", 3: "Illuminator" } },
    vault: { state: "unsaved", adapter: null, path: null, savedAt: null },
    attachments: [],
    chat: [],
    ...overrides,
  };
}

test("generateTitle: trims, uses first meaningful line, truncates at ~60 chars", () => {
  assert.equal(archives.generateTitle("  Hello world  "), "Hello world");
  assert.equal(archives.generateTitle("\n\n  First real line\nSecond line"), "First real line");
  const long = "x".repeat(80);
  const title = archives.generateTitle(long);
  assert.ok(title.endsWith("…"));
  assert.ok(title.length <= 61);
  assert.equal(archives.generateTitle(""), "Untitled session");
});

test("isSessionComplete: council needs a Scholar answer AND a Judge ruling", () => {
  assert.equal(archives.isSessionComplete(buildSession()), true);
  assert.equal(
    archives.isSessionComplete(
      buildSession({ scholars: { scholar1: { status: "error", answer: null } } })
    ),
    false,
    "no valid Scholar answer"
  );
  assert.equal(
    archives.isSessionComplete(buildSession({ judge: { status: "error", answer: null } })),
    false,
    "Scholar answered but Judge did not rule"
  );
});

test("isSessionComplete: single mode only needs a Scholar answer", () => {
  const single = buildSession({ mode: "single", judge: null });
  assert.equal(archives.isSessionComplete(single), true);
});

test("a completed session is archived exactly once, even if saved twice", async () => {
  const session = buildSession();
  const first = await archives.archiveSession(session);
  const second = await archives.archiveSession(session);
  assert.ok(first && second);
  assert.equal(first.id, second.id);

  const files = (await fs.readdir(tmpDir)).filter((f) => f.startsWith(session.id));
  assert.equal(files.length, 1, "exactly one file for this session id");
});

test("an incomplete session is not archived (never blocks the run)", async () => {
  const incomplete = buildSession({ scholars: { scholar1: { status: "error", answer: null } } });
  const result = await archives.archiveSession(incomplete);
  assert.equal(result, null);
  const archive = await archives.getArchive(incomplete.id);
  assert.equal(archive, null);
});

test("saved sessions persist and can be read back", async () => {
  const session = buildSession({ question: "Persistence check question?" });
  await archives.archiveSession(session);
  const fetched = await archives.getArchive(session.id);
  assert.ok(fetched);
  assert.equal(fetched.id, session.id);
  assert.equal(fetched.question, "Persistence check question?");
  assert.equal(fetched.judge.answer, session.judge.answer);
  assert.equal(fetched.status, "completed");
});

test("archives list sorts newest first", async () => {
  const oldest = buildSession({ question: "sort-order oldest", finishedAt: "2020-01-01T00:00:00.000Z" });
  const middle = buildSession({ question: "sort-order middle", finishedAt: "2021-01-01T00:00:00.000Z" });
  const newest = buildSession({ question: "sort-order newest", finishedAt: "2022-01-01T00:00:00.000Z" });
  await Promise.all([oldest, middle, newest].map((s) => archives.archiveSession(s)));

  const ids = [oldest.id, middle.id, newest.id];
  const list = (await archives.listArchives()).filter((a) => ids.includes(a.id));
  assert.deepEqual(
    list.map((a) => a.id),
    [newest.id, middle.id, oldest.id]
  );
});

test("search matches archive title and original question", async () => {
  const marker = `xyzzy-${randomUUID().slice(0, 8)}`;
  const matchByQuestion = buildSession({ question: `Tell me about ${marker} please` });
  const noMatch = buildSession({ question: "Completely unrelated question" });
  await archives.archiveSession(matchByQuestion);
  await archives.archiveSession(noMatch);

  const results = await archives.listArchives(marker);
  const ids = results.map((a) => a.id);
  assert.ok(ids.includes(matchByQuestion.id));
  assert.ok(!ids.includes(noMatch.id));
});

test("search covers structured metadata: mode, scholar, provider, model, language", async () => {
  // A Mentor session answered by slot 3 under the zh-TW identity (理者),
  // running on Google/Gemini.
  const mentor = buildSession({
    question: "宇宙有多大？",
    mode: "single",
    judge: null,
    scholars: {
      scholar3: { slot: 3, persona: "理者", provider: "google", model: "gemini-3.1-flash-lite", status: "ok", answer: "很大。", error: null },
    },
    identity: { language: "zh-TW", judge: "大智者", scholars: { 1: "謀者", 2: "墨者", 3: "理者" } },
  });
  // A Council session on OpenAI/GPT with an Anthropic/Claude judge, in English.
  const council = buildSession({
    question: "How big is the universe?",
    mode: "council",
    scholars: {
      scholar1: { slot: 1, persona: "Architect", provider: "openai", model: "gpt-5.1", status: "ok", answer: "Big.", error: null },
    },
    judge: { status: "ok", provider: "anthropic", model: "claude-sonnet-4-5", answer: "## Agreement\nBig.", error: null },
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Architect", 2: "Oracle", 3: "Analyst" } },
  });
  await archives.archiveSession(mentor);
  await archives.archiveSession(council);

  const expect = async (query, { hit, miss }) => {
    const ids = (await archives.listArchives(query)).map((a) => a.id);
    assert.ok(ids.includes(hit.id), `"${query}" must match ${hit.mode} session`);
    assert.ok(!ids.includes(miss.id), `"${query}" must not match ${miss.mode} session`);
  };

  // Mode — by internal id, by display name (any case), and by zh name.
  await expect("mentor", { hit: mentor, miss: council });
  await expect("MENTOR", { hit: mentor, miss: council });
  await expect("導師", { hit: mentor, miss: council });
  await expect("council", { hit: council, miss: mentor });
  await expect("智囊團", { hit: council, miss: mentor });
  // Scholar — canonical slot names match across locales (persona was 理者).
  await expect("analyst", { hit: mentor, miss: council });
  await expect("理者", { hit: mentor, miss: council });
  await expect("architect", { hit: council, miss: mentor });
  // Provider vendor names and models.
  await expect("gemini", { hit: mentor, miss: council });
  await expect("google", { hit: mentor, miss: council });
  await expect("claude", { hit: council, miss: mentor });
  await expect("gpt", { hit: council, miss: mentor });
  // Display language.
  await expect("zh-TW", { hit: mentor, miss: council });

  // The stored record format is unchanged: no searchText on disk.
  const raw = JSON.parse(await fs.readFile(path.join(tmpDir, `${mentor.id}.json`), "utf8"));
  assert.equal("searchText" in raw, false, "searchText is derived, never persisted");
});

test("legacy mode:\"debate\" archives normalize to \"council\" when read, without rewriting the file on disk", async () => {
  const session = buildSession({ question: "A legacy record from before the Council rename." });
  await archives.archiveSession(session);

  // Simulate a genuinely pre-rename file: overwrite the persisted mode value
  // directly on disk, bypassing archiveSession() entirely.
  const filePath = path.join(tmpDir, `${session.id}.json`);
  const onDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
  onDisk.mode = "debate";
  await fs.writeFile(filePath, JSON.stringify(onDisk), "utf8");

  const summary = (await archives.listArchives("")).find((a) => a.id === session.id);
  assert.equal(summary.mode, "council", "list view normalizes a legacy mode value");

  const detail = await archives.getArchive(session.id);
  assert.equal(detail.mode, "council", "detail view normalizes a legacy mode value");

  // The normalization happens only when READING — the file itself is left
  // exactly as it was (never silently rewritten to "fix" old data).
  const stillOnDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(stillOnDisk.mode, "debate", "the archive file on disk is never rewritten");
});

test("list summaries carry participating provider ids, slot-ordered and deduped", async () => {
  const session = buildSession({
    scholars: {
      scholar2: { slot: 2, persona: "Oracle", provider: "anthropic", model: "claude-sonnet-4-5", status: "ok", answer: "B.", error: null },
      scholar1: { slot: 1, persona: "Architect", provider: "openai", model: "gpt-5.1", status: "ok", answer: "A.", error: null },
      scholar3: { slot: 3, persona: "Analyst", provider: "google", model: "gemini-3.1-flash-lite", status: "ok", answer: "C.", error: null },
    },
    // Judge shares a provider with a Scholar — must not appear twice.
    judge: { status: "ok", provider: "openai", model: "gpt-5.1", answer: "## Agreement\nOK.", error: null },
  });
  await archives.archiveSession(session);

  const summary = (await archives.listArchives("")).find((a) => a.id === session.id);
  assert.deepEqual(summary.providers, ["openai", "anthropic", "google"]);

  // Derived only — never persisted to the record on disk.
  const raw = JSON.parse(await fs.readFile(path.join(tmpDir, `${session.id}.json`), "utf8"));
  assert.equal("providers" in raw, false);
});

test("deleting an archive removes the record but never touches a Vault file", async () => {
  const vaultDir = path.join(tmpDir, "..", `fake-vault-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(vaultDir, { recursive: true });
  const vaultFile = path.join(vaultDir, "note.md");
  await fs.writeFile(vaultFile, "# A saved council note\n", "utf8");

  const session = buildSession({
    vault: { state: "saved", adapter: "local", path: vaultFile, savedAt: "2025-01-01T00:06:00.000Z" },
  });
  await archives.archiveSession(session);

  const deleted = await archives.deleteArchive(session.id);
  assert.equal(deleted, true);
  assert.equal(await archives.getArchive(session.id), null);

  const vaultFileStillExists = await fs
    .access(vaultFile)
    .then(() => true)
    .catch(() => false);
  assert.equal(vaultFileStillExists, true, "the Vault Markdown file must survive archive deletion");

  await fs.rm(vaultDir, { recursive: true, force: true });
});

test("deleting a non-existent archive returns false rather than throwing", async () => {
  const result = await archives.deleteArchive(`session-${randomUUID()}`);
  assert.equal(result, false);
});

// ============================================================
// Continue Discussion (archiveContinuationText) — Archives detail action
// ============================================================

test("archiveContinuationText: reuses the archive's own rendered Markdown (renderSessionNote), not a second rendering path", async () => {
  const session = buildSession({
    question: "Origin of the Big Bang?",
    mode: "council",
    scholars: {
      scholar1: { slot: 1, persona: "Architect", provider: "openai", model: "gpt-5.1", status: "ok", answer: "Answer A.", error: null },
    },
    judge: { status: "ok", provider: "anthropic", model: "claude-sonnet-4-5", answer: "## Agreement\nThe ruling.", error: null },
  });
  await archives.archiveSession(session);

  const continuation = await archives.archiveContinuationText(session.id);
  assert.equal(continuation.id, session.id);
  assert.equal(continuation.title, session.question);
  assert.equal(continuation.question, session.question);
  // The exact shape renderSessionMarkdown() produces: frontmatter, the
  // question as an H1, the Scholar answer, the Judge ruling.
  assert.match(continuation.markdown, /^---\n/);
  assert.match(continuation.markdown, /mode: council/);
  assert.match(continuation.markdown, /# Origin of the Big Bang\?/);
  assert.match(continuation.markdown, /Answer A\./);
  assert.match(continuation.markdown, /The ruling\./);
});

test("archiveContinuationText: unknown id returns null, never throws", async () => {
  assert.equal(await archives.archiveContinuationText(`session-${randomUUID()}`), null);
});

test("archiveContinuationText: never mutates the archive file on disk", async () => {
  const session = buildSession({ question: "Does continuing mutate the archive?" });
  await archives.archiveSession(session);
  const filePath = path.join(tmpDir, `${session.id}.json`);
  const before = await fs.readFile(filePath, "utf8");

  await archives.archiveContinuationText(session.id);

  const after = await fs.readFile(filePath, "utf8");
  assert.equal(after, before, "the archive file must be byte-for-byte unchanged");
});

test("archiveContinuationText: a legacy mode:\"debate\" archive continues as Council, not a fourth internal mode", async () => {
  const session = buildSession({ question: "A legacy record." });
  await archives.archiveSession(session);
  const filePath = path.join(tmpDir, `${session.id}.json`);
  const onDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
  onDisk.mode = "debate";
  await fs.writeFile(filePath, JSON.stringify(onDisk), "utf8");

  const continuation = await archives.archiveContinuationText(session.id);
  assert.match(continuation.markdown, /mode: council/);
  assert.doesNotMatch(continuation.markdown, /mode: debate/);
});

// ============================================================
// Archive Discussion Threads — thread lineage, grouping, sorting, search,
// delete behavior (listArchiveThreads(), normalizeThread())
// ============================================================

test("A: a brand-new archived session is effectively a single-item thread of itself", async () => {
  const session = buildSession({ question: "Standalone question" });
  await archives.archiveSession(session);
  const detail = await archives.getArchive(session.id);
  assert.equal(detail.threadId, session.id);
  assert.equal(detail.parentSessionId, null);
});

test("B/C: continuing A into B, then B into C — all three share one threadId, each parent points at the session it continued", async () => {
  const a = buildSession({ question: "A: root question", finishedAt: "2025-02-01T00:00:00.000Z" });
  await archives.archiveSession(a);
  const b = buildSession({
    question: "B: continues A",
    threadId: a.id,
    parentSessionId: a.id,
    finishedAt: "2025-02-02T00:00:00.000Z",
  });
  await archives.archiveSession(b);
  const c = buildSession({
    question: "C: continues B",
    threadId: a.id,
    parentSessionId: b.id,
    finishedAt: "2025-02-03T00:00:00.000Z",
  });
  await archives.archiveSession(c);

  const [aRead, bRead, cRead] = await Promise.all([a, b, c].map((s) => archives.getArchive(s.id)));
  assert.equal(bRead.threadId, aRead.threadId);
  assert.equal(bRead.parentSessionId, a.id);
  assert.equal(cRead.threadId, aRead.threadId);
  assert.equal(cRead.parentSessionId, b.id);
});

test("D: a legacy archive with no threadId/parentSessionId on disk normalizes as a single-item thread, file never rewritten", async () => {
  const session = buildSession({ question: "Pre-threads legacy record" });
  await archives.archiveSession(session);
  const filePath = path.join(tmpDir, `${session.id}.json`);
  const onDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
  delete onDisk.threadId;
  delete onDisk.parentSessionId;
  const beforeRaw = JSON.stringify(onDisk);
  await fs.writeFile(filePath, beforeRaw, "utf8");

  const detail = await archives.getArchive(session.id);
  assert.equal(detail.threadId, session.id);
  assert.equal(detail.parentSessionId, null);

  const summary = (await archives.listArchives("")).find((s) => s.id === session.id);
  assert.equal(summary.threadId, session.id);
  assert.equal(summary.parentSessionId, null);

  const afterRaw = await fs.readFile(filePath, "utf8");
  assert.equal(afterRaw, beforeRaw, "the legacy file must never be rewritten just to migrate it");
});

test("E/F: listArchiveThreads groups A/B/C under one thread (count 3), and continuing an old thread moves it to the top", async () => {
  const marker = `thread-ef-${randomUUID().slice(0, 8)}`;
  const a = buildSession({ question: `${marker} A`, finishedAt: "2020-01-01T00:00:00.000Z" });
  await archives.archiveSession(a);
  const b = buildSession({
    question: `${marker} B`,
    threadId: a.id,
    parentSessionId: a.id,
    finishedAt: "2020-01-02T00:00:00.000Z",
  });
  await archives.archiveSession(b);
  // A totally unrelated, freshly archived Session — recent, but not part of
  // this thread at all.
  const unrelated = buildSession({ question: `${marker} unrelated`, finishedAt: "2020-01-03T00:00:00.000Z" });
  await archives.archiveSession(unrelated);

  let threads = await archives.listArchiveThreads(marker);
  const thread = threads.find((t) => t.threadId === a.id);
  assert.ok(thread, "the thread must be found by its root session id");
  assert.equal(thread.count, 2);
  assert.deepEqual(thread.sessions.map((s) => s.id), [a.id, b.id], "oldest -> newest within the thread");
  assert.equal(thread.title, archives.generateTitle(a.question), "thread title is the root's own title");
  // The unrelated session is its own separate single-item thread.
  assert.ok(threads.some((t) => t.threadId === unrelated.id && t.count === 1));

  // Continue the OLD thread (A/B) with a brand-new C, dated after `unrelated`.
  const c = buildSession({
    question: `${marker} C`,
    threadId: a.id,
    parentSessionId: b.id,
    finishedAt: "2020-01-10T00:00:00.000Z",
  });
  await archives.archiveSession(c);

  threads = await archives.listArchiveThreads(marker);
  assert.equal(threads[0].threadId, a.id, "the continued thread moves to the top, ahead of the unrelated session");
  assert.equal(threads[0].count, 3);
});

test("G: a single-session thread carries count 1 (no grouping clutter)", async () => {
  const session = buildSession({ question: "Lone session, no continuations" });
  await archives.archiveSession(session);
  const thread = (await archives.listArchiveThreads()).find((t) => t.threadId === session.id);
  assert.equal(thread.count, 1);
  assert.equal(thread.sessions.length, 1);
});

test("J: searching text that only appears in a child session still surfaces its whole thread", async () => {
  const marker = `child-only-${randomUUID().slice(0, 8)}`;
  const a = buildSession({ question: "Root question, nothing special" });
  await archives.archiveSession(a);
  const b = buildSession({
    question: `Continuation mentioning ${marker}`,
    threadId: a.id,
    parentSessionId: a.id,
    finishedAt: "2025-03-02T00:00:00.000Z",
  });
  await archives.archiveSession(b);

  const threads = await archives.listArchiveThreads(marker);
  const thread = threads.find((t) => t.threadId === a.id);
  assert.ok(thread, "a match on the child must still surface the thread rooted at A");
  assert.equal(
    thread.title,
    archives.generateTitle(a.question),
    "the thread's displayed title stays the root's, even though the match was on the child"
  );
  assert.ok(thread.sessions.some((s) => s.id === b.id));
});

test("K: deleting a child leaves the thread intact with an updated count", async () => {
  const a = buildSession({ question: "K root" });
  await archives.archiveSession(a);
  const b = buildSession({ question: "K child", threadId: a.id, parentSessionId: a.id, finishedAt: "2025-04-02T00:00:00.000Z" });
  await archives.archiveSession(b);

  await archives.deleteArchive(b.id);

  const thread = (await archives.listArchiveThreads()).find((t) => t.threadId === a.id);
  assert.ok(thread, "the thread survives losing one of its sessions");
  assert.equal(thread.count, 1);
  assert.deepEqual(thread.sessions.map((s) => s.id), [a.id]);
});

test("L: deleting the root leaves surviving children readable under a deterministic fallback title", async () => {
  const a = buildSession({ question: "L root (about to be deleted)" });
  await archives.archiveSession(a);
  const b = buildSession({
    question: "L oldest surviving child",
    threadId: a.id,
    parentSessionId: a.id,
    finishedAt: "2025-05-02T00:00:00.000Z",
  });
  await archives.archiveSession(b);
  const c = buildSession({
    question: "L newest surviving child",
    threadId: a.id,
    parentSessionId: b.id,
    finishedAt: "2025-05-03T00:00:00.000Z",
  });
  await archives.archiveSession(c);

  await archives.deleteArchive(a.id);

  const thread = (await archives.listArchiveThreads()).find((t) => t.threadId === a.id);
  assert.ok(thread, "grouping keys off threadId, never a currently-existing root record");
  assert.equal(thread.count, 2);
  assert.equal(
    thread.title,
    archives.generateTitle(b.question),
    "falls back to the oldest surviving session's title"
  );
  assert.deepEqual(thread.sessions.map((s) => s.id), [b.id, c.id]);
});

test("N: an ordinary archived session (no parentSessionId ever set) never forms a thread with anything else", async () => {
  const lonely1 = buildSession({ question: "Ordinary session one" });
  const lonely2 = buildSession({ question: "Ordinary session two" });
  await Promise.all([lonely1, lonely2].map((s) => archives.archiveSession(s)));

  const threads = await archives.listArchiveThreads();
  const t1 = threads.find((t) => t.threadId === lonely1.id);
  const t2 = threads.find((t) => t.threadId === lonely2.id);
  assert.equal(t1.count, 1);
  assert.equal(t2.count, 1);
  assert.notEqual(t1.threadId, t2.threadId);
});
