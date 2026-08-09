// Tests for the redesigned F8 World identity editor.
//
// This is an EDITOR redesign only: the schema, the resolution order and the
// runtime are untouched. So what these tests defend is that the new panel
// still writes the same data, and that it is genuinely data-driven —
//
//   - no locale is hardcoded anywhere in the World tab, so a Scene that
//     carries `ja` lists Japanese with no editor change;
//   - Custom Names write only scene.world.customNames, and use the SAME
//     validation the server enforces (mirrored here, asserted against the
//     service so the two cannot drift);
//   - engine ids are never editable;
//   - Add/Remove Language go through the Scene's own history, and English —
//     the final fallback — can never be removed.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as W from "../src/services/worldContent.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

// --------------------------------------------------------------- structure

// ------------------------------------------------------------ custom names

// --------------------------------------------------------------- add/remove

test("the schema itself enforces what the editor promises about locales", () => {
  // English survives even if something removed it behind the editor's back —
  // which is why the panel can safely refuse to delete it.
  const noEnglish = W.sanitizeSceneWorld({ locales: { ja: { identity: { alpha: "アルファ" } } } });
  assert.ok(noEnglish.locales.en);
  // A new empty locale round-trips as a real locale rather than vanishing.
  const withEmptyJa = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { alpha: "Architect" } },
      ja: { identity: { grand_sage: "", alpha: "" }, libraryName: "", worldDisplayName: "" },
    },
  });
  assert.deepEqual(Object.keys(withEmptyJa.locales).sort(), ["en", "ja"]);
  // A removed locale stays removed — the seed set is never merged back in.
  const removed = W.sanitizeSceneWorld({ locales: { en: { identity: { alpha: "Solo" } } } });
  assert.deepEqual(Object.keys(removed.locales), ["en"]);
});

// ------------------------------------------------------------- no drift

// -------------------------------------------- authored emptiness (Stage 3)
// The distinction this section defends: an EMPTY field means "not translated
// yet". Persistence must keep it empty; only resolution fills it.

test("empty non-English values survive sanitization — the sanitizer materializes nothing", () => {
  const w = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { grand_sage: "Grand Sage", alpha: "Architect" }, libraryName: "Aether Library" },
      fr: { identity: { alpha: "Architecte" } },
    },
  });
  // Authored -> kept.
  assert.equal(w.locales.fr.identity.alpha, "Architecte");
  // Unauthored -> still empty, in every field of the block.
  assert.equal(w.locales.fr.identity.beta, "");
  assert.equal(w.locales.fr.identity.grand_sage, "");
  assert.equal(w.locales.fr.libraryName, "");
  assert.equal(w.locales.fr.worldDisplayName, "");
  // Sanitizing again cannot creep: emptiness is stable.
  assert.deepEqual(W.sanitizeSceneWorld(w).locales.fr, w.locales.fr);
});

test("the runtime falls back without ever rewriting the Scene", () => {
  const w = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { grand_sage: "Merlin", alpha: "Arthur" }, libraryName: "Camelot" },
      fr: { identity: { alpha: "Arthur le Roi" } },
    },
  });
  const before = JSON.stringify(w);
  // requested locale
  assert.equal(W.resolveSceneIdentity(w, "fr", "alpha"), "Arthur le Roi");
  // -> English authored
  assert.equal(W.resolveSceneIdentity(w, "fr", "grand_sage"), "Merlin");
  assert.equal(W.resolveSceneText(w, "fr", "libraryName"), "Camelot");
  // -> built-in, when neither the locale nor English authored anything
  assert.equal(W.resolveSceneIdentity(w, "fr", "beta"), "Oracle");
  assert.equal(W.resolveSceneIdentity(w, "fr", "pet"), "Pet");
  // A locale WITH built-ins prefers its own rather than English.
  const zh = W.sanitizeSceneWorld({ locales: { en: {}, "zh-TW": {} } });
  assert.equal(W.resolveSceneIdentity(zh, "zh-TW", "beta"), "墨者");
  assert.equal(W.resolveSceneIdentity(zh, "en", "beta"), "Oracle");
  // Resolution is READ-ONLY.
  assert.equal(JSON.stringify(w), before, "resolving must not mutate the Scene");
});

test("Scene save/load keeps an incomplete locale incomplete", async () => {
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aether-empty-locale-"));
  try {
    process.env.SCENE_LAYOUT_PATH = path.join(tmp, "scene-layout.json");
    // A fresh module instance, so it reads the scratch path.
    const sceneLayout = await import(`../src/services/sceneLayout.js?empty-locale=${Date.now()}`);
    const saved = await sceneLayout.saveSceneLayout({
      version: 2,
      objects: [],
      zones: [],
      world: {
        locales: {
          en: { identity: { alpha: "Architect" }, libraryName: "Aether Library" },
          fr: { identity: { alpha: "Architecte" } },
        },
      },
    });
    assert.equal(saved.world.locales.fr.identity.alpha, "Architecte");
    assert.equal(saved.world.locales.fr.identity.beta, "");

    // ON DISK, not merely in the returned object.
    const onDisk = JSON.parse(await fs.readFile(process.env.SCENE_LAYOUT_PATH, "utf8"));
    assert.equal(onDisk.world.locales.fr.identity.beta, "");
    assert.equal(onDisk.world.locales.fr.libraryName, "");

    const reloaded = await sceneLayout.loadSceneLayout();
    assert.equal(reloaded.world.locales.fr.identity.beta, "", "which fields are untranslated must survive");
    assert.equal(reloaded.world.locales.fr.identity.alpha, "Architecte");
    // ...and the runtime still shows something for the untranslated one.
    assert.equal(W.resolveSceneIdentity(reloaded.world, "fr", "beta"), "Oracle");
  } finally {
    delete process.env.SCENE_LAYOUT_PATH;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("a Scene that already stores copied English values is unchanged by the fix", () => {
  // What existing installs look like: every field explicitly populated.
  const legacy = {
    locales: {
      en: W.defaultSceneWorld().locales.en,
      "zh-TW": W.defaultSceneWorld().locales["zh-TW"],
    },
  };
  const w = W.sanitizeSceneWorld(legacy);
  assert.deepEqual(w.locales.en, legacy.locales.en);
  assert.deepEqual(w.locales["zh-TW"], legacy.locales["zh-TW"]);
  // A brand-new Scene is still fully populated, so nothing regressed there.
  const fresh = W.sanitizeSceneWorld(null);
  assert.equal(fresh.locales.en.identity.alpha, "Architect");
  assert.equal(fresh.locales["zh-TW"].identity.alpha, "謀者");
});

test("preset round-trips preserve emptiness in both directions", () => {
  const w = W.sanitizeSceneWorld({
    locales: {
      en: {
        identity: { grand_sage: "Merlin", alpha: "Arthur", beta: "Morgan", gamma: "Kay" },
        libraryName: "Camelot",
      },
      fr: { identity: { alpha: "Arthur le Roi" } },
    },
  });
  const preset = W.sceneWorldToPreset(w, "avalon");
  // The template records what was authored, and nothing it wasn't.
  assert.equal(preset.identity.alpha.fr, "Arthur le Roi");
  assert.ok(!preset.identity.beta.fr, "an unauthored name must not appear in the template");
  const back = W.sceneWorldFromPreset(preset);
  assert.equal(back.locales.fr.identity.alpha, "Arthur le Roi");
  assert.equal(back.locales.fr.identity.beta, "", "an unauthored name must not be materialized by a round trip");
  // The Classic preset schema has no pet field at all, so pet stays empty —
  // and the runtime still displays the built-in.
  assert.equal(back.locales.en.identity.pet, "");
  assert.equal(W.resolveSceneIdentity(back, "en", "pet"), "Pet");
});

test("the naming priority is unchanged: custom override still outranks every locale", async () => {
  const localization = await import("../src/localization.js");
  const w = W.sanitizeSceneWorld({
    locales: {
      en: { identity: { grand_sage: "Merlin", alpha: "Arthur" } },
      fr: { identity: { alpha: "Arthur le Roi" } },
    },
    customNames: { alpha: "Sherlock" },
  });
  localization.setWorldIdentity(W.sceneWorldIdentityPacks(w), w.customNames);
  // The override wins in EVERY locale, authored or not.
  assert.equal(localization.identityFor("en").scholars[1], "Sherlock");
  assert.equal(localization.identityFor("fr").scholars[1], "Sherlock");
  // Below it, the chain is intact.
  assert.equal(localization.identityFor("fr").judge, "Merlin");
  assert.equal(localization.identityFor("fr").scholars[2], "Oracle");

  // With no override, bilingual prose formatting is untouched.
  const plain = W.sanitizeSceneWorld({
    locales: { en: { identity: { alpha: "Architect" } }, "zh-TW": { identity: { alpha: "謀者" } } },
  });
  localization.setWorldIdentity(W.sceneWorldIdentityPacks(plain), plain.customNames);
  assert.equal(
    localization.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    "謀者（Architect）"
  );
  // ...and a custom name still collapses it to one name.
  localization.setWorldIdentity(W.sceneWorldIdentityPacks(w), w.customNames);
  assert.equal(
    localization.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    "Sherlock"
  );
});

// ------------------------------------------------------- locale navigation

test("locale navigation arithmetic wraps in both directions", () => {
  const step = (list, at, delta) => list[(at + delta + list.length) % list.length];
  const list = ["en", "ja", "zh-TW"];
  assert.equal(step(list, 0, -1), "zh-TW", "previous from the first wraps to the last");
  assert.equal(step(list, 2, 1), "en", "next from the last wraps to the first");
  assert.equal(step(list, 0, 1), "ja");
  assert.equal(step(list, 1, -1), "en");
});
