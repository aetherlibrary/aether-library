// Pure validation for Player Interaction Animation "Behavior" files (v1) —
// see sanitizeHoverEffect's "animation" branch in sceneConfig.js for the
// `behavior` PATH field (Scene Config stores ONLY a project-relative path,
// never the file's contents — see the module comment there). This module
// validates the CONTENTS of the file that path points to, loaded at
// runtime by getAnimationBehavior()/loadAnimationBehaviorUncached() in
// public/app.js, which mirrors this exact logic inline since that file is a
// plain global-scope script and can't import an ES module.
//
// Declarative data ONLY — a Behavior file can never contain code. A rule
// says "when this named event happens, play/stop and optionally set an
// ABSOLUTE speed"; nothing here ever evaluates, requires, or executes
// anything from the parsed JSON, and the engine that consumes this output
// (dispatchSceneBehaviorEvent, public/app.js) knows only the `when` strings
// it's handed — no event name is ever hardcoded into this module or that
// engine.
//
// v1 is intentionally small: no random ranges, no movement mapping, no glow
// overrides, no delays, no conditions/expressions, no nested logic. A
// malformed rule is simply dropped (never rejects the whole file); a
// malformed FILE (wrong version, missing rules array) returns null so the
// caller can fall back to normal authored Animation behavior — a broken
// Behavior file must never break the Prop.

const BEHAVIOR_SPEED_MIN = 0.1;
const BEHAVIOR_SPEED_MAX = 10;

export function sanitizeAnimationBehavior(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.rules)) return null;
  const rules = raw.rules.map(sanitizeBehaviorRule).filter(Boolean);
  return { version: 1, rules };
}

// A rule's `when` is required (a non-empty string); `play`/`speed` are both
// optional. An out-of-range or non-numeric `speed` is dropped from the rule
// (not clamped to a boundary, which would silently mask an authoring
// mistake as a different value) — the rule itself stays valid for
// play/when, and playback falls back to the authored Animation speed for
// that state. Range is deliberately wider than the F8 slider's 0.5–3.0:
// Behavior is advanced, hand-authored JSON, never snapped to the UI's
// discrete stops.
function sanitizeBehaviorRule(r) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.when !== "string" || !r.when.trim()) return null;
  const out = { when: r.when.trim() };
  if (typeof r.play === "boolean") out.play = r.play;
  if (
    typeof r.speed === "number" &&
    Number.isFinite(r.speed) &&
    r.speed >= BEHAVIOR_SPEED_MIN &&
    r.speed <= BEHAVIOR_SPEED_MAX
  ) {
    out.speed = r.speed;
  }
  return out;
}

// First-match-wins lookup — never merges multiple rules that happen to
// share the same `when` (an authoring mistake), just uses the first.
export function findMatchingBehaviorRule(behavior, eventName) {
  if (!behavior || !Array.isArray(behavior.rules)) return null;
  if (typeof eventName !== "string" || !eventName) return null;
  return behavior.rules.find((r) => r.when === eventName) || null;
}
