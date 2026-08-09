// Content Resources — documentation content the product renders: the
// onboarding Tutorial and the Learn / User Guide.
//
// These are RESOURCES, not authored-in-app data. Each one is a JSON file
// edited by hand under an approved root, selected by a short id. There is no
// visual editor, no preset layer and no save route: the resource file IS the
// reusable unit, so a second indirection would only duplicate it.
//
//   assets/content/tutorial/<id>.json
//   assets/content/learn/<id>.json
//
// Only an ID ever crosses a boundary — never a path. Ids are validated
// against ^[a-z0-9][a-z0-9_-]{0,63}$ and resolved strictly inside their
// approved root, so no absolute path, Windows/macOS path, traversal segment
// or file: URL can reach the filesystem through this module.
//
// Ownership (see the refactor's §D/§I):
//   Learn     — GLOBAL product documentation. Does not vary by Scene/World.
//   Tutorial  — selected per Scene, by id only.
// Neither can influence the product's official links, which live in
// services/productConfig.js and are never reachable from here.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeProjectAssetPath } from "./assetPaths.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The ONLY directories a resource id may resolve into. Overridable for tests
// so nothing here ever touches real project content.
const CONTENT_ROOT = process.env.CONTENT_ROOT
  ? path.resolve(process.env.CONTENT_ROOT)
  : path.join(projectRoot, "assets", "content");

export const RESOURCE_KINDS = ["tutorial", "learn"];
export const DEFAULT_RESOURCE_ID = "default";

// One conservative rule, shared by every resource kind.
const RESOURCE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidResourceId(id) {
  return typeof id === "string" && RESOURCE_ID_RE.test(id);
}

function contentError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function rootFor(kind) {
  if (!RESOURCE_KINDS.includes(kind)) throw contentError(400, `Unknown content kind: ${String(kind).slice(0, 32)}`);
  return path.join(CONTENT_ROOT, kind);
}

// Resolves an id to a real path, or throws. Safe by construction (the id
// regex admits no separators) and re-checked afterwards, so a future regex
// change cannot silently permit an escape.
export function resourcePath(kind, id) {
  const root = rootFor(kind);
  if (!isValidResourceId(id)) throw contentError(400, `Invalid resource id: ${String(id).slice(0, 40)}`);
  const full = path.join(root, `${id}.json`);
  if (path.dirname(full) !== root) throw contentError(400, "Invalid resource id.");
  return full;
}

// The PROJECT-RELATIVE location of a resource — what the F8 Content panel
// shows and copies. Never an absolute machine path.
export function relativeResourcePath(kind, id) {
  resourcePath(kind, id); // validates kind + id, throws on anything unsafe
  // Built from the validated parts rather than derived from the absolute
  // path, so this is ALWAYS the stable project-relative form and can never
  // leak a machine path — including when CONTENT_ROOT is overridden to
  // somewhere outside the project (as tests do).
  return `assets/content/${kind}/${id}.json`;
}

// Every valid resource of a kind. A file whose name is not a valid id, or
// whose contents are not parseable JSON, is skipped rather than offered.
export async function listResources(kind) {
  let entries;
  try {
    entries = await fs.readdir(rootFor(kind));
  } catch {
    return [];
  }
  const out = [];
  for (const file of entries.sort()) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -".json".length);
    if (!isValidResourceId(id)) continue;
    try {
      JSON.parse(await fs.readFile(resourcePath(kind, id), "utf8"));
      out.push({ id, path: relativeResourcePath(kind, id) });
    } catch {
      /* unparseable — never offered as a selectable resource */
    }
  }
  return out;
}

// Raw parsed JSON for a resource, or null. Callers sanitize per kind.
async function readResource(kind, id) {
  try {
    return JSON.parse(await fs.readFile(resourcePath(kind, id), "utf8"));
  } catch {
    return null;
  }
}

// ============================================================== TUTORIAL
// The schema is unchanged from the embedded version: fixed step set, fixed
// order, safe target ids, optional approved-root preview image.

export const TUTORIAL_STEP_IDS = [
  "settings",
  "ai-config",
  "vault",
  "core-object",
  "mode",
  "scholars",
  "attachments",
  "composer",
  "discussion-workspace",
  "save-to-vault",
  "privacy-more",
];

export const TUTORIAL_TARGET_IDS = [
  "",
  "settings",
  "ai-config",
  "vault",
  "core-object",
  "mode",
  "scholars",
  "attachments",
  "composer",
  "discussion-workspace",
  "save-to-vault",
  "privacy-more",
];

const DEFAULT_STEP_TARGETS = {
  settings: "settings",
  "ai-config": "ai-config",
  vault: "vault",
  "core-object": "core-object",
  mode: "mode",
  scholars: "scholars",
  attachments: "attachments",
  composer: "composer",
  "discussion-workspace": "discussion-workspace",
  "save-to-vault": "save-to-vault",
  "privacy-more": "", // closing note: centred by design
};

const TUTORIAL_IMAGE_DIR = "assets/tutorial/";
const TUTORIAL_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const CONTENT_LOCALES = ["en", "zh-TW"];
const FALLBACK_LOCALE = "en";
const MAX_TEXT = 400;
const MAX_BODY = 2000;

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

// Tutorial bodies keep their line breaks (rendered with white-space:
// pre-line, never as markup).
function cleanMultiline(value, max = MAX_BODY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanLocalized(value, max = MAX_TEXT, { multiline = false } = {}) {
  const out = {};
  for (const locale of CONTENT_LOCALES) {
    out[locale] = multiline ? cleanMultiline(value?.[locale], max) : cleanText(value?.[locale], max);
  }
  // Preserve any additional locale the resource declares.
  if (value && typeof value === "object") {
    for (const [locale, text] of Object.entries(value)) {
      const key = cleanText(locale, 32);
      if (!key || key in out) continue;
      const cleaned = multiline ? cleanMultiline(text, max) : cleanText(text, max);
      if (cleaned) out[key] = cleaned;
    }
  }
  return out;
}

// Preview images: a project-relative path inside assets/tutorial/ only. Never
// a URL, never absolute, never traversal, never SVG.
//
// The rules themselves now live in services/assetPaths.js, shared with Scene
// backgrounds — this is the SAME logic that used to be inlined here, moved
// rather than reimplemented, so Tutorial behaviour is unchanged. The root and
// the extension allow-list stay here because they are this schema's own policy.
export function sanitizeTutorialImage(value) {
  return sanitizeProjectAssetPath(value, {
    root: TUTORIAL_IMAGE_DIR,
    extensions: TUTORIAL_IMAGE_EXT,
  });
}

export function defaultTutorial() {
  return {
    version: 2,
    id: DEFAULT_RESOURCE_ID,
    steps: TUTORIAL_STEP_IDS.map((id) => ({
      id,
      target: DEFAULT_STEP_TARGETS[id] ?? "",
      enabled: true,
      title: { en: "", "zh-TW": "" },
      body: { en: "", "zh-TW": "" },
      previewImage: "",
    })),
  };
}

// Driven by TUTORIAL_STEP_IDS, never by the input: unknown steps vanish,
// duplicates collapse to the first, missing steps default, order is fixed.
export function sanitizeTutorial(raw, id = DEFAULT_RESOURCE_ID) {
  const authored = Array.isArray(raw?.steps) ? raw.steps : [];
  const byId = new Map();
  for (const step of authored) {
    if (!step || typeof step !== "object") continue;
    const stepId = cleanText(step.id, 64);
    if (TUTORIAL_STEP_IDS.includes(stepId) && !byId.has(stepId)) byId.set(stepId, step);
  }
  const steps = TUTORIAL_STEP_IDS.map((stepId) => {
    const step = byId.get(stepId) || {};
    return {
      id: stepId,
      target: TUTORIAL_TARGET_IDS.includes(step.target) ? step.target : DEFAULT_STEP_TARGETS[stepId] ?? "",
      enabled: step.enabled !== false,
      title: cleanLocalized(step.title),
      body: cleanLocalized(step.body, MAX_BODY, { multiline: true }),
      previewImage: sanitizeTutorialImage(step.previewImage),
    };
  });
  // An all-disabled workflow is not a valid tutorial.
  if (!steps.some((s) => s.enabled)) return defaultTutorial();
  return { version: 2, id: isValidResourceId(id) ? id : DEFAULT_RESOURCE_ID, steps };
}

// A missing or unparseable resource falls back to the built-in default
// rather than leaving the product with no onboarding at all.
export async function loadTutorialResource(id = DEFAULT_RESOURCE_ID) {
  const resourceId = isValidResourceId(id) ? id : DEFAULT_RESOURCE_ID;
  const raw = await readResource("tutorial", resourceId);
  if (!raw) return { ...defaultTutorial(), id: resourceId, missing: true };
  return sanitizeTutorial(raw, resourceId);
}

// ================================================================= LEARN
// Structured sections rendered as plain text — same shape the existing
// renderer already consumes ({ id, title, blocks:[{type:"p"|"list"}] }).

const MAX_LEARN_TITLE = 200;
const MAX_LEARN_TEXT = 4000;
const MAX_SECTIONS = 60;
const MAX_BLOCKS = 60;
const MAX_ITEMS = 60;

function sanitizeLearnBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type === "list") {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .slice(0, MAX_ITEMS)
      .map((i) => cleanText(i, MAX_LEARN_TEXT))
      .filter(Boolean);
    return items.length ? { type: "list", items } : null;
  }
  const text = cleanText(raw.text, MAX_LEARN_TEXT);
  return text ? { type: "p", text } : null;
}

function sanitizeLearnSections(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_SECTIONS)
    .map((section) => {
      if (!section || typeof section !== "object") return null;
      const id = cleanText(section.id, 64).toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const title = cleanText(section.title, MAX_LEARN_TITLE);
      const blocks = (Array.isArray(section.blocks) ? section.blocks : [])
        .slice(0, MAX_BLOCKS)
        .map(sanitizeLearnBlock)
        .filter(Boolean);
      if (!id || !title || blocks.length === 0) return null;
      return { id, title, blocks };
    })
    .filter(Boolean);
}

// Locale-keyed, with an English fallback. Every locale the resource declares
// is carried through, so adding a language is a data change.
export function sanitizeLearn(raw, id = DEFAULT_RESOURCE_ID) {
  const locales = {};
  const input = raw?.locales && typeof raw.locales === "object" ? raw.locales : {};
  for (const [locale, sections] of Object.entries(input)) {
    const key = cleanText(locale, 32);
    if (!key) continue;
    const cleaned = sanitizeLearnSections(sections);
    if (cleaned.length) locales[key] = cleaned;
  }
  return { version: 1, id: isValidResourceId(id) ? id : DEFAULT_RESOURCE_ID, locales };
}

export async function loadLearnResource(id = DEFAULT_RESOURCE_ID) {
  const resourceId = isValidResourceId(id) ? id : DEFAULT_RESOURCE_ID;
  const raw = await readResource("learn", resourceId);
  if (!raw) return { version: 1, id: resourceId, locales: {}, missing: true };
  return sanitizeLearn(raw, resourceId);
}

// The sections for one interface locale, falling back to English and then to
// an empty list — never undefined, never a partial mix of two languages.
export function learnSectionsFor(resource, locale) {
  const locales = resource?.locales || {};
  if (Array.isArray(locales[locale]) && locales[locale].length) return locales[locale];
  if (Array.isArray(locales[FALLBACK_LOCALE])) return locales[FALLBACK_LOCALE];
  return [];
}
