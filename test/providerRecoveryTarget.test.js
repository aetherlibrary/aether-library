// WHERE A PROVIDER PROBLEM SENDS THE USER.
//
// Providers, API keys and model selection used to live in Settings. They now
// live in the separate AI Config dialog (see settingsSplit.test.js), but one
// recovery path never moved with them: the Council pre-check failure block
// still offered "Open Settings" and opened Settings — a dialog with no
// provider fields in it at all. A user told "This provider is rate-limiting
// requests right now" landed somewhere they could not fix it.
//
// The rule these pin: a recovery action whose purpose is repairing AI or
// PROVIDER configuration — a missing API key, a disabled provider, provider or
// model selection, an unavailable model — opens AI Config. Everything else
// still opens Settings. There is exactly one AI Config opener, shared.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (rel) => (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const appJs = await read("../public/app.js");
const indexHtml = await read("../public/index.html");
const en = (await import("../src/locales/en.js")).default.strings;
const zhTW = (await import("../src/locales/zh-TW.js")).default.strings;

// ------------------------------------------------- the Council pre-check block

test("the pre-check recovery button opens AI Config, not Settings", () => {
  // The bug: `addEventListener("click", openSettings)`. Passing the function
  // by reference handed the click Event in as openSettings' `target`
  // parameter, which is neither "settings" nor "ai-config" — so it fell
  // through to the Settings dialog. It is now an explicit target.
  assert.match(
    appJs,
    /els\.councilPrecheckError\.openSettings\.addEventListener\("click", \(\) => openSettings\("ai-config"\)\);/
  );
  assert.doesNotMatch(
    appJs,
    /els\.councilPrecheckError\.openSettings\.addEventListener\("click", openSettings\)/,
    "the old bare-reference handler must not come back"
  );
});

test("its label says AI Config, in both locales and in the markup", () => {
  assert.equal(en.councilCheckOpenAiConfig, "Open AI Config");
  assert.equal(zhTW.councilCheckOpenAiConfig, "開啟 AI 配置");
  // The stale key is gone rather than left behind as a second source of truth.
  assert.equal(en.councilCheckOpenSettings, undefined);
  assert.equal(zhTW.councilCheckOpenSettings, undefined);
  // The button is localized from that key...
  assert.match(appJs, /setText\("council-precheck-open-settings", "councilCheckOpenAiConfig"\);/);
  // ...and the hardcoded markup fallback agrees, so it never flashes the old
  // wording before the locale pack applies.
  const block = indexHtml.slice(
    indexHtml.indexOf('id="council-precheck-error"'),
    indexHtml.indexOf('id="session-summary"')
  );
  assert.match(block, /<button type="button" id="council-precheck-open-settings">Open AI Config<\/button>/);
});

test("Retry Check and the rest of the recovery block are untouched", () => {
  const block = indexHtml.slice(
    indexHtml.indexOf('id="council-precheck-error"'),
    indexHtml.indexOf('id="session-summary"')
  );
  assert.match(block, /<button type="button" id="council-precheck-retry">Retry Check<\/button>/);
  assert.equal(en.councilCheckRetry, "Retry Check");
  // Retry still re-runs the same check/decide flow and clears the block on
  // success — it never became a second way into a dialog.
  const retry = appJs.slice(
    appJs.indexOf('els.councilPrecheckError.retry.addEventListener'),
    appJs.indexOf('els.councilPrecheckError.openSettings')
  );
  assert.match(retry, /runPrecheckAndProceed\(slots, councilConfigSignature\(slots\)\)/);
  assert.match(retry, /if \(ok\) hideCouncilPrecheckError\(\);/);
  // Comments are stripped: the handler that follows this one is DOCUMENTED as
  // the thing that opens AI Config, and that prose is not code Retry runs.
  const retryCode = retry.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(retryCode, /openSettings/, "Retry must not open a dialog");
});

// ------------------------------------------- one opener, no second implementation

test("every AI-configuration entry point calls the same existing opener", () => {
  // openSettings(target) is the ONE mechanism — the nav button, the first-run
  // AI Setup dialog and now pre-check recovery all route through it. A
  // separate showModal() on the AI Config dialog would be a second
  // implementation to keep in step.
  assert.match(appJs, /function openSettings\(target = "settings"\)/);
  const opens = [...appJs.matchAll(/openSettings\("ai-config"\)/g)];
  assert.ok(opens.length >= 3, `expected the nav, AI Setup and recovery paths, saw ${opens.length}`);

  // Only openSettings() itself is allowed to show the AI Config dialog.
  const showCalls = [...appJs.matchAll(/els\.aiConfig\.dialog\.showModal\(\)/g)];
  assert.equal(showCalls.length, 1, "exactly one place shows the AI Config dialog");
  const opener = appJs.slice(appJs.indexOf("function openSettings(target"), appJs.indexOf("function openSettings(target") + 3000);
  assert.match(opener, /if \(target === "ai-config" && els\.aiConfig\.dialog\) \{[\s\S]{0,300}?els\.aiConfig\.dialog\.showModal\(\);/);
});

test("no provider-specific branch decides where recovery goes", () => {
  // The target is a property of the FAILURE CLASS (provider configuration),
  // never of which provider failed. A branch on an id here would mean adding
  // one for every future provider.
  const handler = appJs.slice(
    appJs.indexOf("els.councilPrecheckError.openSettings"),
    appJs.indexOf("els.councilPrecheckError.openSettings") + 400
  );
  assert.doesNotMatch(handler, /openai|anthropic|google|xai|perplexity|deepseek/i);
});

// ---------------------------------------- the other provider-repair guidance

test("provider status text points at AI Config too", () => {
  // Not buttons — a status line and two Scholar-chip tooltips — but the same
  // misdirection: each names where to repair provider configuration.
  for (const [locale, pack] of [["en", en], ["zh-TW", zhTW]]) {
    for (const key of ["noProviderConfigured", "chipTitleDisabled", "chipTitleNoKey"]) {
      const value = pack[key];
      assert.equal(typeof value, "string", `${locale} is missing ${key}`);
      assert.match(value, /AI Config|AI 配置/, `${locale} ${key} still sends the user to the wrong dialog`);
    }
  }
});

test("the AI-required dialog and its in-file English fallback agree", () => {
  // EN_FALLBACK in app.js only surfaces when a locale pack lacks a key, which
  // is exactly when a stale copy would go unnoticed — it had kept the old
  // "Open Settings" wording long after the locale packs moved on.
  assert.equal(en.aiSetupOpenSettings, "Open AI Config");
  const fallback = appJs.slice(appJs.indexOf("const EN_FALLBACK = {"), appJs.indexOf("function str(key)"));
  assert.match(fallback, /aiSetupOpenSettings: "Open AI Config",/);
  assert.match(fallback, /aiSetupBody2: "Connect your first AI provider in AI Config to begin conversations\.",/);
  assert.match(fallback, /noProviderConfigured: "No provider configured yet — open AI Config to add API keys\.",/);
  assert.doesNotMatch(fallback, /Open Settings/, "no stale recovery label left in the fallback pack");
});

// ------------------------------------ genuinely-Settings actions stay Settings

test("application settings still open Settings", () => {
  // The nav Settings button opens Settings with no target.
  assert.match(
    appJs,
    /els\.settings\.open\.addEventListener\("click", \(\) => \{[\s\S]{0,300}?openSettings\(\);\s*\}\)/
  );
  // Council Model Check is a PREFERENCE (a checkbox plus "Check Models Now"),
  // and it genuinely lives in Settings — so its note must keep saying so. This
  // is the "do not blindly replace every Open Settings" case.
  assert.match(en.councilCheckSettingsNote, /\bSettings\b/);
  assert.doesNotMatch(en.councilCheckSettingsNote, /AI Config/);
  assert.match(indexHtml, /id="council-check-settings-note">You can change this option anytime in Settings\./);
  // And that section's controls really are inside the Settings dialog.
  assert.match(appJs, /els\.settings\.councilAutoChk/);
  assert.match(appJs, /els\.settings\.councilManualCheckBtn\.addEventListener\("click", runManualCouncilCheck\);/);
});

test("the Display section is an application setting and never moved", () => {
  // Window Mode / Always on Top are desktop-shell preferences, unrelated to
  // providers — they stay in Settings.
  assert.match(indexHtml, /id="display-window-mode"/);
  const settingsDialog = indexHtml.slice(
    indexHtml.indexOf('<dialog id="settings-dialog"'),
    indexHtml.indexOf('<dialog id="ai-config-dialog">')
  );
  assert.match(settingsDialog, /id="display-window-mode"/, "Display belongs to Settings");
  const aiConfigDialog = indexHtml.slice(indexHtml.indexOf('<dialog id="ai-config-dialog">'));
  assert.doesNotMatch(aiConfigDialog.slice(0, aiConfigDialog.indexOf("</dialog>")), /id="display-window-mode"/);
});
