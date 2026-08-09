// Behavioral coverage for the production split's drag geometry
// (src/services/appSplitLayout.js — the Node-testable home of the math
// public/app.js mirrors inline; see that module's header for why).
//
// These are real behavior tests: they call the actual functions with real
// geometry and assert on returned widths and directionality, rather than
// grepping source text. The one genuinely un-unit-testable piece — that
// #chat-panel's `max-width: 560px` cap must be LIFTED while resized, which
// is the exact regression that made dragging appear dead — is guarded by
// the CSS/wiring assertions at the bottom, since no DOM/CSS engine is
// available in this project's test environment.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  clampRightPanelWidth,
  rightPanelWidthForPointer,
  MIN_SCENE_WIDTH_PX,
} from "../src/services/appSplitLayout.js";

// The real measured desktop geometry, taken from the live app at a 1920px
// viewport (container 1884 after page padding + scrollbar; divider nets 10px;
// the untouched 3:1 CSS ratio yields ~486.89px).
const DESKTOP = {
  defaultWidthPx: 486.89,
  containerWidthPx: 1884,
  containerRightPx: 1894,
  dividerWidthPx: 16,
};

test("clamp: the default width is the minimum — the right panel can never be dragged narrower than the layout's own default", () => {
  for (const requestedPx of [486.89, 400, 300, 0, -500]) {
    assert.equal(
      clampRightPanelWidth({ ...DESKTOP, requestedPx }),
      DESKTOP.defaultWidthPx,
      `requesting ${requestedPx}px must clamp up to the default`
    );
  }
});

test("clamp: widths between the default and the scene floor pass through untouched — this is the range that was almost entirely missing before the fix", () => {
  for (const requestedPx of [500, 560, 561, 700, 900, 1100]) {
    assert.equal(clampRightPanelWidth({ ...DESKTOP, requestedPx }), requestedPx);
  }
});

test("clamp: 560px is NOT a ceiling — the old #chat-panel max-width capped rendering there and left only ~73px of travel, which is what made the separator look broken", () => {
  const justPast = clampRightPanelWidth({ ...DESKTOP, requestedPx: 600 });
  assert.equal(justPast, 600);
  assert.ok(justPast > 560, "the drag range must extend well beyond the old 560px cap");
});

test("clamp: the maximum leaves the scene its floor, so the left panel can never collapse to zero", () => {
  const max = clampRightPanelWidth({ ...DESKTOP, requestedPx: 99999 });
  const sceneRemaining = DESKTOP.containerWidthPx - DESKTOP.dividerWidthPx - max;
  assert.equal(sceneRemaining, MIN_SCENE_WIDTH_PX);
  assert.ok(max > DESKTOP.defaultWidthPx, "the ceiling must be well above the floor at desktop size");
});

test("clamp: a viewport too narrow for both constraints collapses the range instead of inverting it — dragging degrades to a no-op, never corrupts the layout", () => {
  const cramped = { defaultWidthPx: 480, containerWidthPx: 900, dividerWidthPx: 10, };
  // 900 - 10 - 640 = 250, which is BELOW the 480 default: the range would invert.
  for (const requestedPx of [0, 480, 700, 5000]) {
    assert.equal(clampRightPanelWidth({ ...cramped, requestedPx }), 480);
  }
});

test("pointer mapping: dragging LEFT widens the right panel and narrows the scene, continuously and ~1:1", () => {
  const at = (pointerX) => rightPanelWidthForPointer({ ...DESKTOP, pointerX });
  const start = DESKTOP.containerRightPx - DESKTOP.defaultWidthPx - DESKTOP.dividerWidthPx / 2;
  const base = at(start);
  for (const dx of [50, 100, 150, 200]) {
    const widened = at(start - dx);
    assert.ok(
      Math.abs(widened - (base + dx)) < 0.01,
      `dragging ${dx}px left must widen the right panel by ~${dx}px (got ${widened - base})`
    );
  }
});

test("pointer mapping: dragging RIGHT narrows the right panel until it stops at the default minimum", () => {
  const at = (pointerX) => rightPanelWidthForPointer({ ...DESKTOP, pointerX });
  const start = DESKTOP.containerRightPx - 800; // a wide, already-dragged split
  assert.ok(at(start) > DESKTOP.defaultWidthPx);
  // Sweep rightward; width must decrease monotonically then pin at the default.
  let previous = at(start);
  for (let dx = 20; dx <= 600; dx += 20) {
    const current = at(start + dx);
    assert.ok(current <= previous + 0.01, "width must never grow while dragging right");
    previous = current;
  }
  assert.equal(previous, DESKTOP.defaultWidthPx, "far-right drag pins exactly at the default minimum");
});

test("pointer mapping: the separator tracks the cursor with the divider centered under it (no trailing offset)", () => {
  const pointerX = 1200;
  const width = rightPanelWidthForPointer({ ...DESKTOP, pointerX });
  // Right panel's left edge = containerRight - width; the divider's centre
  // should land on the pointer, i.e. half a divider to the left of that edge.
  const panelLeftEdge = DESKTOP.containerRightPx - width;
  const dividerCentre = panelLeftEdge - DESKTOP.dividerWidthPx / 2;
  assert.ok(Math.abs(dividerCentre - pointerX) < 0.01, `divider centre ${dividerCentre} should sit on the pointer ${pointerX}`);
});

test("pointer mapping: absolute (not delta) — overshooting a clamp and returning re-syncs exactly to the cursor, with no accumulated drift", () => {
  const at = (pointerX) => rightPanelWidthForPointer({ ...DESKTOP, pointerX });
  const target = 1300;
  const direct = at(target);
  // Simulate a drag that slams far past the minimum first, then comes back.
  at(DESKTOP.containerRightPx + 4000);
  at(-4000);
  const afterOvershoot = at(target);
  assert.equal(afterOvershoot, direct, "the same pointer position must always yield the same width");
});

// ---- wiring guards for the parts with no DOM available in this project ----

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
const styleCss = fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8");

test("the resized-mode CSS rule lifts #chat-panel's max-width cap — without this the JS clamp is overruled and dragging visibly dies at 560px", () => {
  const idx = styleCss.indexOf("body.app-split-resized #chat-panel");
  assert.ok(idx >= 0, "the resized-mode rule must exist");
  const rule = styleCss.slice(styleCss.indexOf("{", idx), styleCss.indexOf("}", idx));
  assert.match(rule, /max-width:\s*none/, "the 560px ceiling must be lifted while resized");
  assert.match(rule, /min-width:\s*0/, "the 340px floor must defer to the JS clamp too");
  assert.match(rule, /flex:\s*0 0 var\(--app-split-right-width\)/, "width must come from the single split variable");
});

test("the default (never-dragged) layout keeps its original CSS ratio untouched, so a fresh load and a refresh both render the original split", () => {
  assert.match(styleCss, /#chat-panel \{ flex: 1 1 0; min-width: 340px; max-width: 560px;/, "the base rule must be unchanged");
  const applyFn = appJs.slice(appJs.indexOf("function applyAppSplitWidth()"));
  assert.match(applyFn, /chatPanelWidthPx != null/, "resized mode is entered only once a real drag has set a width");
  assert.match(applyFn, /removeProperty\("--app-split-right-width"\)/, "no drag yet -> the variable is cleared, not left stale");
});

test("the split is driven by exactly ONE value — applyAppSplitWidth writes only the custom property, never separate left/right/separator widths", () => {
  const applyFn = appJs.slice(
    appJs.indexOf("function applyAppSplitWidth()"),
    appJs.indexOf("function buildAppSplitCursor()")
  );
  assert.match(applyFn, /setProperty\("--app-split-right-width"/);
  assert.doesNotMatch(applyFn, /libraryPanel\.style/, "the left panel is derived by flex, never written directly");
  assert.doesNotMatch(applyFn, /appSplitDivider\.style\.(left|width)/, "the separator position is derived by normal flow, never written directly");
});

test("session-only: the split is never written to localStorage/settings/scene config anywhere in the split code", () => {
  const section = appJs.slice(
    appJs.indexOf("// -------------------------------------------------------- app split divider"),
    appJs.indexOf("// ------------------------------------------------------- session lock")
  );
  assert.ok(section.length > 500, "the app-split section must be locatable");
  // Strip full-line comments first: this section's own prose legitimately
  // NAMES localStorage/settings/scene config while explaining that it
  // deliberately writes to none of them, so a raw match would false-positive
  // on the very comment documenting the guarantee.
  const code = section
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(code, /localStorage|sessionStorage|fetch\(|saveSettings|scene-config/);
});
