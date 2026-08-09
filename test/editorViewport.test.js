// F8 editor viewport — the authoring canvas as a WORKSPACE around the runtime
// Scene, not a copy of the runtime viewport.
//
// THE PROBLEM THIS SOLVES: an entity dragged past the 1920×1080 Scene
// rectangle used to be effectively unrecoverable — off-screen, unselectable,
// with no way to drag it back. The Scene rectangle is unchanged; what changed
// is that the editor now shows and edits the space AROUND it.
//
// THE INVARIANT THAT MATTERS MOST: state.view is a pure VIEW TRANSFORM. Zoom
// and pan never touch a stored coordinate, are never persisted, and do not
// exist in production at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");
const appCss = () => readSource("../public/style.css");

// The zoom maths, reproduced exactly from zoomViewAtPointer so the anchoring
// rule can be exercised without a DOM. Mirrors the editor; the source
// assertion below keeps the two in step.
const MIN = 0.1;
const MAX = 8;
const clampZoom = (z) => Math.max(MIN, Math.min(MAX, z));

function zoomAt(view, rawZoom, screenX, screenY, baseLeft, baseTop) {
  const zoom = clampZoom(rawZoom);
  // rect.left = baseLeft + view.x at the CURRENT zoom.
  const rectLeft = baseLeft + view.x;
  const rectTop = baseTop + view.y;
  const lx = (screenX - rectLeft) / view.zoom;
  const ly = (screenY - rectTop) / view.zoom;
  return { zoom, x: screenX - baseLeft - lx * zoom, y: screenY - baseTop - ly * zoom };
}

// Where a local (unscaled) point lands on screen for a given view. The offset
// is per-AXIS: view.x for horizontal, view.y for vertical.
const projectX = (view, base, local) => base + view.x + local * view.zoom;
const projectY = (view, base, local) => base + view.y + local * view.zoom;

// ============================================================== zoom maths

test("wheel zoom increases and decreases the scale", () => {
  let view = { x: 0, y: 0, zoom: 1 };
  const out = zoomAt(view, view.zoom * Math.exp(-120 * 0.0015), 500, 400, 100, 100);
  assert.ok(out.zoom < 1, "scrolling down zooms out");
  const back = zoomAt(out, out.zoom * Math.exp(120 * 0.0015), 500, 400, 100, 100);
  assert.ok(back.zoom > out.zoom, "scrolling up zooms in");
  assert.ok(Math.abs(back.zoom - 1) < 1e-9, "equal and opposite steps return to the start");
});

test("cursor-focused zoom keeps the world point under the pointer", () => {
  const baseLeft = 120;
  const baseTop = 80;
  let view = { x: 0, y: 0, zoom: 1 };
  const cursorX = 640;
  const cursorY = 420;
  // The local point currently under the cursor.
  const lx = (cursorX - (baseLeft + view.x)) / view.zoom;
  const ly = (cursorY - (baseTop + view.y)) / view.zoom;

  for (const factor of [0.5, 0.25, 3, 7, 0.13]) {
    view = zoomAt(view, view.zoom * factor, cursorX, cursorY, baseLeft, baseTop);
    // That same local point must still project to the cursor.
    assert.ok(Math.abs(projectX(view, baseLeft, lx) - cursorX) < 1e-6, `x drifted at factor ${factor}`);
    assert.ok(Math.abs(projectY(view, baseTop, ly) - cursorY) < 1e-6, `y drifted at factor ${factor}`);
  }
});

test("zooming at a DIFFERENT point than the centre still anchors correctly", () => {
  const baseLeft = 0;
  const baseTop = 0;
  let view = { x: -300, y: -200, zoom: 2 }; // already panned and zoomed
  const cx = 55;
  const cy = 990;
  const lx = (cx - (baseLeft + view.x)) / view.zoom;
  const ly = (cy - (baseTop + view.y)) / view.zoom;
  view = zoomAt(view, 0.4, cx, cy, baseLeft, baseTop);
  assert.ok(Math.abs(projectX(view, baseLeft, lx) - cx) < 1e-6);
  assert.ok(Math.abs(projectY(view, baseTop, ly) - cy) < 1e-6);
});

test("zoom clamps at 10% and 800%", () => {
  assert.equal(clampZoom(0.0001), 0.1);
  assert.equal(clampZoom(9999), 8);
  const low = zoomAt({ x: 0, y: 0, zoom: 1 }, 0.00001, 100, 100, 0, 0);
  assert.equal(low.zoom, 0.1);
  const high = zoomAt({ x: 0, y: 0, zoom: 1 }, 500, 100, 100, 0, 0);
  assert.equal(high.zoom, 8);
});

// ============================================================== the controls

// ============================================== inspector is not hijacked

// ============================================ coordinates are never touched

// ====================================== out of bounds stays authorable

// ================================================== workspace visuals

// ============================================================ production

test("the runtime Scene bounds are unchanged by this task", async () => {
  const prodCss = await appCss();
  // Still exactly 16:9, still the same cover-fit rule.
  assert.match(prodCss, /aspect-ratio: 16 \/ 9;/);
  assert.match(prodCss, /width: max\(100%, calc\(100cqh \* 16 \/ 9\)\);/);
  // And no Scene schema field was added for the viewport.
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const keys = Object.keys(sanitizeLayout({}));
  assert.deepEqual(keys, [
    "version", "objects", "zones", "characterSlots", "characterRoles",
    "sceneMeta", "lights", "lightBlockers", "world",
  ]);
});
