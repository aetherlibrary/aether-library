// Light Blocker v1 — fake 2D occluders for stylized environmental shadowing.
//
// THE OWNERSHIP RULE these tests exist to protect: a Light Blocker is NOT a
// fourth Zone type. Zones control movement and interaction; blockers control
// lighting occlusion; they must be able to evolve independently, so they live
// in their own Scene collection and share only geometry.
//
// THE MODEL: no ray tracing. A blocker's outline is projected along the
// Directional Light's travel vector and the swept hull is drawn as a
// translucent dark shape. Four rectangles arranged as a window frame therefore
// throw a window-shaped pattern, and the GAPS stay open because nothing is
// drawn there.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  BLOCKER_SHAPES,
  BLOCKER_LIMITS,
  BLOCKER_DEFAULTS,
  MAX_SCENE_LIGHT_BLOCKERS,
  DEFAULT_BLOCKER_SHAPE,
  sanitizeLightBlocker,
  sanitizeLightBlockers,
  createLightBlocker,
  duplicateLightBlocker,
  nextBlockerName,
  newBlockerId,
  blockerBounds,
  createSceneLight,
} from "../src/services/sceneLights.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");

let seq = 0;
const fakeId = () => `b${String(++seq).padStart(3, "0")}`;

// ============================================== ownership: NOT a zone type

test("Light Blockers are a separate Scene collection, never a fourth Zone type", async () => {
  const { sanitizeLayout, ZONE_TYPES } = await import("../src/services/sceneLayout.js");
  // The zone type list is untouched.
  assert.deepEqual(ZONE_TYPES, ["blocked", "interaction", "walkable"]);
  assert.ok(!ZONE_TYPES.includes("light"), "no light zone type");
  assert.ok(!ZONE_TYPES.includes("blocker"), "no blocker zone type");
  // A blocker offered as a zone is rejected by the zone sanitizer...
  const out = sanitizeLayout({
    zones: [{ id: "z", type: "lightBlocker", shape: "rect", rect: { x: 0, y: 0, w: 0.1, h: 0.1 } }],
    lightBlockers: [{ id: "b1", shape: "rect" }],
  });
  assert.deepEqual(out.zones, [], "an unknown zone type is dropped");
  // ...and lives only in its own collection.
  assert.equal(out.lightBlockers.length, 1);
  assert.equal(out.lightBlockers[0].id, "b1");
});

test("both collections coexist and are independent", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const out = sanitizeLayout({
    zones: [
      { id: "walk", type: "walkable", shape: "rect", rect: { x: 0, y: 0.5, w: 1, h: 0.4 } },
      { id: "wall", type: "blocked", shape: "rect", rect: { x: 0, y: 0, w: 1, h: 0.1 } },
      { id: "talk", type: "interaction", shape: "ellipse", rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } },
    ],
    lightBlockers: [{ id: "b1", shape: "rect" }, { id: "b2", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.1, y: 0.2 }] }],
  });
  assert.deepEqual(out.zones.map((z) => z.type), ["walkable", "blocked", "interaction"], "movement Zones are unchanged");
  assert.equal(out.lightBlockers.length, 2);
  // Nothing in a zone knows about lighting, and nothing in a blocker knows
  // about movement.
  assert.ok(!("blocks" in out.zones[0]));
  assert.ok(!("type" in out.lightBlockers[0]), "a blocker has a SHAPE, not a zone type");
});

// =================================================================== shapes

test("all three shapes exist and round-trip", () => {
  assert.deepEqual(BLOCKER_SHAPES, ["rect", "ellipse", "polygon"]);
  assert.equal(DEFAULT_BLOCKER_SHAPE, "rect");
  for (const shape of BLOCKER_SHAPES) {
    const b = createLightBlocker(shape, [], fakeId);
    assert.equal(b.shape, shape);
    assert.match(b.id, /^blocker-/);
    assert.equal(b.enabled, true);
    assert.equal(b.opacity, 1, "blocking strength defaults to 1");
  }
});

test("Rectangle and Ellipse carry a rect; Polygon carries points", () => {
  const r = createLightBlocker("rect", [], fakeId);
  assert.deepEqual(Object.keys(r).sort(), ["blocks", "enabled", "id", "name", "opacity", "rect", "shape", "softness"]);
  assert.deepEqual(Object.keys(r.rect).sort(), ["h", "w", "x", "y"]);
  const e = createLightBlocker("ellipse", [], fakeId);
  assert.ok(e.rect, "an ellipse is defined by its bounding rect, like a zone ellipse");
  const p = createLightBlocker("polygon", [], fakeId);
  assert.ok(Array.isArray(p.points) && p.points.length >= 3);
  assert.equal(p.rect, undefined);
});

test("a polygon with fewer than three vertices is dropped, not repaired", () => {
  assert.equal(sanitizeLightBlocker({ id: "a", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), null);
  assert.equal(sanitizeLightBlocker({ id: "a", shape: "polygon", points: [] }), null);
  assert.equal(sanitizeLightBlocker({ id: "a", shape: "polygon" }), null);
  // An incomplete shape is worse than absence — the same rule sanitizeZone uses.
  const ok = sanitizeLightBlocker({ id: "a", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.1, y: 0.2 }] });
  assert.equal(ok.points.length, 3);
});

test("bounds are computed once, for every shape", () => {
  const r = sanitizeLightBlocker({ id: "a", shape: "rect", rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
  assert.deepEqual(blockerBounds(r), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  const p = sanitizeLightBlocker({ id: "b", shape: "polygon", points: [{ x: 0.2, y: 0.1 }, { x: 0.6, y: 0.3 }, { x: 0.4, y: 0.5 }] });
  const bb = blockerBounds(p);
  assert.equal(bb.x, 0.2);
  assert.equal(bb.y, 0.1);
  assert.ok(Math.abs(bb.w - 0.4) < 1e-9);
  assert.ok(Math.abs(bb.h - 0.4) < 1e-9);
});

// ============================================================ sanitization

test("invalid geometry is clamped, garbage falls back to the default", () => {
  const b = sanitizeLightBlocker({ id: "a", shape: "rect", rect: { x: 99, y: -99, w: -1, h: "x" }, opacity: 5, softness: -2 });
  assert.equal(b.rect.x, BLOCKER_LIMITS.x.max);
  assert.equal(b.rect.y, BLOCKER_LIMITS.y.min);
  assert.equal(b.rect.w, BLOCKER_LIMITS.w.min);
  assert.equal(b.rect.h, BLOCKER_DEFAULTS.rect.h, "garbage uses the default, not the range minimum");
  assert.equal(b.opacity, 1);
  assert.equal(b.softness, 0);
});

test("a blocker with no valid id is dropped", () => {
  assert.equal(sanitizeLightBlocker({ shape: "rect" }), null);
  assert.equal(sanitizeLightBlocker({ id: "a/../b", shape: "rect" }), null);
  assert.equal(sanitizeLightBlocker(null), null);
  assert.equal(sanitizeLightBlocker([]), null);
});

test("unknown fields cannot enter a blocker", () => {
  const b = sanitizeLightBlocker({ id: "a", shape: "rect", evil: 1, type: "walkable", characterLayer: 3 });
  assert.equal(b.evil, undefined);
  assert.equal(b.type, undefined, "a zone's type can never leak in");
  assert.equal(b.characterLayer, undefined);
});

test("the collection de-duplicates ids, drops junk and caps length", () => {
  const list = sanitizeLightBlockers([
    { id: "a", shape: "rect" },
    { id: "a", shape: "ellipse" },
    { id: "", shape: "rect" },
    null,
  ]);
  assert.deepEqual(list.map((b) => b.id), ["a"]);
  assert.equal(list[0].shape, "rect", "the FIRST of a duplicate id wins");
  assert.deepEqual(sanitizeLightBlockers(null), []);
  const many = Array.from({ length: MAX_SCENE_LIGHT_BLOCKERS + 10 }, (_, i) => ({ id: `b${i}`, shape: "rect" }));
  assert.equal(sanitizeLightBlockers(many).length, MAX_SCENE_LIGHT_BLOCKERS);
});

// ================================================== per-light-type blocking

test("blocks is a per-light-type map, directional on by default", () => {
  const b = createLightBlocker("rect", [], fakeId);
  assert.deepEqual(b.blocks, { directional: true, point: false, spot: false });
  // Point/Spot are schema-ready: they persist, but v1 has no renderer.
  const on = sanitizeLightBlocker({ id: "a", shape: "rect", blocks: { directional: false, point: true, spot: true } });
  assert.deepEqual(on.blocks, { directional: false, point: true, spot: true });
});

// ================================================== naming / duplicate

test("names are blocker-01, blocker-02 … reusing the lowest free number", () => {
  assert.equal(nextBlockerName([]), "blocker-01");
  assert.equal(nextBlockerName([{ name: "blocker-01" }, { name: "blocker-03" }]), "blocker-02");
  const ids = new Set();
  for (let i = 0; i < 40; i++) ids.add(newBlockerId());
  assert.equal(ids.size, 40);
});

test("Duplicate deep-copies geometry and takes a new id and name", () => {
  const src = createLightBlocker("polygon", [], fakeId);
  const copy = duplicateLightBlocker(src, [src], fakeId);
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.name, "blocker-02");
  assert.deepEqual(copy.points, src.points);
  // A deep copy: moving the copy must not move the original.
  copy.points[0].x += 0.5;
  assert.notEqual(copy.points[0].x, src.points[0].x);
  const rectSrc = createLightBlocker("rect", [], fakeId);
  const rectCopy = duplicateLightBlocker(rectSrc, [rectSrc], fakeId);
  rectCopy.rect.x += 0.3;
  assert.notEqual(rectCopy.rect.x, rectSrc.rect.x);
  assert.equal(duplicateLightBlocker(null, [], fakeId), null);
});

// ============================================== the directional projection

const app_ = () => app();

test("the projection is a swept hull along the light's travel vector", async () => {
  const src = await app_();
  const fn = src.slice(src.indexOf("function blockerShadowPolygon(blocker, dx, dy)"), src.indexOf("function convexHull(points)"));
  assert.ok(fn.length > 0);
  // Blocker outline + the same outline translated, hulled together.
  assert.match(fn, /const moved = pts\.map\(\(\[x, y\]\) => \[x \+ dx, y \+ dy\]\);/);
  assert.match(fn, /return convexHull\(all\);/);
  // Polygons project their real geometry; rect/ellipse use the bounding quad.
  assert.match(fn, /blocker\.shape === "polygon"\s*\?\s*blocker\.points\.map/);
});

test("Cast Shadows OFF produces no projected shadow at all", async () => {
  const src = await app_();
  const fn = src.slice(src.indexOf("function applyLightBlockerShadows(lights, blockers)"), src.indexOf("window.__applyLightBlockerShadows"));
  assert.match(fn, /l\.type === "directional" && l\.enabled !== false && l\.castShadows === true/);
  assert.match(fn, /if \(!sun \|\| !active\.length\) \{\s*layer\.innerHTML = "";\s*layer\.style\.display = "none";/);
});

test("a disabled blocker, and one that does not block directional, produce nothing", async () => {
  const src = await app_();
  const fn = src.slice(src.indexOf("function applyLightBlockerShadows(lights, blockers)"), src.indexOf("window.__applyLightBlockerShadows"));
  assert.match(fn, /b\.enabled !== false && b\.blocks\?\.directional !== false/);
});

test("Shadow Strength drives opacity and Shadow Length drives distance", async () => {
  const src = await app_();
  const fn = src.slice(src.indexOf("function applyLightBlockerShadows(lights, blockers)"), src.indexOf("window.__applyLightBlockerShadows"));
  // Length feeds the vector...
  assert.match(fn, /const \{ dx, dy \} = shadowVector\(sun\.angle, sun\.shadowLength\);/);
  // ...strength feeds the fill alpha, multiplied by the blocker's own opacity
  // so a partly-transparent blocker casts a partly-transparent shadow.
  assert.match(fn, /const alpha = Math\.max\(0, Math\.min\(1, sun\.shadowStrength \* \(b\.opacity \?\? 1\)\)\);/);
  assert.match(fn, /fill="rgba\(0,0,0,\$\{alpha\.toFixed\(3\)\}\)"/);
});

test("Shadow Softness is implemented, as a blur on the projection layer", async () => {
  const src = await app_();
  const fn = src.slice(src.indexOf("function applyLightBlockerShadows(lights, blockers)"), src.indexOf("window.__applyLightBlockerShadows"));
  assert.match(fn, /layer\.style\.filter = softness > 0 \? `blur\(/);
  // Documented as global rather than per-blocker.
  assert.match(fn, /a per-blocker blur\n\s*\/\/ would need one filter each/);
});

test("the directional light carries the new shadow fields with sane ranges", async () => {
  const { LIGHT_LIMITS } = await import("../src/services/sceneLights.js");
  const l = createSceneLight("directional", []);
  assert.equal(typeof l.shadowLength, "number");
  assert.equal(typeof l.shadowSoftness, "number");
  assert.deepEqual(LIGHT_LIMITS.shadowLength, { min: 0, max: 1 });
  assert.deepEqual(LIGHT_LIMITS.shadowSoftness, { min: 0, max: 1 });
  assert.ok(l.shadowLength > 0, "a default shadow is visible without tuning");
});

// ============================================================== rendering

test("the projected layer sits between the background and the scene objects", async () => {
  const css = await readSource("../public/style.css");
  const rule = css.slice(css.indexOf(".scene-light-blocker-layer {"), css.indexOf("}", css.indexOf(".scene-light-blocker-layer {")));
  assert.match(rule, /z-index: 5;/);
  assert.match(rule, /pointer-events: none;/);
  // The lowest scene object z is 10 (sceneDepthZ), so 5 is below every prop,
  // character and existing ground shadow, and above the static background.
  const src = await app_();
  assert.match(src, /return 10 \+ layer \* DEPTH_LAYER_BAND \+ ySub;/);
  // ...and below the light overlay, which is above everything.
  assert.match(css, /z-index: 1000002;/);
});

test("rendering is idempotent — no duplicate layer or shadow after reopen", async () => {
  const src = await app_();
  assert.match(src, /let layer = document\.getElementById\(LIGHT_BLOCKER_LAYER_ID\);\s*if \(!layer\) \{/);
  const fn = src.slice(src.indexOf("function applyLightBlockerShadows(lights, blockers)"), src.indexOf("window.__applyLightBlockerShadows"));
  // The contents are REPLACED wholesale, never appended to.
  assert.match(fn, /layer\.innerHTML =\s*`<svg/);
  assert.doesNotMatch(fn, /appendChild|insertAdjacent/);
});

test("New Scene / runtime reset clears the projection completely", async () => {
  const src = await app_();
  assert.match(src, /function clearSceneLights\(\) \{\s*applySceneLights\(\[\]\);\s*applyLightBlockerShadows\(\[\], \[\]\);/);
  const reset = src.slice(src.indexOf("function resetSceneRuntime() {"), src.indexOf("window.__resetSceneRuntime = resetSceneRuntime;"));
  assert.match(reset, /clearSceneLights\(\);/);
});

test("the runtime applies blockers from the Scene it already fetched", async () => {
  const src = await app_();
  assert.match(src, /applyLightBlockerShadows\(layout\?\.lights \|\| \[\], layout\?\.lightBlockers \|\| \[\]\);/);
  assert.doesNotMatch(src, /api\/dev\/blocker|api\/lightBlockers/, "no route of its own");
});

// ========================================================== persistence

test("blockers round-trip through the Scene layout", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const out = sanitizeLayout({
    lightBlockers: [
      { id: "b1", shape: "rect", name: "frame-top", rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.05 }, opacity: 0.8 },
      { id: "b2", shape: "ellipse", rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.1 } },
      { id: "b3", shape: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }] },
    ],
  });
  assert.equal(out.lightBlockers.length, 3);
  assert.equal(out.lightBlockers[0].name, "frame-top");
  assert.equal(out.lightBlockers[0].opacity, 0.8);
  assert.equal(out.lightBlockers[2].points.length, 3);
});

test("a Scene with no blockers loads as an empty list", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  assert.deepEqual(sanitizeLayout({}).lightBlockers, []);
  assert.deepEqual(sanitizeLayout({ lightBlockers: "nope" }).lightBlockers, []);
  // Every pre-existing layout still loads.
  assert.deepEqual(sanitizeLayout({ objects: [], zones: [] }).lightBlockers, []);
});

test("blockers round-trip through an ALS document, still at version 1", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { lightBlockers: [{ id: "b1", shape: "rect", rect: { x: 0.2, y: 0.2, w: 0.3, h: 0.1 } }] },
  });
  assert.equal(doc.version, 1, "an additive optional field needs no bump");
  assert.equal(doc.scene.lightBlockers.length, 1);
  assert.equal(doc.scene.lightBlockers[0].rect.w, 0.3);
  // The version gate is NOT weakened: a newer file is still refused outright.
  assert.throws(
    () => sceneFile.validateEnvelope({ format: "aether-library-scene", version: 2, scene: {} }),
    /newer version/
  );
  // An .als written before blockers existed opens with an empty list.
  const legacy = sceneFile.sanitizeSceneDocument({ format: "aether-library-scene", version: 1, scene: { zones: [] } });
  assert.deepEqual(legacy.scene.lightBlockers, []);
});

// ============================================== editor UI + visualization

// ================================================ history / dirty state

// ====================================== the lighting preview is not data

// ================================================================ scope

test("future compatibility is left open without being implemented", async () => {
  const src = await readSource("../src/services/sceneLights.js");
  // Named so the shape is not designed out...
  for (const future of ["transmission", "stained-glass", "per-light blocker masks", "animated blockers"]) {
    assert.ok(src.toLowerCase().includes(future.toLowerCase()), `${future} should be noted as future work`);
  }
  // ...but none of them exists as a field.
  const b = sanitizeLightBlocker({ id: "a", shape: "rect", tint: "#ff0000", transmission: 0.5, mask: "x" });
  assert.equal(b.tint, undefined);
  assert.equal(b.transmission, undefined);
  assert.equal(b.mask, undefined);
});

test("production exposes no Light Blocker authoring", async () => {
  const server = await readSource("../src/server.js");
  assert.doesNotMatch(server, /lightBlocker/i, "blockers need no route of their own");
  const appSrc = await app_();
  assert.doesNotMatch(appSrc, /renderBlockerSection|BLOCKER_SHAPE_OPTIONS|initBlockerDrag/);
  // Production still RENDERS them — the renderer is production code.
  assert.match(appSrc, /function applyLightBlockerShadows\(lights, blockers\)/);
});
