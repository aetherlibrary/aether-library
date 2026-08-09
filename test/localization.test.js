// Localization key parity: every string key the English pack defines must
// also exist in the Traditional Chinese pack (src/locales/en.js /
// src/locales/zh-TW.js). uiStringsFor() (src/localization.js) already
// tolerates a missing key by falling back to English per-key rather than
// crashing, but a genuinely missing translation is still a real gap worth
// catching automatically — this guards the Council Model Pre-check's new
// keys (and any future addition) against silently landing English-only in
// the zh-TW pack.

import { test } from "node:test";
import assert from "node:assert/strict";
import en from "../src/locales/en.js";
import zhTW from "../src/locales/zh-TW.js";

test("every key in the English strings pack also exists in the zh-TW strings pack", () => {
  const missing = Object.keys(en.strings).filter((key) => !(key in zhTW.strings));
  assert.deepEqual(missing, []);
});

test("Council Model Pre-check keys specifically are present and non-empty in both locales", () => {
  const keys = [
    "councilCheckTitle",
    "councilCheckRecommended",
    "councilCheckBody",
    "councilCheckHelp",
    "councilCheckCost",
    "councilCheckSkipNote",
    "councilCheckAutoLabel",
    "councilCheckSettingsNote",
    "councilCheckRun",
    "councilCheckSkip",
    "councilCheckChecking",
    "councilCheckRetry",
    "councilCheckOpenSettings",
    "councilCheckSettingsAutoLabel",
    "councilCheckSettingsDesc",
    "councilCheckSettingsCost",
    "councilCheckErrorTitle",
    "councilCheckErrorFooter",
    "councilErrorModelUnavailable",
    "councilErrorAuth",
    "councilErrorBilling",
    "councilErrorRateLimited",
    "councilErrorTimeout",
    "councilErrorProvider",
  ];
  for (const key of keys) {
    assert.ok(typeof en.strings[key] === "string" && en.strings[key].length > 0, `en.${key} missing/empty`);
    assert.ok(typeof zhTW.strings[key] === "string" && zhTW.strings[key].length > 0, `zh-TW.${key} missing/empty`);
  }
});

// ============================================ idle discussion-panel greeting
//
// The empty right-hand panel shows TWO lines: a primary welcome above the
// existing "click the book" instruction. Both come from the locale — the
// markup ships empty so a zh-TW user never sees an English flash — and both
// belong to the IDLE state only: a Session in flight still shows one
// progress line.

import fs from "node:fs/promises";

const readSrc = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the idle greeting and its instruction exist in both locales", () => {
  for (const key of ["councilWelcome", "bookPrompt"]) {
    assert.ok(typeof en.strings[key] === "string" && en.strings[key].length > 0, `en.${key} missing/empty`);
    assert.ok(typeof zhTW.strings[key] === "string" && zhTW.strings[key].length > 0, `zh-TW.${key} missing/empty`);
  }
  assert.equal(en.strings.councilWelcome, "The Council awaits your questions.");
  assert.equal(en.strings.bookPrompt, "Click the book on the table to begin...");
  // The zh-TW greeting uses the established Council terminology, not a new one.
  assert.match(zhTW.strings.councilWelcome, /智囊團/);
  assert.equal(zhTW.strings.modeCouncil, "智囊團", "the shared Council term is unchanged");
});

test("neither empty-state line is hardcoded in the markup", async () => {
  const html = await readSrc("../public/index.html");
  const block = html.slice(html.indexOf('id="discussion-empty"'), html.indexOf('id="session-error"'));
  assert.match(block, /<p class="discussion-empty-welcome" id="discussion-welcome"><\/p>/);
  assert.match(block, /<p class="discussion-empty-hint" id="discussion-hint"><\/p>/);
  // The English copy must not survive anywhere in the markup for these lines.
  assert.doesNotMatch(block, /The Council awaits/);
  assert.doesNotMatch(block, /Click the book on the table/);
});

test("the greeting is idle-only — a run in flight still shows one progress line", async () => {
  const app = await readSrc("../public/app.js");
  const fn = app.slice(
    app.indexOf("function refreshDiscussionEmptyText() {"),
    app.indexOf("// Fatal-run-failure state:")
  );
  assert.ok(fn.length > 0);
  // In-flight: welcome hidden, hint carries the unchanged progress message.
  assert.match(fn, /els\.discussionWelcome\.hidden = true;/);
  assert.match(fn, /els\.discussionHint\.textContent = runProgressMessage\(\);/);
  // Idle: both lines shown, both from the locale.
  assert.match(fn, /els\.discussionWelcome\.textContent = str\("councilWelcome"\);/);
  assert.match(fn, /els\.discussionHint\.textContent = str\("bookPrompt"\);/);
  // The hidden-guard that made this cheap to call is still the first thing.
  assert.match(fn, /^function refreshDiscussionEmptyText\(\) \{\s*\n\s*if \(els\.discussionEmpty\.hidden\) return;/);
  // English fallback stays in sync for an offline/failed config fetch.
  assert.match(app, /councilWelcome: "The Council awaits your questions\.",/);
});
