// Tests for the Council Model Pre-check's settings/config persistence:
//   - councilAutoCheck / councilAckSignature round-trip through the SAME
//     .env.local mechanism every other setting uses (saveSettings() in
//     src/services/settings.js, read back via publicConfig() in
//     src/config.js) — no separate client-only preference store.
//   - each provider's keyFingerprint (publicConfig()) is a non-secret,
//     deterministic, key-dependent value the frontend uses to detect a
//     relevant API credential change without ever seeing the key itself.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH), like
// timeouts.test.js, so it never touches the real project config/.env.local.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let config;
let settings;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-council-settings-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(process.env.ENV_FILE_PATH, "\n", "utf8");
  config = await import("../src/config.js");
  settings = await import("../src/services/settings.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("councilAutoCheck defaults to off (an explicit opt-in, since the check spends the player's own API credit)", () => {
  assert.equal(config.publicConfig().councilAutoCheck, false);
});

test("councilAutoCheck persists through saveSettings() -> .env.local -> publicConfig(), same path as every other setting", () => {
  settings.saveSettings({ councilAutoCheck: "true" });
  assert.equal(config.publicConfig().councilAutoCheck, true);
  settings.saveSettings({ councilAutoCheck: "false" });
  assert.equal(config.publicConfig().councilAutoCheck, false);
});

test("councilAckSignature persists verbatim and survives a config reload", () => {
  const sig = "s1:openai:gpt-5.1:abc123|judge:anthropic:claude-sonnet-4-5:def456";
  settings.saveSettings({ councilAckSignature: sig });
  assert.equal(config.publicConfig().councilAckSignature, sig);
  config.reloadConfig();
  assert.equal(config.publicConfig().councilAckSignature, sig);
});

test("a provider with no API key has an empty keyFingerprint", () => {
  const pub = config.publicConfig();
  assert.equal(pub.providers.openai.keyFingerprint, "");
});

test("keyFingerprint is non-empty, deterministic, and never the key itself once a key is set", () => {
  settings.saveSettings({ openaiApiKey: "sk-test-fingerprint-key-one" });
  const fp1 = config.publicConfig().providers.openai.keyFingerprint;
  assert.notEqual(fp1, "");
  assert.doesNotMatch(fp1, /sk-test-fingerprint-key-one/);
  // Same key again -> identical fingerprint (deterministic, not a nonce).
  config.reloadConfig();
  const fp1Again = config.publicConfig().providers.openai.keyFingerprint;
  assert.equal(fp1, fp1Again);
});

test("keyFingerprint changes when the underlying API key changes — this is how a 'relevant API credential changed' is detected", () => {
  settings.saveSettings({ openaiApiKey: "sk-test-fingerprint-key-one" });
  const fp1 = config.publicConfig().providers.openai.keyFingerprint;
  settings.saveSettings({ openaiApiKey: "sk-test-fingerprint-key-two" });
  const fp2 = config.publicConfig().providers.openai.keyFingerprint;
  assert.notEqual(fp1, fp2);
});
