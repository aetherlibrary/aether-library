// Tests for the first-run AI setup guidance.
//
// The feature is deliberately small, and almost all of its risk is in what it
// must NOT do. A first-time user can finish the Tutorial with no provider and
// then click the Core Book to no effect; this adds a highlight, a tooltip and
// an explanatory dialog — and nothing else.
//
// So what is defended here is mostly restraint:
//
//   NON-BLOCKING — no wizard, no forced setup, no auto-selection, no
//   auto-assignment. Every step of the existing Settings flow stays optional
//   and the Library stays fully usable with zero providers.
//   DERIVED — "is a provider configured?" comes from currentConfig, so it
//   cannot drift. Exactly one persisted bit exists, for the one question
//   configuration genuinely cannot answer.
//   PERMANENT-OFF — once a provider appears the guidance never returns, even
//   if the key is later removed.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");
const html = () => readSource("../public/index.html");
const css = () => readSource("../public/style.css");

// The guidance block, so "nowhere in this feature" means something specific.
const guidanceSection = async () => {
  const src = await app();
  const start = src.indexOf("// ================================================ First-run AI setup guidance");
  const end = src.indexOf("let tutorialIndex = 0;");
  assert.ok(start > 0 && end > start, "could not locate the AI setup guidance section");
  return src.slice(start, end);
};

// ------------------------------------------------------------- activation

test("all four activation conditions live in one predicate", async () => {
  const section = await guidanceSection();
  assert.match(
    section,
    /function aiSetupGuidanceApplies\(\) \{\s*return hasSeenTutorial\(\) && !anyProviderConfigured\(\) && !aiSetupHintDone\(\);/
  );
  // Tutorial-finished is the existing flag, not a second source of truth.
  assert.match(await app(), /function hasSeenTutorial\(\)/);
  // ...and the highlight/tooltip both read that one predicate.
  assert.match(section, /const applies = aiSetupGuidanceApplies\(\);/);
});

test("configured-ness is derived from config, never from a parallel flag", async () => {
  const section = await guidanceSection();
  assert.match(section, /function anyProviderConfigured\(\) \{\s*return providerStatusList\(\)\.some\(\(p\) => p\.configured\);/);
  // providerStatusList reads currentConfig, which the server fills from the
  // actual API keys — so this cannot go stale.
  const appJs = await app();
  assert.match(appJs, /function providerStatusList\(\)[\s\S]{0,200}?currentConfig\?\.providers/);
  // Exactly ONE new persisted key, for the one thing configuration cannot
  // answer: whether the user already dealt with this. Keys are declared as
  // constants, so that is what this counts.
  const keys = [...appJs.matchAll(/const \w+_KEY = "(aether\.[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), [
    "aether.aiSetupHintDone",
    // Session recovery's per-tab pointer to the last displayed Session ({id,
    // saved}). Listed so this test still counts every persisted key, but it is
    // NOT a configured-ness flag: it says nothing about providers, and the
    // guidance section below is asserted to declare only its own key.
    "aether.lastSession",
    "aether.modelFailureMemory",
    "aether.quickActionsExpanded",
    "aether.tutorialSeen",
  ]);
  // ...and the guidance itself declares only its own.
  const sectionKeys = [...section.matchAll(/const \w+_KEY = "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionKeys, ["aether.aiSetupHintDone"]);
});

test("the guidance is permanently off once a provider appears", async () => {
  const section = await guidanceSection();
  // Recorded the FIRST time a provider is seen, so removing the key later
  // cannot bring the guidance back.
  assert.match(section, /if \(anyProviderConfigured\(\) && !aiSetupHintDone\(\)\) markAiSetupHintDone\(\);/);
  // Blocked storage degrades to "already done" — it can never nag on every
  // launch, the same rule hasSeenTutorial() follows.
  assert.match(section, /function aiSetupHintDone\(\) \{[\s\S]{0,300}?catch \{[\s\S]{0,200}?return true;/);
});

test("it is re-evaluated wherever configuration or tutorial state can change", async () => {
  const appJs = await app();
  // Every Settings save and Model Pre-check funnels through loadStatus().
  assert.match(appJs, /applySceneTheme\(cfg\.sceneTheme, resolveSceneThemeMode\(cfg\)\);\s*\n[\s\S]{0,200}?refreshAiSetupHint\(\);/);
  // ...and finishing or skipping the Tutorial is the moment it can first apply.
  const endTutorial = appJs.slice(appJs.indexOf("function endTutorial()"), appJs.indexOf("function tutorialNext()"));
  assert.match(endTutorial, /markTutorialSeen\(\);\s*\n[\s\S]{0,200}?refreshAiSetupHint\(\);/);
});

// ------------------------------------------------------------- the highlight

test("the highlight is pseudo-element only, so localization cannot destroy it", async () => {
  const cssSrc = await css();
  const appJs = await app();
  // #open-settings has its textContent rewritten on every locale change; a
  // real child node would be wiped, and a re-created one would restart the
  // animation on every re-render.
  assert.match(appJs, /setText\("open-settings", "settings"\);/);
  assert.match(cssSrc, /\.ai-setup-highlight::before \{/);
  assert.match(cssSrc, /\.ai-setup-highlight::after \{/);
  // The tooltip is a SIBLING of the button, never nested inside it.
  const htmlSrc = await html();
  const navBlock = htmlSrc.slice(htmlSrc.indexOf('<div class="lib-nav">'), htmlSrc.indexOf("</div>", htmlSrc.indexOf('id="ai-setup-hint"')));
  assert.match(navBlock, /<button id="open-settings"[^>]*>Settings<\/button>/);
  assert.ok(
    navBlock.indexOf('id="ai-setup-hint"') > navBlock.indexOf('id="open-settings"'),
    "the hint must follow the button, not sit inside it"
  );
});

test("the animation is calm, continuous and respects reduced motion", async () => {
  const cssSrc = await css();
  // One slow, constant-speed orbit — not a flash or a pulse.
  assert.match(cssSrc, /animation: ai-hint-orbit 6s linear infinite;/);
  assert.match(cssSrc, /@keyframes ai-hint-orbit \{[\s\S]{0,400}?100% \{ top: -6px; left: -6px; \}/);
  // Four corner waypoints, so the particle travels the whole border.
  const frames = cssSrc.slice(cssSrc.indexOf("@keyframes ai-hint-orbit"));
  for (const stop of ["0%", "25%", "50%", "75%", "100%"]) {
    assert.ok(frames.includes(stop + " "), `missing keyframe ${stop}`);
  }
  // Motion sensitivity keeps the outline, drops the orbit.
  assert.match(cssSrc, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ai-setup-highlight::after \{ animation: none; opacity: 0; \}/);
  // Decoration must never eat a click.
  const highlight = cssSrc.slice(cssSrc.indexOf(".ai-setup-highlight::before"), cssSrc.indexOf("@keyframes ai-hint-orbit"));
  assert.equal((highlight.match(/pointer-events: none;/g) || []).length, 2);
});

test("opening Settings retires the tooltip only; the highlight waits for a real provider", async () => {
  const section = await guidanceSection();
  const appJs = await app();
  // Session-only — going to look is not the same as having connected.
  assert.match(section, /let aiSetupTooltipSeen = false;/);
  assert.match(section, /if \(hint\) hint\.hidden = !applies \|\| aiSetupTooltipSeen;/);
  assert.match(section, /function noteAiSetupSettingsOpened\(\) \{\s*aiSetupTooltipSeen = true;/);
  // The ✕ is the decision that persists.
  assert.match(section, /function dismissAiSetupHint\(\) \{\s*markAiSetupHintDone\(\);/);
  // Both routes into Settings hide the tooltip.
  assert.match(appJs, /els\.settings\.open\.addEventListener\("click", \(\) => \{[\s\S]{0,300}?noteAiSetupSettingsOpened\(\);\s*openSettings\(\);/);
  assert.match(appJs, /els\.aiSetup\.openSettings\?\.addEventListener[\s\S]{0,200}?noteAiSetupSettingsOpened\(\);\s*openSettings\(\);/);
});

// ---------------------------------------------------------- the book dialog

test("the Core Book explains instead of opening a mode picker that leads nowhere", async () => {
  const appJs = await app();
  // The branch lives at the ONE point both click paths call — the hotspot's
  // own listener and the delegated near-miss handler.
  assert.match(
    appJs,
    /function openModeModal\(\) \{[\s\S]{0,400}?if \(!anyProviderConfigured\(\)\) \{\s*openAiSetupDialog\(\);\s*return;\s*\}/
  );
  // The existing listeners are untouched.
  assert.match(appJs, /els\.bookHotspot\.addEventListener\("click", openModeModal\);/);
  // Two ways out, and "Later" only closes.
  assert.match(appJs, /els\.aiSetup\.later\?\.addEventListener\("click", \(\) => els\.aiSetup\.dialog\.close\(\)\);/);
  const laterHandler = appJs.slice(appJs.indexOf("els.aiSetup.later?"), appJs.indexOf("els.aiSetup.openSettings?"));
  assert.doesNotMatch(laterHandler, /markAiSetupHintDone|openSettings|api\(/);
});

test("the dialog is a plain two-button dialog, not a wizard", async () => {
  const htmlSrc = await html();
  const dialog = htmlSrc.slice(htmlSrc.indexOf('<dialog id="ai-setup-dialog">'), htmlSrc.indexOf("</dialog>", htmlSrc.indexOf('<dialog id="ai-setup-dialog">')));
  // Exactly two actions.
  const buttons = [...dialog.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ["ai-setup-later", "ai-setup-open-settings"]);
  // No form, no inputs, no steps — nothing to complete.
  for (const forbidden of [/<form/, /<input/, /<select/, /step/i]) {
    assert.doesNotMatch(dialog, forbidden);
  }
  // It reuses the existing dialog shell rather than inventing a screen.
  assert.match(dialog, /class="dialog-buttons"/);
});

// ------------------------------------------------------------------ scope

test("nothing here forces, auto-selects or auto-assigns anything", async () => {
  const section = await guidanceSection();
  const appJs = await app();
  // The guidance never writes settings, picks a provider, or assigns a model.
  for (const forbidden of [
    /api\(/,
    /fetch\(/,
    /providerSel\.value\s*=/,
    /modelSel\.value\s*=/,
    /\.checked\s*=\s*true/,
    /saveSettings/,
    /refreshModels/,
    /runCouncil|startSessionRun/,
  ]) {
    assert.doesNotMatch(section, forbidden, `the guidance must not ${forbidden}`);
  }
  // The Settings flow itself is untouched: the same steps, all still optional.
  assert.match(appJs, /async function refreshModels\(id, btn, note\)/);
  // openSettings now takes a target so one population pass can serve both
  // the Settings and AI Config modals.
  assert.match(appJs, /function openSettings\(target = "settings"\)/);
  // No new onboarding surface.
  const htmlSrc = await html();
  for (const forbidden of [/id="onboarding/, /id="welcome/, /class="wizard/]) {
    assert.doesNotMatch(htmlSrc, forbidden);
  }
});

test("the Tutorial is unchanged by this feature", async () => {
  const section = await guidanceSection();
  // Guidance reads the tutorial's seen flag and nothing else — it never
  // starts, ends, advances or re-renders it.
  assert.match(section, /hasSeenTutorial\(\)/);
  for (const forbidden of [/startTutorial|endTutorial|renderTutorial|tutorialIndex|tutorialSteps/]) {
    assert.doesNotMatch(section, forbidden);
  }
  // The tutorial's own seen-marking is where it always was.
  const appJs = await app();
  const endTutorial = appJs.slice(appJs.indexOf("function endTutorial()"), appJs.indexOf("function tutorialNext()"));
  assert.match(endTutorial, /markTutorialSeen\(\);/);
});

test("copy exists in both locales and carries no hardcoded English in the UI path", async () => {
  const en = await readSource("../src/locales/en.js");
  const zh = await readSource("../src/locales/zh-TW.js");
  const appJs = await app();
  const keys = [
    "aiSetupHint",
    "aiSetupHintDismiss",
    "aiSetupTitle",
    "aiSetupBody1",
    "aiSetupBody2",
    "aiSetupOpenSettings",
    "aiSetupLater",
  ];
  for (const key of keys) {
    assert.match(en, new RegExp(`${key}: "`), `en missing ${key}`);
    assert.match(zh, new RegExp(`${key}: "`), `zh-TW missing ${key}`);
    assert.match(appJs, new RegExp(`${key}: "`), `EN_FALLBACK missing ${key}`);
  }
  // Every visible string is set through the locale layer.
  for (const id of ["ai-setup-hint-text", "ai-setup-title", "ai-setup-body1", "ai-setup-body2", "ai-setup-later", "ai-setup-open-settings"]) {
    assert.match(appJs, new RegExp(`setText\\("${id}", "`), `${id} is not localized`);
  }
});
