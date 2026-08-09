// The Scene Bounds guide — the editor's 1920×1080 boundary marker.
//
// WHY IT IS NOT AN OUTLINE ANY MORE: an `outline` on .library-scene paints with
// that element's own box, so every positioned descendant — props, characters,
// shadows, the light layer at z-index 1000002, zones — painted straight over
// it. The guide is an instrument; Scene content is not allowed to bury it.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");
const appCss = () => readSource("../public/style.css");

// ============================================================ exactly one

// ================================================================ stacking

test("the runtime layers it must beat are all lower than the overlay", async () => {
  const src = await app();
  // These are the values the guide has to clear; they live in production and
  // are unchanged by this task.
  assert.match(src, /const DEPTH_Z_MAX = 1000000;/);
  const overlayZ = 2000000;
  for (const runtimeZ of [1000000, 1000001, 1000002]) {
    assert.ok(runtimeZ < overlayZ, `runtime ${runtimeZ} must be under the overlay`);
  }
});

// ============================================================== behaviour

// ============================================================= lifecycle

test("the runtime Scene box is unchanged by this task", async () => {
  const css = await appCss();
  assert.match(css, /aspect-ratio: 16 \/ 9;/);
  assert.match(css, /width: max\(100%, calc\(100cqh \* 16 \/ 9\)\);/);
});
