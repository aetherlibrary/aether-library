// Tests for the scene configuration service (src/services/sceneConfig.js):
// v2 objects (instance_id/asset_uid/x/y/scale/flipX), the flipX
// backward-compat default, non-negative scale, v1 passthrough, and
// duplicate-instance rejection.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let sceneConfig;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-sceneconfig-test-"));
  process.env.SCENE_CONFIG_PATH = path.join(tmpRoot, "classic_library.json");
  sceneConfig = await import("../src/services/sceneConfig.js");
});

after(async () => {
  delete process.env.SCENE_CONFIG_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("v2 objects round-trip with flipX; absent flipX defaults to false", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    version: 2,
    scene: "classic_library",
    objects: [
      { instance_id: "bookshelf_01", asset_uid: "asset_bookshelf_9f21", x: 1965, y: 1082, scale: 1, flipX: true, z: 1 },
      { instance_id: "cabinet_01", asset_uid: "asset_wood_cabinet_small_4c7d", x: 1196, y: 254, scale: 0.65 }, // no flipX
    ],
  });
  assert.equal(saved.objects[0].flipX, true);
  assert.equal(saved.objects[1].flipX, false, "missing flipX is treated as false");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects[0].flipX, true);
  assert.equal(loaded.objects[1].flipX, false);
});

test("scale must be >= 0 — negative scale (flip smuggling) is rejected", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "ok", asset_uid: "u1", x: 0, y: 0, scale: 0.5 },
      { instance_id: "neg", asset_uid: "u1", x: 0, y: 0, scale: -1 },
    ],
  });
  assert.deepEqual(saved.objects.map((o) => o.instance_id), ["ok"]);
});

test("duplicate instance ids are dropped (first wins)", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "dup", asset_uid: "u1", x: 1, y: 1, scale: 1 },
      { instance_id: "dup", asset_uid: "u2", x: 2, y: 2, scale: 2 },
    ],
  });
  assert.equal(saved.objects.length, 1);
  assert.equal(saved.objects[0].asset_uid, "u1");
});

test("v1 entries pass through unchanged (legacy configs survive a save)", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [{ id: "old_prop", asset: "assets/props/podium.png", x: 100, y: 200, width: 96, z: 1 }],
  });
  assert.deepEqual(saved.objects[0], { id: "old_prop", asset: "assets/props/podium.png", x: 100, y: 200, width: 96, z: 1 });
});

test("depth-layer fields: renderLayer clamps to 0..9, sortY passes through, absence stays absent", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "layered", asset_uid: "u1", x: 10, y: 20, scale: 1, renderLayer: 2, sortY: 254 },
      { instance_id: "clamped", asset_uid: "u1", x: 10, y: 20, scale: 1, renderLayer: 42.7 },
      { instance_id: "negative", asset_uid: "u1", x: 10, y: 20, scale: 1, renderLayer: -3 },
      { instance_id: "dynamic", asset_uid: "u1", x: 10, y: 20, scale: 1 },
      { instance_id: "junk", asset_uid: "u1", x: 10, y: 20, scale: 1, renderLayer: "front", sortY: "low" },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.equal(by("layered").renderLayer, 2);
  assert.equal(by("layered").sortY, 254);
  assert.equal(by("clamped").renderLayer, 9, "clamped to the band range");
  assert.equal(by("negative").renderLayer, 0);
  assert.ok(!("renderLayer" in by("dynamic")) && !("sortY" in by("dynamic")), "absent = dynamic, never materialized");
  assert.ok(!("renderLayer" in by("junk")) && !("sortY" in by("junk")), "non-numeric depth fields are dropped");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects.find((o) => o.instance_id === "layered").sortY, 254, "round-trips through disk");
});

test("collision blocks round-trip; absence stays absent; malformed values go inert, never reject the object", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "solid", asset_uid: "u1", x: 10, y: 20, scale: 1, collision: { enabled: true, offsetX: -40, offsetY: -10, width: 80, height: 20 } },
      { instance_id: "ghost", asset_uid: "u1", x: 10, y: 20, scale: 1 },
      { instance_id: "junk", asset_uid: "u1", x: 10, y: 20, scale: 1, collision: { enabled: "yes", offsetX: "left", width: -5 } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.deepEqual(by("solid").collision, { enabled: true, shape: "rectangle", offsetX: -40, offsetY: -10, width: 80, height: 20 });
  assert.ok(!("collision" in by("ghost")), "no block = blocks nothing, never materialized");
  assert.deepEqual(by("junk").collision, { enabled: false, shape: "rectangle", offsetX: 0, offsetY: 0, width: 0, height: 0 }, "malformed values fall back inert");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects.find((o) => o.instance_id === "solid").collision.width, 80, "round-trips through disk");
});

test("collision shapes: ellipse round-trips like rectangle; polygon persists its point-pair array; unknown shape defaults to rectangle; incomplete polygon persists nothing", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "oval", asset_uid: "u1", x: 0, y: 0, scale: 1, collision: { enabled: true, shape: "ellipse", offsetX: -50, offsetY: -25, width: 100, height: 50 } },
      { instance_id: "poly", asset_uid: "u1", x: 0, y: 0, scale: 1, collision: { enabled: true, shape: "polygon", points: [[-100, -20], [100, -20], [80, 30], [-80, 30]] } },
      { instance_id: "legacy_shape", asset_uid: "u1", x: 0, y: 0, scale: 1, collision: { enabled: true, shape: "hexagon", offsetX: -10, offsetY: -10, width: 20, height: 20 } },
      { instance_id: "half_drawn", asset_uid: "u1", x: 0, y: 0, scale: 1, collision: { enabled: true, shape: "polygon", points: [[-10, -10], [10, -10]] } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.deepEqual(by("oval").collision, { enabled: true, shape: "ellipse", offsetX: -50, offsetY: -25, width: 100, height: 50 });
  assert.deepEqual(by("poly").collision, { enabled: true, shape: "polygon", points: [[-100, -20], [100, -20], [80, 30], [-80, 30]] });
  assert.equal(by("legacy_shape").collision.shape, "rectangle", "unrecognized shape name falls back to rectangle");
  assert.ok(!("collision" in by("half_drawn")), "fewer than 3 points persists nothing rather than a broken shape");
});

test("malformed entries are rejected", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "no-asset", x: 0, y: 0, scale: 1 },
      { asset_uid: "no-instance", x: 0, y: 0, scale: 1 },
      { instance_id: "bad-x", asset_uid: "u", x: "nope", y: 0, scale: 1 },
      null,
    ],
  });
  assert.equal(saved.objects.length, 0);
});

test("shadow is a UNIVERSAL component for scene-config props too — independent of collision, absent stays absent, malformed asset paths are rejected", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "shadowed", asset_uid: "u1", x: 0, y: 0, scale: 1, shadow: { enabled: true, asset: "assets/shared/shadows/shadow_medium.png", offsetX: 2, offsetY: -3, width: 88, height: 13, opacity: 0.5 } },
      { instance_id: "disabled_new_prop", asset_uid: "u1", x: 0, y: 0, scale: 1, shadow: { enabled: false } },
      { instance_id: "no_shadow_block", asset_uid: "u1", x: 0, y: 0, scale: 1 },
      { instance_id: "both_independent", asset_uid: "u1", x: 0, y: 0, scale: 1, shadow: { enabled: true }, collision: { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 } },
      { instance_id: "bad_asset_path", asset_uid: "u1", x: 0, y: 0, scale: 1, shadow: { enabled: true, asset: "C:/evil/absolute.png" } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.deepEqual(by("shadowed").shadow, { enabled: true, asset: "assets/shared/shadows/shadow_medium.png", offsetX: 2, offsetY: -3, width: 88, height: 13, opacity: 0.5 });
  assert.deepEqual(by("disabled_new_prop").shadow, { enabled: false }, "new props default to shadow.enabled = false and that persists");
  assert.ok(!("shadow" in by("no_shadow_block")), "absent stays absent");
  assert.deepEqual(by("both_independent").shadow, { enabled: true }, "shadow and collision are independently stored");
  assert.deepEqual(by("both_independent").collision, { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 });
  assert.ok(!by("bad_asset_path").shadow.asset, "an absolute/invalid asset path is dropped, not persisted");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects.find((o) => o.instance_id === "shadowed").shadow.width, 88, "round-trips through disk");
});

test("interaction slots: foundation data model round-trips for scene-config props, independent of collision/shadow", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "chair_01",
        asset_uid: "u1",
        x: 100,
        y: 200,
        scale: 1,
        interactionSlots: [{ id: "sit-slot", actionId: "sit", offsetX: 0, offsetY: -10, facingDirection: "up", enabled: true, duration: 45, animationId: "sit_down" }],
      },
      { instance_id: "no_slots", asset_uid: "u1", x: 0, y: 0, scale: 1 },
      { instance_id: "empty_slots", asset_uid: "u1", x: 0, y: 0, scale: 1, interactionSlots: [] },
      {
        instance_id: "combined",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        collision: { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 },
        shadow: { enabled: true },
        interactionSlots: [{ actionId: "browse_book", enabled: false }],
      },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.deepEqual(by("chair_01").interactionSlots, [
    { id: "sit-slot", actionId: "sit", offsetX: 0, offsetY: -10, facingDirection: "up", enabled: true, duration: 45, animationId: "sit_down" },
  ]);
  assert.ok(!("interactionSlots" in by("no_slots")), "absent stays absent");
  assert.ok(!("interactionSlots" in by("empty_slots")), "empty array persists nothing");
  assert.deepEqual(by("combined").collision, { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 });
  assert.deepEqual(by("combined").shadow, { enabled: true });
  assert.equal(by("combined").interactionSlots[0].actionId, "browse_book", "interactionSlots persist independently of collision/shadow on the same object");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects.find((o) => o.instance_id === "chair_01").interactionSlots[0].facingDirection, "up", "round-trips through disk");
});

test("Prop Footprint: prop.slotId (forward reference to its owned canonical Slot) round-trips independently of interactionSlots", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "wood_cabinet_01", asset_uid: "u1", x: 100, y: 200, scale: 1, slotId: "wood_cabinet_01_anchor" },
      { instance_id: "no_slot_id", asset_uid: "u1", x: 0, y: 0, scale: 1 },
      { instance_id: "blank_slot_id", asset_uid: "u1", x: 0, y: 0, scale: 1, slotId: "   " },
      {
        instance_id: "combined",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        slotId: "combined_anchor",
        interactionSlots: [{ actionId: "sit", enabled: true }],
      },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.equal(by("wood_cabinet_01").slotId, "wood_cabinet_01_anchor");
  assert.ok(!("slotId" in by("no_slot_id")), "absent stays absent");
  assert.ok(!("slotId" in by("blank_slot_id")), "whitespace-only slotId is dropped, not persisted as junk");
  assert.equal(by("combined").slotId, "combined_anchor");
  assert.equal(by("combined").interactionSlots[0].actionId, "sit", "slotId and interactionSlots persist independently on the same object");
  const loaded = await sceneConfig.loadSceneConfig();
  assert.equal(loaded.objects.find((o) => o.instance_id === "wood_cabinet_01").slotId, "wood_cabinet_01_anchor", "round-trips through disk");
});

// ------------------------------------------------ Ground Projection milestone

test("Ground Projection: a legacy scene-config prop (no groundOffsetX/Y) sanitizes with the fields simply absent", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [{ instance_id: "wood_cabinet_01", asset_uid: "u1", x: 100, y: 200, scale: 1 }],
  });
  const obj = saved.objects[0];
  assert.ok(!("groundOffsetX" in obj) && !("groundOffsetY" in obj), "absent, not persisted as 0 — a no-op equal to the sprite anchor (x/y above)");
});

test("Ground Projection: groundOffsetX/Y round-trip on a scene-config prop, persisted only when non-zero", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "wood_cabinet_01", asset_uid: "u1", x: 1182.8, y: 253.1, scale: 1, groundOffsetX: -15, groundOffsetY: 22.5 },
      { instance_id: "bookshelf_01", asset_uid: "u1", x: 100, y: 100, scale: 1, groundOffsetX: 0, groundOffsetY: 0 },
    ],
  });
  const cabinet = saved.objects.find((o) => o.instance_id === "wood_cabinet_01");
  const bookshelf = saved.objects.find((o) => o.instance_id === "bookshelf_01");
  assert.equal(cabinet.groundOffsetX, -15);
  assert.equal(cabinet.groundOffsetY, 22.5);
  assert.ok(!("groundOffsetX" in bookshelf) && !("groundOffsetY" in bookshelf), "explicit 0,0 persists as absent");
  const loaded = await sceneConfig.loadSceneConfig();
  const reloaded = loaded.objects.find((o) => o.instance_id === "wood_cabinet_01");
  assert.equal(reloaded.groundOffsetX, -15, "round-trips through disk");
  assert.equal(reloaded.groundOffsetY, 22.5);
});

// --------------------------------------------- Player Interaction (hover)

test("playerInteraction: enabled + a single effect round-trips through save and reload", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "book_a",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: { enabled: true, hover: { effects: [{ type: "float", distance: 3, duration: 2.6 }] } },
      },
    ],
  });
  const obj = saved.objects[0];
  assert.deepEqual(obj.playerInteraction, { enabled: true, hover: { effects: [{ type: "float", distance: 3, duration: 2.6 }] } });
  const loaded = await sceneConfig.loadSceneConfig();
  assert.deepEqual(loaded.objects.find((o) => o.instance_id === "book_a").playerInteraction, obj.playerInteraction, "round-trips through disk");
});

test("playerInteraction: absent stays absent; disabled with no effects also persists nothing", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "no_pi", asset_uid: "u1", x: 0, y: 0, scale: 1 },
      { instance_id: "off_and_empty", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: false, hover: { effects: [] } } },
      { instance_id: "off_but_authored", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: false, hover: { effects: [{ type: "glow" }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.ok(!("playerInteraction" in by("no_pi")), "never authored -> absent");
  assert.ok(!("playerInteraction" in by("off_and_empty")), "disabled + no effects -> absent (nothing meaningful to keep)");
  assert.ok("playerInteraction" in by("off_but_authored"), "disabled but with an authored effect -> kept (still meaningful data)");
  assert.equal(by("off_but_authored").playerInteraction.enabled, false);
});

test("playerInteraction: multiple hover effects are preserved IN ORDER", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "stacked",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: {
          enabled: true,
          hover: {
            effects: [
              { type: "float", distance: 6, duration: 1.2 },
              { type: "glow", size: 4, color: "#eebd6a", opacity: 0.7 },
              { type: "animation", source: "assets/effects/book_shimmer.gif" },
              { type: "scale", scale: 1.05, duration: 0.3 },
            ],
          },
        },
      },
    ],
  });
  const types = saved.objects[0].playerInteraction.hover.effects.map((e) => e.type);
  assert.deepEqual(types, ["float", "glow", "animation", "scale"], "order is preserved exactly as authored, never resorted");
});

test("playerInteraction: Float parameters persist and clamp defensively", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "normal", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "float", distance: 8, duration: 0.9 }] } } },
      { instance_id: "junk", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "float", distance: "far", duration: -5 }] } } },
      { instance_id: "extreme", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "float", distance: 9999, duration: 9999 }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.deepEqual(by("normal"), { type: "float", distance: 8, duration: 0.9 });
  assert.deepEqual(by("junk"), { type: "float", distance: 6, duration: 1.2 }, "non-numeric/non-positive values fall back to safe defaults, never reject the effect");
  assert.equal(by("extreme").distance, 100, "distance clamps to a sane maximum");
  assert.equal(by("extreme").duration, 10, "duration clamps to a sane maximum");
});

test("playerInteraction: Scale parameters persist and clamp defensively", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "normal", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "scale", scale: 1.08, duration: 0.25 }] } } },
      { instance_id: "extreme", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "scale", scale: 50, duration: -1 }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.deepEqual(by("normal"), { type: "scale", scale: 1.08, duration: 0.25 });
  assert.equal(by("extreme").scale, 3, "scale clamps to a sane maximum (never lets a Prop balloon or vanish)");
  assert.equal(by("extreme").duration, 0.3, "a non-positive duration falls back to the default");
});

test("playerInteraction: Glow parameters persist; invalid color falls back rather than rejecting the effect", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "normal", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "glow", size: 2, color: "#eebd6a", opacity: 0.9 }] } } },
      { instance_id: "short_hex", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "glow", size: 1, color: "#fff", opacity: 0.5 }] } } },
      { instance_id: "bad_color", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "glow", color: "not-a-color", opacity: 5 }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.deepEqual(by("normal"), { type: "glow", size: 2, color: "#eebd6a", opacity: 0.9 });
  assert.equal(by("short_hex").color, "#fff", "3-digit hex is accepted");
  assert.equal(by("bad_color").color, "", "an invalid color string is dropped (never persisted as junk), not a rejected effect");
  assert.equal(by("bad_color").opacity, 1, "opacity clamps into 0..1");
});

test("playerInteraction: Animation source persists as a project-relative asset path; absolute/escaping/wrong-extension paths are rejected", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "with_gif", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/book_shimmer.gif" }] } } },
      { instance_id: "unassigned", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "" }] } } },
      { instance_id: "absolute", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "C:/evil/x.gif" }] } } },
      { instance_id: "escape", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/../secrets.gif" }] } } },
      { instance_id: "wrong_ext", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/notes.txt" }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  // The final, simplified Animation shape: exactly {type, source, speed} —
  // no mode, no sprite-sheet fields, ever (see the "legacy fields stripped"
  // test below for old saved data carrying those).
  assert.deepEqual(by("with_gif"), { type: "animation", source: "assets/effects/book_shimmer.gif", speed: 1 });
  // The field/effect exists even with no source yet — "assigned next" per spec.
  assert.deepEqual(by("unassigned"), { type: "animation", source: "", speed: 1 });
  assert.equal(by("absolute").source, "", "an absolute machine path is never persisted");
  assert.equal(by("escape").source, "", "a path-escape attempt is never persisted");
  assert.equal(by("wrong_ext").source, "", "a non-image/gif extension is rejected");
});

test("playerInteraction: Animation speed defaults to 1.0 and round-trips every 0.1 F8 slider stop from 0.5 to 3.0, including the old 0.5-increment legacy values", async () => {
  const stops = [0.5, 0.6, 0.9, 1.0, 1.1, 1.2, 1.5, 1.7, 2.0, 2.3, 2.5, 2.9, 3.0];
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "default_speed", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif" }] } } },
      ...stops.map((speed) => ({
        instance_id: `speed_${speed}`,
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed }] } },
      })),
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.equal(by("default_speed").speed, 1, "absent speed defaults to 1.0×");
  for (const speed of stops) {
    assert.equal(by(`speed_${speed}`).speed, speed, `${speed}× round-trips exactly — it's already a valid F8 0.1 slider stop`);
  }
});

test("playerInteraction: Animation speed is snapped to the nearest 0.1 F8 slider stop, not merely clamped; invalid input never corrupts the effect", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "rounds_down", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 1.24 }] } } },
      { instance_id: "rounds_up", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 1.26 }] } } },
      { instance_id: "just_under_a_stop", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 2.24 }] } } },
      { instance_id: "too_slow", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 0.1 }] } } },
      { instance_id: "too_fast", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 4.0 }] } } },
      { instance_id: "zero", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 0 }] } } },
      { instance_id: "negative", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: -2 }] } } },
      { instance_id: "nan_string", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: "fast" }] } } },
      { instance_id: "not_a_number", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: NaN }] } } },
      { instance_id: "at_bounds", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 3 }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id);
  assert.equal(by("rounds_down").playerInteraction.hover.effects[0].speed, 1.2, "1.24 rounds down to the nearest 0.1 stop, 1.2 — and persists as exactly 1.2, never a float artifact like 1.2000000000000002");
  assert.equal(by("rounds_up").playerInteraction.hover.effects[0].speed, 1.3, "1.26 rounds up to the nearest 0.1 stop, 1.3");
  assert.equal(by("just_under_a_stop").playerInteraction.hover.effects[0].speed, 2.2, "2.24 snaps down to 2.2 (nearest 0.1 stop)");
  assert.equal(by("too_slow").playerInteraction.hover.effects[0].speed, 0.5, "clamps up to the minimum, never rejects the Prop/effect");
  assert.equal(by("too_fast").playerInteraction.hover.effects[0].speed, 3, "clamps down to the maximum (4.0 -> 3.0)");
  assert.equal(by("zero").playerInteraction.hover.effects[0].speed, 1, "a non-positive speed falls back to the 1.0× default rather than persisting zero/negative junk");
  assert.equal(by("negative").playerInteraction.hover.effects[0].speed, 1);
  assert.equal(by("nan_string").playerInteraction.hover.effects[0].speed, 1, "a non-numeric speed falls back to the default, never crashes the save");
  assert.equal(by("not_a_number").playerInteraction.hover.effects[0].speed, 1, "an actual NaN value falls back to the default");
  assert.equal(by("at_bounds").playerInteraction.hover.effects[0].speed, 3, "the boundary value itself is accepted exactly");
  for (const id of ["rounds_down", "rounds_up", "just_under_a_stop", "too_slow", "too_fast", "zero", "negative", "nan_string", "not_a_number", "at_bounds"]) {
    assert.ok(by(id), `${id}: the whole Prop still saves despite the odd/invalid speed input`);
  }
});

test("playerInteraction: Animation speed never persists as a long floating-point value — every 0.1 stop round-trips as a clean, short decimal", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0].map((speed, i) => ({
      instance_id: `clean_${i}`,
      asset_uid: "u1",
      x: 0,
      y: 0,
      scale: 1,
      playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed }] } },
    })),
  });
  for (const o of saved.objects) {
    const speed = o.playerInteraction.hover.effects[0].speed;
    assert.equal(JSON.stringify(speed).length <= 3, true, `${o.instance_id}: speed ${speed} must serialize as a short decimal (e.g. "1.2"), never a float artifact`);
  }
});

test("playerInteraction: Animation's `behavior` path persists as a project-relative JSON path; absolute/escaping/wrong-extension paths are rejected; omitted when empty", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "with_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", behavior: "assets/behaviors/core_book_behavior.json" }] } } },
      { instance_id: "no_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif" }] } } },
      { instance_id: "empty_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", behavior: "" }] } } },
      { instance_id: "absolute_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", behavior: "C:/evil/x.json" }] } } },
      { instance_id: "escape_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", behavior: "assets/../secrets.json" }] } } },
      { instance_id: "wrong_ext_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", behavior: "assets/behaviors/notes.txt" }] } } },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.deepEqual(by("with_behavior"), { type: "animation", source: "assets/effects/a.gif", speed: 1, behavior: "assets/behaviors/core_book_behavior.json" });
  assert.deepEqual(by("no_behavior"), { type: "animation", source: "assets/effects/a.gif", speed: 1 }, "behavior key is entirely absent, never written as an empty string");
  assert.ok(!("behavior" in by("empty_behavior")), "an empty string behavior is omitted, not persisted as ''");
  assert.ok(!("behavior" in by("absolute_behavior")), "an absolute machine path is never persisted");
  assert.ok(!("behavior" in by("escape_behavior")), "a path-escape attempt is never persisted");
  assert.ok(!("behavior" in by("wrong_ext_behavior")), "a non-.json extension is rejected");
});

test("playerInteraction: Animation's `behavior` survives a reload (loadSceneConfig), unaffected by whether `source` is set", async () => {
  await sceneConfig.saveSceneConfig({
    objects: [
      { instance_id: "reload_behavior", asset_uid: "u1", x: 0, y: 0, scale: 1, playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", source: "assets/effects/a.gif", speed: 2, behavior: "assets/behaviors/core_book_behavior.json" }] } } },
    ],
  });
  const loaded = await sceneConfig.loadSceneConfig();
  const effect = loaded.objects.find((o) => o.instance_id === "reload_behavior").playerInteraction.hover.effects[0];
  assert.equal(effect.behavior, "assets/behaviors/core_book_behavior.json");
  assert.equal(effect.speed, 2);
});

test("playerInteraction: legacy Sprite Sheet fields (mode/frameWidth/frameHeight/frameCount/fps/loop) are stripped safely on load, never corrupting the effect or the Prop", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "old_spritesheet_authored",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        // Shape of an effect authored during the short-lived Sprite Sheet
        // authoring UI — must load cleanly with ONLY type/source/speed
        // surviving.
        playerInteraction: {
          enabled: true,
          hover: { effects: [{ type: "animation", mode: "spriteSheet", source: "assets/effects/book_flip_sheet.png", speed: 2, frameWidth: 128, frameHeight: 128, frameCount: 9, fps: 12, loop: false }] },
        },
      },
      {
        instance_id: "old_gif_mode_authored",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: { enabled: true, hover: { effects: [{ type: "animation", mode: "gif", source: "assets/effects/a.gif", speed: 1.5 }] } },
      },
    ],
  });
  const by = (id) => saved.objects.find((o) => o.instance_id === id).playerInteraction.hover.effects[0];
  assert.deepEqual(by("old_spritesheet_authored"), { type: "animation", source: "assets/effects/book_flip_sheet.png", speed: 2 }, "mode/frameWidth/frameHeight/frameCount/fps/loop are all gone; source and speed (snapped, already valid) survive");
  assert.deepEqual(by("old_gif_mode_authored"), { type: "animation", source: "assets/effects/a.gif", speed: 1.5 }, "an old gif-mode effect loses only the now-meaningless mode field");
});

test("playerInteraction: Animation coexists with Float and Glow in the same effect stack without cross-contamination", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "core_book_like",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: {
          enabled: true,
          hover: {
            effects: [
              { type: "float", distance: 3, duration: 2.6 },
              { type: "glow", size: 1, color: "#eebd6a", opacity: 0.7 },
              { type: "animation", source: "assets/effects/animations/core_book_flip.gif", speed: 1.5 },
            ],
          },
        },
      },
    ],
  });
  const effects = saved.objects[0].playerInteraction.hover.effects;
  assert.equal(effects.length, 3, "all three effects survive together");
  assert.deepEqual(effects[0], { type: "float", distance: 3, duration: 2.6 });
  assert.deepEqual(effects[1], { type: "glow", size: 1, color: "#eebd6a", opacity: 0.7 });
  assert.deepEqual(effects[2], { type: "animation", source: "assets/effects/animations/core_book_flip.gif", speed: 1.5 });
});

test("playerInteraction: an unknown effect type is dropped safely, never rejects the whole Prop or the other effects", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "mixed",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: {
          enabled: true,
          hover: { effects: [{ type: "float", distance: 4, duration: 1 }, { type: "explode_the_prop", power: 9000 }, { type: "glow", size: 2 }] },
        },
      },
    ],
  });
  const obj = saved.objects[0];
  assert.ok(obj, "the Prop itself is never rejected because of one bad effect");
  const types = obj.playerInteraction.hover.effects.map((e) => e.type);
  assert.deepEqual(types, ["float", "glow"], "the unrecognized effect is dropped; the valid ones on either side survive");
});

test("playerInteraction: a future external effectDefinition reference round-trips as declarative data only (no code execution surface)", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "future_preset",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        playerInteraction: {
          enabled: true,
          hover: { effects: [{ type: "effectDefinition", source: "assets/effects/example.json" }, { type: "effectDefinition", code: "alert(1)" }] },
        },
      },
    ],
  });
  const effects = saved.objects[0].playerInteraction.hover.effects;
  assert.deepEqual(effects[0], { type: "effectDefinition", source: "assets/effects/example.json" });
  // No `source` at all (only a stray `code` field, never a supported key) —
  // the reference has nothing but a source, so it drops rather than
  // persisting a meaningless/empty entry; the malformed "code" field is
  // never round-tripped either way (declarative-only, no execution surface).
  assert.equal(effects.length, 1, "the entry with no valid source is dropped, not silently accepted with a code field");
});

test("playerInteraction is independent of shadow/collision/interactionSlots on the same Prop", async () => {
  const saved = await sceneConfig.saveSceneConfig({
    objects: [
      {
        instance_id: "everything",
        asset_uid: "u1",
        x: 0,
        y: 0,
        scale: 1,
        shadow: { enabled: true },
        collision: { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 },
        interactionSlots: [{ actionId: "sit", enabled: true }],
        playerInteraction: { enabled: true, hover: { effects: [{ type: "glow", size: 2 }] } },
      },
    ],
  });
  const obj = saved.objects[0];
  assert.deepEqual(obj.shadow, { enabled: true });
  assert.deepEqual(obj.collision, { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -10, width: 20, height: 20 });
  assert.equal(obj.interactionSlots[0].actionId, "sit");
  assert.equal(obj.playerInteraction.hover.effects[0].type, "glow");
});

// The real, currently-shipped scene data (not the isolated SCENE_CONFIG_PATH
// fixture above) — confirms core_book_01's migrated Player Interaction
// (the old hardcoded #book-hotspot hover CSS's replacement) actually
// survives sanitization exactly as authored. sanitizeSceneConfig() is a
// pure function of its input and never touches SCENE_CONFIG_PATH, so this
// is safe to run against the real file in the same isolated test process.
test("core_book_01 in the real scene data carries the migrated Float+Glow Player Interaction", async () => {
  const fsSync = await import("node:fs");
  const realPath = path.join(process.cwd(), "assets", "scenes", "classic_library.json");
  const raw = JSON.parse(fsSync.readFileSync(realPath, "utf8"));
  const sanitized = sceneConfig.sanitizeSceneConfig(raw);
  const book = sanitized.objects.find((o) => o.instance_id === "core_book_01");
  assert.ok(book, "core_book_01 exists in the real scene-config data");
  assert.ok(book.playerInteraction?.enabled, "Player Interaction is enabled");
  const types = book.playerInteraction.hover.effects.map((e) => e.type);
  assert.ok(types.includes("float"), "the migrated Float effect is present");
  assert.ok(types.includes("glow"), "the migrated Glow effect is present");
  const anim = book.playerInteraction.hover.effects.find((e) => e.type === "animation");
  if (anim) {
    // Whatever Animation config is currently authored on the real book (with
    // or without an explicit speed, and whether or not it still carries
    // legacy Sprite Sheet fields from before they were removed) must
    // sanitize to a valid, safe, simplified {type, source, speed} shape —
    // never crash or silently drop the effect.
    assert.ok(anim.speed >= 0.5 && anim.speed <= 3, "speed sanitizes into the current F8 slider range");
    // `behavior` is a legitimate optional field (the real core_book_01 now
    // references assets/behaviors/core_book_behavior.json) — allow it, but
    // nothing else: no mode/frameWidth/frameHeight/frameCount/fps/loop.
    const allowedKeys = ["behavior", "source", "speed", "type"];
    for (const key of Object.keys(anim)) {
      assert.ok(allowedKeys.includes(key), `unexpected key "${key}" survived sanitization — only the final, simplified fields (plus optional behavior) may survive`);
    }
  }
});

test("Ground Projection isolation: editing groundOffsetX/Y produces zero change to collision, shadow, sortY, x, or y", async () => {
  const base = {
    instance_id: "wood_cabinet_01",
    asset_uid: "u1",
    x: 1182.8,
    y: 253.1,
    scale: 1,
    sortY: 300,
    shadow: { enabled: true },
    collision: { enabled: true, shape: "rectangle", offsetX: -42.5, offsetY: -94.1, width: 88.3, height: 102.1 },
  };
  const before = await sceneConfig.saveSceneConfig({ objects: [base] });
  const after = await sceneConfig.saveSceneConfig({ objects: [{ ...base, groundOffsetX: -15, groundOffsetY: 22.5 }] });
  const b = before.objects[0];
  const a = after.objects[0];
  assert.equal(a.x, b.x, "x (sprite anchor) is unchanged");
  assert.equal(a.y, b.y, "y (sprite anchor) is unchanged");
  assert.deepEqual(a.collision, b.collision, "collision is byte-identical");
  assert.deepEqual(a.shadow, b.shadow, "shadow is byte-identical");
  assert.equal(a.sortY, b.sortY, "sortY is unchanged");
  assert.equal(a.groundOffsetX, -15);
  assert.equal(a.groundOffsetY, 22.5);
});
