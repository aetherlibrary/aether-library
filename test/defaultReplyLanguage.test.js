// Default Reply Language resolution — the language EVERY AI response defaults
// to (Scholars, the Grand Sage, Mentor, follow-ups; see services/council.js
// and services/sessionChat.js, which read config.defaultReplyLanguage to build
// the system prompt).
//
// THE REGRESSION THIS GUARDS. The final fallback used to be DEFAULT_LANGUAGE
// ("zh-TW"), the locale/identity fallback — a different question sharing one
// constant. A fresh install therefore instructed every Scholar and the Grand
// Sage to answer in Traditional Chinese before the user had chosen anything,
// and no frontend default could correct it: the server resolves this value
// before the browser ever sees it, so publicConfig() already carried "zh-TW".
//
// The fix separated the constants and changed ONLY the last step of the chain.
// That last step is now MATCH — follow the question — because pinning a fresh
// install to any one language is a guess about a user nobody has asked yet.
// The priority order is the contract:
//
//   DEFAULT_REPLY_LANGUAGE (saved)  >  DISPLAY_LANGUAGE (legacy)  >  "match"
//
// so an existing install keeps exactly the language it had, and only genuine
// ABSENCE resolves to Match. Both halves are asserted below — a change that
// reset saved preferences would be worse than the bug it replaced.
//
// Broader behaviour (the prompt contract, the dropdown, Settings validation)
// lives in replyLanguageContract.test.js and replyLanguageDefault.test.js;
// what is unique here is publicConfig() — the value the FRONTEND receives.
//
// Runs against an isolated temp .env.local (via ENV_FILE_PATH), like
// councilSettings.test.js, so it never touches the real project .env.local.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let config;
let localization;
let tmpRoot;

// The resolver falls back to process.env when a key is absent from the file,
// so a stray value in the runner's environment would silently decide these
// assertions. Clear both keys for the duration and restore them after.
const saved = {};

before(async () => {
  for (const key of ["DEFAULT_REPLY_LANGUAGE", "DISPLAY_LANGUAGE"]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-reply-language-test-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  await fs.writeFile(process.env.ENV_FILE_PATH, "\n", "utf8");
  config = await import("../src/config.js");
  localization = await import("../src/localization.js");
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Each case owns the whole file, so no case can inherit another's state.
async function writeEnv(contents) {
  await fs.writeFile(process.env.ENV_FILE_PATH, contents, "utf8");
  config.reloadConfig();
}

beforeEach(async () => {
  await writeEnv("\n");
});

// ------------------------------------------------------------ the constants

test("the two defaults are separate constants answering separate questions", () => {
  // Locale/identity fallback — unchanged, and still Traditional Chinese.
  assert.equal(localization.DEFAULT_LANGUAGE, "zh-TW");
  // AI reply default on a fresh install: follow the question rather than
  // guessing a language for a user nobody has asked yet.
  assert.equal(localization.DEFAULT_REPLY_LANGUAGE, localization.MATCH_QUESTION_LANGUAGE);
  assert.equal(localization.MATCH_QUESTION_LANGUAGE, "match");
  assert.notEqual(
    localization.DEFAULT_LANGUAGE,
    localization.DEFAULT_REPLY_LANGUAGE,
    "collapsing these back into one constant reintroduces the bug"
  );
});

// -------------------------------------------------------------- fresh install

test("a fresh install defaults the reply language to Match", async () => {
  // Nothing saved: no DEFAULT_REPLY_LANGUAGE, no legacy DISPLAY_LANGUAGE.
  assert.equal(config.config.defaultReplyLanguage, "match");
});

test("the value the frontend receives is Match too, not just the internal config", async () => {
  // publicConfig() is what /api/config serves, and it is resolved server-side
  // BEFORE the browser can apply any default of its own — this is the surface
  // that actually decides the behaviour, and the one renderGeneral() reads to
  // pick the selected option.
  assert.equal(config.publicConfig().defaultReplyLanguage, "match");
});

// ------------------------------------------------------- existing installs

test("a saved DEFAULT_REPLY_LANGUAGE=zh-TW is preserved", async () => {
  await writeEnv("DEFAULT_REPLY_LANGUAGE=zh-TW\n");
  assert.equal(config.config.defaultReplyLanguage, "zh-TW");
  assert.equal(config.publicConfig().defaultReplyLanguage, "zh-TW");
});

test("the legacy DISPLAY_LANGUAGE=zh-TW is still honoured", async () => {
  // Pre-rename installs only ever wrote this key. Dropping support would
  // silently flip those users to English on upgrade.
  await writeEnv("DISPLAY_LANGUAGE=zh-TW\n");
  assert.equal(config.config.defaultReplyLanguage, "zh-TW");
});

test("a saved English preference is preserved rather than treated as unset", async () => {
  await writeEnv("DEFAULT_REPLY_LANGUAGE=en\n");
  assert.equal(config.config.defaultReplyLanguage, "en");
});

// ------------------------------------------------------------- the priority

test("the new key outranks the legacy one when both are present", async () => {
  await writeEnv("DEFAULT_REPLY_LANGUAGE=en\nDISPLAY_LANGUAGE=zh-TW\n");
  assert.equal(config.config.defaultReplyLanguage, "en");
  await writeEnv("DEFAULT_REPLY_LANGUAGE=zh-TW\nDISPLAY_LANGUAGE=en\n");
  assert.equal(config.config.defaultReplyLanguage, "zh-TW");
});

test("the reply language is independent of the interface language", async () => {
  // A zh-TW interface must not drag AI answers along with it: the two are
  // configured separately and always have been.
  await writeEnv("INTERFACE_LANGUAGE=zh-TW\n");
  assert.equal(config.config.interfaceLanguage, "zh-TW");
  assert.equal(config.config.defaultReplyLanguage, "match");
});
