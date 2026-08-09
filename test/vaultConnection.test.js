// Tests for the Vault Connection service (src/services/vaultConnection.js):
// picking/validating/persisting the connected Vault folder. Runs against an
// isolated temp .env.local (via ENV_FILE_PATH) and a temp archive dir (via
// ARCHIVE_DIR) so it never touches the real dev environment.
//
// pickFolder() and the success path of openFolder() are NOT covered here —
// they launch a real native OS dialog / file manager window, which isn't
// something an automated test should pop up. Those need a manual pass (see
// the verify skill). connectVault()'s validation and persistence, and the
// "Archives are unaffected by a Vault change" requirement, are fully covered.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

let vaultConnection;
let archives;
let vault;
let config;
let tmpRoot;
let envFile;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-vault-test-"));
  envFile = path.join(tmpRoot, ".env.local");
  process.env.ENV_FILE_PATH = envFile;
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");

  config = await import("../src/config.js");
  vault = await import("../src/services/vault.js");
  vaultConnection = await import("../src/services/vaultConnection.js");
  archives = await import("../src/services/archives.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function makeVaultFolder(name) {
  const dir = path.join(tmpRoot, name);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

test("with no Vault connected, status reports unconfigured", async () => {
  const status = await vault.vaultStatus();
  assert.equal(status.configured, false);
  assert.equal(status.exists, false);
  assert.equal(status.path, "");
});

test("connectVault rejects a folder that doesn't exist", async () => {
  const missing = path.join(tmpRoot, "does-not-exist");
  await assert.rejects(() => vaultConnection.connectVault(missing), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
});

test("connectVault rejects a path that is a file, not a folder", async () => {
  const filePath = path.join(tmpRoot, "not-a-folder.txt");
  await fs.writeFile(filePath, "hello", "utf8");
  await assert.rejects(() => vaultConnection.connectVault(filePath), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test("connectVault rejects an empty path", async () => {
  await assert.rejects(() => vaultConnection.connectVault(""), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test("connectVault persists a valid folder and status reflects it", async () => {
  const dir = await makeVaultFolder("vault-a");
  const status = await vaultConnection.connectVault(dir);

  assert.equal(status.configured, true);
  assert.equal(status.exists, true);
  assert.equal(path.resolve(status.path), path.resolve(dir));

  // Persisted through the real settings pipeline, not just in memory.
  const envContents = await fs.readFile(envFile, "utf8");
  assert.match(envContents, /VAULT_PATH=/);

  // reloadConfig() picked it up.
  assert.equal(path.resolve(config.config.vaultPath), path.resolve(dir));
});

test("changing Vault location switches future sessions without touching the old folder", async () => {
  const oldDir = await makeVaultFolder("vault-old");
  const markerFile = path.join(oldDir, "keep-me.md");
  await fs.writeFile(markerFile, "# still here\n", "utf8");
  await vaultConnection.connectVault(oldDir);

  const newDir = await makeVaultFolder("vault-new");
  const status = await vaultConnection.connectVault(newDir);

  assert.equal(path.resolve(status.path), path.resolve(newDir));
  assert.equal(path.resolve(config.config.vaultPath), path.resolve(newDir));

  // The old Vault folder and its contents are untouched — never moved or deleted.
  const oldStillExists = await fs
    .access(oldDir)
    .then(() => true)
    .catch(() => false);
  const markerStillExists = await fs
    .access(markerFile)
    .then(() => true)
    .catch(() => false);
  assert.equal(oldStillExists, true);
  assert.equal(markerStillExists, true);
});

test("changing Vault location does not affect existing archive records", async () => {
  const vaultA = await makeVaultFolder("vault-archive-a");
  await vaultConnection.connectVault(vaultA);

  const session = {
    id: `session-${randomUUID()}`,
    question: "Does changing the Vault touch old archives?",
    mode: "single",
    status: "active",
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:05:00.000Z",
    scholars: {
      scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-5.1", status: "ok", answer: "No.", error: null },
    },
    judge: null,
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle", 2: "Hierophant", 3: "Illuminator" } },
    vault: { state: "saved", adapter: "local", path: path.join(vaultA, "20-working", "sessions", "note.md"), savedAt: "2025-01-01T00:06:00.000Z" },
    attachments: [],
    chat: [],
  };
  await archives.archiveSession(session);

  const vaultB = await makeVaultFolder("vault-archive-b");
  await vaultConnection.connectVault(vaultB);

  const archived = await archives.getArchive(session.id);
  assert.ok(archived, "archive record must still exist");
  assert.equal(archived.vault.path, session.vault.path, "archive keeps referencing its original Vault path");
  assert.ok(
    archived.vault.path.startsWith(vaultA),
    "archived Vault reference must still point at the Vault it was actually saved to, not the newly connected one"
  );
});

test("openFolder refuses when no Vault is connected", async () => {
  await assert.rejects(() => vaultConnection.openFolder(""), (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test("openFolder refuses a Vault path that no longer exists on disk", async () => {
  const goneDir = path.join(tmpRoot, "vault-gone");
  await assert.rejects(() => vaultConnection.openFolder(goneDir), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
});
