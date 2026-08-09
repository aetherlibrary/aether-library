// Default Scene — which ALS the runtime loads on startup.
//
// THE GAP THIS CLOSES: an .als could be opened and edited, but opening one only
// rewrote BROWSER state (applySceneDocument in devtools/scene-editor.js writes
// nothing to the server). A refresh always returned to the three project files.
// The .als was a document format with no runtime.
//
// WHY THIS IS ITS OWN DOCUMENT — the full audit is in
// docs/default-scene-ownership.md; the short version:
//
//   NOT the ALS, the Scene Layout, the Scene Config or the World. A Scene
//   cannot own the pointer to which Scene loads: loading the Scene would
//   overwrite the setting that selected it.
//
//   NOT config/product.json — deliberately read-only at runtime, and that
//   boundary is worth more than a convenience field.
//
//   NOT config/app-shell.json. Closest candidate, still wrong: App Shell owns
//   what is shown BEFORE any Scene exists. Default Scene is which Scene exists
//   AFTER entry. docs/als-scene-file-v1.md exists to keep that line drawn.
//
//   NOT data/authoring.json (Recent Scenes) — dev-only, never read by a
//   production run. Default Scene MUST be readable in production.
//
// WHY data/ AND NOT config/: defaultScenePath is an absolute, machine-local
// path. config/ is tracked by git; committing "D:\Projects\als\..." would break
// every other machine. .gitignore already states this rule for
// .claude/settings.local.json. data/scene-layout.json is the precedent.
//
// This document stores A PATH AND NOTHING ELSE. Scene contents live in the ALS;
// copying any of them here would create a second source of truth that drifts.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSceneFile, sceneDocumentToRuntime, validateScenePath } from "./sceneFile.js";
import { loadSceneLayout } from "./sceneLayout.js";
import { loadSceneConfig } from "./sceneConfig.js";
import { loadSceneContent } from "./sceneContent.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable so tests and scratch smoke servers never touch the real file.
export const RUNTIME_SCENE_CONFIG_PATH = process.env.RUNTIME_SCENE_CONFIG_PATH
  ? path.resolve(process.env.RUNTIME_SCENE_CONFIG_PATH)
  : path.join(projectRoot, "data", "runtime-scene.json");

export const RUNTIME_SCENE_VERSION = 1;

export function defaultRuntimeSceneConfig() {
  return { version: RUNTIME_SCENE_VERSION, defaultScenePath: "" };
}

// Allowlist-driven like every other config sanitizer here: anything a caller
// tries to smuggle in (scene contents, a second path, ids) simply does not
// survive. An unusable path degrades to "" rather than throwing — a corrupt
// config must never prevent startup, it must only stop selecting a Scene.
export function sanitizeRuntimeSceneConfig(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  let defaultScenePath = "";
  try {
    defaultScenePath = validateScenePath(r.defaultScenePath);
  } catch {
    defaultScenePath = "";
  }
  return { version: RUNTIME_SCENE_VERSION, defaultScenePath };
}

export async function loadRuntimeSceneConfig() {
  try {
    return sanitizeRuntimeSceneConfig(JSON.parse(await fs.readFile(RUNTIME_SCENE_CONFIG_PATH, "utf8")));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("[runtime-scene] falling back to no Default Scene:", err.message);
    }
    return defaultRuntimeSceneConfig();
  }
}

async function writeRuntimeSceneConfig(clean) {
  await fs.mkdir(path.dirname(RUNTIME_SCENE_CONFIG_PATH), { recursive: true });
  await fs.writeFile(RUNTIME_SCENE_CONFIG_PATH, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
  return clean;
}

// DEV-ONLY (registered inside server.js's config.devTools gate).
//
// VALIDATE BEFORE STORING: the ALS is fully read, envelope-checked and
// version-gated by the existing readSceneFile() before the path is written, so
// a path that cannot produce a Scene never becomes the Default Scene. Callers
// get the parser's own error — wrong extension, missing file, bad JSON, or
// "saved by a newer version of Aether Library".
export async function setDefaultScene(rawPath) {
  const result = await readSceneFile(rawPath); // throws with .status on failure
  return await writeRuntimeSceneConfig({
    version: RUNTIME_SCENE_VERSION,
    defaultScenePath: result.path,
  });
}

// "No external Default Scene" — the runtime goes back to the project files.
// The ALS on disk is untouched; only the pointer is removed.
export async function clearDefaultScene() {
  return await writeRuntimeSceneConfig(defaultRuntimeSceneConfig());
}

// --------------------------------------------------------------- resolution
// THE one place that decides what the runtime's Scene is. Every route that
// serves Scene data reads through this, dev and production alike, so F8 and the
// shipping client can never disagree about which Scene is loaded.
//
// A configured-but-broken Default Scene NEVER breaks startup and is NEVER
// silently cleared: a temporarily-unavailable drive must not destroy the
// author's configuration. It falls back, warns once, and keeps the path so the
// author can repair or Clear it themselves.
export async function resolveRuntimeScene() {
  const settings = await loadRuntimeSceneConfig();
  const configuredPath = settings.defaultScenePath;

  if (configuredPath) {
    try {
      const { document } = await readSceneFile(configuredPath);
      const { layout, config, content } = sceneDocumentToRuntime(document);
      return {
        source: "default-scene",
        defaultScenePath: configuredPath,
        warning: "",
        layout,
        config,
        content,
      };
    } catch (err) {
      // One clear warning, then carry on with the existing runtime Scene.
      console.warn(`[runtime-scene] Default Scene unavailable (${configuredPath}): ${err.message}`);
      const fallback = await loadProjectRuntimeScene();
      return {
        ...fallback,
        defaultScenePath: configuredPath,
        warning: err.message,
      };
    }
  }

  return { ...(await loadProjectRuntimeScene()), defaultScenePath: "", warning: "" };
}

// The pre-existing runtime Scene: the three project files, exactly as they were
// served before Default Scene existed. This is the fallback in every failure
// path, so "no Default Scene" behaviour is unchanged by construction.
async function loadProjectRuntimeScene() {
  const [layout, config, content] = await Promise.all([
    loadSceneLayout(),
    loadSceneConfig(),
    loadSceneContent(),
  ]);
  return { source: "fallback", layout, config, content };
}

// What the F8 Default Scene panel shows. Dev-only — the absolute path is never
// exposed to a production client, which receives only resolved Scene data.
//
// `activeSource` is what makes the Current File coupling safe: the editor
// adopts the path as its authoring source ONLY when the runtime was actually
// loaded from it (see docs/default-scene-ownership.md §6).
export async function describeDefaultScene() {
  const resolved = await resolveRuntimeScene();
  return {
    path: resolved.defaultScenePath,
    name: resolved.defaultScenePath ? path.basename(resolved.defaultScenePath) : "",
    activeSource: resolved.source,
    warning: resolved.warning,
  };
}
