// Start Menu Background ownership.
//
// The start screen's art used to be a hardcoded constant in public/assets.js,
// pushed into a CSS custom property at script evaluation. It is now authored,
// with its own field, its own document and its own root.
//
// THE POINT OF THIS FILE is the SEPARATION. The Scene background and the start
// menu background are two fields in two documents with two roots and two
// sanitizers, so that:
//
//   * loading or switching a Scene can never change the start screen, and
//   * the start screen can never be pointed at arbitrary scene art.
//
// It also protects the decision NOT to put this in config/product.json: that
// file is deliberately read-only at runtime (no write export, no write route)
// so a Scene or preset can never repoint an official link. Adding a write path
// there for a cosmetic field would have traded a real safety property away.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  sanitizeStartMenuBackgroundPath,
  sanitizeBackgroundPath,
  START_MENU_ROOT,
  BACKGROUND_ROOT,
  BACKGROUND_EXTENSIONS,
} from "../src/services/assetPaths.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const DEFAULT_ART = "assets/background/start-menu/start_menu.png";

let appShell;
let tmpDir;
let configPath;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-app-shell-"));
  configPath = path.join(tmpDir, "app-shell.json");
  process.env.APP_SHELL_CONFIG_PATH = configPath;
  appShell = await import("../src/services/appShell.js");
});

after(async () => {
  delete process.env.APP_SHELL_CONFIG_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ================================================== root + extension rules

test("the start menu root is its own, tighter root", () => {
  assert.equal(START_MENU_ROOT, "assets/background/start-menu/");
  assert.ok(START_MENU_ROOT.startsWith(BACKGROUND_ROOT), "it is a sub-directory of the background root");
  assert.notEqual(START_MENU_ROOT, BACKGROUND_ROOT);
});

test("supported formats are accepted under the start-menu root", () => {
  for (const ext of BACKGROUND_EXTENSIONS) {
    const p = `assets/background/start-menu/menu${ext}`;
    assert.equal(sanitizeStartMenuBackgroundPath(p), p);
  }
  assert.equal(sanitizeStartMenuBackgroundPath(DEFAULT_ART), DEFAULT_ART);
  // Sub-directories under the start-menu root are fine.
  assert.equal(
    sanitizeStartMenuBackgroundPath("assets/background/start-menu/winter/menu.webp"),
    "assets/background/start-menu/winter/menu.webp"
  );
});

test("unsupported formats are rejected, PSD included", () => {
  for (const bad of ["menu.psd", "menu.svg", "menu.gif", "menu.bmp", "menu", "menu.png.exe"]) {
    assert.equal(sanitizeStartMenuBackgroundPath(`assets/background/start-menu/${bad}`), "", bad);
  }
});

test("scene art is NOT a valid start menu background — the roots do not overlap", () => {
  // The whole separation, in one assertion: a perfectly valid SCENE background
  // is refused by the start-menu field.
  const sceneArt = "assets/background/classic_library_bg.png";
  assert.equal(sanitizeBackgroundPath(sceneArt), sceneArt, "valid as a Scene background");
  assert.equal(sanitizeStartMenuBackgroundPath(sceneArt), "", "but never as start-menu art");
  // Nor anything else outside the start-menu root.
  for (const bad of [
    "assets/background/other.png",
    "assets/background/_guides/classic_library_bg_guide.png",
    "assets/characters/classic_omega.png",
    "assets/background/start-menu2/menu.png",
    "assets/background/start_menu.png", // the OLD flat location
  ]) {
    assert.equal(sanitizeStartMenuBackgroundPath(bad), "", bad);
  }
});

test("the same shared validator rejects URLs, absolutes, UNC and traversal", () => {
  for (const bad of [
    "http://evil.test/menu.png",
    "https://evil.test/menu.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)//menu.png",
    "C:\\Users\\example\\menu.png",
    "C:/Users/example/menu.png",
    "\\\\server\\share\\menu.png",
    "//server/share/menu.png",
    "/assets/background/start-menu/menu.png",
    "assets/background/start-menu/../../../secret.png",
    "../menu.png",
  ]) {
    assert.equal(sanitizeStartMenuBackgroundPath(bad), "", `${bad} must be rejected`);
  }
  // Windows separators normalize, exactly as for the Scene field.
  assert.equal(sanitizeStartMenuBackgroundPath("assets\\background\\start-menu\\start_menu.png"), DEFAULT_ART);
  // Non-strings never throw.
  for (const bad of [null, undefined, 42, {}, [], true]) {
    assert.equal(sanitizeStartMenuBackgroundPath(bad), "");
  }
});

test("both sanitizers come from the ONE shared implementation", async () => {
  const src = await readSource("../src/services/assetPaths.js");
  // Exactly one place implements the rules.
  assert.equal([...src.matchAll(/if \(raw\.startsWith\("\/"\)\) return "";/g)].length, 1);
  assert.equal([...src.matchAll(/export function sanitizeProjectAssetPath\(/g)].length, 1);
  // Both named helpers delegate to it rather than re-deriving anything.
  assert.match(src, /export function sanitizeBackgroundPath\(value\) \{\s*return sanitizeProjectAssetPath\(value, \{/);
  assert.match(src, /export function sanitizeStartMenuBackgroundPath\(value\) \{\s*return sanitizeProjectAssetPath\(value, \{/);
});

// ================================================== the document + defaults

test("the shipped default points at the real file, which exists", async () => {
  assert.equal(appShell.DEFAULT_START_MENU_BACKGROUND, DEFAULT_ART);
  const stat = await fs.stat(new URL(`../${DEFAULT_ART}`, import.meta.url));
  assert.ok(stat.isFile() && stat.size > 0);
  // ...and nothing remains at the old flat location.
  await assert.rejects(
    () => fs.stat(new URL("../assets/background/start_menu.png", import.meta.url)),
    /ENOENT/
  );
});

test("the on-disk config file is valid", async () => {
  // VALIDITY, not a specific value. This file is AUTHORED — every background
  // pick in F8 rewrites it — so asserting it still equals the shipped default
  // made the suite fail the moment the feature was used for real. What must
  // hold is that whatever the author put there survives the sanitizer intact.
  const doc = JSON.parse(await readSource("../config/app-shell.json"));
  assert.equal(doc.version, 1);
  assert.equal(typeof doc.startMenuBackground, "string");
  // Either blank (deliberately no art) or a valid start-menu asset reference —
  // never something the sanitizer would strip.
  assert.equal(
    sanitizeStartMenuBackgroundPath(doc.startMenuBackground),
    doc.startMenuBackground,
    "the stored reference must round-trip through its own sanitizer"
  );
  // The shipped DEFAULT is what a fresh install gets, and that is asserted
  // against the code, not against the author's working file.
  assert.equal(appShell.DEFAULT_START_MENU_BACKGROUND, DEFAULT_ART);
});

test("a missing config file falls back to the shipped default, never a crash", async () => {
  await fs.rm(configPath, { force: true });
  const shell = await appShell.loadAppShell();
  assert.equal(shell.startMenuBackground, DEFAULT_ART);
  assert.equal(shell.version, 1);
});

test("a corrupt config file falls back to the default, never a crash", async () => {
  await fs.writeFile(configPath, "{ not json at all", "utf8");
  const shell = await appShell.loadAppShell();
  assert.equal(shell.startMenuBackground, DEFAULT_ART);
});

test("a MISSING key defaults, an EMPTY string is an authored blank", () => {
  // Absent -> the shipped art (an incomplete file still shows the right screen).
  assert.equal(appShell.sanitizeAppShell({}).startMenuBackground, DEFAULT_ART);
  assert.equal(appShell.sanitizeAppShell(null).startMenuBackground, DEFAULT_ART);
  // Present-but-empty -> honoured as "no art", the same authored-blank rule
  // the Scene background uses.
  assert.equal(appShell.sanitizeAppShell({ startMenuBackground: "" }).startMenuBackground, "");
});

test("an unsafe value never reaches disk", async () => {
  const saved = await appShell.saveAppShell({ startMenuBackground: "C:\\Users\\example\\evil.png" });
  assert.equal(saved.startMenuBackground, "");
  const onDisk = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(onDisk.startMenuBackground, "");
});

test("a valid value round-trips through disk", async () => {
  const saved = await appShell.saveAppShell({ startMenuBackground: DEFAULT_ART });
  assert.equal(saved.startMenuBackground, DEFAULT_ART);
  const loaded = await appShell.loadAppShell();
  assert.equal(loaded.startMenuBackground, DEFAULT_ART);
});

test("clearing round-trips as a blank start screen", async () => {
  await appShell.saveAppShell({ startMenuBackground: "" });
  const loaded = await appShell.loadAppShell();
  assert.equal(loaded.startMenuBackground, "", "Clear stays cleared across a reload");
});

test("the document is driven by its known field list — nothing else survives", () => {
  const clean = appShell.sanitizeAppShell({
    startMenuBackground: DEFAULT_ART,
    // Things a Scene, World or product config might try to smuggle in:
    sceneId: "evil",
    links: { website: "https://evil.test" },
    identity: { alpha: "Hijack" },
    background: "assets/background/classic_library_bg.png",
    version: 99,
  });
  // The document gained the Title Image and its position, and later the
  // separate decorative Icon layer; all are Start Menu configuration and
  // belong to the same owner as the background.
  assert.deepEqual(Object.keys(clean).sort(), [
    "startMenuBackground", "startMenuIcon", "startMenuIconScale", "startMenuIconX", "startMenuIconY",
    "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY", "version",
  ]);
  assert.equal(clean.version, 1, "the version is stamped, never taken from input");
  assert.equal(clean.background, undefined);
  assert.equal(clean.links, undefined);
});

test("the runtime projection exposes only the shell's own field", () => {
  const runtime = appShell.runtimeAppShell({ startMenuBackground: DEFAULT_ART });
  assert.deepEqual(Object.keys(runtime).sort(), [
    "startMenuBackground", "startMenuIcon", "startMenuIconScale", "startMenuIconX", "startMenuIconY",
    "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY",
  ]);
  assert.equal(runtime.startMenuBackground, DEFAULT_ART);
  // No path, no version bookkeeping leaks to the client.
  assert.equal(JSON.stringify(runtime).includes(os.tmpdir().slice(0, 3)), false);
});

// ================================== selection is NOT import (duplication bug)
//
// Selecting an already-imported asset from the dropdown must set a reference
// and nothing else. These two operations share a field but must never share a
// code path — routing selection through the import pipeline is what produced
// menu_bg_2.png, menu_bg_3.png on every pick.

test("adoption is decided in the service, not per-caller", async () => {
  // One rule, in the shared importer — so every present and future caller
  // (Map Background next) inherits it.
  const svc = await readSource("../src/services/imageImport.js");
  assert.match(svc, /const sameDir =/);
  assert.match(svc, /return \{ path: `\$\{root\}\$\{name\}`, name, bytes: bytes\.length, adopted: true \};/);
  assert.match(svc, /adopted: false \};/);
  // Windows spells the same file with different case; that must not read as
  // two different files.
  assert.match(svc, /process\.platform === "win32"/);
  assert.match(svc, /toLowerCase\(\) === path\.resolve\(dirAbs\)\.toLowerCase\(\)/);
});

// ============================================== separation from other owners

test("Product Config stays strictly read-only — the reason this is a separate document", async () => {
  const productSrc = await readSource("../src/services/productConfig.js");
  assert.doesNotMatch(productSrc, /writeFile|appendFile|rename|unlink/);
  const server = await readSource("../src/server.js");
  assert.doesNotMatch(server, /app\.post\("\/api\/product/);
  assert.doesNotMatch(server, /app\.put\("\/api\/product/);
  // product.json must not have grown a background field.
  const product = JSON.parse(await readSource("../config/product.json"));
  assert.ok(!("startMenuBackground" in product));
  assert.ok(!("background" in product));
  // The app-shell service explains why it is separate, so the decision is not
  // re-litigated by someone tidying up.
  const shellSrc = await readSource("../src/services/appShell.js");
  assert.match(shellSrc, /NOT config\/product\.json/);
});

test("World and Colour Theme own neither background", async () => {
  const world = JSON.parse(await readSource("../assets/worlds/classic.world.json"));
  assert.doesNotMatch(JSON.stringify(world), /start[_-]?menu/i);
  const worldContent = await import("../src/services/worldContent.js");
  for (const name of Object.keys(worldContent.THEME_TOKENS)) {
    assert.doesNotMatch(name, /start|menu|background/i, `theme token ${name}`);
  }
});

// ========================================================== runtime + routes

test("no hardcoded start_menu.png reference remains in the frontend", async () => {
  for (const rel of ["../public/assets.js", "../public/style.css", "../public/index.html"]) {
    const src = await readSource(rel);
    assert.doesNotMatch(src, /start_menu\.png/, `${rel} must not hardcode the art`);
  }
  // app.js mentions it nowhere either — not as a constant and not as a URL.
  const app = await readSource("../public/app.js");
  assert.doesNotMatch(app, /start_menu\.png/);
  assert.doesNotMatch(app, /window\.ASSETS\.startMenuBackground/);
});

test("the runtime reads the configured reference from its always-on route", async () => {
  const app = await readSource("../public/app.js");
  assert.match(app, /const APP_SHELL_URL = "\/api\/app-shell";/);
  assert.match(app, /applyStartMenuBackground\(shell\?\.startMenuBackground \|\| ""\);/);
  // The URL is built at apply time; the stored value keeps no leading slash.
  assert.match(app, /const url = `\/\$\{path\}`;/);
  // It is actually invoked at startup.
  assert.match(app, /^\s*loadStartMenuBackground\(\);$/m);
});

test("a missing or empty reference falls back to the neutral wash, with a warning", async () => {
  const app = await readSource("../public/app.js");
  const fn = app.slice(
    app.indexOf("function applyStartMenuBackground(ref)"),
    app.indexOf("async function loadStartMenuBackground()")
  );
  // Empty -> neutral, no request attempted.
  assert.match(fn, /const clear = \(\) => root\.setProperty\("--start-bg-url", "none"\);/);
  assert.match(fn, /if \(!path\) \{/);
  // Missing file -> probed, so the silent CSS 404 becomes a real warning, and
  // the neutral wash is restored rather than leaving a half-applied value.
  assert.match(fn, /const probe = new Image\(\);/);
  assert.match(fn, /probe\.onerror = \(\) => \{/);
  assert.match(fn, /start menu background could not be loaded/);
  assert.match(fn, /the saved reference is unchanged/);
  // Nothing in the applier writes the config back.
  assert.doesNotMatch(fn, /fetch\(|saveAppShell/);

  // The CSS fallback that makes this safe is still in place — now over a
  // NEUTRAL base. It used to be --wood-dark under a 45% parchment wash, which
  // is exactly what flashed yellow on every refresh; both are gone.
  const css = await readSource("../public/style.css");
  assert.match(css, /background: var\(--start-bg-base\) var\(--start-bg-url, none\) center \/ cover no-repeat;/);
  assert.match(css, /--start-bg-base: #0e0d0c;/);
});

test("production renders the start screen with no dev route", async () => {
  const server = await readSource("../src/server.js");
  const gateAt = server.indexOf("if (config.devTools) {");
  const readAt = server.indexOf('app.get("/api/app-shell"');
  const writeAt = server.indexOf('app.post("/api/dev/app-shell"');
  const listAt = server.indexOf('app.get("/api/dev/start-menu-backgrounds"');
  // /api/product is the established always-on product-shell read route; the
  // shell's read route is registered immediately after it, in the same region,
  // well past every /api/dev/* registration.
  const productAt = server.indexOf('app.get("/api/product"');
  const configAt = server.indexOf('app.get("/api/config"');
  assert.ok(readAt > productAt && readAt < configAt, "the app-shell read route sits in the always-on region");
  // The write route and the picker are dev-only: both inside the gate, and
  // both registered long before the always-on block begins.
  assert.ok(writeAt > gateAt && writeAt < productAt, "the write route must be dev-gated");
  assert.ok(listAt > gateAt && listAt < productAt, "the picker route must be dev-gated");
});

test("the write route sanitizes server-side, so a client cannot store a path", async () => {
  const shellSrc = await readSource("../src/services/appShell.js");
  assert.match(shellSrc, /export async function saveAppShell\(raw\) \{\s*const clean = sanitizeAppShell\(raw\);/);
  const server = await readSource("../src/server.js");
  // Scoped to THIS route's own handler — other dev routes have since been
  // registered after it, and they legitimately build paths of their own.
  const start = server.indexOf('app.post("/api/dev/app-shell"');
  const route = server.slice(start, server.indexOf("\n  });", start));
  assert.match(route, /res\.json\(await saveAppShell\(req\.body\)\);/);
  assert.doesNotMatch(route, /path\.join|path\.resolve/, "the route never builds a path from the body");
});
test("the Scene picker excludes the start-menu domain", async () => {
  const server = await readSource("../src/server.js");
  const route = server.slice(
    server.indexOf('app.get("/api/dev/backgrounds"'),
    server.indexOf('app.get("/api/dev/start-menu-backgrounds"')
  );
  // Excluded by the shared named constant, not a magic string.
  assert.match(route, /\(rel\) => rel === START_MENU_ROOT/);
});
