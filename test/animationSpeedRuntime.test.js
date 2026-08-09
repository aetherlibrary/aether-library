// public/app.js is a plain global-scope browser script (not an ES module,
// no jsdom in this project — see bookHotspotPointerEvents.test.js for the
// established precedent), so its Player Interaction Animation runtime
// wiring is verified via live browser E2E, not Node import. This file
// guards the pieces that ARE safely checkable from source text: that the
// decoded-GIF playback engine and its fallback both exist, that the
// runtime speed-override seam exists and stays structurally separate from
// the saved-data functions, and that no Council-specific concept is baked
// into the generic engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");

// Strips full-line `//` comments so the checks below assert on actual CODE,
// not on this file's own explanatory prose (which legitimately mentions
// Council as a motivating example) — a naive substring/regex match would
// otherwise false-positive on the comment text itself.
function stripLineComments(src) {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("a runtime-only Animation speed override seam exists, for a future state-driven feature to call", () => {
  assert.match(appJs, /function setSceneObjectAnimationSpeedOverride\(/);
  assert.match(appJs, /function effectiveAnimationSpeed\(/);
});

test("no Council-specific concept is baked into the Player Interaction / Animation runtime CODE (comments may mention it as a motivating example)", () => {
  const piSection = appJs.match(/\/\/ ---{2,}-* player interaction[\s\S]*?function createSceneObjectElement/)[0];
  assert.doesNotMatch(stripLineComments(piSection), /[Cc]ouncil/, "the Player Interaction schema/runtime stays generic — Council-state wiring is explicitly deferred");
});

test("GIF ImageDecoder support is feature-detected, not assumed — a hard dependency would break Animation entirely on unsupported browsers", () => {
  assert.match(appJs, /function isGifImageDecoderSupported\(\)/);
  assert.match(appJs, /typeof ImageDecoder === "undefined"/);
  assert.match(appJs, /ImageDecoder\.isTypeSupported\("image\/gif"\)/);
});

test("decoded frames and their real per-frame delays are cached by source, decoded at most once", () => {
  assert.match(appJs, /const gifDecodeCache = new Map\(\);/);
  assert.match(appJs, /function getDecodedGifFrames\(source\)/);
  assert.match(appJs, /new ImageDecoder\(\{ data, type: "image\/gif" \}\)/);
});

test("reconcileAnimationActivation falls back to the native <img src> swap when decoding is unsupported or fails — Animation is never broken entirely", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  assert.match(fn, /const decoded = await getDecodedGifFrames\(anim\.source\);/);
  assert.match(fn, /if \(decoded\) \{/);
  assert.match(fn, /img\.dataset\.piRestSrc = img\.src;/, "the fallback path (decoded is null/falsy) still does the original native src swap");
});

test("restoreStaticAnimationVisual always stops decoded playback AND restores the native src if it was swapped, regardless of which path was active", () => {
  const fn = appJs.match(/function restoreStaticAnimationVisual\([\s\S]*?\n\}/)[0];
  assert.match(fn, /stopDecodedGifPlayback\(instanceId\);/);
  assert.match(fn, /img\.src = img\.dataset\.piRestSrc;/);
});

test("the pointerenter/pointerleave listeners only toggle hoverActive and hand off to reconcileAnimationActivation — they no longer own opacity/playback directly", () => {
  const pointerenter = appJs.match(/img\.addEventListener\("pointerenter", \(\) => \{[\s\S]*?\n  \}\);/)[0];
  const pointerleave = appJs.match(/img\.addEventListener\("pointerleave", \(\) => \{[\s\S]*?\n  \}\);/)[0];
  assert.match(pointerenter, /getActivationState\(def\.id\)\.hoverActive = true;/);
  assert.match(pointerenter, /reconcileAnimationActivation\(def, img\);/);
  assert.match(pointerleave, /getActivationState\(def\.id\)\.hoverActive = false;/);
  assert.match(pointerleave, /reconcileAnimationActivation\(def, img\);/);
  assert.doesNotMatch(pointerenter, /startDecodedGifPlayback|img\.style\.opacity/, "playback/visibility ownership moved into reconcileAnimationActivation");
  assert.doesNotMatch(pointerleave, /stopDecodedGifPlayback|img\.style\.opacity/, "playback/visibility ownership moved into restoreStaticAnimationVisual");
});

test("effectiveFrameDelayMs computes originalDelay / speed via the shared formula, not a hardcoded/faked value", () => {
  assert.match(appJs, /function effectiveFrameDelayMs\(originalDelayMs, speed\)/);
  assert.match(appJs, /return Math\.max\(MIN_FRAME_DELAY_MS, base \/ mult\);/);
});

test("playback speed is re-read fresh on every scheduled frame (not captured once at start), so a runtime override can change the rate mid-animation without resetting the frame index", () => {
  const fn = stripLineComments(appJs.match(/function startDecodedGifPlayback\([\s\S]*?\n\}/)[0]);
  // frameIndex is declared once, and the ONLY place it changes is the
  // modulo-advance inside the scheduled tick — never reset to 0 by a speed
  // change (there is no such reset anywhere in this function).
  assert.match(fn, /let frameIndex = 0;/);
  assert.match(fn, /frameIndex = \(frameIndex \+ 1\) % decoded\.frames\.length;/);
  assert.equal((fn.match(/frameIndex = 0/g) || []).length, 1, "frameIndex is only ever initialized once, never reset back to 0 inside the loop");
  // The speed lookup happens INSIDE scheduleNext (called again on every
  // tick), not hoisted into a variable captured once outside it.
  const scheduleNextBody = fn.slice(fn.indexOf("function scheduleNext"));
  assert.match(scheduleNextBody, /effectiveAnimationSpeed\(def\.id, authoredSpeed\)/);
});

test("no sprite-sheet authoring runtime remains (mode/frameWidth/frameHeight/frameCount/fps/loop authoring was removed)", () => {
  assert.doesNotMatch(appJs, /spriteSheet/i);
  assert.doesNotMatch(appJs, /activateSpriteSheetAnimation|deactivateSpriteSheetAnimation|ensureSpriteSheetLayer/);
});

// --- Regression coverage for TWO related "canvas doesn't visually replace
// the static book" bugs, both caused by the same underlying mistake (cloning
// the img's CURRENT, already-temporarily-modified inline style onto the
// canvas):
//   Bug 1 — img.style.visibility = "hidden" was set BEFORE
//     startDecodedGifPlayback copied img.style.cssText onto the canvas, so
//     the canvas inherited visibility:hidden too; visibility:hidden (unlike
//     opacity) also removes an element from hit-testing, so elementFromPoint
//     fell through to whatever was behind the Prop and the img could no
//     longer own :hover. Fixed by hiding the img via opacity instead.
//   Bug 2 — switching to opacity did not fix the clone itself: the SAME
//     `canvas.style.cssText = img.style.cssText` line copied the img's
//     freshly-set opacity:0 straight onto the canvas too, so the "visible"
//     layer was itself fully transparent (live-verified: canvas.style.
//     opacity and getComputedStyle(canvas).opacity were both "0" during a
//     real hover — only the book's shadow, never touched by any of this,
//     remained on screen). Fixed by replacing the blind clone with a
//     property-by-property copy that explicitly excludes opacity/
//     visibility/display/pointer-events (RUNTIME_VISIBILITY_STYLE_PROPS).

test("the img is hidden via opacity, never visibility, while decoded playback is active — visibility:hidden would drop it out of hit-testing and break :hover ownership", () => {
  const reconcile = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  const restore = appJs.match(/function restoreStaticAnimationVisual\([\s\S]*?\n\}/)[0];
  assert.match(reconcile, /img\.style\.opacity = "0";/, "the decoded-playback branch hides the img via opacity");
  assert.match(restore, /img\.style\.opacity = "";/, "restoring the static visual resets opacity");
  assert.doesNotMatch(stripLineComments(reconcile), /img\.style\.visibility/, "visibility is never used to hide the img on the decoded-playback path (comments may still explain why, in prose)");
  assert.doesNotMatch(stripLineComments(restore), /img\.style\.visibility/);
});

// A SECOND, distinct bug survived the first fix above: switching the img's
// hide mechanism from visibility to opacity did not, by itself, stop
// `canvas.style.cssText = img.style.cssText` from cloning WHATEVER runtime
// state the img currently carries — opacity:0 included — straight onto the
// canvas. Live-verified: canvas.style.opacity and getComputedStyle(canvas)
// .opacity were BOTH "0" during real hover, so the "visible" replacement
// layer was itself fully transparent (the shadow, never touched by any of
// this, was the only thing left on screen). The real fix replaces the blind
// clone with a property-by-property copy that explicitly skips the
// temporary-runtime-visibility set.

test("the canvas position/presentation copy is NOT a blind cssText clone — it explicitly skips opacity/visibility/display/pointer-events so the img's temporary hide-state can never leak onto the canvas", () => {
  const fn = stripLineComments(appJs.match(/function startDecodedGifPlayback\([\s\S]*?\n\}/)[0]);
  assert.doesNotMatch(fn, /canvas\.style\.cssText\s*=\s*img\.style\.cssText/, "a whole-cssText clone (in actual code, not explanatory comments) is exactly the bug that shipped twice (once via visibility, once via opacity) — it must not come back");
  assert.match(fn, /for \(const prop of img\.style\)/, "presentation properties are copied by iterating img.style, not by a blind cssText assignment");
  assert.match(fn, /RUNTIME_VISIBILITY_STYLE_PROPS\.has\(prop\)/, "each copied property is checked against the exclusion set");
});

test("the runtime-visibility exclusion set covers exactly opacity, visibility, display, and pointer-events", () => {
  const decl = appJs.match(/const RUNTIME_VISIBILITY_STYLE_PROPS = new Set\(\[[^\]]*\]\);/)[0];
  for (const prop of ["opacity", "visibility", "display", "pointer-events"]) {
    assert.match(decl, new RegExp(`"${prop}"`), `${prop} must be excluded from the img->canvas presentation copy`);
  }
});

test("the animation canvas is pointer-events:none and cannot become the pointer target itself — it is a rendering surface, never the hover owner", () => {
  const styleCss = fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8");
  const rule = styleCss.slice(styleCss.indexOf(".pi-gif-canvas-layer {"), styleCss.indexOf(".pi-gif-canvas-layer {") + 200);
  assert.match(rule, /pointer-events:\s*none/);
});

test("Float/Scale/Glow classes authored on the img are mirrored onto the canvas for the duration of active playback, so the VISIBLE layer carries those effects too", () => {
  const fn = appJs.match(/function startDecodedGifPlayback\([\s\S]*?\n\}/)[0];
  assert.match(fn, /Array\.from\(img\.classList\)\.filter\(\(c\) => c\.startsWith\("pi-fx-"\)\)/);
  assert.match(fn, /canvas\.className = \["pi-gif-canvas-layer", \.\.\.fx\]\.join\(" "\);/);
  const styleCss = fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8");
  assert.match(styleCss, /\.pi-gif-canvas-layer\.pi-fx-float\s*\{/, "a CSS rule applies Float's animation when the class is mirrored onto the canvas");
  assert.match(styleCss, /\.pi-gif-canvas-layer\.pi-fx-scale\s*\{/);
  assert.match(styleCss, /\.pi-gif-canvas-layer\.pi-fx-glow\s*\{/);
});

test("stopping playback resets the canvas's className back to its base class, so no stale Float/Glow class or mid-cycle animation survives into the next activation", () => {
  const fn = appJs.match(/function stopDecodedGifPlayback\([\s\S]*?\n\}/)[0];
  assert.match(fn, /canvas\.className = "pi-gif-canvas-layer";/);
});

test("the animation canvas is never duplicated — creation is guarded by an existing-element check, same pattern as the shadow layer", () => {
  const fn = appJs.match(/function ensureAnimationCanvasLayer\([\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(document\.getElementById\(`scene-anim-canvas-\$\{def\.id\}`\)\) return;/);
});

test("startDecodedGifPlayback always stops any prior playback for the same instance before starting a new one — rapid re-hover cannot accumulate parallel timer loops", () => {
  const fn = appJs.match(/function startDecodedGifPlayback\([\s\S]*?\n\}/)[0];
  const firstLine = fn.split("\n")[1].trim();
  assert.equal(firstLine, "stopDecodedGifPlayback(def.id);", "the very first statement in the function tears down any existing playback for this instance");
});

// --- Animation Behavior (assets/behaviors/*.json) — see
// src/services/animationBehavior.js for the pure validation module this
// file mirrors inline (this file can't import an ES module). These tests
// verify the RUNTIME wiring at the source level: absolute speed precedence,
// Hover/Behavior activation ownership, continuity across transitions, and
// that the dispatch engine stays fully generic.

test("setSceneObjectAnimationSpeedOverride/effectiveAnimationSpeed use ABSOLUTE override semantics, never multiplicative — an explicit Behavior speed must replace authored speed outright, not scale it", () => {
  const fn = appJs.match(/function effectiveAnimationSpeed\([\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn, /base \* override|override \* base/, "no multiplication of authored speed by the override anywhere");
  assert.match(fn, /return typeof override === "number" \? override : base;/, "an active override REPLACES authoredSpeed outright; no override falls back to authoredSpeed (system default 1.0 if even that is missing)");
});

test("reconcileAnimationActivation sets the speed override from behaviorSpeed only while Behavior is active, and clears it otherwise — missing Behavior speed falls back to authored speed via effectiveAnimationSpeed's own default", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  assert.match(fn, /setSceneObjectAnimationSpeedOverride\(def\.id, state\.behaviorActive \? state\.behaviorSpeed : undefined\);/, "behaviorSpeed is undefined whenever the matched rule carried no `speed` of its own — effectiveAnimationSpeed then falls back to authored speed, satisfying 'missing Behavior speed falls back to authored'");
});

test("applyBehaviorEventToProp: play:true (or omitted) activates Behavior ownership, explicit play:false deactivates it — never gated on Hover state", () => {
  const fn = stripLineComments(appJs.match(/async function applyBehaviorEventToProp\([\s\S]*?\n\}/)[0]);
  assert.match(fn, /state\.behaviorActive = !!rule && rule\.play !== false;/);
  assert.doesNotMatch(fn, /state\.hoverActive/, "Behavior activation is computed independently of Hover's own flag (in actual code, not explanatory comments)");
});

test("Hover and Behavior are independent activation sources — reconcileAnimationActivation's shouldBeActive is their OR, never a single flag or an AND", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  assert.match(fn, /state\.hoverActive \|\| state\.behaviorActive/, "playback should remain active if EITHER source wants it");
  assert.doesNotMatch(fn, /state\.hoverActive && state\.behaviorActive/, "never requires both sources simultaneously");
});

test("reconcileAnimationActivation never restarts an already-running playback on a pure ownership/speed change — continuity across a Hover<->Behavior handoff, no frame-0 reset", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  // The ONLY branch that calls startDecodedGifPlayback is gated behind an
  // early `if (wasActive) return;` — i.e. starting only ever happens on a
  // genuine inactive->active transition, never while continuing.
  assert.match(fn, /if \(wasActive\) return;/);
  const afterContinuityGuard = fn.slice(fn.indexOf("if (wasActive) return;"));
  assert.match(afterContinuityGuard, /startDecodedGifPlayback\(/, "the start call lives strictly after the continuity guard");
  const beforeContinuityGuard = fn.slice(0, fn.indexOf("if (wasActive) return;"));
  assert.doesNotMatch(beforeContinuityGuard, /startDecodedGifPlayback\(/, "no path starts playback before the continuity check runs");
});

test("Behavior ownership releasing while Hover remains active does not stop playback — restoreStaticAnimationVisual is only reached when BOTH sources are inactive", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  const guard = fn.match(/if \(!shouldBeActive\) \{\s*\n\s*if \(wasActive\) restoreStaticAnimationVisual\(def\.id, img\);\s*\n\s*return;\s*\n\s*\}/);
  assert.ok(guard, "restoreStaticAnimationVisual is only called inside the !shouldBeActive branch — i.e. only when hoverActive AND behaviorActive are both false");
});

test("a Behavior async decode/apply race is guarded by a per-instance token, exactly like the old hoverToken pattern — a superseded activation change cannot start stale playback", () => {
  const fn = appJs.match(/async function reconcileAnimationActivation\([\s\S]*?\n\}/)[0];
  assert.match(fn, /const token = \+\+state\.token;/);
  assert.match(fn, /if \(token !== state\.token\) return;/);
});

test("Animation Behavior loading is cached by source path and never throws — a fetch/parse/validation failure resolves to null, degrading to normal authored Animation behavior", () => {
  assert.match(appJs, /const animationBehaviorCache = new Map\(\);/);
  assert.match(appJs, /function getAnimationBehavior\(source\)/);
  const loader = appJs.match(/function getAnimationBehavior\([\s\S]*?\n\}/)[0];
  assert.match(loader, /\.catch\(\(\) => null\)/, "any rejection from the fetch/parse/validate chain resolves to null, never propagates");
});

test("Behavior JSON is fetched and JSON-parsed, then run through sanitizeAnimationBehavior — a JSON syntax error or a validation failure both surface as null via the caller's .catch", () => {
  const fn = appJs.match(/async function loadAnimationBehaviorUncached\([\s\S]*?\n\}/)[0];
  assert.match(fn, /await res\.json\(\)/);
  assert.match(fn, /return sanitizeAnimationBehavior\(raw\);/);
  assert.match(fn, /if \(!res\.ok\) return null;/, "a missing/404 Behavior file degrades to null, not a thrown error");
});

test("the mirrored sanitizeAnimationBehavior in app.js matches the pure module's validation rules exactly (version===1, rules array, per-rule when/play/speed, 0.1-10 speed range)", () => {
  const fn = appJs.match(/function sanitizeAnimationBehavior\([\s\S]*?\n\}/)[0];
  assert.match(fn, /raw\.version !== 1/);
  assert.match(fn, /!Array\.isArray\(raw\.rules\)/);
  assert.match(appJs, /const BEHAVIOR_SPEED_MIN = 0\.1;/);
  assert.match(appJs, /const BEHAVIOR_SPEED_MAX = 10;/);
  const pureModule = fs.readFileSync(path.join(process.cwd(), "src", "services", "animationBehavior.js"), "utf8");
  assert.match(pureModule, /const BEHAVIOR_SPEED_MIN = 0\.1;/, "the two copies must stay numerically in sync");
  assert.match(pureModule, /const BEHAVIOR_SPEED_MAX = 10;/);
});

test("a malformed/missing Behavior can never break normal Hover — applyBehaviorEventToProp only ever writes to behaviorActive/behaviorSpeed, and a null behavior/rule cleanly deactivates Behavior ownership rather than throwing", () => {
  const fn = appJs.match(/async function applyBehaviorEventToProp\([\s\S]*?\n\}/)[0];
  assert.match(fn, /const rule = behavior \? findMatchingBehaviorRule\(behavior, eventName\) : null;/, "a null/invalid Behavior short-circuits to a null rule instead of calling into findMatchingBehaviorRule");
  assert.match(fn, /state\.behaviorActive = !!rule/, "no rule (including from a broken Behavior file) always resolves to behaviorActive=false, a safe no-op — Hover's own flag is untouched by this function");
});

test("dispatchSceneBehaviorEvent is THE generic runtime event API — it takes an arbitrary string and contains no hardcoded Council/session-state branching", () => {
  assert.match(appJs, /function dispatchSceneBehaviorEvent\(eventName\)/);
  const fn = stripLineComments(appJs.match(/function dispatchSceneBehaviorEvent\([\s\S]*?\n\}/)[0]);
  assert.doesNotMatch(fn, /[Cc]ouncil|scholar_|vault_gathering|grand_sage|post_answering|pre_thinking/, "the dispatcher never compares eventName against a specific state name — matching is fully delegated to each Prop's own Behavior file");
});

test("triggerRoleSpeech — the existing centralized speech/session state transition point — is the ONE wiring call site into dispatchSceneBehaviorEvent, looping over array-merged states individually rather than the flattened stateLabel", () => {
  const fn = appJs.match(/async function triggerRoleSpeech\([\s\S]*?\n\}/)[0];
  assert.match(fn, /for \(const s of Array\.isArray\(state\) \? state : \[state\]\) dispatchSceneBehaviorEvent\(s\);/);
  // Must dispatch each individual state string, never the "a|b" joined label
  // a single-string `rule.when` could never match.
  assert.doesNotMatch(fn, /dispatchSceneBehaviorEvent\(stateLabel\)/);
});

test("the two ambient idle-only dispatch paths (triggerPreIdleDialogue, showHoverThought) are NOT wired to dispatchSceneBehaviorEvent — pre_thinking intentionally has no active Behavior wiring for MVP", () => {
  const preIdleFn = appJs.match(/function triggerPreIdleDialogue\([\s\S]*?\n\}/);
  const hoverThoughtFn = appJs.match(/function showHoverThought\([\s\S]*?\n\}/);
  if (preIdleFn) assert.doesNotMatch(preIdleFn[0], /dispatchSceneBehaviorEvent/);
  if (hoverThoughtFn) assert.doesNotMatch(hoverThoughtFn[0], /dispatchSceneBehaviorEvent/);
});
