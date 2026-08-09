// Default Scene — the ALS the runtime loads on startup.
//
// THE GAP THIS CLOSES: opening an .als rewrote BROWSER state only, so a refresh
// always returned to the project's three runtime files. These tests pin the two
// properties that make the feature trustworthy:
//
//   1. Default Scene is NOT Current File. New/Open/Save/Save As/Recent must
//      never change it — only an explicit Select.
//   2. A broken Default Scene degrades to the previous behaviour and is NEVER
//      silently cleared.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "aether-default-scene-"));
process.env.RUNTIME_SCENE_CONFIG_PATH = path.join(scratch, "runtime-scene.json");

const runtimeScene = await import("../src/services/runtimeScene.js");
const sceneFile = await import("../src/services/sceneFile.js");

const {
  sanitizeRuntimeSceneConfig,
  defaultRuntimeSceneConfig,
  loadRuntimeSceneConfig,
  setDefaultScene,
  clearDefaultScene,
  resolveRuntimeScene,
  describeDefaultScene,
  RUNTIME_SCENE_CONFIG_PATH,
} = runtimeScene;

after(() => fs.rm(scratch, { recursive: true, force: true }));
beforeEach(() => fs.rm(RUNTIME_SCENE_CONFIG_PATH, { force: true }));

// A complete, valid ALS covering every section the format carries, so the
// "full contents restore" tests are testing something real.
function fullSceneDocument() {
  return sceneFile.sanitizeSceneDocument({
    format: "aether-library-scene",
    version: 1,
    scene: {
      meta: { name: "classic_02", width: 1920, height: 1080, background: "assets/background/classic_library_bg.png", gridSize: 24 },
      objects: [{ id: "podium", world: { x: 0.5, y: 0.6 }, width: 0.18, renderLayer: 2 }],
      props: [{ instance_id: "shelf_09", asset_uid: "asset_shelf_u1", x: 400, y: 700, scale: 1.25, z: 3 }],
      zones: [{ id: "zone-1", type: "blocked", shape: "rect", rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
      // Slot x/y are scene PIXELS snapped to grid points, not fractions.
      characterSlots: [{ slotId: "slot_a", enabled: true, x: 480, y: 816 }],
      characterRoles: [{ roleId: "alpha", label: "ALPHA", order: 1 }],
      world: { customNames: { alpha: "Second Architect" } },
      lights: [
        { id: "l1", type: "directional", angle: 45, intensity: 0.8, castShadows: true, shadowLength: 0.2 },
        { id: "l2", type: "point", x: 0.3, y: 0.4, radius: 0.25 },
      ],
      lightBlockers: [{ id: "b1", shape: "rect", rect: { x: 0.4, y: 0.35, w: 0.2, h: 0.15 }, opacity: 0.9 }],
      content: { tutorial: "default" },
    },
  });
}

async function writeAls(name, doc) {
  const target = path.join(scratch, name);
  await fs.writeFile(target, `${JSON.stringify(doc ?? fullSceneDocument(), null, 2)}\n`, "utf8");
  return target;
}

// ============================================================ configuration

test("the config document holds a path and nothing else", () => {
  const clean = sanitizeRuntimeSceneConfig({
    defaultScenePath: "D:\\scenes\\a.als",
    // Everything a caller might try to smuggle in alongside it:
    scene: { objects: [1, 2, 3] },
    objects: [],
    lights: [],
    startMenuBackground: "assets/background/start-menu/x.png",
    version: 99,
  });
  assert.deepEqual(Object.keys(clean).sort(), ["defaultScenePath", "version"]);
  assert.equal(clean.version, 1, "the version is ours, not the caller's");
  assert.equal(clean.scene, undefined);
  assert.equal(clean.lights, undefined);
});

test("an unusable stored path degrades to none instead of throwing", () => {
  for (const bad of [undefined, null, "", 42, [], {}, "relative/path.als", "C:\\scenes\\map.json", "  "]) {
    assert.equal(sanitizeRuntimeSceneConfig({ defaultScenePath: bad }).defaultScenePath, "", String(bad));
  }
  assert.deepEqual(sanitizeRuntimeSceneConfig(null), defaultRuntimeSceneConfig());
  assert.deepEqual(sanitizeRuntimeSceneConfig([1, 2]), defaultRuntimeSceneConfig());
});

test("a missing or corrupt config file is not a startup failure", async () => {
  assert.deepEqual(await loadRuntimeSceneConfig(), defaultRuntimeSceneConfig());
  await fs.writeFile(RUNTIME_SCENE_CONFIG_PATH, "{ not json", "utf8");
  assert.deepEqual(await loadRuntimeSceneConfig(), defaultRuntimeSceneConfig());
});

// ================================================================== select

test("selecting a valid ALS stores it and persists across reloads", async () => {
  const als = await writeAls("classic_02.als");
  const saved = await setDefaultScene(als);
  assert.equal(saved.defaultScenePath, path.normalize(als));
  // Persisted, not just in memory — this is the whole point of the feature.
  const onDisk = JSON.parse(await fs.readFile(RUNTIME_SCENE_CONFIG_PATH, "utf8"));
  assert.equal(onDisk.defaultScenePath, path.normalize(als));
  assert.deepEqual(await loadRuntimeSceneConfig(), saved);
});

test("a non-.als file is rejected and nothing is stored", async () => {
  const notAls = path.join(scratch, "scene.json");
  await fs.writeFile(notAls, JSON.stringify(fullSceneDocument()), "utf8");
  await assert.rejects(() => setDefaultScene(notAls), /must end in \.als/);
  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, "");
});

test("an invalid ALS is rejected — bad JSON, wrong format, no version", async () => {
  const badJson = path.join(scratch, "bad.als");
  await fs.writeFile(badJson, "{{{", "utf8");
  await assert.rejects(() => setDefaultScene(badJson), /not valid JSON/);

  const wrongFormat = await writeAls("wrong.als", { format: "something-else", version: 1, scene: {} });
  await assert.rejects(() => setDefaultScene(wrongFormat), /not an Aether Library Scene/);

  const noVersion = await writeAls("nover.als", { format: "aether-library-scene", scene: {} });
  await assert.rejects(() => setDefaultScene(noVersion), /no valid version/);

  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, "", "nothing was stored");
});

test("an unsupported FUTURE version is rejected, not partially loaded", async () => {
  const future = await writeAls("v99.als", { format: "aether-library-scene", version: 99, scene: {} });
  await assert.rejects(() => setDefaultScene(future), /newer version of Aether Library/);
  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, "");
});

test("a missing file is rejected at selection time", async () => {
  await assert.rejects(
    () => setDefaultScene(path.join(scratch, "nope.als")),
    /does not exist/
  );
  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, "");
});

test("Clear removes the pointer and leaves the ALS on disk untouched", async () => {
  const als = await writeAls("classic_02.als");
  const before = await fs.readFile(als, "utf8");
  await setDefaultScene(als);
  const cleared = await clearDefaultScene();
  assert.equal(cleared.defaultScenePath, "");
  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, "");
  assert.equal(await fs.readFile(als, "utf8"), before, "Clear must not touch the Scene file");
});

// ================================================================ resolution

test("with no Default Scene the runtime is the project's own files", async () => {
  const resolved = await resolveRuntimeScene();
  assert.equal(resolved.source, "fallback");
  assert.equal(resolved.defaultScenePath, "");
  assert.equal(resolved.warning, "");
  // Identical to what the routes served before this feature existed.
  const { loadSceneLayout } = await import("../src/services/sceneLayout.js");
  assert.deepEqual(resolved.layout, await loadSceneLayout());
});

test("a configured Default Scene becomes the runtime Scene", async () => {
  const als = await writeAls("classic_02.als");
  await setDefaultScene(als);
  const resolved = await resolveRuntimeScene();
  assert.equal(resolved.source, "default-scene");
  assert.equal(resolved.defaultScenePath, path.normalize(als));
  assert.equal(resolved.layout.sceneMeta.name, "classic_02");
  assert.equal(resolved.layout.sceneMeta.gridSize, 24);
});

test("the FULL authored Scene restores — every ALS section", async () => {
  await setDefaultScene(await writeAls("classic_02.als"));
  const { layout, config, content } = await resolveRuntimeScene();
  assert.equal(layout.sceneMeta.background, "assets/background/classic_library_bg.png");
  assert.equal(layout.objects.find((o) => o.id === "podium")?.width, 0.18);
  assert.equal(layout.objects.find((o) => o.id === "podium")?.renderLayer, 2);
  assert.equal(config.objects.find((o) => o.instance_id === "shelf_09")?.scale, 1.25);
  assert.equal(config.objects.find((o) => o.instance_id === "shelf_09")?.asset_uid, "asset_shelf_u1");
  assert.equal(layout.zones.find((z) => z.id === "zone-1")?.type, "blocked");
  // x/y is the authoritative pair (scene px); gridX/gridY are derived from it
  // by the slot migration, so this asserts what the ALS actually carries.
  const slot = layout.characterSlots.find((s) => s.slotId === "slot_a");
  assert.equal(slot?.x, 480);
  assert.equal(slot?.y, 816);
  assert.equal(slot?.enabled, true);
  assert.equal(layout.characterRoles.find((r) => r.roleId === "alpha")?.label, "ALPHA");
  assert.equal(layout.world.customNames.alpha, "Second Architect");
  assert.equal(content.content.tutorial, "default");
});

test("Light and Light Blocker data survive the round trip intact", async () => {
  await setDefaultScene(await writeAls("classic_02.als"));
  const { layout } = await resolveRuntimeScene();
  const dir = layout.lights.find((l) => l.id === "l1");
  const point = layout.lights.find((l) => l.id === "l2");
  assert.equal(dir.type, "directional");
  assert.equal(dir.angle, 45);
  assert.equal(dir.castShadows, true);
  assert.equal(dir.shadowLength, 0.2);
  assert.equal(point.type, "point");
  assert.equal(point.radius, 0.25);
  const blocker = layout.lightBlockers.find((b) => b.id === "b1");
  assert.equal(blocker.shape, "rect");
  assert.equal(blocker.opacity, 0.9);
  assert.deepEqual(blocker.rect, { x: 0.4, y: 0.35, w: 0.2, h: 0.15 });
});

test("resolution is the exact inverse of the ALS export path", async () => {
  // sceneDocumentToRuntime must undo sanitizeSceneDocument's composition, or a
  // saved Scene would not be the Scene that loads.
  const doc = fullSceneDocument();
  const { layout, config, content } = sceneFile.sceneDocumentToRuntime(doc);
  const round = sceneFile.sanitizeSceneDocument({
    scene: {
      meta: layout.sceneMeta,
      objects: layout.objects,
      props: config.objects,
      zones: layout.zones,
      characterSlots: layout.characterSlots,
      characterRoles: layout.characterRoles,
      world: layout.world,
      lights: layout.lights,
      lightBlockers: layout.lightBlockers,
      content: content.content,
    },
  });
  assert.deepEqual(round, doc);
});

// ========================================================= failure handling

test("a Default Scene deleted after selection falls back and warns", async () => {
  const als = await writeAls("gone.als");
  await setDefaultScene(als);
  await fs.rm(als);

  const resolved = await resolveRuntimeScene();
  assert.equal(resolved.source, "fallback", "startup survives");
  assert.match(resolved.warning, /does not exist/);
  // THE POINT: the path is kept so the author can repair or Clear it.
  assert.equal(resolved.defaultScenePath, path.normalize(als));
  assert.equal((await loadRuntimeSceneConfig()).defaultScenePath, path.normalize(als));
  // And the fallback really is the previous runtime Scene.
  const { loadSceneLayout } = await import("../src/services/sceneLayout.js");
  assert.deepEqual(resolved.layout, await loadSceneLayout());
});

test("a Default Scene corrupted after selection falls back and warns", async () => {
  const als = await writeAls("corrupt.als");
  await setDefaultScene(als);
  await fs.writeFile(als, "not json at all", "utf8");
  const resolved = await resolveRuntimeScene();
  assert.equal(resolved.source, "fallback");
  assert.match(resolved.warning, /not valid JSON/);
  assert.equal(resolved.defaultScenePath, path.normalize(als), "never silently cleared");
});

test("an ALS upgraded to a future version after selection falls back", async () => {
  const als = await writeAls("upgraded.als");
  await setDefaultScene(als);
  await fs.writeFile(als, JSON.stringify({ format: "aether-library-scene", version: 42, scene: {} }), "utf8");
  const resolved = await resolveRuntimeScene();
  assert.equal(resolved.source, "fallback");
  assert.match(resolved.warning, /newer version/);
  assert.equal(resolved.defaultScenePath, path.normalize(als));
});

// ============================================ the Current File coupling

test("describeDefaultScene reports whether the runtime ACTUALLY loaded it", async () => {
  const als = await writeAls("classic_02.als");
  await setDefaultScene(als);
  const ok = await describeDefaultScene();
  assert.equal(ok.activeSource, "default-scene", "safe for F8 to adopt as Current File");
  assert.equal(ok.name, "classic_02.als");
  assert.equal(ok.warning, "");

  // Break it: the editor must NOT adopt a path whose contents are not loaded,
  // or Save would overwrite a good .als with fallback content.
  await fs.rm(als);
  const broken = await describeDefaultScene();
  assert.equal(broken.activeSource, "fallback");
  assert.equal(broken.path, path.normalize(als), "still shown, so it can be repaired");
  assert.ok(broken.warning);
});

// =============================================== ownership boundaries

test("Default Scene is stored in no other document", async () => {
  const als = await writeAls("classic_02.als");
  await setDefaultScene(als);

  // Not in the ALS itself.
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { defaultScenePath: als, meta: { defaultScenePath: als } },
  });
  assert.equal(doc.scene.defaultScenePath, undefined);
  assert.equal(doc.scene.meta.defaultScenePath, undefined);

  // Not in the Scene Layout.
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const layout = sanitizeLayout({ defaultScenePath: als, defaultScene: als });
  assert.equal(layout.defaultScenePath, undefined);
  assert.equal(layout.defaultScene, undefined);

  // Not in App Shell — which must be entirely unchanged by this feature.
  const appShell = await import("../src/services/appShell.js");
  const shell = appShell.sanitizeAppShell({ defaultScenePath: als });
  assert.deepEqual(Object.keys(shell).sort(), [
    "startMenuBackground", "startMenuIcon", "startMenuIconScale", "startMenuIconX", "startMenuIconY",
    "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY", "version",
  ]);
  assert.equal(shell.defaultScenePath, undefined, "Default Scene is not App Shell data");
});

test("product.json stays read-only — no write export was added", async () => {
  const src = (await fs.readFile(new URL("../src/services/productConfig.js", import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /export\s+(async\s+)?function\s+save/);
  assert.doesNotMatch(src, /writeFile/);
});

test("the config lives in gitignored data/, because the path is machine-local", async () => {
  const svc = await fs.readFile(new URL("../src/services/runtimeScene.js", import.meta.url), "utf8");
  assert.match(svc, /path\.join\(projectRoot, "data", "runtime-scene\.json"\)/);
  assert.match(svc, /process\.env\.RUNTIME_SCENE_CONFIG_PATH/, "overridable for test isolation");
  const gitignore = await fs.readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(gitignore, /^\/data\/\*$/m, "data/ contents must stay gitignored");
  // The one exception is the shipped layout half. runtime-scene.json holds an
  // absolute machine-local path and must never be among the exceptions.
  const exceptions = gitignore.match(/^!\/data\/.*$/gm) || [];
  assert.deepEqual(exceptions, ["!/data/scene-layout.json"]);
  assert.ok(!exceptions.some((e) => e.includes("runtime-scene")), "the Default Scene pointer stays local");
});

test("no second Scene loader was introduced", async () => {
  const svc = (await fs.readFile(new URL("../src/services/runtimeScene.js", import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\/\/[^\n]*/g, "");
  // It composes existing services; it parses and validates nothing itself.
  assert.match(svc, /readSceneFile/);
  assert.match(svc, /sceneDocumentToRuntime/);
  assert.doesNotMatch(svc, /JSON\.parse\(await fs\.readFile\(.*als/i);
  assert.doesNotMatch(svc, /function sanitize(Layout|SceneConfig|SceneContent)\b/);
});
