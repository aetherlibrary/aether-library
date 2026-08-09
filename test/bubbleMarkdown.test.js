// Speech Bubble Mapping v1 — parser/selector/token resolver
// (src/services/bubbleMarkdown.js). Pure module, no fs — every scenario is
// constructed directly as an MD string in-memory.
//
// Entries are {style, text} objects: `style` is "thought" | "dialogue" when
// the line carries a recognized case-insensitive "[thought]"/"[dialogue]"
// tag, else null (the caller applies its own per-state default — see
// characterAssets.js's DEFAULT_BUBBLE_STYLE).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBubbleMarkdown,
  pickRandomBubbleEntry,
  resolveBubbleTokens,
  requiredBubbleTokens,
  parseCharacterSpeechMarkdown,
  normalizeSectionHeading,
  speechDocumentPath,
  speechDocumentCandidates,
  resolveSpeechDocument,
  parseSpeechSetFilename,
  groupSpeechSetLocales,
  filterDialogueEntries,
  filterThoughtEntries,
  pickEntryAvoidingRepeat,
} from "../src/services/bubbleMarkdown.js";

test("blank lines are ignored", () => {
  const entries = parseBubbleMarkdown("🤔\n\n\nHmm...\n\n");
  assert.deepEqual(entries, [
    { style: null, text: "🤔" },
    { style: null, text: "Hmm..." },
  ]);
});

test("comment lines (# as first char) are ignored", () => {
  const entries = parseBubbleMarkdown("# Omega thinking pool\n🤔\n# another comment\nHmm...");
  assert.deepEqual(entries, [
    { style: null, text: "🤔" },
    { style: null, text: "Hmm..." },
  ]);
});

test("whitespace before # is still recognized as a comment (first NON-WHITESPACE char)", () => {
  const entries = parseBubbleMarkdown("   # indented comment\n🤔");
  assert.deepEqual(entries, [{ style: null, text: "🤔" }]);
});

test("emoji-only entry is valid, untagged", () => {
  assert.deepEqual(parseBubbleMarkdown("🤔"), [{ style: null, text: "🤔" }]);
});

test("text-only entry is valid, untagged", () => {
  assert.deepEqual(parseBubbleMarkdown("Let me think about this."), [{ style: null, text: "Let me think about this." }]);
});

test("emoji + text entry is valid, untagged", () => {
  assert.deepEqual(parseBubbleMarkdown("🤔 I need a moment."), [{ style: null, text: "🤔 I need a moment." }]);
});

test("UTF-8 / multi-codepoint emoji preserved exactly", () => {
  const md = "🧙‍♂️ Ah, a visitor.\n📚➡️🔥";
  assert.deepEqual(parseBubbleMarkdown(md), [
    { style: null, text: "🧙‍♂️ Ah, a visitor." },
    { style: null, text: "📚➡️🔥" },
  ]);
});

test("the task's own example MD parses to exactly six entries", () => {
  const md = [
    "# Omega thinking pool",
    "",
    "🤔",
    "💭",
    "Hmm...",
    "Interesting.",
    "Let me think about this.",
    "🤔 I need a moment.",
  ].join("\n");
  const entries = parseBubbleMarkdown(md);
  assert.equal(entries.length, 6);
  assert.deepEqual(
    entries.map((e) => e.text),
    ["🤔", "💭", "Hmm...", "Interesting.", "Let me think about this.", "🤔 I need a moment."]
  );
  assert.ok(entries.every((e) => e.style === null));
});

// ---------------------------------------------------------- [style] tags

test("[thought] entry parses correctly", () => {
  assert.deepEqual(parseBubbleMarkdown("[thought] I wonder about that."), [{ style: "thought", text: "I wonder about that." }]);
});

test("[dialogue] entry parses correctly", () => {
  assert.deepEqual(parseBubbleMarkdown("[dialogue] I found something!"), [{ style: "dialogue", text: "I found something!" }]);
});

test("the tag is stripped from rendered text — never appears in .text", () => {
  const entries = parseBubbleMarkdown("[thought] 🤔\n[dialogue] Hello there.");
  for (const e of entries) {
    assert.ok(!e.text.includes("[thought]"));
    assert.ok(!e.text.includes("[dialogue]"));
  }
  assert.equal(entries[0].text, "🤔");
  assert.equal(entries[1].text, "Hello there.");
});

test("style tag matching is case-insensitive", () => {
  assert.deepEqual(parseBubbleMarkdown("[Thought] a"), [{ style: "thought", text: "a" }]);
  assert.deepEqual(parseBubbleMarkdown("[THOUGHT] b"), [{ style: "thought", text: "b" }]);
  assert.deepEqual(parseBubbleMarkdown("[DiAlOgUe] c"), [{ style: "dialogue", text: "c" }]);
});

test("emoji-only tagged entry works", () => {
  assert.deepEqual(parseBubbleMarkdown("[thought] 🤔"), [{ style: "thought", text: "🤔" }]);
  assert.deepEqual(parseBubbleMarkdown("[dialogue] ✨"), [{ style: "dialogue", text: "✨" }]);
});

test("malformed/unknown bracketed prefix does not crash and is NOT interpreted as a style", () => {
  const entries = parseBubbleMarkdown("[banana] hello");
  assert.deepEqual(entries, [{ style: null, text: "[banana] hello" }]);
});

test("a mixed pool of tagged and untagged lines parses each independently", () => {
  const md = ["[thought] ⏳", "This is taking a while...", "[dialogue] I found something!", "[thought] 📚", "Wait, this might be useful."].join("\n");
  const entries = parseBubbleMarkdown(md);
  assert.deepEqual(entries, [
    { style: "thought", text: "⏳" },
    { style: null, text: "This is taking a while..." },
    { style: "dialogue", text: "I found something!" },
    { style: "thought", text: "📚" },
    { style: null, text: "Wait, this might be useful." },
  ]);
});

// ------------------------------------------------------- token resolution
// requiredBubbleTokens/resolveBubbleTokens operate on a Bubble Entry's TEXT
// (a plain string, e.g. entry.text) — unchanged from before this task.

test("requiredBubbleTokens: detects every distinct {{token}}, dedup'd", () => {
  assert.deepEqual([...requiredBubbleTokens('I was thinking about "{{vault_random_title}}".')], ["vault_random_title"]);
  assert.deepEqual([...requiredBubbleTokens("no tokens here")], []);
  assert.deepEqual([...requiredBubbleTokens("{{a}} and {{b}} and {{a}} again")], ["a", "b"]);
});

test("resolveBubbleTokens: substitutes an available token", () => {
  assert.equal(resolveBubbleTokens('I was thinking about "{{vault_random_title}}".', { vault_random_title: "The Republic" }), 'I was thinking about "The Republic".');
});

test("resolveBubbleTokens: an entry with no tokens passes through unchanged", () => {
  assert.equal(resolveBubbleTokens("🤔", {}), "🤔");
});

test("tagged entry with {{token}} resolves correctly, style intact", () => {
  const entries = parseBubbleMarkdown('[dialogue] I was thinking about "{{vault_random_title}}".');
  const picked = pickRandomBubbleEntry(entries, { vault_random_title: "The Republic" });
  assert.equal(picked.style, "dialogue");
  assert.equal(resolveBubbleTokens(picked.text, { vault_random_title: "The Republic" }), 'I was thinking about "The Republic".');
});

test("tagged entry with a missing required {{token}} is excluded from selection", () => {
  const entries = parseBubbleMarkdown('[thought] 🤔\n[dialogue] I was thinking about "{{vault_random_title}}".');
  for (let i = 0; i < 30; i++) {
    const picked = pickRandomBubbleEntry(entries, {}); // no vault_random_title supplied
    assert.equal(picked.style, "thought");
    assert.equal(picked.text, "🤔");
  }
});

// -------------------------------------------------- pickRandomBubbleEntry

test("pickRandomBubbleEntry: an entry whose required token is unavailable is excluded", () => {
  const entries = parseBubbleMarkdown('🤔\nInteresting.\nI was thinking about "{{vault_random_title}}".');
  for (let i = 0; i < 30; i++) {
    const picked = pickRandomBubbleEntry(entries, {}); // no vault_random_title supplied
    assert.notEqual(picked.text, 'I was thinking about "{{vault_random_title}}".');
  }
});

test("pickRandomBubbleEntry: an entry whose required token IS available remains eligible and can be chosen", () => {
  const entries = parseBubbleMarkdown('I was thinking about "{{vault_random_title}}".');
  const picked = pickRandomBubbleEntry(entries, { vault_random_title: "The Republic" });
  assert.equal(picked.text, 'I was thinking about "{{vault_random_title}}".');
  assert.equal(resolveBubbleTokens(picked.text, { vault_random_title: "The Republic" }), 'I was thinking about "The Republic".');
});

test("pickRandomBubbleEntry: empty string / null / undefined context values all count as unavailable", () => {
  const entries = parseBubbleMarkdown("{{x}}");
  assert.equal(pickRandomBubbleEntry(entries, { x: "" }), null);
  assert.equal(pickRandomBubbleEntry(entries, { x: null }), null);
  assert.equal(pickRandomBubbleEntry(entries, {}), null);
  assert.equal(pickRandomBubbleEntry(entries, { x: "real" }).text, "{{x}}");
});

test("pickRandomBubbleEntry: no eligible entries returns null, never throws", () => {
  assert.equal(pickRandomBubbleEntry([], {}), null);
  assert.equal(pickRandomBubbleEntry(parseBubbleMarkdown("{{missing}}"), {}), null);
  assert.doesNotThrow(() => pickRandomBubbleEntry(undefined, undefined));
});

test("pickRandomBubbleEntry: picks the WHOLE entry atomically — style is never chosen independently from text", () => {
  const entries = parseBubbleMarkdown("[thought] 🤔\n[dialogue] I have an idea!\n[thought] ✨");
  for (let i = 0; i < 30; i++) {
    const picked = pickRandomBubbleEntry(entries, {});
    if (picked.text === "🤔" || picked.text === "✨") assert.equal(picked.style, "thought");
    if (picked.text === "I have an idea!") assert.equal(picked.style, "dialogue");
  }
});

test("full pipeline: the task's exact scenario — vault-dependent line never appears without vault context", () => {
  const md = "🤔\n💭\nHmm...\nLet me think.\nI was thinking about \"{{vault_random_title}}\".";
  const entries = parseBubbleMarkdown(md);
  for (let i = 0; i < 50; i++) {
    const picked = pickRandomBubbleEntry(entries, {}); // Test-mode context: no vault data
    assert.ok(picked === null || picked.text !== 'I was thinking about "{{vault_random_title}}".');
    assert.ok(picked === null || entries.includes(picked));
  }
});

// ============================================================
// Unified Character Speech document (one file, seven H2 sections)
// ============================================================

const UNIFIED_DOC = [
  "# Classic Alpha",
  "",
  "## PRE THINKING",
  "",
  "[thought] 🤔",
  "[thought] 💭",
  "[dialogue] Interesting question.",
  "[dialogue] Give me a moment.",
  "",
  "## VAULT GATHERING",
  "",
  "[thought] 📚",
  "[thought] ⏳",
  "[dialogue] Let me check the references.",
  "[dialogue] I think I found something.",
  "",
  "## SCHOLAR THINKING",
  "",
  "[thought] 🤔",
  "There may be another angle here.",
  "[dialogue] I have an idea.",
  "",
  "## SCHOLAR ANSWERING",
  "",
  "[dialogue] Here's how I see it.",
  "[dialogue] The important distinction is this.",
  "[thought] 💡",
  "",
  "## GRAND SAGE GATHERING",
  "",
  "[thought] 📝",
  "[thought] Let me bring these ideas together.",
  "",
  "## GRAND SAGE ANSWERING",
  "",
  "[dialogue] Taken together, the answer becomes clearer.",
  "",
  "## POST ANSWERING",
  "",
  "[thought] ✨",
  "[thought] 💭",
  "[dialogue] That was an interesting question.",
  'I may have another thought about "{{vault_recent_title}}".',
].join("\n");

test("parseCharacterSpeechMarkdown: whole document parses into all seven recognized H2 state sections", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  assert.deepEqual(Object.keys(sections).sort(), [
    "grand_sage_answering",
    "grand_sage_gathering",
    "post_answering",
    "pre_thinking",
    "scholar_answering",
    "scholar_thinking",
    "vault_gathering",
  ]);
});

test("normalizeSectionHeading: PRE THINKING normalizes correctly, mixed case/whitespace included", () => {
  assert.equal(normalizeSectionHeading("PRE THINKING"), "pre_thinking");
  assert.equal(normalizeSectionHeading("Pre Thinking"), "pre_thinking");
  assert.equal(normalizeSectionHeading("pre   thinking"), "pre_thinking");
  assert.equal(normalizeSectionHeading("  pre thinking  "), "pre_thinking");
});

test("entries stay inside their own section — pre_thinking never returns scholar_thinking's entries", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  const preTexts = sections.pre_thinking.map((e) => e.text);
  const scholarThinkingTexts = sections.scholar_thinking.map((e) => e.text);
  assert.deepEqual(preTexts, ["🤔", "💭", "Interesting question.", "Give me a moment."]);
  assert.deepEqual(scholarThinkingTexts, ["🤔", "There may be another angle here.", "I have an idea."]);
  for (const t of preTexts) assert.ok(!scholarThinkingTexts.includes(t) || t === "🤔"); // 🤔 legitimately appears in both pools
  assert.ok(!preTexts.includes("There may be another angle here."));
  assert.ok(!scholarThinkingTexts.includes("Interesting question."));
});

test("explicit [thought] and [dialogue] styles both work inside a unified document section", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  assert.deepEqual(sections.scholar_answering, [
    { style: "dialogue", text: "Here's how I see it." },
    { style: "dialogue", text: "The important distinction is this." },
    { style: "thought", text: "💡" },
  ]);
});

test("untagged entry inside a section parses with style: null (state default applies at the caller level)", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  const untagged = sections.scholar_thinking.find((e) => e.text === "There may be another angle here.");
  assert.equal(untagged.style, null);
});

test("emoji works inside unified document sections", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  assert.ok(sections.vault_gathering.some((e) => e.text === "📚" && e.style === "thought"));
});

test("token filtering remains intact inside a unified document section", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  for (let i = 0; i < 30; i++) {
    const picked = pickRandomBubbleEntry(sections.post_answering, {}); // no vault_recent_title supplied
    assert.ok(picked === null || !picked.text.includes("{{"));
  }
  const picked = pickRandomBubbleEntry(sections.post_answering, { vault_recent_title: "The Republic" });
  assert.ok(picked !== null);
});

test("the document title (H1) is never treated as a Bubble entry", () => {
  const sections = parseCharacterSpeechMarkdown(UNIFIED_DOC);
  for (const list of Object.values(sections)) {
    assert.ok(!list.some((e) => e.text.includes("Classic Alpha")));
  }
});

test("text before the first recognized H2 section is ignored", () => {
  const md = ["# Some Title", "This line has no section yet.", "## PRE THINKING", "[thought] 🤔"].join("\n");
  const sections = parseCharacterSpeechMarkdown(md);
  assert.deepEqual(sections.pre_thinking, [{ style: "thought", text: "🤔" }]);
  assert.ok(!Object.values(sections).some((list) => list.some((e) => e.text.includes("no section yet"))));
});

test("an unknown H2 section does not pollute the recognized state before or after it", () => {
  const md = ["## PRE THINKING", "[thought] 🤔", "## IDLE", "[thought] should not appear anywhere", "## VAULT GATHERING", "[thought] 📚"].join("\n");
  const sections = parseCharacterSpeechMarkdown(md);
  assert.deepEqual(sections.pre_thinking, [{ style: "thought", text: "🤔" }]);
  assert.deepEqual(sections.vault_gathering, [{ style: "thought", text: "📚" }]);
  assert.equal(sections.idle, undefined);
  for (const list of Object.values(sections)) {
    assert.ok(!list.some((e) => e.text.includes("should not appear")));
  }
});

test("a missing/never-authored section returns undefined; the caller's `sections[state] || []` + pickRandomBubbleEntry is a safe no-op", () => {
  const md = ["## PRE THINKING", "[thought] 🤔"].join("\n");
  const sections = parseCharacterSpeechMarkdown(md);
  assert.equal(sections.scholar_answering, undefined);
  assert.equal(pickRandomBubbleEntry(sections.scholar_answering || [], {}), null);
});

// ------------------------------------------------------ Localized filename

test("speechDocumentPath builds the deterministic <speechSet>_<locale>.md path", () => {
  assert.equal(speechDocumentPath("classic_alpha", "en"), "assets/dialogue/bubbles/classic_alpha_en.md");
  assert.equal(speechDocumentPath("classic_alpha", "zh-TW"), "assets/dialogue/bubbles/classic_alpha_zh-TW.md");
});

test("speechDocumentCandidates: locale resolver selects the expected localized file, requested locale first", () => {
  assert.deepEqual(speechDocumentCandidates("classic_alpha", "zh-TW"), [
    "assets/dialogue/bubbles/classic_alpha_zh-TW.md",
    "assets/dialogue/bubbles/classic_alpha_en.md",
  ]);
});

test("speechDocumentCandidates: requesting en produces no duplicate fallback entry", () => {
  assert.deepEqual(speechDocumentCandidates("classic_alpha", "en"), ["assets/dialogue/bubbles/classic_alpha_en.md"]);
});

test("resolveSpeechDocument: requested locale resolves directly when its file exists", async () => {
  const fetchText = async (p) => (p === "assets/dialogue/bubbles/classic_alpha_en.md" ? "## PRE THINKING\n[thought] hi" : null);
  const result = await resolveSpeechDocument("classic_alpha", "en", fetchText);
  assert.equal(result.path, "assets/dialogue/bubbles/classic_alpha_en.md");
  assert.equal(result.locale, "en");
});

test("resolveSpeechDocument: requested locale fallback to English works when the localized file is missing", async () => {
  const fetchText = async (p) => (p === "assets/dialogue/bubbles/classic_alpha_en.md" ? "## PRE THINKING\n[thought] hi" : null);
  const result = await resolveSpeechDocument("classic_alpha", "zh-TW", fetchText);
  assert.equal(result.path, "assets/dialogue/bubbles/classic_alpha_en.md");
  assert.equal(result.locale, "en");
});

test("resolveSpeechDocument: missing every locale (requested + en) fails safely, never throws", async () => {
  const fetchText = async () => null;
  await assert.doesNotReject(async () => {
    const result = await resolveSpeechDocument("classic_alpha", "zh-TW", fetchText);
    assert.equal(result, null);
  });
});

test("resolveSpeechDocument: no Speech Set configured returns null immediately, never calls fetchText", async () => {
  let called = false;
  const fetchText = async () => {
    called = true;
    return null;
  };
  const result = await resolveSpeechDocument(null, "en", fetchText);
  assert.equal(result, null);
  assert.equal(called, false);
});

// ============================================================
// Discovering Speech Sets — grouping localized filenames automatically
// ============================================================

test("parseSpeechSetFilename: recognizes <speechSet>_<locale>.md, extracts both pieces", () => {
  assert.deepEqual(parseSpeechSetFilename("classic_omega_en.md"), { speechSet: "classic_omega", locale: "en" });
  assert.deepEqual(parseSpeechSetFilename("classic_omega_zh-TW.md"), { speechSet: "classic_omega", locale: "zh-TW" });
  assert.deepEqual(parseSpeechSetFilename("classic_alpha_ja.md"), { speechSet: "classic_alpha", locale: "ja" });
});

test("parseSpeechSetFilename: a legacy per-state filename (no locale suffix) never matches", () => {
  assert.equal(parseSpeechSetFilename("pre_thinking.md"), null);
  assert.equal(parseSpeechSetFilename("alpha_pre_thinking.md"), null);
  assert.equal(parseSpeechSetFilename("scholar_answering.md"), null);
});

test("groupSpeechSetLocales: the task's own example — one entry per logical Speech Set, never per locale", () => {
  const grouped = groupSpeechSetLocales(["classic_omega_en.md", "classic_omega_zh-TW.md", "classic_alpha_en.md", "classic_alpha_zh-TW.md", "classic_beta_en.md"]);
  assert.deepEqual(grouped, {
    classic_omega: ["en", "zh-TW"],
    classic_alpha: ["en", "zh-TW"],
    classic_beta: ["en"],
  });
});

test("groupSpeechSetLocales: legacy per-state filenames never contribute a bogus Speech Set entry", () => {
  const grouped = groupSpeechSetLocales(["classic_omega_en.md", "pre_thinking.md", "alpha_pre_thinking.md"]);
  assert.deepEqual(Object.keys(grouped), ["classic_omega"]);
});

test("groupSpeechSetLocales: locales come back sorted and deduplicated", () => {
  const grouped = groupSpeechSetLocales(["classic_omega_ja.md", "classic_omega_en.md", "classic_omega_en.md", "classic_omega_zh-TW.md"]);
  assert.deepEqual(grouped.classic_omega, ["en", "ja", "zh-TW"]);
});

test("groupSpeechSetLocales: an empty or absent file list yields an empty grouping, never throws", () => {
  assert.deepEqual(groupSpeechSetLocales([]), {});
  assert.deepEqual(groupSpeechSetLocales(undefined), {});
});

// ============================================================
// Idle lifecycle pools — PRE THINKING split by tag (Idle Controller)
// ============================================================

test("filterDialogueEntries: only explicit [dialogue] entries — untagged and [thought] are excluded", () => {
  const entries = parseCharacterSpeechMarkdown("## PRE THINKING\n[thought] 🤔\n[dialogue] Hello.\nUntagged line.\n[dialogue] Another line.").pre_thinking;
  const dialogue = filterDialogueEntries(entries);
  assert.deepEqual(
    dialogue.map((e) => e.text),
    ["Hello.", "Another line."]
  );
  assert.ok(dialogue.every((e) => e.style === "dialogue"));
});

test("filterThoughtEntries: explicit [thought] AND untagged entries both belong to the hover pool — only [dialogue] is excluded", () => {
  const entries = parseCharacterSpeechMarkdown("## PRE THINKING\n[thought] 🤔\n[dialogue] Hello.\nUntagged line.\n✨").pre_thinking;
  const thoughts = filterThoughtEntries(entries);
  assert.deepEqual(
    thoughts.map((e) => e.text),
    ["🤔", "Untagged line.", "✨"]
  );
  assert.ok(!thoughts.some((e) => e.style === "dialogue"));
});

test("filterDialogueEntries/filterThoughtEntries: every entry lands in exactly one pool, none lost, none duplicated", () => {
  const entries = parseCharacterSpeechMarkdown("## PRE THINKING\n[thought] a\n[dialogue] b\nc\n[thought] d\n[dialogue] e").pre_thinking;
  const dialogue = filterDialogueEntries(entries);
  const thoughts = filterThoughtEntries(entries);
  assert.equal(dialogue.length + thoughts.length, entries.length);
  for (const e of entries) {
    const inDialogue = dialogue.includes(e);
    const inThoughts = thoughts.includes(e);
    assert.notEqual(inDialogue, inThoughts); // exactly one, never both, never neither
  }
});

test("filterDialogueEntries/filterThoughtEntries: empty/absent input is safe", () => {
  assert.deepEqual(filterDialogueEntries([]), []);
  assert.deepEqual(filterDialogueEntries(undefined), []);
  assert.deepEqual(filterThoughtEntries([]), []);
  assert.deepEqual(filterThoughtEntries(undefined), []);
});

test("pickEntryAvoidingRepeat: avoids an immediate repeat when a different eligible entry exists", () => {
  const entries = [
    { style: "dialogue", text: "A" },
    { style: "dialogue", text: "B" },
  ];
  for (let i = 0; i < 30; i++) {
    const picked = pickEntryAvoidingRepeat(entries, {}, "A");
    assert.equal(picked.text, "B"); // the only alternative to "A" is always chosen
  }
});

test("pickEntryAvoidingRepeat: falls back to repeating when the avoided text is the ONLY eligible entry", () => {
  const entries = [{ style: "dialogue", text: "Only one." }];
  const picked = pickEntryAvoidingRepeat(entries, {}, "Only one.");
  assert.equal(picked.text, "Only one.");
});

test("pickEntryAvoidingRepeat: no prior text to avoid (undefined) behaves like a normal pick", () => {
  const entries = [{ style: "dialogue", text: "Solo." }];
  const picked = pickEntryAvoidingRepeat(entries, {}, undefined);
  assert.equal(picked.text, "Solo.");
});

test("pickEntryAvoidingRepeat: still respects token filtering — an ineligible entry is never picked even to avoid a repeat", () => {
  const entries = [
    { style: "dialogue", text: "I need {{missing_token}}." },
    { style: "dialogue", text: "Plain line." },
  ];
  for (let i = 0; i < 20; i++) {
    const picked = pickEntryAvoidingRepeat(entries, {}, "Plain line.");
    assert.equal(picked.text, "Plain line."); // the only token-eligible entry, repeat is unavoidable and correct
  }
});
