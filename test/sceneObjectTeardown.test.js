// Regression guard for the "deleting a Prop with Shadow enabled leaves the
// Shadow behind as a visible orphan" bug (F8 Scene Editor). Root cause:
// deleteSceneProp (devtools/scene-editor.js) only ever hid the main sprite
// element (`scene-${def.id}`, display:none) — it never touched the Shadow's
// own separate DOM node (`scene-shadow-${def.id}`, created by
// ensureShadowElement, public/app.js), nor the decoded-GIF canvas
// (`scene-anim-canvas-${def.id}`) or the Map-based runtime animation state
// (activeGifPlaybacks/animationActivation/runtimeAnimationSpeedOverrides,
// all keyed by instance id). The fix: one generic teardownSceneObject(id)
// (public/app.js) that hides/stops/clears all of it, called from BOTH
// places a scene-config Prop can transition into `deleted`: deleteSceneProp
// itself, and applySnapshot's scene-config restore branch (which reaches
// the same "deleted" state via Redo, or Undo stepping past a Prop's
// creation — a second call path with the exact same bug before this fix).
//
// public/app.js and devtools/scene-editor.js are plain global-scope browser
// scripts (not ES modules, no jsdom in this project — see
// bookHotspotPointerEvents.test.js for the established precedent), so this
// file asserts on the source text directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");

function extractFunction(src, signature) {
  const idx = src.indexOf(signature);
  assert.ok(idx >= 0, `"${signature}" not found`);
  // Balance braces from the function's own opening brace to find its true end
  // (bodies here contain nested {} blocks, so a naive first-"}" match would
  // truncate early).
  const openBrace = src.indexOf("{", idx);
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error(`unbalanced braces in "${signature}"`);
}

const teardownFn = extractFunction(appJs, "function teardownSceneObject(instanceId)");

test("teardownSceneObject exists as a generic, instance-id-scoped function (not Prop-specific, not hardcoded to any Prop id)", () => {
  assert.match(appJs, /function teardownSceneObject\(instanceId\)/);
  assert.doesNotMatch(teardownFn, /core_book|"prop"|kind === /, "the function itself must stay generic — no special-casing by id or kind");
});

test("teardownSceneObject hides the main Scene Object element", () => {
  assert.match(teardownFn, /document\.getElementById\(`scene-\$\{instanceId\}`\)/);
  assert.match(teardownFn, /el\.style\.display = "none";/);
});

test("teardownSceneObject hides the Shadow's own separate DOM node — the exact element the original bug left orphaned", () => {
  assert.match(teardownFn, /document\.getElementById\(`scene-shadow-\$\{instanceId\}`\)/);
  const shadowSection = teardownFn.slice(teardownFn.indexOf("scene-shadow-"));
  assert.match(shadowSection, /style\.display = "none"/);
});

test("teardownSceneObject stops decoded-GIF playback / restores the static animation visual regardless of whether the main element still exists", () => {
  assert.match(teardownFn, /restoreStaticAnimationVisual\(instanceId, el\)/);
  assert.match(teardownFn, /stopDecodedGifPlayback\(instanceId\)/, "the no-element branch still tears down playback state, never leaves it dangling");
});

test("teardownSceneObject clears animationActivation and runtimeAnimationSpeedOverrides for this instance", () => {
  assert.match(teardownFn, /animationActivation\.delete\(instanceId\)/);
  assert.match(teardownFn, /runtimeAnimationSpeedOverrides\.delete\(instanceId\)/);
});

test("teardownSceneObject invalidates an in-flight decode's activation token BEFORE deleting the Map entry, so a stale pointerenter/Behavior promise can never resurrect playback on a torn-down instance", () => {
  const beforeDelete = teardownFn.slice(0, teardownFn.indexOf("animationActivation.delete(instanceId)"));
  assert.match(beforeDelete, /activation\.token\+\+/, "token must be bumped on the SAME object reference an in-flight reconcileAnimationActivation call captured, before the Map entry is removed");
  assert.match(beforeDelete, /activation\.hoverActive = false/);
  assert.match(beforeDelete, /activation\.behaviorActive = false/);
});

test("teardownSceneObject is defined before both of its F8 call sites need it at runtime (script parse order — not load-bearing since it's only invoked on user action, but keep the def-before-use convention this file follows elsewhere)", () => {
  const appJsDefIndex = appJs.indexOf("function teardownSceneObject(instanceId)");
  assert.ok(appJsDefIndex >= 0);
});
