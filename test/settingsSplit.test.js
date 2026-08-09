// Settings / AI Config split — the two top-level surfaces.
//
// They share ONE state object and ONE save path; only the presentation is
// separated. These tests pin that, and the canonical close both Cancel buttons
// route through.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const appJs = () => read("../public/app.js");
const html = () => read("../public/index.html");

// ============================================================ the close path

test("Cancel uses the canonical close — and it is not recursive", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function closeSettingsDialogs()"), src.indexOf("function closeSettingsDialogs()") + 260);
  // THE BUG THIS PINS: a blanket rename of `els.settings.dialog.close()` once
  // rewrote the call INSIDE this function too, so Cancel blew the stack and
  // silently did nothing while ESC (a browser-level close) still worked.
  assert.match(fn, /if \(els\.settings\.dialog\.open\) els\.settings\.dialog\.close\(\);/);
  assert.match(fn, /if \(els\.aiConfig\.dialog\?\.open\) els\.aiConfig\.dialog\.close\(\);/);
  assert.doesNotMatch(fn, /closeSettingsDialogs\(\)\s*;/, "must never call itself");
});

test("both Cancel buttons route through that one function", async () => {
  const src = await appJs();
  assert.match(src, /els\.settings\.cancel\.addEventListener\("click", \(\) => closeSettingsDialogs\(\)\);/);
  assert.match(src, /els\.aiConfig\.cancel\?\.addEventListener\("click", \(\) => closeSettingsDialogs\(\)\);/);
  // No second, divergent close implementation.
  assert.equal([...src.matchAll(/function closeSettingsDialogs\(/g)].length, 1);
});

test("Cancel cannot save — nothing commits outside saveSettings", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function closeSettingsDialogs()"), src.indexOf("function closeSettingsDialogs()") + 260);
  for (const forbidden of [/fetch\(/, /saveSettings/, /api\/settings/]) {
    assert.doesNotMatch(fn, forbidden, "closing must never persist");
  }
  // Only the submit handlers save, and both go to the same one.
  assert.match(src, /els\.settings\.form\.addEventListener\("submit", saveSettings\);/);
  assert.match(src, /els\.aiConfig\.form\?\.addEventListener\("submit", saveSettings\);/);
  assert.equal([...src.matchAll(/async function saveSettings\(/g)].length, 1);
});

test("Cancel buttons are type=button, so they cannot submit their form", async () => {
  const markup = await html();
  assert.match(markup, /<button type="button" id="settings-cancel">/);
  assert.match(markup, /<button type="button" id="ai-config-cancel">/);
  // ESC equivalence is structural: neither modal commits until saveSettings
  // runs, so the browser's own <dialog> close leaves the same state.
  const src = await appJs();
  assert.match(src, /ESC is the browser closing the <dialog> itself/);
});

// ========================================================== the AI Config label

test("the nav label is AI Config in English and AI 配置 in zh-TW", async () => {
  const en = await read("../src/locales/en.js");
  const zh = await read("../src/locales/zh-TW.js");
  assert.match(en, /aiConfig: "AI Config",/);
  assert.match(zh, /aiConfig: "AI 配置",/);
  // The superseded wording is gone from every user-facing surface.
  assert.doesNotMatch(zh, /aiConfig: "AI 設定"/);
});

test("nothing user-facing still says AI 設定", async () => {
  for (const rel of ["../src/locales/zh-TW.js", "../assets/content/tutorial/default.json", "../public/index.html"]) {
    assert.doesNotMatch(await read(rel), /AI 設定/, rel);
  }
});

test("one localization source drives the button and the modal title", async () => {
  const src = await appJs();
  assert.match(src, /setText\("open-ai-config", "aiConfig"\);/);
  assert.match(src, /setText\("ai-config-title", "aiConfig"\);/);
});

test("the tutorial introduces Settings first, then AI Config", async () => {
  const doc = JSON.parse(await read("../assets/content/tutorial/default.json"));
  // General preferences are their own opening step; provider setup follows.
  const [first, second] = doc.steps;
  assert.equal(first.id, "settings");
  assert.equal(first.target, "settings");
  assert.equal(first.title.en, "Settings");
  assert.equal(first.title["zh-TW"], "設定");

  assert.equal(second.id, "ai-config");
  assert.equal(second.target, "ai-config");
  assert.equal(second.title.en, "AI Config");
  assert.equal(second.title["zh-TW"], "AI 配置");
  // Step 2 no longer repeats what step 1 now owns.
  assert.doesNotMatch(second.body.en, /Interface language|reply language|theme/i);
  assert.doesNotMatch(second.body["zh-TW"], /介面語言|主題/);
  // Both highlight targets resolve to their own visible button.
  const app = await appJs();
  assert.match(app, /settings: \(\) => els\.settings\.open,/);
  assert.match(app, /"ai-config": \(\) => els\.aiConfig\.open,/);
});

// ================================================ guided-tour highlight ring
//
// NO PRODUCT FIX WAS NEEDED HERE. An earlier automated measurement appeared to
// show the ring frozen on step 1's target. It was frozen — but in the harness,
// not the app: the pane reported document.visibilityState === "hidden", and a
// non-rendering document never advances CSS transitions. #tutorial-ring has
// `transition: all 0.18s`, so getBoundingClientRect kept returning the
// transition's START value on every step.
//
// With the transition disabled, the ring matched every target to 0.0px. These
// tests pin the properties that make that true, so the real defect this class
// of bug would represent still cannot appear unnoticed.

test("the ring is positioned from LIVE geometry on every step", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function positionTutorial()"), src.indexOf("function renderTutorial()"));
  // The step and its target are re-read each call — nothing is cached.
  assert.match(fn, /const step = tutorialSteps\(\)\[tutorialIndex\];/);
  assert.match(fn, /const el = tutorialTargetEl\(step\?\.target\);/);
  assert.match(fn, /el\.getBoundingClientRect\(\)/);
  // Geometry comes from that rect, never from a constant.
  assert.match(fn, /ring\.style\.left = `\$\{rect\.left - pad\}px`;/);
  assert.match(fn, /ring\.style\.top = `\$\{rect\.top - pad\}px`;/);
  assert.match(fn, /ring\.style\.width = `\$\{rect\.width \+ pad \* 2\}px`;/);
  assert.match(fn, /ring\.style\.height = `\$\{rect\.height \+ pad \* 2\}px`;/);
  // No hardcoded step-1 geometry anywhere in the positioner.
  assert.doesNotMatch(fn, /open-settings|"settings"/);
});

test("every step change re-runs the positioner", async () => {
  const src = await appJs();
  const render = src.slice(src.indexOf("function renderTutorial()"), src.indexOf("function renderTutorialImage("));
  // renderTutorial is THE reconciliation point and ends by repositioning.
  assert.match(render, /positionTutorial\(\);\s*\}/);
  // Next/Back/restart all funnel through it rather than positioning themselves.
  assert.equal([...src.matchAll(/ring\.style\.top =/g)].length, 1, "one writer only");
});

test("a step with no resolvable target hides the ring instead of stranding it", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function positionTutorial()"), src.indexOf("function renderTutorial()"));
  assert.match(fn, /if \(!usable\) \{\s*ring\.hidden = true;/);
  // Verified live: step 11 (privacy-more, no target) hides it and centres the card.
  assert.match(fn, /callout\.style\.left = "50%";/);
});

test("the ring stays live under layout changes", async () => {
  const src = await appJs();
  // Re-measured on resize/scroll rather than positioned once.
  assert.match(src, /positionTutorial/);
  const listeners = [...src.matchAll(/addEventListener\("(resize|scroll)"[^)]*positionTutorial/g)];
  assert.ok(
    listeners.length > 0 || /window\.addEventListener\("resize", \(\) => \{[\s\S]{0,200}positionTutorial/.test(src),
    "resize/scroll must re-measure"
  );
});
