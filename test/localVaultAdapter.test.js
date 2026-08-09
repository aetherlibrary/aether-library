// Tests for human-readable session filenames (src/vault/localVaultAdapter.js):
// the filename is the question itself (no UUID — that lives only in the
// frontmatter as session_id), re-saves update the session's own file, name
// collisions get " (2)" suffixes, and an existing note that is not ours is
// never overwritten — including a note the user replaced by hand.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

let config;
let adapter;
let tmpRoot;
let sessionsDir;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-adapter-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");

  config = await import("../src/config.js");
  adapter = (await import("../src/vault/localVaultAdapter.js")).localVaultAdapter;

  config.config.vaultPath = path.join(tmpRoot, "vault");
  sessionsDir = path.join(config.config.vaultPath, "20-working", "sessions");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function makeSession(question) {
  return {
    id: `session-${randomUUID()}`,
    question,
    mode: "single",
    status: "saved",
    startedAt: "2026-07-13T00:00:00.000Z",
    finishedAt: "2026-07-13T00:05:00.000Z",
    scholars: { scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "m", status: "ok", answer: "A.", error: null } },
    judge: null,
    identity: { language: "zh-TW", judge: "大智者", scholars: { 1: "謀者" } },
    vault: { state: "unsaved", adapter: null, path: null, savedAt: null },
    attachments: [],
    chat: [],
  };
}

// Mirrors how the Session Engine records a save result on the session.
async function save(session) {
  const result = await adapter.saveSession(session);
  session.vault = { state: "saved", adapter: result.adapter, path: result.path, savedAt: result.savedAt };
  return result;
}

test("filename is the readable question — no UUID; session_id stays in frontmatter", async () => {
  const session = makeSession("地球的年紀大概多少");
  const result = await save(session);

  assert.equal(path.basename(result.path), "地球的年紀大概多少.md");
  assert.ok(!path.basename(result.path).includes(session.id), "UUID must not appear in the filename");

  const content = await fs.readFile(result.path, "utf8");
  assert.match(content, new RegExp(`^---\\nsession_id: ${session.id}\\n`), "frontmatter keeps the session id");
});

test("re-saving the same session updates its own file, no duplicates", async () => {
  const session = makeSession("同一個問題再存一次");
  const first = await save(session);
  session.chat.push({ role: "user", text: "follow-up", at: "2026-07-13T00:06:00.000Z" });
  const second = await save(session);

  assert.equal(second.path, first.path, "same file on re-save");
  const files = (await fs.readdir(sessionsDir)).filter((f) => f.startsWith("同一個問題再存一次"));
  assert.equal(files.length, 1, "no duplicate files");
  assert.match(await fs.readFile(first.path, "utf8"), /follow-up/, "file content was updated");
});

test("a different session with the same question gets ' (2)' — nothing overwritten", async () => {
  const a = makeSession("撞名的問題");
  const b = makeSession("撞名的問題");
  const first = await save(a);
  const second = await save(b);

  assert.equal(path.basename(first.path), "撞名的問題.md");
  assert.equal(path.basename(second.path), "撞名的問題 (2).md");
  assert.match(await fs.readFile(first.path, "utf8"), new RegExp(a.id), "first file still belongs to session A");
  assert.match(await fs.readFile(second.path, "utf8"), new RegExp(b.id), "second file belongs to session B");
});

test("a note the user replaced by hand is never overwritten on re-save", async () => {
  const session = makeSession("使用者改寫過的筆記");
  const first = await save(session);

  // The user rewrites the note as their own (frontmatter no longer ours).
  await fs.writeFile(first.path, "# My own note now\n", "utf8");

  const second = await save(session);
  assert.notEqual(second.path, first.path, "must move aside instead of clobbering");
  assert.equal(await fs.readFile(first.path, "utf8"), "# My own note now\n", "user's note untouched");
  assert.equal(path.basename(second.path), "使用者改寫過的筆記 (2).md");
});

test("illegal filesystem characters are stripped; long questions are capped", async () => {
  const messy = makeSession('What is C:\\Windows\\System32? "Really?" <yes|no>');
  const result = await save(messy);
  assert.ok(!/[\\/:*?"<>|]/.test(path.basename(result.path).replace(".md", "")), "no illegal characters");

  const long = makeSession("字".repeat(200));
  const longResult = await save(long);
  assert.ok(path.basename(longResult.path, ".md").length <= 60, "stem capped for readability");
});

test("an empty or unusable question falls back to 'session'", async () => {
  const result = await save(makeSession("???"));
  assert.equal(path.basename(result.path), "session.md");
});

test("frontmatter uses product terminology: mode mentor, canonical scholar, provider, model", async () => {
  const mentor = makeSession("導師模式的問題");
  mentor.scholars = {
    scholar3: { slot: 3, persona: "理者", provider: "google", model: "gemini-3.1-flash-lite", status: "ok", answer: "A.", error: null },
  };
  const result = await save(mentor);
  const head = (await fs.readFile(result.path, "utf8")).split("---")[1];

  assert.match(head, /\nmode: mentor\n/, "internal 'single' never appears");
  assert.match(head, /\nscholar: analyst\n/, "canonical product name, even for a zh persona");
  assert.match(head, /\nscholar_count: 1\n/);
  assert.match(head, /\nprovider: google\n/);
  assert.match(head, /\nmodel: gemini-3\.1-flash-lite\n/);
  assert.ok(!head.includes("mode: single"));
});

// council's product name is "council" itself (see the terminology note on
// MODE_PRODUCT_NAMES) — unlike the sibling Mentor test above, this can't
// demonstrate the product-name/internal-name distinction (they coincide by
// design); it only confirms the frontmatter actually says "council" and
// still omits the sole-scholar-only fields.
test("frontmatter uses product terminology: mode council, count only (no sole-scholar fields)", async () => {
  const council = makeSession("智囊團模式的問題");
  council.mode = "council";
  council.scholars = {
    scholar1: { slot: 1, persona: "Architect", provider: "openai", model: "gpt-5.1", status: "ok", answer: "A.", error: null },
    scholar2: { slot: 2, persona: "Oracle", provider: "anthropic", model: "claude-sonnet-4-5", status: "ok", answer: "B.", error: null },
  };
  council.judge = { status: "ok", provider: "anthropic", model: "claude-sonnet-4-5", answer: "## Agreement\nOK.", error: null };
  const result = await save(council);
  const head = (await fs.readFile(result.path, "utf8")).split("---")[1];

  assert.match(head, /\nmode: council\n/);
  assert.match(head, /\nscholar_count: 2\n/);
  assert.ok(!/\nscholar: /.test(head), "no single-scholar line in Council frontmatter");
  assert.ok(!/\nprovider: /.test(head), "no top-level provider line in Council frontmatter");
});

test("a follow-up turn's own attachment is rendered next to that turn, distinct from the session-level attachments section", async () => {
  const session = makeSession("後續問題中附加了圖片");
  session.attachments = [{ kind: "document", name: "original.pdf" }]; // the initial question's own materials
  session.chat = [
    { role: "user", text: "還有這張圖呢？", attachments: [{ kind: "image", name: "photo.png" }] },
    { role: "assistant", text: "這是一張風景照。" },
    { role: "user", text: "謝謝" }, // a later turn with no attachment at all
    { role: "assistant", text: "不客氣" },
  ];
  const result = await save(session);
  const body = await fs.readFile(result.path, "utf8");

  // Session-level section (original question's materials) still present.
  assert.match(body, /## Attached materials\n\n- 📄 original\.pdf/);
  // The follow-up turn's own attachment is listed right under that turn.
  assert.match(body, /\*\*You:\*\* 還有這張圖呢？\n_🖼 photo\.png_/);
  // A turn with nothing attached gets no attachment line — straight to the
  // blank line separating it from the next turn.
  assert.match(body, /\*\*You:\*\* 謝謝\n\n/);
});
