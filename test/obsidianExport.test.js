// Tests for the optional Obsidian export workflow
// (src/services/obsidianExport.js + integration flags):
//   - the native Aether Vault save is always primary and never rolled back;
//   - exports only happen while the integration is enabled;
//   - disabling stops exports but deletes nothing (path + files retained);
//   - exports land only under aether-vault/sessions/ and never overwrite —
//     collisions get timestamp / numeric suffixes.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let config;
let vaultConnection;
let obsidianExport;
let sessionEngine;
let archives;
let tmpRoot;
let obsidianDir;
let nativeNote;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-export-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");

  config = await import("../src/config.js");
  vaultConnection = await import("../src/services/vaultConnection.js");
  obsidianExport = await import("../src/services/obsidianExport.js");
  sessionEngine = await import("../src/services/sessionEngine.js");
  archives = await import("../src/services/archives.js");

  // A user Obsidian vault with existing content, and a saved native note.
  obsidianDir = path.join(tmpRoot, "user-obsidian");
  await fs.mkdir(path.join(obsidianDir, ".obsidian"), { recursive: true });
  await fs.mkdir(path.join(obsidianDir, "01_Inbox"), { recursive: true });
  await fs.writeFile(path.join(obsidianDir, "01_Inbox", "mine.md"), "# mine\n", "utf8");

  nativeNote = path.join(tmpRoot, "native-vault", "20-working", "sessions", "research-session.md");
  await fs.mkdir(path.dirname(nativeNote), { recursive: true });
  await fs.writeFile(nativeNote, "# The saved session\n", "utf8");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Installs an active Session already saved to the native Vault.
function installSavedSession() {
  const session = sessionEngine.startSession({
    question: "Test question",
    mode: "single",
    scholars: { scholar1: { slot: 1, persona: "Oracle", status: "ok", answer: "Yes." } },
    judge: null,
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle" } },
    attachments: [],
  });
  session.status = "saved";
  session.vault = { state: "saved", adapter: "local", path: nativeNote, savedAt: new Date().toISOString() };
  return session;
}

beforeEach(() => {
  sessionEngine.resetSession();
});

test("export refuses while the integration is disabled — even with a remembered path", async () => {
  await vaultConnection.connectObsidianVault(obsidianDir); // connect enables…
  await vaultConnection.setObsidianIntegration(false); // …then user disables

  assert.equal(config.config.obsidianVaultPath !== "", true, "path is retained internally");
  assert.equal(obsidianExport.obsidianIntegrationEnabled(), false);

  installSavedSession();
  await assert.rejects(() => obsidianExport.exportActiveSessionToObsidian(), (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test("enabling with a remembered path is a flag flip; without one it demands the picker", async () => {
  const status = await vaultConnection.setObsidianIntegration(true);
  assert.equal(status.obsidian.enabled, true);

  // Simulate a fresh install with no remembered path.
  const saved = config.config.obsidianVaultPath;
  config.config.obsidianVaultPath = "";
  await assert.rejects(() => vaultConnection.setObsidianIntegration(true), (err) => {
    assert.equal(err.needsPath, true);
    return true;
  });
  config.config.obsidianVaultPath = saved;
});

test("export requires a prior native Vault save", async () => {
  await vaultConnection.setObsidianIntegration(true);
  sessionEngine.startSession({
    question: "Unsaved",
    mode: "single",
    scholars: { scholar1: { slot: 1, persona: "Oracle", status: "ok", answer: "Yes." } },
    judge: null,
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle" } },
    attachments: [],
  });
  await assert.rejects(() => obsidianExport.exportActiveSessionToObsidian(), (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test("export copies the saved note into aether-vault/sessions/ and never touches the native file", async () => {
  await vaultConnection.setObsidianIntegration(true);
  const session = installSavedSession();

  const result = await obsidianExport.exportActiveSessionToObsidian();
  assert.ok(
    result.path.startsWith(path.join(obsidianDir, "aether-vault", "sessions") + path.sep),
    "export must land inside aether-vault/sessions/"
  );
  assert.equal(await fs.readFile(result.path, "utf8"), "# The saved session\n");
  assert.equal(session.obsidianExport.path, result.path, "recorded on the session for the UI");

  // Native source of truth untouched, user's own Obsidian notes untouched.
  assert.equal(await fs.readFile(nativeNote, "utf8"), "# The saved session\n");
  assert.equal(await fs.readFile(path.join(obsidianDir, "01_Inbox", "mine.md"), "utf8"), "# mine\n");
});

test("name collisions get unique suffixes — existing exports are never overwritten", async () => {
  await vaultConnection.setObsidianIntegration(true);

  installSavedSession();
  const first = await obsidianExport.exportActiveSessionToObsidian();

  installSavedSession();
  const second = await obsidianExport.exportActiveSessionToObsidian();

  assert.notEqual(second.path, first.path, "second export must get a fresh filename");
  assert.match(
    path.basename(second.path),
    /^research-session-\d{8}-\d{6}(-\d+)?\.md$/,
    "collision resolves via timestamp (or numeric) suffix"
  );
  // Both files exist independently.
  assert.equal(await fs.readFile(first.path, "utf8"), "# The saved session\n");
  assert.equal(await fs.readFile(second.path, "utf8"), "# The saved session\n");
});

test("re-exporting the SAME session updates its own note in place — no duplicate is created", async () => {
  await vaultConnection.setObsidianIntegration(true);
  const session = installSavedSession();

  const first = await obsidianExport.exportActiveSessionToObsidian();

  // Simulate a follow-up: the native Vault note gains new content and is
  // saved again (same session, same vault.path).
  await fs.writeFile(nativeNote, "# The saved session\n\nA follow-up answer.\n", "utf8");

  const second = await obsidianExport.exportActiveSessionToObsidian();

  assert.equal(second.path, first.path, "re-export must reuse the same Obsidian note");
  assert.equal(session.obsidianExport.path, first.path);
  assert.equal(
    await fs.readFile(first.path, "utf8"),
    "# The saved session\n\nA follow-up answer.\n",
    "the existing note is updated in place with the latest content"
  );

  // Restore the shared native note so later tests see the original content.
  await fs.writeFile(nativeNote, "# The saved session\n", "utf8");
});

test("disabling after exports deletes nothing", async () => {
  await vaultConnection.setObsidianIntegration(true);
  installSavedSession();
  const result = await obsidianExport.exportActiveSessionToObsidian();

  const status = await vaultConnection.setObsidianIntegration(false);
  assert.equal(status.obsidian.enabled, false);
  assert.equal(status.obsidian.configured, true, "remembered path survives");
  assert.equal(await fs.readFile(result.path, "utf8"), "# The saved session\n", "exported file survives");

  // Auto-export preference also survives the disable/enable cycle.
  await vaultConnection.setObsidianAutoExport(true);
  await vaultConnection.setObsidianIntegration(false);
  assert.equal(obsidianExport.obsidianAutoExportEnabled(), false, "suspended while disabled");
  const reEnabled = await vaultConnection.setObsidianIntegration(true);
  assert.equal(reEnabled.obsidian.autoExport, true, "preference restored with the integration");
  assert.equal(obsidianExport.obsidianAutoExportEnabled(), true);
  await vaultConnection.setObsidianAutoExport(false);
});

// ---------------------------------------------------- archive sync (Archives)
// exportArchiveToObsidian(): the Archives-screen recovery path — syncing a
// session AFTER it was reset, straight from its archive record.

test("archive sync refuses with notConfigured while the integration is disabled", async () => {
  await vaultConnection.setObsidianIntegration(false);
  const session = installSavedSession();
  const record = await archives.archiveSession(session);
  sessionEngine.resetSession();

  await assert.rejects(() => obsidianExport.exportArchiveToObsidian(record.id), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.notConfigured, true, "structured flag for the UI's settings prompt");
    return true;
  });
  await vaultConnection.setObsidianIntegration(true);
});

test("archive sync copies the saved Vault note after the session was reset, and keeps the archive", async () => {
  await vaultConnection.setObsidianIntegration(true);
  const session = installSavedSession();
  const record = await archives.archiveSession(session);
  sessionEngine.resetSession(); // the "forgot to export, then reset" scenario

  const result = await obsidianExport.exportArchiveToObsidian(record.id);
  assert.ok(
    result.path.startsWith(path.join(obsidianDir, "aether-vault", "sessions") + path.sep),
    "sync lands inside aether-vault/sessions/ like every export"
  );
  assert.equal(await fs.readFile(result.path, "utf8"), "# The saved session\n");

  // The archive record survives and now remembers its export.
  const updated = await archives.getArchive(record.id);
  assert.equal(updated.obsidianExport.path, result.path);

  // Re-syncing updates the same note in place — never a second file.
  const again = await obsidianExport.exportArchiveToObsidian(record.id);
  assert.equal(again.path, result.path, "re-sync must reuse the same Obsidian note");

  // Removing the archive never touches the synced Obsidian copy.
  assert.equal(await archives.deleteArchive(record.id), true);
  assert.equal(await fs.readFile(result.path, "utf8"), "# The saved session\n", "synced copy survives removal");
});

test("archive sync falls back to rendering the record when no Vault file exists", async () => {
  await vaultConnection.setObsidianIntegration(true);
  const session = sessionEngine.startSession({
    question: "Recovered without a Vault save",
    mode: "single",
    scholars: { scholar1: { slot: 1, persona: "Oracle", status: "ok", answer: "The recovered answer." } },
    judge: null,
    identity: { language: "en", judge: "Grand Sage", scholars: { 1: "Oracle" } },
    attachments: [],
  });
  const record = await archives.archiveSession(session); // vault.state stays "unsaved"
  sessionEngine.resetSession();

  const result = await obsidianExport.exportArchiveToObsidian(record.id);
  const content = await fs.readFile(result.path, "utf8");
  assert.match(content, /session_id: /, "rendered note carries the session frontmatter");
  assert.match(content, /# Recovered without a Vault save/);
  assert.match(content, /The recovered answer\./);
  await archives.deleteArchive(record.id);
});

test("archive sync of a missing archive is a 404", async () => {
  await vaultConnection.setObsidianIntegration(true);
  await assert.rejects(() => obsidianExport.exportArchiveToObsidian("session-does-not-exist"), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
});
