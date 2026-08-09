// Project-asset path validation — ONE implementation, shared by every schema
// that stores a reference to a file inside assets/.
//
// This logic is security-relevant (it is what stops an authored JSON field from
// naming a file outside the project, or a `javascript:` URL from reaching an
// `src` attribute), so it must not exist twice. It was extracted verbatim from
// contentResources.js's sanitizeTutorialImage(), which now calls it — the
// Tutorial's behaviour is unchanged, and Scene backgrounds get the same
// guarantees rather than a second, subtly different copy.
//
// WHAT IT GUARANTEES about a non-empty return value:
//   * project-relative — never absolute, never a UNC share, never a URL
//   * POSIX-separated — a Windows-authored `\` path normalises to `/`
//   * inside `root` — traversal cannot escape it at any depth
//   * an allow-listed extension — anything else is refused by construction
//
// It is PURE and SYNCHRONOUS: it validates the shape of a reference, never
// whether the file exists. Existence is a separate, async concern belonging to
// whoever renders or lists the asset (a missing image is a runtime warning, not
// a corrupt document — and a sanitizer that touched the filesystem could not be
// used inside sanitizeLayout()).

// Rejection is ALWAYS to "" — never an exception. A malformed reference must
// degrade one field, never fail the document that contains it.
export function sanitizeProjectAssetPath(value, { root, extensions, maxLength = 300 } = {}) {
  const raw = typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
  if (!raw) return "";
  // Any scheme at all: http:, https:, data:, javascript:, file: — and also a
  // Windows drive letter, because "C:/Users/..." matches this same shape.
  // That is deliberate: one rule covers both, and neither is a project path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  // POSIX absolute, and every UNC form — "\\server\share" has already become
  // "//server/share" by the backslash normalisation above.
  if (raw.startsWith("/")) return "";
  const parts = [];
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue; // "a//b" and "./a" collapse
    if (segment === "..") return ""; // traversal, at ANY depth, not just the head
    parts.push(segment);
  }
  const normalized = parts.join("/");
  if (!normalized.startsWith(root)) return "";
  if (normalized.length > maxLength) return "";
  const lower = normalized.toLowerCase();
  if (!extensions.some((ext) => lower.endsWith(ext))) return "";
  return normalized;
}

// ------------------------------------------------------------- scene backgrounds
// The Scene's background lives under exactly one root. Sub-directories are
// allowed (assets/background/xmas/hall.png) so a World can group its variants,
// but a directory whose name starts with "_" is authoring material rather than
// runtime art — see BACKGROUND_SKIP_DIR_PREFIX below.
export const BACKGROUND_ROOT = "assets/background/";

// Runtime-renderable raster formats only. PSD is deliberately absent: it may
// live in assets/background/ as source art and is invisible here by
// construction, not by a special case. Same for .svg/.gif/.bmp/.tif.
export const BACKGROUND_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

// Directories the background picker never descends into: source art, guides,
// work-in-progress. "_guides/" holds classic_library_bg_guide.png, the artist's
// placement composite that must never be selectable as a runtime background.
export const BACKGROUND_SKIP_DIR_PREFIX = "_";

export function sanitizeBackgroundPath(value) {
  return sanitizeProjectAssetPath(value, {
    root: BACKGROUND_ROOT,
    extensions: BACKGROUND_EXTENSIONS,
  });
}

// --------------------------------------------------------- start menu art
// The application START SCREEN's background. A DIFFERENT concern from the
// Scene background above, with its own root, its own field and its own
// document (config/app-shell.json — product shell, never Scene data), so that
// loading another Scene can never change what the start screen looks like.
//
// The root is a sub-directory of BACKGROUND_ROOT, which makes the two
// asymmetric on purpose: the start screen can only use start-menu art, while a
// Scene could legitimately reuse a start-menu image as its map. The Scene
// PICKER still excludes this directory (see /api/dev/backgrounds) so the two
// domains stay visibly separate in the editor.
export const START_MENU_ROOT = "assets/background/start-menu/";

export function sanitizeStartMenuBackgroundPath(value) {
  return sanitizeProjectAssetPath(value, {
    root: START_MENU_ROOT,
    extensions: BACKGROUND_EXTENSIONS,
  });
}

// ------------------------------------------------------------ app icons
// The application's own icon art — the master emblem, and eventually whatever
// the desktop packager derives from it. It is NOT start-menu art: the same
// image is the app icon in the OS, so it belongs to the product rather than to
// one screen's composition, and it must not appear in the Start Menu
// Background or Title Image pickers.
//
// A THIRD root rather than a wider one: broadening START_MENU_ROOT would let a
// background be chosen from here and an icon from there, which is exactly the
// ownership blur this separation exists to prevent. The Start Menu ICON field
// is the only consumer.
//
// Extensions are deliberately the same raster allow-list. SVG stays out: it is
// refused by construction here, not by a special case (see the Start Menu Icon
// audit — a dimensionless SVG also breaks the icon's natural-size scale rule).
export const APP_ICON_ROOT = "assets/app-icons/";

export function sanitizeAppIconPath(value) {
  return sanitizeProjectAssetPath(value, {
    root: APP_ICON_ROOT,
    extensions: BACKGROUND_EXTENSIONS,
  });
}
