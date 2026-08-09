// Clickable NPC interaction.
//
// The mapping and the priority rules are real behaviour in a pure module, so
// those are proper behavioural tests. CLICKED parsing is tested against the
// canonical parser AND the shipped dialogue files. The DOM half (timers,
// listeners, the animation) has no DOM available in this project — no jsdom,
// same precedent as bookHotspotPointerEvents.test.js — so those are
// source-level guards on the specific promises that matter.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  NPC_CLICK_ANIMATION_MS,
  NPC_CLICK_SCALE,
  CLICKED_DIALOGUE_VISIBLE_MS,
  CLICKED_DIALOGUE_FADE_MS,
  BUBBLE_PRIORITY,
  bubblePriorityRank,
  canBubbleReplace,
  scholarSlotByRole,
  npcClickIntent,
  canShowHoverThought,
  isScholarSlotReady,
  isCouncilEligibleSlot,
  councilEligibleSlots,
} from "../src/services/npcInteraction.js";
import { parseCharacterSpeechMarkdown, pickRandomBubbleEntry, filterDialogueEntries } from "../src/services/bubbleMarkdown.js";
import { SPEECH_STATES, DEFAULT_BUBBLE_STYLE } from "../src/services/characterAssets.js";

// The runtime's real tables, mirrored here as test INPUT only — npcClickIntent
// receives them rather than owning them.
const SCHOLAR_ROLE_BY_SLOT = { 1: "alpha", 2: "beta", 3: "gamma" };
const SAGE_ROLE_ID = "sage";
const ROLES = { scholarRoleBySlot: SCHOLAR_ROLE_BY_SLOT, sageRoleId: SAGE_ROLE_ID };

// ------------------------------------------------------- 1. CLICKED parsing

test("the parser recognizes the '## CLICKED' section exactly as authored", () => {
  const md = ["# Classic Alpha", "## PRE THINKING", "[thought] hmm", "## CLICKED", "[dialogue] I'm listening.", "[dialogue] Let's begin."].join("\n");
  const parsed = parseCharacterSpeechMarkdown(md);
  assert.equal(parsed.clicked.length, 2);
  assert.deepEqual(parsed.clicked[0], { style: "dialogue", text: "I'm listening." });
  assert.equal(parsed.pre_thinking.length, 1, "existing sections are unaffected");
});

test("CLICKED follows the project's existing heading normalization", () => {
  for (const heading of ["## CLICKED", "## Clicked", "## clicked"]) {
    const parsed = parseCharacterSpeechMarkdown([heading, "[dialogue] hello"].join("\n"));
    assert.equal(parsed.clicked?.length, 1, `${heading} must normalize to the same section`);
  }
});

test("clicked is a recognized speech state in the canonical table, defaulting to spoken dialogue", () => {
  assert.ok(SPEECH_STATES.includes("clicked"));
  assert.equal(DEFAULT_BUBBLE_STYLE.clicked, "dialogue");
});

test("every shipped Character dialogue file provides CLICKED [dialogue] lines in both locales", () => {
  const dir = path.join(process.cwd(), "assets", "dialogue", "bubbles");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 8, "expected the shipped Speech Set documents");
  for (const file of files) {
    const parsed = parseCharacterSpeechMarkdown(fs.readFileSync(path.join(dir, file), "utf8"));
    const clicked = parsed.clicked || [];
    assert.ok(clicked.length > 0, `${file} must author a CLICKED section`);
    assert.ok(filterDialogueEntries(clicked).length > 0, `${file}'s CLICKED lines must be [dialogue]`);
  }
});

test("a random CLICKED line is selectable through the existing picker", () => {
  const parsed = parseCharacterSpeechMarkdown(["## CLICKED", "[dialogue] one", "[dialogue] two"].join("\n"));
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(pickRandomBubbleEntry(parsed.clicked, {}).text);
  assert.deepEqual([...seen].sort(), ["one", "two"], "both lines are reachable");
});

// ------------------------------------------- 2/3. click -> mode + scholar

test("clicking Alpha, Beta or Gamma selects Mentor mode with that Scholar", () => {
  assert.deepEqual(npcClickIntent("alpha", ROLES), { mode: "single", slot: 1 });
  assert.deepEqual(npcClickIntent("beta", ROLES), { mode: "single", slot: 2 });
  assert.deepEqual(npcClickIntent("gamma", ROLES), { mode: "single", slot: 3 });
});

test("clicking Omega (the Grand Sage Role) selects Council mode and no single Scholar", () => {
  assert.deepEqual(npcClickIntent("sage", ROLES), { mode: "council", slot: null });
});

test("the Role -> slot mapping is derived from the runtime table, never redeclared", () => {
  // Inverting the caller's table is the whole mechanism: renaming a slot's
  // Role there changes this result with no edit to npcInteraction.js.
  assert.deepEqual(scholarSlotByRole(SCHOLAR_ROLE_BY_SLOT), { alpha: 1, beta: 2, gamma: 3 });
  assert.deepEqual(npcClickIntent("delta", { scholarRoleBySlot: { 1: "delta" }, sageRoleId: "sage" }), { mode: "single", slot: 1 });
  // Comments legitimately quote the runtime table to explain the inversion;
  // it is the executable code that must contain no Role literal.
  const code = fs
    .readFileSync(path.join(process.cwd(), "src", "services", "npcInteraction.js"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  for (const literal of ['"alpha"', '"beta"', '"gamma"', '"sage"', '"omega"']) {
    assert.ok(!code.includes(literal), `npcInteraction.js must not hardcode ${literal}`);
  }
});

test("a Role with no conversation meaning is safely clickable and changes no mode", () => {
  for (const roleId of ["traveler", "pet", "", null, undefined]) {
    assert.equal(npcClickIntent(roleId, ROLES), null);
  }
});

// ------------------------------------ Omega -> all eligible council slots

const PROVIDERS = { openai: { enabled: true }, anthropic: { enabled: true }, off: { enabled: false } };
const slot = (n, extra = {}) => ({ slot: n, provider: "openai", configured: true, ...extra });

test("an eligible slot is one that is ready AND not disabled — the picker's own rule", () => {
  assert.equal(isCouncilEligibleSlot(slot(1), PROVIDERS.openai), true);
  assert.equal(isCouncilEligibleSlot(slot(1, { enabled: false }), PROVIDERS.openai), false, "explicitly disabled");
  assert.equal(isCouncilEligibleSlot(slot(1, { configured: false }), PROVIDERS.openai), false, "no API key");
  assert.equal(isCouncilEligibleSlot(slot(1, { provider: "off" }), PROVIDERS.off), false, "provider disabled");
});

test("readiness prefers the backend's own verdict, and never invents it", () => {
  assert.equal(isScholarSlotReady(slot(1, { ready: false }), PROVIDERS.openai), false, "an explicit not-ready wins");
  assert.equal(isScholarSlotReady(slot(1, { configured: false, ready: true }), PROVIDERS.openai), true, "an explicit ready wins");
  assert.equal(isScholarSlotReady({ slot: 1 }, undefined), false, "unknown provider is never assumed ready");
  assert.equal(isScholarSlotReady(null, undefined), false);
});

test("clicking Omega selects every eligible Scholar, ascending", () => {
  const slots = [slot(1), slot(2, { provider: "anthropic" }), slot(3)];
  assert.deepEqual(councilEligibleSlots(slots, PROVIDERS), [1, 2, 3]);
});

test("clicking Omega never enables an unavailable Scholar", () => {
  const slots = [
    slot(1),
    slot(2, { configured: false }), // no API key
    slot(3, { enabled: false }), // switched off in Settings
    slot(4, { provider: "off" }), // provider disabled
  ];
  assert.deepEqual(councilEligibleSlots(slots, PROVIDERS), [1], "only the genuinely available slot");
});

test("no eligible Scholar yields an empty list, which the caller treats as leave-alone", () => {
  assert.deepEqual(councilEligibleSlots([slot(1, { configured: false })], PROVIDERS), []);
  assert.deepEqual(councilEligibleSlots([], PROVIDERS), []);
  assert.deepEqual(councilEligibleSlots(undefined, PROVIDERS), []);
});

test("the Omega selection lives in the click path only — manual Council switching is untouched", () => {
  const setModeFn = extractFn(appJs, "function setMode(mode)");
  assert.ok(!setModeFn.includes("applyCouncilEligibleSelection"), "setMode must keep its existing behaviour");
  const handle = extractFn(appJs, "function handleNpcClick(roleId, sceneObjectId)");
  assert.match(handle, /else applyCouncilEligibleSelection\(\);/, "only the sage branch applies it");
});

test("the Omega selection reuses the picker's predicate and leaves a zero-eligible picker alone", () => {
  const fn = extractFn(appJs, "function applyCouncilEligibleSelection()");
  assert.match(fn, /const eligible = councilEligibleSlots\(\);/);
  assert.match(fn, /if \(!eligible\.length\) return;/, "never clears the selection to zero");
  assert.match(fn, /syncScholarChips\(\);/, "reuses the existing chip sync");
  // buildScholarPicker's Council default must now go through the SAME predicate.
  // (Its signature gained a `{ reset }` option when active selection stopped
  // being derived from provider config — see services/scholarSelection.js.)
  const picker = extractFn(appJs, "function buildScholarPicker(cfg, { reset = false } = {})");
  assert.match(picker, /isCouncilEligibleSlot\(slot, provider\)/);
  assert.match(picker, /const ready = isScholarSlotReady\(slot, provider\);/);
});

// ------------------------------------------------ 6/7. bubble priority

test("bubble priority is active session > clicked > hover thought > idle dialogue", () => {
  assert.deepEqual(BUBBLE_PRIORITY, ["active_session", "clicked", "hover_thought", "idle_dialogue"]);
  assert.ok(bubblePriorityRank("active_session") < bubblePriorityRank("clicked"));
  assert.ok(bubblePriorityRank("clicked") < bubblePriorityRank("hover_thought"));
  assert.ok(bubblePriorityRank("hover_thought") < bubblePriorityRank("idle_dialogue"));
});

test("a hover thought or idle dialogue can never replace clicked dialogue", () => {
  assert.equal(canBubbleReplace("clicked", "hover_thought"), false);
  assert.equal(canBubbleReplace("clicked", "idle_dialogue"), false);
  assert.equal(canBubbleReplace("clicked", "active_session"), true, "an active session still wins");
  assert.equal(canBubbleReplace("clicked", "clicked"), true, "another click hands over");
});

test("a hover thought is blocked while any clicked dialogue is showing", () => {
  assert.equal(canShowHoverThought({ idleMode: "pre", clickedRoleId: "alpha", roleId: "alpha" }), false);
  assert.equal(canShowHoverThought({ idleMode: "pre", clickedRoleId: "alpha", roleId: "beta" }), false, "not even a different Character's");
});

test("after clicked dialogue ends, the pointer must leave and re-enter before a hover thought returns", () => {
  // Dialogue gone (clickedRoleId null) but the pointer never moved.
  assert.equal(canShowHoverThought({ idleMode: "pre", clickedRoleId: null, suppressedRoleId: "alpha", roleId: "alpha" }), false);
  // A different Character is unaffected by Alpha's suppression.
  assert.equal(canShowHoverThought({ idleMode: "pre", clickedRoleId: null, suppressedRoleId: "alpha", roleId: "beta" }), true);
  // Pointer left Alpha (the handler clears the suppression) and came back.
  assert.equal(canShowHoverThought({ idleMode: "pre", clickedRoleId: null, suppressedRoleId: null, roleId: "alpha" }), true);
});

test("hover thoughts stay confined to ambient idle, exactly as before", () => {
  for (const idleMode of ["active", "post"]) {
    assert.equal(canShowHoverThought({ idleMode, clickedRoleId: null, suppressedRoleId: null, roleId: "alpha" }), false);
  }
});

// ------------------------------------------------------- 7. timing constants

test("the three durations are named constants at the required values", () => {
  assert.equal(NPC_CLICK_ANIMATION_MS, 200);
  assert.equal(NPC_CLICK_SCALE, 1.03);
  assert.equal(CLICKED_DIALOGUE_VISIBLE_MS, 1800);
  assert.ok(CLICKED_DIALOGUE_FADE_MS >= 200 && CLICKED_DIALOGUE_FADE_MS <= 250, "fade stays in the 200-250ms band");
});

// ------------------------------------------------------------ app.js wiring

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");

function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  // The body brace, not a destructured parameter's ("{ hide = true } = {}").
  const paren = src.indexOf(") {", start);
  const open = paren >= 0 ? paren + 2 : src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

test("the app.js mirror keeps the same constants as the module", () => {
  assert.match(appJs, /const NPC_CLICK_ANIMATION_MS = 200;/);
  assert.match(appJs, /const NPC_CLICK_SCALE = 1\.03;/);
  assert.match(appJs, /const CLICKED_DIALOGUE_VISIBLE_MS = 1800;/);
  assert.match(appJs, /const CLICKED_DIALOGUE_FADE_MS = 250;/);
  assert.match(appJs, /"post_answering", "clicked"\]/, "the production parser mirror recognizes CLICKED");
});

test("4. the mode switch and focus are synchronous, and the bubble is fire-and-forget", () => {
  const fn = extractFn(appJs, "function handleNpcClick(roleId, sceneObjectId)");
  const modeAt = fn.indexOf("setMode(intent.mode)");
  const focusAt = fn.indexOf("els.question.focus()");
  const bubbleAt = fn.indexOf("showClickedDialogue(roleId)");
  assert.ok(modeAt > 0 && focusAt > modeAt, "mode then focus");
  assert.ok(bubbleAt > focusAt, "the dialogue is started only after both, and never awaited");
  assert.doesNotMatch(fn, /await /, "handleNpcClick must not block on the dialogue resolving");
  assert.match(fn, /toggleScholar\(intent\.slot\)/, "reuses the existing scholar selection");
});

test("8. clicking another NPC replaces the previous clicked dialogue through one central cancel", () => {
  const fn = extractFn(appJs, "function handleNpcClick(roleId, sceneObjectId)");
  assert.match(fn, /cancelClickedDialogue\(\);/, "any previous clicked dialogue is torn down first");
  const cancel = extractFn(appJs, "function cancelClickedDialogue(");
  assert.match(cancel, /clearTimeout\(npcClickState\.holdTimer\)/);
  assert.match(cancel, /clearTimeout\(npcClickState\.fadeTimer\)/);
  assert.match(cancel, /npcClickState\.token \+= 1;/, "in-flight callbacks are invalidated");
});

test("timers are centralized on one state record, not attached per NPC", () => {
  assert.match(appJs, /const npcClickState = \{/);
  const show = extractFn(appJs, "async function showClickedDialogue(roleId)");
  assert.doesNotMatch(show, /setTimeout\(/, "the show path delegates its timers to the scheduler");
  const sched = extractFn(appJs, "function scheduleClickedDialogueDismissal(token)");
  assert.match(sched, /npcClickState\.holdTimer = setTimeout/);
  assert.match(sched, /npcClickState\.fadeTimer = setTimeout/);
  assert.match(sched, /if \(npcClickState\.token !== token\) return;/);
});

test("5. a mouseleave does not dismiss clicked dialogue", () => {
  assert.match(appJs, /if \(npcClickState\.sceneObjectId === sceneObjectId\) return;\s*\n\s*hideCharacterBubble\(sceneObjectId\);/);
});

test("9. an active session cancels clicked dialogue, and so does Reset", () => {
  assert.match(extractFn(appJs, "function idleEnterActive()"), /cancelClickedDialogue\(\);/);
  assert.match(extractFn(appJs, "function resetIdleController()"), /cancelClickedDialogue\(\);/);
});

test("idle dialogue is suppressed while clicked dialogue is visible", () => {
  assert.match(extractFn(appJs, "function maybeTriggerPreDialogue(now)"), /if \(clickedDialogueActive\(\)\) return;/);
  assert.match(extractFn(appJs, "function maybeTriggerPostIdle(now)"), /if \(clickedDialogueActive\(\)\) return;/);
});

test("10. missing or empty CLICKED content fails safely — no empty bubble, no throw", () => {
  const show = extractFn(appJs, "async function showClickedDialogue(roleId)");
  assert.match(show, /if \(!resolved\.ok\) return;/, "no live Character / no Speech Set");
  assert.match(show, /if \(!picked\) return;/, "section present but empty");
  assert.match(show, /if \(!text\) return;/, "resolved to nothing");
  assert.match(show, /catch \(err\)/, "never throws out of the click handler");
  // The parser itself returns no key at all for an unauthored section.
  assert.deepEqual(parseCharacterSpeechMarkdown("## PRE THINKING\n[thought] hi").clicked, undefined);
  assert.equal(pickRandomBubbleEntry(undefined, {}), null);
  assert.equal(pickRandomBubbleEntry([], {}), null);
});

test("only real Characters are clickable, and F8 authoring keeps priority", () => {
  const fn = extractFn(appJs, "function attachNpcClickDelegation()");
  assert.match(fn, /if \(window\.__sceneEditor\?\.state\?\.active\) return;/, "the existing runtime-vs-authoring guard");
  assert.match(fn, /findRoleIdForSceneObjectId\(sceneObjectId\)/, "props have no Role, so they never match");
  assert.match(fn, /if \(!roleId\) return;/);
  // Capture phase + stopPropagation is what prevents the Core Book hotspot's
  // own bubble-phase listener from double-firing on a Character click.
  assert.match(fn, /event\.stopPropagation\(\);/);
  assert.match(fn, /\},\s*true\s*\);/, "registered in the capture phase");
});

test("the click animation preserves the existing inline transform and never persists", () => {
  const fn = extractFn(appJs, "function playNpcClickAnimation(sceneObjectId)");
  assert.match(fn, /const base = el\.style\.transform \|\| "";/, "builds on the current transform");
  assert.match(fn, /\$\{base\} scale\(1\)/);
  assert.match(fn, /\$\{base\} scale\(\$\{NPC_CLICK_SCALE\}\)/);
  assert.doesNotMatch(fn, /fill:\s*["'](forwards|both)["']/, "must revert to the pre-animation state");
  assert.doesNotMatch(fn, /el\.style\.transform =/, "never writes the transform back");
  assert.match(fn, /typeof el\.animate !== "function"/, "degrades safely without WAAPI");
});

test("existing hover/glow and Core Book behaviour are not rerouted through this feature", () => {
  // The hover delegation still owns the glow/outline and its own bubble.
  assert.match(appJs, /function attachCharacterHoverDelegation\(\)/);
  assert.match(appJs, /attachCharacterHoverDelegation\(\);\s*\n\s*attachNpcClickDelegation\(\);/);
  // The Core Book hotspot listener is untouched.
  assert.match(appJs, /if \(e\.clientX >= r\.left && e\.clientX <= r\.right/);
  assert.match(appJs, /openModeModal\(\);/);
});
