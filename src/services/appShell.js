// Application shell configuration — the product's own start screen.
//
// WHY THIS IS ITS OWN DOCUMENT, and not one of the three obvious alternatives:
//
//   NOT the Scene (data/scene-layout.json). The start screen is shown BEFORE
//   any Scene is entered and belongs to the application, not to a map. Storing
//   it in the Scene would mean loading another Scene silently replaced the
//   start screen — precisely what must not happen.
//
//   NOT the World, and NOT the Colour Theme. Neither owns art paths.
//
//   NOT config/product.json, even though that file is also global product
//   data. product.json is deliberately READ-ONLY at runtime: it has no write
//   export and no write route, so that loading someone else's Scene or preset
//   can never repoint "Official Website" or "Support". Adding a write path
//   there to author a background would trade a real safety property for a
//   cosmetic field. This file gets its own dev-only write route instead, and
//   product.json's invariant survives untouched.
//
// So: identity and destinations live in product.json; the shell's PRESENTATION
// lives here. One field today, which is the whole point — it is a new concern
// with no existing owner, not a parallel copy of one.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeStartMenuBackgroundPath, sanitizeAppIconPath, START_MENU_ROOT, APP_ICON_ROOT } from "./assetPaths.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real config file.
export const APP_SHELL_CONFIG_PATH = process.env.APP_SHELL_CONFIG_PATH
  ? path.resolve(process.env.APP_SHELL_CONFIG_PATH)
  : path.join(projectRoot, "config", "app-shell.json");

export const APP_SHELL_VERSION = 1;

// The art the start screen has always shown. Unlike the Scene's background,
// config/ IS tracked by git, so this default ships in the repository AND is
// reproduced here — a machine whose config file is missing or corrupt still
// gets the intended start screen rather than a bare colour wash.
export const DEFAULT_START_MENU_BACKGROUND = "assets/background/start-menu/start_menu.png";

// The Start Menu canvas the title-image coordinates are expressed in. The same
// 1920×1080 reference the Scene uses, so one mental model covers both.
export const START_MENU_CANVAS = { width: 1920, height: 1080 };

// COORDINATE CONVENTION — ONE convention, never mixed: titleX/titleY are the
// CENTRE of the title image, in 1920×1080 canvas pixels. Centre rather than
// top-left because a logo is positioned by where it SITS, and swapping in
// wider art should not drag the composition sideways.
export const DEFAULT_TITLE_POSITION = { x: 960, y: 300 };

// The decorative START MENU ICON — a small logo/emblem layer that is entirely
// SEPARATE from the title image above. It never participates in the
// title-versus-wordmark swap: it is composited on top of the Start Menu and
// nothing else reacts to whether it is set. Its own field, its own position,
// its own scale, so clearing one can never disturb the other.
//
// Default sits above the wordmark (960, 160) — the usual place for an emblem
// on a title screen, and clear of both the title band and the buttons. It is
// inert until an author actually configures an image.
export const DEFAULT_ICON_POSITION = { x: 960, y: 160 };

// 1 = the image's natural size mapped onto the 1920×1080 canvas (an N-pixel
// wide icon covers N/1920 of the canvas width), so the same authored number
// means the same composition at any window size. Bounds exist only to stop a
// typo rendering something unrecoverable; they are far outside normal use.
export const DEFAULT_ICON_SCALE = 1;
export const ICON_SCALE_LIMITS = { min: 0.05, max: 10 };

export function defaultAppShell() {
  return {
    version: APP_SHELL_VERSION,
    startMenuBackground: DEFAULT_START_MENU_BACKGROUND,
    // No title art ships: with none configured the Start Menu renders no
    // branding element at all, rather than falling back to the removed
    // "Aether Library" / "A Nexus for Explorers" text.
    startMenuTitleImage: "",
    startMenuTitleX: DEFAULT_TITLE_POSITION.x,
    startMenuTitleY: DEFAULT_TITLE_POSITION.y,
    // No icon ships either — an existing project must not gain decoration it
    // never asked for.
    startMenuIcon: "",
    startMenuIconX: DEFAULT_ICON_POSITION.x,
    startMenuIconY: DEFAULT_ICON_POSITION.y,
    startMenuIconScale: DEFAULT_ICON_SCALE,
  };
}

// Same type-first discipline as titleCoord(): Number("") and Number(null) are
// both 0, and 0 is finite, so a bare isFinite() check would silently collapse
// an unset scale to zero and render the icon invisible. Non-positive is
// refused outright — a scale of 0 or below has no meaningful rendering.
function iconScale(value) {
  if (typeof value !== "number" && typeof value !== "string") return DEFAULT_ICON_SCALE;
  if (typeof value === "string" && value.trim() === "") return DEFAULT_ICON_SCALE;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ICON_SCALE;
  const clamped = Math.min(ICON_SCALE_LIMITS.max, Math.max(ICON_SCALE_LIMITS.min, n));
  return Math.round(clamped * 1000) / 1000;
}

// Coordinates are clamped to a generous margin OUTSIDE the canvas rather than
// to its edges: an author may deliberately park art partly off-screen, and
// clamping to 0..1920 would silently move their composition. Non-numeric input
// falls back to the default instead of collapsing to 0.
function titleCoord(value, fallback, max) {
  // TYPE FIRST, then value. Number() coerces far too much to 0 — Number(null),
  // Number([]) and Number("") are all 0, and 0 is finite, so a bare
  // Number()/isFinite() check silently pins an unset or malformed coordinate to
  // the canvas edge instead of falling back to the default.
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.max(-max, Math.min(max * 2, n)));
}

// Driven by the known field list, so anything a caller tries to smuggle in —
// a Scene id, links, identity — simply does not survive.
//
// A MISSING key falls back to the shipped default (an incomplete file should
// still show the intended screen). An explicitly EMPTY string is honoured as
// "no start-menu art", the same authored-blank rule the Scene background uses.
export function sanitizeAppShell(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const hasKey = Object.prototype.hasOwnProperty.call(r, "startMenuBackground");
  const startMenuBackground = hasKey
    ? sanitizeStartMenuBackgroundPath(r.startMenuBackground)
    : DEFAULT_START_MENU_BACKGROUND;
  // The title image shares the start-menu asset root and its sanitizer — same
  // domain, different FIELD. Two properties distinguished at the config level,
  // which is what keeps imageImport.js generic (it is told a root, never a
  // purpose). Absent = no title art, which is the correct migration default
  // for every config written before this field existed.
  const startMenuTitleImage = sanitizeStartMenuBackgroundPath(r.startMenuTitleImage);
  return {
    version: APP_SHELL_VERSION,
    startMenuBackground,
    startMenuTitleImage,
    startMenuTitleX: titleCoord(r.startMenuTitleX, DEFAULT_TITLE_POSITION.x, START_MENU_CANVAS.width),
    startMenuTitleY: titleCoord(r.startMenuTitleY, DEFAULT_TITLE_POSITION.y, START_MENU_CANVAS.height),
    // The icon has its OWN asset root (assets/app-icons/), unlike the title
    // image which shares the start-menu root. The canonical app icon is
    // product art reused by the OS/desktop packager, not one screen's
    // composition, so it lives outside assets/background/. Absent = no icon,
    // which is the correct migration default for every config written before
    // these fields existed.
    startMenuIcon: sanitizeAppIconPath(r.startMenuIcon),
    startMenuIconX: titleCoord(r.startMenuIconX, DEFAULT_ICON_POSITION.x, START_MENU_CANVAS.width),
    startMenuIconY: titleCoord(r.startMenuIconY, DEFAULT_ICON_POSITION.y, START_MENU_CANVAS.height),
    startMenuIconScale: iconScale(r.startMenuIconScale),
  };
}

export async function loadAppShell() {
  try {
    return sanitizeAppShell(JSON.parse(await fs.readFile(APP_SHELL_CONFIG_PATH, "utf8")));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("[app-shell] falling back to defaults:", err.message);
    }
    return defaultAppShell();
  }
}

// Dev-only (registered inside server.js's config.devTools gate). Sanitizes
// before writing, so an unsafe path can never reach disk.
export async function saveAppShell(raw) {
  const clean = sanitizeAppShell(raw);
  await fs.mkdir(path.dirname(APP_SHELL_CONFIG_PATH), { recursive: true });
  await fs.writeFile(APP_SHELL_CONFIG_PATH, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
  return clean;
}

// What the shipping client receives. Currently the whole document — there is
// nothing private in it — but kept as an explicit projection so a future
// internal field is not exposed by accident.
export function runtimeAppShell(shell) {
  const s = sanitizeAppShell(shell);
  return {
    startMenuBackground: s.startMenuBackground,
    startMenuTitleImage: s.startMenuTitleImage,
    startMenuTitleX: s.startMenuTitleX,
    startMenuTitleY: s.startMenuTitleY,
    startMenuIcon: s.startMenuIcon,
    startMenuIconX: s.startMenuIconX,
    startMenuIconY: s.startMenuIconY,
    startMenuIconScale: s.startMenuIconScale,
  };
}

export { START_MENU_ROOT, APP_ICON_ROOT };
