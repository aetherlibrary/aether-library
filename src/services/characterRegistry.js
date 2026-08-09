// Developer Character Registry — the data side of the dev-only Character
// Asset workflow. SEPARATE from the Prop Asset Registry (assetRegistry.js):
// characters and props are different asset kinds with their own registry
// files, so a future playable character or NPC never has to masquerade as a
// prop to get an identity. The two registries share only pure, stateless
// helpers (deriveAssetId, ASSET_ID_RE) imported from assetRegistry.js —
// scanning, matching, and persistence are independent, matching this
// codebase's existing convention of parallel systems staying self-contained
// rather than sharing a generic "asset" abstraction prematurely.
//
// The registry (assets/character_registry.json) is the single approved-
// character list: production builds load only packaged files and ship no
// scanning/registration capability (every route that calls this module
// lives behind config.devTools, same as the prop registry).
//
// Dev workflow: syncCharacterRegistry() scans assets/characters/ and
// auto-registers every PNG not yet present —
//   asset_uid  — immutable machine identity (generated once, persisted,
//                never regenerated; scene objects will reference THIS once
//                the runtime is wired to resolve characters dynamically),
//   asset_id   — editable human name, derived from the filename
//                (lowercase/digits/underscore, unique among characters),
//   filename / type ("character") / path.
// Matching is by normalized project-relative path (and uid), never by the
// editable asset_id — renaming an id can never cause a duplicate.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ASSET_ID_RE, deriveAssetId } from "./assetRegistry.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real registry/assets.
const REGISTRY_PATH = process.env.CHARACTER_REGISTRY_PATH
  ? path.resolve(process.env.CHARACTER_REGISTRY_PATH)
  : path.join(projectRoot, "assets", "character_registry.json");
const CHARACTERS_DIR = process.env.CHARACTER_ASSETS_DIR
  ? path.resolve(process.env.CHARACTER_ASSETS_DIR)
  : path.join(projectRoot, "assets", "characters");

function normalizeRelPath(p) {
  return String(p || "").split(path.sep).join("/").toLowerCase();
}

export async function loadCharacterRegistry() {
  try {
    const raw = JSON.parse(await fs.readFile(REGISTRY_PATH, "utf8"));
    return { version: 1, ...raw, assets: Array.isArray(raw.assets) ? raw.assets : [] };
  } catch (err) {
    if (err.code === "ENOENT") return { version: 1, assets: [] };
    throw err;
  }
}

async function saveRegistry(reg) {
  await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf8");
  return reg;
}

// Scans assets/characters/ for PNGs and registers anything new. Existing
// entries are matched by normalized path or uid and NEVER touched — uids
// are immutable, and a re-scan is always idempotent.
export async function syncCharacterRegistry() {
  const reg = await loadCharacterRegistry();
  const knownPaths = new Set(reg.assets.map((a) => normalizeRelPath(a.path)));
  const knownIds = new Set(reg.assets.map((a) => a.asset_id));
  const knownUids = new Set(reg.assets.map((a) => a.asset_uid));

  let files = [];
  try {
    files = (await fs.readdir(CHARACTERS_DIR)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  } catch {
    return reg; // no characters dir — nothing to scan
  }

  let changed = false;
  for (const file of files) {
    const relPath = `assets/characters/${file}`;
    if (knownPaths.has(normalizeRelPath(relPath))) continue;

    // Unique editable id from the filename (suffix on collision).
    let id = deriveAssetId(file);
    let n = 2;
    while (knownIds.has(id)) id = `${deriveAssetId(file)}_${n++}`;

    // Immutable uid: generated once here, persisted forever.
    let uid;
    do {
      uid = `char_${id}_${crypto.randomBytes(3).toString("hex")}`;
    } while (knownUids.has(uid));

    reg.assets.push({ asset_uid: uid, asset_id: id, filename: file, type: "character", path: relPath });
    knownPaths.add(normalizeRelPath(relPath));
    knownIds.add(id);
    knownUids.add(uid);
    changed = true;
  }

  if (changed) await saveRegistry(reg);
  return reg;
}

// Renames the EDITABLE asset_id of one character. The uid never changes, so
// scene files that reference it are unaffected.
export async function updateCharacterId(assetUid, newId) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (typeof newId !== "string" || !newId) throw err(400, "Character ID cannot be empty.");
  if (!ASSET_ID_RE.test(newId)) throw err(400, "Character ID may contain only lowercase letters, numbers, and underscores.");

  const reg = await loadCharacterRegistry();
  const asset = reg.assets.find((a) => a.asset_uid === assetUid);
  if (!asset) throw err(404, `No character with uid ${assetUid}.`);
  if (reg.assets.some((a) => a.asset_uid !== assetUid && a.asset_id === newId)) {
    throw err(409, `Character ID "${newId}" is already in use.`);
  }
  asset.asset_id = newId;
  await saveRegistry(reg);
  return asset;
}
