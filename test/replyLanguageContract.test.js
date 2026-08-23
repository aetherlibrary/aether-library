// THE LANGUAGE CONTRACT EVERY AI REQUEST CARRIES.
//
// Default Reply Language has three values — Match Question Language, English,
// Traditional Chinese — and each produces a different instruction in the
// system prompt. These tests capture what the providers ACTUALLY receive
// during real Scholar / Grand Sage / Mentor / follow-up runs, rather than
// asserting on the builders in isolation, because the whole point is that one
// shared rule reaches every path.
//
// THE OBSERVED FAILURE THAT PROMPTED THIS. Interface English, Default Reply
// Language English, question "黑洞是什麼" — answered in Chinese. The plumbing
// was correct and the instruction was present; the model read a question ASKED
// in Chinese as a request TO REPLY in Chinese, which the old rule's own
// "Override: if the user explicitly asks for a specific language" line invited.
// The rule now names that misreading and rejects it, and narrows the override
// to an explicit instruction in the current message — so a direct request
// still wins (that priority is deliberate), but the question's language alone
// no longer counts as one.
//
// Round-trip and default/migration behaviour lives in
// replyLanguageDefault.test.js; this file is about the contract itself.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  MATCH_QUESTION_LANGUAGE,
  defaultReplyLanguageRule,
  replyLanguageValues,
  responseLanguageName,
  isMatchQuestionLanguage,
} from "../src/localization.js";

let council;
let sessionChat;
let providers;
let config;
let resetSession;
let saveSettings;
let tmpRoot;

// Everything each provider was asked, so a test can inspect the exact system
// prompt a role received.
let seen;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-reply-language-contract-"));
  process.env.ENV_FILE_PATH = path.join(tmpRoot, ".env.local");
  process.env.ARCHIVE_DIR = path.join(tmpRoot, "archives");
  await fs.writeFile(
    process.env.ENV_FILE_PATH,
    [
      "SCHOLAR1_PROVIDER=openai",
      "SCHOLAR1_MODEL=gpt-5.1",
      "SCHOLAR2_PROVIDER=anthropic",
      "SCHOLAR2_MODEL=claude-sonnet-4-5",
      "SCHOLAR3_PROVIDER=google",
      "SCHOLAR3_MODEL=gemini-2.5-pro",
      "JUDGE_PROVIDER=perplexity",
      "JUDGE_MODEL=sonar-pro",
      "",
    ].join("\n"),
    "utf8"
  );
  ({ providers } = await import("../src/providers/index.js"));
  ({ config } = await import("../src/config.js"));
  ({ saveSettings } = await import("../src/services/settings.js"));
  council = await import("../src/services/council.js");
  sessionChat = await import("../src/services/sessionChat.js");
  ({ resetSession } = await import("../src/services/sessionEngine.js"));
});

after(async () => {
  delete process.env.ENV_FILE_PATH;
  delete process.env.ARCHIVE_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  resetSession();
  seen = {};
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    providers[id].isConfigured = () => true;
    providers[id].complete = async ({ system, prompt }) => {
      (seen[id] ||= []).push({ system, prompt });
      return `answer from ${id}`;
    };
  }
});

// The two language settings are independent; each test sets both explicitly.
function setLanguages(interfaceLanguage, replyLanguage) {
  config.interfaceLanguage = interfaceLanguage;
  config.defaultReplyLanguage = replyLanguage;
}

const systemOf = (id, n = 0) => seen[id]?.[n]?.system ?? "";
// Every system prompt any role received during a run.
const allSystems = () => Object.values(seen).flat().map((c) => c.system);

// A fixed instruction to answer in one named language, in either direction.
const NAMES_ENGLISH = /\bin English\b/;
const NAMES_CHINESE = /Traditional Chinese/;

// =========================================================== the rule itself

test("MATCH injects no fixed language preference at all", () => {
  // REQUIREMENTS 4 and 5: neither an English nor a Chinese preference.
  const lines = defaultReplyLanguageRule(MATCH_QUESTION_LANGUAGE, "answer");
  assert.equal(lines.length, 1, "one neutral line, not a two-part mandatory/override pair");
  const text = lines.join("\n");
  assert.doesNotMatch(text, NAMES_ENGLISH, "Match must not request English");
  assert.doesNotMatch(text, NAMES_CHINESE, "Match must not request Chinese");
  assert.doesNotMatch(text, /繁體中文/);
  assert.doesNotMatch(text, /mandatory/i, "nothing is mandated about WHICH language");
  // What it does say: follow the current question, and yield to an explicit request.
  assert.match(text, /same language the user's current question is written in/);
  assert.match(text, /explicitly asks for a different language, obey that request instead/);
});

test("an explicit language states the requirement AND closes the mirroring loophole", () => {
  // REQUIREMENTS 6 and 7.
  for (const [language, present, absent] of [
    ["en", NAMES_ENGLISH, NAMES_CHINESE],
    ["zh-TW", NAMES_CHINESE, NAMES_ENGLISH],
  ]) {
    const text = defaultReplyLanguageRule(language, "answer").join("\n");
    assert.match(text, /LANGUAGE \(mandatory\)/, `${language}: the requirement is stated as mandatory`);
    assert.match(text, present, `${language}: the target language is named`);
    assert.doesNotMatch(text, absent, `${language}: the other language must not appear as a target`);
    // The actual fix: the question's own language is explicitly disqualified
    // as a request. Without this line, a Chinese question beat "answer in
    // English" on a real M2 run.
    assert.match(text, /asking in another language is NOT a request to answer in that language/);
    assert.match(text, /do not mirror the question's language/);
    assert.match(text, /independent of the language of the question/);
  }
});

test("an explicit current-turn instruction still outranks the default", () => {
  // REQUIREMENT 10, and product CASE D. The default must be expressed as a
  // default — an absolute instruction with no way out would make "請用中文回答"
  // unanswerable when the setting says English.
  for (const language of ["en", "zh-TW"]) {
    const text = defaultReplyLanguageRule(language, "answer").join("\n");
    assert.match(text, /Override: only an explicit instruction in the user's current message/);
    assert.match(text, /Obey such an instruction instead, for the whole answer/);
    // Scoped to the turn that asked, so the next question returns to the default.
    assert.match(text, /It applies only to the message that asked for it/);
    // ...and it must not be phrased so absolutely that the override is dead.
    assert.doesNotMatch(text, /never write in any other language|under no circumstances/i);
  }
});

test("`subject` names what is being written, without forking the policy", () => {
  for (const subject of ["answer", "ruling", "reply"]) {
    assert.match(defaultReplyLanguageRule("en", subject).join("\n"), new RegExp(`write your entire ${subject} in English`));
    assert.match(defaultReplyLanguageRule(MATCH_QUESTION_LANGUAGE, subject).join("\n"), new RegExp(`write your entire ${subject} in the same language`));
  }
});

test("Match is a policy, never a locale that could resolve to a language", () => {
  assert.ok(isMatchQuestionLanguage(MATCH_QUESTION_LANGUAGE));
  assert.ok(!isMatchQuestionLanguage("en"));
  // The old fallback answered "Traditional Chinese" for any unknown id, which
  // would have turned Match into a fixed Chinese instruction.
  assert.equal(responseLanguageName(MATCH_QUESTION_LANGUAGE), null);
  assert.equal(responseLanguageName("en"), "English");
  // Match leads the whitelist, which is also the dropdown order.
  assert.deepEqual(replyLanguageValues(), ["match", "en", "zh-TW"]);
});

// ================================================ every path gets the contract

test("11+13. Scholars and the Grand Sage both receive the explicit contract", async () => {
  setLanguages("en", "en");
  await council.runSessionEvents("黑洞是什麼", { mode: "council" });

  // All three Scholars (REQUIREMENT 11) and the Grand Sage (REQUIREMENT 13).
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    const system = systemOf(id);
    assert.ok(system, `${id} ran`);
    assert.match(system, /LANGUAGE \(mandatory\)/, `${id} carries the rule`);
    assert.match(system, NAMES_ENGLISH, `${id} was asked for English`);
    assert.match(system, /NOT a request to answer in that language/, `${id} has the loophole closed`);
  }
  // The Grand Sage's own subject is its ruling, not an answer.
  assert.match(systemOf("perplexity"), /write your entire ruling in English/);
  assert.match(systemOf("openai"), /write your entire answer in English/);
});

test("12. the Mentor path is the Scholar path, and carries the same contract", async () => {
  // Mentor is mode "single": one Scholar, through the SAME scholarSystem()
  // builder. It is not a distinct prompt, which is exactly why it cannot drift.
  setLanguages("en", "zh-TW");
  await council.runSessionEvents("What is a black hole?", { mode: "single", slot: 1 });
  const system = systemOf("openai");
  assert.match(system, /LANGUAGE \(mandatory\)/);
  assert.match(system, NAMES_CHINESE);
  assert.doesNotMatch(system, /write your entire answer in English/);
});

test("14. follow-ups and retries keep the contract, and pick up a change between turns", async () => {
  setLanguages("en", "en");
  await council.runSessionEvents("Q", { mode: "council" });
  seen = {};
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    providers[id].complete = async ({ system, prompt }) => {
      (seen[id] ||= []).push({ system, prompt });
      return `follow-up from ${id}`;
    };
  }

  // A follow-up after a Council run goes to the Grand Sage.
  await sessionChat.sessionChatReply("and then?");
  assert.match(systemOf("perplexity"), /LANGUAGE \(mandatory\)/);
  assert.match(systemOf("perplexity"), /write your entire reply in English/);

  // The setting is read per call, so changing it between turns takes effect on
  // the next one rather than being pinned at session start.
  setLanguages("en", "zh-TW");
  seen = {};
  providers.perplexity.complete = async ({ system, prompt }) => {
    (seen.perplexity ||= []).push({ system, prompt });
    return "later";
  };
  await sessionChat.sessionChatReply("one more");
  assert.match(systemOf("perplexity"), NAMES_CHINESE);
});

test("Match reaches every path without biasing any of them", async () => {
  setLanguages("en", MATCH_QUESTION_LANGUAGE);
  await council.runSessionEvents("黑洞是什麼", { mode: "council" });

  const systems = allSystems();
  assert.equal(systems.length, 4, "three Scholars and the Grand Sage");
  for (const system of systems) {
    assert.match(system, /same language the user's current question is written in/);
    // No fixed preference may reach the model in either direction. Checked
    // against the WHOLE system prompt, not just the rule, because the
    // surrounding template also talks about language.
    assert.doesNotMatch(system, /write your entire (answer|ruling) in English/);
    assert.doesNotMatch(system, /write your entire (answer|ruling) in Traditional Chinese/);
    assert.doesNotMatch(system, /LANGUAGE \(mandatory\)/);
  }
});

// ===================================== interface language stays independent

test("8+9. Interface Language and Default Reply Language never influence each other", async () => {
  // REQUIREMENT 8: English UI + Traditional Chinese replies.
  setLanguages("en", "zh-TW");
  await council.runSessionEvents("Q", { mode: "council" });
  assert.match(systemOf("openai"), NAMES_CHINESE, "the reply language is Chinese");
  assert.equal(config.interfaceLanguage, "en", "the interface is untouched by it");

  // REQUIREMENT 9: Traditional Chinese UI + English replies.
  resetSession();
  seen = {};
  for (const id of ["openai", "anthropic", "google", "perplexity"]) {
    providers[id].complete = async ({ system, prompt }) => {
      (seen[id] ||= []).push({ system, prompt });
      return "x";
    };
  }
  setLanguages("zh-TW", "en");
  await council.runSessionEvents("Q", { mode: "council" });
  assert.match(systemOf("openai"), NAMES_ENGLISH, "the reply language is English");
  assert.equal(config.interfaceLanguage, "zh-TW", "the interface is untouched by it");
});

test("Match with a Chinese interface does not smuggle in a second persona name", async () => {
  // The bilingual persona form exists for when the reply language DIFFERS from
  // the interface language. Match is not a language, so there is nothing to
  // differ from — but personaName()'s fallback chain ends at English, so
  // without a guard a zh-TW interface read "謀者（Architect）", naming a
  // language nobody selected.
  setLanguages("zh-TW", MATCH_QUESTION_LANGUAGE);
  await council.runSessionEvents("Q", { mode: "council" });
  const sage = systemOf("perplexity");
  assert.match(sage, /大智者/);
  assert.doesNotMatch(sage, /（Grand Sage）/, "no English name appended in Match mode");
  assert.doesNotMatch(sage, /（Architect）/);
});

// ================================================ persistence and validation

test("16+17. every value round-trips through saveSettings and .env.local", async () => {
  for (const value of replyLanguageValues()) {
    saveSettings({ defaultReplyLanguage: value });
    assert.equal(config.defaultReplyLanguage, value, `${value} did not survive the round trip`);
    const written = await fs.readFile(process.env.ENV_FILE_PATH, "utf8");
    assert.match(written, new RegExp(`^DEFAULT_REPLY_LANGUAGE=${value}$`, "m"));
  }
});

test("an unknown reply language is rejected, and names the real choices", () => {
  assert.throws(() => saveSettings({ defaultReplyLanguage: "auto" }), /defaultReplyLanguage must be one of: match, en, zh-TW/);
  assert.throws(() => saveSettings({ defaultReplyLanguage: "ja" }), /defaultReplyLanguage must be one of/);
});

// ================================================================ the UI

test("18+19. the option is first, and labelled exactly as specified", async () => {
  const indexHtml = (await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const appJs = (await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const en = (await import("../src/locales/en.js")).default.strings;
  const zhTW = (await import("../src/locales/zh-TW.js")).default.strings;

  // REQUIREMENT 18 / 19 — the exact labels.
  assert.equal(en.matchQuestionLanguage, "Match Question Language");
  assert.equal(zhTW.matchQuestionLanguage, "與提問相同語言");
  // Not "Auto": the label has to say what is being matched.
  assert.notEqual(en.matchQuestionLanguage, "Auto");

  const select = indexHtml.slice(
    indexHtml.indexOf('id="gen-reply-lang"'),
    indexHtml.indexOf("</select>", indexHtml.indexOf('id="gen-reply-lang"'))
  );
  const options = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  // FIRST, and exactly the values the backend will accept.
  assert.deepEqual(options, replyLanguageValues(), "the dropdown must offer exactly the whitelist, in order");
  assert.equal(options[0], MATCH_QUESTION_LANGUAGE);

  // Only this option is localized — the languages keep their native names, as
  // the Interface Language dropdown does.
  assert.match(appJs, /sx\.lang\.querySelector\('option\[value="match"\]'\)\.textContent = str\("matchQuestionLanguage"\);/);
  assert.match(select, /<option value="en">English<\/option>/);
  assert.match(select, /<option value="zh-TW">繁體中文<\/option>/);
  // The dialog's own fallback matches the server's fresh-install default, so
  // it never displays a language the user has not been given.
  assert.match(appJs, /sx\.lang\.value = currentConfig\.defaultReplyLanguage \|\| "match";/);
});

// =============================================== one contract, no provider forks

test("15. no provider-specific language branch exists anywhere", async () => {
  const codeOnly = (src) => src.replace(/^\s*\/\/.*$/gm, "");
  const localization = (await fs.readFile(new URL("../src/localization.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

  // The rule is built from the setting and the subject — nothing else.
  const rule = localization.slice(
    localization.indexOf("export function defaultReplyLanguageRule"),
    localization.indexOf("// ------------------------------------------------------- World Content hook")
  );
  assert.doesNotMatch(codeOnly(rule), /openai|anthropic|google|xai|grok|perplexity|deepseek|sonar|gemini|claude|gpt/i);

  // And there is exactly ONE builder, reached by every path: the two council
  // roles and the follow-up. A fourth prompt inventing its own policy is the
  // failure mode this counts against.
  for (const rel of ["../src/services/council.js", "../src/services/sessionChat.js"]) {
    const src = (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const code = codeOnly(src);
    assert.match(code, /defaultReplyLanguageRule\(/, `${rel} uses the shared rule`);
    // No local re-statement of a language policy alongside it.
    assert.doesNotMatch(code, /answer in (English|Chinese)|reply in (English|Chinese)/i, `${rel} must not carry its own policy`);
  }
});

test("the Council pre-check carries no language contract, because it is not prose", async () => {
  // It sends "Reply with exactly one word and nothing else." — a health probe.
  // Giving it a language rule would spend tokens on a reply nobody reads.
  const src = (await fs.readFile(new URL("../src/services/council.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const precheck = src.slice(src.indexOf("const maxTokens = isReasoningModel"), src.indexOf("return { ...base, ok: true"));
  assert.match(precheck, /system: "Reply with exactly one word and nothing else\.",/);
  assert.doesNotMatch(precheck, /defaultReplyLanguageRule|LANGUAGE/);
});
