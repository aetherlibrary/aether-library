// Tests for Product Config link OWNERSHIP.
//
// The problem this refactor fixed: official links appeared in two places at
// once. Support rendered in both About and MORE; Website and Discord rendered
// only in About, so they were unreachable from the menu. Two renderers, one
// data source, no agreed boundary.
//
// The boundary now:
//
//   Product Config → the official external destinations
//   MORE           → every external action
//   About          → product identity and legal information only
//
// So these tests hold two things: that there is exactly ONE product-link map
// and ONE menu mapping, and that About renders no outbound row except the
// product's own website.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as P from "../src/services/productConfig.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");
const html = () => readSource("../public/index.html");

const renderAbout = async () => {
  const src = await app();
  const start = src.indexOf("function renderAbout()");
  const end = src.indexOf("function openAbout()");
  assert.ok(start > 0 && end > start, "could not locate renderAbout");
  return src.slice(start, end);
};

// ------------------------------------------------------------ the schema

test("the product's links are exactly the five official destinations", () => {
  assert.deepEqual(P.PRODUCT_LINK_KEYS, ["website", "feedback", "github", "discord", "support"]);
  // `contact` is no longer a field of its own.
  const p = P.sanitizeProductConfig({});
  assert.deepEqual(Object.keys(p.links), ["website", "feedback", "github", "discord", "support"]);
  assert.equal(p.links.contact, undefined);
});

test("legacy contact is the fallback for feedback, and only when feedback is absent", () => {
  // Old file, never edited: contact carries the destination.
  const legacy = P.sanitizeProductConfig({ links: { contact: "https://old-form.test/a" } });
  assert.equal(legacy.links.feedback, "https://old-form.test/a");

  // Both present: the PREFERRED field wins, unambiguously.
  const both = P.sanitizeProductConfig({
    links: { contact: "https://old-form.test/a", feedback: "https://new-form.test/b" },
  });
  assert.equal(both.links.feedback, "https://new-form.test/b");

  // An empty feedback still falls back — "present but blank" is not a choice.
  const blank = P.sanitizeProductConfig({ links: { contact: "https://old-form.test/a", feedback: "" } });
  assert.equal(blank.links.feedback, "https://old-form.test/a");

  // A legacy value gets no special trust: it is sanitized like any other.
  const hostile = P.sanitizeProductConfig({ links: { contact: "javascript:alert(1)" } });
  assert.equal(hostile.links.feedback, "");
});

test("only safe protocols survive, and unknown fields are discarded", () => {
  const p = P.sanitizeProductConfig({
    links: {
      website: "https://ok.test",
      github: "javascript:alert(1)",
      discord: "file:///etc/passwd",
      support: "aetherlibrary.app",
      evil: "https://evil.test",
    },
  });
  assert.equal(p.links.website, "https://ok.test");
  assert.equal(p.links.github, "");
  assert.equal(p.links.discord, "");
  assert.equal(p.links.support, "", "a bare hostname is not a URL");
  assert.equal(p.links.evil, undefined);
  // Google Forms over HTTPS — the expected normal case for feedback.
  const forms = P.sanitizeProductConfig({ links: { feedback: "https://docs.google.com/forms/d/e/ABC/viewform" } });
  assert.equal(forms.links.feedback, "https://docs.google.com/forms/d/e/ABC/viewform");
});

test("loading never writes the product file", async () => {
  const src = await readSource("../src/services/productConfig.js");
  // Read-only by construction: no write API is imported or called anywhere,
  // so a legacy config keeps its `contact` field until edited by hand.
  assert.doesNotMatch(src, /writeFile|appendFile|mkdir|rename|unlink/);
  assert.match(src, /fs\.readFile\(PRODUCT_CONFIG_PATH/);
  // ...and no route writes it either.
  const server = await readSource("../src/server.js");
  assert.doesNotMatch(server, /app\.post\("\/api\/product/);
  assert.doesNotMatch(server, /app\.put\("\/api\/product/);
});

// -------------------------------------------------------------- the menu

test("MORE lists guidance, then every external destination, then About", async () => {
  const htmlSrc = await html();
  const menu = htmlSrc.slice(htmlSrc.indexOf('id="more-menu"'), htmlSrc.indexOf("</div>", htmlSrc.indexOf('id="more-about"')));
  // Ids in document order, with the separators in place.
  const order = [...menu.matchAll(/<(?:button[^>]*id="(more-[\w-]+)"|hr\s*\/>)/g)].map((m) => m[1] || "hr");
  assert.deepEqual(order, [
    "more-tutorial",
    "more-learn",
    "hr",
    "more-report",
    "more-website",
    "more-github",
    "more-discord",
    "more-support",
    "hr",
    "more-about",
  ]);
  // No Contact entry.
  assert.doesNotMatch(menu, /more-contact|Contact/);
});

test("one map, in one direction, from product field to MORE entry", async () => {
  const src = await app();
  assert.match(
    src,
    /const PRODUCT_LINK_FOR_MENU = \{\s*feedback: "feedback",\s*website: "website",\s*github: "github",\s*discord: "discord",\s*support: "support",\s*\};/
  );
  // Report & Feedback resolves the FEEDBACK field — not the legacy contact.
  assert.match(src, /els\.more\.report\.addEventListener\("click", \(\) => \{\s*if \(openFixedLink\("feedback"\)\)/);
  assert.doesNotMatch(src, /openFixedLink\("reportIssue"\)/);
  // No second source and no stale fallback map survives.
  assert.doesNotMatch(src, /reportIssue: "contact"/);
  assert.doesNotMatch(src, /PRODUCT_LINK_FOR_MENU\[key\] \|\| key/, "no implicit passthrough");
  // Each of the five is wired to its own entry, once.
  for (const key of ["feedback", "website", "github", "discord", "support"]) {
    assert.equal((src.match(new RegExp(`openFixedLink\\("${key}"\\)`, "g")) || []).length, 1, `${key} wired once`);
  }
});

test("an unconfigured link disables its entry; a valid one enables it", async () => {
  const src = await app();
  assert.match(
    src,
    /const entries = \[\s*\[els\.more\.report, "feedback"\],\s*\[els\.more\.website, "website"\],\s*\[els\.more\.github, "github"\],\s*\[els\.more\.discord, "discord"\],\s*\[els\.more\.support, "support"\],\s*\]/
  );
  assert.match(src, /const ok = Boolean\(fixedLinkUrl\(key\)\);\s*btn\.disabled = !ok;/);
  // fixedLinkUrl only yields a URL for a link the server marked configured.
  assert.match(src, /return link\?\.configured && link\.url \? link\.url : "";/);
  // The service marks `configured` from the sanitized value, so an invalid
  // URL can never enable an entry.
  const p = P.runtimeProduct({ links: { website: "javascript:alert(1)", github: "https://ok.test" } });
  assert.equal(p.links.website.configured, false);
  assert.equal(p.links.website.url, "");
  assert.equal(p.links.github.configured, true);
});

test("external links open only on click, through the safe opener", async () => {
  const src = await app();
  // The opener itself is unchanged and still hardened.
  assert.match(src, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
  // Every entry opens from a click handler, never at render time.
  const sync = src.slice(src.indexOf("function syncMoreMenuLinks()"), src.indexOf("function openFixedLink("));
  assert.doesNotMatch(sync, /window\.open|openExternalUrl/, "syncing must never open anything");
});

test("no Scene, World or preset data can reach the official links", async () => {
  const src = await app();
  // The map and its resolver only — the unrelated sceneUiText() helper sits
  // between them and the sync function.
  const mapAt = src.indexOf("const PRODUCT_LINK_FOR_MENU");
  const menuMap = src.slice(mapAt, src.indexOf("function sceneUiText(", mapAt));
  assert.doesNotMatch(menuMap, /sceneUi|state\.world|__sceneEditor|preset/i);
  // Product is loaded from its own route, independent of any Scene load.
  assert.match(src, /product = await api\("\/api\/product"\)/);
  // Neither Scene nor World data has a links field in its SHAPE — checked on
  // the sanitized output rather than on source text, because sceneContent.js
  // legitimately names the legacy fields in the code that DISCARDS them.
  const sceneContent = await import("../src/services/sceneContent.js");
  const worldContent = await import("../src/services/worldContent.js");
  const scene = sceneContent.sanitizeSceneContent({ links: { website: "https://evil.test" }, about: "x" });
  assert.equal(scene.links, undefined, "a Scene cannot carry links");
  assert.equal(scene.about, undefined);
  const world = worldContent.sanitizeSceneWorld({ links: { website: "https://evil.test" } });
  assert.equal(world.links, undefined, "a World snapshot cannot carry links");
  // ...and a preset built from one cannot smuggle them either.
  const preset = worldContent.sceneWorldToPreset(world, "x");
  assert.equal(preset.links, undefined);
});

// ------------------------------------------------------------- the About

test("About shows identity and legal information, plus one website line", async () => {
  const fn = await renderAbout();
  // Title, product name, version, description, website, copyright, Close.
  assert.match(fn, /str\("aboutTitle"\)/);
  assert.match(fn, /currentConfig\?\.appVersion/);
  assert.match(fn, /sceneUiText\(product\?\.description\)/);
  assert.match(fn, /const site = productLinks\?\.website;/);
  assert.match(fn, /product\?\.copyright/);
  assert.match(fn, /str\("aboutClose"\)/);
  // The website opens the FULL validated URL while showing the hostname.
  assert.match(fn, /new URL\(siteUrl\)\.hostname\.replace\(\/\^www\\\.\/, ""\)/);
  assert.match(fn, /openExternalUrl\(siteUrl\)/);
  assert.match(fn, /btn\.textContent = host;/);
});

test("About renders no other outbound row", async () => {
  const fn = await renderAbout();
  const htmlSrc = await html();
  // The old link list is gone from both the renderer and the markup.
  assert.doesNotMatch(fn, /about\.links/);
  assert.doesNotMatch(htmlSrc, /id="about-links"/);
  // Not one of the four belongs in About any more.
  for (const forbidden of [/github/i, /discord/i, /support/i, /feedback/i, /contact/i]) {
    assert.doesNotMatch(fn, forbidden, `About must not render ${forbidden}`);
  }
  // Only ONE product link is read at all.
  const reads = [...fn.matchAll(/productLinks\?\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(reads)], ["website"]);
});

test("the app version still comes from package.json, never from the product file", async () => {
  const fn = await renderAbout();
  assert.match(fn, /const version = currentConfig\?\.appVersion \|\| "";/);
  // The product config has no version-of-the-app field to compete with it.
  const product = P.sanitizeProductConfig({ appVersion: "9.9.9", version: 1 });
  assert.equal(product.appVersion, undefined);
  const pkg = JSON.parse(await readSource("../package.json"));
  const cfg = await readSource("../src/config.js");
  assert.match(cfg, /package\.json/);
  assert.equal(pkg.version, "1.1.0");
});

// ------------------------------------------------------------ the copy

test("both locales carry the new labels, and the retired ones are gone", async () => {
  const en = await readSource("../src/locales/en.js");
  const zh = await readSource("../src/locales/zh-TW.js");
  const appJs = await app();
  const expected = {
    moreReportIssue: ["Report & Feedback", "回報問題與意見"],
    moreWebsite: ["Official Website", "官方網站"],
    moreDiscord: ["Join Discord", "加入 Discord 社群"],
    moreSupport: ["Support Aether Library", "支持 Aether Library"],
    aboutWebsiteLead: ["Learn more at", "了解更多："],
  };
  for (const [key, [enText, zhText]] of Object.entries(expected)) {
    assert.ok(en.includes(`${key}: "${enText}"`), `en ${key}`);
    assert.ok(zh.includes(`${key}: "${zhText}"`), `zh-TW ${key}`);
    assert.ok(appJs.includes(`${key}: "`), `EN_FALLBACK ${key}`);
  }
  // The About-only link labels had exactly one consumer, which is gone.
  for (const dead of ["linkType_website", "linkType_discord", "linkType_email", "aboutGithub"]) {
    for (const [name, src] of [["en", en], ["zh-TW", zh], ["app.js", appJs]]) {
      assert.ok(!src.includes(`${dead}:`), `${name} still declares ${dead}`);
    }
  }
  // The two new menu entries are localized like every other one.
  assert.match(appJs, /setText\("more-website", "moreWebsite"\);/);
  assert.match(appJs, /setText\("more-discord", "moreDiscord"\);/);
});

// ------------------------------------------------------------- shipped file

test("the shipped product.json matches the new schema and documents ownership", async () => {
  const raw = JSON.parse(await readSource("../config/product.json"));
  assert.deepEqual(Object.keys(raw.links).sort(), ["discord", "feedback", "github", "support", "website"]);
  assert.equal(raw.links.contact, undefined, "the legacy field is not shipped");
  // Every shipped value survives sanitization (a stale bare hostname would
  // silently disable the entry).
  const clean = P.sanitizeProductConfig(raw);
  for (const key of P.PRODUCT_LINK_KEYS) {
    if (raw.links[key]) assert.equal(clean.links[key], raw.links[key], `${key} must survive sanitization`);
  }
  // The note states the ownership boundary rather than describing the file.
  for (const phrase of ["MANUALLY", "MORE menu reads", "About reads", "never Scene data", "never part of a preset", "package.json"]) {
    assert.ok(raw._note.includes(phrase), `_note must mention "${phrase}"`);
  }
});

// ----------------------------------------------------------------- reload

test("Tutorial and Learn are untouched by this refactor", async () => {
  const appJs = await app();
  // Still the first two MORE entries, still their own handlers.
  assert.match(appJs, /setText\("more-tutorial", "moreTutorial"\);/);
  assert.match(appJs, /setText\("more-learn", "moreLearn"\);/);
  // Neither is a product LINK — they are in-app surfaces, so they never
  // appear in the link map or the enable/disable sync.
  assert.doesNotMatch(appJs, /PRODUCT_LINK_FOR_MENU[\s\S]{0,200}?tutorial/);
  const sync = appJs.slice(appJs.indexOf("function syncMoreMenuLinks()"), appJs.indexOf("function openFixedLink("));
  assert.doesNotMatch(sync, /tutorial|learn/i);
});
