// World Content — the world's DISPLAY identity.
//
// The engine's identity never changes. A Scholar is `alpha` forever; the
// Grand Sage is `grand_sage` forever. Those ids are what the runtime,
// scene-layout, speech roles, prompts and archives key on. World Content owns
// only what those characters are CALLED:
//
//   alpha -> "Architect" / "謀者" / "天樞" / "Merlin"
//
// Nothing downstream may branch on a display name, which is what makes a
// future Avalon / Immortal / Cyber / Christmas world an authoring change
// rather than a code change.
//
// Deliberately a separate service and file from Scene UI Content: that owns
// About/links/tutorial (presentational chrome), this owns who the characters
// ARE to the reader. They version and preset independently.
//
// Phase 1 scope: identity display names, library naming, and copy-based World
// Presets. Deliberately NOT here: World switching, Scene Save As, character
// asset replacement, and the player-profile runtime.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests, exactly like SCENE_UI_PATH / SCENE_CONFIG_PATH.
const WORLD_CONTENT_PATH = process.env.WORLD_CONTENT_PATH
  ? path.resolve(process.env.WORLD_CONTENT_PATH)
  : path.join(projectRoot, "assets", "worlds", "classic.world.json");

const WORLD_PRESET_DIR = process.env.WORLD_PRESET_DIR
  ? path.resolve(process.env.WORLD_PRESET_DIR)
  : path.join(projectRoot, "assets", "world-presets");

export const WORLD_CONTENT_VERSION = 1;
export const DEFAULT_WORLD_ID = "classic";

// THE engine identity ids. Permanent, never localized, never authored.
// `alpha`/`beta`/`gamma` are the same ids the scene's speech roles already
// use (SPEECH_SCHOLAR_ROLE_BY_SLOT in public/app.js), so this introduces no
// second namespace.
export const ENGINE_PERSONA_IDS = ["grand_sage", "alpha", "beta", "gamma"];

// Fixed Scholar slot -> engine id. The slot number is a CONFIGURATION concept
// (which provider answers as which character); the engine id is the identity.
export const ENGINE_ID_BY_SLOT = { 1: "alpha", 2: "beta", 3: "gamma" };

// The locales a NEW world file is seeded with. NOT a fixed set: whatever
// locales an existing file declares are preserved and enumerated (see
// worldLocales), so adding a language is a data change and the editor picks
// it up with no UI rewrite.
export const WORLD_SEED_LOCALES = ["en", "zh-TW"];
export const FALLBACK_LOCALE = "en";

// Every locale actually present in this world's identity/displayName. Sorted
// with the fallback first so the editor lists them predictably.
export function worldLocales(content) {
  const found = new Set();
  for (const map of [content?.displayName, ...Object.values(content?.identity || {})]) {
    if (map && typeof map === "object") {
      for (const locale of Object.keys(map)) if (typeof map[locale] === "string") found.add(locale);
    }
  }
  if (found.size === 0) for (const l of WORLD_SEED_LOCALES) found.add(l);
  return [...found].sort((a, b) => (a === FALLBACK_LOCALE ? -1 : b === FALLBACK_LOCALE ? 1 : a.localeCompare(b)));
}

// ================================================ Scene-owned World snapshot
// THE architectural correction: a World Preset is a reusable TEMPLATE, and
// the Scene is the largest authored/runtime unit. Loading a preset deep-COPIES
// it into the Scene's own world snapshot; from that moment the Scene is
// self-contained and the runtime never reads the preset file again. Editing
// the Scene cannot mutate the preset, and editing the preset cannot alter an
// already-authored Scene. `presetSource` is provenance only.
//
// The snapshot lives inside the Scene layout payload (services/sceneLayout.js),
// which is already the one in-memory Scene bundle driving dirty state,
// undo/redo and Discard Changes — so World edits join that lifecycle without a
// separate save path or a new persistence silo.

// The SEVEN permanent Scene-World character ids. Display names are authored;
// these are not.
export const SCENE_WORLD_PERSONA_IDS = [
  "grand_sage",
  "alpha",
  "beta",
  "gamma",
  "traveler1",
  "traveler2",
  "pet",
];

// ADAPTER — the Character Role Roster (sceneLayout.DEFAULT_CHARACTER_ROLES)
// predates this registry and spells two of the seven differently. This is the
// ONE place the two vocabularies meet; nothing else may translate between
// them, and neither set is renamed by this task.
//
//   scene-world id  ->  character role id
//   grand_sage          sage
//   traveler1           traveler
//   traveler2           (no role yet — world naming only)
export const CHARACTER_ROLE_BY_SCENE_WORLD_ID = {
  grand_sage: "sage",
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  traveler1: "traveler",
  traveler2: null,
  pet: "pet",
};

export function characterRoleForSceneWorldId(id) {
  return CHARACTER_ROLE_BY_SCENE_WORLD_ID[id] ?? null;
}

// ----------------------------------------------------------- custom names
// Runtime display OVERRIDES — the final display name when set. They never
// replace an engine id, and there are exactly seven of them.
export const CUSTOM_NAME_KEYS = ["grand_sage", "alpha", "beta", "gamma", "traveler1", "traveler2", "pet"];

const CUSTOM_NAME_MAX = 40;
// At least one Unicode LETTER from any script. This is what rejects pure
// numbers, symbol-only strings and punctuation runs while accepting
// "Professor", "老師", "山田先生", "オラクル", "Merlin", "Agent 47", "R2-D2".
const HAS_LETTER_RE = /\p{L}/u;
// Deliberately conservative: anything that reads as a URL or an email address
// is a link, not a name, and must never end up rendered as a character name.
// A URL is rejected only when it actually declares itself as one: a scheme
// ("http://", "https://", any "x://") or a leading "www.". Broad
// domain-shape inference was tried and produced false positives on ordinary
// names — "St.Louis", "A.I. Sage" — so it is deliberately NOT attempted.
// A bare "evil.test" typed as a display name is not a link: it is not
// clickable anywhere, and rejecting it costs real names.
const URL_LIKE_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const WWW_PREFIX_RE = /(^|\s)www\./i;
// A real address shape: local@domain.tld with no spaces.
const EMAIL_RE = /(^|\s)[^\s@]+@[^\s@]+\.[a-z]{2,}(\s|$)/i;

// Returns the cleaned name, or "" when the value is not a usable display
// name. One rule, used by both the sanitizer and the editor's feedback.
export function sanitizeCustomName(value) {
  if (typeof value !== "string") return "";
  // Control characters and line breaks are rejected outright rather than
  // stripped: a name containing them is authored wrong, not merely untidy.
  if (/[\x00-\x1f\x7f]/.test(value)) return "";
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  // Unicode code points, not UTF-16 units, so CJK and emoji count correctly.
  if ([...collapsed].length > CUSTOM_NAME_MAX) return "";
  if (!HAS_LETTER_RE.test(collapsed)) return "";
  if (URL_LIKE_RE.test(collapsed) || WWW_PREFIX_RE.test(collapsed) || EMAIL_RE.test(collapsed)) return "";
  return collapsed;
}

function sanitizeCustomNames(raw) {
  const out = {};
  for (const key of CUSTOM_NAME_KEYS) out[key] = sanitizeCustomName(raw?.[key]);
  return out;
}

const MAX_NAME = 80;
const MAX_TEXT = 200;

// Preset ids build a filename, so the same conservative rule Scene UI presets
// use: traversal and separators are rejected by construction.
const PRESET_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidWorldPresetId(id) {
  return typeof id === "string" && PRESET_ID_RE.test(id);
}

function worldError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function presetPath(id) {
  if (!isValidWorldPresetId(id)) throw worldError(400, `Invalid world preset id: ${String(id).slice(0, 40)}`);
  const full = path.join(WORLD_PRESET_DIR, `${id}.json`);
  if (path.dirname(full) !== WORLD_PRESET_DIR) throw worldError(400, "Invalid world preset id.");
  return full;
}

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

// Preserves EVERY locale the value declares — the seed locales are only
// guaranteed to exist, never a whitelist. This is what makes adding a
// language a data change: a world file that gains "ja" carries it through
// the sanitizer, the runtime and the editor with no code edit.
function cleanLocalized(value, max = MAX_NAME) {
  const out = {};
  for (const locale of WORLD_SEED_LOCALES) out[locale] = cleanText(value?.[locale], max);
  if (value && typeof value === "object") {
    for (const [locale, text] of Object.entries(value)) {
      const key = cleanText(locale, 32);
      if (!key || key in out) continue;
      const cleaned = cleanText(text, max);
      if (cleaned) out[key] = cleaned;
    }
  }
  return out;
}

// ------------------------------------------------------------------ schema

// The Classic world — the product's current names, so a fresh install is
// byte-for-byte the behaviour it had before World Content existed.
export function defaultWorldContent() {
  return {
    version: WORLD_CONTENT_VERSION,
    id: DEFAULT_WORLD_ID,
    displayName: { en: "Classic", "zh-TW": "經典圖書館" },
    identity: {
      grand_sage: { en: "Grand Sage", "zh-TW": "大智者" },
      alpha: { en: "Architect", "zh-TW": "謀者" },
      beta: { en: "Oracle", "zh-TW": "墨者" },
      gamma: { en: "Analyst", "zh-TW": "理者" },
    },
    library: {
      // World terminology today, authored tomorrow. Empty traveler names mean
      // "use the product default", exactly like empty About copy does.
      libraryName: "Aether Library",
      travelerName: "",
      traveler2Name: "",
    },
    // Runtime display overrides — empty by default, so a fresh world behaves
    // exactly as the localized names alone did.
    customNames: Object.fromEntries(CUSTOM_NAME_KEYS.map((k) => [k, ""])),
  };
}

// Normalizes ANY input into the exact schema. Driven by ENGINE_PERSONA_IDS
// rather than by the input, so an unknown identity key can never introduce a
// character and a missing one always falls back to the default world.
export function sanitizeWorldContent(raw) {
  const base = defaultWorldContent();
  const input = raw && typeof raw === "object" ? raw : {};

  const identity = {};
  for (const engineId of ENGINE_PERSONA_IDS) {
    const authored = cleanLocalized(input.identity?.[engineId]);
    const fallback = base.identity[engineId];
    // Per-locale fallback: a world that renames only the English name keeps
    // the Classic Chinese one rather than blanking it. Driven by the union of
    // the authored locales and the seed set, so a language the file
    // introduces (e.g. "ja") survives — §5, no code change per locale.
    const locales = new Set([...WORLD_SEED_LOCALES, ...Object.keys(authored)]);
    identity[engineId] = Object.fromEntries(
      [...locales].map((locale) => [locale, authored[locale] || fallback[locale] || ""])
    );
  }

  const id = cleanText(input.id, 64).toLowerCase().replace(/[^a-z0-9_-]/g, "");

  return {
    version: WORLD_CONTENT_VERSION,
    id: id || base.id,
    displayName: Object.fromEntries(
      WORLD_SEED_LOCALES.map((locale) => [locale, cleanLocalized(input.displayName)[locale] || base.displayName[locale]])
    ),
    identity,
    library: {
      libraryName: cleanText(input.library?.libraryName, MAX_NAME) || base.library.libraryName,
      travelerName: cleanText(input.library?.travelerName, MAX_NAME),
      traveler2Name: cleanText(input.library?.traveler2Name, MAX_NAME),
    },
    // An invalid override sanitizes to "" — i.e. "no override" — rather than
    // failing the whole save, so one bad field never blocks the rest.
    customNames: sanitizeCustomNames(input.customNames),
  };
}

// The world's identity in the shape the localization layer already speaks
// ({ judge, scholars: {1,2,3} } per locale) — the ONE adapter between engine
// ids and the existing identity-pack contract. Nothing else translates
// between the two.
export function worldIdentityPacks(content) {
  const c = sanitizeWorldContent(content);
  return Object.fromEntries(
    WORLD_SEED_LOCALES.map((locale) => [
      locale,
      {
        judge: c.identity.grand_sage[locale],
        scholars: {
          1: c.identity.alpha[locale],
          2: c.identity.beta[locale],
          3: c.identity.gamma[locale],
        },
      },
    ])
  );
}

// --------------------------------------------------------------- persistence

export async function loadWorldContent() {
  let text;
  try {
    text = await fs.readFile(WORLD_CONTENT_PATH, "utf8");
  } catch {
    return defaultWorldContent();
  }
  try {
    return sanitizeWorldContent(JSON.parse(text));
  } catch (err) {
    console.error("[world] content file is not valid JSON — using the Classic default:", err.message);
    return defaultWorldContent();
  }
}

export async function saveWorldContent(raw) {
  const content = sanitizeWorldContent(raw);
  await fs.mkdir(path.dirname(WORLD_CONTENT_PATH), { recursive: true });
  await fs.writeFile(WORLD_CONTENT_PATH, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return content;
}

// ------------------------------------------------------------------ presets
// Copy-based, same philosophy as UI Presets: loading a preset COPIES its
// values into the current world, with no live reference and no inheritance.

async function readPresetFile(id) {
  try {
    return sanitizeWorldContent(JSON.parse(await fs.readFile(presetPath(id), "utf8")));
  } catch {
    return null;
  }
}

export async function listWorldPresets() {
  let entries;
  try {
    entries = await fs.readdir(WORLD_PRESET_DIR);
  } catch {
    return [];
  }
  const presets = [];
  for (const file of entries.sort()) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -".json".length);
    if (!isValidWorldPresetId(id)) continue;
    const content = await readPresetFile(id);
    if (content) presets.push({ id, displayName: content.displayName[FALLBACK_LOCALE] || id });
  }
  return presets;
}

export async function getWorldPreset(id) {
  const content = await readPresetFile(id);
  if (!content) return null;
  // Stamped with the preset's own id so the editor can show where the values
  // came from — a label, never a link back to the file.
  return { ...content, id };
}

export async function worldPresetExists(id) {
  try {
    await fs.access(presetPath(id));
    return true;
  } catch {
    return false;
  }
}

// `overwrite` must be explicitly true: editing the current world can never
// silently overwrite another preset (§G).
export async function saveWorldPreset(id, raw, { overwrite = false } = {}) {
  if (!isValidWorldPresetId(id)) {
    throw worldError(400, "A world preset id may use only lowercase letters, numbers, - and _.");
  }
  if (!overwrite && (await worldPresetExists(id))) {
    throw worldError(409, `A world preset named "${id}" already exists.`);
  }
  const content = { ...sanitizeWorldContent(raw), id };
  await fs.mkdir(WORLD_PRESET_DIR, { recursive: true });
  await fs.writeFile(presetPath(id), `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return content;
}

// ------------------------------------------------------------ runtime view
// What the shipping app may see: display identity only. No filesystem path,
// no preset bookkeeping beyond the world's own id.
export function runtimeWorld(content) {
  const c = sanitizeWorldContent(content);
  return {
    version: c.version,
    id: c.id,
    displayName: c.displayName,
    identity: c.identity,
    library: c.library,
    customNames: c.customNames,
  };
}

// ------------------------------------------------------------ theme tokens
// Mapped onto the semantic --ws-* vocabulary style.css ALREADY defines and
// consumes (its own comment anticipated exactly this: "a future theme (or
// World / Theme Pack) redefines the same tokens"). No new vocabulary is
// invented and no decorative color is captured: --wood/--gold/--font-pixel
// and the inline pixel-art hexes belong to the scene artwork and stay fixed.
//
//   token          CSS custom property     representative components
//   surface        --ws-bg                 workspace background
//   surfaceRaised  --ws-panel              panels
//   surfaceCard    --ws-card               cards, chat bubbles
//   surfaceInset   --ws-deep               sunken/code surfaces
//   frame          --ws-frame              outer frame line
//   text           --ws-text               primary ink
//   textMuted      --ws-muted              secondary ink
//   border         --ws-border             hairlines
//   borderStrong   --ws-border-strong      emphasised edges
//   accent         --ws-accent             active mode, primary button
//   accentText     --ws-accent-ink         text on accent fills
//   accentSoft     --ws-accent-soft        hover wash
//   highlight      --ws-gold               bright accents
//   success        --ws-ok                 success states
//   warning        --ws-warn               warnings
//   scrollbar      --ws-scrollbar          scrollbar thumb
//   scrollbarTrack --ws-scrollbar-track    scrollbar track
export const THEME_TOKENS = {
  surface: "--ws-bg",
  surfaceRaised: "--ws-panel",
  surfaceCard: "--ws-card",
  surfaceInset: "--ws-deep",
  frame: "--ws-frame",
  text: "--ws-text",
  textMuted: "--ws-muted",
  border: "--ws-border",
  borderStrong: "--ws-border-strong",
  accent: "--ws-accent",
  accentText: "--ws-accent-ink",
  accentSoft: "--ws-accent-soft",
  highlight: "--ws-gold",
  success: "--ws-ok",
  warning: "--ws-warn",
  scrollbar: "--ws-scrollbar",
  scrollbarTrack: "--ws-scrollbar-track",
};

export const THEME_MODES = ["dark", "light"];

// The Classic values, lifted verbatim from style.css so a migrated Scene
// renders byte-identically to today.
const CLASSIC_THEME = {
  dark: {
    surface: "#221a12", surfaceRaised: "#2a2016", surfaceCard: "#34281a", surfaceInset: "#1a140d",
    frame: "#120d08", text: "#f0e8d8", textMuted: "#a6957a",
    border: "#c4944a38", borderStrong: "#c4944a73",
    accent: "#c0954c", accentText: "#251807", accentSoft: "#c0954c24",
    highlight: "#e5b968", success: "#8caf6f", warning: "#d8a24d",
    scrollbar: "#4d3c26", scrollbarTrack: "#1c150e",
  },
  light: {
    surface: "#f0ddb2", surfaceRaised: "#e6cd97", surfaceCard: "#dbba82", surfaceInset: "#f7ecd2",
    frame: "#5a4022", text: "#38260f", textMuted: "#7d6440",
    border: "#5a402259", borderStrong: "#5a40228c",
    accent: "#8a5a22", accentText: "#f7ecd2", accentSoft: "#8a5a2224",
    highlight: "#a06f1f", success: "#4c7a3f", warning: "#a2572c",
    scrollbar: "#c9ad74", scrollbarTrack: "#e6cd97",
  },
};

export function defaultTheme() {
  return { defaultMode: "dark", ...JSON.parse(JSON.stringify(CLASSIC_THEME)) };
}

// Only literal hex is accepted: #RGB / #RGBA / #RRGGBB / #RRGGBBAA. No CSS
// functions, no var(), no url(), no named colors. Authored theme data must be
// deterministic and can never carry anything that reaches style injection as
// CSS text.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function sanitizeThemeColor(value) {
  if (typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  return HEX_COLOR_RE.test(v) ? v : "";
}

// The tokens the Theme editor AUTHORS — a deliberate subset of the 17 stored
// ones (Stage 2 audit). Storage is unchanged: every stored token is still
// sanitized and still applied, so no existing Scene loses a color. These two
// lists only decide what gets an editor row.
//
// CORE is always visible; ADVANCED starts collapsed because those three are
// low-frequency decisions (a sunken surface, the outer frame line, and the
// emphasised border) that would otherwise crowd a 340px panel.
export const CORE_THEME_TOKENS = [
  "surface",
  "surfaceRaised",
  "surfaceCard",
  "text",
  "textMuted",
  "border",
  "accent",
  "accentText",
  "highlight",
];
export const ADVANCED_THEME_TOKENS = ["surfaceInset", "frame", "borderStrong"];
export const AUTHORED_THEME_TOKENS = [...CORE_THEME_TOKENS, ...ADVANCED_THEME_TOKENS];

// Tokens carrying ALPHA by design — the two hairline borders. A native color
// input cannot express alpha, so the editor gives these a text field and a
// passive swatch instead (see the input policy in scene-editor.js).
export const ALPHA_THEME_TOKENS = ["border", "borderStrong"];

// The hover wash is the accent at 14% — byte-identical in both Classic modes
// (#c0954c24 / #8a5a2224), so authoring it separately only creates a way for
// the two to drift apart.
const ACCENT_SOFT_ALPHA_BYTE = "24";

// Expands #RGB/#RGBA to the 6/8-digit form so alpha handling has one shape.
function expandHex(hex) {
  if (hex.length !== 4 && hex.length !== 5) return hex;
  return `#${[...hex.slice(1)].map((c) => c + c).join("")}`;
}

// accentSoft from the RESOLVED accent of the same mode: RGB unchanged, alpha
// byte 0x24. Pure string work — no color math, no CSS function — so it is
// deterministic and portable.
export function deriveAccentSoft(accent) {
  const base = expandHex(sanitizeThemeColor(accent));
  if (!base) return "";
  return `${base.slice(0, 7)}${ACCENT_SOFT_ALPHA_BYTE}`;
}

// Token by token, per mode: an invalid or missing value falls back to the
// Classic default FOR THAT SAME MODE, so dark never borrows from light.
//
// accentSoft is the one exception, and only when it is ABSENT or malformed:
// it then derives from this mode's accent rather than from the Classic wash,
// so a world that re-tints its accent gets a matching hover wash instead of a
// brass smudge. An explicitly authored accentSoft — including one that
// differs from the derived value — is preserved and applied unchanged.
function sanitizeThemeMode(raw, mode) {
  const base = CLASSIC_THEME[mode];
  const out = {};
  for (const token of Object.keys(THEME_TOKENS)) {
    out[token] = sanitizeThemeColor(raw?.[token]) || base[token];
  }
  // Treated as derived when it is absent, malformed, or indistinguishable
  // from a derivation — which includes the Classic value every existing Scene
  // already stores. Without that second case, re-tinting the accent would
  // leave a brass hover wash behind on every Scene authored so far, and the
  // wash is the one thing that must always match the accent.
  //
  // A value that matches NEITHER derivation was deliberately chosen, and is
  // preserved and applied exactly as authored.
  const authoredSoft = sanitizeThemeColor(raw?.accentSoft);
  const looksDerived =
    !authoredSoft ||
    authoredSoft === deriveAccentSoft(out.accent) ||
    authoredSoft === deriveAccentSoft(base.accent);
  if (looksDerived) out.accentSoft = deriveAccentSoft(out.accent) || base.accentSoft;
  return out;
}

// ------------------------------------------------------- runtime application
// THE whitelist. The runtime may write these CSS custom properties and
// nothing else: an authored key that is not a theme token has no variable to
// land in, so it cannot reach the CSSOM by construction rather than by a
// check someone can forget.
//
// These are the same --ws-* names style.css already defines and #chat-panel
// already consumes; nothing is renamed, and the stylesheet keeps working as
// the fallback if this never runs.
export function themeCssVariables(theme, mode) {
  const t = sanitizeTheme(theme);
  const resolved = THEME_MODES.includes(mode) ? mode : t.defaultMode;
  const values = t[resolved];
  const out = {};
  for (const [token, cssVar] of Object.entries(THEME_TOKENS)) {
    // Sanitized a second time on the way out: what reaches setProperty is
    // always a literal hex, whatever happened upstream.
    const value = sanitizeThemeColor(values[token]) || CLASSIC_THEME[resolved][token];
    out[cssVar] = value;
  }
  return out;
}

// Which mode the runtime should show. The user's own choice always wins: a
// Scene's defaultMode seeds the appearance for someone who has never picked
// one, and must never flip a preference they explicitly saved.
export function resolveThemeMode({ userMode, userModeIsExplicit, theme } = {}) {
  if (userModeIsExplicit && THEME_MODES.includes(userMode)) return userMode;
  const sceneDefault = sanitizeTheme(theme).defaultMode;
  if (THEME_MODES.includes(sceneDefault)) return sceneDefault;
  return THEME_MODES.includes(userMode) ? userMode : "dark";
}

// -------------------------------------------------------------- contrast
// WCAG 2.1 relative luminance and contrast ratio. Advisory only: nothing here
// blocks a save, because the shipped Classic light palette itself fails
// several of these pairs and a blocking check would make the default
// unsavable.

function parseHex(value) {
  const hex = expandHex(sanitizeThemeColor(value));
  if (!hex) return null;
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(1), g: n(3), b: n(5), a: hex.length === 9 ? n(7) / 255 : 1 };
}

// A translucent foreground is judged against what is actually behind it, not
// against its own raw value — otherwise every alpha token reads as a failure.
function compositeOver(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(foreground, background) {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return 0;
  const a = relativeLuminance(compositeOver(fg, bg));
  const b = relativeLuminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// The pairs worth checking: every place a token is used AS INK on another
// token. `large` marks pairs whose real-world use is large or non-body text,
// where WCAG's 3:1 threshold applies instead of 4.5:1.
export const CONTRAST_PAIRS = [
  { fg: "text", bg: "surface", label: "Text on Surface" },
  { fg: "text", bg: "surfaceRaised", label: "Text on Raised Surface" },
  { fg: "text", bg: "surfaceCard", label: "Text on Card Surface" },
  { fg: "text", bg: "surfaceInset", label: "Text on Inset Surface" },
  { fg: "textMuted", bg: "surface", label: "Muted Text on Surface" },
  { fg: "textMuted", bg: "surfaceCard", label: "Muted Text on Card Surface" },
  { fg: "accentText", bg: "accent", label: "Accent Text on Accent" },
  { fg: "accentText", bg: "highlight", label: "Accent Text on Highlight" },
  { fg: "highlight", bg: "surface", label: "Highlight on Surface", large: true },
  { fg: "highlight", bg: "surfaceCard", label: "Highlight on Card Surface", large: true },
  { fg: "accent", bg: "surface", label: "Accent on Surface", large: true },
  { fg: "success", bg: "surface", label: "Success on Surface", large: true },
  { fg: "warning", bg: "surface", label: "Warning on Surface", large: true },
];

// One report for the mode being edited: every pair with its ratio and
// verdict, plus the set of tokens involved in a failure so the editor can put
// a marker on those rows.
export function contrastReport(theme, mode) {
  const t = sanitizeTheme(theme);
  const resolved = THEME_MODES.includes(mode) ? mode : t.defaultMode;
  const values = t[resolved];
  const failingTokens = new Set();
  const pairs = CONTRAST_PAIRS.map((pair) => {
    const ratio = contrastRatio(values[pair.fg], values[pair.bg]);
    const threshold = pair.large ? 3 : 4.5;
    const pass = ratio >= threshold;
    if (!pass) {
      failingTokens.add(pair.fg);
      failingTokens.add(pair.bg);
    }
    return {
      ...pair,
      // Two decimals: a ratio is a judgement aid, not a measurement, and a
      // jittering last digit would make the panel look unstable.
      ratio: Math.round(ratio * 100) / 100,
      threshold,
      pass,
    };
  });
  return { mode: resolved, pairs, failing: pairs.filter((p) => !p.pass).length, failingTokens };
}

export function sanitizeTheme(raw) {
  const defaultMode = THEME_MODES.includes(raw?.defaultMode) ? raw.defaultMode : "dark";
  return {
    defaultMode,
    dark: sanitizeThemeMode(raw?.dark, "dark"),
    light: sanitizeThemeMode(raw?.light, "light"),
  };
}

// ------------------------------------------------------------------- audio
// SCHEMA ONLY in this phase: the project has no audio subsystem at all (no
// Audio element, no AudioContext, no assets/audio/ directory). Per the task
// instruction, playback is deferred rather than invented here. This stores
// and validates the configuration so the editor and a future controller can
// share one sanitized shape.
export const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav"];
const AUDIO_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// A resource ID, never a path: traversal, absolute paths and remote URLs
// cannot survive, because anything that is not a bare id resolves to "".
export function sanitizeAudioTrack(value) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return AUDIO_ID_RE.test(v) ? v : "";
}

export function sanitizeAudio(raw) {
  const volume = Number(raw?.volume);
  return {
    musicTrack: sanitizeAudioTrack(raw?.musicTrack),
    // Clamped rather than rejected: a slider that briefly reports 1.0000001
    // should not blank the field. Non-numeric falls back to the default.
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.35,
    loop: raw?.loop !== false,
    autoplay: raw?.autoplay === true,
  };
}

// ------------------------------------------------------ the Scene snapshot

const LOCALE_ID_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isValidLocaleId(id) {
  return typeof id === "string" && LOCALE_ID_RE.test(id);
}

// PERSISTENCE ONLY — cleans what was authored, and materializes nothing.
//
// An empty field means "not translated yet", which is a fact about the Scene
// and must survive a save. The sanitizer used to fill blanks with the
// built-in English names, which destroyed that distinction: a French locale
// with three real translations came back from disk looking fully translated,
// in English. Filling here also froze a copy of the fallback into the Scene,
// so a later change to the English names silently stopped propagating.
//
// Fallback is a RESOLUTION concern, not a storage one, and now lives in
// resolveSceneIdentity() below — one implementation, used by every consumer.
function sanitizeLocaleBlock(raw) {
  const identity = {};
  for (const id of SCENE_WORLD_PERSONA_IDS) {
    identity[id] = cleanText(raw?.identity?.[id], MAX_NAME);
  }
  return {
    identity,
    libraryName: cleanText(raw?.libraryName, MAX_NAME),
    worldDisplayName: cleanText(raw?.worldDisplayName, MAX_NAME),
  };
}

// The Classic seed: used for a fresh Scene and as the per-field fallback.
export function defaultSceneWorld() {
  return {
    presetSource: DEFAULT_WORLD_ID,
    customNames: Object.fromEntries(CUSTOM_NAME_KEYS.map((k) => [k, ""])),
    locales: {
      en: {
        identity: {
          grand_sage: "Grand Sage", alpha: "Architect", beta: "Oracle", gamma: "Analyst",
          traveler1: "Traveler", traveler2: "Traveler", pet: "Pet",
        },
        libraryName: "Aether Library",
        worldDisplayName: "Classic",
      },
      "zh-TW": {
        identity: {
          grand_sage: "大智者", alpha: "謀者", beta: "墨者", gamma: "理者",
          traveler1: "旅者", traveler2: "旅者", pet: "寵物",
        },
        libraryName: "Aether Library",
        worldDisplayName: "經典圖書館",
      },
    },
    theme: defaultTheme(),
    audio: sanitizeAudio(null),
  };
}

// Normalizes ANY input into the snapshot. Locale keys are enumerated from the
// DATA, never hardcoded, so a Scene that gains "ja" carries it through the
// sanitizer, the runtime and the editor with no code change. English always
// survives, so identity can never resolve to nothing.
export function sanitizeSceneWorld(raw) {
  const base = defaultSceneWorld();
  const input = raw && typeof raw === "object" ? raw : {};

  // The AUTHORED locale set is authoritative when there is one: a Scene that
  // dropped a language must stay dropped, so the seed set is never merged in
  // on top. Only a Scene that declares no usable locales at all (a fresh
  // Scene, or junk) falls back to the seed.
  const locales = {};
  const authored = input.locales && typeof input.locales === "object" ? input.locales : {};
  for (const [locale, block] of Object.entries(authored)) {
    if (!isValidLocaleId(locale)) continue;
    locales[locale] = sanitizeLocaleBlock(block);
  }
  if (Object.keys(locales).length === 0) Object.assign(locales, base.locales);
  // English must always EXIST — it is the authored fallback every other
  // locale resolves through. Initializing it does not mean populating it:
  // an unauthored field stays empty and resolves to the built-in name.
  if (!locales.en) locales.en = sanitizeLocaleBlock(authored.en);

  return {
    // Provenance only — never a live reference. Falls back to the default so
    // that sanitize(default) === default: the empty Scene and a round-tripped
    // Scene must be the same document, or dirty-tracking would see a change
    // the user never made.
    presetSource:
      cleanText(input.presetSource, 64).toLowerCase().replace(/[^a-z0-9_-]/g, "") || base.presetSource,
    customNames: sanitizeCustomNames(input.customNames),
    locales,
    theme: sanitizeTheme(input.theme),
    audio: sanitizeAudio(input.audio),
  };
}

// Adapts a World PRESET (the older identity-pack shape) into a Scene-owned
// snapshot. This is the deep copy performed by Load Preset; the preset file
// is never referenced again afterwards.
export function sceneWorldFromPreset(preset) {
  const p = sanitizeWorldContent(preset);
  const base = defaultSceneWorld();
  const locales = {};
  for (const locale of worldLocales(p)) {
    locales[locale] = {
      identity: {
        grand_sage: p.identity.grand_sage[locale] || "",
        alpha: p.identity.alpha[locale] || "",
        beta: p.identity.beta[locale] || "",
        gamma: p.identity.gamma[locale] || "",
        // The preset schema has no per-locale traveler/pet names — the two
        // travelers come from its single library block, and there is no pet
        // field at all. Unrepresented values stay EMPTY rather than being
        // seeded from the built-ins: an empty field resolves to the built-in
        // name anyway, and copying it in would misreport it as authored.
        traveler1: p.library.travelerName || "",
        traveler2: p.library.traveler2Name || "",
        pet: "",
      },
      libraryName: p.library.libraryName || "",
      worldDisplayName: p.displayName[locale] || "",
    };
  }
  if (!locales.en) locales.en = base.locales.en;
  return sanitizeSceneWorld({
    presetSource: p.id,
    customNames: p.customNames,
    locales,
    theme: p.theme,
    audio: p.audio,
  });
}

// The reverse of sceneWorldFromPreset(): turns a Scene's world back into a
// reusable TEMPLATE ("Save as New Preset"). Lossy by design — the preset
// schema has no per-locale traveler/pet names and no theme/audio — which is
// exactly why the Scene, not the preset, is the runtime source of truth.
export function sceneWorldToPreset(sceneWorld, id) {
  const w = sanitizeSceneWorld(sceneWorld);
  const perLocale = (pick) =>
    Object.fromEntries(Object.entries(w.locales).map(([locale, block]) => [locale, pick(block)]));
  return sanitizeWorldContent({
    id: id || w.presetSource,
    displayName: perLocale((b) => b.worldDisplayName),
    identity: Object.fromEntries(
      ENGINE_PERSONA_IDS.map((engineId) => [engineId, perLocale((b) => b.identity[engineId])])
    ),
    library: {
      libraryName: w.locales.en.libraryName,
      travelerName: w.locales.en.identity.traveler1,
      traveler2Name: w.locales.en.identity.traveler2,
    },
    customNames: w.customNames,
  });
}

// ----------------------------------------------------------- THE resolver
// The one place a stored value becomes a displayed one. Storage keeps empty
// fields empty (see sanitizeLocaleBlock); this decides what an empty field
// SHOWS, without ever writing that answer back:
//
//     requested locale (authored) -> English (authored) -> built-in
//
// The Custom Name override sits above all three and is applied by
// localization.js, which is language-independent — so the full order the
// product documents is Custom Name -> locale -> English -> built-in, with
// exactly one implementation of each step.
//
// The built-in step prefers the SAME locale's built-in text when there is
// one (so an unauthored zh-TW Scene still reads as Chinese) and falls back
// to built-in English otherwise.
function builtInLocaleBlock(locale) {
  const base = defaultSceneWorld();
  return base.locales[locale] || base.locales.en;
}

// Returns "" only when no step in the chain has anything — which cannot
// happen for the seven engine ids, since the built-ins always name them.
export function resolveSceneIdentity(sceneWorld, locale, personaId) {
  const w = sanitizeSceneWorld(sceneWorld);
  return (
    w.locales[locale]?.identity?.[personaId] ||
    w.locales.en?.identity?.[personaId] ||
    builtInLocaleBlock(locale).identity[personaId] ||
    ""
  );
}

// Same chain, for the two per-locale text fields.
export function resolveSceneText(sceneWorld, locale, field) {
  const w = sanitizeSceneWorld(sceneWorld);
  return (
    w.locales[locale]?.[field] || w.locales.en?.[field] || builtInLocaleBlock(locale)[field] || ""
  );
}

// Identity packs for the localization layer, built from the SCENE snapshot.
//
// Fully RESOLVED: every pack carries a real name for every persona, produced
// by resolveSceneIdentity. Emitting the stored value instead would push the
// last step of the chain onto localization.js, whose own fallback is the
// DEFAULT UI language rather than English — which would silently change what
// an unauthored locale displays. The chain belongs here, in one place.
export function sceneWorldIdentityPacks(sceneWorld) {
  const w = sanitizeSceneWorld(sceneWorld);
  return Object.fromEntries(
    Object.keys(w.locales).map((locale) => [
      locale,
      {
        judge: resolveSceneIdentity(w, locale, "grand_sage"),
        scholars: Object.fromEntries(
          Object.entries(ENGINE_ID_BY_SLOT).map(([slot, engineId]) => [
            slot,
            resolveSceneIdentity(w, locale, engineId),
          ])
        ),
      },
    ])
  );
}

// The Scene's world as the SHIPPING app may see it. Same public shape as
// runtimeWorld() plus theme/audio, but sourced from the Scene snapshot — the
// runtime reads the Scene, never a preset file.
export function runtimeSceneWorld(sceneWorld) {
  const w = sanitizeSceneWorld(sceneWorld);
  // RESOLVED, not raw: a runtime consumer wants the name that will be shown,
  // and it must not have to reimplement the fallback chain to get it.
  const perLocale = (pick) => Object.fromEntries(Object.keys(w.locales).map((locale) => [locale, pick(locale)]));
  return {
    version: WORLD_CONTENT_VERSION,
    id: w.presetSource || DEFAULT_WORLD_ID,
    displayName: perLocale((locale) => resolveSceneText(w, locale, "worldDisplayName")),
    identity: Object.fromEntries(
      SCENE_WORLD_PERSONA_IDS.map((id) => [id, perLocale((locale) => resolveSceneIdentity(w, locale, id))])
    ),
    library: { libraryName: resolveSceneText(w, "en", "libraryName") },
    customNames: w.customNames,
    theme: w.theme,
    audio: w.audio,
  };
}
