// Batch B — Learn content, version source, external-link safety and the
// Tutorial's wiring guarantees.
//
// The old appLinks.js module is gone: official links moved to the product
// configuration (config/product.json). What remains here are the guarantees
// that outlived it.
//
// The link-safety rules are real behavior (pure module), so those are proper
// behavioral tests. The Tutorial/MORE UI has no DOM available in this project
// (no jsdom — same precedent as bookHotspotPointerEvents.test.js), so those
// are source-level guards for the specific promises that matter: no API call,
// resilient missing targets, and localStorage-only persistence.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// Learn prose moved out of the locale packs into ONE authoritative content
// resource (assets/content/learn/default.json). These requirements still
// hold — they are now asserted against that resource.
import { learnSectionsFor as learnFromResource } from "../src/services/contentResources.js";

const LEARN_RESOURCE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "assets", "content", "learn", "default.json"), "utf8")
);
const learnSectionsFor = (lang) => learnFromResource(LEARN_RESOURCE, lang);
const LEARN_SECTIONS = LEARN_RESOURCE.locales;

// ------------------------------------------------------------------ links

// ------------------------------------------------------------------- learn

test("Learn ships the full set of required sections, in both languages, with matching ids", () => {
  const required = [
    "getting-started", "providers", "council", "mentor", "model-check", "vault",
    "archives", "obsidian", "materials", "privacy", "api-usage", "troubleshooting",
  ];
  for (const lang of ["en", "zh-TW"]) {
    const ids = learnSectionsFor(lang).map((s) => s.id);
    assert.deepEqual(ids, required, `${lang} must provide every section in order`);
  }
});

test("every Learn section has a title and at least one content block, in both languages", () => {
  for (const lang of ["en", "zh-TW"]) {
    for (const section of learnSectionsFor(lang)) {
      assert.ok(section.title && section.title.trim(), `${lang}/${section.id} needs a title`);
      assert.ok(Array.isArray(section.blocks) && section.blocks.length, `${lang}/${section.id} needs blocks`);
      for (const b of section.blocks) {
        if (b.type === "list") assert.ok(Array.isArray(b.items) && b.items.length);
        else assert.ok(typeof b.text === "string" && b.text.trim());
      }
    }
  }
});

test("an unknown language falls back to the English guide wholesale, never to an empty one", () => {
  assert.deepEqual(learnSectionsFor("de"), LEARN_SECTIONS.en);
  assert.ok(learnSectionsFor("de").length > 0);
});

test("Learn is user-facing prose — no internal module names, file paths, or architecture jargon leak into it", () => {
  const forbidden = [
    "publicConfig", "sceneConfig", "app.js", "src/", ".js", "localStorage",
    "ackSignature", "endpoint", "middleware", "sanitize",
  ];
  for (const lang of ["en", "zh-TW"]) {
    const text = JSON.stringify(learnSectionsFor(lang));
    for (const term of forbidden) {
      assert.ok(!text.includes(term), `${lang} guide must not mention "${term}"`);
    }
  }
});

test("Privacy section makes no unsupported on-device promise and states that data is sent to providers", () => {
  const en = learnSectionsFor("en").find((s) => s.id === "privacy");
  const text = en.blocks.map((b) => b.text || (b.items || []).join(" ")).join(" ");
  assert.match(text, /sent to the AI providers you selected/i, "must state data leaves the device");
  assert.match(text, /does not claim that everything always stays on your device/i);
});

test("API usage section explains relative cost without inventing monetary figures", () => {
  const en = learnSectionsFor("en").find((s) => s.id === "api-usage");
  const text = JSON.stringify(en);
  // The mode names are written either bare or as "<name> Mode" depending on
  // the sentence — the claim being tested is the RELATIVE request cost, not
  // the exact label, so the optional word must not fail the test.
  assert.match(text, /Mentor(?: Mode)? generally makes the fewest requests/i);
  assert.match(text, /Council(?: Mode)? generally uses more/i);
  assert.match(text, /does not estimate monetary cost/i);
  assert.doesNotMatch(text, /\$\d|USD|per 1M tokens/i, "no price figures may be invented");
});

// ------------------------------------------------------------------ config

test("the application version is read from package.json, not hardcoded a second time", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  const configSrc = fs.readFileSync(path.join(process.cwd(), "src", "config.js"), "utf8");
  assert.match(configSrc, /JSON\.parse\(fs\.readFileSync\(path\.join\(projectRoot, "package\.json"\)/);
  // The literal version must not additionally appear as a string in config.js.
  assert.ok(!configSrc.includes(`"${pkg.version}"`), "config.js must not restate the version literal");
});

// -------------------------------------------------------------- app wiring

// Line endings are normalized: a git checkout may materialize CRLF while the
// working tree has LF, and these assertions are about code structure, not
// whitespace. (Same convention as test/runtimeControls.test.js.)
const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8").replace(/\r\n/g, "\n");

function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

test("Tutorial persistence is a single localStorage flag — never server config", () => {
  assert.match(appJs, /const TUTORIAL_SEEN_KEY = "aether\.tutorialSeen"/);
  const load = extractFn(appJs, "function hasSeenTutorial()");
  const save = extractFn(appJs, "function markTutorialSeen()");
  assert.match(load, /localStorage\.getItem\(TUTORIAL_SEEN_KEY\)/);
  assert.match(save, /localStorage\.setItem\(TUTORIAL_SEEN_KEY/);
  for (const fn of [load, save]) {
    assert.doesNotMatch(fn, /fetch\(|saveSettings|\/api\//, "tutorial state must never touch the server");
  }
});

test("blocked storage fails safe: the tutorial does not re-interrupt on every launch", () => {
  const load = extractFn(appJs, "function hasSeenTutorial()");
  // The catch must return true ("treat as seen"), not false.
  assert.match(load, /catch\s*{[\s\S]*return true;/);
});

test("both finishing AND dismissing record the tutorial as seen", () => {
  const end = extractFn(appJs, "function endTutorial()");
  assert.match(end, /markTutorialSeen\(\)/);
  // Skip and ESC both route through endTutorial.
  assert.match(appJs, /els\.tutorial\.skip\.addEventListener\("click", endTutorial\)/);
  assert.match(appJs, /if \(tutorialOpen\) endTutorial\(\);/);
});

test("MORE > Tutorial always replays from step 0, regardless of the seen flag", () => {
  assert.match(appJs, /els\.more\.tutorial\.addEventListener\("click", \(\) => startTutorial\(0\)\)/);
  const start = extractFn(appJs, "function startTutorial(fromIndex = 0)");
  assert.doesNotMatch(start, /hasSeenTutorial/, "replay must not be gated by the seen flag");
});

test("auto-start is the ONLY path gated by the seen flag", () => {
  const auto = extractFn(appJs, "function maybeAutoStartTutorial()");
  assert.match(auto, /if \(hasSeenTutorial\(\)\) return;/);
});

test("a missing tutorial target degrades to a centered callout and never throws", () => {
  const pos = extractFn(appJs, "function positionTutorial()");
  // The lookup moved into the safe target registry (Phase 2): a step now
  // names a target by ID, and tutorialTargetEl() converts an unknown id or a
  // throwing lookup into null — which this function still centres.
  const lookup = extractFn(appJs, "function tutorialTargetEl(targetId)");
  assert.match(lookup, /catch\s*{[\s\S]*return null;/, "a throwing lookup is treated as not-found");
  assert.match(lookup, /if \(typeof lookup !== "function"\) return null;/, "an unknown target id is not-found");
  assert.match(pos, /tutorialTargetEl\(step\?\.target\)/);
  assert.match(pos, /el && el\.isConnected/, "a detached element counts as missing");
  assert.match(pos, /rect\.width > 0 && rect\.height > 0/, "a zero-sized target counts as missing");
  assert.match(pos, /ring\.hidden = true;/);
  assert.match(pos, /translate\(-50%, -50%\)/, "callout centres itself instead of blocking");
});

test("the Tutorial makes no request and reads no AI/config state — replaying it cannot change data", () => {
  for (const sig of [
    "function startTutorial(fromIndex = 0)",
    "function renderTutorial()",
    "function positionTutorial()",
    "function endTutorial()",
    "function tutorialNext()",
  ]) {
    const fn = extractFn(appJs, sig);
    assert.doesNotMatch(fn, /fetch\(|runCouncilPrecheck|saveSettings|currentConfig/, `${sig} must stay inert`);
  }
});

test("external links open safely and never navigate to an unconfigured placeholder", () => {
  // openExternalLink()/publicConfig().links are gone: official links now come
  // only from the product configuration. The safety guarantees they protected
  // live in the one shared opener.
  const opener = extractFn(appJs, "function openExternalUrl(url)");
  assert.match(opener, /"noopener,noreferrer"/, "opened page must not receive a window.opener handle");
  assert.match(opener, /protocol !== "https:" && parsed\.protocol !== "http:"/, "only web protocols are browsed to");
  assert.match(opener, /if \(typeof url !== "string" \|\| !url\) return false;/, "an empty URL is never opened");
  // A placeholder is still never opened: the MORE entry resolves through the
  // product config and yields "" when unconfigured.
  const fixed = extractFn(appJs, "function fixedLinkUrl(key)");
  assert.match(fixed, /link\?\.configured && link\.url \? link\.url : ""/);
  assert.doesNotMatch(appJs, /function openExternalLink\(/, "the dead publicConfig-based opener is gone");
  assert.doesNotMatch(appJs, /currentConfig\?\.links/, "publicConfig().links has no consumer left");
});

test("MORE and Vault dropdowns are mutually exclusive and both close on outside click", () => {
  // Exclusion is now symmetric by construction: BOTH toggles route through
  // one helper that closes every dropdown before opening the requested one,
  // so opening Vault closes MORE just as opening MORE closes Vault (the old
  // one-directional version left both menus visible).
  assert.match(extractFn(appJs, "function toggleMoreMenu()"), /toggleDropdown\(els\.more\.menu\)/);
  assert.match(extractFn(appJs, "function toggleVaultMenu()"), /toggleDropdown\(els\.vault\.menu\)/);
  const toggle = extractFn(appJs, "function toggleDropdown(menu)");
  assert.match(toggle, /closeAllDropdowns\(\)/, "opening any dropdown closes the others");
  assert.match(toggle, /if \(wasOpen\) return;/, "re-clicking an open toggle closes it");
  // One outside-click listener now covers both menus.
  assert.match(appJs, /if \(dropdowns\(\)\.some\(\(d\) => d\.control\.contains\(event\.target\)\)\) return;/);
  assert.match(appJs, /closeAllDropdowns\(\);\n\}\);/);
});

test("Learn and About render from config/locale data and issue no request", () => {
  for (const sig of ["function renderLearn()", "function renderAbout()", "function openLearn()", "function openAbout()"]) {
    assert.doesNotMatch(extractFn(appJs, sig), /fetch\(|runCouncilPrecheck|await /, `${sig} must be inert`);
  }
});

test("About uses the served version and reuses the existing product attribution rather than restating it", () => {
  const fn = extractFn(appJs, "function renderAbout()");
  assert.match(fn, /currentConfig\?\.appVersion/);
  assert.match(fn, /str\("startCopyright"\)/, "attribution falls back to the existing single source");
  // About is PRODUCT surface now: its description, copyright and every link
  // come from the product configuration, never from Scene or World data, so
  // loading another Scene can never repoint an official link (§6).
  assert.match(fn, /product\?\.copyright/, "copyright comes from the product config");
  assert.match(fn, /sceneUiText\(product\?\.description\)/, "description comes from the product config");
  // About now shows ONE outbound line — the product's own website. Every
  // other external destination belongs to MORE, so there is no link list
  // here that could drift out of step with the menu.
  assert.match(fn, /const site = productLinks\?\.website;/, "the website comes from the product config");
  assert.match(fn, /els\.about\.website\.hidden = !siteUrl;/, "an unconfigured website shows no line");
  assert.doesNotMatch(fn, /sceneUi\?\.(about|links)/, "About must not read Scene UI Content");
});

test("Batch A Product Status behaviour is untouched by Batch B", () => {
  assert.match(appJs, /function openProductStatus\(\)/);
  assert.match(appJs, /els\.productStatus\.openBtn\.addEventListener\("click", openProductStatus\)/);
  const open = extractFn(appJs, "function openProductStatus()");
  assert.doesNotMatch(open, /fetch\(|runCouncilPrecheck/);
});
