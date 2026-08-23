// Default Reply Language — the fresh-install default, and what an existing
// user's saved value migrates to.
//
// THE ORIGINAL BUG THIS PINS: config.js derived the reply-language fallback
// from DEFAULT_LANGUAGE, the constant that also answers "what does an UNKNOWN
// language id fall back to" for identity packs. That constant is "zh-TW", so
// every fresh installation silently defaulted to Traditional Chinese replies
// while the interface itself was detected from the system locale — a new
// English-speaking user got an English UI and Chinese answers.
//
// THE SECOND BUG, fixed here: separating the constants made the fresh-install
// default a fixed "en", which is still a guess about a user nobody has asked.
// It is now MATCH_QUESTION_LANGUAGE — follow whatever language the question
// was asked in. See replyLanguageContract.test.js for what that does to the
// prompts; this file is about the VALUE and its migration.
//
// What must not change: the default applies ONLY when nothing was ever
// configured. Anyone who saved a preference — or carries the legacy
// DISPLAY_LANGUAGE key — keeps it exactly.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_LANGUAGE, DEFAULT_REPLY_LANGUAGE, MATCH_QUESTION_LANGUAGE } from "../src/localization.js";

let configModule;
let tmpDir;
let envPath;

before(async () => {
  // An EMPTY env file, so these tests can never read the developer's real
  // .env.local — which has a saved preference and would mask the default.
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-reply-lang-"));
  envPath = path.join(tmpDir, ".env.local");
  await fs.writeFile(envPath, "", "utf8");
  process.env.ENV_FILE_PATH = envPath;
  configModule = await import("../src/config.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.DEFAULT_REPLY_LANGUAGE;
  delete process.env.DISPLAY_LANGUAGE;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.DEFAULT_REPLY_LANGUAGE;
  delete process.env.DISPLAY_LANGUAGE;
});

const reload = () => {
  configModule.reloadConfig();
  return configModule.config;
};

// ============================================================ the constants

test("the reply default and the locale fallback are separate constants", () => {
  assert.equal(MATCH_QUESTION_LANGUAGE, "match");
  assert.equal(DEFAULT_REPLY_LANGUAGE, MATCH_QUESTION_LANGUAGE, "a fresh install follows the question");
  // Unchanged on purpose: DEFAULT_LANGUAGE still answers a different question
  // (what an unknown language id resolves to), and this fix deliberately did
  // not widen into identity packs or response-language naming.
  assert.equal(DEFAULT_LANGUAGE, "zh-TW");
  assert.notEqual(DEFAULT_REPLY_LANGUAGE, DEFAULT_LANGUAGE, "sharing one value is what caused the original bug");
  // Match is a POLICY, not a locale — it must never be mistaken for one.
  assert.notEqual(MATCH_QUESTION_LANGUAGE, "en");
  assert.notEqual(MATCH_QUESTION_LANGUAGE, "zh-TW");
});

// ========================================================== a fresh install

// REQUIREMENT 1: no saved reply-language preference -> Match Question Language.
test("a fresh install matches the question's language", () => {
  const cfg = reload();
  assert.equal(cfg.defaultReplyLanguage, MATCH_QUESTION_LANGUAGE);
});

// ================================================= an existing user's choice

// REQUIREMENTS 2 and 3: an explicit saved language is never migrated to Match.
test("a saved preference is kept, in either language — never migrated to Match", () => {
  for (const saved of ["zh-TW", "en"]) {
    process.env.DEFAULT_REPLY_LANGUAGE = saved;
    const resolved = reload().defaultReplyLanguage;
    assert.equal(resolved, saved, `${saved} must survive`);
    assert.notEqual(resolved, MATCH_QUESTION_LANGUAGE, `${saved} must not be silently turned into Match`);
    delete process.env.DEFAULT_REPLY_LANGUAGE;
  }
});

test("the legacy DISPLAY_LANGUAGE key still carries an older install's choice", () => {
  // The rename must not silently switch a long-time user to the new default.
  process.env.DISPLAY_LANGUAGE = "zh-TW";
  assert.equal(reload().defaultReplyLanguage, "zh-TW");
});

test("the current key wins over the legacy one", () => {
  process.env.DISPLAY_LANGUAGE = "zh-TW";
  process.env.DEFAULT_REPLY_LANGUAGE = "en";
  assert.equal(reload().defaultReplyLanguage, "en");
});

// REQUIREMENT 17: the new value round-trips like any other.
test("an explicitly saved Match round-trips as Match", () => {
  process.env.DEFAULT_REPLY_LANGUAGE = MATCH_QUESTION_LANGUAGE;
  assert.equal(reload().defaultReplyLanguage, MATCH_QUESTION_LANGUAGE);
});

// WHY AN EXISTING MACHINE LEGITIMATELY CONTAINS `en`.
//
// Verified on a real M2 Mac: Aether opened with Default Reply Language =
// English rather than Match. That machine had saved Settings BEFORE the Match
// migration existed, and the old dialog made that unavoidable — the reply
// language rode along in the UNCONDITIONAL settings payload
// (`defaultReplyLanguage: sx.lang.value`, beside interfaceLanguage and theme),
// while the dropdown itself defaulted to `currentConfig.defaultReplyLanguage
// || "en"`. So changing only a theme wrote DEFAULT_REPLY_LANGUAGE=en to disk.
//
// On disk that is indistinguishable from a deliberate choice. Keeping it is
// the correct, non-destructive resolution of an ambiguity the data cannot
// settle — this test exists so that "English on an upgraded machine" is
// recognised as expected migration behaviour, not rediscovered as a bug.
test("a pre-migration install carries an auto-written `en`, and keeps it", async () => {
  const { saveSettings } = await import("../src/services/settings.js");

  // Nothing configured yet: the new default applies.
  assert.equal(reload().defaultReplyLanguage, MATCH_QUESTION_LANGUAGE);

  // Exactly what the OLD dialog sent when the user changed only the theme.
  saveSettings({ theme: "light", defaultReplyLanguage: "en" });

  const written = await fs.readFile(envPath, "utf8");
  assert.match(written, /^DEFAULT_REPLY_LANGUAGE=en$/m, "an unrelated save wrote a concrete language");

  // And that value is honoured from then on, never quietly upgraded to Match.
  assert.equal(reload().defaultReplyLanguage, "en");

  // Reset the shared temp env file for the tests that follow.
  await fs.writeFile(envPath, "", "utf8");
});

test("the default applies only when NOTHING was configured", async () => {
  const src = (await fs.readFile(new URL("../src/config.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  // Three tiers, in this order: current key, legacy key, then the default.
  assert.match(
    src,
    /config\.defaultReplyLanguage = env\("DEFAULT_REPLY_LANGUAGE", env\("DISPLAY_LANGUAGE", DEFAULT_REPLY_LANGUAGE\)\);/
  );
  // The locale fallback must not be what a user is opted into any more.
  assert.doesNotMatch(src, /env\("DISPLAY_LANGUAGE", DEFAULT_LANGUAGE\)/);
  // ABSENCE is the only thing that becomes Match. Nothing may rewrite a value
  // that is already on disk — a migration that mapped "en" to Match would be
  // taking away a preference the user is living with.
  const codeOnly = src.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /defaultReplyLanguage\s*===?\s*"en"/, "no rewrite of a saved English preference");
  assert.doesNotMatch(codeOnly, /defaultReplyLanguage\s*=\s*MATCH_QUESTION_LANGUAGE/, "Match is reached by fallback only");
});

// ============================================== interface language untouched

test("interface language is unaffected — still detected, never tied to replies", async () => {
  const src = (await fs.readFile(new URL("../src/config.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  // Its own key, its own fallback (system detection), independent of replies.
  assert.match(src, /const rawInterfaceLanguage = env\("INTERFACE_LANGUAGE"\);/);
  assert.match(src, /: detectSystemLanguage\(\);/);
  assert.doesNotMatch(src, /interfaceLanguage = .*DEFAULT_REPLY_LANGUAGE/);
  // And the two remain separate values on the resolved config.
  const cfg = reload();
  assert.equal(typeof cfg.interfaceLanguage, "string");
  assert.equal(cfg.defaultReplyLanguage, MATCH_QUESTION_LANGUAGE);
});

test("the shipped .env.example documents the Match default", async () => {
  const example = (await fs.readFile(new URL("../.env.example", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(example, /^DEFAULT_REPLY_LANGUAGE=match$/m, "a copied template must not opt users into a fixed language");
  assert.doesNotMatch(example, /^DISPLAY_LANGUAGE=zh-TW$/m, "the stale legacy line is gone");
  // All three choices are documented, so the file explains the option rather
  // than just naming a value.
  for (const value of ["match", "en", "zh-TW"]) {
    assert.match(example, new RegExp(`^#\\s+${value}\\s+\\|`, "m"), `${value} is not documented`);
  }
});
