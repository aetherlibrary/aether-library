// Tests for Tutorial content OWNERSHIP.
//
// The tutorial's copy lived in three places at once — the locale packs, a
// third English copy in app.js's EN_FALLBACK, and an authored JSON whose
// title/body fields were all empty strings. Because tutorialText() treats ""
// as "not authored", the JSON never won a single field, and every displayed
// string came from the locale packs. Editing the JSON through F8 did nothing.
//
// The fix is DATA, not code: assets/content/tutorial/default.json now carries
// the copy, so it wins on every field. The fallback chain is deliberately
// unchanged and stays as a safety layer —
//
//     authored JSON  ->  locale pack  ->  EN_FALLBACK  ->  ""
//
// — which is why these tests check both halves: that authored text wins, and
// that a blanked field still falls back rather than rendering empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { sanitizeTutorial } from "../src/services/contentResources.js";
import enPack from "../src/locales/en.js";
import zhPack from "../src/locales/zh-TW.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const tutorialJson = async () => JSON.parse(await readSource("../assets/content/tutorial/default.json"));

// The canonical step order — index N maps onto tutorialStep(N+1)*.
const STEP_IDS = [
  "settings",
  "ai-config",
  "vault",
  "core-object",
  "mode",
  "scholars",
  "attachments",
  "composer",
  "discussion-workspace",
  "save-to-vault",
  "privacy-more",
];

// ------------------------------------------------------- the authored file

test("every enabled step authors a title and body in both locales", async () => {
  const doc = await tutorialJson();
  assert.deepEqual(doc.steps.map((s) => s.id), STEP_IDS, "step order is canonical");
  for (const step of doc.steps) {
    if (step.enabled === false) continue;
    for (const field of ["title", "body"]) {
      for (const locale of ["en", "zh-TW"]) {
        const value = step[field]?.[locale];
        assert.equal(typeof value, "string", `${step.id}.${field}.${locale} must be a string`);
        assert.ok(value.trim().length > 0, `${step.id}.${field}.${locale} must not be blank`);
      }
    }
  }
});

test("the authored copy matches the locale packs exactly — one transcription, not a rewrite", async () => {
  const doc = await tutorialJson();
  const en = enPack.strings;
  const zh = zhPack.strings;
  doc.steps.forEach((step, i) => {
    const n = i + 1;
    assert.equal(step.title.en, en[`tutorialStep${n}Title`], `${step.id} title.en`);
    assert.equal(step.body.en, en[`tutorialStep${n}Body`], `${step.id} body.en`);
    assert.equal(step.title["zh-TW"], zh[`tutorialStep${n}Title`], `${step.id} title.zh-TW`);
    assert.equal(step.body["zh-TW"], zh[`tutorialStep${n}Body`], `${step.id} body.zh-TW`);
  });
});

test("the authored copy survives the server sanitizer unchanged", async () => {
  const raw = await tutorialJson();
  const clean = sanitizeTutorial(raw, "default");
  assert.equal(clean.steps.length, raw.steps.length);
  clean.steps.forEach((step, i) => {
    const source = raw.steps[i];
    assert.equal(step.id, source.id);
    for (const field of ["title", "body"]) {
      for (const locale of ["en", "zh-TW"]) {
        assert.equal(step[field][locale], source[field][locale], `${step.id}.${field}.${locale} altered in transit`);
      }
    }
  });
});

// ------------------------------------------------------ the fallback chain

test("the fallback chain is intact — authored, then locale pack, then EN", async () => {
  const appJs = await readSource("../public/app.js");
  // The resolver still tries the authored field first and only then the
  // built-in key for that step.
  assert.match(
    appJs,
    /function tutorialText\(step, field\) \{\s*const authored = sceneUiText\(step\?\.\[field\]\);\s*if \(authored\) return authored;\s*const keys = TUTORIAL_DEFAULT_TEXT\[step\?\.id\];/
  );
  // The safety layers are all still present.
  assert.match(appJs, /const TUTORIAL_DEFAULT_TEXT = \{/);
  for (let n = 1; n <= 10; n++) {
    assert.match(appJs, new RegExp(`tutorialStep${n}Title: "`), `EN_FALLBACK tutorialStep${n}Title`);
    assert.match(appJs, new RegExp(`tutorialStep${n}Body:`), `EN_FALLBACK tutorialStep${n}Body`);
  }
  // ...and in both locale packs.
  for (const pack of [enPack.strings, zhPack.strings]) {
    for (let n = 1; n <= 10; n++) {
      assert.ok(pack[`tutorialStep${n}Title`], `locale tutorialStep${n}Title`);
      assert.ok(pack[`tutorialStep${n}Body`], `locale tutorialStep${n}Body`);
    }
  }
});

// The resolver's own rule, reproduced exactly, so the precedence can be
// exercised without a DOM. Mirrors sceneUiText() + tutorialText() in app.js.
function resolve(step, field, { locale = "en", pack, fallback }) {
  const map = step?.[field];
  let authored = "";
  if (map && typeof map === "object") {
    const requested = typeof map[locale] === "string" ? map[locale].trim() : "";
    authored = requested || (typeof map.en === "string" ? map.en.trim() : "");
  }
  if (authored) return authored;
  const n = STEP_IDS.indexOf(step?.id) + 1;
  const key = n > 0 ? `tutorialStep${n}${field === "title" ? "Title" : "Body"}` : "";
  return pack?.[key] ?? fallback?.[key] ?? "";
}

test("authored JSON text wins over the locale fallback", async () => {
  const doc = await tutorialJson();
  const step = { ...doc.steps[0], title: { en: "AUTHORED TITLE", "zh-TW": "作者標題" } };
  assert.equal(resolve(step, "title", { locale: "en", pack: enPack.strings }), "AUTHORED TITLE");
  assert.equal(resolve(step, "title", { locale: "zh-TW", pack: zhPack.strings }), "作者標題");
  // And with the real file, the authored value is what renders — not the pack.
  for (const [i, s] of doc.steps.entries()) {
    assert.equal(resolve(s, "title", { locale: "en", pack: enPack.strings }), s.title.en, `${s.id} renders its own title`);
    assert.equal(resolve(s, "body", { locale: "zh-TW", pack: zhPack.strings }), s.body["zh-TW"], `${s.id} renders its own body`);
    assert.equal(i + 1 > 0, true);
  }
});

test("a blanked authored field still falls back — the safety layer works", () => {
  const blank = { id: "settings", title: { en: "", "zh-TW": "" }, body: { en: "", "zh-TW": "" } };
  assert.equal(resolve(blank, "title", { locale: "en", pack: enPack.strings }), enPack.strings.tutorialStep1Title);
  assert.equal(resolve(blank, "title", { locale: "zh-TW", pack: zhPack.strings }), zhPack.strings.tutorialStep1Title);
  // Whitespace-only is treated as blank too, not as authored content.
  const spaces = { id: "settings", title: { en: "   ", "zh-TW": "  " } };
  assert.equal(resolve(spaces, "title", { locale: "en", pack: enPack.strings }), enPack.strings.tutorialStep1Title);
  // A missing map entirely, and a missing step object.
  assert.equal(resolve({ id: "settings" }, "body", { locale: "en", pack: enPack.strings }), enPack.strings.tutorialStep1Body);
  assert.equal(resolve(undefined, "title", { locale: "en", pack: enPack.strings }), "");
});

test("a locale authored in English only falls back to English, not to the pack", async () => {
  // sceneUiText's second step: the requested locale, then the authored en.
  const enOnly = { id: "vault", title: { en: "English only", "zh-TW": "" } };
  assert.equal(resolve(enOnly, "title", { locale: "zh-TW", pack: zhPack.strings }), "English only");
});

test("the EN_FALLBACK layer answers when the locale pack cannot", () => {
  const blank = { id: "settings", title: { en: "", "zh-TW": "" } };
  // No pack at all (config.strings missing) — EN_FALLBACK is the last resort.
  const fallback = { tutorialStep1Title: "Settings" };
  assert.equal(resolve(blank, "title", { locale: "en", pack: undefined, fallback }), "Settings");
  // Nothing anywhere resolves to "", never to a raw key name.
  assert.equal(resolve(blank, "title", { locale: "en", pack: {}, fallback: {} }), "");
});

// -------------------------------------------------------------- no regress

// ------------------------------------------------------------------- Learn

test("Learn has no duplicated-source problem — its JSON is already authoritative", async () => {
  const learn = JSON.parse(await readSource("../assets/content/learn/default.json"));
  // Every section in every locale carries real content, so nothing falls back.
  for (const [locale, sections] of Object.entries(learn.locales)) {
    assert.ok(Array.isArray(sections) && sections.length > 0, `${locale} has sections`);
    for (const section of sections) {
      assert.ok((section.title || "").trim().length > 0, `${locale}/${section.id} has a title`);
      assert.ok((section.blocks || []).length > 0, `${locale}/${section.id} has blocks`);
    }
  }
  // The only learn* locale keys are dialog CHROME, not content — there is no
  // per-section fallback map equivalent to TUTORIAL_DEFAULT_TEXT.
  const learnKeys = Object.keys(enPack.strings).filter((k) => /^learn[A-Z]/.test(k));
  assert.deepEqual(learnKeys.sort(), ["learnClose", "learnTitle"]);
  const appJs = await readSource("../public/app.js");
  assert.doesNotMatch(appJs, /LEARN_DEFAULT_TEXT|learnSection\d+Title/);
  // The renderer prints authored text directly, with no fallback branch.
  const render = appJs.slice(appJs.indexOf("function renderLearnContent("), appJs.indexOf("function renderLearn()"));
  assert.match(render, /h\.textContent = section\.title;/);
  assert.doesNotMatch(render, /str\(/, "Learn content must not read locale keys");
});

// ------------------------------------------- the fallback must not drift
//
// The chain at the top of this file only helps if EN_FALLBACK actually
// mirrors the canonical English copy. The structural check above proves the
// KEYS exist; it never compared the VALUES — which is how a stale
// "The Core Book" title and a "Settings" label left over from the
// Settings/AI Config split survived in the SHIPPED fallback long after the
// locale pack had moved on. EN_FALLBACK is user-facing whenever /api/config
// cannot be read, so that drift was visible product copy, not dead code.
//
// SCOPE: tutorialStep<N>Title/Body only. The rest of EN_FALLBACK mirrors
// strings owned by other surfaces and is deliberately NOT coupled here.

const fallbackTutorialStrings = async () => {
  const app = await readSource("../public/app.js");
  const open = app.indexOf("const EN_FALLBACK = {");
  assert.ok(open > 0, "EN_FALLBACK still exists");
  const block = app.slice(open, app.indexOf("\n};", open));
  const out = {};
  for (const m of block.matchAll(/\b(tutorialStep\d+(?:Title|Body))\b:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)) {
    out[m[1]] = JSON.parse(`"${m[2]}"`);
  }
  return out;
};

test("EN_FALLBACK's tutorial copy matches the canonical English pack exactly", async () => {
  const fallback = await fallbackTutorialStrings();
  const keys = Object.keys(fallback);
  assert.ok(keys.length > 0, "the fallback still carries tutorial copy");
  for (const key of keys) {
    assert.equal(
      fallback[key],
      enPack.strings[key],
      `EN_FALLBACK.${key} has drifted from src/locales/en.js — re-transcribe it`
    );
  }
});

test("every authored step is mirrored in EN_FALLBACK, and no orphans remain", async () => {
  const doc = await tutorialJson();
  const fallback = await fallbackTutorialStrings();
  // Adding a step without mirroring it fails here rather than shipping blank.
  doc.steps.forEach((step, i) => {
    const n = i + 1;
    for (const [field, key] of [["title", `tutorialStep${n}Title`], ["body", `tutorialStep${n}Body`]]) {
      assert.ok(key in fallback, `${step.id}: ${key} is missing from EN_FALLBACK`);
      // Closes the whole chain: authored JSON === locale pack === fallback.
      assert.equal(fallback[key], step[field].en, `${step.id}: ${key} does not match the authored copy`);
    }
  });
  // Removing a step must not leave a fallback entry pointing at nothing.
  for (const key of Object.keys(fallback)) {
    const n = Number(key.match(/\d+/)[0]);
    assert.ok(n <= doc.steps.length, `EN_FALLBACK.${key} refers to a step that no longer exists`);
  }
});
