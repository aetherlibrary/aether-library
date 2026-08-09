// Product Configuration — the application's OWN identity and official links.
//
// These belong to the product, not to a Scene and not to a World:
//
//   website · feedback · github · discord · support · copyright · description
//
// They exist exactly once for the application. That is a SECURITY boundary,
// not just tidiness: if official links lived in Scene or World data, loading
// someone else's Scene (or a shared preset) could silently repoint "Official
// Website" or "Support" at an attacker's URL. Scene and World data can never
// influence these values — nothing here is authored through F8, nothing here
// travels in a preset, and no Scene/World field is consulted.
//
// This file is edited MANUALLY. F8 exposes only its location and a Reload
// action; there is deliberately no editor UI, so there is no write path from
// the running application into the product's own identity.
//
// The app VERSION is deliberately absent: it comes from package.json via
// config.js's appVersion and must never have a second, editable source.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests, same convention as every other service here.
export const PRODUCT_CONFIG_PATH = process.env.PRODUCT_CONFIG_PATH
  ? path.resolve(process.env.PRODUCT_CONFIG_PATH)
  : path.join(projectRoot, "config", "product.json");

export const PRODUCT_CONFIG_VERSION = 1;

// The official outbound destinations, in MORE's own order. Each maps to
// exactly one MORE entry (see PRODUCT_LINK_FOR_MENU in public/app.js) — there
// is one map, in one direction, and About reads only `website` from it.
export const PRODUCT_LINK_KEYS = ["website", "feedback", "github", "discord", "support"];

// `feedback` inherits the mailto allowance the old `contact` field had, so a
// legacy mailto: address keeps working after migration. An HTTPS form (Google
// Forms is the expected normal case) is the ordinary value.
const MAILTO_LINK_KEYS = new Set(["feedback"]);

// LEGACY. `contact` was the old name for what is now `feedback`. It is read
// ONLY when `feedback` is absent or empty, so a file that carries both is
// unambiguous: the preferred field wins. Nothing is written back — the file
// is never modified during load (see loadProductConfig), so an older config
// keeps working untouched until it is edited by hand.
const LEGACY_LINK_ALIASES = { feedback: "contact" };

const MAX_URL = 2048;
const MAX_TEXT = 400;
const MAX_DESCRIPTION = 2000;

// Same conservative resource-id rule contentResources.js uses.
const LEARN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanLocalized(value, max = MAX_TEXT) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [locale, text] of Object.entries(value)) {
    const cleanedLocale = cleanText(locale, 32);
    const cleanedText = cleanText(text, max);
    if (cleanedLocale && cleanedText) out[cleanedLocale] = cleanedText;
  }
  return out;
}

// Same URL rule the rest of the app uses: https/http always, mailto only for
// a contact address. Anything else — javascript:, data:, file:, a relative
// path, malformed input — resolves to "" and is treated as unconfigured.
export function sanitizeProductUrl(value, { allowMailto = false } = {}) {
  const raw = typeof value === "string" ? value.trim().slice(0, MAX_URL) : "";
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.hostname ? raw : "";
  if (allowMailto && parsed.protocol === "mailto:") {
    return /^mailto:[^\s@]+@[^\s@]+$/i.test(raw) ? raw : "";
  }
  return "";
}

// Every link empty by default: the product never invents a plausible-looking
// address, exactly as the original appLinks.js note insisted.
export function defaultProductConfig() {
  return {
    version: PRODUCT_CONFIG_VERSION,
    links: Object.fromEntries(PRODUCT_LINK_KEYS.map((key) => [key, ""])),
    copyright: "© 2026 Kaz Chang. All rights reserved.",
    description: {},
    // The GLOBAL Learn guide resource id. Learn is product documentation: it
    // never varies by Scene or World, so its single reference lives here.
    learn: "default",
  };
}

// Normalizes any input into the exact shape. Driven by PRODUCT_LINK_KEYS, so
// an unknown key can never introduce a link the UI would then offer.
export function sanitizeProductConfig(raw) {
  const base = defaultProductConfig();
  const input = raw && typeof raw === "object" ? raw : {};
  return {
    version: PRODUCT_CONFIG_VERSION,
    links: Object.fromEntries(
      PRODUCT_LINK_KEYS.map((key) => {
        const alias = LEGACY_LINK_ALIASES[key];
        // The preferred field first; the legacy name only when it yields
        // nothing. Sanitized either way, so a legacy value gets no special
        // trust.
        const preferred = sanitizeProductUrl(input.links?.[key], { allowMailto: MAILTO_LINK_KEYS.has(key) });
        if (preferred || !alias) return [key, preferred];
        return [key, sanitizeProductUrl(input.links?.[alias], { allowMailto: MAILTO_LINK_KEYS.has(key) })];
      })
    ),
    copyright: cleanText(input.copyright) || base.copyright,
    // Localized, but the locale set is NOT hardcoded — whatever the file
    // declares is carried through, so a new language needs no code change.
    description: cleanLocalized(input.description, MAX_DESCRIPTION),
    // An id only, never a path. An invalid value falls back to "default"
    // rather than pointing the runtime somewhere unapproved.
    learn: LEARN_ID_RE.test(String(input.learn || "")) ? input.learn : base.learn,
  };
}

// A missing file is the normal state before anything is configured; malformed
// JSON is logged and also falls back, so a bad manual edit cannot stop the
// application from starting.
export async function loadProductConfig() {
  let text;
  try {
    text = await fs.readFile(PRODUCT_CONFIG_PATH, "utf8");
  } catch {
    return defaultProductConfig();
  }
  try {
    return sanitizeProductConfig(JSON.parse(text));
  } catch (err) {
    console.error("[product] config is not valid JSON — using defaults:", err.message);
    return defaultProductConfig();
  }
}

// There is intentionally NO save function. The product's identity is edited
// by hand; the running application has no write path to it.

// What the client may see. `configured` mirrors the old appLinkStatus() shape
// so existing consumers keep working, and an unconfigured entry carries no
// URL at all.
export function runtimeProduct(product) {
  const p = sanitizeProductConfig(product);
  return {
    links: Object.fromEntries(
      PRODUCT_LINK_KEYS.map((key) => [key, { url: p.links[key], configured: Boolean(p.links[key]) }])
    ),
    copyright: p.copyright,
    description: p.description,
    learn: p.learn,
  };
}
