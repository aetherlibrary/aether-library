// Tests for Scene Theme Stage 2 — runtime application, compatibility,
// contrast, and the F8 Theme editor's contracts.
//
// The Scene already stored 17 theme tokens; Stage 2 makes them reach the
// screen. Three claims are worth defending here, and the rest follows:
//
//   1. Nothing but literal hex, in nothing but the approved --ws-* variables,
//      ever reaches the CSSOM — theme data must never be able to act as CSS.
//   2. The user's chosen appearance outranks the Scene's default. A Scene is
//      allowed to suggest dark or light; it is not allowed to overrule the
//      person using the app.
//   3. Every stored token still loads, including the five that have no editor
//      row, so existing snapshots render exactly as before.
//
// public/app.js is a plain script (no imports), so its copies of the token
// map and Classic palette are asserted against the service here — a drift on
// either side fails the suite instead of showing the wrong colors.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as W from "../src/services/worldContent.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const APPROVED_CSS_VARS = [
  "--ws-bg",
  "--ws-panel",
  "--ws-card",
  "--ws-deep",
  "--ws-frame",
  "--ws-border",
  "--ws-border-strong",
  "--ws-text",
  "--ws-muted",
  "--ws-accent",
  "--ws-accent-ink",
  "--ws-accent-soft",
  "--ws-gold",
  "--ws-ok",
  "--ws-warn",
  "--ws-scrollbar",
  "--ws-scrollbar-track",
];

// ------------------------------------------------------------ sanitization

test("only the four supported hex forms survive; every CSS expression is rejected", () => {
  for (const good of ["#fff", "#FFFF", "#221A12", "#c0954c24", "  #ABC  "]) {
    assert.equal(W.sanitizeThemeColor(good), good.trim().toLowerCase(), `${good} must be accepted`);
  }
  // Anything that could be read as CSS is not a color as far as this schema
  // is concerned — that is what keeps authored data out of the CSSOM.
  for (const bad of [
    "red",
    "rebeccapurple",
    "rgb(0,0,0)",
    "rgba(0,0,0,.5)",
    "hsl(30 50% 40%)",
    "var(--ws-bg)",
    "url(evil.png)",
    "calc(1px)",
    "#12345",
    "#GGGGGG",
    "#221a12; background: url(x)",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(W.sanitizeThemeColor(bad), "", `${JSON.stringify(bad)} must not be accepted`);
  }
});

test("a missing or invalid token falls back to Classic for its OWN mode", () => {
  const t = W.sanitizeTheme({ dark: { surface: "url(x)", text: null }, light: { surface: "#010203" } });
  const classic = W.defaultTheme();
  assert.equal(t.dark.surface, classic.dark.surface);
  assert.equal(t.dark.text, classic.dark.text);
  // Dark never borrows light's value, which is the whole point of per-mode
  // fallback: the two palettes are independent documents.
  assert.notEqual(t.dark.surface, t.light.surface);
  assert.equal(t.light.surface, "#010203");
  assert.equal(t.light.text, classic.light.text);
});

test("border alpha survives the round trip", () => {
  const t = W.sanitizeTheme({ dark: { border: "#c4944a38", borderStrong: "#c4944a73" } });
  assert.equal(t.dark.border, "#c4944a38");
  assert.equal(t.dark.borderStrong, "#c4944a73");
  // 4-digit alpha shorthand too.
  assert.equal(W.sanitizeTheme({ dark: { border: "#1234" } }).dark.border, "#1234");
});

test("editing one mode never touches the other", () => {
  const base = W.defaultTheme();
  const edited = W.sanitizeTheme({ ...base, dark: { ...base.dark, surface: "#000000" } });
  assert.equal(edited.dark.surface, "#000000");
  assert.deepEqual(edited.light, base.light);
});

test("an unknown token key cannot reach the CSS application", () => {
  const vars = W.themeCssVariables(
    { dark: { surface: "#111111", evil: "#ff0000", "--ws-bg": "url(x)" } },
    "dark"
  );
  assert.deepEqual(Object.keys(vars).sort(), [...APPROVED_CSS_VARS].sort());
  assert.equal(vars["--ws-bg"], "#111111");
});

// ------------------------------------------------------------ authored set

test("twelve tokens are authored — nine core, three advanced — out of seventeen stored", () => {
  assert.equal(W.CORE_THEME_TOKENS.length, 9);
  assert.equal(W.ADVANCED_THEME_TOKENS.length, 3);
  assert.equal(W.AUTHORED_THEME_TOKENS.length, 12);
  assert.deepEqual(W.CORE_THEME_TOKENS, [
    "surface",
    "surfaceRaised",
    "surfaceCard",
    "text",
    "textMuted",
    "border",
    "accent",
    "accentText",
    "highlight",
  ]);
  assert.deepEqual(W.ADVANCED_THEME_TOKENS, ["surfaceInset", "frame", "borderStrong"]);
  // The five with no editor row are still stored and still applied.
  const unauthored = Object.keys(W.THEME_TOKENS).filter((t) => !W.AUTHORED_THEME_TOKENS.includes(t));
  assert.deepEqual(unauthored.sort(), ["accentSoft", "scrollbar", "scrollbarTrack", "success", "warning"]);
  assert.equal(Object.keys(W.THEME_TOKENS).length, 17);
  assert.deepEqual(W.ALPHA_THEME_TOKENS, ["border", "borderStrong"]);
});

// ---------------------------------------------------------- compatibility

test("an existing 17-token snapshot round-trips intact, with no version bump", () => {
  const authored = {
    defaultMode: "light",
    dark: { ...W.defaultTheme().dark, surface: "#010101" },
    light: { ...W.defaultTheme().light, surface: "#fefefe" },
  };
  const once = W.sanitizeTheme(authored);
  const twice = W.sanitizeTheme(once);
  assert.deepEqual(twice, once, "sanitizing twice must be a no-op");
  assert.equal(once.dark.surface, "#010101");
  assert.equal(once.light.surface, "#fefefe");
  assert.equal(once.defaultMode, "light");
  for (const mode of W.THEME_MODES) {
    assert.deepEqual(Object.keys(once[mode]).sort(), Object.keys(W.THEME_TOKENS).sort());
  }
  // Stage 2 changes no stored shape, so the Scene World schema version and
  // the stored token set are both untouched.
  assert.equal(W.WORLD_CONTENT_VERSION, 1);
});

test("accentSoft: derived when absent, preserved when explicitly different", () => {
  // Classic is exactly the derived value in both modes, which is why it is
  // not worth authoring twice.
  assert.equal(W.deriveAccentSoft("#c0954c"), "#c0954c24");
  assert.equal(W.deriveAccentSoft("#8a5a22"), "#8a5a2224");
  assert.equal(W.deriveAccentSoft("#abc"), "#aabbcc24");
  assert.equal(W.deriveAccentSoft("nope"), "");

  // Absent -> derived from THIS mode's accent, so a re-tinted world gets a
  // matching wash instead of a leftover brass smudge.
  const derived = W.sanitizeTheme({ dark: { accent: "#ff0000" } });
  assert.equal(derived.dark.accentSoft, "#ff000024");

  // Indistinguishable-from-derived counts as derived. Every Scene authored so
  // far stores the Classic wash explicitly, so without this rule re-tinting
  // the accent would leave the old brass hover behind on all of them.
  const classicTheme = W.defaultTheme();
  const retinted = W.sanitizeTheme({ dark: { ...classicTheme.dark, accent: "#4f9dd8" } });
  assert.equal(retinted.dark.accentSoft, "#4f9dd824");

  // Explicitly different -> preserved exactly. Authored data is never
  // silently replaced by a derivation.
  const explicit = W.sanitizeTheme({ dark: { ...W.defaultTheme().dark, accent: "#ff0000", accentSoft: "#00ff0080" } });
  assert.equal(explicit.dark.accentSoft, "#00ff0080");
  assert.equal(W.themeCssVariables(explicit, "dark")["--ws-accent-soft"], "#00ff0080");

  // Classic stays byte-identical.
  const classic = W.sanitizeTheme(W.defaultTheme());
  assert.equal(classic.dark.accentSoft, "#c0954c24");
  assert.equal(classic.light.accentSoft, "#8a5a2224");
});

test("stored scrollbar values are applied as authored — never aliased to another token", () => {
  const t = W.sanitizeTheme({ dark: { scrollbar: "#123456", scrollbarTrack: "#654321" } });
  const vars = W.themeCssVariables(t, "dark");
  assert.equal(vars["--ws-scrollbar"], "#123456");
  assert.equal(vars["--ws-scrollbar-track"], "#654321");
  // Classic values survive untouched, so an existing Scene renders the same.
  const classic = W.themeCssVariables(W.defaultTheme(), "dark");
  assert.equal(classic["--ws-scrollbar"], "#4d3c26");
  assert.equal(classic["--ws-scrollbar-track"], "#1c150e");
});

test("success and warning keep their stored values and are never authored", () => {
  const t = W.sanitizeTheme({ dark: { success: "#00ff00", warning: "#ffff00" } });
  const vars = W.themeCssVariables(t, "dark");
  assert.equal(vars["--ws-ok"], "#00ff00");
  assert.equal(vars["--ws-warn"], "#ffff00");
  assert.ok(!W.AUTHORED_THEME_TOKENS.includes("success"));
  assert.ok(!W.AUTHORED_THEME_TOKENS.includes("warning"));
});

// ---------------------------------------------------------------- runtime

test("themeCssVariables writes only whitelisted variables, always sanitized hex", () => {
  for (const mode of W.THEME_MODES) {
    const vars = W.themeCssVariables({ dark: { surface: "var(--x)" }, light: { text: "url(y)" } }, mode);
    assert.deepEqual(Object.keys(vars).sort(), [...APPROVED_CSS_VARS].sort());
    for (const [name, value] of Object.entries(vars)) {
      assert.match(name, /^--ws-[a-z-]+$/);
      assert.match(value, /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    }
  }
});

test("mode precedence: the user's saved choice outranks the Scene default", () => {
  const theme = { defaultMode: "light" };
  // Explicitly saved -> wins, even against a Scene that prefers otherwise.
  assert.equal(W.resolveThemeMode({ userMode: "dark", userModeIsExplicit: true, theme }), "dark");
  // Never saved -> the Scene seeds the appearance.
  assert.equal(W.resolveThemeMode({ userMode: "dark", userModeIsExplicit: false, theme }), "light");
  // Neither -> dark.
  assert.equal(W.resolveThemeMode({ userMode: "dark", userModeIsExplicit: false, theme: {} }), "dark");
  // An unknown mode from either side falls back safely rather than blanking.
  assert.equal(W.resolveThemeMode({ userMode: "sideways", userModeIsExplicit: true, theme }), "light");
  assert.equal(W.resolveThemeMode({ theme: { defaultMode: "sideways" } }), "dark");
  assert.equal(W.resolveThemeMode(), "dark");
  // An unknown mode passed to the applier resolves to the Scene default
  // instead of throwing or producing an empty palette.
  const vars = W.themeCssVariables({ defaultMode: "light" }, "sideways");
  assert.equal(vars["--ws-bg"], W.defaultTheme().light.surface);
});

test("the server injects the Scene theme at boot and on save — the runtime never reads a preset", async () => {
  const serverJs = await readSource("../src/server.js");
  assert.match(serverJs, /setSceneTheme\(layout\.world\.theme\)/);
  // Boot and the Scene-save route are both covered.
  assert.equal((serverJs.match(/setSceneTheme\(layout\.world\.theme\)/g) || []).length, 2);
  const configJs = await readSource("../src/config.js");
  assert.match(configJs, /export function setSceneTheme/);
  assert.match(configJs, /sceneTheme: runtimeSceneTheme/);
  // publicConfig must report whether the user actually chose an appearance —
  // without it the frontend cannot honour the precedence rule.
  assert.match(configJs, /themeIsUserSet: config\.themeIsUserSet/);
  assert.match(configJs, /config\.themeIsUserSet = SUPPORTED_THEMES\.includes\(rawTheme\)/);
});

test("Product and Content ownership are untouched by the theme path", async () => {
  const productJs = await readSource("../src/services/productConfig.js");
  const contentJs = await readSource("../src/services/sceneContent.js");
  for (const src of [productJs, contentJs]) {
    assert.doesNotMatch(src, /theme/i, "theme must not leak into Product or Content ownership");
  }
});

// ------------------------------------------------------- the shipping client

test("public/app.js mirrors the service's token map and Classic palette exactly", async () => {
  const appJs = await readSource("../public/app.js");

  // Token map: same 17 names, same CSS variables.
  for (const [token, cssVar] of Object.entries(W.THEME_TOKENS)) {
    assert.match(
      appJs,
      new RegExp(`\\b${token}: "${cssVar}"`),
      `app.js is missing the ${token} -> ${cssVar} mapping`
    );
  }
  // Classic palette: every value, both modes.
  const classic = W.defaultTheme();
  for (const mode of W.THEME_MODES) {
    for (const [token, value] of Object.entries(classic[mode])) {
      assert.ok(
        appJs.includes(`${token}: "${value}"`),
        `app.js Classic ${mode}.${token} must be ${value}`
      );
    }
  }
});

test("the client applies the theme through setProperty on a fixed whitelist — never as CSS text", async () => {
  const appJs = await readSource("../public/app.js");
  assert.match(appJs, /function applySceneTheme\(sceneWorldTheme, selectedMode\)/);
  // One write path, and it is the property API.
  assert.match(appJs, /root\.setProperty\(cssVar, values\[token\]\)/);
  // The applier never builds CSS text or markup.
  const applier = appJs.slice(
    appJs.indexOf("function applySceneTheme("),
    appJs.indexOf("// ----------------------------------------------------------- contrast (F8)")
  );
  for (const forbidden of [/innerHTML/, /createElement\("style"\)/, /insertRule/, /cssText/, /adoptedStyleSheets/]) {
    assert.doesNotMatch(applier, forbidden, "the theme applier must never inject CSS text");
  }
  // Bootstrap applies the Scene theme, honouring the precedence rule.
  assert.match(appJs, /applySceneTheme\(cfg\.sceneTheme, resolveSceneThemeMode\(cfg\)\)/);
  assert.match(appJs, /if \(cfg\?\.themeIsUserSet && WS_THEME_MODES\.includes\(cfg\.theme\)\) return cfg\.theme;/);
  // A Scene refresh goes through the same config path, so it re-applies.
  assert.match(appJs, /window\.__refreshWorld = \(\) => loadStatus\(\)/);
  // data-theme keeps its existing meaning.
  assert.match(appJs, /applyTheme\(mode\);/);
});

// --------------------------------------------------------------- contrast

test("contrast: deterministic WCAG ratios, with alpha composited over the real backdrop", () => {
  assert.equal(Math.round(W.contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(Math.round(W.contrastRatio("#ffffff", "#ffffff") * 100) / 100, 1);
  // Order does not matter.
  assert.equal(W.contrastRatio("#000", "#fff"), W.contrastRatio("#fff", "#000"));
  // A malformed color scores 0 rather than throwing.
  assert.equal(W.contrastRatio("nope", "#fff"), 0);

  // Alpha is judged against what is actually behind it: 50% black over white
  // composites to mid-grey, which is nowhere near black-on-white's 21.
  const half = W.contrastRatio("#00000080", "#ffffff");
  assert.ok(half > 1 && half < 21, `expected a composited ratio, got ${half}`);
  assert.equal(Math.round(half * 100) / 100, Math.round(W.contrastRatio("#7f7f7f", "#ffffff") * 100) / 100);
  // The SAME translucent color over a different backdrop must score
  // differently — proof the backdrop is really used.
  assert.notEqual(
    Math.round(W.contrastRatio("#00000080", "#ffffff") * 100) / 100,
    Math.round(W.contrastRatio("#00000080", "#808080") * 100) / 100
  );
});

test("contrast: Classic dark passes; Classic light's known failures are detected", () => {
  const classic = W.defaultTheme();

  const dark = W.contrastReport(classic, "dark");
  assert.equal(dark.failing, 0, "Classic dark must pass every checked pair");
  assert.equal(dark.failingTokens.size, 0);
  const ratio = (report, fg, bg) => report.pairs.find((p) => p.fg === fg && p.bg === bg).ratio;
  // Audit figures, to two decimals.
  assert.equal(ratio(dark, "text", "surface"), 14.08);
  assert.equal(ratio(dark, "textMuted", "surface"), 5.88);
  assert.equal(ratio(dark, "accentText", "accent"), 6.31);
  assert.equal(ratio(dark, "highlight", "surfaceCard"), 7.83);

  const light = W.contrastReport(classic, "light");
  assert.equal(light.failing, 4, "the shipped light palette has four known failures");
  assert.equal(ratio(light, "textMuted", "surface"), 4.16);
  assert.equal(ratio(light, "textMuted", "surfaceCard"), 3.01);
  assert.equal(ratio(light, "accentText", "highlight"), 3.73);
  assert.equal(ratio(light, "highlight", "surfaceCard"), 2.37);
  // Markers map to the tokens actually involved in a failing pair.
  assert.deepEqual(
    [...light.failingTokens].sort(),
    ["accentText", "highlight", "surface", "surfaceCard", "textMuted"]
  );
  // ...and not to tokens that only appear in passing pairs.
  assert.ok(!light.failingTokens.has("frame"));
  assert.ok(!light.failingTokens.has("border"));

  // Large-text pairs use 3:1, body pairs 4.5:1.
  for (const pair of light.pairs) assert.equal(pair.threshold, pair.large ? 3 : 4.5);
  // Every required pair from the audit is actually checked.
  const checked = new Set(W.CONTRAST_PAIRS.map((p) => `${p.fg}|${p.bg}`));
  for (const required of [
    "text|surface",
    "text|surfaceRaised",
    "text|surfaceCard",
    "text|surfaceInset",
    "textMuted|surface",
    "textMuted|surfaceCard",
    "accentText|accent",
    "accentText|highlight",
    "highlight|surface",
    "highlight|surfaceCard",
    "accent|surface",
    "success|surface",
    "warning|surface",
  ]) {
    assert.ok(checked.has(required), `${required} must be checked`);
  }
});

test("contrast is advisory: a failing theme still sanitizes, applies and saves", () => {
  // Grey on grey — every pair fails.
  const awful = { dark: Object.fromEntries(Object.keys(W.THEME_TOKENS).map((t) => [t, "#808080"])) };
  const report = W.contrastReport(awful, "dark");
  assert.ok(report.failing > 0);
  // Nothing throws, nothing is rejected, and the values still apply.
  const vars = W.themeCssVariables(awful, "dark");
  assert.equal(vars["--ws-bg"], "#808080");
  // And the Scene it belongs to still round-trips.
  const scene = W.sanitizeSceneWorld({ theme: awful });
  assert.equal(scene.theme.dark.surface, "#808080");
});

// -------------------------------------------------------------- F8 editor

// ------------------------------------------------------------------ scope

test("the audio schema is untouched and still refuses paths", () => {
  assert.deepEqual(W.AUDIO_EXTENSIONS, [".mp3", ".ogg", ".wav"]);
  assert.deepEqual(W.sanitizeAudio(null), { musicTrack: "", volume: 0.35, loop: true, autoplay: false });
  assert.equal(W.sanitizeAudioTrack("../../etc/passwd"), "");
  assert.equal(W.sanitizeAudioTrack("library_ambient"), "library_ambient");
  // Autoplay can only ever be opted INTO explicitly.
  assert.equal(W.sanitizeAudio({ autoplay: "yes" }).autoplay, false);
});
