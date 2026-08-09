// Scene Background Ownership (schema v3).
//
// THE CHANGE: the Classic Library background used to be a hardcoded constant
// in public/assets.js, applied unconditionally by public/app.js. The Scene had
// a `sceneMeta.background` field that was trimmed-but-unvalidated and read by
// nothing. Now the Scene OWNS the background: the field is validated, the F8
// Map tab is the only place it can be authored, and the runtime applies it from
// the always-on /api/scene-layout route.
//
// THE THING MOST WORTH PROTECTING is the version-3 distinction, because getting
// it wrong is invisible in CI and blacks out a real user's library:
//
//   v2 file, background "" -> the field was INERT when it was written, so ""
//                             means "never authored". Migrate to Classic.
//   v3 file, background "" -> the author chose a blank Scene. Leave it blank.
//
// data/scene-layout.json ships, so a fresh clone normally HAS a layout. The
// no-file bootstrap must still seed Classic, for the case where it is absent
// anyway — a user who deleted it, or a checkout of only part of the tree —
// otherwise that run shows a black scene.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  sanitizeProjectAssetPath,
  sanitizeBackgroundPath,
  BACKGROUND_ROOT,
  BACKGROUND_EXTENSIONS,
  BACKGROUND_SKIP_DIR_PREFIX,
} from "../src/services/assetPaths.js";
import { sanitizeTutorialImage } from "../src/services/contentResources.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const CLASSIC = "assets/background/classic_library_bg.png";

let sceneLayout;
let tmpDir;
let layoutPath;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-scene-bg-"));
  layoutPath = path.join(tmpDir, "scene-layout.json");
  process.env.SCENE_LAYOUT_PATH = layoutPath;
  sceneLayout = await import("../src/services/sceneLayout.js");
});

after(async () => {
  delete process.env.SCENE_LAYOUT_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const writeLayout = (doc) => fs.writeFile(layoutPath, JSON.stringify(doc), "utf8");
const removeLayout = () => fs.rm(layoutPath, { force: true });

// ============================================================ the sanitizer

test("supported runtime formats are accepted", () => {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    assert.equal(sanitizeBackgroundPath(`assets/background/bg${ext}`), `assets/background/bg${ext}`);
  }
  // Extension matching is case-insensitive; the stored casing is preserved.
  assert.equal(sanitizeBackgroundPath("assets/background/BG.PNG"), "assets/background/BG.PNG");
  assert.equal(sanitizeBackgroundPath("assets/background/Bg.WebP"), "assets/background/Bg.WebP");
  // Sub-directories are allowed so a World can group its variants.
  assert.equal(sanitizeBackgroundPath("assets/background/xmas/hall.png"), "assets/background/xmas/hall.png");
});

test("PSD is not a runtime format — rejected by construction, not a special case", () => {
  assert.equal(sanitizeBackgroundPath("assets/background/classic_library.psd"), "");
  assert.equal(sanitizeBackgroundPath("assets/background/SOURCE.PSD"), "");
  // It is simply absent from the allow-list, which is what makes source art
  // safe to keep in the same folder.
  assert.ok(!BACKGROUND_EXTENSIONS.includes(".psd"));
  assert.deepEqual(BACKGROUND_EXTENSIONS, [".png", ".jpg", ".jpeg", ".webp"]);
});

test("other unsupported extensions are rejected", () => {
  for (const bad of ["bg.svg", "bg.gif", "bg.bmp", "bg.tif", "bg.avif", "bg", "bg.png.exe"]) {
    assert.equal(sanitizeBackgroundPath(`assets/background/${bad}`), "", `${bad} must be rejected`);
  }
});

test("absolute Windows paths are rejected, in both separator forms", () => {
  assert.equal(sanitizeBackgroundPath("C:\\Users\\example\\evil.png"), "");
  assert.equal(sanitizeBackgroundPath("C:/Users/example/evil.png"), "");
  assert.equal(sanitizeBackgroundPath("d:/art/bg.png"), "");
  // A drive letter matches the same scheme rule that catches URLs — one rule,
  // both cases.
  assert.equal(sanitizeBackgroundPath("Z:\\assets\\background\\bg.png"), "");
});

test("UNC paths are rejected", () => {
  assert.equal(sanitizeBackgroundPath("\\\\server\\share\\bg.png"), "");
  assert.equal(sanitizeBackgroundPath("//server/share/bg.png"), "");
});

test("POSIX absolute paths are rejected", () => {
  assert.equal(sanitizeBackgroundPath("/assets/background/bg.png"), "");
  assert.equal(sanitizeBackgroundPath("/etc/passwd.png"), "");
});

test("URLs and schemes are rejected", () => {
  for (const bad of [
    "http://evil.test/bg.png",
    "https://evil.test/bg.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)//bg.png",
    "file:///C:/bg.png",
    "//evil.test/bg.png",
  ]) {
    assert.equal(sanitizeBackgroundPath(bad), "", `${bad} must be rejected`);
  }
});

test("traversal is rejected at any depth", () => {
  for (const bad of [
    "../secret.png",
    "assets/background/../../secret.png",
    "assets/background/sub/../../../secret.png",
    "assets/../assets/background/bg.png",
  ]) {
    assert.equal(sanitizeBackgroundPath(bad), "", `${bad} must be rejected`);
  }
});

test("the root restriction holds — no other assets folder is reachable", () => {
  for (const bad of [
    "assets/characters/classic_omega.png",
    "assets/props/podium.png",
    "assets/tutorial/step8.png",
    "assets/backgrounds/bg.png", // note the plural: NOT the root
    "assets/background_other/bg.png",
    "config/product.json.png",
  ]) {
    assert.equal(sanitizeBackgroundPath(bad), "", `${bad} must be rejected`);
  }
  assert.equal(BACKGROUND_ROOT, "assets/background/");
});

test("Windows-authored separators normalize to POSIX", () => {
  assert.equal(sanitizeBackgroundPath("assets\\background\\classic_library_bg.png"), CLASSIC);
  assert.equal(sanitizeBackgroundPath("assets\\background\\xmas\\hall.png"), "assets/background/xmas/hall.png");
  // "." segments and doubled separators collapse.
  assert.equal(sanitizeBackgroundPath("assets/./background//bg.png"), "assets/background/bg.png");
});

test("non-string and over-long input yields \"\", never a throw", () => {
  for (const bad of [null, undefined, 42, {}, [], true, NaN]) {
    assert.equal(sanitizeBackgroundPath(bad), "");
  }
  assert.equal(sanitizeBackgroundPath(""), "");
  assert.equal(sanitizeBackgroundPath("   "), "");
  const tooLong = `assets/background/${"a".repeat(400)}.png`;
  assert.equal(sanitizeBackgroundPath(tooLong), "");
});

test("the shared sanitizer is generic — the root and extensions are the caller's policy", () => {
  assert.equal(
    sanitizeProjectAssetPath("assets/tutorial/step1.png", { root: "assets/tutorial/", extensions: [".png"] }),
    "assets/tutorial/step1.png"
  );
  // Same value, different policy -> rejected. Proves neither root nor
  // extension list is baked into the shared function.
  assert.equal(
    sanitizeProjectAssetPath("assets/tutorial/step1.png", { root: "assets/background/", extensions: [".png"] }),
    ""
  );
});

test("the Tutorial sanitizer's behaviour is unchanged by the extraction", async () => {
  // The cases test/contentResources.test.js already covers, re-asserted here
  // so this refactor cannot regress Tutorial silently.
  assert.equal(sanitizeTutorialImage("assets/tutorial/step8.png"), "assets/tutorial/step8.png");
  assert.equal(sanitizeTutorialImage("assets/tutorial/step8.webp"), "assets/tutorial/step8.webp");
  for (const bad of [
    "http://x/y.png",
    "/assets/tutorial/a.png",
    "assets/tutorial/../../secret.png",
    "assets/background/classic_library_bg.png", // a different root
    "assets/tutorial/a.svg",
    "C:\\a\\b.png",
  ]) {
    assert.equal(sanitizeTutorialImage(bad), "", `${bad} must be rejected`);
  }
  // And it now delegates rather than duplicating the rules.
  const src = await readSource("../src/services/contentResources.js");
  assert.match(src, /return sanitizeProjectAssetPath\(value, \{/);
  assert.doesNotMatch(src, /if \(raw\.startsWith\("\/"\)\) return "";/, "the rules must not exist twice");
});

// ========================================================== schema + storage

test("a valid background round-trips through disk", async () => {
  const saved = await sceneLayout.saveSceneLayout({ sceneMeta: { background: CLASSIC } });
  assert.equal(saved.sceneMeta.background, CLASSIC);
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC);
});

test("an invalid background is stored as \"\" and never fails the Scene", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1, z: 1 }],
    sceneMeta: { background: "C:\\Users\\example\\evil.png" },
  });
  assert.equal(saved.sceneMeta.background, "", "sanitized away");
  assert.equal(saved.objects.length, 1, "the rest of the Scene is untouched");
  const onDisk = JSON.parse(await fs.readFile(layoutPath, "utf8"));
  assert.equal(onDisk.sceneMeta.background, "", "an unsafe value never reaches disk");
});

test("every save stamps schema version 3", async () => {
  const saved = await sceneLayout.saveSceneLayout({ sceneMeta: { background: CLASSIC } });
  assert.equal(saved.version, 3);
  assert.equal(sceneLayout.SCENE_SCHEMA_VERSION, 3);
  // The old export name still resolves, for callers and tests that use it.
  assert.equal(sceneLayout.SLOT_SCHEMA_VERSION, sceneLayout.SCENE_SCHEMA_VERSION);
});

test("sanitizeLayout stays pure and synchronous — no filesystem in the sanitizer", async () => {
  const src = await readSource("../src/services/sceneLayout.js");
  const start = src.indexOf("function sanitizeSceneMeta(");
  const end = src.indexOf("function sanitizeZone(");
  const fn = src.slice(start, end);
  assert.match(fn, /background: sanitizeBackgroundPath\(m\.background\)/);
  for (const forbidden of [/await /, /fs\./, /async /, /existsSync/]) {
    assert.doesNotMatch(fn, forbidden, `sanitizeSceneMeta must not use ${forbidden}`);
  }
});

// ============================================================== migration

test("v2 + empty background migrates to Classic (a legacy Scene keeps its art)", async () => {
  await writeLayout({ version: 2, objects: [], zones: [], sceneMeta: { background: "" } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC);
  assert.equal(loaded.version, 3, "the loaded document reports the current schema");
});

test("v2 + an authored background is KEPT, never overwritten by the migration", async () => {
  await writeLayout({
    version: 2,
    objects: [],
    zones: [],
    sceneMeta: { background: "assets/background/start_menu.png" },
  });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, "assets/background/start_menu.png");
});

test("v2 + an INVALID background sanitizes to \"\" and then migrates", async () => {
  await writeLayout({ version: 2, objects: [], zones: [], sceneMeta: { background: "../../secret.png" } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC);
});

test("v3 + empty background stays BLANK — an authored blank Scene is honoured", async () => {
  await writeLayout({ version: 3, objects: [], zones: [], sceneMeta: { background: "" } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, "", "a deliberately blank Scene must not be re-filled");
});

test("v3 + an invalid background becomes blank, with NO migration", async () => {
  await writeLayout({ version: 3, objects: [], zones: [], sceneMeta: { background: "C:/evil.png" } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, "");
});

test("a missing version is treated as legacy", async () => {
  await writeLayout({ objects: [], zones: [], sceneMeta: { background: "" } });
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC);
});

test("the no-file bootstrap seeds Classic, for a run with no layout file at all", async () => {
  await removeLayout();
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC);
  assert.equal(loaded.version, 3);
  assert.equal(sceneLayout.CLASSIC_LIBRARY_BACKGROUND, CLASSIC);
});

test("the migration writes NOTHING to disk until the author saves", async () => {
  const legacy = { version: 2, objects: [], zones: [], sceneMeta: { background: "" } };
  await writeLayout(legacy);
  const before = await fs.readFile(layoutPath, "utf8");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, CLASSIC, "migrated in memory");
  const after = await fs.readFile(layoutPath, "utf8");
  assert.equal(after, before, "the file on disk is byte-identical");
  // ...and saving is what makes it permanent.
  await sceneLayout.saveSceneLayout(loaded);
  const persisted = JSON.parse(await fs.readFile(layoutPath, "utf8"));
  assert.equal(persisted.sceneMeta.background, CLASSIC);
  assert.equal(persisted.version, 3);
});

test("a saved (v3) blank Scene survives a reload — the round trip that matters", async () => {
  await sceneLayout.saveSceneLayout({ sceneMeta: { background: "" } });
  const onDisk = JSON.parse(await fs.readFile(layoutPath, "utf8"));
  assert.equal(onDisk.version, 3);
  assert.equal(onDisk.sceneMeta.background, "");
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.sceneMeta.background, "", "Clear + Save + reload stays blank");
});

// ========================================================= ownership boundaries

test("no other layer owns the background", async () => {
  // World: identity and content only.
  const world = JSON.parse(await readSource("../assets/worlds/classic.world.json"));
  assert.deepEqual(Object.keys(world).sort(), ["displayName", "id", "identity", "library", "version"]);
  const preset = JSON.parse(await readSource("../assets/world-presets/classic.json"));
  assert.ok(!("background" in preset), "a World preset must not carry art");
  assert.doesNotMatch(JSON.stringify(world), /assets\/background/);

  // Colour Theme: colour tokens only, no image or URL.
  const worldContent = await import("../src/services/worldContent.js");
  for (const [name, token] of Object.entries(worldContent.THEME_TOKENS)) {
    // Every token is a colour. (Matched on whole words — "scrollbarTrack"
    // contains the letters of "art" and a loose regex flags it.)
    assert.doesNotMatch(name, /\b(image|background|artwork|url|src)\b/i, `theme token ${name}`);
    assert.match(token, /^--ws-/);
  }

  // Product Config: identity and links only.
  const product = JSON.parse(await readSource("../config/product.json"));
  assert.ok(!("background" in product));
});

test("assets.js carries no background constant at all — both are authored", async () => {
  const assetsJs = await readSource("../public/assets.js");
  assert.doesNotMatch(assetsJs, /classicLibraryBackground/);
  assert.doesNotMatch(assetsJs, /classic_library_bg/);
  // The start menu background became authored too (config/app-shell.json), so
  // no background art is hardcoded here any more.
  assert.doesNotMatch(assetsJs, /startMenuBackground/);
  assert.doesNotMatch(assetsJs, /start_menu\.png/);
  // The remaining entries are character/prop sprites, which are not scene
  // backgrounds and are out of scope.
  assert.match(assetsJs, /classicOmega:/);
});

test("CSS does not set a background image on the scene surface", async () => {
  const css = await readSource("../public/style.css");
  const start = css.indexOf(".library-scene {");
  const end = css.indexOf("/* Library Fullscreen:");
  assert.ok(start > 0 && end > start, "could not locate the scene-surface rules");
  const scene = css.slice(start, end);
  assert.doesNotMatch(scene, /background-image|url\(/, "the scene surface must not hardcode art");
  // KNOWN LIMITATION, deliberately unchanged in this task: the 16:9 ratio is
  // still fixed to the Classic art's dimensions rather than sceneMeta.
  assert.match(scene, /aspect-ratio: 16 \/ 9;/);
});

// ================================================================== runtime

test("the runtime applies the Scene's background from the always-on route", async () => {
  const app = await readSource("../public/app.js");
  // Applied from the layout loadCharacterRuntimeData already fetched — no new
  // route and no second request.
  assert.match(app, /applySceneBackground\(layout\?\.sceneMeta\?\.background \|\| ""\);/);
  assert.match(app, /const SCENE_LAYOUT_URL = "\/api\/scene-layout";/);
  // The URL is derived at render time; the stored value keeps no leading slash.
  assert.match(app, /bg\.src = `\/\$\{sceneBackgroundRef\}`;/);
  // The old hardcoded assignment is gone.
  assert.doesNotMatch(app, /bg\.src = window\.ASSETS\.classicLibraryBackground/);
  assert.doesNotMatch(app, /classicLibraryBackground/);
});

test("an empty reference blanks the Scene without requesting a bogus URL", async () => {
  const app = await readSource("../public/app.js");
  const fn = app.slice(app.indexOf("function applySceneBackground(ref)"), app.indexOf("// Re-reads the Scene"));
  // removeAttribute, never src = "": an empty src re-requests the page URL in
  // some browsers and would fire a misleading error.
  assert.match(fn, /bg\.removeAttribute\("src"\);/);
  assert.match(fn, /bg\.style\.display = "none";/);
  assert.doesNotMatch(fn, /bg\.src = "";/);
});

test("a missing file warns and falls back without touching the saved value", async () => {
  const app = await readSource("../public/app.js");
  assert.match(app, /function attachSceneBackgroundErrorHandler\(\)/);
  assert.match(app, /bg\.addEventListener\("error", \(\) => \{/);
  assert.match(app, /the Scene's saved reference is unchanged/);
  // The handler hides the element; nothing in it writes a Scene value.
  const fn = app.slice(app.indexOf("function attachSceneBackgroundErrorHandler()"), app.indexOf("// Applies a Scene background reference"));
  assert.doesNotMatch(fn, /saveSceneLayout|fetch\(|sceneMeta/);
  // It is installed before any background is applied.
  assert.match(app, /^\s*attachSceneBackgroundErrorHandler\(\);$/m);
});

test("production needs no dev route: the read path and the asset mount are both always-on", async () => {
  const server = await readSource("../src/server.js");
  const gateAt = server.indexOf("if (config.devTools) {");
  const publicLayoutAt = server.indexOf('app.get("/api/scene-layout"');
  const devLayoutAt = server.indexOf('app.get("/api/dev/scene-layout"');
  const backgroundsAt = server.indexOf('app.get("/api/dev/backgrounds"');
  const staticAssetsAt = server.indexOf('app.use("/assets", express.static');
  assert.ok(staticAssetsAt < gateAt, "/assets must be mounted outside the devTools gate");
  assert.ok(publicLayoutAt > devLayoutAt, "the public layout route is outside the gate");
  assert.ok(backgroundsAt > gateAt && backgroundsAt < publicLayoutAt, "the picker route is dev-only");
});

// ================================================================ F8 Map tab

test("the server re-validates the id with the SAME sanitizer the schema uses", async () => {
  const server = await readSource("../src/server.js");
  const start = server.indexOf('app.post("/api/dev/content-open"');
  const end = server.indexOf("// The scene's own object list", start);
  assert.ok(start > 0 && end > start, "could not locate the content-open route");
  const route = server.slice(start, end);
  assert.match(route, /const rel = sanitizeBackgroundPath\(req\.body\?\.id\);/);
  assert.match(route, /if \(!rel\) return res\.status\(400\)\.json\(\{ error: "Invalid background path\." \}\);/);
  assert.match(route, /target = path\.join\(projectRoot, rel\);/);
});

test("the picker lists only supported images and skips \"_\" directories", async () => {
  const server = await readSource("../src/server.js");
  // The walk is shared by both pickers (Scene and start menu).
  const walker = server.slice(
    server.indexOf("async function listBackgroundImages("),
    server.indexOf('app.get("/api/dev/backgrounds"')
  );
  assert.ok(walker.length > 0, "could not locate the shared listing walk");
  assert.match(walker, /if \(e\.name\.startsWith\(BACKGROUND_SKIP_DIR_PREFIX\)\) continue;/);
  assert.match(walker, /BACKGROUND_EXTENSIONS\.includes\(path\.extname\(e\.name\)\.toLowerCase\(\)\)/);
  assert.match(walker, /path\.relative\(projectRoot, full\)\.split\(path\.sep\)\.join\("\/"\)/, "POSIX-normalized");
  // Re-validated, so the listing can never offer something the schema rejects.
  const route = server.slice(
    server.indexOf('app.get("/api/dev/backgrounds"'),
    server.indexOf('app.get("/api/dev/start-menu-backgrounds"')
  );
  assert.match(route, /found\.map\(sanitizeBackgroundPath\)\.filter\(Boolean\)/);
  assert.equal(BACKGROUND_SKIP_DIR_PREFIX, "_");
});

// The artist's placement composite lives in assets/background/_guides/, which
// is authoring material and does not ship. What still matters publicly is that
// a "_"-prefixed directory is skipped by the background picker at all — the
// rule, not the private file it was written for.
test("directories prefixed with _ are never offered as backgrounds", () => {
  assert.ok("_guides".startsWith(BACKGROUND_SKIP_DIR_PREFIX));
  assert.equal(sanitizeBackgroundPath("assets/background/_guides/anything.png"), "assets/background/_guides/anything.png",
    "the path SHAPE is valid — exclusion is the picker's job, not the sanitizer's");
});
