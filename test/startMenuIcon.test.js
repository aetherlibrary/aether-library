// Start Menu ICON — a decorative image layer that is INDEPENDENT of the title
// image.
//
// THE INVARIANT THESE TESTS EXIST FOR: the icon and the title image share an
// asset root, a sanitizer and an editor row builder, but nothing else. The
// title image replaces the built-in wordmark; the icon replaces nothing. So
// configuring or clearing either one must be invisible to the other, and a
// config written before the icon existed must keep working untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  sanitizeAppShell,
  defaultAppShell,
  runtimeAppShell,
  DEFAULT_ICON_POSITION,
  DEFAULT_ICON_SCALE,
  ICON_SCALE_LIMITS,
  DEFAULT_TITLE_POSITION,
  APP_ICON_ROOT,
  START_MENU_ROOT,
} from "../src/services/appShell.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const ART = "assets/background/start-menu/menu_bg3.png";
// Title art lives in the start-menu root; the ICON lives in its own root. The
// two are deliberately different directories — see the ownership test below.
const TITLE_ART = "assets/background/start-menu/Start_logo.png";
const ICON = "assets/app-icons/app_icon_master.png";

// ============================================================ schema/defaults

test("no icon ships by default, and the defaults are inert", () => {
  const d = defaultAppShell();
  assert.equal(d.startMenuIcon, "", "an existing project gains no decoration");
  assert.deepEqual(DEFAULT_ICON_POSITION, { x: 960, y: 160 });
  assert.equal(d.startMenuIconX, DEFAULT_ICON_POSITION.x);
  assert.equal(d.startMenuIconY, DEFAULT_ICON_POSITION.y);
  assert.equal(d.startMenuIconScale, DEFAULT_ICON_SCALE);
  assert.equal(DEFAULT_ICON_SCALE, 1);
});

test("a legacy config with no icon fields still loads unchanged", () => {
  const legacy = sanitizeAppShell({
    version: 1,
    startMenuBackground: ART,
    startMenuTitleImage: TITLE_ART,
    startMenuTitleX: 820,
    startMenuTitleY: 240,
  });
  // Everything the old config said survives verbatim.
  assert.equal(legacy.startMenuBackground, ART);
  assert.equal(legacy.startMenuTitleImage, TITLE_ART);
  assert.equal(legacy.startMenuTitleX, 820);
  assert.equal(legacy.startMenuTitleY, 240);
  // And the icon simply is not configured.
  assert.equal(legacy.startMenuIcon, "", "absent = no icon, not an error");
  assert.equal(legacy.startMenuIconX, DEFAULT_ICON_POSITION.x);
  assert.equal(legacy.startMenuIconY, DEFAULT_ICON_POSITION.y);
  assert.equal(legacy.startMenuIconScale, 1);
});

test("icon fields round-trip through the sanitizer and the runtime projection", () => {
  const clean = sanitizeAppShell({
    startMenuIcon: ICON,
    startMenuIconX: 300,
    startMenuIconY: 880,
    startMenuIconScale: 0.5,
  });
  assert.equal(clean.startMenuIcon, ICON);
  assert.equal(clean.startMenuIconX, 300);
  assert.equal(clean.startMenuIconY, 880);
  assert.equal(clean.startMenuIconScale, 0.5);
  // The client is told all four.
  const rt = runtimeAppShell(clean);
  assert.equal(rt.startMenuIcon, ICON);
  assert.equal(rt.startMenuIconX, 300);
  assert.equal(rt.startMenuIconY, 880);
  assert.equal(rt.startMenuIconScale, 0.5);
});

test("the icon path keeps full validation, now against its own root", () => {
  for (const bad of [
    "../../etc/passwd",
    "assets/app-icons/../../etc/passwd", // traversal at depth
    "/etc/passwd",
    "https://example.com/logo.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "C:/Users/example/logo.png",
    "\\\\server\\share\\logo.png",
    "assets/props/bookshelf.png", // right shape, wrong root
    "assets/background/start-menu/menu_bg3.png", // start-menu art is NOT an app icon
    "assets/app-icons/logo.exe",
    "assets/app-icons/logo.svg", // SVG stays unsupported in this pass
  ]) {
    assert.equal(sanitizeAppShell({ startMenuIcon: bad }).startMenuIcon, "", bad);
  }
  assert.equal(sanitizeAppShell({ startMenuIcon: ICON }).startMenuIcon, ICON);
  // Backslash-authored paths still normalise to POSIX inside the root.
  assert.equal(
    sanitizeAppShell({ startMenuIcon: "assets\\app-icons\\app_icon_master.png" }).startMenuIcon,
    ICON
  );
});

test("the three Start Menu image fields own three separate asset roots", () => {
  assert.equal(APP_ICON_ROOT, "assets/app-icons/");
  assert.equal(START_MENU_ROOT, "assets/background/start-menu/");

  // An app icon is not selectable as a background or a title image...
  const wrongWay = sanitizeAppShell({ startMenuBackground: ICON, startMenuTitleImage: ICON });
  assert.notEqual(wrongWay.startMenuBackground, ICON, "app-icon art is not a Start Menu background");
  assert.equal(wrongWay.startMenuTitleImage, "", "app-icon art is not a Title Image");

  // ...and start-menu art is not selectable as the icon.
  assert.equal(sanitizeAppShell({ startMenuIcon: TITLE_ART }).startMenuIcon, "");

  // The background and title image roots were NOT widened by this change.
  assert.equal(sanitizeAppShell({ startMenuBackground: ART }).startMenuBackground, ART);
  assert.equal(sanitizeAppShell({ startMenuTitleImage: TITLE_ART }).startMenuTitleImage, TITLE_ART);
});

// ================================================================ icon scale

test("scale accepts positive numbers and refuses everything else", () => {
  const scale = (v) => sanitizeAppShell({ startMenuIconScale: v }).startMenuIconScale;
  assert.equal(scale(0.5), 0.5);
  assert.equal(scale(2), 2);
  assert.equal(scale("1.5"), 1.5, "numeric strings are accepted");
  // Non-positive and malformed values fall back rather than rendering nothing.
  for (const bad of [0, -1, -0.5, "", "  ", null, undefined, {}, [], NaN, Infinity, "abc"]) {
    assert.equal(scale(bad), DEFAULT_ICON_SCALE, JSON.stringify(bad));
  }
  // Bounded so a typo cannot render something unrecoverable.
  assert.equal(scale(9999), ICON_SCALE_LIMITS.max);
  assert.equal(scale(0.0001), ICON_SCALE_LIMITS.min);
});

// =============================================== independence from the title

test("clearing the icon leaves every title field untouched", () => {
  const configured = sanitizeAppShell({
    startMenuBackground: ART,
    startMenuTitleImage: TITLE_ART,
    startMenuTitleX: 700,
    startMenuTitleY: 250,
    startMenuIcon: ICON,
    startMenuIconX: 400,
    startMenuIconY: 900,
    startMenuIconScale: 1.5,
  });
  // Exactly what the editor's Clear button does: write "" to that ONE field.
  const cleared = sanitizeAppShell({ ...configured, startMenuIcon: "" });
  assert.equal(cleared.startMenuIcon, "");
  assert.equal(cleared.startMenuTitleImage, TITLE_ART, "title image survives");
  assert.equal(cleared.startMenuTitleX, 700);
  assert.equal(cleared.startMenuTitleY, 250);
  assert.equal(cleared.startMenuBackground, ART);
  // The icon's own position/scale are retained — only the reference is removed.
  assert.equal(cleared.startMenuIconX, 400);
  assert.equal(cleared.startMenuIconScale, 1.5);
});

test("clearing the title image leaves every icon field untouched", () => {
  const configured = sanitizeAppShell({
    startMenuBackground: ART,
    startMenuTitleImage: TITLE_ART,
    startMenuIcon: ICON,
    startMenuIconX: 400,
    startMenuIconY: 900,
    startMenuIconScale: 1.5,
  });
  const cleared = sanitizeAppShell({ ...configured, startMenuTitleImage: "" });
  assert.equal(cleared.startMenuTitleImage, "");
  assert.equal(cleared.startMenuIcon, ICON, "the icon survives");
  assert.equal(cleared.startMenuIconX, 400);
  assert.equal(cleared.startMenuIconY, 900);
  assert.equal(cleared.startMenuIconScale, 1.5);
  // Title position defaults return, which is the pre-existing title behaviour.
  assert.equal(cleared.startMenuTitleX, DEFAULT_TITLE_POSITION.x);
});

// ==================================================================== runtime

test("the icon renders through its own element and never touches the wordmark", async () => {
  const app = await readSource("../public/app.js");
  const fn = app.slice(app.indexOf("function applyStartMenuIcon(shell)"), app.indexOf("async function loadStartMenuBackground()"));
  assert.ok(fn.length > 0, "applyStartMenuIcon exists");
  assert.match(fn, /getElementById\("start-icon-image"\)/);
  // THE independence guarantee: the icon applier must not reach the title
  // wordmark or the title image at all.
  assert.doesNotMatch(fn, /start-title/, "must not touch the title layer");
  assert.doesNotMatch(fn, /wordmark/i);
  // Unconfigured = hidden AND src removed, so no broken-image request.
  assert.match(fn, /el\.hidden = true;/);
  assert.match(fn, /el\.removeAttribute\("src"\);/);
  // Positive-scale guard mirrors the server sanitizer.
  assert.match(fn, /rawScale > 0 \? rawScale : 1/);

  // Conversely, the title applier knows nothing about the icon.
  const titleFn = app.slice(app.indexOf("function applyStartMenuTitle(shell)"), app.indexOf("function applyStartMenuIcon(shell)"));
  assert.ok(titleFn.length > 0);
  assert.doesNotMatch(titleFn, /start-icon|startMenuIcon/, "the title applier must not read icon state");
  // ...and still performs the wordmark swap it always did.
  assert.match(titleFn, /wordmark\.hidden = Boolean\(path\)/);
});

test("the icon is a separate element, layered under the title, and untinted", async () => {
  const html = await readSource("../public/index.html");
  const iconAt = html.indexOf('id="start-icon-image"');
  const titleAt = html.indexOf('id="start-title-image"');
  assert.ok(iconAt > 0 && titleAt > 0, "both elements exist");
  assert.ok(iconAt < titleAt, "the icon composites beneath the title image");
  assert.match(html, /<img id="start-icon-image"[^>]*hidden/, "ships hidden");

  const css = await readSource("../public/style.css");
  const block = css.slice(css.indexOf("#start-icon-image {"), css.indexOf("#start-icon-image[hidden]"));
  assert.match(block, /transform: translate\(-50%, -50%\) scale\(var\(--start-icon-scale, 1\)\);/);
  assert.match(block, /height: auto;/, "source aspect ratio is preserved");
  // No tint, no wash, no shadow of our own.
  assert.doesNotMatch(block, /filter:|box-shadow:|background-color:/);
});

test("the runtime loader applies both layers, independently", async () => {
  const app = await readSource("../public/app.js");
  const loader = app.slice(app.indexOf("async function loadStartMenuBackground()"), app.indexOf("window.__refreshStartMenuBackground"));
  assert.match(loader, /applyStartMenuTitle\(shell\);/);
  assert.match(loader, /applyStartMenuIcon\(shell\);/);
  assert.match(app, /window\.__applyStartMenuIcon = applyStartMenuIcon;/, "exposed for F8 live preview");
});

// ===================================================================== editor

test("the server decides the icon's list and import destination, not the client", async () => {
  const server = await readSource("../src/server.js");
  // A dedicated listing route, scoped to the app-icon directory.
  const route = server.slice(server.indexOf('app.get("/api/dev/app-icons"'), server.indexOf("const IMPORT_ROOTS"));
  assert.match(route, /path\.join\(projectRoot, "assets", "app-icons"\)/);
  assert.match(route, /map\(sanitizeAppIconPath\)/, "listed paths are validated against the icon root");
  // The import destination stays a fixed server-side allowlist — the client
  // names a kind, never a folder.
  assert.match(server, /const IMPORT_ROOTS = \{ "start-menu-background": START_MENU_ROOT, "app-icon": APP_ICON_ROOT \};/);
  assert.match(server, /const root = IMPORT_ROOTS\[req\.body\?\.kind\];/);
  // The start-menu listing route is unchanged — still its own directory.
  assert.match(server, /"assets", "background", "start-menu"/);
});
