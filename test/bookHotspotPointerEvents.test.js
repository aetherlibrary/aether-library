// Regression guard for the "Player Interaction hover fails when the book is
// placed on the table" bug. Root cause: #book-hotspot (a static, always-
// present click/keyboard-focus button, public/index.html) and core_book_01's
// own Scene Object <img> are DOM siblings sharing the SAME pinned z-index
// (DEPTH_Z_MAX + 1, public/app.js sceneDepthZ()) — a tie that DOM order
// always broke in the button's favor, silently eating that Prop's `:hover`
// any time the book sat at/near the button's fixed screen position. Table
// collision was never involved (verified live: the desk's own z-index is far
// below the book's; hovering the book anywhere on the desk's collision area
// EXCEPT the button's exact spot always worked).
//
// public/app.js and public/style.css are plain global-scope browser scripts
// (not ES modules, no jsdom/puppeteer in this project — see the other test
// files under test/, all pure-module unit tests), so this file asserts on
// the source text directly: the narrowest thing that still fails loudly if
// the fix is ever reverted or the CSS/JS wiring drifts apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const styleCss = fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8");
const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");

function extractRule(css, selector) {
  const idx = css.indexOf(selector);
  assert.ok(idx >= 0, `selector "${selector}" not found in style.css`);
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

test("#book-hotspot is pointer-events:none, so it can never win a hit-test tie against a Prop's own <img>", () => {
  const rule = extractRule(styleCss, ".book-hotspot {");
  assert.match(rule, /pointer-events:\s*none/);
});

test("app.js restores click-to-start via a delegated listener on .library-scene (not on the button itself)", () => {
  assert.match(
    appJs,
    /document\.querySelector\("\.library-scene"\)\.addEventListener\("click",/,
    "expected a delegated click listener on .library-scene"
  );
});

test("the delegated listener guards against double-firing from the button's own (keyboard) click", () => {
  assert.match(appJs, /if \(e\.target === els\.bookHotspot\) return;/);
});

test("the delegated listener is inert while the F8 Scene Editor is active, so authoring clicks never spuriously open the mode modal", () => {
  assert.match(appJs, /if \(window\.__sceneEditor\?\.state\?\.active\) return;/);
});

test("the button's own click listener still exists, for keyboard Tab+Enter/Space activation (unaffected by pointer-events)", () => {
  assert.match(appJs, /els\.bookHotspot\.addEventListener\("click", openModeModal\);/);
});

test("no core_book_01-specific branch was added to make this work — the fix lives entirely in #book-hotspot's own geometry/listener, not in any Prop/Player-Interaction code path", () => {
  const piSectionMatch = appJs.match(/function applyPlayerInteractionStyle[\s\S]{0,2000}/);
  assert.ok(piSectionMatch, "applyPlayerInteractionStyle not found");
  assert.doesNotMatch(piSectionMatch[0], /core_book/);
});
