// Tests for the DEV-ONLY Scene Editor's data side:
//   - scene layout persistence (src/services/sceneLayout.js): roundtrip,
//     strict sanitization, empty default;
//   - the devTools gate (config.js): on for dev runs, HARD OFF in
//     production regardless of DEV_TOOLS, and explicitly disableable.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let sceneLayout;
let worldContent;
let configModule;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-layout-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.SCENE_LAYOUT_PATH = path.join(tmpRoot, "scene-layout.json");
  sceneLayout = await import("../src/services/sceneLayout.js");
  worldContent = await import("../src/services/worldContent.js");
  configModule = await import("../src/config.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.SCENE_LAYOUT_PATH;
  delete process.env.NODE_ENV;
  delete process.env.DEV_TOOLS;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("loading before any save returns an empty layout (with the default Role Roster)", async () => {
  assert.deepEqual(await sceneLayout.loadSceneLayout(), {
    version: sceneLayout.SLOT_SCHEMA_VERSION,
    objects: [],
    zones: [],
    characterSlots: [],
    characterRoles: [
      { roleId: "sage", label: "SAGE", required: true, order: 0 },
      { roleId: "alpha", label: "ALPHA", required: true, order: 1 },
      { roleId: "beta", label: "BETA", required: true, order: 2 },
      { roleId: "gamma", label: "GAMMA", required: true, order: 3 },
      { roleId: "traveler", label: "TRAVELER", required: true, order: 4 },
      { roleId: "pet", label: "PET", required: true, order: 5 },
    ],
    // The bootstrap Scene keeps the Classic Library art (schema v3: the Scene
    // owns its background, and the no-file state is the shipped product's only
    // Scene, not a deliberately blank one — see loadSceneLayout's ENOENT
    // branch and test/sceneBackground.test.js for the full matrix).
    sceneMeta: {
      name: "",
      background: sceneLayout.CLASSIC_LIBRARY_BACKGROUND,
      worldId: "",
      width: 1920,
      height: 1080,
      gridSize: 24,
    },
    // Scene-owned lights (Light System v1) — a Scene starts unlit.
    lights: [],
    // Light Blockers — a separate Scene collection from movement zones.
    lightBlockers: [],
    // The Scene owns its World snapshot; a Scene that has never been saved
    // gets the Classic defaults (see services/worldContent.js).
    world: worldContent.defaultSceneWorld(),
  });
});

test("save/load roundtrip preserves objects and zones", async () => {
  const layout = {
    objects: [{ id: "classic-dean", world: { x: 0.5, y: 0.2769 }, width: 0.117, z: 2 }],
    zones: [
      { id: "zone-1", type: "blocked", shape: "rect", rect: { x: 0.4, y: 0.2, w: 0.2, h: 0.1 } },
      { id: "zone-2", type: "walkable", shape: "rect", rect: { x: 0.1, y: 0.3, w: 0.8, h: 0.6 } },
    ],
  };
  const saved = await sceneLayout.saveSceneLayout(layout);
  assert.equal(saved.objects.length, 1);
  assert.equal(saved.zones.length, 2);
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects[0].world, { x: 0.5, y: 0.2769 });
  assert.deepEqual(loaded.zones[1].rect, { x: 0.1, y: 0.3, w: 0.8, h: 0.6 });
});

test("sanitization drops malformed entries instead of persisting junk", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "ok", world: { x: 0.1, y: 0.2 }, width: 0.05 },
      { id: "", world: { x: 0.1, y: 0.2 }, width: 0.05 }, // no id
      { id: "bad-width", world: { x: 0.1, y: 0.2 }, width: -1 },
      { id: "bad-world", world: { x: "nope", y: 0.2 }, width: 0.05 },
    ],
    zones: [
      { id: "z-ok", type: "interaction", shape: "rect", rect: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      { id: "z-bad-type", type: "lava", shape: "rect", rect: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      { id: "z-bad-shape", type: "walkable", shape: "polygon", rect: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      { id: "z-bad-rect", type: "walkable", shape: "rect", rect: { x: 0, y: 0, w: 0, h: 0.1 } },
    ],
  });
  assert.deepEqual(saved.objects.map((o) => o.id), ["ok"]);
  assert.deepEqual(saved.zones.map((z) => z.id), ["z-ok"]);
});

test("depth layers: object renderLayer/sortY round-trip; zone characterLayer is walkable-only", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "layered", world: { x: 0.5, y: 0.3 }, width: 0.1, renderLayer: 3, sortY: 412.5 },
      { id: "clamped", world: { x: 0.5, y: 0.3 }, width: 0.1, renderLayer: 99 },
      { id: "dynamic", world: { x: 0.5, y: 0.3 }, width: 0.1 },
    ],
    zones: [
      { id: "aisle", type: "walkable", shape: "rect", rect: { x: 0, y: 0.5, w: 1, h: 0.2 }, characterLayer: 1 },
      { id: "aisle-poly", type: "walkable", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.1, y: 0.2 }], characterLayer: 12 },
      { id: "wall", type: "blocked", shape: "rect", rect: { x: 0, y: 0, w: 1, h: 0.1 }, characterLayer: 2 },
      { id: "plain", type: "walkable", shape: "rect", rect: { x: 0, y: 0.8, w: 1, h: 0.2 } },
    ],
  });
  assert.equal(saved.objects[0].renderLayer, 3);
  assert.equal(saved.objects[0].sortY, 412.5);
  assert.equal(saved.objects[1].renderLayer, 9, "clamped to the band range");
  assert.ok(!("renderLayer" in saved.objects[2]) && !("sortY" in saved.objects[2]), "absent stays absent (dynamic)");
  const zone = (id) => saved.zones.find((z) => z.id === id);
  assert.equal(zone("aisle").characterLayer, 1);
  assert.equal(zone("aisle-poly").characterLayer, 9, "clamped, and polygons carry it too");
  assert.ok(!("characterLayer" in zone("wall")), "non-walkable zones never persist a character layer");
  assert.ok(!("characterLayer" in zone("plain")), "absent stays absent");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.zones.find((z) => z.id === "aisle").characterLayer, 1, "round-trips through disk");
});

test("object collision blocks persist independently of depth fields", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "podium", world: { x: 0.5, y: 0.294 }, width: 0.1, collision: { enabled: true, offsetX: -52, offsetY: -12, width: 104, height: 24 } },
      { id: "plain", world: { x: 0.5, y: 0.3 }, width: 0.1, renderLayer: 2 },
    ],
  });
  assert.deepEqual(saved.objects[0].collision, { enabled: true, shape: "rectangle", offsetX: -52, offsetY: -12, width: 104, height: 24 });
  assert.ok(!("collision" in saved.objects[1]), "absent stays absent");
  assert.equal(saved.objects[1].renderLayer, 2, "depth fields untouched by collision sanitizing");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects[0].collision.height, 24, "round-trips through disk");
});

test("collision shapes: ellipse round-trips like rectangle; polygon persists its point-pair array; unknown shape defaults to rectangle; incomplete polygon persists nothing", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "oval", world: { x: 0.5, y: 0.3 }, width: 0.1, collision: { enabled: true, shape: "ellipse", offsetX: -50, offsetY: -25, width: 100, height: 50 } },
      { id: "poly", world: { x: 0.5, y: 0.3 }, width: 0.1, collision: { enabled: true, shape: "polygon", points: [[-100, -20], [100, -20], [80, 30], [-80, 30]] } },
      { id: "legacy_shape", world: { x: 0.5, y: 0.3 }, width: 0.1, collision: { enabled: true, shape: "hexagon", offsetX: -10, offsetY: -10, width: 20, height: 20 } },
      { id: "half_drawn", world: { x: 0.5, y: 0.3 }, width: 0.1, collision: { enabled: true, shape: "polygon", points: [[-10, -10], [10, -10]] } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.id === id);
  assert.deepEqual(by("oval").collision, { enabled: true, shape: "ellipse", offsetX: -50, offsetY: -25, width: 100, height: 50 });
  assert.deepEqual(by("poly").collision, { enabled: true, shape: "polygon", points: [[-100, -20], [100, -20], [80, 30], [-80, 30]] });
  assert.equal(by("legacy_shape").collision.shape, "rectangle", "unrecognized shape name falls back to rectangle");
  assert.ok(!("collision" in by("half_drawn")), "fewer than 3 points persists nothing rather than a broken shape");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects.find((o) => o.id === "poly").collision.points, [[-100, -20], [100, -20], [80, 30], [-80, 30]], "round-trips through disk");
});

test("zone ellipse persists like a rect zone (bounding box, interpreted as the inscribed ellipse)", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    zones: [{ id: "pond", type: "walkable", shape: "ellipse", rect: { x: 0.3, y: 0.4, w: 0.2, h: 0.1 } }],
  });
  assert.deepEqual(saved.zones[0], { id: "pond", type: "walkable", shape: "ellipse", rect: { x: 0.3, y: 0.4, w: 0.2, h: 0.1 } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.zones[0].shape, "ellipse", "round-trips through disk");
});

test("character foot colliders persist independently, with sensible defaults for missing fields", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "dean", world: { x: 0.5, y: 0.3 }, width: 0.1, footCollider: { enabled: false, offsetX: -25, offsetY: -8, width: 50, height: 16 } },
      { id: "defaulted", world: { x: 0.5, y: 0.3 }, width: 0.1, footCollider: {} },
      { id: "plain", world: { x: 0.5, y: 0.3 }, width: 0.1 },
    ],
  });
  assert.deepEqual(saved.objects[0].footCollider, { enabled: false, offsetX: -25, offsetY: -8, width: 50, height: 16 });
  assert.deepEqual(saved.objects[1].footCollider, { enabled: true, offsetX: -20, offsetY: -7, width: 40, height: 14 }, "missing fields fall back to the centered 40x14 default");
  assert.ok(!("footCollider" in saved.objects[2]), "absent stays absent");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects[0].footCollider.width, 50, "round-trips through disk");
});

test("zone types are validated against the priority vocabulary", () => {
  assert.deepEqual(sceneLayout.ZONE_TYPES, ["blocked", "interaction", "walkable"]);
});

test("object shadow blocks persist with project-relative assets only", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      {
        id: "podium",
        world: { x: 0.5, y: 0.294 },
        width: 0.1003,
        z: 3,
        shadow: { enabled: true, asset: "assets/shared/shadows/shadow_medium.png", offsetX: 0, offsetY: -6, width: 120, height: 18, opacity: 0.55 },
      },
      {
        id: "bad-asset",
        world: { x: 0.1, y: 0.1 },
        width: 0.05,
        shadow: { enabled: true, asset: "C:\\Users\\someone\\shadow.png", width: 50, height: 10, opacity: 2 },
      },
    ],
  });
  const good = saved.objects[0].shadow;
  assert.deepEqual(good, { enabled: true, asset: "assets/shared/shadows/shadow_medium.png", offsetX: 0, offsetY: -6, width: 120, height: 18, opacity: 0.55 });
  const bad = saved.objects[1].shadow;
  assert.equal(bad.asset, undefined, "absolute machine paths are rejected");
  assert.equal(bad.opacity, 1, "opacity clamps to 0..1");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects[0].shadow, good);
});

test("polygon zones persist their full point array — never a bounding rect", async () => {
  const points = [
    { x: 0.0958, y: 0.2 },
    { x: 0.1938, y: 0.2 },
    { x: 0.2656, y: 0.787 },
    { x: 0.076, y: 0.787 },
  ];
  const saved = await sceneLayout.saveSceneLayout({
    zones: [{ id: "walkable-left-aisle", type: "walkable", shape: "polygon", points }],
  });
  assert.equal(saved.zones[0].shape, "polygon");
  assert.deepEqual(saved.zones[0].points, points);
  assert.equal(saved.zones[0].rect, undefined, "no bounding-rect substitution");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.zones[0].points, points);
});

test("malformed polygons are rejected: too few points or invalid vertices", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    zones: [
      { id: "p-ok", type: "blocked", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }] },
      { id: "p-two-points", type: "blocked", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }] },
      { id: "p-bad-vertex", type: "blocked", shape: "polygon", points: [{ x: 0, y: 0 }, { x: "nope", y: 0 }, { x: 0.1, y: 0.1 }] },
      { id: "p-no-points", type: "blocked", shape: "polygon" },
    ],
  });
  assert.deepEqual(saved.zones.map((z) => z.id), ["p-ok"]);
});

test("interaction slots: foundation data model round-trips, is independent of Zones, and is dropped when malformed", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      {
        id: "chair",
        world: { x: 0.5, y: 0.5 },
        width: 0.05,
        interactionSlots: [
          { id: "sit-slot", actionId: "sit", offsetX: 10, offsetY: -5, facingDirection: "left", enabled: true, duration: 30, animationId: "sit_down" },
        ],
      },
      { id: "no-slots", world: { x: 0.2, y: 0.2 }, width: 0.05 },
      { id: "empty-array", world: { x: 0.3, y: 0.3 }, width: 0.05, interactionSlots: [] },
      { id: "junk-entries", world: { x: 0.4, y: 0.4 }, width: 0.05, interactionSlots: ["not an object", null, { actionId: "browse_book" }] },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.id === id);
  assert.deepEqual(by("chair").interactionSlots, [
    { id: "sit-slot", actionId: "sit", offsetX: 10, offsetY: -5, facingDirection: "left", enabled: true, duration: 30, animationId: "sit_down" },
  ]);
  assert.ok(!("interactionSlots" in by("no-slots")), "absent stays absent");
  assert.ok(!("interactionSlots" in by("empty-array")), "empty array persists nothing rather than an empty array");
  // Junk entries are dropped individually; the one valid object survives with
  // a generated id/defaults (unknown facingDirection falls back to "down").
  // The fallback id is based on the RAW array index (2), not a post-filter
  // renumbering — "slot-3" for the third entry in the source array.
  assert.deepEqual(by("junk-entries").interactionSlots, [
    { id: "slot-3", actionId: "browse_book", offsetX: 0, offsetY: 0, facingDirection: "down", enabled: false },
  ]);
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects.find((o) => o.id === "chair").interactionSlots[0].actionId, "sit", "round-trips through disk");
});

test("interaction slots are a separate concept from Interaction Zones — zones round-trip unaffected", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "bookshelf", world: { x: 0.5, y: 0.5 }, width: 0.05, interactionSlots: [{ actionId: "browse_book", enabled: true }] }],
    zones: [{ id: "zone-detect", type: "interaction", shape: "rect", rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }],
  });
  assert.equal(saved.zones[0].type, "interaction", "the existing Interaction Zone type is untouched");
  assert.equal(saved.objects[0].interactionSlots[0].actionId, "browse_book");
});

test("slotId is a separate stable identifier from actionId — round-trips independently, legacy slots without it still load", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      {
        id: "podium",
        world: { x: 0.5, y: 0.5 },
        width: 0.1,
        interactionSlots: [{ slotId: "omega_home", actionId: "wait", facingDirection: "down", enabled: true }],
      },
      // Legacy slot authored before slotId existed — must still load safely.
      { id: "legacy_prop", world: { x: 0.3, y: 0.3 }, width: 0.05, interactionSlots: [{ actionId: "browse_book", enabled: true }] },
    ],
  });
  const podiumSlot = saved.objects.find((o) => o.id === "podium").interactionSlots[0];
  assert.equal(podiumSlot.slotId, "omega_home");
  assert.equal(podiumSlot.actionId, "wait", "actionId is not repurposed as slotId — both survive independently");
  const legacySlot = saved.objects.find((o) => o.id === "legacy_prop").interactionSlots[0];
  assert.ok(!("slotId" in legacySlot), "a slot authored before slotId existed loads without one, not rejected");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects.find((o) => o.id === "podium").interactionSlots[0].slotId, "omega_home", "round-trips through disk");
});

test("scene-level Character Slots: separate collection, absolute x/y, independent of Interaction Zones and Prop-owned slots", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [
      { slotId: "core_book_wait", x: 500, y: 600, facingDirection: "up", enabled: true, actionId: "wait", duration: 12, animationId: "listen" },
      { slotId: "", x: 10, y: 10 }, // empty slotId still persists — the editor warns, sanitizer doesn't crash
      { x: 20 }, // missing y — dropped entirely
      "not an object", // dropped entirely
    ],
    zones: [{ id: "zone-1", type: "interaction", shape: "rect", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } }],
  });
  assert.equal(saved.characterSlots.length, 2, "malformed entries are dropped, valid ones survive");
  assert.deepEqual(saved.characterSlots[0], {
    slotId: "core_book_wait", enabled: true, gridX: 21, gridY: 25, x: 504, y: 600, facingDirection: "up", actionId: "wait", duration: 12, animationId: "listen", slotBox: { width: 1, height: 1 }, blockingOccupancy: true,
  }, "legacy x/y snaps to the NEAREST grid intersection (round, not floor) — x recomputed exactly, y already an exact multiple");
  assert.equal(saved.characterSlots[1].slotId, "", "empty slotId is preserved, not rejected");
  assert.equal(saved.zones[0].type, "interaction", "Interaction Zones are untouched by Character Slots");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.characterSlots[0].slotId, "core_book_wait", "round-trips through disk");
});

test("a layout saved before Character Slots existed loads safely with an empty characterSlots array", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1 }],
    zones: [],
    // no characterSlots key at all — simulates a pre-existing scene file
  });
  assert.deepEqual(saved.characterSlots, []);
});

test("gridPointToWorld: resolves a grid POINT (intersection) to its exact world coordinate — no cell-center offset", () => {
  assert.deepEqual(sceneLayout.gridPointToWorld(0, 0, 24), { x: 0, y: 0 });
  assert.deepEqual(sceneLayout.gridPointToWorld(21, 25, 24), { x: 504, y: 600 });
  assert.deepEqual(sceneLayout.gridPointToWorld(10, 10, 32), { x: 320, y: 320 });
});

test("worldToNearestGridPoint: resolves a world position to the NEAREST intersection — round, never floor/ceil", () => {
  assert.deepEqual(sceneLayout.worldToNearestGridPoint(0, 0, 24), { gridX: 0, gridY: 0 });
  assert.deepEqual(sceneLayout.worldToNearestGridPoint(500, 600, 24), { gridX: 21, gridY: 25 });
  assert.deepEqual(sceneLayout.worldToNearestGridPoint(504, 600, 24), { gridX: 21, gridY: 25 }, "a point's own exact coordinate maps back to itself");
  // 263/24 = 10.958 — floor would wrongly select the CONTAINING CELL (10);
  // nearest-intersection rounding correctly picks 11.
  assert.deepEqual(sceneLayout.worldToNearestGridPoint(263, 0, 24), { gridX: 11, gridY: 0 }, "rounds to the nearer intersection, not the containing cell");
});

test("clampGridPoint: keeps grid points within scene bounds, never negative or past the last valid intersection", () => {
  assert.deepEqual(sceneLayout.clampGridPoint(-5, -5, 24, 1920, 1080), { gridX: 0, gridY: 0 }, "negative points clamp to the origin");
  assert.deepEqual(sceneLayout.clampGridPoint(500, 500, 24, 1920, 1080), { gridX: 80, gridY: 45 }, "points far outside the scene clamp to the last valid intersection — 1920/24=80, 1080/24=45 (fencepost count, one more than the cell count)");
  assert.deepEqual(sceneLayout.clampGridPoint(10.6, 10.4, 24, 1920, 1080), { gridX: 11, gridY: 10 }, "fractional points round to the nearest integer point");
});

test("Character Slot migration: legacy x/y-only slots derive gridX/gridY and snap x/y to the nearest grid intersection", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [{ slotId: "legacy_slot", x: 0, y: 0, enabled: true }],
  });
  assert.deepEqual(saved.characterSlots[0], {
    slotId: "legacy_slot", enabled: true, gridX: 0, gridY: 0, x: 0, y: 0, facingDirection: "down", slotBox: { width: 1, height: 1 }, blockingOccupancy: true,
  });
});

test("Character Slot migration: an arbitrary (non-grid-aligned) legacy world position snaps to its nearest intersection, displaced by at most half a grid step per axis", async () => {
  const gridSize = 24;
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [{ slotId: "arbitrary_slot", x: 635, y: 418, enabled: true }],
  });
  const slot = saved.characterSlots[0];
  assert.equal(slot.x % gridSize, 0, "world x is an exact multiple of the grid size");
  assert.equal(slot.y % gridSize, 0, "world y is an exact multiple of the grid size");
  assert.ok(Math.abs(slot.x - 635) <= gridSize / 2, "displaced by at most half a grid step (x)");
  assert.ok(Math.abs(slot.y - 418) <= gridSize / 2, "displaced by at most half a grid step (y)");
});

test("Character Slot bounds: an out-of-scene gridX/gridY clamps to the nearest valid grid point instead of being rejected", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    sceneMeta: { width: 240, height: 240, gridSize: 24 },
    characterSlots: [{ slotId: "offscreen_slot", gridX: 999, gridY: -999, enabled: true }],
  });
  assert.equal(saved.characterSlots[0].gridX, 10, "240/24 = 10, the last valid POINT index (0..10 inclusive)");
  assert.equal(saved.characterSlots[0].gridY, 0);
  assert.deepEqual(sceneLayout.gridPointToWorld(10, 0, 24), { x: saved.characterSlots[0].x, y: saved.characterSlots[0].y });
});

test("Character Slot unplaced: a named slot with no resolvable position persists (Needs placement), never silently dropped", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [
      { slotId: "omega_home", enabled: true, facingDirection: "up" }, // no x/y, no gridX/gridY at all
      { x: 20 }, // no slotId AND no resolvable position — still genuine junk, still dropped
      { slotId: "", enabled: true }, // no slotId (empty) and no position — also dropped
    ],
  });
  assert.equal(saved.characterSlots.length, 1, "only the named-but-unplaced slot survives");
  assert.deepEqual(saved.characterSlots[0], { slotId: "omega_home", enabled: true, facingDirection: "up", slotBox: { width: 1, height: 1 }, blockingOccupancy: true });
  assert.ok(!("gridX" in saved.characterSlots[0]), "no gridX for an unplaced slot");
  assert.ok(!("x" in saved.characterSlots[0]), "no x for an unplaced slot");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.characterSlots[0], saved.characterSlots[0], "round-trips through disk unplaced");
});

test("Slot Grid migration: a pre-v2 (cell-center) file migrates once on load; the migrated result is never re-shifted once persisted", async () => {
  const gridSize = 24;
  // Simulate an old v1 file: gridX/gridY (20,25) were CELL indices under the
  // old scheme, and x/y (492,612) is the cell-center world position that
  // scheme resolved them to — a real pre-existing-data shape, not synthetic.
  const legacyFile = {
    version: 1,
    objects: [],
    zones: [],
    characterSlots: [{ slotId: "legacy_v1_slot", enabled: true, gridX: 20, gridY: 25, x: 492, y: 612, facingDirection: "down" }],
    sceneMeta: { name: "", background: "", worldId: "", width: 1920, height: 1080, gridSize },
  };
  await fs.writeFile(process.env.SCENE_LAYOUT_PATH, JSON.stringify(legacyFile), "utf8");
  const migrated = await sceneLayout.loadSceneLayout();
  assert.equal(migrated.version, sceneLayout.SLOT_SCHEMA_VERSION);
  const slot = migrated.characterSlots.find((s) => s.slotId === "legacy_v1_slot");
  // Re-derived from x/y (492,612) via worldToNearestGridPoint — NOT trusted
  // from the stale cell-indexed gridX/gridY (20,25).
  const expectedPoint = sceneLayout.worldToNearestGridPoint(492, 612, gridSize);
  assert.deepEqual({ gridX: slot.gridX, gridY: slot.gridY }, expectedPoint);
  assert.notDeepEqual({ gridX: slot.gridX, gridY: slot.gridY }, { gridX: 20, gridY: 25 }, "the stale cell-index must NOT be trusted as an already-correct grid-point index");

  // Persist the migrated result (Section 4: "persist on the next Save
  // Layout") — the file's version is now stamped current, so a later load
  // must NOT re-run the migration and shift it again.
  await sceneLayout.saveSceneLayout(migrated);
  const reloaded = await sceneLayout.loadSceneLayout();
  const slot2 = reloaded.characterSlots.find((s) => s.slotId === "legacy_v1_slot");
  assert.deepEqual({ gridX: slot2.gridX, gridY: slot2.gridY }, expectedPoint, "already-migrated (v2) data is never shifted a second time");
});

test("Character Home/Spawn references remain intact through Slot Grid migration", async () => {
  const legacyFile = {
    version: 1,
    objects: [{ id: "classic-omega", world: { x: 0.5, y: 0.3 }, width: 0.117, homeSlotId: "omega_home", spawnSlotId: "omega_home" }],
    zones: [],
    characterSlots: [{ slotId: "omega_home", enabled: true, gridX: 40, gridY: 14, x: 972, y: 348, facingDirection: "down" }],
    sceneMeta: { name: "", background: "", worldId: "", width: 1920, height: 1080, gridSize: 24 },
  };
  await fs.writeFile(process.env.SCENE_LAYOUT_PATH, JSON.stringify(legacyFile), "utf8");
  const migrated = await sceneLayout.loadSceneLayout();
  const omega = migrated.objects.find((o) => o.id === "classic-omega");
  assert.equal(omega.homeSlotId, "omega_home");
  assert.equal(omega.spawnSlotId, "omega_home");
  assert.ok(migrated.characterSlots.some((s) => s.slotId === "omega_home"), "the referenced Slot still exists in the canonical collection after migration");
});

test("Slot Box: defaults to 1x1 when absent (every pre-existing Slot)", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [{ slotId: "box_default", x: 0, y: 0, enabled: true }],
  });
  assert.deepEqual(saved.characterSlots[0].slotBox, { width: 1, height: 1 });
});

test("Slot Box: sanitizes to integers, minimum 1, clamped to the grid's own extent", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    sceneMeta: { width: 240, height: 120, gridSize: 24 }, // 10x5 cells
    characterSlots: [
      { slotId: "box_fractional", x: 0, y: 0, enabled: true, slotBox: { width: 2.6, height: 0.2 } },
      { slotId: "box_negative", x: 0, y: 0, enabled: true, slotBox: { width: -5, height: -5 } },
      { slotId: "box_huge", x: 0, y: 0, enabled: true, slotBox: { width: 999, height: 999 } },
    ],
  });
  const box = (id) => saved.characterSlots.find((s) => s.slotId === id).slotBox;
  assert.deepEqual(box("box_fractional"), { width: 3, height: 1 }, "fractional rounds; below-1 clamps up to the minimum");
  assert.deepEqual(box("box_negative"), { width: 1, height: 1 }, "negative clamps to the minimum");
  assert.deepEqual(box("box_huge"), { width: 10, height: 5 }, "clamped to the scene's own grid extent (240/24=10, 120/24=5)");
});

test("Slot Box: persists through save/load, independent of Point placement", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [{ slotId: "box_persist", gridX: 5, gridY: 5, enabled: true, slotBox: { width: 5, height: 3 } }],
  });
  assert.deepEqual(saved.characterSlots[0].slotBox, { width: 5, height: 3 });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.characterSlots[0].slotBox, { width: 5, height: 3 });
});

// ---------------------------------------------------- Prop Footprint milestone

test("Prop Footprint: ownerPropId round-trips on a Slot, blockingOccupancy defaults true and is explicitly overridable", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [
      { slotId: "wood_cabinet_01_anchor", ownerPropId: "wood_cabinet_01", gridX: 55, gridY: 21, enabled: true, slotBox: { width: 2, height: 2 } },
      { slotId: "no_occupancy_anchor", ownerPropId: "chair_04", gridX: 1, gridY: 1, enabled: true, blockingOccupancy: false },
      { slotId: "world_slot_unowned", gridX: 2, gridY: 2, enabled: true }, // no ownerPropId — a plain World Slot
    ],
  });
  assert.equal(saved.characterSlots[0].ownerPropId, "wood_cabinet_01");
  assert.equal(saved.characterSlots[0].blockingOccupancy, true, "absent input defaults to true");
  assert.equal(saved.characterSlots[1].blockingOccupancy, false, "explicit false is preserved, not coerced to the default");
  assert.ok(!("ownerPropId" in saved.characterSlots[2]), "a World Slot has no ownerPropId at all");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.characterSlots[0].ownerPropId, "wood_cabinet_01", "round-trips through disk");
});

test("Prop Footprint: malformed/empty ownerPropId is dropped, never persisted as an empty string", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterSlots: [
      { slotId: "s1", ownerPropId: "", gridX: 1, gridY: 1, enabled: true },
      { slotId: "s2", ownerPropId: "   ", gridX: 2, gridY: 2, enabled: true },
      { slotId: "s3", ownerPropId: 42, gridX: 3, gridY: 3, enabled: true },
    ],
  });
  for (const s of saved.characterSlots) assert.ok(!("ownerPropId" in s), `${s.slotId} has no ownerPropId`);
});

test("Prop Footprint: baked object slotId (forward reference to its owned Slot) round-trips independently of homeSlotId/spawnSlotId", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1, slotId: "podium_01_anchor", homeSlotId: "omega_home" }],
  });
  assert.equal(saved.objects[0].slotId, "podium_01_anchor");
  assert.equal(saved.objects[0].homeSlotId, "omega_home", "unrelated to slotId — both persist independently");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects[0].slotId, "podium_01_anchor", "round-trips through disk");
});

// ------------------------------------------------ Ground Projection milestone

test("Ground Projection: a legacy baked object (no groundOffsetX/Y at all) sanitizes with the fields simply absent — a no-op equal to the sprite anchor", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1 }],
  });
  assert.ok(!("groundOffsetX" in saved.objects[0]), "absent, not persisted as 0");
  assert.ok(!("groundOffsetY" in saved.objects[0]));
});

test("Ground Projection: groundOffsetX/Y round-trip on a baked object, persisted only when non-zero", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1, groundOffsetX: -12.5, groundOffsetY: 8 },
      { id: "classic-omega", world: { x: 0.5, y: 0.28888888888888886 }, width: 0.117, groundOffsetX: 0, groundOffsetY: 0 },
    ],
  });
  const podium = saved.objects.find((o) => o.id === "podium");
  const omega = saved.objects.find((o) => o.id === "classic-omega");
  assert.equal(podium.groundOffsetX, -12.5);
  assert.equal(podium.groundOffsetY, 8);
  assert.ok(!("groundOffsetX" in omega) && !("groundOffsetY" in omega), "explicit 0,0 persists as absent, same as never having been set");
  const loaded = await sceneLayout.loadSceneLayout();
  const reloadedPodium = loaded.objects.find((o) => o.id === "podium");
  assert.equal(reloadedPodium.groundOffsetX, -12.5, "round-trips through disk");
  assert.equal(reloadedPodium.groundOffsetY, 8);
});

test("Ground Projection isolation: editing groundOffsetX/Y produces zero change to collision, shadow, sortY, or world (the sprite anchor)", async () => {
  const base = {
    id: "podium",
    world: { x: 0.5, y: 0.3362169366166387 },
    width: 0.1003,
    sortY: 500,
    shadow: { enabled: true, offsetX: 0, offsetY: -15, width: 115, height: 43 },
    collision: { enabled: true, shape: "ellipse", offsetX: -53.2, offsetY: -35.6, width: 106, height: 32.2 },
  };
  const before = await sceneLayout.saveSceneLayout({ objects: [base] });
  const after = await sceneLayout.saveSceneLayout({ objects: [{ ...base, groundOffsetX: 40, groundOffsetY: -20 }] });
  assert.deepEqual(after.objects[0].world, before.objects[0].world, "world (sprite anchor) is byte-identical");
  assert.deepEqual(after.objects[0].collision, before.objects[0].collision, "collision is byte-identical");
  assert.deepEqual(after.objects[0].shadow, before.objects[0].shadow, "shadow is byte-identical");
  assert.equal(after.objects[0].sortY, before.objects[0].sortY, "sortY is unchanged");
  assert.equal(after.objects[0].groundOffsetX, 40);
  assert.equal(after.objects[0].groundOffsetY, -20);
});

test("Prop Footprint: getSlotBoxCells covers the exact odd and even occupancy cells, floor-based left/top split", () => {
  // 2x2 (even) at (10,10): left=1,right=1,top=1,bottom=1 -> x in [9,10], y in [9,10]
  const even = sceneLayout.getSlotBoxCells(10, 10, 2, 2);
  assert.deepEqual(
    even.map((c) => `${c.gridX},${c.gridY}`).sort(),
    ["9,9", "9,10", "10,9", "10,10"].sort()
  );
  // 3x2 (odd width, even height) at (10,10): left=1,right=2 -> x in [9,10,11]; top=1,bottom=1 -> y in [9,10]
  const mixed = sceneLayout.getSlotBoxCells(10, 10, 3, 2);
  assert.equal(mixed.length, 6);
  assert.deepEqual(
    mixed.map((c) => `${c.gridX},${c.gridY}`).sort(),
    ["9,9", "9,10", "10,9", "10,10", "11,9", "11,10"].sort()
  );
  // 1x1 — exactly the Point itself.
  const single = sceneLayout.getSlotBoxCells(5, 5, 1, 1);
  assert.deepEqual(single, [{ gridX: 5, gridY: 5 }]);
});

test("Prop Footprint: slotBoxesOverlap detects true overlap, false for adjacent (touching-edge) boxes", () => {
  const a = { gridX: 10, gridY: 10, slotBox: { width: 2, height: 2 } }; // cells x[9,10] y[9,10]
  const overlapping = { gridX: 11, gridY: 10, slotBox: { width: 2, height: 2 } }; // cells x[10,11] y[9,10] — shares x=10 column
  const adjacent = { gridX: 12, gridY: 10, slotBox: { width: 2, height: 2 } }; // cells x[11,12] y[9,10] — immediately next to a's cells, shares no cell
  assert.equal(sceneLayout.slotBoxesOverlap(a, overlapping), true);
  // adjacent's cells are x in [11,12]; a's cells are x in [9,10] — no shared column, true non-overlap.
  assert.equal(sceneLayout.slotBoxesOverlap(a, adjacent), false);
  const far = { gridX: 50, gridY: 50, slotBox: { width: 1, height: 1 } };
  assert.equal(sceneLayout.slotBoxesOverlap(a, far), false);
});

test("sceneMeta: Scene-tab foundation round-trips, defaults fill in missing fields, never rejects the layout", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    sceneMeta: { name: "Classic Library", background: "assets/background/classic_library_bg.png", worldId: "classic", width: 2560, height: 1440, gridSize: 32 },
  });
  assert.deepEqual(saved.sceneMeta, { name: "Classic Library", background: "assets/background/classic_library_bg.png", worldId: "classic", width: 2560, height: 1440, gridSize: 32 });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.sceneMeta, saved.sceneMeta, "round-trips through disk");
});

test("sceneMeta: absent/malformed input yields defaults, not a rejected save", async () => {
  const saved = await sceneLayout.saveSceneLayout({ objects: [], zones: [] }); // no sceneMeta key at all
  assert.deepEqual(saved.sceneMeta, { name: "", background: "", worldId: "", width: 1920, height: 1080, gridSize: 24 });
  const savedBadTypes = await sceneLayout.saveSceneLayout({ sceneMeta: { name: 42, width: "nope", height: -5, gridSize: 0 } });
  assert.deepEqual(savedBadTypes.sceneMeta, { name: "", background: "", worldId: "", width: 1920, height: 1080, gridSize: 24 });
});

test("Character-tab foundation: homeSlotId/spawnSlotId persist on baked objects, absent stays absent, not read by any existing behavior", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1, homeSlotId: "omega_home", spawnSlotId: "omega_spawn" },
      { id: "no-slots", world: { x: 0.2, y: 0.2 }, width: 0.05 },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.id === id);
  assert.equal(by("podium").homeSlotId, "omega_home");
  assert.equal(by("podium").spawnSlotId, "omega_spawn");
  assert.ok(!("homeSlotId" in by("no-slots")) && !("spawnSlotId" in by("no-slots")), "absent stays absent");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects.find((o) => o.id === "podium").homeSlotId, "omega_home", "round-trips through disk");
});

test("Character Inspector foundation: name/gameplayRole/assetId/movementEnabled round-trip, absent stays absent, invalid role is dropped", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      {
        id: "classic-omega",
        world: { x: 0.5, y: 0.2769 },
        width: 0.117,
        name: "  The Sage  ",
        gameplayRole: "grand_sage",
        assetId: "classic_omega",
        movementEnabled: true,
      },
      { id: "no-role", world: { x: 0.5, y: 0.5 }, width: 0.1, gameplayRole: "emperor" }, // not in the vocabulary
      { id: "explicit-none", world: { x: 0.3, y: 0.3 }, width: 0.1, gameplayRole: "none" },
      { id: "untouched", world: { x: 0.2, y: 0.2 }, width: 0.05 },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.id === id);
  assert.equal(by("classic-omega").name, "The Sage", "trimmed");
  assert.equal(by("classic-omega").gameplayRole, "grand_sage");
  assert.equal(by("classic-omega").assetId, "classic_omega");
  assert.equal(by("classic-omega").movementEnabled, true);
  assert.ok(!("gameplayRole" in by("no-role")), "unrecognized role is dropped, never persisted as junk");
  assert.ok(!("gameplayRole" in by("explicit-none")), "the default value is omitted, same sparse convention as elsewhere");
  assert.ok(
    !("name" in by("untouched")) &&
      !("gameplayRole" in by("untouched")) &&
      !("assetId" in by("untouched")) &&
      !("movementEnabled" in by("untouched")),
    "absent stays absent — an old save with none of these fields is untouched"
  );
  const loaded = await sceneLayout.loadSceneLayout();
  const reloaded = loaded.objects.find((o) => o.id === "classic-omega");
  assert.equal(reloaded.name, "The Sage", "round-trips through disk");
  assert.equal(reloaded.gameplayRole, "grand_sage");
  assert.equal(reloaded.assetId, "classic_omega");
  assert.equal(reloaded.movementEnabled, true);
});

test("Character Inspector foundation: kind/characterId/assetPath are sparse (absent for a plain baked-object override) and assetPath rejects unsafe paths", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "classic-omega", world: { x: 0.5, y: 0.2769 }, width: 0.117 },
      { id: "npc_bad_path", world: { x: 0.1, y: 0.1 }, width: 0.1, kind: "npc", assetPath: "C:\\evil\\path.png" },
    ],
  });
  const omega = saved.objects.find((o) => o.id === "classic-omega");
  assert.ok(!("kind" in omega) && !("characterId" in omega) && !("assetPath" in omega), "absent when never provided");
  const bad = saved.objects.find((o) => o.id === "npc_bad_path");
  assert.ok(!("assetPath" in bad), "an absolute/unsafe path is rejected, never persisted");
});

test("Character Inspector foundation: Bubble config round-trips per-object, rejects unsafe paths, defaults the anchor", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      {
        id: "classic-omega",
        world: { x: 0.5, y: 0.2769 },
        width: 0.117,
        bubble: {
          dialogueBackground: "assets/ui/bubble_dialogue.png",
          thoughtBackground: "assets/ui/bubble_thought.png",
          textFont: "assets/fonts/bubble.ttf",
          offsetX: 12,
          offsetY: -34,
          anchor: "sprite_top_center",
        },
      },
      {
        id: "unsafe-paths",
        world: { x: 0.2, y: 0.2 },
        width: 0.05,
        bubble: {
          dialogueBackground: "../../etc/passwd",
          thoughtBackground: "C:\\Windows\\evil.png",
          textFont: "not-under-assets.ttf",
        },
      },
      { id: "no-bubble", world: { x: 0.1, y: 0.1 }, width: 0.05 },
    ],
  });
  const omega = saved.objects.find((o) => o.id === "classic-omega");
  assert.deepEqual(omega.bubble, {
    dialogueBackground: "assets/ui/bubble_dialogue.png",
    thoughtBackground: "assets/ui/bubble_thought.png",
    textFont: "assets/fonts/bubble.ttf",
    offsetX: 12,
    offsetY: -34,
    anchor: "sprite_top_center",
  });
  const unsafe = saved.objects.find((o) => o.id === "unsafe-paths");
  assert.equal(unsafe.bubble.dialogueBackground, "", "path traversal is rejected, not persisted");
  assert.equal(unsafe.bubble.thoughtBackground, "", "an absolute path is rejected");
  assert.equal(unsafe.bubble.textFont, "", "a path not under assets/ is rejected");
  assert.equal(unsafe.bubble.anchor, "sprite_top_center", "missing anchor defaults to the stable value");
  assert.ok(!("bubble" in saved.objects.find((o) => o.id === "no-bubble")), "absent stays absent — no Bubble block invented for an untouched object");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects.find((o) => o.id === "classic-omega").bubble, omega.bubble, "round-trips through disk");
});

test("Role Roster migration: a pre-roster layout (no characterRoles at all) yields the full default roster", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "classic-omega", world: { x: 0.5, y: 0.2769 }, width: 0.117 }],
  });
  assert.deepEqual(
    saved.characterRoles.map((r) => r.roleId),
    ["sage", "alpha", "beta", "gamma", "traveler", "pet"]
  );
  assert.ok(saved.characterRoles.every((r) => r.required === true && !("assignedCharacterId" in r)));
});

test("Role Roster: custom role + assignment round-trip; duplicate roleIds are rejected (first wins)", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterRoles: [
      { roleId: "sage", label: "SAGE", required: true, assignedCharacterId: "classic_omega", order: 0 },
      { roleId: "alpha", label: "ALPHA", required: true, order: 1 },
      { roleId: "beta", label: "BETA", required: true, order: 2 },
      { roleId: "gamma", label: "GAMMA", required: true, order: 3 },
      { roleId: "traveler", label: "TRAVELER", required: true, order: 4 },
      { roleId: "pet", label: "PET", required: true, order: 5 },
      { roleId: "host_scholar", label: "Host Scholar", required: false, assignedCharacterId: "socrates", order: 6 },
      { roleId: "host_scholar", label: "Duplicate!", order: 7 }, // dropped — first wins
    ],
  });
  assert.equal(saved.characterRoles.length, 7);
  const sage = saved.characterRoles.find((r) => r.roleId === "sage");
  assert.equal(sage.assignedCharacterId, "classic_omega", "SAGE -> Omega assignment persists");
  const host = saved.characterRoles.find((r) => r.roleId === "host_scholar");
  assert.equal(host.label, "Host Scholar");
  assert.equal(host.required, false, "added roles stay optional");
  assert.equal(host.assignedCharacterId, "socrates");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.characterRoles, saved.characterRoles, "round-trips through disk");
});

test("Role Roster: missing default roles heal back in; roleIds are normalized; labels never become identifiers", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterRoles: [
      { roleId: "  SAGE  ", label: "The Grand Sage", assignedCharacterId: "classic_omega", order: 0 },
      { roleId: "Event NPC!", order: 1 }, // added role, id needs normalizing, no label
    ],
  });
  const ids = saved.characterRoles.map((r) => r.roleId);
  assert.ok(ids.includes("sage") && ids.includes("event_npc"), "normalized ids");
  for (const d of ["alpha", "beta", "gamma", "traveler", "pet"]) {
    assert.ok(ids.includes(d), `missing default "${d}" healed back in`);
  }
  const sage = saved.characterRoles.find((r) => r.roleId === "sage");
  assert.equal(sage.label, "The Grand Sage", "custom label preserved — but the id stayed 'sage'");
  assert.equal(sage.required, true, "a default role is always required, whatever the file claims");
  assert.equal(saved.characterRoles.find((r) => r.roleId === "event_npc").label, "EVENT_NPC", "label fallback");
});

test("Role Roster: sceneObjectId is a THIRD, independent field from roleId/assignedCharacterId — round-trips distinctly", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    characterRoles: [
      { roleId: "sage", label: "SAGE", required: true, assignedCharacterId: "classic_omega", sceneObjectId: "classic-omega", order: 0 },
      { roleId: "alpha", label: "ALPHA", required: true, assignedCharacterId: "classic_alpha", sceneObjectId: "npc_alpha", order: 1 },
      { roleId: "beta", label: "BETA", required: true, order: 2 }, // unassigned — no sceneObjectId either
    ],
  });
  const sage = saved.characterRoles.find((r) => r.roleId === "sage");
  const alpha = saved.characterRoles.find((r) => r.roleId === "alpha");
  const beta = saved.characterRoles.find((r) => r.roleId === "beta");
  assert.equal(sage.roleId, "sage");
  assert.equal(sage.assignedCharacterId, "classic_omega");
  assert.equal(sage.sceneObjectId, "classic-omega", "three genuinely different strings, none conflated");
  assert.equal(alpha.sceneObjectId, "npc_alpha");
  assert.ok(!("sceneObjectId" in beta) && !("assignedCharacterId" in beta), "unassigned role has neither");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.characterRoles, saved.characterRoles, "round-trips through disk");
});

test("deriveRoleAssignments: existing npcs adopt roles in roster order (Omega -> SAGE); never overwrites", () => {
  const roster = [
    { roleId: "sage", label: "SAGE", required: true, order: 0 },
    { roleId: "alpha", label: "ALPHA", required: true, order: 1 },
  ];
  const migrated = sceneLayout.deriveRoleAssignments(roster, [{ characterId: "classic_omega" }]);
  assert.equal(migrated[0].assignedCharacterId, "classic_omega", "first npc -> first role (SAGE)");
  assert.ok(!("assignedCharacterId" in migrated[1]), "no npc left for ALPHA");
  // A roster with ANY existing assignment is left completely untouched.
  const already = [{ roleId: "sage", assignedCharacterId: "merlin", order: 0 }, { roleId: "alpha", order: 1 }];
  assert.deepEqual(sceneLayout.deriveRoleAssignments(already, [{ characterId: "classic_omega" }]), already);
  // No usable npcs -> untouched.
  assert.deepEqual(sceneLayout.deriveRoleAssignments(roster, [{ id: "no-character-id" }]), roster);
});

test("legacy object id migration: an old 'classic-dean' reference loads as 'classic-omega' automatically", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [
      { id: "classic-dean", world: { x: 0.5, y: 0.2769 }, width: 0.117, z: 2, footCollider: { width: 40, height: 14 } },
    ],
  });
  assert.equal(saved.objects[0].id, "classic-omega", "migrated on the same save() pass, not just on a later load");
  assert.deepEqual(saved.objects[0].world, { x: 0.5, y: 0.2769 }, "placement data reattaches to the renamed id");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.objects[0].id, "classic-omega", "round-trips through disk under the new id");
  assert.equal(loaded.objects[0].footCollider.width, 40, "component data survives the migration");
});

test("devTools: on by default in dev, explicitly disableable, HARD OFF in production", () => {
  delete process.env.NODE_ENV;
  delete process.env.DEV_TOOLS;
  configModule.reloadConfig();
  assert.equal(configModule.config.devTools, true, "dev run defaults on");
  assert.equal(configModule.publicConfig().devTools, true, "exposed to the frontend");

  process.env.DEV_TOOLS = "false";
  configModule.reloadConfig();
  assert.equal(configModule.config.devTools, false, "DEV_TOOLS=false disables");
  delete process.env.DEV_TOOLS;

  process.env.NODE_ENV = "production";
  process.env.DEV_TOOLS = "true"; // even an explicit true must not win
  configModule.reloadConfig();
  assert.equal(configModule.config.devTools, false, "production is unconditionally off");
  assert.equal(configModule.publicConfig().devTools, false);
  delete process.env.NODE_ENV;
  delete process.env.DEV_TOOLS;
  configModule.reloadConfig();
});
