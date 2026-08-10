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
    // Stage 2 of the same guidance. One bit per stage, for the one question
    // configuration cannot answer — "has the user already dealt with this?".
    // Separate keys on purpose, so dismissing one never dismisses the other.
    "aether.vaultSetupHintDone",
  ]);
  // ...and the guidance itself declares only its own two, one per stage.
  const sectionKeys = [...section.matchAll(/const \w+_KEY = "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionKeys, ["aether.aiSetupHintDone", "aether.vaultSetupHintDone"]);
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
  // Both stages refresh from ONE entry point, so neither can be re-evaluated
  // without the other. Every Settings save and Model Pre-check funnels
  // through loadStatus().
  assert.match(appJs, /applySceneTheme\(cfg\.sceneTheme, resolveSceneThemeMode\(cfg\)\);\s*\n[\s\S]{0,300}?refreshSetupGuidance\(\);/);
  // ...and finishing or skipping the Tutorial is the moment it can first apply.
  const endTutorial = appJs.slice(appJs.indexOf("function endTutorial()"), appJs.indexOf("function tutorialNext()"));
  assert.match(endTutorial, /markTutorialSeen\(\);\s*\n[\s\S]{0,300}?refreshSetupGuidance\(\);/);
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
  // Both routes retire the tooltip. They open DIFFERENT modals on purpose:
  // the Settings button opens Settings, while the "AI Provider Required"
  // dialog exists only to get a first-run user to their provider fields —
  // which live in AI Config since the two modals were split. Sending it to
  // Settings left new users hunting for fields that had moved.
  assert.match(appJs, /els\.settings\.open\.addEventListener\("click", \(\) => \{[\s\S]{0,300}?noteAiSetupSettingsOpened\(\);\s*openSettings\(\);/);
  assert.match(appJs, /els\.aiSetup\.openSettings\?\.addEventListener[\s\S]{0,300}?noteAiSetupSettingsOpened\(\);[\s\S]{0,300}?openSettings\("ai-config"\);/);
});

test("the AI-required guidance names AI Config, in every locale", async () => {
  const en = (await import("../src/locales/en.js")).default.strings;
  const zh = (await import("../src/locales/zh-TW.js")).default.strings;
  // The copy must point at the modal that actually holds provider settings.
  assert.match(en.aiSetupBody2, /AI Config/);
  assert.equal(en.aiSetupOpenSettings, "Open AI Config");
  assert.match(zh.aiSetupBody2, /AI 配置/);
  assert.match(zh.aiSetupOpenSettings, /AI 配置/);
  // Neither may still send the user to Settings for providers.
  assert.doesNotMatch(en.aiSetupBody2, /\bin Settings\b/);
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

// ============================================ sequenced first-run onboarding
//
// A fresh user is shown ONE thing to do at a time, in dependency order:
//
//   Enter Library -> Tutorial -> AI Config (if no provider)
//                             -> Vault     (if no Vault)
//                             -> nothing
//
// Stage 2 stays silent until stage 1 is genuinely satisfied, so a first
// launch never lights up two controls at once and reads as a chore list.

test("the AI hint is anchored to AI Config — the button it actually opens", async () => {
  const markup = await html();
  const nav = markup.slice(markup.indexOf('<div class="lib-nav">'), markup.indexOf('id="more-control"'));
  const aiConfigAt = nav.indexOf('id="open-ai-config"');
  const hintAt = nav.indexOf('id="ai-setup-hint"');
  const settingsAt = nav.indexOf('id="open-settings"');
  assert.ok(aiConfigAt > 0 && hintAt > 0);
  assert.ok(hintAt > aiConfigAt, "the hint sits beside AI Config, not Settings");
  assert.ok(aiConfigAt > settingsAt, "AI Config still follows Settings in the nav");
  // ...and the highlight is applied to that same button.
  const fn = (await app()).slice((await app()).indexOf("function refreshAiSetupHint()"));
  assert.match(fn.slice(0, 400), /const btn = els\.aiConfig\.open;/);
  assert.doesNotMatch(fn.slice(0, 400), /els\.settings\.open/, "the highlight must not target Settings");
});

test("stage 1 applies only with no provider, after the tutorial, and not once dismissed", async () => {
  const section = await guidanceSection();
  const fn = section.slice(section.indexOf("function aiSetupGuidanceApplies()"));
  assert.match(fn.slice(0, 260), /hasSeenTutorial\(\) && !anyProviderConfigured\(\) && !aiSetupHintDone\(\)/);
});

test("stage 2 waits for a provider, then applies only while no Vault exists", async () => {
  const src = await app();
  const fn = src.slice(src.indexOf("function vaultSetupGuidanceApplies()"), src.indexOf("let vaultSetupTooltipSeen"));
  assert.ok(fn.length > 0, "vaultSetupGuidanceApplies exists");
  // The ORDERING guarantee: a provider must exist before the Vault is offered.
  assert.match(fn, /anyProviderConfigured\(\)/, "stage 2 requires stage 1 to be satisfied");
  assert.match(fn, /!vaultState\.configured/, "…and only while no Vault is connected");
  assert.match(fn, /hasSeenTutorial\(\)/, "…and never during the tutorial");
  assert.match(fn, /!vaultSetupHintDone\(\)/, "…and not once dismissed");
});

test("a configured requirement is never highlighted, and never returns", async () => {
  const src = await app();
  const ai = src.slice(src.indexOf("function refreshAiSetupHint()"), src.indexOf("// The ✕. An explicit decision"));
  const vault = src.slice(src.indexOf("function refreshVaultSetupHint()"), src.indexOf("function dismissVaultSetupHint()"));
  // Satisfying a stage retires it permanently — removing a key or
  // disconnecting a Vault later must not bring the guidance back.
  assert.match(ai, /if \(anyProviderConfigured\(\) && !aiSetupHintDone\(\)\) markAiSetupHintDone\(\);/);
  assert.match(vault, /if \(vaultState\.configured && !vaultSetupHintDone\(\)\) markVaultSetupHintDone\(\);/);
  // Both drive the same highlight class off their own `applies` result, so a
  // satisfied requirement cannot stay lit.
  for (const fn of [ai, vault]) {
    assert.match(fn, /classList\.toggle\("ai-setup-highlight", applies\);/);
    assert.match(fn, /hidden = !applies \|\| \w+TooltipSeen;/);
  }
});

test("both stages refresh together, from one entry point, at every trigger", async () => {
  const src = await app();
  const both = src.slice(src.indexOf("function refreshSetupGuidance()"), src.indexOf("function refreshSetupGuidance()") + 200);
  assert.match(both, /refreshAiSetupHint\(\);\s*refreshVaultSetupHint\(\);/, "stage 1 then stage 2");
  // Called where state can change: config load and tutorial exit.
  assert.match(src, /refreshSetupGuidance\(\);\s*\n\s*renderVaultControl\(\);/, "on config load");
  assert.match(src, /markTutorialSeen\(\);[\s\S]{0,300}?refreshSetupGuidance\(\);/, "on tutorial exit");
  // A Vault change re-evaluates stage 2 directly.
  const render = src.slice(src.indexOf("function renderVaultControl()"), src.indexOf("function renderVaultControl()") + 600);
  assert.match(render, /refreshVaultSetupHint\(\);/);
});

test("the Vault hint has its own element, its own flag, and a shared dismiss", async () => {
  const markup = await html();
  // A SIBLING of .vault-control — nesting would ride along with the dropdown,
  // which owns that element as its positioning context.
  const vaultCtl = markup.indexOf('id="vault-control"');
  const vaultHint = markup.indexOf('id="vault-setup-hint"');
  assert.ok(vaultCtl > 0 && vaultHint > vaultCtl);
  assert.match(markup, /<div class="ai-hint" id="vault-setup-hint" role="status" hidden>/, "reuses the hint style, ships hidden");
  const src = await app();
  assert.match(src, /const VAULT_SETUP_HINT_DONE_KEY = "aether\.vaultSetupHintDone";/);
  // Separate from stage 1's flag — dismissing one must not dismiss the other.
  assert.notEqual("aether.vaultSetupHintDone", "aether.aiSetupHintDone");
  assert.match(src, /els\.vaultSetupHint\.dismiss\?\.addEventListener\("click", dismissVaultSetupHint\);/);
  // Opening the picker retires the tooltip for the session only.
  assert.match(src, /noteVaultSetupOpened\(\);\s*connectVaultFirstTime\(\);/);
});

test("the stage-2 string exists in every locale and in the fallback", async () => {
  const en = (await import("../src/locales/en.js")).default.strings;
  const zh = (await import("../src/locales/zh-TW.js")).default.strings;
  for (const [name, pack] of [["en", en], ["zh-TW", zh]]) {
    assert.equal(typeof pack.vaultSetupHint, "string", `${name} missing vaultSetupHint`);
    assert.ok(pack.vaultSetupHint.length > 0, `${name} blank`);
  }
  const src = await app();
  assert.match(src, /vaultSetupHint: "Connect a Vault to save discussions",/, "EN_FALLBACK carries it too");
  assert.match(src, /setText\("vault-setup-hint-text", "vaultSetupHint"\);/, "localizeStaticUI rewrites it");
});
