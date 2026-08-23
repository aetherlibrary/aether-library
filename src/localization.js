// Localization registry — the in-world layer of Aether Library.
//
// Every locale lives in its own file under src/locales/ (identity names,
// native label, and the full UI string pack). Supporting a new language
// (ja, de, fr, ko, …) means adding one locale file and registering it in
// LOCALES below — nothing else changes anywhere in the app. Missing string
// keys in a locale fall back to English per key.
//
// The council always has four fixed character slots: the Judge and Scholars
// #1–#3. These identities belong to the Aether Library universe; providers
// and models are implementation details assigned to the slots in Settings
// and must never leak into or change a character's identity.
//
// WORLD TERMINOLOGY: "Aether Library", "Vault", and "Traveler" are official
// product terms — identical in every locale, never translated.

import en from "./locales/en.js";
import zhTW from "./locales/zh-TW.js";

const LOCALES = {
  en,
  "zh-TW": zhTW,
};

// Locale/identity fallback ONLY: the pack used when a requested language has
// no entry (identityFor, responseLanguageName). It is NOT the default language
// AI answers are written in — see DEFAULT_REPLY_LANGUAGE below.
export const DEFAULT_LANGUAGE = "zh-TW";

// The language AI responses default to on a FRESH install — nothing saved in
// .env.local yet. Deliberately separate from DEFAULT_LANGUAGE: the two answer
// different questions, and sharing one constant meant a brand-new user was
// told the Scholars must answer in Traditional Chinese before they had chosen
// anything. A saved preference always wins over this (see src/config.js).
// "Match Question Language" — the first option in Settings → General →
// Default Reply Language, and the value that setting holds when the user wants
// replies to follow whatever language they asked in.
//
// WHY A SENTINEL RATHER THAN AN ABSENT VALUE. saveSettings() treats a blank
// field as "keep what you had" (the `if (!trimmed) continue;` in
// services/settings.js), so an empty string cannot express a CHOICE — it
// expresses silence. Match is a real, deliberate selection a user can make and
// re-select, so it needs a real value. It is deliberately NOT a locale id: it
// names a policy, not a language, and must never resolve to an identity pack
// or a response-language name.
export const MATCH_QUESTION_LANGUAGE = "match";

export function isMatchQuestionLanguage(value) {
  return value === MATCH_QUESTION_LANGUAGE;
}

// Every value Default Reply Language may hold: the match policy first, then
// one entry per locale. This is the validation whitelist AND the order the
// Settings dropdown renders.
export function replyLanguageValues() {
  return [MATCH_QUESTION_LANGUAGE, ...Object.keys(LOCALES)];
}

// It is MATCH rather than a fixed language. Pinning a fresh install to any one
// language is a guess about a user nobody has asked yet: an English default
// answered a Chinese question in English, and a Chinese default answered an
// English question in Chinese. Following the question is the only behaviour
// that is right before a preference exists — and it is still only a default,
// replaced the moment the user picks a language.
export const DEFAULT_REPLY_LANGUAGE = MATCH_QUESTION_LANGUAGE;

export const SCHOLAR_SLOTS = [1, 2, 3];

// Derived views kept for compatibility with existing consumers.
export const IDENTITY_PACKS = Object.fromEntries(
  Object.entries(LOCALES).map(([id, locale]) => [id, locale.identity])
);
export const UI_STRINGS = Object.fromEntries(
  Object.entries(LOCALES).map(([id, locale]) => [id, locale.strings])
);

// Languages the application interface can render (Settings → General →
// Interface Language).
export function supportedInterfaceLanguages() {
  return Object.keys(LOCALES);
}

// [{ id, label }] for building the Interface Language dropdown — the label is
// each language's native name from its locale file.
export function interfaceLanguageOptions() {
  return Object.entries(LOCALES).map(([id, locale]) => ({ id, label: locale.label || id }));
}

// Human-readable names for the reply languages the application can be set to
// (Settings → General → Default Reply Language). Used inside every AI system
// prompt, so these are prompt-facing English descriptions.
export const RESPONSE_LANGUAGE_NAMES = {
  "zh-TW": "Traditional Chinese (繁體中文)",
  en: "English",
};

export function responseLanguageName(language) {
  // `match` names a policy, not a language, and there is no name to give it.
  // Guarded explicitly because the fallback below would otherwise answer
  // "Traditional Chinese" — silently turning "follow the question" into a
  // fixed Chinese instruction. Callers must branch before reaching here;
  // defaultReplyLanguageRule() does.
  if (isMatchQuestionLanguage(language)) return null;
  return RESPONSE_LANGUAGE_NAMES[language] || RESPONSE_LANGUAGE_NAMES[DEFAULT_LANGUAGE];
}

// THE language instruction every AI response shares — Scholars, the Grand
// Sage, Mentor, Quick Questions and follow-ups all build their system
// prompt on these two lines, so "Default Reply Language" means the same
// thing everywhere instead of each prompt inventing its own policy.
//
// The override is deliberately scoped to the request that asks for it: no
// per-session language is ever stored, so the next question starts from the
// configured default again.
//
// `subject` names what is being written ("answer", "ruling", "reply") so
// each prompt reads naturally without forking the policy itself.
// TWO CONTRACTS, ONE FUNCTION. Which one is emitted depends only on the
// setting, never on the provider: OpenAI, Anthropic, Google, xAI, Perplexity
// and DeepSeek all receive exactly these lines.
//
// MATCH: one neutral line naming NO language, so nothing here can bias a reply
// towards English or Chinese. An instruction is emitted rather than nothing at
// all because the Grand Sage does not read the question directly — it rules on
// a record of Scholar answers — and because the surrounding prompts already
// refer to "the required language"; leaving that undefined invited each model
// to invent its own policy.
//
// EXPLICIT: the observed failure was a Chinese question answered in Chinese
// while the setting said English. The instruction was present and said
// "mandatory", so the fix is not more emphasis but closing the loophole the
// model walked through: it read a question ASKED in Chinese as a request TO
// REPLY in Chinese, which the Override line invited. So the rule now (1) names
// that misreading and rejects it outright, and (2) narrows Override to an
// explicit instruction in the user's current message — exactly the priority
// the product wants, since a direct instruction still outranks a standing
// default.
export function defaultReplyLanguageRule(language, subject = "response") {
  if (isMatchQuestionLanguage(language)) {
    return [
      `LANGUAGE: write your entire ${subject} in the same language the user's current question is written in. If the user explicitly asks for a different language, obey that request instead, for the whole ${subject}.`,
    ];
  }
  const name = responseLanguageName(language);
  return [
    `LANGUAGE (mandatory): write your entire ${subject} in ${name}. This is the application's configured Default Reply Language — it is independent of the language of the question and of any interface-language setting.`,
    `The user asking in another language is NOT a request to answer in that language: if the question is written in a different language, still write the whole ${subject} in ${name}, and do not mirror the question's language.`,
    `Override: only an explicit instruction in the user's current message (e.g. "answer in Japanese", "請用中文回答") changes this. Obey such an instruction instead, for the whole ${subject}. It applies only to the message that asked for it.`,
  ];
}

// ------------------------------------------------------- World Content hook
// The ACTIVE world's display identity, injected at boot (and after an F8
// save) by services/worldContent.js. Deliberately an injection rather than an
// import: this module stays free of file I/O, and the dependency points one
// way (worldContent -> localization), so there is no cycle.
//
// This is the ONE place display names enter the app. Everything downstream —
// publicConfig, the council prompts, the session identity snapshot, archives,
// the persona formatter — already reads identityFor(), so pointing it at
// World Content switches the entire product's display identity without any
// of those callers changing. Engine ids are untouched: a Scholar is still
// slot 1 / `alpha` no matter what it is called.
let worldIdentityPacks = null;

// Custom Names — runtime display OVERRIDES keyed by engine id. When one is
// set it is the FINAL display name: the bilingual formatter never appends a
// second name to it, because an override is a deliberate authored choice and
// "Merlin（Percival）" would be nonsense.
let worldCustomNames = null;

export function setWorldIdentity(packs, customNames) {
  worldIdentityPacks = packs && typeof packs === "object" ? packs : null;
  worldCustomNames = customNames && typeof customNames === "object" ? customNames : null;
}

// The override for an engine id, or "" when there is none.
export function customPersonaName(personaId) {
  const engineId = enginePersonaId(personaId);
  const value = engineId ? worldCustomNames?.[engineId] : "";
  return typeof value === "string" ? value.trim() : "";
}

// Merged over the locale pack per FIELD, so a world that names only some
// characters keeps the built-in names for the rest, and an unknown language
// still resolves.
function activeIdentityFor(language) {
  const base = IDENTITY_PACKS[language] || IDENTITY_PACKS[DEFAULT_LANGUAGE];
  const world = worldIdentityPacks?.[language];
  const merged = world
    ? { judge: world.judge || base.judge, scholars: { ...base.scholars, ...world.scholars } }
    : { judge: base.judge, scholars: { ...base.scholars } };
  // Custom Names sit ABOVE the localized world name and are language-
  // independent, so they apply to every locale identically.
  const sage = customPersonaName("grand_sage");
  if (sage) merged.judge = sage;
  for (const [slot, engineId] of [[1, "alpha"], [2, "beta"], [3, "gamma"]]) {
    const custom = customPersonaName(engineId);
    if (custom) merged.scholars[slot] = custom;
  }
  return merged;
}

// Always returns a complete pack; unknown languages fall back to the default.
export function identityFor(language) {
  return activeIdentityFor(language);
}

// The official English identity titles ("The Architect" …) shown on hover
// cards in every language — the English scholar names are canon.
export function identityTitles() {
  return IDENTITY_PACKS.en;
}

export function judgeName(language) {
  return identityFor(language).judge;
}

export function scholarName(slot, language) {
  return identityFor(language).scholars[slot];
}

// "謀者、墨者、理者" / "Architect, Oracle, Analyst" — for prose in prompts.
export function scholarNameList(language) {
  const names = SCHOLAR_SLOTS.map((slot) => scholarName(slot, language));
  return names.join(listSeparator(language));
}

// ==================================================== multilingual personas
// A persona's IDENTITY is a canonical id, never a translated string. The four
// fixed council slots map to these ids once, here, so nothing downstream has
// to know that "the judge" and "grand_sage" are the same character.
// ENGINE identity ids — permanent, never localized, never authored. These are
// the same ids the scene speech roles already use, so there is exactly one
// namespace. A world renames what a character is CALLED; it can never rename
// an id, which is what keeps a future Avalon/Cyber/Christmas world an
// authoring change rather than a code change.
export const PERSONA_IDS = ["grand_sage", "alpha", "beta", "gamma"];

// Legacy ids from before World Content, when the canonical set was spelled
// with the English Classic names. Still accepted so nothing that stored one
// breaks — they resolve to the same engine identity, never a second one.
const LEGACY_PERSONA_IDS = { architect: "alpha", oracle: "beta", analyst: "gamma" };

// engine id -> where that persona lives inside an identity pack.
const PERSONA_SLOTS = { grand_sage: "judge", alpha: 1, beta: 2, gamma: 3 };

// Accepts an engine id or a legacy alias; always returns the engine id.
export function enginePersonaId(personaId) {
  if (PERSONA_SLOTS[personaId] !== undefined) return personaId;
  return LEGACY_PERSONA_IDS[personaId] || null;
}

// Fixed Scholar slot -> engine id. The slot is a CONFIGURATION concept (which
// provider answers as which character); the engine id is the identity.
export function personaIdForSlot(slot) {
  return PERSONA_IDS[Number(slot)] || null; // 1..3 -> alpha/beta/gamma
}
export function personaIdForJudge() {
  return "grand_sage";
}

// Locales whose typography wants full-width parentheses. Data, not logic: a
// new CJK locale either matches a prefix here or declares `parentheses` in
// its own locale file (checked first), so adding a language never means
// editing a condition.
const FULL_WIDTH_PAREN_PREFIXES = ["zh", "ja", "ko"];
// The leading space is part of Latin typography ("Architect (謀者)"); CJK
// full-width parentheses carry their own spacing and take none.
const LATIN_PARENS = [" (", ")"];
const FULL_WIDTH_PARENS = ["（", "）"];

function baseLanguage(language) {
  return String(language || "").toLowerCase().split(/[-_]/)[0];
}

// Parenthesis pair for prose written in `language`. Follows the INTERFACE
// language, because the sentence around it is in the interface language.
export function parenthesesFor(language) {
  const declared = LOCALES[language]?.parentheses;
  if (Array.isArray(declared) && declared.length === 2) return declared;
  return FULL_WIDTH_PAREN_PREFIXES.includes(baseLanguage(language)) ? FULL_WIDTH_PARENS : LATIN_PARENS;
}

// List separator for prose in `language` — same data-driven rule.
export function listSeparator(language) {
  const declared = LOCALES[language]?.listSeparator;
  if (typeof declared === "string") return declared;
  return FULL_WIDTH_PAREN_PREFIXES.includes(baseLanguage(language)) ? "、" : ", ";
}

// Normalizes anything that names a language — a locale id ("zh-TW"), a
// differently-cased id ("ZH-tw"), a native label ("繁體中文"), a
// prompt-facing English name ("Traditional Chinese (繁體中文)"), or a bare
// base language ("zh") — to a registered locale id. Returns null when
// nothing matches, so callers apply their own fallback deliberately.
export function normalizeLanguageId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (LOCALES[raw]) return raw;
  const lower = raw.toLowerCase();
  for (const id of Object.keys(LOCALES)) {
    if (id.toLowerCase() === lower) return id;
    if ((LOCALES[id].label || "").toLowerCase() === lower) return id;
    if ((RESPONSE_LANGUAGE_NAMES[id] || "").toLowerCase() === lower) return id;
  }
  // Base-language match ("zh" -> "zh-TW", "en-GB" -> "en").
  const base = baseLanguage(raw);
  for (const id of Object.keys(LOCALES)) {
    if (baseLanguage(id) === base) return id;
  }
  return null;
}

// The name of `personaId` in `language`, with a deterministic fallback chain:
// the requested locale -> that locale's declared `fallbackLanguage` -> the
// base-language match -> English. English always resolves (it is the
// reference pack), so this never returns undefined, blank, or a raw key.
export function personaName(personaId, language) {
  const key = PERSONA_SLOTS[enginePersonaId(personaId)];
  if (key === undefined) return "";
  const read = (langId) => {
    // The ACTIVE identity: World Content merged over the locale pack (see
    // activeIdentityFor). A world only ever overrides a NAME — the persona id
    // and its slot are engine identity and never move.
    if (!IDENTITY_PACKS[langId]) return "";
    const pack = activeIdentityFor(langId);
    const value = key === "judge" ? pack.judge : pack.scholars?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  // The RAW id is tried first, against IDENTITY_PACKS rather than LOCALES: a
  // language can have persona names without a full UI locale file yet, which
  // is exactly what makes adding a language a data change. Only then do we
  // fall back through the registered-locale chain.
  const resolved = normalizeLanguageId(language);
  const chain = [language, resolved, LOCALES[resolved]?.fallbackLanguage, normalizeLanguageId(baseLanguage(language)), "en"];
  for (const candidate of chain) {
    if (!candidate) continue;
    const name = read(candidate);
    if (name) return name;
  }
  return read("en");
}

// THE persona-name formatter for AI-generated prose and prompts.
//
// One rule, one place:
//   same interface/reply language -> just the one localized name
//   different                     -> INTERFACE name + REPLY name in
//                                    parentheses whose typography follows the
//                                    INTERFACE language
// Identical resolved names collapse to one ("Architect (Architect)" never
// appears), which is also what makes an untranslated locale degrade quietly
// instead of looking broken.
//
// The UI does NOT use this — interface surfaces show interface-language names
// only (see the callers in services/council.js and services/sessionChat.js).
export function formatPersonaName(personaId, { interfaceLanguage, replyLanguage } = {}) {
  // A Custom Name is the final display name — no parenthetical second name is
  // ever appended to it (§3). It is language-independent by design.
  const override = customPersonaName(personaId);
  if (override) return override;
  const primary = personaName(personaId, interfaceLanguage);
  if (!primary) return "";
  // MATCH has no second name to give. The bilingual form exists for when the
  // reply language DIFFERS from the interface language, and "follow the
  // question" is not a language to differ from. Without this the name would
  // resolve through personaName()'s final English fallback, so a zh-TW
  // interface in Match mode read "謀者（Architect）" — an English name added
  // for a reply language nobody selected.
  if (isMatchQuestionLanguage(replyLanguage)) return primary;
  const secondary = personaName(personaId, replyLanguage);
  if (!secondary || secondary === primary) return primary;
  const [open, close] = parenthesesFor(normalizeLanguageId(interfaceLanguage) || interfaceLanguage);
  return `${primary}${open}${secondary}${close}`;
}

// The three Scholars, formatted by the rule above and joined for prose.
export function formatScholarNameList({ interfaceLanguage, replyLanguage } = {}) {
  const names = SCHOLAR_SLOTS.map((slot) =>
    formatPersonaName(personaIdForSlot(slot), { interfaceLanguage, replyLanguage })
  );
  return names.join(listSeparator(normalizeLanguageId(interfaceLanguage) || interfaceLanguage));
}

// Always returns a complete string pack: the requested locale merged over
// English, so a partially translated locale still renders every string.
export function uiStringsFor(language) {
  const pack = UI_STRINGS[language];
  if (!pack || pack === UI_STRINGS.en) return UI_STRINGS.en;
  return { ...UI_STRINGS.en, ...pack };
}

// Learn / User Guide content (Batch B). Structured rather than flat strings
// because each section is a heading plus paragraphs and bullet lists —
// shaped as [{ id, title, blocks:[{type:"p"|"list", ...}] }]. Kept beside
// `strings` in each locale file (never in the UI), so adding a language
// still means editing exactly one file. Falls back to English WHOLESALE
// rather than per-section: a half-translated guide reading as two languages
// mid-page would be worse than a consistent English one.
export const LEARN_SECTIONS = Object.fromEntries(
  Object.entries(LOCALES).map(([id, locale]) => [id, locale.learnSections || []])
);

export function learnSectionsFor(language) {
  const pack = LEARN_SECTIONS[language];
  return Array.isArray(pack) && pack.length ? pack : LEARN_SECTIONS.en || [];
}
