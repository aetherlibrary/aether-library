// Pure decoded-GIF playback math for Player Interaction's Animation effect
// — see sanitizeHoverEffect's "animation" branch in sceneConfig.js for the
// schema, and startDecodedGifPlayback()/effectiveFrameDelayMs() in
// public/app.js for the renderer that consumes this exact formula. Kept as
// a tiny standalone module (rather than only living inline in app.js)
// purely so it has a Node-testable home: public/app.js is a plain
// global-scope browser script, not an ES module, so it can't import this
// file — it re-implements the same one-line formula inline, cross-
// referencing this module in a comment. This mirrors the existing
// precedent elsewhere in this codebase of small pieces of logic
// intentionally duplicated between a shared module and the browser runtime
// rather than forcing a build step.
//
// `speed` is always a MULTIPLIER on the GIF's own real per-frame delay
// (decoded once via the browser's ImageDecoder, never hand-authored as a
// frame count/base fps), so a later runtime override (e.g. the book
// flipping faster during active Council processing) can stack on top of
// the author-defined base speed without needing to know what that delay
// was.

// ~50fps ceiling: GIF frame delays below 2/100s are unreliable across
// browsers (the same practical limit EZGIF's own docs cite for GIF
// playback generally) — never let a large speed multiplier collapse a
// frame's delay to an unreliable or zero value.
export const MIN_FRAME_DELAY_MS = 20;

export function effectiveFrameDelayMs(originalDelayMs, speed) {
  const base = typeof originalDelayMs === "number" && Number.isFinite(originalDelayMs) && originalDelayMs > 0 ? originalDelayMs : 100;
  const mult = typeof speed === "number" && Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.max(MIN_FRAME_DELAY_MS, base / mult);
}
