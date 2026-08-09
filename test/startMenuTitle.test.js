// Start Menu authoring: the untinted background, the yellow-flash fix, and the
// title image that replaced the built-in branding text.
//
// THE RULE THAT DRIVES ALL OF IT: the Start Menu shows what the author put in
// the file. No wash, no tint, no filter — and no hardcoded "Aether Library"
// text to fall back to once branding is authorable.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

// These rules are DESCRIBED in the comments above them ("the parchment wash
// (linear-gradient over rgba(214,178,116,.45)) has been removed"), so a naive
// grep for the removed thing matches the explanation of its removal. Assertions
// about what the code DOES must read code, not prose.
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripHtmlComments = (h) => h.replace(/<!--[\s\S]*?-->/g, "");

const appCss = () => readSource("../public/style.css");
const appJs = () => readSource("../public/app.js");
const html = () => readSource("../public/index.html");

const appShell = await import("../src/services/appShell.js");
const { sanitizeAppShell, defaultAppShell, runtimeAppShell, DEFAULT_TITLE_POSITION, START_MENU_CANVAS } = appShell;

// ================================================ 1: nothing tints the art

test("the backdrop paints the image and nothing else", async () => {
  const css = stripCssComments(await appCss());
  const rule = css.slice(css.indexOf(".start-backdrop {"), css.indexOf(".start-content"));
  // Exactly one background layer: the authored image over a flat base.
  assert.match(rule, /background: var\(--start-bg-base\) var\(--start-bg-url, none\) center \/ cover no-repeat;/);
  // The 45% parchment wash is gone, and no equivalent may return.
  assert.doesNotMatch(rule, /linear-gradient|radial-gradient|rgba\(214, 178, 116/);
  for (const forbidden of [/[^-]filter:/, /opacity:/, /mix-blend-mode:/, /backdrop-filter:/]) {
    assert.doesNotMatch(rule, forbidden, `the backdrop must not declare ${forbidden}`);
  }
});

test("no pseudo-element overlay is layered on the start menu", async () => {
  const css = await appCss();
  // ::before/::after on the menu or its backdrop would be an invisible tint.
  assert.doesNotMatch(css, /\.start-backdrop::(before|after)/);
  assert.doesNotMatch(css, /#start-menu::(before|after)/);
});

test("the title image is never tinted either", async () => {
  const css = await appCss();
  const rule = stripCssComments(css).slice(stripCssComments(css).indexOf("#start-title-image {"), stripCssComments(css).indexOf("#start-title-image[hidden]"));
  for (const forbidden of [/[^-]filter:/, /opacity:/, /mix-blend-mode:/, /background:/]) {
    assert.doesNotMatch(rule, forbidden);
  }
  // Source aspect ratio, always.
  assert.match(rule, /width: auto;/);
  assert.match(rule, /height: auto;/);
});

// ============================================ 2: no yellow flash on refresh

test("the pre-load surface is neutral, not the old warm theme colour", async () => {
  const css = await appCss();
  assert.match(css, /--start-bg-base: #0e0d0c;/);
  // --wood-dark still exists for the app frame, but the start menu no longer
  // uses it — that pairing under the removed wash is what read as yellow.
  assert.match(css, /--wood-dark: #4a3218;/);
  const rule = stripCssComments(css).slice(stripCssComments(css).indexOf(".start-backdrop {"), stripCssComments(css).indexOf(".start-content"));
  assert.doesNotMatch(rule, /--wood-dark/);
});

test("the background is applied without waiting on a second round trip", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function applyStartMenuBackground(ref)"), src.indexOf("function applyStartMenuTitle(shell)"));
  // The variable is set immediately; the Image() probe only reports failure.
  const setAt = fn.indexOf('root.setProperty("--start-bg-url", `url("${url}")`);');
  const probeAt = fn.indexOf("const probe = new Image();");
  assert.ok(setAt > 0 && probeAt > setAt, "the URL is applied BEFORE the probe is created");
  // The old shape — applying only inside probe.onload — must not come back.
  assert.doesNotMatch(fn, /probe\.onload = \(\) => root\.setProperty/);
  assert.match(fn, /probe\.onerror/);
});

test("no arbitrary timeout was used to paper over the sequence", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function applyStartMenuBackground(ref)"), src.indexOf("async function loadCharacterRuntimeData"));
  assert.doesNotMatch(fn, /setTimeout|requestAnimationFrame/);
});

// ==================================== 4: built-in branding text is gone

test("the wordmark is TEXT again, not a rasterized image", async () => {
  const markup = stripHtmlComments(await html());
  // A bitmap wordmark goes soft as soon as it is scaled, and this one scales
  // with the viewport — so the title is live HTML text.
  const menu = markup.slice(markup.indexOf('<div id="start-menu">'), markup.indexOf('<div class="start-version">'));
  assert.match(menu, /<h1 class="start-title" id="start-title">Aether Library<\/h1>/);
  assert.match(menu, /<p class="start-subtitle" id="start-subtitle">A Nexus for Explorers<\/p>/);
  // The logo element and its whole pipeline stay for the future replacement.
  assert.match(menu, /<img id="start-title-image" alt="" draggable="false" hidden \/>/);
});

test("the title is Georgia; the subtitle is a humanist sans, not a code face", async () => {
  const css = stripCssComments(await appCss());
  const title = css.slice(css.indexOf(".start-title {"), css.indexOf(".start-subtitle {"));
  assert.match(title, /font-family: Georgia, "Times New Roman", "Songti SC", serif;/);
  const sub = css.slice(css.indexOf(".start-subtitle {"), css.indexOf("#start-title-image {"));
  assert.match(sub, /font-family: "Inter", "Source Sans 3", "Noto Sans", "Segoe UI", system-ui, sans-serif;/);
  // var(--font-pixel) is Consolas — a monospace code face under a serif
  // wordmark, which is what this replaces.
  assert.doesNotMatch(sub, /--font-pixel/);
  assert.doesNotMatch(title, /--font-pixel/);
});

test("the title is set at title-screen scale, sized from the previous artwork", async () => {
  const css = stripCssComments(await appCss());
  const title = css.slice(css.indexOf(".start-title {"), css.indexOf(".start-subtitle {"));
  assert.match(title, /margin: 0;/);
  // NOT a guess: Start_logo.png's title band is 128px of cap-height in a
  // 1920x588 canvas, displayed at 0.5333 under max-width:80vw — 68.3px tall on
  // a 1280x800 viewport. Georgia's cap-height is ~0.692em, so ~97px of
  // font-size reproduces it (measured: 69px). The old 4rem cap gave 44px.
  assert.match(title, /font-size: clamp\(3\.4rem, 7\.6vw, 6\.5rem\);/);
  assert.match(title, /text-transform: uppercase;/);
  assert.match(title, /line-height: 1;/);
  // Georgia has only Regular and Bold, so 900 renders identically to 700 —
  // the extra weight is optical, from a hairline stroke in the same colour.
  assert.match(title, /font-weight: 900;/);
  assert.match(title, /-webkit-text-stroke: 1\.5px currentColor;/);
  assert.match(title, /paint-order: stroke fill;/);
  assert.match(title, /letter-spacing: 4px;/);
  // The subtitle keeps its face, size and case. Its top margin and tracking
  // were adjusted deliberately in the polish pass — see the spacing test.
  const sub = css.slice(css.indexOf(".start-subtitle {"), css.indexOf("#start-title-image {"));
  assert.match(sub, /font-size: clamp\(0\.8rem, 1\.6vw, 1rem\);/);
  assert.match(sub, /text-transform: uppercase;/);
  assert.match(sub, /color: rgba\(228, 208, 168, 0\.82\);/);
  // Still laid out in the centred start-content column, above the buttons.
  const markup = stripHtmlComments(await html());
  const content = markup.slice(markup.indexOf('<div class="start-content">'), markup.indexOf('<div class="start-version">'));
  assert.ok(content.indexOf("start-title") < content.indexOf("start-subtitle"));
  assert.ok(content.indexOf("start-subtitle") < content.indexOf("start-buttons"));
});

test("the dark outline sits BEHIND the bevel, and is not a text-stroke", async () => {
  const css = stripCssComments(await appCss());
  const title = css.slice(css.indexOf(".start-title {"), css.indexOf(".start-subtitle {"));
  // CSS paints every text-shadow beneath the glyph — stroke included — so a
  // 2-3px dark -webkit-text-stroke would have covered the 1px bevel highlight
  // and flattened it. The ring is built from shadow layers instead.
  assert.doesNotMatch(title, /-webkit-text-stroke: [23](\.\d+)?px rgba?\(/);
  assert.match(title, /-webkit-text-stroke: 1\.5px currentColor;/, "the gold weight stroke survives");

  const shadow = title.slice(title.indexOf("text-shadow:"));
  const bevelAt = shadow.indexOf("rgba(255, 246, 219, 0.5)");
  const ringAt = shadow.indexOf("rgba(18, 11, 4, 0.95)");
  const bloomAt = shadow.indexOf("rgba(232, 196, 106, 0.28)");
  // First listed paints on top, so this order IS the requirement.
  assert.ok(bevelAt > 0 && ringAt > bevelAt, "the ring must sit below the bevel highlight");
  assert.ok(bloomAt > ringAt, "the bloom stays bottom-most");
  // Eight directions: cardinals at 2px, diagonals at 1.5px so corners do not bulge.
  assert.equal([...shadow.matchAll(/rgba\(18, 11, 4, 0\.95\)/g)].length, 8);
  // Four cardinals at 2px and four diagonals at 1.5px.
  assert.equal([...shadow.matchAll(/(^|\s)-?2px /gm)].length >= 4, true);
  assert.equal([...shadow.matchAll(/-?1\.5px -?1\.5px 0 rgba\(18, 11, 4, 0\.95\)/g)].length, 4);
});

test("spacing moved, but nothing about the buttons themselves did", async () => {
  const css = stripCssComments(await appCss());
  // Title -> subtitle: was -0.4rem (9.6px of clear space), now +0.35rem (21.6px).
  const sub = css.slice(css.indexOf(".start-subtitle {"), css.indexOf("#start-title-image {"));
  assert.match(sub, /margin: 0\.35rem 0 1\.4rem;/);
  assert.doesNotMatch(sub, /margin: -0\.4rem/);
  // Horizontal margins stay 0 — centring is the flex column's job.
  assert.match(sub, /margin: 0\.35rem 0 1\.4rem;/);

  const group = css.slice(css.indexOf(".start-buttons {"), css.indexOf(".start-btn"));
  assert.match(group, /gap: 1\.3rem;/, "8px more between buttons");
  assert.match(group, /margin-top: 0\.875rem;/, "group sits 14px lower");
  // Container-only: nothing here touches the buttons' own appearance.
  for (const forbidden of [/background/, /border/, /color/, /padding/, /font-size/, /:hover/]) {
    assert.doesNotMatch(group, forbidden, `.start-buttons must not restyle the buttons (${forbidden})`);
  }
});

test("gold with the previous bevel offset — the old brown is unreadable now", async () => {
  const css = stripCssComments(await appCss());
  const title = css.slice(css.indexOf(".start-title {"), css.indexOf(".start-subtitle {"));
  assert.match(title, /color: #e8c46a;/);
  // The 2px 2px bevel offset is carried over from the previous version; only
  // its role inverts (depth under a light letter, not a highlight under a dark
  // one). Measured against the real start-menu art: gold 7.71:1, the old
  // #3a2712 1.10:1 — that brown only worked under the removed parchment wash.
  assert.match(title, /2px 2px 0 rgba\(24, 14, 5, 0\.8\)/);
  assert.doesNotMatch(title, /#3a2712/);
});

test("the subtitle is localized again", async () => {
  const src = await appJs();
  assert.match(src, /setText\("start-subtitle", "startSubtitle"\)/);
  // And the locale packs still carry the string.
  const en = await readSource("../src/locales/en.js");
  assert.match(en, /startSubtitle: "A Nexus for Explorers"/);
});

test("a configured logo replaces the wordmark, and clearing brings it back", async () => {
  const src = await appJs();
  const fn = src.slice(src.indexOf("function applyStartMenuTitle(shell)"), src.indexOf("async function loadStartMenuBackground()"));
  // The logo is the future replacement for the text, so the two never stack.
  assert.match(fn, /const wordmark = document\.getElementById\("start-title"\);/);
  assert.match(fn, /if \(wordmark\) wordmark\.hidden = Boolean\(path\);/);
  // Only the <h1>: the subtitle is a separate brand statement and stays.
  assert.doesNotMatch(fn, /start-subtitle/);
  assert.match(fn, /if \(!path\) \{\s*el\.hidden = true;\s*el\.removeAttribute\("src"\);/);
});

// ======================================== 5: position is app-shell config

test("the title image and its position live in App Shell", async () => {
  const d = defaultAppShell();
  assert.deepEqual(Object.keys(d).sort(), [
    // The startMenuIcon* group is the separate decorative layer — see
    // test/startMenuIcon.test.js. Listed here only so this key-set stays exact.
    "startMenuBackground", "startMenuIcon", "startMenuIconScale", "startMenuIconX", "startMenuIconY",
    "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY", "version",
  ]);
  assert.equal(d.startMenuTitleImage, "", "no branding ships by default");
  assert.deepEqual(DEFAULT_TITLE_POSITION, { x: 960, y: 300 });
  assert.deepEqual(START_MENU_CANVAS, { width: 1920, height: 1080 });
  // The runtime projection carries all four.
  assert.deepEqual(Object.keys(runtimeAppShell(d)).sort(), [
    "startMenuBackground", "startMenuIcon", "startMenuIconScale", "startMenuIconX", "startMenuIconY",
    "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY",
  ]);
});

test("an older config with only a background still works", async () => {
  const legacy = sanitizeAppShell({ version: 1, startMenuBackground: "assets/background/start-menu/start_menu.png" });
  assert.equal(legacy.startMenuBackground, "assets/background/start-menu/start_menu.png");
  assert.equal(legacy.startMenuTitleImage, "", "absent = no branding, not an error");
  assert.equal(legacy.startMenuTitleX, 960);
  assert.equal(legacy.startMenuTitleY, 300);
});

test("coordinates reject junk without collapsing to zero", () => {
  // null/undefined/"" are ABSENT, not 0 — Number(null) is 0 and finite, which
  // would silently pin an unset coordinate to the canvas edge.
  for (const absent of [null, undefined, ""]) {
    const s = sanitizeAppShell({ startMenuTitleX: absent, startMenuTitleY: absent });
    assert.equal(s.startMenuTitleX, 960, String(absent));
    assert.equal(s.startMenuTitleY, 300, String(absent));
  }
  for (const junk of ["abc", NaN, {}, []]) {
    const s = sanitizeAppShell({ startMenuTitleX: junk });
    assert.equal(s.startMenuTitleX, 960, String(junk));
  }
  // Real values survive, including a deliberate off-canvas placement.
  assert.equal(sanitizeAppShell({ startMenuTitleX: "820" }).startMenuTitleX, 820);
  assert.equal(sanitizeAppShell({ startMenuTitleX: -200 }).startMenuTitleX, -200);
  assert.equal(sanitizeAppShell({ startMenuTitleY: 640.6 }).startMenuTitleY, 641);
});

test("the title image is restricted to the start-menu asset root", () => {
  for (const bad of [
    "../../etc/passwd", "/abs/x.png", "C:\\x.png", "assets/background/other.png",
    "assets/background/start-menu/../../secret.png", "assets/background/start-menu/x.exe",
  ]) {
    assert.equal(sanitizeAppShell({ startMenuTitleImage: bad }).startMenuTitleImage, "", bad);
  }
  assert.equal(
    sanitizeAppShell({ startMenuTitleImage: "assets/background/start-menu/logo.png" }).startMenuTitleImage,
    "assets/background/start-menu/logo.png"
  );
});

// ============================================= 3: the button model

// ============================================ 13: never Scene data

test("no Start Menu configuration can enter an .als", async () => {
  const { sanitizeSceneDocument } = await import("../src/services/sceneFile.js");
  const doc = sanitizeSceneDocument({
    scene: {
      startMenuBackground: "assets/background/start-menu/x.png",
      startMenuTitleImage: "assets/background/start-menu/logo.png",
      startMenuTitleX: 100,
      startMenuTitleY: 200,
      meta: { startMenuTitleImage: "assets/background/start-menu/logo.png" },
    },
  });
  for (const k of ["startMenuBackground", "startMenuTitleImage", "startMenuTitleX", "startMenuTitleY"]) {
    assert.equal(doc.scene[k], undefined, k);
    assert.equal(doc.scene.meta[k], undefined, `meta.${k}`);
  }
  // Nor the Scene Layout / Save Layout payload.
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const layout = sanitizeLayout({ startMenuTitleImage: "x", startMenuTitleX: 1 });
  assert.equal(layout.startMenuTitleImage, undefined);
  assert.equal(layout.startMenuTitleX, undefined);
});

// ============================================ production boundary

test("production renders the title but exposes no authoring for it", async () => {
  const src = await appJs();
  assert.match(src, /function applyStartMenuTitle\(shell\)/, "production renders it");
  for (const forbidden of [/renderStartMenuImageField/, /setAppShellField/, /import-image/, /image-dialog/]) {
    assert.doesNotMatch(src, forbidden, `production must not contain ${forbidden}`);
  }
});
