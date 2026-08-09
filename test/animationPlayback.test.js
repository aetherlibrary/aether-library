// Pure decoded-GIF playback math (src/services/animationPlayback.js) — the
// formula Player Interaction's Animation effect uses to turn a GIF's real,
// browser-decoded per-frame delay into an actually-sped-up-or-slowed-down
// playback delay (see startDecodedGifPlayback in public/app.js, which
// re-implements this exact one-line formula inline since it's a plain
// global-scope browser script and can't import an ES module — this file is
// the formula's Node-testable home).

import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveFrameDelayMs, MIN_FRAME_DELAY_MS } from "../src/services/animationPlayback.js";

test("effectiveFrameDelayMs: 1.0x speed preserves the GIF's own original frame delay exactly", () => {
  assert.equal(effectiveFrameDelayMs(100, 1), 100);
  assert.equal(effectiveFrameDelayMs(83, 1), 83);
});

test("effectiveFrameDelayMs: 0.5x speed produces approximately double the frame delay (slower)", () => {
  assert.equal(effectiveFrameDelayMs(100, 0.5), 200);
});

test("effectiveFrameDelayMs: 2.0x speed produces approximately half the frame delay (faster)", () => {
  assert.equal(effectiveFrameDelayMs(100, 2), 50);
});

test("effectiveFrameDelayMs: 1.5x, 2.5x, 3.0x all scale the original delay as a pure multiplier", () => {
  assert.equal(effectiveFrameDelayMs(120, 1.5), 80);
  assert.equal(effectiveFrameDelayMs(100, 2.5), 40);
  assert.equal(effectiveFrameDelayMs(90, 3), 30);
});

test("effectiveFrameDelayMs: never drops below the ~50fps reliability floor, however high the multiplier", () => {
  assert.equal(effectiveFrameDelayMs(20, 3), MIN_FRAME_DELAY_MS, "20/3 ≈ 6.7ms would be unreliable — floored to 20ms");
  assert.equal(effectiveFrameDelayMs(10, 1), MIN_FRAME_DELAY_MS, "even at 1.0x, an unusually tiny authored delay is floored");
});

test("effectiveFrameDelayMs: invalid/missing inputs fall back to safe defaults rather than NaN/Infinity/zero", () => {
  assert.equal(effectiveFrameDelayMs(undefined, undefined), 100, "no delay -> a safe 100ms default, speed defaults to 1x");
  assert.equal(effectiveFrameDelayMs(0, 2), 50, "a non-positive original delay falls back to 100ms before dividing");
  assert.equal(effectiveFrameDelayMs(-5, 2), 50);
  assert.equal(effectiveFrameDelayMs(100, 0), 100, "a non-positive speed falls back to 1x, never divides by zero");
  assert.equal(effectiveFrameDelayMs(100, -1), 100);
  assert.equal(effectiveFrameDelayMs(100, "fast"), 100, "a non-numeric speed falls back to 1x");
  assert.equal(effectiveFrameDelayMs(NaN, NaN), 100);
  assert.ok(Number.isFinite(effectiveFrameDelayMs(undefined, undefined)));
});
