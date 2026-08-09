// Tests for the Product / Content / World separation refactor.
//
// Two concerns, both new:
//   PRODUCT      the application's own identity and official links, stored
//                once, edited by hand, and unreachable from Scene or World
//                data (the security boundary in §6).
//   CUSTOM NAMES seven runtime display overrides on World Content, with
//                strict display-name validation and final-wins priority.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let P;
let W;
let L;
let tmpRoot;
let productPath;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-product-"));
  productPath = path.join(tmpRoot, "product.json");
  process.env.PRODUCT_CONFIG_PATH = productPath;
  process.env.WORLD_CONTENT_PATH = path.join(tmpRoot, "w.json");
  process.env.WORLD_PRESET_DIR = path.join(tmpRoot, "world-presets");
  P = await import("../src/services/productConfig.js");
  W = await import("../src/services/worldContent.js");
  L = await import("../src/localization.js");
});

after(async () => {
  delete process.env.PRODUCT_CONFIG_PATH;
  delete process.env.WORLD_CONTENT_PATH;
  delete process.env.WORLD_PRESET_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(productPath, { force: true });
  L.setWorldIdentity(null, null);
});

// ============================================================== PRODUCT

test("product config defaults to no links at all", async () => {
  const p = await P.loadProductConfig();
  assert.deepEqual(Object.keys(p.links).sort(), [...P.PRODUCT_LINK_KEYS].sort());
  for (const key of P.PRODUCT_LINK_KEYS) assert.equal(p.links[key], "", `${key} must start empty`);
  assert.ok(p.copyright.length > 0);
});

test("a malformed product file falls back instead of crashing", async () => {
  await fs.writeFile(productPath, "{ not json", "utf8");
  const p = await P.loadProductConfig();
  assert.equal(p.links.website, "");
});

test("unsafe product URLs never survive", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "/relative", "not a url", ""]) {
    assert.equal(P.sanitizeProductUrl(url), "", `${url} must be rejected`);
    assert.equal(P.sanitizeProductConfig({ links: { website: url } }).links.website, "");
  }
  assert.equal(P.sanitizeProductUrl("https://ok.test/x"), "https://ok.test/x");
});

test("mailto is accepted only for the feedback link", () => {
  // `feedback` inherited the allowance from the old `contact` field, so a
  // legacy mailto address keeps working after the rename. Every other link
  // is still http/https only.
  const p = P.sanitizeProductConfig({
    links: { feedback: "mailto:hi@example.com", github: "mailto:hi@example.com", website: "mailto:hi@example.com" },
  });
  assert.equal(p.links.feedback, "mailto:hi@example.com");
  assert.equal(p.links.github, "");
  assert.equal(p.links.website, "");
});

test("unknown product link keys are discarded", () => {
  const p = P.sanitizeProductConfig({ links: { evil: "https://evil.test", website: "https://ok.test" } });
  assert.equal(p.links.evil, undefined);
  assert.equal(p.links.website, "https://ok.test");
  assert.deepEqual(Object.keys(p.links).sort(), [...P.PRODUCT_LINK_KEYS].sort());
});

test("product description locales are not hardcoded", () => {
  const p = P.sanitizeProductConfig({ description: { en: "EN", "zh-TW": "ZH", ja: "JA", de: "DE" } });
  assert.deepEqual(Object.keys(p.description).sort(), ["de", "en", "ja", "zh-TW"]);
});

test("§6 — the product carries no Scene or World fields, and has no write path", () => {
  const p = P.sanitizeProductConfig({
    links: { website: "https://ok.test" },
    // Things a Scene or World might try to smuggle in:
    identity: { alpha: { en: "Hijack" } },
    sceneId: "evil_scene",
    tutorial: { steps: [] },
    customNames: { alpha: "Hijack" },
  });
  for (const key of ["identity", "sceneId", "tutorial", "customNames"]) {
    assert.equal(p[key], undefined, `${key} must never enter the product config`);
  }
  assert.deepEqual(Object.keys(p).sort(), ["copyright", "description", "learn", "links", "version"]);
  // There is deliberately no save/write export at all.
  assert.equal(typeof P.saveProductConfig, "undefined", "the running app must have no write path");
});

test("the runtime product view marks unconfigured links and exposes no path", () => {
  const runtime = P.runtimeProduct({ links: { website: "https://ok.test", github: "" } });
  assert.deepEqual(runtime.links.website, { url: "https://ok.test", configured: true });
  assert.deepEqual(runtime.links.github, { url: "", configured: false });
  const json = JSON.stringify(runtime);
  for (const leak of [tmpRoot, "C:", "/home/", "node_modules"]) assert.ok(!json.includes(leak));
});

// ========================================================= CUSTOM NAMES

test("the seven override fields exist and default to empty", () => {
  assert.deepEqual(W.CUSTOM_NAME_KEYS, ["grand_sage", "alpha", "beta", "gamma", "traveler1", "traveler2", "pet"]);
  const c = W.defaultWorldContent();
  for (const key of W.CUSTOM_NAME_KEYS) assert.equal(c.customNames[key], "");
});

test("valid custom names from any script are accepted", () => {
  for (const name of ["Professor", "老師", "山田先生", "オラクル", "Merlin", "Agent 47", "R2-D2", "Мерлин", "مرلين"]) {
    assert.equal(W.sanitizeCustomName(name), name, `${name} must be accepted`);
  }
});

test("custom names are trimmed and repeated spaces collapsed", () => {
  assert.equal(W.sanitizeCustomName("  The   Grand    Sage  "), "The Grand Sage");
});

test("invalid custom names are rejected", () => {
  const bad = {
    blank: "",
    whitespace: "   ",
    pureNumber: "12345",
    symbolsOnly: "!!!***",
    punctuation: "---",
    url: "https://evil.test",
    schemeOnly: "http://evil.test",
    www: "www.evil.test",
    email: "someone@example.com",
    controlChar: "Bad\u0000Name",
    newline: "Line one\nLine two",
    tooLong: "x".repeat(41),
    notAString: 42,
  };
  for (const [why, value] of Object.entries(bad)) {
    assert.equal(W.sanitizeCustomName(value), "", `${why} must be rejected`);
  }
  // 40 Unicode characters is the boundary, counted in code points.
  assert.equal(W.sanitizeCustomName("あ".repeat(40)), "あ".repeat(40));
  assert.equal(W.sanitizeCustomName("あ".repeat(41)), "");
});

test("an invalid override sanitizes to 'no override' without failing the save", () => {
  const c = W.sanitizeWorldContent({ customNames: { alpha: "https://evil.test", beta: "Professor" } });
  assert.equal(c.customNames.alpha, "", "invalid becomes no override");
  assert.equal(c.customNames.beta, "Professor", "the valid one survives");
});

test("priority: custom name > localized world name > English > built-in", () => {
  const world = W.sanitizeWorldContent({
    identity: { alpha: { en: "Percival", "zh-TW": "天樞" } },
    customNames: { alpha: "Professor" },
  });
  L.setWorldIdentity(W.worldIdentityPacks(world), world.customNames);
  // 1. custom wins everywhere, in every locale
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "en", replyLanguage: "en" }), "Professor");
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "zh-TW" }), "Professor");
  assert.equal(L.identityFor("zh-TW").scholars[1], "Professor");
  // 2. no override -> the localized world name
  assert.equal(L.formatPersonaName("beta", { interfaceLanguage: "en", replyLanguage: "en" }), "Oracle");
  // 3/4. an unnamed character falls back through English to the built-in name
  assert.equal(L.formatPersonaName("gamma", { interfaceLanguage: "zh-TW", replyLanguage: "zh-TW" }), "理者");
});

test("§3 — an override is FINAL: no bilingual name is ever appended", () => {
  const world = W.sanitizeWorldContent({
    identity: { alpha: { en: "Percival", "zh-TW": "天樞" }, beta: { en: "Galahad", "zh-TW": "天璇" } },
    customNames: { alpha: "Professor" },
  });
  L.setWorldIdentity(W.worldIdentityPacks(world), world.customNames);
  // Overridden: one name only, in both directions.
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "zh-TW", replyLanguage: "en" }), "Professor");
  assert.equal(L.formatPersonaName("alpha", { interfaceLanguage: "en", replyLanguage: "zh-TW" }), "Professor");
  // Not overridden: the bilingual rule still applies.
  assert.equal(L.formatPersonaName("beta", { interfaceLanguage: "zh-TW", replyLanguage: "en" }), "天璇（Galahad）");
});

test("custom names never replace engine ids", () => {
  const world = W.sanitizeWorldContent({ customNames: { alpha: "Professor" } });
  L.setWorldIdentity(W.worldIdentityPacks(world), world.customNames);
  assert.equal(L.personaIdForSlot(1), "alpha", "the engine id is untouched");
  assert.equal(L.enginePersonaId("Professor"), null, "a display name is never a lookup key");
  assert.equal(L.customPersonaName("alpha"), "Professor");
  assert.equal(L.customPersonaName("beta"), "", "no override");
});

test("traveler and pet overrides are stored but do not touch council identity", () => {
  const world = W.sanitizeWorldContent({ customNames: { traveler1: "Ada", traveler2: "Rin", pet: "Mochi" } });
  L.setWorldIdentity(W.worldIdentityPacks(world), world.customNames);
  assert.equal(world.customNames.traveler1, "Ada");
  assert.equal(world.customNames.pet, "Mochi");
  // The four council characters are unaffected by them.
  assert.equal(L.identityFor("en").judge, "Grand Sage");
  assert.equal(L.identityFor("en").scholars[1], "Architect");
});

// ================================================= LOCALES NOT HARDCODED

test("§5 — world locales are enumerated from the data, not hardcoded", () => {
  const withJa = W.sanitizeWorldContent({
    identity: { alpha: { en: "Percival", "zh-TW": "天樞", ja: "パーシヴァル" } },
  });
  assert.equal(withJa.identity.alpha.ja, "パーシヴァル", "an unknown locale survives sanitization");
  const locales = W.worldLocales(withJa);
  assert.ok(locales.includes("ja"), "the editor would enumerate ja automatically");
  assert.equal(locales[0], "en", "the fallback locale is listed first");
  // A world with no data at all still yields the seed locales.
  assert.deepEqual(W.worldLocales(null).sort(), [...W.WORLD_SEED_LOCALES].sort());
});

// ============================ §A — relaxed custom-name validation

test("§A/1-4. dotted real-world names are accepted", () => {
  // The previous rule inferred a domain from any "label.tld" run and rejected
  // all of these. Domain inference WITHOUT a scheme or www prefix is now
  // deliberately not attempted.
  for (const name of ["St.Louis", "St. Louis", "Dr. Who", "A.I. Sage", "Mr. X", "J.R.R. Tolkien"]) {
    assert.equal(W.sanitizeCustomName(name), name, `${name} must be accepted`);
  }
});

test("§A/5-7. self-declared links and addresses are still rejected", () => {
  for (const bad of [
    "http://evil.test",
    "https://evil.test/path",
    "ftp://evil.test",
    "www.evil.test",
    "WWW.EVIL.TEST",
    "Visit www.evil.test now",
    "someone@example.com",
    "Contact me at someone@example.com",
  ]) {
    assert.equal(W.sanitizeCustomName(bad), "", `${bad} must be rejected`);
  }
});

test("§A/8. Unicode names from any script remain accepted", () => {
  for (const name of ["老師", "山田先生", "オラクル", "Мерлин", "مرلين", "Σοφός", "현자"]) {
    assert.equal(W.sanitizeCustomName(name), name);
  }
});

test("§A. the other rules are unchanged by the relaxation", () => {
  assert.equal(W.sanitizeCustomName("  The   Grand    Sage  "), "The Grand Sage", "trim + collapse");
  assert.equal(W.sanitizeCustomName("あ".repeat(40)), "あ".repeat(40), "40 code points is the limit");
  assert.equal(W.sanitizeCustomName("あ".repeat(41)), "", "41 is too many");
  assert.equal(W.sanitizeCustomName("12345"), "", "pure numbers");
  assert.equal(W.sanitizeCustomName("!!!***"), "", "symbols only");
  assert.equal(W.sanitizeCustomName("Line\nBreak"), "", "line breaks");
  assert.equal(W.sanitizeCustomName("Bad\u0007Name"), "", "control characters");
});
