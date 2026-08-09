// ALS — Aether Library Scene, format v1.
//
// A Scene is the complete saved state of one map, in one external .als file.
// These tests protect three things above all:
//
//   1. THE ENVELOPE. A wrong format or a NEWER version is rejected before
//      anything is sanitized, because v1's sanitizers are allowlist-driven and
//      would silently drop whatever they did not recognise. Dropping a future
//      field is data loss; refusing to open is not.
//   2. THE BOUNDARY. app-shell.json (the Start Menu background) and
//      product.json must never enter an .als, and no Scene operation may
//      change them.
//   3. ATOMICITY. A failed save must leave the previous .als byte-identical.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

let sceneFile;
let appShell;
let tmpRoot;      // stands in for an EXTERNAL folder, outside the project
let scenesDir;
let authoringPath;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-als-"));
  scenesDir = path.join(tmpRoot, "scenes");
  authoringPath = path.join(tmpRoot, "authoring.json");
  await fs.mkdir(scenesDir, { recursive: true });
  process.env.AUTHORING_CONFIG_PATH = authoringPath;
  process.env.APP_SHELL_CONFIG_PATH = path.join(tmpRoot, "app-shell.json");
  sceneFile = await import("../src/services/sceneFile.js");
  appShell = await import("../src/services/appShell.js");
});

after(async () => {
  delete process.env.AUTHORING_CONFIG_PATH;
  delete process.env.APP_SHELL_CONFIG_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(authoringPath, { force: true });
});

const als = (name) => path.join(scenesDir, name);
const envelope = (over = {}) => ({ format: "aether-library-scene", version: 1, scene: {}, ...over });

// ============================================================= the envelope

test("format and version are required, and exact", () => {
  assert.equal(sceneFile.ALS_FORMAT, "aether-library-scene");
  assert.equal(sceneFile.ALS_VERSION, 1);
  assert.equal(sceneFile.validateEnvelope(envelope()), 1);
});

test("a wrong or absent format is rejected", () => {
  for (const bad of [{ format: "unity-scene" }, { format: "" }, { format: 42 }]) {
    assert.throws(() => sceneFile.validateEnvelope(envelope(bad)), /not an Aether Library Scene/);
  }
  // Absent entirely (not merely different) — spreading {} over the default
  // would leave a valid format in place, so build this one explicitly.
  assert.throws(() => sceneFile.validateEnvelope({ version: 1, scene: {} }), /not an Aether Library Scene/);
});

test("a NEWER version is rejected explicitly, never partially loaded", () => {
  assert.throws(
    () => sceneFile.validateEnvelope(envelope({ version: 2 })),
    /newer version of Aether Library.*v2.*understands v1/s
  );
  assert.throws(() => sceneFile.validateEnvelope(envelope({ version: 99 })), /newer version/);
});

test("a missing or malformed version is rejected", () => {
  for (const bad of [{ version: undefined }, { version: 0 }, { version: -1 }, { version: 1.5 }, { version: "1" }]) {
    assert.throws(() => sceneFile.validateEnvelope(envelope(bad)), /no valid version/);
  }
});

test("non-objects are rejected before anything else", () => {
  for (const bad of [null, undefined, [], "text", 42]) {
    assert.throws(() => sceneFile.validateEnvelope(bad), /not an Aether Library Scene/);
  }
});

// ================================================================== paths

test("an .als path must be absolute — a relative one would resolve unpredictably", () => {
  assert.throws(() => sceneFile.validateScenePath("scenes/a.als"), /must be absolute/);
  assert.throws(() => sceneFile.validateScenePath("./a.als"), /must be absolute/);
  assert.throws(() => sceneFile.validateScenePath("../a.als"), /must be absolute/);
});

test("only .als is accepted, so this tool can never read or overwrite anything else", () => {
  const dir = process.platform === "win32" ? "C:\\Scenes\\" : "/scenes/";
  for (const bad of ["a.json", "a.txt", "a", "a.als.exe", "package.json"]) {
    assert.throws(() => sceneFile.validateScenePath(`${dir}${bad}`), /must end in \.als/);
  }
  assert.ok(sceneFile.validateScenePath(`${dir}a.als`));
  assert.ok(sceneFile.validateScenePath(`${dir}A.ALS`), "extension match is case-insensitive");
});

test("platform-native absolute forms are accepted on this platform", () => {
  if (process.platform === "win32") {
    assert.equal(sceneFile.validateScenePath("C:\\Scenes\\my.als"), path.normalize("C:\\Scenes\\my.als"));
    assert.equal(sceneFile.validateScenePath("C:/Scenes/my.als"), path.normalize("C:/Scenes/my.als"));
    // A UNC share is absolute and legitimate for an external scene folder.
    assert.ok(sceneFile.validateScenePath("\\\\server\\share\\my.als"));
  } else {
    assert.equal(sceneFile.validateScenePath("/home/kaz/scenes/my.als"), "/home/kaz/scenes/my.als");
  }
  // Traversal collapses via normalize but must still land somewhere absolute.
  const dir = process.platform === "win32" ? "C:\\a\\b\\..\\my.als" : "/a/b/../my.als";
  assert.ok(path.isAbsolute(sceneFile.validateScenePath(dir)));
});

test("empty and NUL-bearing paths are rejected", () => {
  assert.throws(() => sceneFile.validateScenePath(""), /path is required/);
  assert.throws(() => sceneFile.validateScenePath("   "), /path is required/);
  assert.throws(() => sceneFile.validateScenePath(null), /path is required/);
  const dir = process.platform === "win32" ? "C:\\x\0y.als" : "/x\0y.als";
  assert.throws(() => sceneFile.validateScenePath(dir), /Invalid scene file path/);
});

// ================================================================ document

test("the document is composed from the EXISTING sanitizers, not new ones", async () => {
  const src = await readSource("../src/services/sceneFile.js");
  assert.match(src, /import \{ sanitizeLayout, loadSceneLayout \} from "\.\/sceneLayout\.js";/);
  assert.match(src, /import \{ sanitizeSceneConfig, loadSceneConfig \} from "\.\/sceneConfig\.js";/);
  assert.match(src, /import \{ sanitizeSceneContent, loadSceneContent \} from "\.\/sceneContent\.js";/);
  // It defines no sanitizer of its own for the sections.
  assert.doesNotMatch(src, /function sanitizeZone|function sanitizeObject|function sanitizeCharacterSlot/);
});

test("every Scene-owned section is present in the schema", () => {
  const doc = sceneFile.sanitizeSceneDocument({ scene: {} });
  assert.equal(doc.format, "aether-library-scene");
  assert.equal(doc.version, 1);
  assert.deepEqual(Object.keys(doc.scene).sort(), [
    "characterRoles",
    "characterSlots",
    "content",
    "lightBlockers",
    "lights",
    "meta",
    "objects",
    "props",
    "world",
    "zones",
  ]);
});

test("unknown fields are dropped by construction, at every level", () => {
  const doc = sceneFile.sanitizeSceneDocument({
    format: "aether-library-scene",
    version: 1,
    somethingElse: "hijack",
    scene: {
      meta: { name: "S", background: "", nonsense: 1 },
      futureSection: { a: 1 },
      objects: [],
      zones: [],
    },
  });
  assert.equal(doc.somethingElse, undefined);
  assert.equal(doc.scene.futureSection, undefined);
  assert.equal(doc.scene.meta.nonsense, undefined);
  assert.equal(doc.scene.meta.name, "S");
});

test("a blank New Scene has no background and nothing placed", () => {
  const doc = sceneFile.blankSceneDocument();
  assert.equal(doc.scene.meta.background, "", "the author picks one later through Map");
  assert.deepEqual(doc.scene.objects, []);
  assert.deepEqual(doc.scene.props, []);
  assert.deepEqual(doc.scene.zones, []);
  assert.deepEqual(doc.scene.characterSlots, []);
  // Roles and world still get their defaults — a blank Scene is still a Scene.
  assert.ok(doc.scene.characterRoles.length > 0);
  assert.ok(doc.scene.world);
});

test("an absolute or unsupported background never survives into an .als", () => {
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { meta: { background: "C:\\Users\\example\\evil.png" } },
  });
  assert.equal(doc.scene.meta.background, "");
  const psd = sceneFile.sanitizeSceneDocument({ scene: { meta: { background: "assets/background/a.psd" } } });
  assert.equal(psd.scene.meta.background, "");
  // A valid project-relative one does.
  const ok = sceneFile.sanitizeSceneDocument({
    scene: { meta: { background: "assets/background/classic_library_bg.png" } },
  });
  assert.equal(ok.scene.meta.background, "assets/background/classic_library_bg.png");
});

test("no image bytes and no absolute paths can be embedded", async () => {
  const doc = await sceneFile.exportCurrentSceneDocument();
  const json = JSON.stringify(doc);
  assert.doesNotMatch(json, /data:image\//, "no embedded image bytes");
  assert.doesNotMatch(json, /[A-Za-z]:[\\/]/, "no Windows absolute path");
  assert.doesNotMatch(json, /"\/(home|Users|etc|var)\//, "no POSIX absolute path");
});

// ========================================================== asset validation

test("referenced assets are audited, and a missing one is reported not fatal", async () => {
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { meta: { background: "assets/background/classic_library_bg.png" } },
  });
  const ok = await sceneFile.auditSceneAssets(doc);
  assert.equal(ok.missing.length, 0);
  assert.ok(ok.checked >= 1);

  const broken = sceneFile.sanitizeSceneDocument({
    scene: { meta: { background: "assets/background/deleted_by_artist.png" } },
  });
  const report = await sceneFile.auditSceneAssets(broken);
  assert.deepEqual(report.missing, ["assets/background/deleted_by_artist.png"]);
  // The reference itself is untouched — a missing file never erases the value.
  assert.equal(broken.scene.meta.background, "assets/background/deleted_by_artist.png");
});

// ============================================================= atomic write

test("save writes the file and round-trips it losslessly", async () => {
  const target = als("round_trip.als");
  const source = await sceneFile.exportCurrentSceneDocument();
  const { document: written } = await sceneFile.writeSceneFile(target, source);
  const back = await sceneFile.readSceneFile(target);
  assert.deepEqual(back.document, written);
  assert.deepEqual(back.document.scene, source.scene, "nothing lost through disk");
});

test("the full CURRENT Classic Scene survives a round trip with every section intact", async () => {
  const target = als("classic_full.als");
  const source = await sceneFile.exportCurrentSceneDocument();
  // The real project data is non-trivial — a round trip of an empty document
  // would prove nothing. Cast placements, zones, slots and the role roster
  // come from data/scene-layout.json, which SHIPS: it is the Scene's layout
  // half, not per-user state (only Archives, the Default Scene pointer and
  // Recent Scenes are machine-local — see .gitignore). Asserting they are
  // non-empty is what catches a snapshot that dropped the layout file and so
  // renders the Classic Library with no Scholars.
  assert.ok(source.scene.props.length > 0, "the Classic Scene has prop instances");
  assert.ok(source.scene.objects.length > 0, "…and baked cast placements");
  assert.ok(source.scene.zones.length > 0, "…and zones");
  assert.ok(source.scene.characterSlots.length > 0, "…and character slots");
  assert.ok(source.scene.characterRoles.length > 0, "…and a role roster");
  assert.ok(source.scene.world?.locales?.en, "…and a world snapshot");
  assert.ok(source.scene.content?.tutorial, "…and its content selection");

  await sceneFile.writeSceneFile(target, source);
  const back = await sceneFile.readSceneFile(target);
  for (const key of ["meta", "objects", "props", "zones", "characterSlots", "characterRoles", "world", "content"]) {
    assert.deepEqual(back.document.scene[key], source.scene[key], `${key} must survive unchanged`);
  }
  assert.equal(back.assets.missing.length, 0, "the shipped Classic Scene has no missing assets");
});

test("a failed save leaves the previous file byte-identical", async () => {
  const target = als("atomic.als");
  const good = await sceneFile.exportCurrentSceneDocument();
  await sceneFile.writeSceneFile(target, good);
  const before = await fs.readFile(target, "utf8");

  // A path that cannot be written: the target is a directory.
  const dirTarget = path.join(scenesDir, "a_directory.als");
  await fs.mkdir(dirTarget, { recursive: true });
  await assert.rejects(() => sceneFile.writeSceneFile(dirTarget, good), /Could not save the scene/);

  // The unrelated good file is untouched...
  assert.equal(await fs.readFile(target, "utf8"), before);
  // ...and no temp file was left behind anywhere.
  const leftovers = (await fs.readdir(scenesDir)).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftovers, [], "temp files must always be cleaned up");
});

test("no temp file survives a successful save either", async () => {
  const target = als("clean.als");
  await sceneFile.writeSceneFile(target, await sceneFile.exportCurrentSceneDocument());
  const leftovers = (await fs.readdir(scenesDir)).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("the write is verified by re-reading what actually landed on disk", async () => {
  const src = await readSource("../src/services/sceneFile.js");
  const fn = src.slice(src.indexOf("export async function writeSceneFile"), src.indexOf("export async function readSceneFile"));
  assert.match(fn, /await fs\.writeFile\(temp,/);
  assert.match(fn, /JSON\.parse\(await fs\.readFile\(temp, "utf8"\)\)/);
  assert.match(fn, /validateEnvelope\(verify\)/);
  assert.match(fn, /await fs\.rename\(temp, target\)/);
  // The temp lives in the TARGET's directory, so the rename is same-volume.
  assert.match(fn, /const temp = path\.join\(dir,/);
});

// ======================================================== transactional load

test("an invalid file is rejected before any sanitizing happens", async () => {
  const src = await readSource("../src/services/sceneFile.js");
  const fn = src.slice(src.indexOf("export async function readSceneFile"), src.indexOf("export function blankSceneDocument"));
  // Envelope first, sanitize second — the order IS the transaction.
  assert.ok(
    fn.indexOf("validateEnvelope(raw)") < fn.indexOf("sanitizeSceneDocument(raw)"),
    "the envelope must be validated before the document is sanitized"
  );
});

test("reading a bad file throws and returns nothing partial", async () => {
  const bad = als("bad.als");
  await fs.writeFile(bad, "{ not json", "utf8");
  await assert.rejects(() => sceneFile.readSceneFile(bad), /not valid JSON/);

  await fs.writeFile(bad, JSON.stringify(envelope({ version: 7 })), "utf8");
  await assert.rejects(() => sceneFile.readSceneFile(bad), /newer version/);

  await fs.writeFile(bad, JSON.stringify({ format: "nope", version: 1 }), "utf8");
  await assert.rejects(() => sceneFile.readSceneFile(bad), /not an Aether Library Scene/);

  await assert.rejects(() => sceneFile.readSceneFile(als("never_existed.als")), /does not exist/);
});

// =========================================================== recent scenes

test("recent scenes are remembered most-recent-first, de-duplicated", async () => {
  const a = als("r1.als");
  const b = als("r2.als");
  await sceneFile.rememberRecentScene(a);
  await sceneFile.rememberRecentScene(b);
  await sceneFile.rememberRecentScene(a); // re-open the first
  const list = await sceneFile.loadRecentScenes();
  assert.deepEqual(list, [path.normalize(a), path.normalize(b)]);
});

test("an unavailable recent entry is marked, not silently dropped", async () => {
  const real = als("exists.als");
  await sceneFile.writeSceneFile(real, await sceneFile.exportCurrentSceneDocument());
  await sceneFile.rememberRecentScene(real);
  await sceneFile.rememberRecentScene(als("gone.als"));
  const listed = await sceneFile.listRecentScenes();
  const byName = Object.fromEntries(listed.map((e) => [e.name, e.available]));
  assert.equal(byName["exists.als"], true);
  assert.equal(byName["gone.als"], false, "a missing file is offered as unavailable");
  // ...and can be forgotten.
  const after = await sceneFile.forgetRecentScene(als("gone.als"));
  assert.ok(!after.some((p) => p.endsWith("gone.als")));
});

test("a malformed remembered path is forgotten rather than trusted", async () => {
  await fs.writeFile(
    authoringPath,
    JSON.stringify({ recentScenes: ["relative.als", "", 42, null, als("ok.als")] }),
    "utf8"
  );
  const list = await sceneFile.loadRecentScenes();
  assert.deepEqual(list, [path.normalize(als("ok.als"))]);
});

test("remembering never throws, even when the store cannot be written", async () => {
  const list = await sceneFile.rememberRecentScene("not-absolute.als");
  assert.ok(Array.isArray(list), "an invalid path is ignored, not fatal");
});

test("recent paths live in dev-only authoring storage, never in runtime data", async () => {
  const src = await readSource("../src/services/sceneFile.js");
  assert.match(src, /path\.join\(projectRoot, "data", "authoring\.json"\)/);
  // data/ contents are gitignored, so no recent path can be committed. The
  // rule ignores the CONTENTS (/data/*) rather than the directory, because
  // data/scene-layout.json is shipped Scene data and a negation cannot reach
  // inside an ignored directory. authoring.json is covered by no exception.
  const gitignore = await readSource("../.gitignore");
  assert.match(gitignore, /^\/data\/\*$/m);
  const exceptions = gitignore.match(/^!\/data\/.*$/gm) || [];
  assert.deepEqual(exceptions, ["!/data/scene-layout.json"], "only the layout file is un-ignored");
  // Not in publicConfig, and not in any always-on route.
  const config = await readSource("../src/config.js");
  assert.doesNotMatch(config, /recentScenes|authoring\.json/);
  const server = await readSource("../src/server.js");
  const publicRegion = server.slice(server.indexOf('app.get("/api/config"'));
  assert.doesNotMatch(publicRegion, /scene-file|recentScenes/, "no scene-file route outside the dev gate");
});

// =============================================== boundary: what is NOT in ALS

test("app-shell data never enters an .als", async () => {
  const doc = await sceneFile.exportCurrentSceneDocument();
  const json = JSON.stringify(doc);
  assert.doesNotMatch(json, /startMenuBackground/);
  assert.doesNotMatch(json, /start-menu/);
  // Nor can it be smuggled in.
  const smuggled = sceneFile.sanitizeSceneDocument({
    scene: { startMenuBackground: "assets/background/start-menu/start_menu.png", appShell: { a: 1 } },
  });
  assert.equal(smuggled.scene.startMenuBackground, undefined);
  assert.equal(smuggled.scene.appShell, undefined);
  // The service does not even import it.
  const src = await readSource("../src/services/sceneFile.js");
  assert.doesNotMatch(src, /appShell/);
});

test("product config never enters an .als", async () => {
  const doc = await sceneFile.exportCurrentSceneDocument();
  const json = JSON.stringify(doc);
  for (const key of ["copyright", "discord", "ko-fi", "aetherlibrary.app"]) {
    assert.ok(!json.includes(key), `${key} must not appear in a Scene file`);
  }
  const smuggled = sceneFile.sanitizeSceneDocument({
    scene: { links: { website: "https://evil.test" }, copyright: "hijack", learn: "evil" },
  });
  assert.equal(smuggled.scene.links, undefined);
  assert.equal(smuggled.scene.copyright, undefined);
  assert.equal(smuggled.scene.learn, undefined);
  const src = await readSource("../src/services/sceneFile.js");
  assert.doesNotMatch(src, /productConfig/);
});

test("Archives, Vault, settings and the Tutorial/Learn documents stay out", async () => {
  // Comments stripped: the header legitimately NAMES the Vault and Archives
  // to say they are excluded, and that explanation is the point.
  const src = (await readSource("../src/services/sceneFile.js")).replace(/\/\/[^\n]*/g, "");
  for (const forbidden of [/archives/i, /vault/i, /settings\.js/, /contentResources/]) {
    assert.doesNotMatch(src, forbidden, `sceneFile must not reach into ${forbidden}`);
  }
  // Only the tutorial SELECTION travels — an id, never the document.
  const doc = await sceneFile.exportCurrentSceneDocument();
  assert.deepEqual(Object.keys(doc.scene.content), ["tutorial"]);
  assert.equal(typeof doc.scene.content.tutorial, "string");
  assert.ok(!JSON.stringify(doc.scene.content).includes("steps"), "no tutorial body");
});

test("Start Menu Background is unaffected by any Scene operation", async () => {
  const shellPath = path.join(tmpRoot, "app-shell.json");
  await appShell.saveAppShell({ startMenuBackground: "assets/background/start-menu/start_menu.png" });
  const before = await fs.readFile(shellPath, "utf8");

  const target = als("shell_untouched.als");
  await sceneFile.writeSceneFile(target, await sceneFile.exportCurrentSceneDocument());
  await sceneFile.readSceneFile(target);
  sceneFile.blankSceneDocument();
  await sceneFile.rememberRecentScene(target);

  assert.equal(await fs.readFile(shellPath, "utf8"), before, "no Scene operation may touch the shell config");
  assert.equal((await appShell.loadAppShell()).startMenuBackground, "assets/background/start-menu/start_menu.png");
});

test("opening an .als writes NO runtime project file", async () => {
  const src = await readSource("../src/services/sceneFile.js");
  const readFn = src.slice(src.indexOf("export async function readSceneFile"), src.indexOf("export function blankSceneDocument"));
  assert.doesNotMatch(readFn, /writeFile|saveSceneLayout|saveSceneConfig|saveSceneContent/);
  // The whole module never calls the runtime savers.
  assert.doesNotMatch(src, /saveSceneLayout|saveSceneConfig|saveSceneContent/);
});

// ================================================================== the UI

// ============================================================== shortcuts

// ============================================================= dev-only

test("every Scene File route is dev-gated; production exposes none", async () => {
  const server = await readSource("../src/server.js");
  const gateAt = server.indexOf("if (config.devTools) {");
  const firstAlwaysOn = server.indexOf('app.get("/api/product"');
  for (const route of [
    'app.get("/api/dev/scene-file/new"',
    'app.get("/api/dev/scene-file/export"',
    'app.get("/api/dev/scene-file/open"',
    'app.post("/api/dev/scene-file/save"',
    'app.get("/api/dev/scene-file/recent"',
    'app.delete("/api/dev/scene-file/recent"',
  ]) {
    const at = server.indexOf(route);
    assert.ok(at > gateAt && at < firstAlwaysOn, `${route} must be inside the devTools gate`);
  }
  // No always-on route mentions scene files at all.
  assert.doesNotMatch(server.slice(firstAlwaysOn), /scene-file/);
});
