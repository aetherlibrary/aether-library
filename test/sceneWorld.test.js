// Tests for the SCENE-OWNED World snapshot.
//
// The architectural claim being defended here: a World Preset is a reusable
// TEMPLATE, and the Scene is the largest authored/runtime unit. Loading a
// preset deep-COPIES it into the Scene; from that moment the runtime reads
// the Scene and never the preset file again. So the tests below check
// ownership and independence, not just field round-tripping:
//
//   - a Scene authored before the snapshot existed migrates in memory, and
//     its file is NOT rewritten until the user saves;
//   - editing a preset cannot change a Scene that already copied it, and
//     editing a Scene cannot change the preset;
//   - the locale set comes from the DATA, so a new language is a data change;
//   - theme values can only ever be literal hex, never CSS text.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let sceneLayout;
let W;
let tmpRoot;
let layoutPath;
let worldPath;
let presetDir;

const readLayoutFile = async () => JSON.parse(await fs.readFile(layoutPath, "utf8"));

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-scene-world-"));
  layoutPath = path.join(tmpRoot, "scene-layout.json");
  worldPath = path.join(tmpRoot, "classic.world.json");
  presetDir = path.join(tmpRoot, "world-presets");
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.SCENE_LAYOUT_PATH = layoutPath;
  process.env.WORLD_CONTENT_PATH = worldPath;
  process.env.WORLD_PRESET_DIR = presetDir;
  await fs.mkdir(presetDir, { recursive: true });
  W = await import("../src/services/worldContent.js");
  sceneLayout = await import("../src/services/sceneLayout.js");
});

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// --------------------------------------------------------- engine identity

test("the seven Scene-World character ids are permanent, and map onto the Character Role Roster", () => {
  assert.deepEqual(W.SCENE_WORLD_PERSONA_IDS, [
    "grand_sage",
    "alpha",
    "beta",
    "gamma",
    "traveler1",
    "traveler2",
    "pet",
  ]);
  // The roster spells two of them differently; this adapter is the ONE place
  // the two vocabularies meet.
  assert.equal(W.characterRoleForSceneWorldId("grand_sage"), "sage");
  assert.equal(W.characterRoleForSceneWorldId("traveler1"), "traveler");
  assert.equal(W.characterRoleForSceneWorldId("alpha"), "alpha");
  // traveler2 is a naming slot only — it has no Role yet, and inventing one
  // here would silently add a character to every Scene.
  assert.equal(W.characterRoleForSceneWorldId("traveler2"), null);
  assert.equal(W.characterRoleForSceneWorldId("not_a_character"), null);
  // Every id the roster does define must resolve to a real roster role.
  const rosterIds = new Set(sceneLayout.DEFAULT_CHARACTER_ROLES.map((r) => r.roleId));
  for (const id of W.SCENE_WORLD_PERSONA_IDS) {
    const role = W.characterRoleForSceneWorldId(id);
    if (role !== null) assert.ok(rosterIds.has(role), `${id} -> ${role} is not a Character Role`);
  }
});

// ------------------------------------------------------------- the snapshot

test("an empty Scene and a round-tripped Scene are the same document", () => {
  const base = W.defaultSceneWorld();
  // If these ever diverge, dirty-tracking reports a change the user never
  // made — the editor would show "Modified" the moment the tab opens.
  assert.deepEqual(W.sanitizeSceneWorld(null), base);
  assert.deepEqual(W.sanitizeSceneWorld(base), base);
  assert.deepEqual(W.sanitizeSceneWorld(W.sanitizeSceneWorld(base)), base);
});

test("custom names are the final display name, and junk never reaches the snapshot", () => {
  const w = W.sanitizeSceneWorld({
    customNames: {
      grand_sage: "  Professor   Oak  ",
      alpha: "老師",
      beta: "https://evil.test",
      gamma: "12345",
      traveler1: "a@b.com",
      pet: "R2-D2",
      not_a_character: "ignored",
    },
  });
  assert.equal(w.customNames.grand_sage, "Professor Oak");
  assert.equal(w.customNames.alpha, "老師");
  assert.equal(w.customNames.pet, "R2-D2");
  // Links, addresses and letterless strings are not names.
  assert.equal(w.customNames.beta, "");
  assert.equal(w.customNames.gamma, "");
  assert.equal(w.customNames.traveler1, "");
  // Driven by the canonical key list, so an unknown key cannot survive.
  assert.deepEqual(Object.keys(w.customNames), W.CUSTOM_NAME_KEYS);
});

test("the locale set comes from the data: a new language survives, and a dropped one stays dropped", () => {
  const withJa = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { alpha: "Architect" }, libraryName: "Aether Library" },
      ja: { identity: { alpha: "アルファ" }, worldDisplayName: "図書館" },
    },
  });
  assert.deepEqual(Object.keys(withJa.locales).sort(), ["en", "ja"]);
  assert.equal(withJa.locales.ja.identity.alpha, "アルファ");
  // An unauthored name STAYS empty in storage — "not translated yet" is a
  // fact about the Scene, and materializing the fallback would erase it.
  assert.equal(withJa.locales.ja.identity.beta, "");
  // It falls back at RESOLUTION time instead, which is where the chain lives.
  assert.equal(W.resolveSceneIdentity(withJa, "ja", "beta"), "Oracle");

  // An authored locale set is authoritative — the seed set is never merged
  // back in, or a deliberately removed language would keep reappearing.
  const englishOnly = W.sanitizeSceneWorld({ locales: { en: { identity: { alpha: "Solo" } } } });
  assert.deepEqual(Object.keys(englishOnly.locales), ["en"]);

  // English always survives: identity can never resolve to nothing.
  const noEnglish = W.sanitizeSceneWorld({ locales: { ja: { identity: { alpha: "アルファ" } } } });
  assert.ok(noEnglish.locales.en, "English must always be present");
  // A malformed locale tag is not a language.
  assert.deepEqual(Object.keys(W.sanitizeSceneWorld({ locales: { "../etc": {} } }).locales).sort(), [
    "en",
    "zh-TW",
  ]);
});

test("identity packs for the localization layer are built from the Scene, per locale", () => {
  const w = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { grand_sage: "Merlin", alpha: "Arthur", beta: "Morgan", gamma: "Kay" } },
      ja: { identity: { grand_sage: "賢者" } },
    },
  });
  const packs = W.sceneWorldIdentityPacks(w);
  assert.equal(packs.en.judge, "Merlin");
  assert.deepEqual(packs.en.scholars, { 1: "Arthur", 2: "Morgan", 3: "Kay" });
  assert.equal(packs.ja.judge, "賢者");
});

// -------------------------------------------------------------------- theme

test("theme values may only ever be literal hex — never CSS text", () => {
  for (const bad of ["var(--ws-bg)", "url(evil.png)", "red", "rgb(0,0,0)", "#12345", "#GGGGGG", "", null]) {
    assert.equal(W.sanitizeThemeColor(bad), "", `${bad} must not be accepted as a color`);
  }
  for (const good of ["#fff", "#FFFF", "#221A12", "#c0954c24"]) {
    assert.equal(W.sanitizeThemeColor(good), good.toLowerCase());
  }
});

test("theme: every token exists in both modes, and an invalid value falls back within its OWN mode", () => {
  const t = W.sanitizeTheme({ defaultMode: "sideways", dark: { surface: "url(x)" }, light: { surface: "#010203" } });
  assert.equal(t.defaultMode, "dark", "an unknown mode is not a mode");
  const classic = W.defaultTheme();
  // Dark's bad value falls back to DARK's default, never to light's.
  assert.equal(t.dark.surface, classic.dark.surface);
  assert.notEqual(t.dark.surface, t.light.surface);
  assert.equal(t.light.surface, "#010203");
  for (const mode of W.THEME_MODES) {
    assert.deepEqual(Object.keys(t[mode]).sort(), Object.keys(W.THEME_TOKENS).sort());
  }
  // Every token maps onto the --ws-* vocabulary style.css already consumes.
  for (const cssVar of Object.values(W.THEME_TOKENS)) assert.match(cssVar, /^--ws-[a-z-]+$/);
});

// -------------------------------------------------------------------- audio

test("audio is configuration only: ids never paths, volume clamped", () => {
  assert.equal(W.sanitizeAudioTrack("library_ambient"), "library_ambient");
  for (const bad of ["../../etc/passwd", "/abs/track.mp3", "https://x.test/a.mp3", "a b", ""]) {
    assert.equal(W.sanitizeAudioTrack(bad), "", `${bad} must not resolve to a track`);
  }
  assert.equal(W.sanitizeAudio({ volume: 5 }).volume, 1);
  assert.equal(W.sanitizeAudio({ volume: -3 }).volume, 0);
  assert.equal(W.sanitizeAudio({ volume: "loud" }).volume, 0.35);
  assert.deepEqual(W.sanitizeAudio(null), { musicTrack: "", volume: 0.35, loop: true, autoplay: false });
});

// ------------------------------------------------------- preset independence

test("Load Preset is a COPY: the Scene and the preset cannot alter each other", async () => {
  await fs.writeFile(
    path.join(presetDir, "avalon.json"),
    JSON.stringify({
      version: 1,
      id: "avalon",
      displayName: { en: "Avalon", "zh-TW": "阿瓦隆" },
      identity: {
        grand_sage: { en: "Merlin", "zh-TW": "梅林" },
        alpha: { en: "Arthur", "zh-TW": "亞瑟" },
        beta: { en: "Morgan", "zh-TW": "摩根" },
        gamma: { en: "Kay", "zh-TW": "凱" },
      },
      library: { libraryName: "Camelot", travelerName: "Squire", traveler2Name: "" },
      customNames: {},
    }),
    "utf8"
  );

  const preset = await W.getWorldPreset("avalon");
  const sceneWorld = W.sceneWorldFromPreset(preset);
  assert.equal(sceneWorld.presetSource, "avalon", "provenance is recorded");
  assert.equal(sceneWorld.locales.en.identity.alpha, "Arthur");
  assert.equal(sceneWorld.locales["zh-TW"].identity.alpha, "亞瑟");
  assert.equal(sceneWorld.locales.en.libraryName, "Camelot");
  assert.equal(sceneWorld.locales.en.identity.traveler1, "Squire");

  // Editing the Scene's copy must not reach back into the preset object...
  sceneWorld.locales.en.identity.alpha = "Lancelot";
  assert.equal(preset.identity.alpha.en, "Arthur");
  // ...and the preset FILE is likewise untouched.
  const onDisk = await W.getWorldPreset("avalon");
  assert.equal(onDisk.identity.alpha.en, "Arthur");

  // And a later preset edit cannot reach a Scene that already copied it.
  await W.saveWorldPreset("avalon", { ...preset, identity: { ...preset.identity, alpha: { en: "Galahad" } } }, { overwrite: true });
  assert.equal(sceneWorld.locales.en.identity.alpha, "Lancelot");
});

test("Save as New Preset converts the Scene back to a template — lossy, and deliberately so", () => {
  const w = W.sanitizeSceneWorld({
    locales: {
      en: {
        identity: { alpha: "Merlin", traveler1: "Squire", traveler2: "Page", pet: "Owl" },
        libraryName: "Camelot",
        worldDisplayName: "Avalon",
      },
    },
    theme: { dark: { surface: "#010203" } },
  });
  const preset = W.sceneWorldToPreset(w, "avalon");
  assert.equal(preset.id, "avalon");
  assert.equal(preset.identity.alpha.en, "Merlin");
  assert.equal(preset.library.libraryName, "Camelot");
  assert.equal(preset.library.travelerName, "Squire");
  assert.equal(preset.displayName.en, "Avalon");
  // The template schema carries no theme or audio: the Scene owns those, and
  // silently inventing preset fields for them would recreate the very silo
  // this change removes.
  assert.equal(preset.theme, undefined);
  assert.equal(preset.audio, undefined);
});

// -------------------------------------------------- Scene persistence + migration

test("the Scene layout document carries the world, and round-trips it", async () => {
  const saved = await sceneLayout.saveSceneLayout({
    version: 2,
    objects: [],
    zones: [],
    world: {
      presetSource: "avalon",
      customNames: { alpha: "Professor" },
      locales: { en: { identity: { alpha: "Arthur" }, libraryName: "Camelot", worldDisplayName: "Avalon" } },
      theme: { defaultMode: "light", light: { surface: "#010203" } },
      audio: { musicTrack: "camelot", volume: 0.5 },
    },
  });
  assert.equal(saved.world.presetSource, "avalon");
  assert.equal(saved.world.customNames.alpha, "Professor");
  assert.equal(saved.world.theme.defaultMode, "light");
  assert.equal(saved.world.audio.musicTrack, "camelot");

  const loaded = await sceneLayout.loadSceneLayout();
  assert.deepEqual(loaded.world, saved.world);
  // The world is a sibling of sceneMeta inside ONE Scene document — not a
  // second file, which is the whole point.
  const onDisk = await readLayoutFile();
  assert.ok(onDisk.world && onDisk.sceneMeta, "world and sceneMeta live in the same document");
});

test("a Scene authored before the snapshot migrates in memory — and its file is not rewritten", async () => {
  // The world file is what the pre-Phase-1 runtime actually displayed, so it
  // is what a legacy Scene must inherit.
  await fs.writeFile(
    worldPath,
    JSON.stringify({
      version: 1,
      id: "classic",
      displayName: { en: "Classic", "zh-TW": "經典圖書館" },
      identity: { alpha: { en: "Authored Alpha", "zh-TW": "作者甲" } },
      library: { libraryName: "The Old Library" },
    }),
    "utf8"
  );
  const legacy = { version: 2, objects: [], zones: [], characterSlots: [], sceneMeta: { worldId: "" } };
  await fs.writeFile(layoutPath, JSON.stringify(legacy), "utf8");

  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.world.locales.en.identity.alpha, "Authored Alpha");
  assert.equal(loaded.world.locales["zh-TW"].identity.alpha, "作者甲");
  assert.equal(loaded.world.locales.en.libraryName, "The Old Library");
  assert.equal(loaded.world.presetSource, "classic");

  // NOTHING was written: an unsaved legacy Scene keeps working exactly as
  // before, and a failed migration cannot corrupt it.
  const stillOnDisk = await readLayoutFile();
  assert.equal("world" in stillOnDisk, false, "migration must not rewrite the Scene file");

  // The migration becomes permanent only when the Scene is saved.
  await sceneLayout.saveSceneLayout(loaded);
  assert.equal((await readLayoutFile()).world.locales.en.identity.alpha, "Authored Alpha");
});

test("migration falls back to the Classic defaults rather than failing the load", async () => {
  await fs.writeFile(worldPath, "{ not json", "utf8");
  await fs.writeFile(
    layoutPath,
    JSON.stringify({ version: 2, objects: [], zones: [], sceneMeta: { worldId: "no_such_world" } }),
    "utf8"
  );
  const loaded = await sceneLayout.loadSceneLayout();
  assert.equal(loaded.world.locales.en.identity.alpha, "Architect", "a broken world must not break the Scene");
  assert.deepEqual(loaded.world, W.defaultSceneWorld());
});

// ------------------------------------------------------------ source shape
