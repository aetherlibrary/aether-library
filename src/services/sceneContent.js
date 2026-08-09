// Scene Content — what a Scene REMEMBERS about content, which is now only a
// resource id.
//
// This file used to own About text, outbound links and an embedded Tutorial.
// All three moved out, because none of them belonged to a Scene:
//
//   About text / official links -> services/productConfig.js  (global, and a
//        SECURITY boundary: loading a Scene must never repoint an official
//        link)
//   Tutorial steps              -> assets/content/tutorial/<id>.json, selected
//        here by id only
//   Learn guide                 -> assets/content/learn/<id>.json, global
//
// What remains is a reference, nothing more:
//
//   { version: 3, sceneId, content: { tutorial: "default" } }
//
// Only an ID is stored — never a path — so a Scene file can never point the
// runtime at an arbitrary location on disk.
//
// Backward compatibility: a v1/v2 file (About, links, fixedLinks, embedded
// tutorial, presetSource) still LOADS. Its obsolete fields are ignored rather
// than republished, and the authored data is left untouched on disk until the
// next save, so nothing is destroyed silently — see the migration note in
// loadSceneContent().

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidResourceId, DEFAULT_RESOURCE_ID } from "./contentResources.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// FILE NAME NOTE: this is still `<scene>.ui.json`, from when the file owned
// the whole Scene UI (About, links, tutorial). It now holds only content
// REFERENCES, so the name is historical.
//
// It is deliberately NOT renamed: this service is its only reader and writer,
// but every existing install has the file at this path, so a rename would
// need a migration (read old path -> write new -> handle both for a while)
// to buy nothing the product can see. Renaming for tidiness alone would add
// migration risk with no user-visible benefit. Revisit only if the file ever
// gains a genuinely different role.
const SCENE_CONTENT_PATH = process.env.SCENE_UI_PATH
  ? path.resolve(process.env.SCENE_UI_PATH)
  : path.join(projectRoot, "assets", "scenes", "classic_library.ui.json");

export const SCENE_CONTENT_VERSION = 3;
export const DEFAULT_SCENE_ID = "classic_library";

// The content kinds a SCENE may select. Learn is deliberately absent: it is
// global product documentation and never varies by Scene.
export const SCENE_CONTENT_KINDS = ["tutorial"];

export function defaultSceneContent() {
  return {
    version: SCENE_CONTENT_VERSION,
    sceneId: DEFAULT_SCENE_ID,
    content: { tutorial: DEFAULT_RESOURCE_ID },
  };
}

function cleanId(value, max = 64) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);
}

// Normalizes any input — including a legacy v1/v2 document — into the current
// shape. Every obsolete field is dropped by construction: nothing is spread,
// only `sceneId` and the content references are read.
export function sanitizeSceneContent(raw) {
  const base = defaultSceneContent();
  const input = raw && typeof raw === "object" ? raw : {};
  const sceneId = cleanId(input.sceneId).replace(/[^A-Za-z0-9_-]/g, "");

  const content = {};
  for (const kind of SCENE_CONTENT_KINDS) {
    const authored = cleanId(input.content?.[kind]);
    // An invalid or absent id resolves to the default resource — a Scene can
    // never point at something outside the approved content root.
    content[kind] = isValidResourceId(authored) ? authored : DEFAULT_RESOURCE_ID;
  }

  return {
    version: SCENE_CONTENT_VERSION,
    sceneId: sceneId || base.sceneId,
    content,
  };
}

// LEGACY MIGRATION READER — the only remaining code that knows the old field
// names exist. It never reads their VALUES: it just detects them so load()
// can log once. They are not republished by sanitizeSceneContent() (which
// reads only sceneId + content) and never written by saveSceneContent(), so
// the obsolete data cannot leak into a runtime payload or a fresh save.
//
// Keep this until old scene files are no longer plausible in the wild; the
// cost is one `some()` over five string keys.
export function hasLegacyFields(raw) {
  if (!raw || typeof raw !== "object") return false;
  return ["about", "links", "fixedLinks", "tutorial", "presetSource"].some((key) => key in raw);
}

export async function loadSceneContent() {
  let text;
  try {
    text = await fs.readFile(SCENE_CONTENT_PATH, "utf8");
  } catch {
    return defaultSceneContent();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error("[scene-content] file is not valid JSON — using defaults:", err.message);
    return defaultSceneContent();
  }
  if (hasLegacyFields(parsed)) {
    // NOT destroyed: the obsolete values stay in the file until something
    // saves over them, and the developer is told where they went.
    console.log(
      "[scene-content] this scene file still contains pre-refactor fields (about/links/fixedLinks/tutorial). " +
        "They are ignored: About and official links now live in config/product.json, and the Tutorial is a " +
        "content resource under assets/content/tutorial/. The old values are left in the file untouched."
    );
  }
  return sanitizeSceneContent(parsed);
}

export async function saveSceneContent(raw) {
  const content = sanitizeSceneContent(raw);
  await fs.mkdir(path.dirname(SCENE_CONTENT_PATH), { recursive: true });
  await fs.writeFile(SCENE_CONTENT_PATH, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return content;
}

// What the SHIPPING app may see: the resource ids it should load. No paths,
// no legacy fields, no preset bookkeeping.
export function runtimeSceneContent(content) {
  const c = sanitizeSceneContent(content);
  return { version: c.version, sceneId: c.sceneId, content: c.content };
}
