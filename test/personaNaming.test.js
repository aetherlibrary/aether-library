// Tests for the multilingual persona-name formatter (src/localization.js).
//
// Persona IDENTITY is a canonical id (grand_sage / architect / oracle /
// analyst); the displayed name is resolved per language. Prompts get the
// bilingual form when the interface and reply languages differ; the UI never
// does.
//
// Japanese is used here as the "third locale" proof that adding a language is
// a data change, not a logic change. There is no Japanese UI locale in the
// product yet, so these tests register a small controlled fixture through the
// same registry the real locales use — deliberately NOT building a Japanese
// UI in this task.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let L;
let IDENTITY_PACKS;

before(async () => {
  L = await import("../src/localization.js");
  ({ IDENTITY_PACKS } = L);
});

// ------------------------------------------------------- same-language rule

test("19. zh-TW interface + zh-TW reply -> one name only", () => {
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "zh-TW", replyLanguage: "zh-TW" }),
    "謀者"
  );
});

test("22. English interface + English reply -> one name only", () => {
  assert.equal(L.formatPersonaName("architect", { interfaceLanguage: "en", replyLanguage: "en" }), "Architect");
  assert.equal(L.formatPersonaName("grand_sage", { interfaceLanguage: "en", replyLanguage: "en" }), "Grand Sage");
});

// -------------------------------------------------- different-language rule

test("20. zh-TW interface + English reply -> 謀者（Architect） with full-width parentheses", () => {
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    "謀者（Architect）"
  );
  assert.equal(
    L.formatPersonaName("grand_sage", { interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    "大智者（Grand Sage）"
  );
});

test("21. English interface + zh-TW reply -> Architect (謀者) with Latin parentheses", () => {
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "en", replyLanguage: "zh-TW" }),
    "Architect (謀者)"
  );
  assert.equal(L.formatPersonaName("oracle", { interfaceLanguage: "en", replyLanguage: "zh-TW" }), "Oracle (墨者)");
  assert.equal(L.formatPersonaName("analyst", { interfaceLanguage: "en", replyLanguage: "zh-TW" }), "Analyst (理者)");
});

test("the primary name always follows the INTERFACE language, in both directions", () => {
  const zhFirst = L.formatPersonaName("oracle", { interfaceLanguage: "zh-TW", replyLanguage: "en" });
  const enFirst = L.formatPersonaName("oracle", { interfaceLanguage: "en", replyLanguage: "zh-TW" });
  assert.ok(zhFirst.startsWith("墨者"), zhFirst);
  assert.ok(enFirst.startsWith("Oracle"), enFirst);
});

// ------------------------------------------------------- a third locale (ja)
// Registered through the same IDENTITY_PACKS registry the real locales
// populate — proving a new language needs locale DATA only.

test("23/24. Japanese interface/reply works through locale data alone", () => {
  IDENTITY_PACKS.ja = { judge: "大賢者", scholars: { 1: "策士", 2: "predictor", 3: "分析者" } };
  try {
    // 23. Japanese interface + English reply -> full-width parentheses (ja is
    //     a CJK language, matched by prefix data, with no locale file yet).
    assert.equal(
      L.formatPersonaName("architect", { interfaceLanguage: "ja", replyLanguage: "en" }),
      "策士（Architect）"
    );
    // 24. English interface + Japanese reply -> Latin parentheses.
    assert.equal(
      L.formatPersonaName("architect", { interfaceLanguage: "en", replyLanguage: "ja" }),
      "Architect (策士)"
    );
    // Same language on both sides collapses, exactly like the shipped locales.
    assert.equal(L.formatPersonaName("analyst", { interfaceLanguage: "ja", replyLanguage: "ja" }), "分析者");
  } finally {
    delete IDENTITY_PACKS.ja;
  }
});

// ------------------------------------------------------------- collapse rule

test("25. identical resolved names are never duplicated", () => {
  IDENTITY_PACKS.testdup = { judge: "Grand Sage", scholars: { 1: "Architect", 2: "Oracle", 3: "Analyst" } };
  try {
    const out = L.formatPersonaName("architect", { interfaceLanguage: "en", replyLanguage: "testdup" });
    assert.equal(out, "Architect", "must collapse, never 'Architect (Architect)'");
    assert.ok(!out.includes("("), out);
  } finally {
    delete IDENTITY_PACKS.testdup;
  }
});

// ---------------------------------------------------------------- fallbacks

test("26. a missing reply-language translation falls back safely", () => {
  // An unknown language resolves to English, which equals the English
  // interface name here, so it collapses to one clean name.
  assert.equal(L.formatPersonaName("architect", { interfaceLanguage: "en", replyLanguage: "kl" }), "Architect");
  // With a zh-TW interface it falls back to the English name in parentheses
  // rather than emitting nothing.
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "zh-TW", replyLanguage: "kl" }),
    "謀者（Architect）"
  );
});

test("27. a missing interface translation falls back safely", () => {
  assert.equal(L.formatPersonaName("architect", { interfaceLanguage: "kl", replyLanguage: "en" }), "Architect");
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "kl", replyLanguage: "zh-TW" }),
    "Architect (謀者)"
  );
});

test("a locale with a partially missing identity falls through to English per persona", () => {
  IDENTITY_PACKS.partial = { judge: "Partial Sage", scholars: { 1: "Partial Architect" } };
  try {
    assert.equal(
      L.formatPersonaName("architect", { interfaceLanguage: "partial", replyLanguage: "partial" }),
      "Partial Architect"
    );
    // Slot 3 is absent from this pack -> English, never blank.
    assert.equal(
      L.formatPersonaName("analyst", { interfaceLanguage: "partial", replyLanguage: "partial" }),
      "Analyst"
    );
  } finally {
    delete IDENTITY_PACKS.partial;
  }
});

test("28. no result is ever undefined, blank, or a raw localization key", () => {
  const languages = ["en", "zh-TW", "kl", "", null, undefined, "ZH-tw", "English", "繁體中文"];
  for (const personaId of L.PERSONA_IDS) {
    for (const interfaceLanguage of languages) {
      for (const replyLanguage of languages) {
        const out = L.formatPersonaName(personaId, { interfaceLanguage, replyLanguage });
        assert.equal(typeof out, "string");
        assert.ok(out.trim().length > 0, `blank for ${personaId} ${interfaceLanguage}/${replyLanguage}`);
        assert.ok(!out.includes("undefined"), out);
        assert.ok(!out.includes(personaId), `raw id leaked: ${out}`);
        assert.ok(!/[{}]/.test(out), `raw key syntax leaked: ${out}`);
      }
    }
  }
  // An unknown persona id yields "" rather than throwing or inventing a name.
  assert.equal(L.formatPersonaName("nobody", { interfaceLanguage: "en", replyLanguage: "en" }), "");
});

// ------------------------------------------------------ language resolution

test("language identifiers are normalized, never compared as raw labels", () => {
  assert.equal(L.normalizeLanguageId("zh-TW"), "zh-TW");
  assert.equal(L.normalizeLanguageId("ZH-tw"), "zh-TW");
  assert.equal(L.normalizeLanguageId("zh"), "zh-TW", "base language resolves to the registered locale");
  assert.equal(L.normalizeLanguageId("en-GB"), "en");
  assert.equal(L.normalizeLanguageId("English"), "en", "native label");
  assert.equal(L.normalizeLanguageId("繁體中文"), "zh-TW", "native label");
  assert.equal(L.normalizeLanguageId("Traditional Chinese (繁體中文)"), "zh-TW", "prompt-facing name");
  assert.equal(L.normalizeLanguageId("Klingon"), null, "unknown resolves to null, not a wrong guess");
  assert.equal(L.normalizeLanguageId(""), null);
});

test("a natural-language reply setting still selects the right persona names", () => {
  // The reply language may arrive as a label rather than a locale id.
  assert.equal(
    L.formatPersonaName("architect", { interfaceLanguage: "zh-TW", replyLanguage: "English" }),
    "謀者（Architect）"
  );
});

// --------------------------------------------------------------- typography

test("parenthesis and list typography are data-driven per locale", () => {
  // The leading space is part of Latin typography; CJK full-width parentheses
  // carry their own spacing.
  assert.deepEqual(L.parenthesesFor("en"), [" (", ")"]);
  assert.deepEqual(L.parenthesesFor("zh-TW"), ["（", "）"]);
  // A CJK language with no locale file yet still gets full-width parentheses.
  assert.deepEqual(L.parenthesesFor("ja"), ["（", "）"]);
  assert.deepEqual(L.parenthesesFor("ko"), ["（", "）"]);
  assert.deepEqual(L.parenthesesFor("de"), [" (", ")"]);
  assert.equal(L.listSeparator("zh-TW"), "、");
  assert.equal(L.listSeparator("en"), ", ");
});

test("the Scholar name list applies the same rule and separator", () => {
  assert.equal(
    L.formatScholarNameList({ interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    "謀者（Architect）、墨者（Oracle）、理者（Analyst）"
  );
  assert.equal(
    L.formatScholarNameList({ interfaceLanguage: "en", replyLanguage: "zh-TW" }),
    "Architect (謀者), Oracle (墨者), Analyst (理者)"
  );
  assert.equal(L.formatScholarNameList({ interfaceLanguage: "en", replyLanguage: "en" }), "Architect, Oracle, Analyst");
});

test("engine persona ids map to the fixed council slots", () => {
  // World Content Phase 1 decoupled identity from display: the canonical ids
  // are ENGINE ids (the same alpha/beta/gamma the scene speech roles use),
  // not the English Classic names they used to be spelled with.
  assert.deepEqual(L.PERSONA_IDS, ["grand_sage", "alpha", "beta", "gamma"]);
  assert.equal(L.personaIdForSlot(1), "alpha");
  assert.equal(L.personaIdForSlot(2), "beta");
  assert.equal(L.personaIdForSlot(3), "gamma");
  assert.equal(L.personaIdForJudge(), "grand_sage");
  // The Classic display names are unchanged in both locales.
  assert.equal(L.personaName("alpha", "zh-TW"), "謀者");
  assert.equal(L.personaName("alpha", "en"), "Architect");
});

test("legacy display-name ids still resolve to the same engine identity", () => {
  // Anything that stored the pre-World spelling keeps working, and resolves
  // to the SAME character — never a second one.
  assert.equal(L.enginePersonaId("architect"), "alpha");
  assert.equal(L.enginePersonaId("oracle"), "beta");
  assert.equal(L.enginePersonaId("analyst"), "gamma");
  assert.equal(L.enginePersonaId("alpha"), "alpha", "an engine id passes through");
  assert.equal(L.enginePersonaId("nobody"), null);
  assert.equal(L.personaName("architect", "en"), L.personaName("alpha", "en"));
  assert.equal(
    L.formatPersonaName("oracle", { interfaceLanguage: "zh-TW", replyLanguage: "en" }),
    L.formatPersonaName("beta", { interfaceLanguage: "zh-TW", replyLanguage: "en" })
  );
});
