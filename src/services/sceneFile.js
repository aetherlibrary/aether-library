// ALS — Aether Library Scene, format v1.
//
// A Scene is the complete saved state of one map. Until now it was split
// across three files and three services (data/scene-layout.json,
// assets/scenes/<id>.json, assets/scenes/<id>.ui.json); an .als is the single
// document that holds all of it, and it lives wherever the author wants —
// outside the repository.
//
// WHAT IS DELIBERATELY NOT IN IT: config/app-shell.json (the Start Menu
// background — application shell, shown before any Scene exists),
// config/product.json, API keys, Archives, the Vault, and the Tutorial/Learn
// documents themselves. Only the Scene's SELECTION of a tutorial id travels.
// See docs/als-scene-file-v1.md.
//
// NO NEW SANITIZERS. Every section is validated by the service that already
// owns it — sanitizeLayout, sanitizeSceneConfig, sanitizeSceneContent. This
// module composes them and owns only the envelope, the asset audit, and the
// atomic write.
//
// DEV-ONLY: every route that reaches this module is registered inside
// server.js's config.devTools gate. A production run has no Scene authoring.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeLayout, loadSceneLayout } from "./sceneLayout.js";
import { sanitizeSceneConfig, loadSceneConfig } from "./sceneConfig.js";
import { sanitizeSceneContent, loadSceneContent } from "./sceneContent.js";
import { sanitizeBackgroundPath } from "./assetPaths.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const ALS_FORMAT = "aether-library-scene";
export const ALS_VERSION = 1;
export const ALS_EXTENSION = ".als";

function sceneFileError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// --------------------------------------------------------------- the path
// An .als lives OUTSIDE the project, so unlike every other path in this
// codebase it is legitimately absolute. It is still constrained: it must be
// absolute (a relative path would resolve against the server's cwd, which the
// author cannot see), and it must end in .als so this tool can never be
// pointed at an arbitrary file to read or overwrite.
export function validateScenePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw sceneFileError(400, "A scene file path is required.");
  if (raw.includes("\0")) throw sceneFileError(400, "Invalid scene file path.");
  const normalized = path.normalize(raw);
  if (!path.isAbsolute(normalized)) {
    throw sceneFileError(400, "A scene file path must be absolute.");
  }
  if (path.extname(normalized).toLowerCase() !== ALS_EXTENSION) {
    throw sceneFileError(400, `A scene file must end in ${ALS_EXTENSION}.`);
  }
  return normalized;
}

// ------------------------------------------------------------- the envelope
// Checked BEFORE anything is sanitized or applied, so a wrong-format or
// future-version file is rejected outright rather than partially understood.
export function validateEnvelope(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw sceneFileError(400, "That file is not an Aether Library Scene.");
  }
  if (raw.format !== ALS_FORMAT) {
    throw sceneFileError(400, `That file is not an Aether Library Scene (format: ${String(raw.format).slice(0, 40)}).`);
  }
  const version = raw.version;
  if (!Number.isInteger(version) || version < 1) {
    throw sceneFileError(400, "That scene file has no valid version.");
  }
  // A NEWER format cannot be safely sanitized: the allowlist below would drop
  // whatever it does not recognise, silently discarding the author's work. So
  // it is rejected explicitly rather than partially loaded.
  if (version > ALS_VERSION) {
    throw sceneFileError(
      400,
      `That scene was saved by a newer version of Aether Library (scene format v${version}, this build understands v${ALS_VERSION}).`
    );
  }
  return version;
}

// ------------------------------------------------------------- the document
// Composed from the existing sanitizers. Unknown keys vanish by construction
// (every one of them builds its result from a known field list) — v1 does NOT
// round-trip unknown fields, which is why validateEnvelope rejects a newer
// version outright instead of relying on this.
export function sanitizeSceneDocument(raw) {
  const scene = raw?.scene && typeof raw.scene === "object" ? raw.scene : {};
  const layout = sanitizeLayout({
    objects: scene.objects,
    zones: scene.zones,
    characterSlots: scene.characterSlots,
    characterRoles: scene.characterRoles,
    sceneMeta: scene.meta,
    world: scene.world,
    lights: scene.lights,
    lightBlockers: scene.lightBlockers,
  });
  const props = sanitizeSceneConfig({ objects: scene.props });
  const content = sanitizeSceneContent(scene.content ? { content: scene.content } : null);
  return {
    format: ALS_FORMAT,
    version: ALS_VERSION,
    scene: {
      meta: layout.sceneMeta,
      objects: layout.objects,
      props: props.objects,
      zones: layout.zones,
      characterSlots: layout.characterSlots,
      characterRoles: layout.characterRoles,
      world: layout.world,
      lights: layout.lights,
      lightBlockers: layout.lightBlockers,
      content: content.content,
    },
  };
}

// ------------------------------------------------------------ asset audit
// Which referenced assets are actually on disk. A MISSING asset is reported,
// never fatal and never silently cleared: the author's reference survives so a
// temporarily-unavailable drive cannot erase their work.
//
// Only project-relative references are audited — by the time a value reaches
// here it has already been through its own sanitizer, so anything that was not
// a valid project asset path is already "".
export async function auditSceneAssets(doc) {
  const refs = new Set();
  const background = sanitizeBackgroundPath(doc?.scene?.meta?.background);
  if (background) refs.add(background);
  for (const prop of doc?.scene?.props || []) {
    if (typeof prop?.assetPath === "string" && prop.assetPath.startsWith("assets/")) refs.add(prop.assetPath);
  }
  for (const obj of doc?.scene?.objects || []) {
    if (typeof obj?.assetPath === "string" && obj.assetPath.startsWith("assets/")) refs.add(obj.assetPath);
  }
  const missing = [];
  for (const ref of refs) {
    try {
      const stat = await fs.stat(path.join(projectRoot, ref));
      if (!stat.isFile()) missing.push(ref);
    } catch {
      missing.push(ref);
    }
  }
  return { checked: refs.size, missing: missing.sort() };
}

// ------------------------------------------------------------ atomic write
// temp → re-read and re-parse → rename. A failure at any step leaves the
// previous .als byte-identical, which is the whole point: an interrupted save
// must never destroy the author's last good Scene.
//
// The temp file is created in the TARGET's own directory so the rename is a
// same-volume operation (a cross-device rename would fall back to copy, which
// is not atomic).
export async function writeSceneFile(targetPath, doc) {
  const target = validateScenePath(targetPath);
  const clean = sanitizeSceneDocument(doc);
  const serialized = `${JSON.stringify(clean, null, 2)}\n`;
  const dir = path.dirname(target);
  const temp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);

  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    throw sceneFileError(400, `Could not create that folder: ${err.message}`);
  }

  try {
    await fs.writeFile(temp, serialized, "utf8");
    // Validate what actually landed on disk, not what we meant to write.
    const verify = JSON.parse(await fs.readFile(temp, "utf8"));
    validateEnvelope(verify);
    if (!verify?.scene) throw sceneFileError(500, "The written scene file is incomplete.");
    await fs.rename(temp, target);
  } catch (err) {
    await fs.rm(temp, { force: true }).catch(() => {});
    if (err.status) throw err;
    throw sceneFileError(500, `Could not save the scene: ${err.message}`);
  }
  return { path: target, document: clean };
}

// ------------------------------------------------------------- read + load
export async function readSceneFile(targetPath) {
  const target = validateScenePath(targetPath);
  let text;
  try {
    text = await fs.readFile(target, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw sceneFileError(404, "That scene file does not exist.");
    if (err.code === "EACCES" || err.code === "EPERM") throw sceneFileError(403, "Permission denied reading that scene file.");
    throw sceneFileError(500, err.message);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw sceneFileError(400, `That scene file is not valid JSON: ${err.message}`);
  }
  // Envelope FIRST: nothing is sanitized, and no caller mutates any runtime
  // state, until the format and version are known to be understood.
  validateEnvelope(raw);
  const document = sanitizeSceneDocument(raw);
  const assets = await auditSceneAssets(document);
  return { path: target, document, assets };
}

// --------------------------------------------------------------- new scene
// A blank Scene: no background (the author picks one later through Map), no
// objects, no props, no zones. Everything else is the shipped default, which
// is what the existing sanitizers already produce for absent input.
export function blankSceneDocument() {
  return sanitizeSceneDocument({ scene: { meta: { background: "" } } });
}

// -------------------------------------------------------------- export path
// Builds an ALS from the project's CURRENT split runtime files, so the
// existing Classic Scene can become a .als without losing anything. This is
// the one-time migration bridge named in the plan; it reads only, and writes
// nothing.
export async function exportCurrentSceneDocument() {
  const [layout, config, content] = await Promise.all([
    loadSceneLayout(),
    loadSceneConfig(),
    loadSceneContent(),
  ]);
  return sanitizeSceneDocument({
    format: ALS_FORMAT,
    version: ALS_VERSION,
    scene: {
      meta: layout.sceneMeta,
      objects: layout.objects,
      props: config.objects,
      zones: layout.zones,
      characterSlots: layout.characterSlots,
      characterRoles: layout.characterRoles,
      world: layout.world,
      lights: layout.lights,
      lightBlockers: layout.lightBlockers,
      content: content.content,
    },
  });
}

// ------------------------------------------------------- document → runtime
// The exact INVERSE of exportCurrentSceneDocument above: it splits one ALS back
// into the three runtime sections the server already serves (layout, props
// config, content selection), so a Default Scene can be rendered by the normal
// runtime path instead of a second partial loader.
//
// Composition only, same as its inverse — every section goes through the
// sanitizer that already owns it, and no new validation lives here.
export function sceneDocumentToRuntime(doc) {
  const s = doc?.scene || {};
  const layout = sanitizeLayout({
    objects: s.objects,
    zones: s.zones,
    characterSlots: s.characterSlots,
    characterRoles: s.characterRoles,
    sceneMeta: s.meta,
    world: s.world,
    lights: s.lights,
    lightBlockers: s.lightBlockers,
  });
  // sceneId keeps the runtime's own naming (the ALS does not carry one); the
  // props themselves are the Scene's.
  const config = sanitizeSceneConfig({ objects: s.props });
  const content = sanitizeSceneContent(s.content ? { content: s.content } : null);
  return { layout, config, content };
}

// ----------------------------------------------------------- recent scenes
// DEV-ONLY authoring preference. Lives in data/ (gitignored) and is never part
// of publicConfig() or any always-on route, so no recent path can reach a
// production client.
export const AUTHORING_PATH = process.env.AUTHORING_CONFIG_PATH
  ? path.resolve(process.env.AUTHORING_CONFIG_PATH)
  : path.join(projectRoot, "data", "authoring.json");

const MAX_RECENT = 10;

export async function loadRecentScenes() {
  try {
    const raw = JSON.parse(await fs.readFile(AUTHORING_PATH, "utf8"));
    const list = Array.isArray(raw?.recentScenes) ? raw.recentScenes : [];
    const out = [];
    for (const entry of list) {
      if (typeof entry !== "string") continue;
      try {
        out.push(validateScenePath(entry));
      } catch {
        /* a malformed remembered path is simply forgotten */
      }
      if (out.length >= MAX_RECENT) break;
    }
    return [...new Set(out)];
  } catch {
    return [];
  }
}

// Most-recent-first, de-duplicated, capped. Never throws: failing to remember
// a path must not fail the save that triggered it.
export async function rememberRecentScene(targetPath) {
  let target;
  try {
    target = validateScenePath(targetPath);
  } catch {
    return await loadRecentScenes();
  }
  const existing = await loadRecentScenes();
  const next = [target, ...existing.filter((p) => p !== target)].slice(0, MAX_RECENT);
  try {
    await fs.mkdir(path.dirname(AUTHORING_PATH), { recursive: true });
    await fs.writeFile(AUTHORING_PATH, `${JSON.stringify({ recentScenes: next }, null, 2)}\n`, "utf8");
  } catch {
    /* authoring convenience only — never fatal */
  }
  return next;
}

export async function forgetRecentScene(targetPath) {
  const existing = await loadRecentScenes();
  const next = existing.filter((p) => p !== path.normalize(String(targetPath || "")));
  try {
    await fs.mkdir(path.dirname(AUTHORING_PATH), { recursive: true });
    await fs.writeFile(AUTHORING_PATH, `${JSON.stringify({ recentScenes: next }, null, 2)}\n`, "utf8");
  } catch {
    /* ignore */
  }
  return next;
}

// Each remembered path plus whether it is still there, so the picker can mark
// an unavailable entry instead of offering a dead link.
export async function listRecentScenes() {
  const paths = await loadRecentScenes();
  return Promise.all(
    paths.map(async (p) => {
      let available = false;
      try {
        available = (await fs.stat(p)).isFile();
      } catch {
        available = false;
      }
      return { path: p, name: path.basename(p), available };
    })
  );
}
