// Tests for the Developer Asset Registry (src/services/assetRegistry.js):
// auto-scan registration, id derivation + uniqueness, idempotent re-sync,
// uid immutability, and asset-id rename validation.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let registry;
let tmpRoot;
let propsDir;

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-registry-test-"));
  propsDir = path.join(tmpRoot, "props");
  await fs.mkdir(propsDir, { recursive: true });
  process.env.ASSET_REGISTRY_PATH = path.join(tmpRoot, "asset_registry.json");
  process.env.ASSET_PROPS_DIR = propsDir;
  registry = await import("../src/services/assetRegistry.js");
});

after(async () => {
  delete process.env.ASSET_REGISTRY_PATH;
  delete process.env.ASSET_PROPS_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("scan auto-registers PNGs with derived ids and asset_ uids", async () => {
  await fs.writeFile(path.join(propsDir, "bookshelf.png"), PNG);
  await fs.writeFile(path.join(propsDir, "Record Player-v2.PNG"), PNG);
  await fs.writeFile(path.join(propsDir, "notes.txt"), "not a png");
  const reg = await registry.syncAssetRegistry();
  assert.equal(reg.assets.length, 2, "only PNGs register");
  const ids = reg.assets.map((a) => a.asset_id).sort();
  assert.deepEqual(ids, ["bookshelf", "record_player_v2"]);
  for (const a of reg.assets) {
    assert.match(a.asset_uid, /^asset_[a-z0-9_]+_[0-9a-f]{6}$/);
    assert.equal(a.type, "prop");
    assert.match(a.path, /^assets\/props\//);
  }
});

test("re-sync is idempotent and never regenerates uids", async () => {
  const first = await registry.syncAssetRegistry();
  const uids1 = first.assets.map((a) => a.asset_uid).sort();
  const again = await registry.syncAssetRegistry();
  assert.equal(again.assets.length, first.assets.length, "no duplicates on re-scan");
  assert.deepEqual(again.assets.map((a) => a.asset_uid).sort(), uids1, "uids are immutable");
});

test("new files register incrementally; colliding derived ids get suffixes", async () => {
  // Distinct filename on every filesystem (Windows is case-insensitive, so
  // BOOKSHELF.png would alias bookshelf.png), but derives "bookshelf" again.
  await fs.writeFile(path.join(propsDir, "bookshelf#.png"), PNG);
  const reg = await registry.syncAssetRegistry();
  assert.equal(reg.assets.length, 3);
  const ids = reg.assets.map((a) => a.asset_id);
  assert.ok(ids.includes("bookshelf") && ids.includes("bookshelf_2"), `unique ids, got ${ids}`);
});

test("asset-id rename: validated, unique, uid untouched", async () => {
  const reg = await registry.syncAssetRegistry();
  const target = reg.assets.find((a) => a.asset_id === "bookshelf_2");
  const renamed = await registry.updateAssetId(target.asset_uid, "tall_bookshelf");
  assert.equal(renamed.asset_id, "tall_bookshelf");
  assert.equal(renamed.asset_uid, target.asset_uid, "uid never changes");
  const reloaded = await registry.loadAssetRegistry();
  assert.ok(reloaded.assets.some((a) => a.asset_id === "tall_bookshelf"));

  await assert.rejects(() => registry.updateAssetId(target.asset_uid, "Bad Name"), /lowercase/);
  await assert.rejects(() => registry.updateAssetId(target.asset_uid, ""), /empty/);
  await assert.rejects(() => registry.updateAssetId(target.asset_uid, "bookshelf"), /already in use/);
  await assert.rejects(() => registry.updateAssetId("asset_missing_000000", "whatever"), /No asset/);
});

test("placementLimit: validated, persisted, survives rescan AND asset-id rename, clearable", async () => {
  const reg = await registry.syncAssetRegistry();
  const target = reg.assets.find((a) => a.asset_id === "bookshelf");

  await assert.rejects(() => registry.updatePlacementLimit(target.asset_uid, -1), /non-negative integer/);
  await assert.rejects(() => registry.updatePlacementLimit(target.asset_uid, 2.5), /non-negative integer/);
  await assert.rejects(() => registry.updatePlacementLimit(target.asset_uid, "3"), /non-negative integer/);
  await assert.rejects(() => registry.updatePlacementLimit("asset_missing_000000", 1), /No asset/);

  const set = await registry.updatePlacementLimit(target.asset_uid, 4);
  assert.equal(set.placementLimit, 4);
  assert.equal(set.asset_uid, target.asset_uid, "uid untouched");

  // Rescan is idempotent and must never strip the limit.
  const rescanned = await registry.syncAssetRegistry();
  assert.equal(rescanned.assets.find((a) => a.asset_uid === target.asset_uid).placementLimit, 4);

  // Renaming the EDITABLE asset_id must not reset the limit.
  await registry.updateAssetId(target.asset_uid, "bookshelf_renamed");
  const afterRename = await registry.loadAssetRegistry();
  const entry = afterRename.assets.find((a) => a.asset_uid === target.asset_uid);
  assert.equal(entry.asset_id, "bookshelf_renamed");
  assert.equal(entry.placementLimit, 4, "rename preserves placementLimit");
  await registry.updateAssetId(target.asset_uid, "bookshelf"); // restore for other tests

  // 0 is a valid stored value (= unavailable to players).
  const zero = await registry.updatePlacementLimit(target.asset_uid, 0);
  assert.equal(zero.placementLimit, 0);

  // null clears the field entirely (absent = no player-facing limit).
  const cleared = await registry.updatePlacementLimit(target.asset_uid, null);
  assert.ok(!("placementLimit" in cleared), "null removes the field");
  const reloaded = await registry.loadAssetRegistry();
  assert.ok(!("placementLimit" in reloaded.assets.find((a) => a.asset_uid === target.asset_uid)));
});

test("canPlaceAsset: developer mode is always allowed; player mode counts by IMMUTABLE uid against placementLimit", () => {
  const assets = [
    { asset_uid: "asset_desk_aaaaaa", asset_id: "core_desk", placementLimit: 1 },
    { asset_uid: "asset_plant_bbbbbb", asset_id: "small_plant", placementLimit: 4 },
    { asset_uid: "asset_rug_cccccc", asset_id: "rug", placementLimit: 0 },
    { asset_uid: "asset_book_dddddd", asset_id: "book" }, // no limit defined
  ];
  // Mix of persisted-shape (asset_uid) and live-editor-shape (assetUid)
  // objects, plus a soft-deleted def that must NOT count.
  const scene = [
    { instance_id: "core_desk_001", asset_uid: "asset_desk_aaaaaa" },
    { id: "small_plant_001", assetUid: "asset_plant_bbbbbb" },
    { id: "small_plant_002", assetUid: "asset_plant_bbbbbb", deleted: true },
  ];

  // Developer mode: ALWAYS allowed, even past the limit.
  const dev = registry.canPlaceAsset("asset_desk_aaaaaa", scene, "developer", { assets });
  assert.deepEqual(dev, { allowed: true, currentCount: 1, limit: 1, reason: null });

  // Player mode: at the limit → denied.
  const deskFull = registry.canPlaceAsset("asset_desk_aaaaaa", scene, "player", { assets });
  assert.deepEqual(deskFull, { allowed: false, currentCount: 1, limit: 1, reason: "placement_limit_reached" });

  // Player mode: under the limit → allowed; soft-deleted defs don't count.
  const plantOk = registry.canPlaceAsset("asset_plant_bbbbbb", scene, "player", { assets });
  assert.deepEqual(plantOk, { allowed: true, currentCount: 1, limit: 4, reason: null });

  // limit 0 = unavailable to players entirely.
  const rug = registry.canPlaceAsset("asset_rug_cccccc", scene, "player", { assets });
  assert.deepEqual(rug, { allowed: false, currentCount: 0, limit: 0, reason: "placement_limit_reached" });

  // Absent limit = no player-facing restriction.
  const book = registry.canPlaceAsset("asset_book_dddddd", scene, "player", { assets });
  assert.deepEqual(book, { allowed: true, currentCount: 0, limit: null, reason: null });

  // Counting keys off the immutable uid, so an asset_id rename changes
  // nothing: same uid, different editable id, same answer.
  const renamed = assets.map((a) => (a.asset_uid === "asset_desk_aaaaaa" ? { ...a, asset_id: "totally_new_name" } : a));
  const afterRename = registry.canPlaceAsset("asset_desk_aaaaaa", scene, "player", { assets: renamed });
  assert.deepEqual(afterRename, deskFull, "rename does not affect counting");

  // Unknown asset in player mode is DENIED (approved-registry boundary);
  // a plain assets ARRAY is accepted too.
  const unknown = registry.canPlaceAsset("asset_nope_eeeeee", scene, "player", assets);
  assert.deepEqual(unknown, { allowed: false, currentCount: 0, limit: 0, reason: "unknown_asset" });
});

// ======================================== the SHIPPED prop library (canonical)
//
// These run against the real assets/asset_registry.json and assets/props/,
// not a fixture. They exist because the registry sync is APPEND-ONLY: renaming
// a PNG mints a brand-new uid for the new filename and silently leaves the old
// entry dangling, which is exactly how 11 Scene placements were lost. The
// invariant below is what "clean" means, and it is cheap to keep true.

const readJson = async (rel) => JSON.parse(await fs.readFile(new URL(rel, import.meta.url), "utf8"));

const CANONICAL_PROPS = [
  "armchair_brown.png", "armchair_green.png", "armchair_red.png", "book_a.png", "book_b.png",
  "bookshelf.png", "bookshelf_small.png", "cabinet_small.png", "chair_small.png", "core_book.png",
  "core_desk.png", "painting_frosty_sunrise.png", "plants_02.png", "plants_05.png", "plants_07.png",
  "plants_09.png", "plants_10.png", "plants_11.png", "plants_12.png", "podium.png",
  "record_player.png", "rug_a.png", "rug_b.png",
];

test("assets/props holds exactly the canonical prop set", async () => {
  const dir = new URL("../assets/props/", import.meta.url);
  const onDisk = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  assert.deepEqual(onDisk, [...CANONICAL_PROPS].sort());
  // The numbering gap is deliberate — plants_06 must never come back.
  assert.equal(onDisk.includes("plants_06.png"), false);
});

test("the registry matches the prop library exactly: no dangling, duplicate or unregistered entries", async () => {
  const reg = await readJson("../assets/asset_registry.json");
  const props = reg.assets.filter((a) => a.path.startsWith("assets/props/"));
  assert.equal(props.length, 23, "one entry per canonical PNG");

  const paths = props.map((a) => a.path);
  const uids = props.map((a) => a.asset_uid);
  assert.equal(new Set(paths).size, paths.length, "no duplicate paths");
  assert.equal(new Set(uids).size, uids.length, "no duplicate uids");

  // No dangling entries.
  for (const a of props) {
    await fs.access(new URL(`../${a.path}`, import.meta.url));
    assert.equal(a.filename, a.path.split("/").pop(), `${a.asset_id}: filename tracks path`);
  }
  // No unregistered PNGs.
  for (const f of CANONICAL_PROPS) assert.ok(paths.includes(`assets/props/${f}`), `${f} is unregistered`);
  // The retired historical names are gone for good.
  for (const gone of [
    "plants_06", "small_book_shelf", "wood_cabinet_small", "small_chair", "frosty_sunrise",
    "indian_rug_01", "indian_rug_02", "big_rug_01", "big_rug_02", "big_rug_03", "chair_east",
    "bookshelf_old", "core_desk_old", "core_desk_horizon", "core_desk_256", "shadow_l_square", "rub_a",
  ]) {
    assert.equal(props.some((a) => a.asset_id === gone), false, `stale asset_id "${gone}" still present`);
  }
});

test("every Scene placement resolves, and the uids the Scene owns were preserved", async () => {
  const reg = await readJson("../assets/asset_registry.json");
  const scene = await readJson("../assets/scenes/classic_library.json");
  const byUid = Object.fromEntries(reg.assets.map((a) => [a.asset_uid, a]));
  const placed = (scene.objects || []).filter((o) => o.asset_uid);
  assert.ok(placed.length > 0);
  for (const o of placed) {
    const a = byUid[o.asset_uid];
    assert.ok(a, `${o.instance_id}: uid ${o.asset_uid} has no registry entry`);
    await fs.access(new URL(`../${a.path}`, import.meta.url));
  }
  // The cleanup repointed entries instead of reissuing uids: these are the
  // historical uids the Scene still uses, now serving canonical files.
  const migrated = {
    asset_wood_cabinet_small_4c7d: "cabinet_small",
    asset_small_chair_7581f7: "chair_small",
    asset_small_book_shelf_4663e0: "bookshelf_small",
    asset_indian_rug_01_acd3f5: "rug_a",
    asset_frosty_sunrise_241fe6: "painting_frosty_sunrise",
    asset_core_desk_256_e5b222: "core_desk",
  };
  for (const [uid, id] of Object.entries(migrated)) {
    assert.equal(byUid[uid]?.asset_id, id, `${uid} must now be ${id}`);
  }
});

// ==================================================== F8 Props list ordering

test("numeric ordering keeps plants_09 before plants_10", async () => {
  const reg = await readJson("../assets/asset_registry.json");
  const ids = reg.assets.filter((a) => a.path.startsWith("assets/props/")).map((a) => a.asset_id);
  const az = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  assert.ok(az.indexOf("plants_09") < az.indexOf("plants_10"), "numeric collation");
  assert.equal(az[0], "armchair_brown", "A–Z starts at armchair_brown");
  const za = [...az].reverse();
  assert.equal(za[0], "rug_b", "Z–A starts at rug_b");
  assert.deepEqual([...za].reverse(), az, "Z–A is the exact reverse of A–Z");
});
