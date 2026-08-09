// Character Player Interaction — Hover Outline / Glow (MVP).
//
// Two halves, matching what this project can actually test:
//  * Real behavioral coverage of the SCHEMA/persistence layer, by round-
//    tripping through the live sanitizer (src/services/sceneLayout.js) —
//    save/load, enabled true/false, per-field persistence, invalid input.
//  * Wiring guards for the runtime/UI layer, since public/app.js and
//    devtools/scene-editor.js are plain global-scope browser scripts with no
//    jsdom available in this project (same established precedent as
//    bookHotspotPointerEvents.test.js / animationSpeedRuntime.test.js).
//
// The single most important guarantee here is the coexistence one: a
// Character's `data-hoverable="npc"` attribute is what re-enables
// pointer-events so the Idle Controller's hover-thought bubbles work at
// all. The Prop path (applyPlayerInteractionStyle) OWNS that attribute and
// overwrites it with "prop" — so Characters deliberately do NOT route
// through it. Several tests below pin that separation down.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

let sceneLayout;
let tmpRoot;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-charpi-test-"));
  process.env.SCENE_LAYOUT_PATH = path.join(tmpRoot, "scene-layout.json");
  sceneLayout = await import("../src/services/sceneLayout.js");
});

after(async () => {
  delete process.env.SCENE_LAYOUT_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const npc = (extra) => ({ id: "classic-omega", world: { x: 0.5, y: 0.5 }, width: 0.1, kind: "npc", ...extra });
const glow = (e = {}) => ({ enabled: true, hover: { effects: [{ type: "glow", size: 2, color: "#eebd6a", opacity: 0.7, ...e }] } });
const savedPi = async (layout) => (await sceneLayout.saveSceneLayout(layout)).objects[0].playerInteraction;

// ------------------------------------------------------------- persistence

test("a Character's playerInteraction round-trips through save AND reload with every field intact", async () => {
  await sceneLayout.saveSceneLayout({ objects: [npc({ playerInteraction: glow() })] });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.objects[0].playerInteraction, {
    enabled: true,
    hover: { effects: [{ type: "glow", size: 2, color: "#eebd6a", opacity: 0.7 }] },
  });
});

test("enabled:true and enabled:false both persist — disabling keeps the authored glow so re-enabling restores it", async () => {
  const on = await savedPi({ objects: [npc({ playerInteraction: glow() })] });
  assert.equal(on.enabled, true);
  const off = await savedPi({ objects: [npc({ playerInteraction: { ...glow(), enabled: false } })] });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.hover.effects[0], { type: "glow", size: 2, color: "#eebd6a", opacity: 0.7 });
});

test("glow size persists across its full valid range, and clamps to 0..50 rather than rejecting the effect", async () => {
  for (const size of [0, 1, 2, 7, 25, 50]) {
    const pi = await savedPi({ objects: [npc({ playerInteraction: glow({ size }) })] });
    assert.equal(pi.hover.effects[0].size, size);
  }
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ size: 999 }) })] })).hover.effects[0].size, 50);
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ size: -5 }) })] })).hover.effects[0].size, 0);
});

test("glow color persists; 3-digit hex is accepted; an invalid color falls back to \"\" so the runtime's own default applies, never rejecting the effect", async () => {
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ color: "#3af" }) })] })).hover.effects[0].color, "#3af");
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ color: "#EEBD6A" }) })] })).hover.effects[0].color, "#EEBD6A");
  for (const bad of ["red", "rgb(1,2,3)", "#12345", "", 42, null]) {
    const pi = await savedPi({ objects: [npc({ playerInteraction: glow({ color: bad }) })] });
    assert.equal(pi.hover.effects[0].color, "", `color ${JSON.stringify(bad)} must degrade to ""`);
    assert.equal(pi.hover.effects[0].type, "glow", "the effect itself must survive an invalid color");
  }
});

test("glow opacity persists and clamps to 0..1", async () => {
  for (const opacity of [0, 0.25, 0.7, 1]) {
    assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ opacity }) })] })).hover.effects[0].opacity, opacity);
  }
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ opacity: 5 }) })] })).hover.effects[0].opacity, 1);
  assert.equal((await savedPi({ objects: [npc({ playerInteraction: glow({ opacity: -3 }) })] })).hover.effects[0].opacity, 0);
});

test("invalid/missing numeric fields fall back to documented defaults instead of persisting junk", async () => {
  const pi = await savedPi({ objects: [npc({ playerInteraction: { enabled: true, hover: { effects: [{ type: "glow", size: "big", opacity: "loud" }] } } })] });
  assert.deepEqual(pi.hover.effects[0], { type: "glow", size: 4, color: "", opacity: 0.7 });
});

test("MVP scope: non-glow effect types are dropped — Float/Scale/Animation stay Prop-only", async () => {
  const pi = await savedPi({
    objects: [npc({ playerInteraction: { enabled: true, hover: { effects: [
      { type: "float", distance: 6, duration: 1.2 },
      { type: "glow", size: 3, color: "#eebd6a", opacity: 0.5 },
      { type: "scale", scale: 1.05 },
      { type: "animation", source: "assets/effects/x.gif" },
    ] } } })],
  });
  assert.deepEqual(pi.hover.effects.map((e) => e.type), ["glow"]);
});

test("sparse-optional: a Character with no authored interaction persists NOTHING, so existing scene files are never rewritten and nobody is force-enabled", async () => {
  const saved = await sceneLayout.saveSceneLayout({ objects: [npc({})] });
  assert.ok(!("playerInteraction" in saved.objects[0]));
  // Off AND empty is also nothing — toggling off then saving cleans the
  // entry out rather than leaving an inert block behind.
  const emptied = await sceneLayout.saveSceneLayout({ objects: [npc({ playerInteraction: { enabled: false, hover: { effects: [] } } })] });
  assert.ok(!("playerInteraction" in emptied.objects[0]));
});

test("malformed playerInteraction never throws or corrupts the Character entry", async () => {
  for (const bad of ["nope", 42, [], { hover: "x" }, { enabled: "yes" }]) {
    const saved = await sceneLayout.saveSceneLayout({ objects: [npc({ playerInteraction: bad })] });
    assert.equal(saved.objects[0].id, "classic-omega", `input ${JSON.stringify(bad)} must leave the Character intact`);
  }
});

test("Character playerInteraction is stored on the Character's own scene-layout entry — never as a Prop, never keyed to a hardcoded character id", async () => {
  const src = fsSync.readFileSync(path.join(process.cwd(), "src", "services", "sceneLayout.js"), "utf8");
  const fn = src.slice(src.indexOf("function sanitizeCharacterPlayerInteraction"), src.indexOf("// Interaction Slots"));
  assert.doesNotMatch(fn, /alpha|beta|gamma|omega|scholar|grand_sage/i, "the capability must be generic to any Character/Role, incl. future Traveler/Pet");
});

// ------------------------------------------------------- runtime + UI wiring

const appJs = fsSync.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
const styleCss = fsSync.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8");

function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${signature}`);
}
const charStyleFn = extractFn(appJs, "function applyCharacterPlayerInteractionStyle(def, el)");

test("hover ADDS the glow: the Character sprite gets .pi-fx-glow + --pi-glow-filter, and CSS applies the filter only on :hover", () => {
  assert.match(charStyleFn, /el\.classList\.add\("pi-fx-glow"\)/);
  assert.match(charStyleFn, /el\.style\.setProperty\("--pi-glow-filter", hoverGlowFilterValue\(size, color, opacity\)\)/);
  // The on/off mechanism itself is the shared CSS rule — no JS listeners.
  assert.match(styleCss, /\.pi-fx-glow:hover\s*\{\s*filter:\s*var\(--pi-glow-filter[^)]*\);?\s*\}/);
});

test("pointer leave REMOVES the glow with no stuck filter — :hover ending resets it instantly, and disabling clears both class and custom property", () => {
  assert.match(charStyleFn, /el\.classList\.remove\("pi-fx-glow"\)/);
  assert.match(charStyleFn, /el\.style\.removeProperty\("--pi-glow-filter"\)/);
  // Base .pi-fx-glow carries no filter of its own, so losing :hover is a
  // clean revert rather than leaving a residual value.
  const base = styleCss.slice(styleCss.indexOf(".pi-fx-glow {"), styleCss.indexOf(".pi-fx-glow:hover"));
  assert.doesNotMatch(base, /filter:/);
});

test("the glow math/renderer is SHARED with Props, not a second implementation — same hoverGlowFilterValue, same custom property, same CSS rule", () => {
  assert.match(charStyleFn, /hoverGlowFilterValue\(/);
  assert.equal((appJs.match(/^function hoverGlowFilterValue\(/gm) || []).length, 1, "exactly one glow-filter implementation may exist");
  assert.equal((appJs.match(/^function hexToRgba\(/gm) || []).length, 1, "exactly one colour conversion may exist");
});

test("COEXISTENCE: the Character glow path never touches data-hoverable — that attribute stays \"npc\", which is what keeps hover-thought pointer-events alive", () => {
  assert.doesNotMatch(charStyleFn, /hoverable/, "Characters must not be given data-hoverable=\"prop\"");
  // Characters are still marked npc by their own creation paths...
  assert.match(appJs, /img\.dataset\.hoverable = "npc"/);
  // ...and the CSS that grants them pointer-events still keys on that.
  assert.match(styleCss, /\.scene-object\[data-hoverable="npc"\]\s*\{\s*pointer-events:\s*auto/);
});

test("COEXISTENCE: the existing pre_thinking hover-thought wiring is still present and untouched", () => {
  assert.match(appJs, /function showHoverThought\(roleId\)/);
  assert.match(appJs, /showHoverThought\(roleId\)/);
  // The Character glow adds no pointerenter/pointerleave listeners of its
  // own — it is pure CSS — so it cannot interfere with the thought handlers.
  assert.doesNotMatch(charStyleFn, /addEventListener/);
});

test("Characters are routed to the Character style path, Props to the Prop path — never the reverse", () => {
  assert.match(appJs, /if \(def\.kind === "prop"\) applyPlayerInteractionStyle\(def, el\);\s*\n\s*else if \(def\.kind === "npc"\) applyCharacterPlayerInteractionStyle\(def, el\);/);
});

test("NO Prop Player Interaction regression: the Prop path keeps its own full effect stack and still owns data-hoverable=\"prop\"", () => {
  const propFn = extractFn(appJs, "function applyPlayerInteractionStyle(def, el)");
  assert.match(propFn, /el\.dataset\.hoverable = "prop"/);
  for (const t of ["float", "scale", "glow"]) {
    assert.ok(propFn.includes(`effect.type === "${t}"`), `Prop path must still handle ${t}`);
  }
});
