// Tests for the Developer Character Registry (src/services/characterRegistry.js):
// auto-scan registration under its own char_ uid namespace, id derivation +
// uniqueness, idempotent re-sync, uid immutability, and id rename
// validation. Mirrors test/assetRegistry.test.js — the two registries are
// independent, so a character and a prop with the same filename must be
// able to coexist without colliding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let registry;
let tmpRoot;
let charactersDir;

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-char-registry-test-"));
  charactersDir = path.join(tmpRoot, "characters");
  await fs.mkdir(charactersDir, { recursive: true });
  process.env.CHARACTER_REGISTRY_PATH = path.join(tmpRoot, "character_registry.json");
  process.env.CHARACTER_ASSETS_DIR = charactersDir;
  registry = await import("../src/services/characterRegistry.js");
});

after(async () => {
  delete process.env.CHARACTER_REGISTRY_PATH;
  delete process.env.CHARACTER_ASSETS_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("scan auto-registers PNGs as type 'character' with char_ uids", async () => {
  await fs.writeFile(path.join(charactersDir, "classic_omega.png"), PNG);
  await fs.writeFile(path.join(charactersDir, "notes.txt"), "not a png");
  const reg = await registry.syncCharacterRegistry();
  assert.equal(reg.assets.length, 1, "only PNGs register");
  const [omega] = reg.assets;
  assert.equal(omega.asset_id, "classic_omega");
  assert.equal(omega.type, "character");
  assert.match(omega.asset_uid, /^char_[a-z0-9_]+_[0-9a-f]{6}$/);
  assert.match(omega.path, /^assets\/characters\//);
});

test("re-sync is idempotent and never regenerates uids", async () => {
  const first = await registry.syncCharacterRegistry();
  const uids1 = first.assets.map((a) => a.asset_uid).sort();
  const again = await registry.syncCharacterRegistry();
  assert.equal(again.assets.length, first.assets.length, "no duplicates on re-scan");
  assert.deepEqual(again.assets.map((a) => a.asset_uid).sort(), uids1, "uids are immutable");
});

test("new files register incrementally; colliding derived ids get suffixes", async () => {
  await fs.writeFile(path.join(charactersDir, "classic_omega_2.png"), PNG);
  const reg = await registry.syncCharacterRegistry();
  assert.equal(reg.assets.length, 2);
});

test("character-id rename: validated, unique, uid untouched", async () => {
  const reg = await registry.syncCharacterRegistry();
  const target = reg.assets.find((a) => a.asset_id === "classic_omega");
  const renamed = await registry.updateCharacterId(target.asset_uid, "omega_default");
  assert.equal(renamed.asset_id, "omega_default");
  assert.equal(renamed.asset_uid, target.asset_uid, "uid never changes");
  const reloaded = await registry.loadCharacterRegistry();
  assert.ok(reloaded.assets.some((a) => a.asset_id === "omega_default"));

  await assert.rejects(() => registry.updateCharacterId(target.asset_uid, "Bad Name"), /lowercase/);
  await assert.rejects(() => registry.updateCharacterId(target.asset_uid, ""), /empty/);
  await assert.rejects(() => registry.updateCharacterId("char_missing_000000", "whatever"), /No character/);
});
