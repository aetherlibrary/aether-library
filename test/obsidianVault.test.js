// Tests for the Obsidian write jail (src/vault/obsidianVault.js) and the
// read-only connection guarantee (connectObsidianVault): Aether Library must
// never modify a user's existing Obsidian organization. Every generated file
// lives under the single dedicated `aether-vault/` folder; everything outside
// it is read-only by construction.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH) so it never
// touches the real dev environment.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let config;
let vaultConnection;
let obsidianVault;
let tmpRoot;
let obsidianDir;

// The user's pre-existing Obsidian organization, recreated fresh per suite.
const USER_TREE = {
  ".obsidian/app.json": "{}",
  "01_Inbox/idea.md": "# An idea\n",
  "02_Notes/note.md": "# A note\n",
  "Manga/one-piece.md": "# Chapters\n",
};

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-obsidian-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");

  config = await import("../src/config.js");
  vaultConnection = await import("../src/services/vaultConnection.js");
  obsidianVault = await import("../src/vault/obsidianVault.js");

  obsidianDir = path.join(tmpRoot, "user-obsidian");
  for (const [rel, content] of Object.entries(USER_TREE)) {
    const file = path.join(obsidianDir, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Recursive { relativePath: content } snapshot of the user's vault,
// excluding aether-vault/ (the one folder Aether Library owns).
async function snapshotUserContent(dir = obsidianDir, base = obsidianDir) {
  const out = {};
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).replaceAll("\\", "/");
    if (rel === obsidianVault.OBSIDIAN_WRITE_ROOT) continue;
    if (entry.isDirectory()) Object.assign(out, await snapshotUserContent(abs, base));
    else out[rel] = await fs.readFile(abs, "utf8");
  }
  return out;
}

test("write APIs refuse when no Obsidian vault is connected", async () => {
  for (const call of [
    () => obsidianVault.writeRootPath(),
    () => obsidianVault.resolveWritePath("sessions/a.md"),
  ]) {
    assert.throws(call, (err) => {
      assert.equal(err.status, 409);
      return true;
    });
  }
  await assert.rejects(() => obsidianVault.writeFileInVault("sessions/a.md", "x"), (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test("connecting an Obsidian vault is read-only: nothing changes, nothing is created", async () => {
  const before = await snapshotUserContent();
  const status = await vaultConnection.connectObsidianVault(obsidianDir);

  assert.equal(status.obsidian.configured, true);
  assert.deepEqual(await snapshotUserContent(), before, "user content must be byte-identical");

  // Not even aether-vault/ appears at connect time — only on first write.
  await assert.rejects(() => fs.access(path.join(obsidianDir, "aether-vault")));
});

test("resolveWritePath jails every path under aether-vault/", () => {
  const inside = obsidianVault.resolveWritePath("sessions/note.md");
  assert.ok(inside.startsWith(path.join(obsidianDir, "aether-vault") + path.sep));

  const escapes = [
    "../01_Inbox/evil.md", // plain traversal
    "sessions/../../02_Notes/evil.md", // nested traversal
    path.join(obsidianDir, "01_Inbox", "evil.md"), // absolute path
    "C:/Windows/evil.md", // drive switch
    "..", // vault root itself
    ".", // the write root itself, not a file inside it
    "", // nothing
  ];
  for (const attempt of escapes) {
    assert.throws(
      () => obsidianVault.resolveWritePath(attempt),
      (err) => {
        assert.equal(err.status, 400, `must refuse: ${JSON.stringify(attempt)}`);
        return true;
      },
      `must refuse: ${JSON.stringify(attempt)}`
    );
  }
});

test("writeFileInVault writes only inside aether-vault/ and leaves user content untouched", async () => {
  const before = await snapshotUserContent();

  const target = await obsidianVault.writeFileInVault("sessions/first-session.md", "# Saved\n");
  assert.ok(target.startsWith(path.join(obsidianDir, "aether-vault") + path.sep));
  assert.equal(await fs.readFile(target, "utf8"), "# Saved\n");

  // Worst case realized: exactly one new folder, everything else identical.
  assert.deepEqual(await snapshotUserContent(), before);
});

test("escape attempts through the write APIs create nothing outside aether-vault/", async () => {
  const before = await snapshotUserContent();

  await assert.rejects(() => obsidianVault.writeFileInVault("../01_Inbox/injected.md", "evil"));
  await assert.rejects(() => obsidianVault.mkdirInVault("../../somewhere-else"));

  assert.deepEqual(await snapshotUserContent(), before);
});

test("a symlink inside aether-vault/ cannot redirect writes into user folders", async (t) => {
  await obsidianVault.ensureWriteRoot();
  const link = path.join(obsidianDir, "aether-vault", "sneaky");
  try {
    // Junction type works without elevation on Windows; plain symlink elsewhere.
    await fs.symlink(path.join(obsidianDir, "01_Inbox"), link, process.platform === "win32" ? "junction" : "dir");
  } catch {
    t.skip("cannot create symlinks in this environment");
    return;
  }

  const before = await snapshotUserContent();
  await assert.rejects(() => obsidianVault.writeFileInVault("sneaky/injected.md", "evil"), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
  assert.deepEqual(await snapshotUserContent(), before, "01_Inbox must not receive the file");
  await fs.rm(link, { recursive: true, force: true });
});

test("the write root is the documented constant", () => {
  assert.equal(obsidianVault.OBSIDIAN_WRITE_ROOT, "aether-vault");
});
