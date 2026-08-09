// Tests for F8 World Content Phase 1 — the world's DISPLAY identity layer.
//
// The point of this layer is that engine identity never moves: a Scholar is
// `alpha` forever, and a world only ever changes what `alpha` is CALLED. These
// cover the schema, the identity adapter, the runtime switch through the
// existing localization chokepoint, preset copy semantics, and the guarantee
// that nothing downstream keys on a display name.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let W;
let L;
let tmpRoot;
let worldPath;
let presetDir;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-world-"));
  worldPath = path.join(tmpRoot, "classic.world.json");
  presetDir = path.join(tmpRoot, "world-presets");
  process.env.WORLD_CONTENT_PATH = worldPath;
  process.env.WORLD_PRESET_DIR = presetDir;
  W = await import("../src/services/worldContent.js");
  L = await import("../src/localization.js");
});

after(async () => {
  delete process.env.WORLD_CONTENT_PATH;
  delete process.env.WORLD_PRESET_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(worldPath, { force: true });
  await fs.rm(presetDir, { recursive: true, force: true });
  L.setWorldIdentity(null); // every test starts from the built-in Classic names
});

// A fully renamed world — the Avalon case from the spec.
const AVALON = {
  version: 1,
  id: "avalon",
  displayName: { en: "Avalon", "zh-TW": "阿瓦隆" },
  identity: {
    grand_sage: { en: "Merlin", "zh-TW": "梅林" },
    alpha: { en: "Percival", "zh-TW": "天樞" },
    beta: { en: "Galahad", "zh-TW": "天璇" },
    gamma: { en: "Lancelot", "zh-TW": "天璣" },
  },
  library: { libraryName: "Camelot Archive", travelerName: "Seeker", traveler2Name: "" },
};

// ============================================================ ENGINE IDS

test("engine ids are permanent and never authored", () => {
  assert.deepEqual(W.ENGINE_PERSONA_IDS, ["grand_sage", "alpha", "beta", "gamma"]);
  assert.deepEqual(W.ENGINE_ID_BY_SLOT, { 1: "alpha", 2: "beta", 3: "gamma" });
  // The localization layer agrees — one namespace, not two.
  assert.deepEqual(L.PERSONA_IDS, W.ENGINE_PERSONA_IDS);
  for (const slot of [1, 2, 3]) assert.equal(L.personaIdForSlot(slot), W.ENGINE_ID_BY_SLOT[slot]);
});

test("a world cannot invent, rename or remove an engine id", () => {
  const out = W.sanitizeWorldContent({
    identity: {
      alpha: { en: "Percival" },
      delta: { en: "Intruder" },        // unknown engine id
      grand_sage: { en: "Merlin" },
    },
  });
  assert.deepEqual(Object.keys(out.identity).sort(), [...W.ENGINE_PERSONA_IDS].sort());
  assert.equal(out.identity.delta, undefined);
  assert.equal(out.identity.alpha.en, "Percival");
  // Untouched characters keep the Classic names, per locale.
  assert.equal(out.identity.beta.en, "Oracle");
  assert.equal(out.identity.gamma["zh-TW"], "理者");
  // A world that renames only English keeps the Classic Chinese name.
  assert.equal(out.identity.alpha["zh-TW"], "謀者");
});

// ============================================================== SCHEMA

test("default content is the Classic world", () => {
  const c = W.defaultWorldContent();
  assert.equal(c.id, "classic");
  assert.equal(c.identity.grand_sage.en, "Grand Sage");
  assert.equal(c.identity.alpha["zh-TW"], "謀者");
  assert.equal(c.library.libraryName, "Aether Library");
});

test("a missing or malformed world file falls back to Classic", async () => {
  assert.equal((await W.loadWorldContent()).id, "classic");
  await fs.mkdir(path.dirname(worldPath), { recursive: true });
  await fs.writeFile(worldPath, "{ not json", "utf8");
  const c = await W.loadWorldContent();
  assert.equal(c.identity.alpha.en, "Architect");
});

test("valid content round-trips and unknown fields are discarded", async () => {
  const saved = await W.saveWorldContent({ ...AVALON, secret: "nope", library: { ...AVALON.library, evil: 1 } });
  const loaded = await W.loadWorldContent();
  assert.deepEqual(loaded, saved);
  assert.equal(loaded.secret, undefined);
  assert.equal(loaded.library.evil, undefined);
  assert.equal(loaded.identity.alpha.en, "Percival");
  assert.deepEqual(Object.keys(loaded).sort(), ["customNames", "displayName", "id", "identity", "library", "version"]);
});

// =================================================== IDENTITY ADAPTER

test("worldIdentityPacks adapts engine ids to the identity-pack contract", () => {
  const packs = W.worldIdentityPacks(AVALON);
  assert.deepEqual(packs.en, { judge: "Merlin", scholars: { 1: "Percival", 2: "Galahad", 3: "Lancelot" } });
  assert.equal(packs["zh-TW"].judge, "梅林");
  assert.equal(packs["zh-TW"].scholars[1], "天樞");
});

// ============================================================ RUNTIME

test("World Content becomes the display-name source for the whole app", () => {
  assert.equal(L.identityFor("en").judge, "Grand Sage", "Classic before activation");
  L.setWorldIdentity(W.worldIdentityPacks(AVALON));
  // identityFor is the ONE chokepoint every consumer already reads.
  assert.equal(L.identityFor("en").judge, "Merlin");
  assert.equal(L.identityFor("en").scholars[1], "Percival");
  assert.equal(L.identityFor("zh-TW").scholars[3], "天璣");
});

test("the persona formatter consumes World Content, engine ids unchanged", () => {
  L.setWorldIdentity(W.worldIdentityPacks(AVALON));
  // Same engine id, different name — the formatter needs no change at all.
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "en", replyLanguage: "en" }), "Percival");
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "en" }), "天樞（Percival）");
  assert.equal(L.formatPersonaName("grand_sage", { interfaceLanguage: "en", replyLanguage: "zh-TW" }), "Merlin (梅林)");
  assert.equal(
    L.formatScholarNameList({ interfaceLanguage: "en", replyLanguage: "en" }),
    "Percival, Galahad, Lancelot"
  );
});

test("a partially authored world falls back per field, never to a blank name", () => {
  L.setWorldIdentity(W.worldIdentityPacks({ identity: { alpha: { en: "Percival" } } }));
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "en", replyLanguage: "en" }), "Percival");
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "zh-TW" }), "謀者");
  for (const id of W.ENGINE_PERSONA_IDS) {
    for (const locale of ["en", "zh-TW"]) {
      const name = L.formatPersonaName(id, { interfaceLanguage: locale, replyLanguage: locale });
      assert.ok(name && name.trim().length > 0, `${id}/${locale} must never be blank`);
      assert.ok(!name.includes("undefined"));
    }
  }
});

test("deactivating a world restores the built-in localization names", () => {
  L.setWorldIdentity(W.worldIdentityPacks(AVALON));
  assert.equal(L.identityFor("en").judge, "Merlin");
  L.setWorldIdentity(null);
  assert.equal(L.identityFor("en").judge, "Grand Sage");
  assert.equal(L.identityFor("zh-TW").scholars[1], "謀者");
});

test("no runtime lookup depends on a localized display string", () => {
  L.setWorldIdentity(W.worldIdentityPacks(AVALON));
  // The slot -> id mapping is unchanged by any rename…
  assert.equal(L.personaIdForSlot(1), "alpha");
  // …and resolving by engine id still works in a fully renamed world.
  assert.equal(L.personaName("alpha", "en"), "Percival");
  // A DISPLAY name is never a valid lookup key.
  assert.equal(L.enginePersonaId("Percival"), null);
  assert.equal(L.personaName("Percival", "en"), "");
});

// ============================================================= PRESETS

test("world presets are copy-based with no live reference", async () => {
  await W.saveWorldPreset("avalon", AVALON);
  const first = await W.getWorldPreset("avalon");
  first.identity.alpha.en = "MUTATED";
  first.library.libraryName = "MUTATED";
  const again = await W.getWorldPreset("avalon");
  assert.equal(again.identity.alpha.en, "Percival", "the stored preset is untouched");
  assert.equal(again.library.libraryName, "Camelot Archive");
});

test("an existing world preset is never silently overwritten", async () => {
  await W.saveWorldPreset("avalon", AVALON);
  await assert.rejects(
    () => W.saveWorldPreset("avalon", { identity: { alpha: { en: "Clobber" } } }),
    (err) => {
      assert.equal(err.status, 409);
      return true;
    }
  );
  assert.equal((await W.getWorldPreset("avalon")).identity.alpha.en, "Percival");
  // …but an explicit overwrite works.
  await W.saveWorldPreset("avalon", { identity: { alpha: { en: "Bors" } } }, { overwrite: true });
  assert.equal((await W.getWorldPreset("avalon")).identity.alpha.en, "Bors");
});

test("editing the current world never overwrites another preset", async () => {
  await W.saveWorldPreset("avalon", AVALON);
  await W.saveWorldContent({ identity: { alpha: { en: "Scene-only name" } } });
  const preset = await W.getWorldPreset("avalon");
  const current = await W.loadWorldContent();
  assert.equal(preset.identity.alpha.en, "Percival", "the preset is untouched");
  assert.equal(current.identity.alpha.en, "Scene-only name");
});

test("preset ids reject traversal and anything not filename-safe", async () => {
  for (const bad of ["../escape", "/abs", "a/b", "UPPER", "", ".hidden"]) {
    assert.equal(W.isValidWorldPresetId(bad), false, `${bad} must be rejected`);
  }
  await assert.rejects(() => W.saveWorldPreset("../escape", AVALON), /preset id/i);
  assert.equal(await W.getWorldPreset("../escape"), null);
});

test("presets list with their display names", async () => {
  await W.saveWorldPreset("classic", W.defaultWorldContent());
  await W.saveWorldPreset("avalon", AVALON);
  const ids = (await W.listWorldPresets()).map((p) => p.id);
  assert.deepEqual(ids.sort(), ["avalon", "classic"]);
  const avalon = (await W.listWorldPresets()).find((p) => p.id === "avalon");
  assert.equal(avalon.displayName, "Avalon");
});

// ======================================================= RUNTIME VIEW

test("the runtime view exposes display identity and no filesystem path", () => {
  const runtime = W.runtimeWorld(AVALON);
  assert.deepEqual(Object.keys(runtime).sort(), ["customNames", "displayName", "id", "identity", "library", "version"]);
  const json = JSON.stringify(runtime);
  for (const leak of [tmpRoot, "assets/", "C:", "/home/", "node_modules"]) {
    assert.ok(!json.includes(leak), `runtime payload leaked ${leak}`);
  }
});

// ============================================ SESSION / ARCHIVE SHAPE

test("session and archive identity snapshots are structurally unchanged", async () => {
  // The Session snapshot is { language, judge, scholars{1,2,3} } — a world
  // changes the VALUES, never the shape, so archives keep reading as before.
  L.setWorldIdentity(W.worldIdentityPacks(AVALON));
  const identity = L.identityFor("en");
  const snapshot = { language: "en", ...identity };
  assert.deepEqual(Object.keys(snapshot).sort(), ["judge", "language", "scholars"]);
  assert.deepEqual(Object.keys(snapshot.scholars).sort(), ["1", "2", "3"]);
  assert.equal(snapshot.judge, "Merlin");
  assert.equal(snapshot.scholars[2], "Galahad");
});

// ============================================== CLIENT / SERVER SOURCE

const serverJs = (await fs.readFile(path.join(process.cwd(), "src", "server.js"), "utf8")).replace(/\r\n/g, "\n");
const layoutJs = (await fs.readFile(path.join(process.cwd(), "src", "services", "sceneLayout.js"), "utf8")).replace(/\r\n/g, "\n");

test("world write routes are dev-only; the runtime read route is not", () => {
  const devBlock = serverJs.indexOf("if (config.devTools) {");
  const runtimeRoute = serverJs.indexOf('app.get("/api/world"');
  for (const route of ['app.post("/api/dev/world"', 'app.post("/api/dev/world-presets/:id"']) {
    const at = serverJs.indexOf(route);
    assert.ok(at > devBlock && at < runtimeRoute, `${route} must be inside the devTools gate`);
  }
  assert.ok(runtimeRoute > 0);
  assert.doesNotMatch(serverJs, /app\.post\("\/api\/world"/, "no write route outside the gate");
  // The identity is activated once at boot through the single chokepoint —
  // and it is sourced from the SCENE's own world snapshot, not from a world
  // or preset file. Boot activates the identity AND the Custom Name
  // overrides in one call.
  assert.match(
    serverJs,
    /loadSceneLayout\(\)\n\s*\.then\(\(layout\) => \{\n\s*setWorldIdentity\(sceneWorldIdentityPacks\(layout\.world\), layout\.world\.customNames\);/
  );
  // Saving the WORLD TEMPLATE must not re-point the running identity: a
  // Scene that already copied a world is immune to later template edits.
  const worldPost = serverJs.indexOf('app.post("/api/dev/world"');
  const worldPostBody = serverJs.slice(worldPost, serverJs.indexOf("app.get(", worldPost));
  assert.doesNotMatch(worldPostBody, /setWorldIdentity/);
});

test("the Scene references a world by id only — it never duplicates World Content", () => {
  // sceneMeta already carries worldId; that reference is all the scene stores.
  assert.match(layoutJs, /worldId: typeof m\.worldId === "string" \? m\.worldId\.trim\(\) : "",/);
  // Scene layout may (and does) contain ENGINE ids — `grand_sage`,
  // `scholar_alpha`, the character-role ids. What it must never contain is a
  // DISPLAY name, which is the thing a world owns.
  assert.match(layoutJs, /"grand_sage"/, "engine role ids are expected here");
  for (const displayName of ["Grand Sage", "Architect", "Oracle", "Analyst", "謀者", "墨者", "理者", "大智者"]) {
    assert.ok(!layoutJs.includes(displayName), `scene layout must not carry the display name "${displayName}"`);
  }
  assert.doesNotMatch(layoutJs, /identity:/, "scene layout carries no identity block");
  assert.doesNotMatch(layoutJs, /displayName/, "scene layout carries no display names");
});
