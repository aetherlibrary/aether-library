// Integration checks for where the multilingual persona rule applies.
//
// The rule belongs to AI-GENERATED PROSE and the prompts that produce it. The
// UI keeps showing interface-language names only. These tests capture what the
// providers actually receive during a real run, rather than asserting on the
// prompt builders in isolation.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let council;
let sessionChat;
let providers;
let config;
let resetSession;
let tmpRoot;

// Everything each provider was asked, so a test can inspect the exact system
// prompt / user prompt a role received.
let seen;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-persona-prompts-"));
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
      seen[id] = { system, prompt };
      return `answer from ${id}`;
    };
  }
});

// The two language settings are independent; each test sets both explicitly.
function setLanguages(interfaceLanguage, replyLanguage) {
  config.interfaceLanguage = interfaceLanguage;
  config.defaultReplyLanguage = replyLanguage;
}

test("30. the Grand Sage prompt uses bilingual names when the languages differ", async () => {
  setLanguages("zh-TW", "en");
  const session = await council.runSessionEvents("Q", { mode: "council" });

  const sage = seen.perplexity;
  assert.ok(sage, "the Grand Sage ran");
  // Its own identity and the Scholars it must credit, both bilingual.
  assert.match(sage.system, /大智者（Grand Sage）/);
  assert.match(sage.system, /謀者（Architect）/);
  assert.match(sage.system, /墨者（Oracle）/);
  assert.match(sage.system, /理者（Analyst）/);
  // The record it rules on names the Scholars the same way.
  assert.match(sage.prompt, /## 謀者（Architect）'s answer/);

  // The SESSION (and therefore the UI) keeps interface-language names only.
  assert.equal(session.scholars.scholar1.persona, "謀者");
  assert.equal(session.identity.scholars[1], "謀者");
});

test("30b. English interface + Traditional Chinese reply reverses the order and the parentheses", async () => {
  setLanguages("en", "zh-TW");
  const session = await council.runSessionEvents("Q", { mode: "council" });

  const sage = seen.perplexity;
  assert.match(sage.system, /Grand Sage \(大智者\)/);
  assert.match(sage.system, /Architect \(謀者\)/);
  assert.match(sage.prompt, /## Architect \(謀者\)'s answer/);
  assert.equal(session.scholars.scholar1.persona, "Architect", "UI name stays interface-only");
});

test("31. the Mentor (single-Scholar) prompt uses bilingual names when the languages differ", async () => {
  setLanguages("zh-TW", "en");
  await council.runSessionEvents("Q", { mode: "single", scholars: [1] });

  assert.match(seen.openai.system, /You are 謀者（Architect）, a Scholar of the Aether Library/);
  assert.match(seen.openai.system, /use only the name 謀者（Architect）/);
});

test("29. a same-language configuration produces exactly one name, as before this rule existed", async () => {
  setLanguages("zh-TW", "zh-TW");
  await council.runSessionEvents("Q", { mode: "council" });

  assert.match(seen.openai.system, /You are 謀者, a Scholar/);
  // No parenthetical on the PERSONA. (The prompt legitimately contains other
  // full-width parentheses — e.g. the 事件視界（Event Horizon） formatting
  // example — so this must target the name, not the character.)
  assert.doesNotMatch(seen.openai.system, /謀者（/, "no parenthetical when the languages match");
  assert.match(seen.perplexity.system, /大智者/);
  assert.doesNotMatch(seen.perplexity.system, /大智者（/);
  assert.doesNotMatch(seen.perplexity.prompt, /謀者（/);
});

test("32. follow-up context uses the same naming rule", async () => {
  setLanguages("zh-TW", "en");
  await council.runSessionEvents("Q", { mode: "council" });
  seen = {};

  await sessionChat.sessionChatReply("A follow-up question");
  const sage = seen.perplexity;
  assert.match(sage.system, /You are 大智者（Grand Sage）, the Judge/);
  assert.match(sage.system, /- 謀者（Architect） — the Scholar answered by/);
  assert.match(sage.prompt, /### 謀者（Architect）'s answer/);
});

test("32b. a Mentor follow-up uses the same naming rule", async () => {
  setLanguages("zh-TW", "en");
  await council.runSessionEvents("Q", { mode: "single", scholars: [1] });
  seen = {};

  const reply = await sessionChat.sessionChatReply("A follow-up question");
  assert.match(seen.openai.system, /You are 謀者（Architect）/);
  assert.match(seen.openai.prompt, /### Your first answer \(謀者（Architect）\)/);
  assert.match(seen.openai.prompt, /Continue the conversation as 謀者（Architect）/);
  // The reply's speaker — a DISPLAY value — stays interface-language only.
  assert.equal(reply.speaker, "謀者");
});

test("33. a partial-Council ruling names the absent Scholar by the same rule", async () => {
  setLanguages("zh-TW", "en");
  providers.anthropic.complete = async () => {
    const err = new Error("Anthropic API 404: model not found");
    err.status = 404;
    err.code = "provider_error";
    throw err;
  };
  // failureGate off: this test is about naming, not the decision flow.
  const session = await council.runSessionEvents("Q", { mode: "council", failureGate: false });

  const sage = seen.perplexity;
  assert.match(sage.prompt, /## Absent Scholars/);
  assert.match(sage.prompt, /墨者（Oracle）: could not answer/);
  // The participation line the Sage must mention is still generated.
  assert.match(sage.prompt, /## Participation\n2 of 3 Scholars/);
  // The failed Scholar's stored (UI) name is unchanged.
  assert.equal(session.scholars.scholar2.persona, "墨者");
});

test("34. interface and reply language change independently", async () => {
  setLanguages("zh-TW", "en");
  await council.runSessionEvents("Q1", { mode: "single", scholars: [1] });
  assert.match(seen.openai.system, /You are 謀者（Architect）/);

  // Change ONLY the reply language.
  resetSession();
  seen = {};
  setLanguages("zh-TW", "zh-TW");
  await council.runSessionEvents("Q2", { mode: "single", scholars: [1] });
  assert.match(seen.openai.system, /You are 謀者,/, "collapses to one name");

  // Change ONLY the interface language.
  resetSession();
  seen = {};
  setLanguages("en", "zh-TW");
  await council.runSessionEvents("Q3", { mode: "single", scholars: [1] });
  assert.match(seen.openai.system, /You are Architect \(謀者\)/);
});

test("29b. UI-facing values never carry the parenthetical form", async () => {
  setLanguages("zh-TW", "en");
  const session = await council.runSessionEvents("Q", { mode: "council" });

  // Everything the client renders from: tab names, the failure gate, the
  // identity snapshot, the archive record.
  for (const scholar of Object.values(session.scholars)) {
    assert.ok(!scholar.persona.includes("（"), `UI persona leaked the prompt form: ${scholar.persona}`);
    assert.ok(!scholar.persona.includes(" ("), `UI persona leaked the prompt form: ${scholar.persona}`);
  }
  assert.equal(session.identity.judge, "大智者");
  assert.deepEqual(session.identity.scholars, { 1: "謀者", 2: "墨者", 3: "理者" });
});
