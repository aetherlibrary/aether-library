// Light System v1 — Scene-owned lights.
//
// STYLIZED, NOT PHYSICAL: a 2D/2.5D pixel scene gets authored light overlays,
// not a lighting model. The property that matters most here is that NOTHING IS
// BAKED — the renderer composites one separate layer, so removing it restores
// the unlit Scene exactly, and no background, prop, sprite or generated Shadow
// PNG is ever modified.
//
// THE ALS DECISION, documented here because it was a judgement call: lights
// were added to ALS **v1** as an optional field rather than bumping to v2.
// See the "ALS compatibility" group below for the exact reasoning and the
// backward-compatibility caveat it accepts.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  SCENE_LIGHT_TYPES,
  LIGHT_DEFAULTS,
  LIGHT_LIMITS,
  MAX_SCENE_LIGHTS,
  DEFAULT_LIGHT_TYPE,
  sanitizeSceneLight,
  sanitizeSceneLights,
  createSceneLight,
  duplicateSceneLight,
  nextLightName,
  newLightId,
  lightTypeLabel,
} from "../src/services/sceneLights.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");

let seq = 0;
const fakeId = () => `id${String(++seq).padStart(3, "0")}`;

// =================================================================== types

test("exactly three light types exist — no Area Light in v1", () => {
  assert.deepEqual(SCENE_LIGHT_TYPES.map((t) => t.id), ["directional", "point", "spot"]);
  assert.deepEqual(SCENE_LIGHT_TYPES.map((t) => t.label), [
    "Directional Light",
    "Point Light",
    "Spot Light",
  ]);
  assert.equal(DEFAULT_LIGHT_TYPE, "directional");
  assert.ok(!SCENE_LIGHT_TYPES.some((t) => /area/i.test(t.id + t.label)), "Area Light is not in v1");
});

// ============================================================== creation

test("Add to Scene creates a light with a stable id and a readable name", () => {
  const a = createSceneLight("directional", [], fakeId);
  assert.match(a.id, /^light-/);
  assert.equal(a.name, "Directional Light 01");
  assert.equal(a.type, "directional");
  assert.equal(a.enabled, true);
  const b = createSceneLight("point", [a], fakeId);
  assert.equal(b.name, "Point Light 01", "numbering is per TYPE");
  const c = createSceneLight("point", [a, b], fakeId);
  assert.equal(c.name, "Point Light 02");
  assert.notEqual(a.id, b.id);
});

test("ids are unique and never derived from the name", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(newLightId());
  assert.equal(ids.size, 50);
  // Renaming must not re-key a light.
  const l = createSceneLight("spot", [], fakeId);
  const renamed = sanitizeSceneLight({ ...l, name: "Stage Key" });
  assert.equal(renamed.id, l.id);
  assert.equal(renamed.name, "Stage Key");
});

test("names reuse the lowest free number so deleting never causes a duplicate", () => {
  const one = { id: "a", type: "point", name: "Point Light 01" };
  const three = { id: "c", type: "point", name: "Point Light 03" };
  assert.equal(nextLightName([one, three], "point"), "Point Light 02");
  assert.equal(nextLightName([], "spot"), "Spot Light 01");
  assert.equal(lightTypeLabel("spot"), "Spot Light");
});

test("an unknown type falls back rather than creating a nonsense light", () => {
  const l = createSceneLight("area", [], fakeId);
  assert.equal(l.type, "directional");
});

// ========================================================== shared fields

test("every light carries the shared fields", () => {
  for (const t of ["directional", "point", "spot"]) {
    const l = createSceneLight(t, [], fakeId);
    for (const key of ["id", "type", "name", "enabled", "color", "intensity"]) {
      assert.ok(key in l, `${t} is missing ${key}`);
    }
    assert.match(l.color, /^#[0-9a-f]{6}$/);
    assert.equal(l.intensity, 1, "default intensity is 1");
  }
  assert.deepEqual(LIGHT_LIMITS.intensity, { min: 0, max: 2 });
});

test("Directional carries direction and the shadow fields", () => {
  const l = createSceneLight("directional", [], fakeId);
  assert.deepEqual(Object.keys(l).sort(), [
    "angle", "castShadows", "color", "enabled", "id", "intensity", "name",
    "shadowLength", "shadowSoftness", "shadowStrength", "type",
  ]);
  assert.equal(l.castShadows, false);
  assert.deepEqual(LIGHT_LIMITS.angle, { min: 0, max: 360 });
  assert.deepEqual(LIGHT_LIMITS.shadowStrength, { min: 0, max: 1 });
});

test("Point carries position, radius and falloff", () => {
  const l = createSceneLight("point", [], fakeId);
  assert.deepEqual(Object.keys(l).sort(), [
    "color", "enabled", "falloff", "id", "intensity", "name", "radius", "type", "x", "y",
  ]);
  // Position is a NORMALIZED scene coordinate, the same space every object uses.
  assert.equal(l.x, 0.5);
  assert.equal(l.y, 0.5);
});

test("Spot carries position, direction, cone, distance and falloff", () => {
  const l = createSceneLight("spot", [], fakeId);
  assert.deepEqual(Object.keys(l).sort(), [
    "angle", "color", "coneAngle", "distance", "enabled", "falloff", "id", "intensity", "name", "type", "x", "y",
  ]);
});

test("fields of one type never leak into another", () => {
  const p = sanitizeSceneLight({ id: "a", type: "point", radius: 0.3, coneAngle: 90, castShadows: true, distance: 5 });
  assert.equal(p.coneAngle, undefined);
  assert.equal(p.castShadows, undefined);
  assert.equal(p.distance, undefined);
  const d = sanitizeSceneLight({ id: "b", type: "directional", x: 0.2, radius: 9 });
  assert.equal(d.x, undefined);
  assert.equal(d.radius, undefined);
});

// ========================================================== sanitization

test("invalid values are clamped, not rejected", () => {
  const l = sanitizeSceneLight({ id: "a", type: "point", intensity: 99, radius: -5, falloff: 7, x: 50 });
  assert.equal(l.intensity, LIGHT_LIMITS.intensity.max);
  assert.equal(l.radius, LIGHT_LIMITS.radius.min);
  assert.equal(l.falloff, LIGHT_LIMITS.falloff.max);
  assert.equal(l.x, LIGHT_LIMITS.x.max);
});

test("garbage values fall back to the type default, never to NaN or 0", () => {
  const l = sanitizeSceneLight({ id: "a", type: "point", intensity: null, radius: "x", falloff: {}, x: [] });
  assert.equal(l.intensity, LIGHT_DEFAULTS.point.intensity);
  assert.equal(l.radius, LIGHT_DEFAULTS.point.radius);
  assert.equal(l.falloff, LIGHT_DEFAULTS.point.falloff);
  assert.equal(l.x, LIGHT_DEFAULTS.point.x);
  for (const v of Object.values(l)) assert.ok(typeof v !== "number" || Number.isFinite(v));
});

test("only a hex colour survives", () => {
  assert.equal(sanitizeSceneLight({ id: "a", type: "point", color: "#AABBCC" }).color, "#aabbcc");
  assert.equal(sanitizeSceneLight({ id: "a", type: "point", color: "red" }).color, LIGHT_DEFAULTS.point.color);
  assert.equal(sanitizeSceneLight({ id: "a", type: "point", color: "url(evil)" }).color, LIGHT_DEFAULTS.point.color);
  assert.equal(sanitizeSceneLight({ id: "a", type: "point", color: "#fff" }).color, LIGHT_DEFAULTS.point.color);
});

test("a light with no valid id or type is dropped entirely", () => {
  assert.equal(sanitizeSceneLight({ type: "point" }), null, "no id");
  assert.equal(sanitizeSceneLight({ id: "a" }), null, "no type");
  assert.equal(sanitizeSceneLight({ id: "a/../b", type: "point" }), null, "unsafe id");
  assert.equal(sanitizeSceneLight({ id: "a", type: "area" }), null, "unknown type");
  assert.equal(sanitizeSceneLight(null), null);
  assert.equal(sanitizeSceneLight([]), null);
});

test("unknown fields cannot enter a light", () => {
  const l = sanitizeSceneLight({ id: "a", type: "point", evil: 1, script: "<img>", __proto__: { x: 9 } });
  assert.equal(l.evil, undefined);
  assert.equal(l.script, undefined);
});

test("the collection drops malformed entries, de-duplicates ids and caps length", () => {
  const list = sanitizeSceneLights([
    { id: "a", type: "point" },
    { id: "a", type: "spot" },     // duplicate id
    { id: "b", type: "nope" },     // bad type
    null,
    "text",
  ]);
  assert.deepEqual(list.map((l) => l.id), ["a"]);
  assert.equal(list[0].type, "point", "the FIRST of a duplicate id wins");
  assert.deepEqual(sanitizeSceneLights(null), []);
  assert.deepEqual(sanitizeSceneLights("nope"), []);
  const many = Array.from({ length: MAX_SCENE_LIGHTS + 20 }, (_, i) => ({ id: `l${i}`, type: "point" }));
  assert.equal(sanitizeSceneLights(many).length, MAX_SCENE_LIGHTS);
});

// ============================================================== duplicate

test("Duplicate copies the values but takes a new id and name", () => {
  const src = createSceneLight("spot", [], fakeId);
  src.intensity = 1.7;
  src.coneAngle = 33;
  const copy = duplicateSceneLight(src, [src], fakeId);
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.name, "Spot Light 02");
  assert.equal(copy.intensity, 1.7);
  assert.equal(copy.coneAngle, 33);
  assert.equal(duplicateSceneLight(null, [], fakeId), null);
});

// ========================================================== persistence

test("lights round-trip through the Scene layout", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const out = sanitizeLayout({
    lights: [
      { id: "l1", type: "directional", name: "Sun", intensity: 1.5, angle: 200, castShadows: true, shadowStrength: 0.8 },
      { id: "l2", type: "point", name: "Lamp", x: 0.2, y: 0.8, radius: 0.4, falloff: 0.3 },
      { id: "l3", type: "spot", name: "Stage", angle: 120, coneAngle: 30, distance: 1.2 },
    ],
  });
  assert.equal(out.lights.length, 3);
  assert.equal(out.lights[0].castShadows, true);
  assert.equal(out.lights[0].shadowStrength, 0.8);
  assert.equal(out.lights[1].radius, 0.4);
  assert.equal(out.lights[2].coneAngle, 30);
});

test("a Scene with no lights loads as an empty list, never a failure", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  assert.deepEqual(sanitizeLayout({}).lights, []);
  assert.deepEqual(sanitizeLayout({ lights: "nonsense" }).lights, []);
  // Every pre-existing layout (which has no `lights` key at all) still loads.
  const legacy = sanitizeLayout({ objects: [], zones: [] });
  assert.deepEqual(legacy.lights, []);
});

test("lights round-trip through an ALS document", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { lights: [{ id: "l1", type: "point", name: "Candle", x: 0.3, y: 0.7, radius: 0.15 }] },
  });
  assert.equal(doc.scene.lights.length, 1);
  assert.equal(doc.scene.lights[0].name, "Candle");
  assert.equal(doc.scene.lights[0].radius, 0.15);
});

// ================================================= ALS compatibility (v1)

test("lights were added to ALS v1 without a version bump — documented choice", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  // The version contract is unchanged: v1 files still open, v>1 still refused.
  assert.equal(sceneFile.ALS_VERSION, 1);
  assert.equal(sceneFile.sanitizeSceneDocument({ scene: {} }).version, 1);
  assert.throws(
    () => sceneFile.validateEnvelope({ format: "aether-library-scene", version: 2, scene: {} }),
    /newer version/
  );
  // FORWARD compatibility — the direction that matters for existing files — is
  // total: an .als written before lights existed has no `lights` key and opens
  // with an empty list.
  const legacy = sceneFile.sanitizeSceneDocument({
    format: "aether-library-scene",
    version: 1,
    scene: { objects: [], zones: [] },
  });
  assert.deepEqual(legacy.scene.lights, []);
});

test("the backward caveat is real and bounded: an OLD build drops lights silently", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  // A build predating this change accepts v1 and its allowlist has no `lights`
  // key, so it would drop them without warning. That is the accepted cost of
  // an additive optional field, and it is why this test exists as the record:
  // if that becomes unacceptable, bump ALS_VERSION to 2 — the reader already
  // accepts anything <= ALS_VERSION, so v1 files keep opening, and only a
  // genuinely older build sees the loud "newer version" refusal.
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { lights: [{ id: "l1", type: "point" }] },
  });
  assert.equal(doc.version, 1, "still declares v1");
  assert.equal(doc.scene.lights.length, 1);
});

// ============================================================== rendering

test("nothing is baked — lights are ONE separate, removable layer", async () => {
  const src = await app();
  const fn = src.slice(src.indexOf("function applySceneLights(lights)"), src.indexOf("window.__applySceneLights = applySceneLights;"));
  assert.ok(fn.length > 0);
  // It only ever touches its own layer's style.
  assert.match(fn, /const layer = sceneLightLayer\(\);/);
  assert.match(fn, /layer\.style\.backgroundImage =/);
  assert.doesNotMatch(fn, /library-bg|scene-object|scene-shadow|canvas|toDataURL/);
  // The layer is a sibling element, never a filter on the scene container.
  assert.match(src, /layer\.className = "scene-light-layer";/);
});

test("rendering is idempotent — repeated applies never stack layers", async () => {
  const src = await app();
  assert.match(src, /let layer = document\.getElementById\(SCENE_LIGHT_LAYER_ID\);\s*if \(!layer\) \{/);
  const fn = src.slice(src.indexOf("function applySceneLights(lights)"), src.indexOf("window.__applySceneLights"));
  // It ASSIGNS the whole backgroundImage rather than appending to it.
  assert.match(fn, /layer\.style\.backgroundImage = active\.map\(lightBackgroundLayer\)\.join\(", "\);/);
  assert.doesNotMatch(fn, /appendChild|insertBefore/);
});

test("New Scene / runtime reset leaves the Scene unlit", async () => {
  const src = await app();
  const reset = src.slice(src.indexOf("function resetSceneRuntime() {"), src.indexOf("window.__resetSceneRuntime = resetSceneRuntime;"));
  assert.match(reset, /clearSceneLights\(\);/);
  // Emptying the ONE layer, not removing it, is what keeps repeats idempotent.
  assert.match(src, /function clearSceneLights\(\) \{\s*applySceneLights\(\[\]\);/);
});

test("the runtime applies lights from the Scene it already fetched", async () => {
  const src = await app();
  assert.match(src, /applySceneLights\(layout\?\.lights \|\| \[\]\);/);
  // No new route: it rides the always-on /api/scene-layout fetch.
  assert.doesNotMatch(src, /api\/dev\/light|api\/lights/);
});

// ============================================== history / dirty state

// ================================================== gizmos are editor-only

// ==================================================== boundaries + scope
