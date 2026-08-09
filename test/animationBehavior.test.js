// Pure Animation "Behavior" validation (src/services/animationBehavior.js) —
// the shape checker for the OPTIONAL external JSON file an Animation effect
// can reference (effect.behavior, sanitizeHoverEffect's "animation" branch,
// sceneConfig.js) telling the runtime how a Prop's Animation should react to
// named app/session-state events (see dispatchSceneBehaviorEvent, app.js,
// which mirrors this exact logic inline since it's a plain global-scope
// browser script and can't import an ES module).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeAnimationBehavior, findMatchingBehaviorRule } from "../src/services/animationBehavior.js";

const VALID = {
  version: 1,
  rules: [
    { when: "vault_gathering", play: true, speed: 1.0 },
    { when: "scholar_thinking", play: true, speed: 1.5 },
    { when: "post_answering", play: false },
  ],
};

test("sanitizeAnimationBehavior: a well-formed v1 file round-trips every field", () => {
  const out = sanitizeAnimationBehavior(VALID);
  assert.equal(out.version, 1);
  assert.equal(out.rules.length, 3);
  assert.deepEqual(out.rules[0], { when: "vault_gathering", play: true, speed: 1 });
  assert.deepEqual(out.rules[2], { when: "post_answering", play: false });
});

test("sanitizeAnimationBehavior: a rule with only `when` (no play/speed) survives with just that field", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "hover" }] });
  assert.deepEqual(out.rules, [{ when: "hover" }]);
});

test("sanitizeAnimationBehavior: rejects non-object/array-typed input", () => {
  assert.equal(sanitizeAnimationBehavior(null), null);
  assert.equal(sanitizeAnimationBehavior(undefined), null);
  assert.equal(sanitizeAnimationBehavior("not json"), null);
  assert.equal(sanitizeAnimationBehavior(42), null);
  assert.equal(sanitizeAnimationBehavior([]), null);
});

test("sanitizeAnimationBehavior: rejects an unsupported/missing version — v1 is the only supported shape", () => {
  assert.equal(sanitizeAnimationBehavior({ version: 2, rules: [] }), null);
  assert.equal(sanitizeAnimationBehavior({ rules: [] }), null);
  assert.equal(sanitizeAnimationBehavior({ version: "1", rules: [] }), null, "version must be the number 1, not a string");
});

test("sanitizeAnimationBehavior: rejects a file whose `rules` is missing or not an array", () => {
  assert.equal(sanitizeAnimationBehavior({ version: 1 }), null);
  assert.equal(sanitizeAnimationBehavior({ version: 1, rules: "oops" }), null);
  assert.equal(sanitizeAnimationBehavior({ version: 1, rules: { when: "x" } }), null);
});

test("sanitizeAnimationBehavior: an empty rules array is valid (a Behavior file with no rules yet)", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [] });
  assert.deepEqual(out, { version: 1, rules: [] });
});

test("sanitizeAnimationBehavior: malformed individual rules are dropped, not the whole file", () => {
  const out = sanitizeAnimationBehavior({
    version: 1,
    rules: [
      { when: "ok_one", play: true },
      { play: true }, // missing `when` — dropped
      { when: "" }, // empty `when` — dropped
      { when: "   " }, // whitespace-only `when` — dropped
      null, // not an object — dropped
      "nope", // not an object — dropped
      { when: "ok_two" },
    ],
  });
  assert.deepEqual(out.rules.map((r) => r.when), ["ok_one", "ok_two"]);
});

test("sanitizeAnimationBehavior: `when` is trimmed", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "  scholar_thinking  " }] });
  assert.equal(out.rules[0].when, "scholar_thinking");
});

test("sanitizeAnimationBehavior: a non-boolean `play` is dropped from the rule, not rejecting the rule", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", play: "true" }] });
  assert.deepEqual(out.rules, [{ when: "x" }]);
});

test("sanitizeAnimationBehavior: Behavior speed is allowed to exceed the F8 authoring max (0.5-3.0) — advanced authoring, e.g. 4.0x", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", speed: 4.0 }] });
  assert.equal(out.rules[0].speed, 4.0);
});

test("sanitizeAnimationBehavior: Behavior speed is never snapped to the F8 slider's 0.5 increments", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", speed: 1.73 }] });
  assert.equal(out.rules[0].speed, 1.73);
});

test("sanitizeAnimationBehavior: a `speed` outside the runtime safety range (0.1-10) is dropped from the rule, not clamped", () => {
  const tooLow = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", play: true, speed: 0.05 }] });
  assert.deepEqual(tooLow.rules, [{ when: "x", play: true }], "an invalid speed drops just that field — the rest of the rule stays valid");
  const tooHigh = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", play: true, speed: 10.5 }] });
  assert.deepEqual(tooHigh.rules, [{ when: "x", play: true }]);
});

test("sanitizeAnimationBehavior: the safety range boundaries (0.1 and 10) are themselves valid, inclusive", () => {
  const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "a", speed: 0.1 }, { when: "b", speed: 10 }] });
  assert.equal(out.rules[0].speed, 0.1);
  assert.equal(out.rules[1].speed, 10);
});

test("sanitizeAnimationBehavior: a non-finite/non-numeric `speed` is dropped", () => {
  for (const bad of [NaN, Infinity, -Infinity, "1.5", null, {}]) {
    const out = sanitizeAnimationBehavior({ version: 1, rules: [{ when: "x", speed: bad }] });
    assert.deepEqual(out.rules, [{ when: "x" }], `speed=${String(bad)} must be dropped`);
  }
});

test("findMatchingBehaviorRule: returns the rule whose `when` matches the event name exactly", () => {
  const behavior = sanitizeAnimationBehavior(VALID);
  assert.deepEqual(findMatchingBehaviorRule(behavior, "scholar_thinking"), { when: "scholar_thinking", play: true, speed: 1.5 });
  assert.deepEqual(findMatchingBehaviorRule(behavior, "post_answering"), { when: "post_answering", play: false });
});

test("findMatchingBehaviorRule: returns null for a state with no matching rule — never throws, never falls back to a default rule", () => {
  const behavior = sanitizeAnimationBehavior(VALID);
  assert.equal(findMatchingBehaviorRule(behavior, "pre_thinking"), null);
  assert.equal(findMatchingBehaviorRule(behavior, "totally_unknown_event"), null);
});

test("findMatchingBehaviorRule: gracefully returns null for a null/invalid behavior or event name, never throws", () => {
  assert.equal(findMatchingBehaviorRule(null, "x"), null);
  assert.equal(findMatchingBehaviorRule(undefined, "x"), null);
  const behavior = sanitizeAnimationBehavior(VALID);
  assert.equal(findMatchingBehaviorRule(behavior, ""), null);
  assert.equal(findMatchingBehaviorRule(behavior, undefined), null);
  assert.equal(findMatchingBehaviorRule(behavior, 42), null);
});

test("findMatchingBehaviorRule: first-match-wins when two rules share the same `when` (an authoring mistake)", () => {
  const behavior = sanitizeAnimationBehavior({
    version: 1,
    rules: [
      { when: "x", speed: 1 },
      { when: "x", speed: 9 },
    ],
  });
  assert.equal(findMatchingBehaviorRule(behavior, "x").speed, 1);
});

test("the module contains no reference to any specific Council/session-state name — it is a fully generic string-matching engine", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "animationBehavior.js"), "utf8");
  const code = src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(code, /[Cc]ouncil|scholar_|vault_gathering|grand_sage|post_answering|pre_thinking/, "event names are caller-supplied strings only — never hardcoded here (comments may still explain the concept in prose)");
});
