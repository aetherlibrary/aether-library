// Developer Asset Registry — the data side of the dev-only asset workflow.
//
// The registry (assets/asset_registry.json) is the single approved-asset
// list: production builds load ONLY this packaged file and ship no scanning,
// registration, or editing capability (every route that calls this module
// lives behind config.devTools, which is hard-off under NODE_ENV=production).
// Keeping registration isolated here is what lets future Marketplace
// packages add manifest + signature verification without redesign: a signed
// package would simply become another *approved* source feeding this same
// registry, while arbitrary user files remain locked out.
//
// Dev workflow: syncAssetRegistry() scans assets/props/ and auto-registers
// every PNG not yet present —
//   asset_uid  — immutable machine identity (generated once, persisted,
//                never regenerated; scene files reference THIS),
//   asset_id   — editable human name, derived from the filename
//                (lowercase/digits/underscore, unique),
//   filename / type / path.
// Matching is by normalized project-relative path (and uid), never by the
// editable asset_id — renaming an id can never cause a duplicate.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real registry/assets.
const REGISTRY_PATH = process.env.ASSET_REGISTRY_PATH
  ? path.resolve(process.env.ASSET_REGISTRY_PATH)
  : path.join(projectRoot, "assets", "asset_registry.json");
const PROPS_DIR = process.env.ASSET_PROPS_DIR
  ? path.resolve(process.env.ASSET_PROPS_DIR)
  : path.join(projectRoot, "assets", "props");

export const ASSET_ID_RE = /^[a-z0-9_]+$/;

function normalizeRelPath(p) {
  return String(p || "").split(path.sep).join("/").toLowerCase();
}

// "Record Player-v2.PNG" → "record_player_v2"
export function deriveAssetId(filename) {
  const stem = filename.replace(/\.[^.]+$/, "");
  const id = stem
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || "asset";
}

export async function loadAssetRegistry() {
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

// Scans assets/props/ for PNGs and registers anything new. Existing entries
// are matched by normalized path or uid and NEVER touched — uids are
// immutable, and a re-scan is always idempotent.
export async function syncAssetRegistry() {
  const reg = await loadAssetRegistry();
  const knownPaths = new Set(reg.assets.map((a) => normalizeRelPath(a.path)));
  const knownIds = new Set(reg.assets.map((a) => a.asset_id));
  const knownUids = new Set(reg.assets.map((a) => a.asset_uid));

  let files = [];
  try {
    files = (await fs.readdir(PROPS_DIR)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  } catch {
    return reg; // no props dir — nothing to scan
  }

  let changed = false;
  for (const file of files) {
    const relPath = `assets/props/${file}`;
    if (knownPaths.has(normalizeRelPath(relPath))) continue;

    // Unique editable id from the filename (suffix on collision).
    let id = deriveAssetId(file);
    let n = 2;
    while (knownIds.has(id)) id = `${deriveAssetId(file)}_${n++}`;

    // Immutable uid: generated once here, persisted forever.
    let uid;
    do {
      uid = `asset_${id}_${crypto.randomBytes(3).toString("hex")}`;
    } while (knownUids.has(uid));

    reg.assets.push({ asset_uid: uid, asset_id: id, filename: file, type: "prop", path: relPath });
    knownPaths.add(normalizeRelPath(relPath));
    knownIds.add(id);
    knownUids.add(uid);
    changed = true;
  }

  if (changed) await saveRegistry(reg);
  return reg;
}

// Renames the EDITABLE asset_id of one asset. The uid never changes, so
// scene files (which reference uids) are unaffected. Every other field on
// the entry (including placementLimit) is untouched.
export async function updateAssetId(assetUid, newId) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (typeof newId !== "string" || !newId) throw err(400, "Asset ID cannot be empty.");
  if (!ASSET_ID_RE.test(newId)) throw err(400, "Asset ID may contain only lowercase letters, numbers, and underscores.");

  const reg = await loadAssetRegistry();
  const asset = reg.assets.find((a) => a.asset_uid === assetUid);
  if (!asset) throw err(404, `No asset with uid ${assetUid}.`);
  if (reg.assets.some((a) => a.asset_uid !== assetUid && a.asset_id === newId)) {
    throw err(409, `Asset ID "${newId}" is already in use.`);
  }
  asset.asset_id = newId;
  await saveRegistry(reg);
  return asset;
}

// Player-placement limit metadata for the FUTURE Player Customization Mode.
// Lives on the Asset definition (never per Scene Object instance):
//   absent/null       — no player-facing limit defined
//   0                 — unavailable for player placement
//   positive integer  — max instances a player may place
// The F8 developer editor stores this but NEVER enforces it — Add to Scene,
// Duplicate, and Save Layout stay unlimited in developer mode.
export async function updatePlacementLimit(assetUid, limit) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  const clearing = limit === null || limit === undefined || limit === "";
  if (!clearing && (!Number.isInteger(limit) || limit < 0)) {
    throw err(400, "placementLimit must be a non-negative integer, or null to clear it.");
  }
  const reg = await loadAssetRegistry();
  const asset = reg.assets.find((a) => a.asset_uid === assetUid);
  if (!asset) throw err(404, `No asset with uid ${assetUid}.`);
  if (clearing) delete asset.placementLimit;
  else asset.placementLimit = limit;
  await saveRegistry(reg);
  return asset;
}

// Pure placement-limit check for the future Player Customization Mode —
// NOT wired into the F8 editor. Counts existing placements by the IMMUTABLE
// asset_uid (never the editable asset_id, which can be renamed), accepting
// both the persisted key (asset_uid) and the live editor-def key (assetUid),
// and skipping soft-deleted editor defs. `registry` is the loaded registry
// object (or its assets array). In player mode an asset missing from the
// registry is DENIED — the registry is the approved-asset boundary that
// future signed Marketplace packages feed into.
export function canPlaceAsset(assetUid, currentSceneObjects, mode, registry) {
  const objects = Array.isArray(currentSceneObjects) ? currentSceneObjects : [];
  const currentCount = objects.filter((o) => (o?.asset_uid ?? o?.assetUid) === assetUid && !o?.deleted).length;
  const assets = Array.isArray(registry) ? registry : registry?.assets || [];
  const asset = assets.find((a) => a.asset_uid === assetUid);
  const limit = Number.isInteger(asset?.placementLimit) ? asset.placementLimit : null;

  if (mode === "developer") return { allowed: true, currentCount, limit, reason: null };
  if (!asset) return { allowed: false, currentCount, limit: 0, reason: "unknown_asset" };
  if (limit !== null && currentCount >= limit) {
    return { allowed: false, currentCount, limit, reason: "placement_limit_reached" };
  }
  return { allowed: true, currentCount, limit, reason: null };
}
