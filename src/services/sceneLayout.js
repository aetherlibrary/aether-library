// Scene layout persistence — the data side of the DEV-ONLY Scene Editor
// (devtools/scene-editor.js). Not part of the user experience: the routes
// that call this only exist while config.devTools is on (see server.js).
//
// One JSON document holds the editable scene state:
//   {
//     version: 1,
//     objects: [{ id, world: {x,y}, width, z }],   // placement overrides for
//                                                  // SCENE_OBJECTS entries,
//                                                  // keyed by their ids —
//                                                  // anchors/assets stay in
//                                                  // code (public/app.js)
//     zones:   [{ id, type, shape: "rect",    rect:   {x,y,w,h} } |
//               { id, type, shape: "ellipse", rect:   {x,y,w,h} } |
//               { id, type, shape: "polygon", points: [{x,y}, …] }]
//   }
// Objects may also carry the optional depth-layer fields renderLayer
// (int 0..9, fixed render band) and sortY (scene-px ground-line override);
// WALKABLE zones may carry characterLayer (int 0..9) — the render layer a
// character adopts while standing in the zone. All optional: absent keeps
// the default dynamic Y-sort (see the depth-layers section in app.js).
// All coordinates are normalized scene fractions (the same 1920×1080-art
// space every scene object uses) — polygons persist their FULL point array,
// never a bounding-rect approximation; an ellipse zone persists its
// BOUNDING BOX (rect) the same as a rect zone, just interpreted as the
// inscribed ellipse. The schema leaves room for "path" when it arrives.
//
// Zone types and their PRIORITY (highest wins wherever zones overlap):
//   blocked (red)  >  interaction (yellow)  >  walkable (green)
// The order of ZONE_TYPES is that priority, most important first — future
// game systems resolving "what is at (x, y)?" must check types in this
// order and stop at the first hit.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The Scene-owned World snapshot lives INSIDE this layout document — it is
// part of the Scene, not a separate silo (see the ownership note in
// services/worldContent.js). Importing the sanitizer keeps one definition.
import {
  sanitizeSceneWorld,
  sceneWorldFromPreset,
  loadWorldContent,
  getWorldPreset,
  DEFAULT_WORLD_ID,
} from "./worldContent.js";
// The Scene owns its background reference. The path rules are shared with
// every other assets/ reference in the project — see services/assetPaths.js.
import { sanitizeBackgroundPath } from "./assetPaths.js";
import { sanitizeShadowComponent } from "./shadowPresets.js";
// Scene-owned lights (Light System v1) — see services/sceneLights.js.
import { sanitizeSceneLights, sanitizeLightBlockers } from "./sceneLights.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real layout file.
const LAYOUT_PATH = process.env.SCENE_LAYOUT_PATH
  ? path.resolve(process.env.SCENE_LAYOUT_PATH)
  : path.join(projectRoot, "data", "scene-layout.json");

export const ZONE_TYPES = ["blocked", "interaction", "walkable"];
const ZONE_SHAPES = ["rect", "ellipse", "polygon"]; // future: "path"

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Legacy object-id migrations: a saved layout may reference an id that no
// longer exists in code because the underlying Scene Object was renamed
// (e.g. the "classic-dean" player-character id became "classic-omega" when
// the character asset was renamed). Applied on every load so an old save
// keeps working — its placement/shadow/collision data reattaches to the
// renamed object instead of silently falling back to code defaults — and
// the next Save Layout naturally persists the new id.
const LEGACY_OBJECT_ID_MIGRATIONS = { "classic-dean": "classic-omega" };

// A ground-shadow block on an object (see the ground-shadows section in
// public/app.js): explicit visible size + anchor-local offsets, plus a
// PROJECT-RELATIVE asset path — absolute machine paths and path escapes are
// rejected outright.
function sanitizeShadow(s) {
  // Shared with sceneConfig.js — the two were byte-identical copies, and Auto
  // Shadow Generation's new fields must not land in one document shape but
  // not the other. See services/shadowPresets.js.
  return sanitizeShadowComponent(s, num);
}

// Collision component (movement blocking — see the collision section in
// public/app.js): an anchor-relative SHAPE, independent of every depth
// field. Three shapes:
//   rectangle/ellipse — { enabled, shape, offsetX, offsetY, width, height }
//   polygon           — { enabled, shape: "polygon", points: [[x,y], …] }
// `shape` absent/unrecognized defaults to "rectangle" — every collision
// block written before shapes existed still loads unchanged. Absent block =
// the object blocks nothing. A polygon with fewer than 3 valid points
// persists nothing (an incomplete shape is worse than absence).
const COLLISION_SHAPES = ["rectangle", "ellipse", "polygon"];

function sanitizeCollision(c) {
  if (!c || typeof c !== "object") return null;
  const shape = COLLISION_SHAPES.includes(c.shape) ? c.shape : "rectangle";
  const enabled = c.enabled === true;
  if (shape === "polygon") {
    const raw = Array.isArray(c.points) ? c.points : [];
    const points = raw
      .map((p) => (Array.isArray(p) && p.length === 2 ? [num(p[0]), num(p[1])] : null))
      .filter((p) => p && p[0] !== null && p[1] !== null);
    if (points.length < 3) return null;
    return { enabled, shape, points };
  }
  return {
    enabled,
    shape,
    offsetX: num(c.offsetX) ?? 0,
    offsetY: num(c.offsetY) ?? 0,
    width: Math.max(0, num(c.width) ?? 0),
    height: Math.max(0, num(c.height) ?? 0),
  };
}

// Character foot collider (movement blocking — see the footCollider section
// in public/app.js): a SEPARATE editable component from object collision,
// anchor-local offsets, always small by design. Absent = the default
// centered 40×14 box.
function sanitizeFootCollider(fc) {
  if (!fc || typeof fc !== "object") return null;
  const width = Math.max(1, num(fc.width) ?? 40);
  const height = Math.max(1, num(fc.height) ?? 14);
  return {
    enabled: fc.enabled !== false,
    offsetX: num(fc.offsetX) ?? -width / 2,
    offsetY: num(fc.offsetY) ?? -height / 2,
    width,
    height,
  };
}

// ---------------------------------------------- Character Role Roster (Phase 1)
// Scene-level ROLE DEFINITIONS — one of the three deliberately separate
// concepts of the Character management architecture (see
// src/services/characterAssets.js for the full trio). A Role is a scene
// slot ("sage"), NOT a sprite file and NOT a runtime object id:
//   roleId               — stable machine identifier (normalized, unique)
//   label                — display text only; NEVER used as an identifier
//   required             — default roster roles; not removable in the editor
//   assignedCharacterId  — which CHARACTER ASSET fills this role in THIS
//                          scene (matches the asset's characterId, e.g.
//                          "classic_omega"). The scene instance is resolved
//                          FROM this via the existing authoritative runtime
//                          lookup (def.characterId) — the association is
//                          stored exactly once, here, never duplicated onto
//                          the object entries.
//   order                — roster display order
// The same role exists in every scene; different scenes assign different
// assets ("sage" -> classic_omega here, socrates in Athens, merlin in
// Avalon).
export const DEFAULT_CHARACTER_ROLES = [
  { roleId: "sage", label: "SAGE" },
  { roleId: "alpha", label: "ALPHA" },
  { roleId: "beta", label: "BETA" },
  { roleId: "gamma", label: "GAMMA" },
  { roleId: "traveler", label: "TRAVELER" },
  { roleId: "pet", label: "PET" },
];

// Same normalization vocabulary as Character Asset ids
// (characterAssets.js's normalizeStableId — duplicated here rather than
// imported to keep this module dependency-free, same convention as the
// sanitizer duplication between this file and sceneConfig.js).
function normalizeRoleId(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function defaultCharacterRoles() {
  return DEFAULT_CHARACTER_ROLES.map((r, i) => ({ roleId: r.roleId, label: r.label, required: true, order: i }));
}

// Sanitizes the persisted roster. Rules:
//   - absent/empty input -> the full default roster (this IS the migration
//     path for every scene saved before rosters existed — deterministic,
//     additive, nothing invented beyond the fixed defaults);
//   - duplicate roleIds: first entry wins, later ones are dropped;
//   - every DEFAULT role is guaranteed present (a file saved before a new
//     default was introduced heals on load) — merged in at its default
//     position, marked required;
//   - default roles are always required: true regardless of what the file
//     claims (they are not removable this phase); added roles keep their
//     own flag (absent -> false);
//   - output is sorted by order (ties: original position), orders
//     re-stamped densely so the file stays readable.
function sanitizeCharacterRoles(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return defaultCharacterRoles();
  const defaults = new Map(DEFAULT_CHARACTER_ROLES.map((r, i) => [r.roleId, { ...r, order: i }]));
  const seen = new Set();
  const roles = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const roleId = normalizeRoleId(r.roleId);
    if (!roleId || seen.has(roleId)) continue;
    seen.add(roleId);
    const isDefault = defaults.has(roleId);
    const label =
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim()
        : isDefault
        ? defaults.get(roleId).label
        : roleId.toUpperCase();
    const assigned = typeof r.assignedCharacterId === "string" && r.assignedCharacterId.trim() ? r.assignedCharacterId.trim() : null;
    // sceneObjectId — the THIRD, independent leg of the Role/Asset/Instance
    // trio (see the header comment above): which Scene Object this role
    // actually owns. Kept separate from assignedCharacterId on purpose — a
    // role can be assigned a Character Asset before any Scene Object exists
    // for it (mid-creation), and reassigning a DIFFERENT asset to an
    // already-bound role must update that SAME object rather than imply a
    // new one. Sanitizer never invents or validates this against `objects`
    // (cross-collection validation is the editor's job, same boundary
    // ownerPropId/homeSlotId already follow) — just whitelists the shape.
    const sceneObjectId = typeof r.sceneObjectId === "string" && r.sceneObjectId.trim() ? r.sceneObjectId.trim() : null;
    const order = num(r.order);
    roles.push({
      roleId,
      label,
      required: isDefault ? true : r.required === true,
      ...(assigned ? { assignedCharacterId: assigned } : {}),
      ...(sceneObjectId ? { sceneObjectId } : {}),
      order: order !== null ? order : roles.length,
    });
  }
  // Heal any missing default role back in at its canonical position.
  for (const [roleId, def] of defaults) {
    if (!seen.has(roleId)) roles.push({ roleId, label: def.label, required: true, order: def.order - 0.5 });
  }
  roles.sort((a, b) => a.order - b.order);
  roles.forEach((r, i) => (r.order = i));
  return roles;
}

// Deterministic first-load assignment migration: a scene with existing
// Character instances (kind:"npc" Scene Objects) but NO roster assignments
// at all adopts them in roster order — with today's single Omega instance,
// exactly "classic_omega -> sage". Pure and node-tested; the Scene Editor
// mirrors it browser-side (same duplication convention as gridPointToWorld).
// `npcs` is [{ characterId }] — anything without a characterId is skipped
// (nothing to key the assignment on). Never overwrites an existing
// assignment; a roster with ANY assignment is left completely untouched.
export function deriveRoleAssignments(roles, npcs) {
  if (!Array.isArray(roles) || !roles.length) return roles;
  if (roles.some((r) => r.assignedCharacterId)) return roles;
  const ids = (Array.isArray(npcs) ? npcs : [])
    .map((n) => (typeof n?.characterId === "string" && n.characterId.trim() ? n.characterId.trim() : null))
    .filter(Boolean);
  if (!ids.length) return roles;
  return roles.map((r, i) => (i < ids.length ? { ...r, assignedCharacterId: ids[i] } : r));
}

// Character Inspector fields. Two of these have live runtime meaning now:
// movementEnabled gates ALL autonomous NPC movement (tickOneNpc /
// moveCharacterToSlot in public/app.js — absent/false = the character never
// wanders or accepts commanded walks), and bubble configures the Character
// Bubble renderer (public/bubble-renderer.js — asset/offsets/anchor for
// showCharacterBubble). name/gameplayRole/assetId remain editor-facing
// only. Every field is optional and additive: absent input yields the
// documented default, so every scene file saved before these features
// existed continues to load unchanged, and Save Layout only ever writes a
// field once something actually sets it away from that default (same
// sparse-optional convention as homeSlotId/shadow/footCollider above).
//
// gameplayRole is a closed vocabulary (like FACING_DIRECTIONS below) —
// unrecognized values are dropped rather than persisted as junk. It is pure
// foundation data: nothing here infers a role from name/id/sprite/assetId,
// and nothing yet reads it at runtime.
const GAMEPLAY_ROLES = ["none", "grand_sage", "scholar_alpha", "scholar_beta", "scholar_gamma", "host", "mascot"];

// assetId is a NEW, purely-cosmetic "stable character-asset identifier"
// field (e.g. "classic_omega") — DELIBERATELY separate from the existing
// `characterId` field on baked SCENE_OBJECTS entries (see public/app.js).
// `characterId` looks similar but is NOT cosmetic: it's a live runtime
// lookup key (moveCharacterToSlot/resumeCharacterWandering/the Core Book
// interaction's hardcoded CORE_BOOK_CHARACTER_ID all resolve "which
// character" by matching it) — persisting an editable override for it here
// would risk an editor edit silently breaking that wiring. assetId has no
// such runtime meaning; it exists purely for the Character Inspector's
// Identity section and is safe to freely rename.
//
// Bubble config paths are project-relative under assets/ (same traversal/
// absolute-path rejection as sanitizeShadow's asset field), but NOT
// restricted to .png — textFont in particular needs other extensions — so
// this is a more general safe-path check than sanitizeShadow's.
const SAFE_ASSET_PATH_RE = /^assets\/[\w\-./ ]+$/i;
function sanitizeAssetPathString(v) {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (!trimmed || trimmed.includes("..") || !SAFE_ASSET_PATH_RE.test(trimmed)) return "";
  return trimmed;
}

// Bubble is stored PER-CHARACTER (not a world-level theme) because bubble
// placement must be adjustable per sprite — different Characters may
// perfectly well reference the same background/font files, this just isn't
// a shared registry in this task. Dialogue vs Thought are two distinct
// backgrounds (spoken vs thinking/non-dialogue states); anchor defaults to
// "sprite_top_center" (a free-form string, not a closed enum like
// gameplayRole — only one sanctioned value exists today, more may be added
// later without a schema change).
function sanitizeBubble(b) {
  if (!b || typeof b !== "object") return null;
  return {
    dialogueBackground: sanitizeAssetPathString(b.dialogueBackground),
    thoughtBackground: sanitizeAssetPathString(b.thoughtBackground),
    textFont: sanitizeAssetPathString(b.textFont),
    offsetX: num(b.offsetX) ?? 0,
    offsetY: num(b.offsetY) ?? 0,
    anchor: typeof b.anchor === "string" && b.anchor.trim() ? b.anchor.trim() : "sprite_top_center",
  };
}

// Character Player Interaction — direct pointer-hover feedback on a
// Character sprite (F8 Character tab's "PLAYER INTERACTION" section; see
// applyCharacterPlayerInteractionStyle() in public/app.js for the runtime).
// Deliberately the SAME shape as a Prop's playerInteraction block
// (sanitizeHoverEffect in src/services/sceneConfig.js) — {enabled, hover:
// {effects:[...]}} — so the two systems stay recognizably one concept and a
// future effect type can be added on either side without a schema
// divergence. This is Character/Role data living on the Character's own
// scene-layout entry; it is never stored as, or read from, a Prop.
//
// MVP scope: "glow" (Outline / Glow) is the ONLY supported effect type.
// Anything else is dropped rather than persisted as junk, exactly like
// gameplayRole's closed vocabulary above — Float/Scale/Animation/Behavior
// remain Prop-only for now, and dropping unknown types here keeps a
// hand-edited or future-authored file from silently half-working.
//
// Clamp math is intentionally identical to the Prop glow branch (size
// 0..50, opacity 0..1, strict 3-or-6-digit hex, invalid colour -> "" so the
// RUNTIME's own neutral default applies) so the two never diverge in
// behaviour or colour handling.
//
// Sparse-optional, matching every other Character Inspector field above: a
// Character with no authored interaction persists NOTHING, so no existing
// scene file is rewritten and no Character is retroactively force-enabled.
const CHARACTER_HOVER_EFFECT_TYPES = ["glow"];
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeCharacterHoverEffect(e) {
  if (!e || typeof e !== "object" || !CHARACTER_HOVER_EFFECT_TYPES.includes(e.type)) return null;
  const size = num(e.size);
  const opacity = num(e.opacity);
  const color = typeof e.color === "string" && HEX_COLOR_RE.test(e.color.trim()) ? e.color.trim() : "";
  return {
    type: "glow",
    size: size !== null ? Math.max(0, Math.min(50, size)) : 4,
    color,
    opacity: opacity !== null ? Math.max(0, Math.min(1, opacity)) : 0.7,
  };
}

function sanitizeCharacterPlayerInteraction(pi) {
  if (!pi || typeof pi !== "object") return null;
  const effects = Array.isArray(pi.hover?.effects) ? pi.hover.effects.map(sanitizeCharacterHoverEffect).filter(Boolean) : [];
  const enabled = pi.enabled === true;
  // Nothing meaningful authored (off AND empty) -> persist nothing at all,
  // so toggling a Character off and saving cleans the entry back out rather
  // than leaving an inert block behind.
  if (!enabled && !effects.length) return null;
  return { enabled, hover: { effects } };
}

// Interaction Slots (foundation only — see the interaction-slots section in
// public/app.js): a precise anchor-local position + facing where an NPC
// must stand to perform one action, DELIBERATELY SEPARATE from the existing
// "interaction" Zone type below (a Zone is a detection AREA; a Slot is the
// exact action position — this file's zone handling is untouched by it).
// An array — today's editor authors only the first entry, but the schema
// already supports more per Prop. Absent/empty = no authored slot.
//
// `occupied`/`reservedBy` are deliberately NOT sanitized/persisted here:
// they are runtime reservation state a future NPC system sets at play time,
// never authored data — persisting them would make a slot load back as
// "still occupied" from a stale save.
const FACING_DIRECTIONS = ["up", "down", "left", "right"];

// `slotId` is a SEPARATE, stable, human-readable destination identifier
// ("omega_home", "core_book_wait") — deliberately independent of `actionId`.
// slotId names a DESTINATION; actionId is optional legacy/default action
// metadata a future event may or may not use. Runtime slot resolution keys
// on slotId only, never actionId. Optional/absent for backward compat — a
// legacy slot authored before slotId existed still loads unchanged, just
// unreachable by name until an editor assigns one.
function sanitizeInteractionSlot(s, index) {
  if (!s || typeof s !== "object") return null;
  const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `slot-${index + 1}`;
  const actionId = typeof s.actionId === "string" ? s.actionId.trim() : "";
  const facingDirection = FACING_DIRECTIONS.includes(s.facingDirection) ? s.facingDirection : "down";
  const out = {
    id,
    actionId,
    offsetX: num(s.offsetX) ?? 0,
    offsetY: num(s.offsetY) ?? 0,
    facingDirection,
    enabled: s.enabled === true,
  };
  if (typeof s.slotId === "string" && s.slotId.trim()) out.slotId = s.slotId.trim();
  const duration = num(s.duration);
  if (duration !== null && duration > 0) out.duration = duration;
  if (typeof s.animationId === "string" && s.animationId.trim()) out.animationId = s.animationId.trim();
  return out;
}

function sanitizeInteractionSlots(raw) {
  if (!Array.isArray(raw)) return null;
  const out = raw.map((s, i) => sanitizeInteractionSlot(s, i)).filter(Boolean);
  return out.length ? out : null;
}

// ------------------------------------------------ grid point <-> world mapping
// THE single conversion authority for Map-tab grid POINTS — a grid point is
// a line INTERSECTION, not a cell: gridX/gridY are exact multiples of
// gridSize (x = gridX*gridSize, no cell-center offset). Valid indexes run
// 0..round(sceneWidth/gridSize) inclusive — a fencepost count, since an
// 80-cell-wide grid has 81 vertical intersection lines (0..80). Mirrored
// exactly in devtools/scene-editor.js (which runs in the browser and can't
// share this module directly — the two are kept in lockstep by the tests in
// test/sceneLayout.test.js, the same convention this codebase already uses
// for sanitizeShadow/sanitizeCollision between sceneLayout.js and
// sceneConfig.js). Never compute grid math anywhere else.
export const DEFAULT_GRID_SIZE = 24;

export function gridPointToWorld(gridX, gridY, gridSize) {
  return { x: gridX * gridSize, y: gridY * gridSize };
}
// Nearest-INTERSECTION rounding — never floor/ceil, which would select a
// CONTAINING CELL instead of the closest vertex.
export function worldToNearestGridPoint(x, y, gridSize) {
  return { gridX: Math.round(x / gridSize), gridY: Math.round(y / gridSize) };
}
export function clampGridPoint(gridX, gridY, gridSize, sceneWidth, sceneHeight) {
  const maxGx = Math.max(0, Math.round(sceneWidth / gridSize));
  const maxGy = Math.max(0, Math.round(sceneHeight / gridSize));
  return { gridX: Math.max(0, Math.min(maxGx, Math.round(gridX))), gridY: Math.max(0, Math.min(maxGy, Math.round(gridY))) };
}

// Slot Grid schema version (explicit migration marker — Section 4): bumped
// from 1 (cell-CENTER anchors, the old +0.5-offset formula) to 2 (grid-POINT
// / intersection anchors, no offset) when the MEANING of a Slot's
// gridX/gridY changed. Every save stamps the CURRENT version, documenting
// in the file itself which coordinate scheme its data was written under —
// useful for a human reading scene-layout.json, and load-bearing for any
// FUTURE scheme change the same way.
//
// This particular v1->v2 migration doesn't actually need to READ that
// version marker to be correct, though: sanitizeCharacterSlot always
// prefers a Slot's own x/y (its real world position — scheme-agnostic
// ground truth) over any persisted gridX/gridY when x/y is present,
// re-deriving gridX/gridY from it via worldToNearestGridPoint. A v1 Slot's
// x/y IS its old cell-center position, so this transparently snaps it to
// the nearest INTERSECTION instead (at most half a grid step away — the
// definition of "nearest"); a v2 Slot's x/y is already an exact multiple of
// gridSize, so the SAME re-derivation reproduces its existing gridX/gridY
// exactly — idempotent, never a second shift. gridX/gridY is trusted
// directly only when a Slot has no x/y at all (never true for anything this
// editor itself ever wrote — setSlotGridPoint always sets all four
// together — only a hand-authored or otherwise-external entry).
// The DOCUMENT's schema version, stamped at the root of every save. The name
// is historical — it was introduced for the Slot Grid — but the number has
// always described the whole layout file, and v3 is a scene-level change:
//
//   v1 -> v2  Slot Grid: cell-centre placement became intersection placement
//             (migrated implicitly by re-deriving gridX/gridY from x/y above).
//   v2 -> v3  The Scene owns its background. A v2 file predates the concept,
//             so an empty background there means "never authored" and is
//             migrated to the Classic Library art; in a v3 file the same empty
//             value means "deliberately blank" and is left alone. That
//             distinction is the ONLY reason this migration needs to read the
//             incoming version at all — see loadSceneLayout().
//
// SCENE_SCHEMA_VERSION is the accurate name; SLOT_SCHEMA_VERSION stays as an
// alias because existing tests and callers import it.
export const SCENE_SCHEMA_VERSION = 3;
export const SLOT_SCHEMA_VERSION = SCENE_SCHEMA_VERSION;

// The background a Scene authored before v3 was actually displaying: the
// runtime hardcoded it in public/assets.js, so this is the value that keeps
// such a Scene looking exactly as it did. Applied in memory only.
export const CLASSIC_LIBRARY_BACKGROUND = "assets/background/classic_library_bg.png";

// Slot Box: the reserved/usable area AROUND a Slot Point, measured in whole
// grid CELLS (not world px) — independent of the Point itself (resizable
// without moving it) and of Prop footprint / Interest weight (neither
// exists yet; this is pure geometry a future system reuses unchanged).
// width/height >= 1, integers, clamped to the grid's own extent; absent
// input (including every pre-existing Slot, authored before Slot Box
// existed) defaults to 1×1.
function sanitizeSlotBox(raw, gridSize, sceneWidth, sceneHeight) {
  const maxW = Math.max(1, Math.round(sceneWidth / gridSize));
  const maxH = Math.max(1, Math.round(sceneHeight / gridSize));
  const w = num(raw?.width);
  const h = num(raw?.height);
  return {
    width: w !== null ? Math.max(1, Math.min(maxW, Math.round(w))) : 1,
    height: h !== null ? Math.max(1, Math.min(maxH, Math.round(h))) : 1,
  };
}

// ---------------------------------------------------- Prop Footprint (Slot Box)
// THE canonical Slot Box anchoring formula — floor-based left/top split, so
// odd AND even sizes both resolve deterministically without half-cell
// geometry (left+right always equals width, same for top/bottom). Mirrors
// devtools/scene-editor.js's computeSlotBoxBounds exactly (same duplication
// convention as gridPointToWorld/worldToNearestGridPoint above — this file
// and the browser can't share a module, kept in lockstep by
// test/sceneLayout.test.js). `gridSize` is a plain multiplier: pass 1 to get
// bounds/cells in whole GRID CELLS (occupancy math), or the real grid size
// to get world px (rendering).
export function getSlotBoxBounds(gridX, gridY, boxWidth, boxHeight, gridSize) {
  const left = Math.floor(boxWidth / 2);
  const right = boxWidth - left;
  const top = Math.floor(boxHeight / 2);
  const bottom = boxHeight - top;
  return {
    x: (gridX - left) * gridSize,
    y: (gridY - top) * gridSize,
    width: (left + right) * gridSize,
    height: (top + bottom) * gridSize,
  };
}

// Every individual grid cell a Slot Box occupies, as {gridX, gridY} cell
// indexes (NOT world px) — the shared unit both overlap detection and any
// future density/placement/navigation check should use, so nothing
// duplicates this arithmetic with its own off-by-one risk.
export function getSlotBoxCells(gridX, gridY, boxWidth, boxHeight) {
  const b = getSlotBoxBounds(gridX, gridY, boxWidth, boxHeight, 1);
  const cells = [];
  for (let dx = 0; dx < b.width; dx++) {
    for (let dy = 0; dy < b.height; dy++) {
      cells.push({ gridX: b.x + dx, gridY: b.y + dy });
    }
  }
  return cells;
}

// Axis-aligned overlap between two Slot Boxes, in cell units — true the
// moment any cell could coincide (touching edges do NOT count as overlap,
// standard half-open rectangle semantics). Takes {gridX, gridY, slotBox}
// shapes directly (a characterSlot record satisfies this as-is).
export function slotBoxesOverlap(a, b) {
  const ba = getSlotBoxBounds(a.gridX, a.gridY, a.slotBox.width, a.slotBox.height, 1);
  const bb = getSlotBoxBounds(b.gridX, b.gridY, b.slotBox.width, b.slotBox.height, 1);
  return ba.x < bb.x + bb.width && ba.x + ba.width > bb.x && ba.y < bb.y + bb.height && ba.y + ba.height > bb.y;
}

// Scene-level Character Slots: destinations that don't belong to any Prop
// (see public/app.js's resolveCharacterSlot). Deliberately NOT represented
// as an Interaction Zone (a Zone is a detection area; this is an exact
// destination). A missing/empty slotId still persists (the editor warns,
// but a blank id must not crash a save) — `metadata` is a small freeform
// string for future event wiring, kept intentionally loose.
//
// x/y (the Slot's actual WORLD position) is the PRIMARY source whenever
// present — scheme-agnostic ground truth, and what transparently migrates a
// v1 (cell-center) Slot's position to the nearest v2 (grid-point)
// intersection on every load (see SLOT_SCHEMA_VERSION above) without ever
// needing to know which scheme wrote it. gridX/gridY is then always
// RECOMPUTED from x/y (worldToNearestGridPoint), so the two can never
// independently drift. gridX/gridY is trusted directly ONLY when a Slot has
// no x/y at all (this editor's own writer, setSlotGridPoint, always sets
// all four together — that path is for a hand-authored or otherwise
// external entry). Both are clamped to the scene bounds at the current grid
// size — never negative, never off-board.
//
// A slot with a real (non-empty) slotId but NO resolvable position persists
// as UNPLACED — gridX/gridY/x/y are simply absent from the output, same
// "absence means missing" convention as renderLayer/sortY elsewhere in this
// file. This is what lets a Slot reference survive a canonical-registry
// migration (see the Map Grid + Slot placement round two notes) even when no
// safe position could be derived, instead of being silently dropped. A slot
// with NEITHER a slotId NOR a position is still genuine junk and is dropped,
// same as before.
function sanitizeCharacterSlot(s, gridSize, sceneWidth, sceneHeight) {
  if (!s || typeof s !== "object") return null;
  const slotId = typeof s.slotId === "string" ? s.slotId.trim() : "";
  const rawX = num(s.x);
  const rawY = num(s.y);
  const rawGx = num(s.gridX);
  const rawGy = num(s.gridY);
  let gridX = null, gridY = null, x = null, y = null;
  if (rawX !== null && rawY !== null) {
    const pt = worldToNearestGridPoint(rawX, rawY, gridSize);
    ({ gridX, gridY } = clampGridPoint(pt.gridX, pt.gridY, gridSize, sceneWidth, sceneHeight));
    ({ x, y } = gridPointToWorld(gridX, gridY, gridSize));
  } else if (rawGx !== null && rawGy !== null) {
    ({ gridX, gridY } = clampGridPoint(rawGx, rawGy, gridSize, sceneWidth, sceneHeight));
    ({ x, y } = gridPointToWorld(gridX, gridY, gridSize));
  } else if (!slotId) {
    return null; // no slotId and no position at all — nothing to place, nothing to name
  }
  const facingDirection = FACING_DIRECTIONS.includes(s.facingDirection) ? s.facingDirection : "down";
  const out = {
    slotId,
    enabled: s.enabled === true,
    facingDirection,
    slotBox: sanitizeSlotBox(s.slotBox, gridSize, sceneWidth, sceneHeight),
    // Prop Footprint milestone: blockingOccupancy defaults to true (absent
    // = participates in occupancy checks) for every Slot, Prop-owned or
    // not — it's a property of the Box itself, even though only a
    // Prop-owned Slot's Box is currently surfaced as a "Footprint" in the
    // Props tab. See slotBoxesOverlap/getSlotBoxCells above.
    blockingOccupancy: s.blockingOccupancy !== false,
  };
  if (gridX !== null) Object.assign(out, { gridX, gridY, x, y });
  if (typeof s.actionId === "string" && s.actionId.trim()) out.actionId = s.actionId.trim();
  const duration = num(s.duration);
  if (duration !== null && duration > 0) out.duration = duration;
  if (typeof s.animationId === "string" && s.animationId.trim()) out.animationId = s.animationId.trim();
  if (typeof s.metadata === "string" && s.metadata.trim()) out.metadata = s.metadata.trim();
  // ownerPropId: the reciprocal half of prop.slotId (sanitizeObject below) —
  // a Slot WITH this field is a Prop Footprint; a Slot WITHOUT it is a
  // World Slot/reserved point (Section 14 of the spec). Deliberately NOT
  // cross-validated against the objects array here — this sanitizer only
  // sees its own document; reciprocity is validated in-memory by the editor
  // (both collections are simultaneously loaded there), same boundary the
  // rest of this file already respects (e.g. homeSlotId isn't validated
  // against characterSlots here either).
  if (typeof s.ownerPropId === "string" && s.ownerPropId.trim()) out.ownerPropId = s.ownerPropId.trim();
  return out;
}

function sanitizeCharacterSlots(raw, gridSize, sceneWidth, sceneHeight) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => sanitizeCharacterSlot(s, gridSize, sceneWidth, sceneHeight)).filter(Boolean);
}

// Strict whitelisting: only known fields survive, anything malformed is
// dropped rather than persisted — the layout file must never accumulate
// junk a future loader would have to defend against.
function sanitizeObject(o) {
  if (!o || typeof o.id !== "string" || !o.id) return null;
  const id = LEGACY_OBJECT_ID_MIGRATIONS[o.id] || o.id;
  const x = num(o.world?.x);
  const y = num(o.world?.y);
  const width = num(o.width);
  if (x === null || y === null || width === null || width <= 0) return null;
  const z = num(o.z);
  const shadow = sanitizeShadow(o.shadow);
  // Depth-layer fields (see the depth-layers section in public/app.js) —
  // both optional; absent = dynamic Y-sort at the object's own ground line.
  const renderLayer = num(o.renderLayer);
  const sortY = num(o.sortY);
  const collision = sanitizeCollision(o.collision);
  const footCollider = sanitizeFootCollider(o.footCollider);
  const interactionSlots = sanitizeInteractionSlots(o.interactionSlots);
  // Character-tab foundation (editor reorganization only — NOT read by the
  // runtime yet). homeSlotId already has a live runtime meaning (spawn +
  // return-home slot, see app.js); spawnSlotId is persisted for a future
  // spawn/home distinction but has no runtime effect today.
  const homeSlotId = typeof o.homeSlotId === "string" && o.homeSlotId.trim() ? o.homeSlotId.trim() : null;
  const spawnSlotId = typeof o.spawnSlotId === "string" && o.spawnSlotId.trim() ? o.spawnSlotId.trim() : null;
  // Prop Footprint milestone: the forward half of the reciprocal owner link
  // (see ownerPropId in sanitizeCharacterSlot above) — which canonical Slot
  // this Prop instance owns. A baked object CAN own a Footprint Slot too
  // (nothing here is scene-config-specific); reciprocity is validated
  // in-memory by the editor, not here.
  const slotId = typeof o.slotId === "string" && o.slotId.trim() ? o.slotId.trim() : null;
  // Ground Projection calibration: a designer-authored, per-instance offset
  // used ONLY by the owned Slot/Footprint (see groundProjectionPx in
  // devtools/scene-editor.js) — completely independent of collision,
  // shadow, sortY, and world (the sprite anchor). Absent/malformed = 0,0,
  // which is mathematically a no-op (groundProjection === the sprite
  // anchor exactly), so a legacy Prop with no offset behaves identically to
  // before this field existed. Persisted only when non-zero, same sparse-
  // optional convention as renderLayer/sortY/homeSlotId above.
  const groundOffsetX = num(o.groundOffsetX);
  const groundOffsetY = num(o.groundOffsetY);
  // Character Inspector foundation — see GAMEPLAY_ROLES/sanitizeBubble above.
  // `name` is the EXISTING editor-facing display label (public/app.js's
  // SCENE_OBJECTS literal already sets one for every baked object; the game
  // itself never reads it) — newly made persistable here so an Inspector
  // rename actually survives Save/reload, same sparse convention as every
  // other optional field in this function.
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
  const gameplayRole = GAMEPLAY_ROLES.includes(o.gameplayRole) && o.gameplayRole !== "none" ? o.gameplayRole : null;
  const assetId = typeof o.assetId === "string" && o.assetId.trim() ? o.assetId.trim() : null;
  const movementEnabled = o.movementEnabled === true ? true : null;
  const bubble = sanitizeBubble(o.bubble);
  const playerInteraction = sanitizeCharacterPlayerInteraction(o.playerInteraction);
  // Character Role Roster (Phase 2) — the fields a DYNAMICALLY CREATED
  // Character Scene Object needs that a baked one gets for free from code
  // (public/app.js's SCENE_OBJECTS literal): `kind` (there is no other
  // source of truth for it once an object has no code counterpart at all),
  // `characterId` (the SAME runtime lookup key moveCharacterToSlot/the
  // Bubble renderer already use — set once at creation, never silently
  // reassigned elsewhere), and `assetPath` (the resolved sprite file — a
  // project-relative path, same safety rule as Bubble's paths, NEVER an
  // absolute machine path). All three are omitted for a baked object
  // (kind/asset live in code there) — sparse, additive, so a pre-Phase-2
  // file that only ever described Omega's overrides is untouched.
  const kind = o.kind === "npc" || o.kind === "prop" ? o.kind : null;
  const characterId = typeof o.characterId === "string" && o.characterId.trim() ? o.characterId.trim() : null;
  const assetPath = sanitizeAssetPathString(o.assetPath) || null;
  // Model/UX correction (Phase H) — a code-baked object (e.g. Omega) has no
  // "absent means doesn't exist" state the way a dynamically-created
  // Character does: omitting her from `objects` entirely would just mean
  // "no override," and her code-defined defaults would make her reappear.
  // Removing a BAKED Character from the scene therefore has to persist an
  // explicit flag instead of relying on omission.
  const deleted = o.deleted === true ? true : null;
  return {
    id,
    world: { x, y },
    width,
    ...(z !== null ? { z } : {}),
    ...(renderLayer !== null ? { renderLayer: Math.max(0, Math.min(9, Math.round(renderLayer))) } : {}),
    ...(sortY !== null ? { sortY } : {}),
    ...(shadow ? { shadow } : {}),
    ...(collision ? { collision } : {}),
    ...(footCollider ? { footCollider } : {}),
    ...(interactionSlots ? { interactionSlots } : {}),
    ...(homeSlotId ? { homeSlotId } : {}),
    ...(spawnSlotId ? { spawnSlotId } : {}),
    ...(slotId ? { slotId } : {}),
    ...(groundOffsetX ? { groundOffsetX } : {}),
    ...(groundOffsetY ? { groundOffsetY } : {}),
    ...(name ? { name } : {}),
    ...(gameplayRole ? { gameplayRole } : {}),
    ...(assetId ? { assetId } : {}),
    ...(movementEnabled ? { movementEnabled } : {}),
    ...(bubble ? { bubble } : {}),
    ...(playerInteraction ? { playerInteraction } : {}),
    ...(kind ? { kind } : {}),
    ...(characterId ? { characterId } : {}),
    ...(assetPath ? { assetPath } : {}),
    ...(deleted ? { deleted } : {}),
  };
}

// Scene-level metadata. Every field is optional; absent input yields sensible
// defaults rather than rejecting.
//
// `background` is the Scene's OWN background reference and the runtime reads
// it (public/app.js applySceneBackground) — it is no longer descriptive-only,
// and window.ASSETS no longer carries a library background at all. It is
// validated, not merely trimmed: a project-relative POSIX path under
// assets/background/ with a runtime-renderable extension, or "" for a
// deliberately blank Scene. Anything else sanitizes to "" rather than failing
// the load, exactly like every other field here.
function sanitizeSceneMeta(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const width = num(m.width);
  const height = num(m.height);
  const gridSize = num(m.gridSize);
  return {
    name: typeof m.name === "string" ? m.name.trim() : "",
    background: sanitizeBackgroundPath(m.background),
    worldId: typeof m.worldId === "string" ? m.worldId.trim() : "",
    width: width !== null && width > 0 ? width : 1920,
    height: height !== null && height > 0 ? height : 1080,
    // Map tab Grid: "default grid size remains 24 unless the existing
    // project defines another default" — this IS that one default.
    gridSize: gridSize !== null && gridSize >= 4 ? Math.round(gridSize) : DEFAULT_GRID_SIZE,
  };
}

function sanitizeZone(zn) {
  if (!zn || typeof zn.id !== "string" || !zn.id) return null;
  if (!ZONE_TYPES.includes(zn.type)) return null;
  const shape = zn.shape || "rect";
  if (!ZONE_SHAPES.includes(shape)) return null;

  // Character Render Layer — WALKABLE zones only: a character standing in
  // this zone renders in that depth-layer band (see the depth-layers
  // section in public/app.js). Optional; absent = the zone doesn't touch
  // character depth.
  const cl = num(zn.characterLayer);
  const layer = zn.type === "walkable" && cl !== null ? { characterLayer: Math.max(0, Math.min(9, Math.round(cl))) } : {};

  if (shape === "polygon") {
    // A polygon is its FULL point array (≥ 3 valid vertices) — never
    // collapsed to a bounding rect. Any malformed vertex rejects the zone.
    const raw = Array.isArray(zn.points) ? zn.points : [];
    const points = raw.map((p) => {
      const x = num(p?.x);
      const y = num(p?.y);
      return x === null || y === null ? null : { x, y };
    });
    if (points.length < 3 || points.some((p) => p === null)) return null;
    return { id: zn.id, type: zn.type, shape, points, ...layer };
  }

  const r = zn.rect || {};
  const x = num(r.x);
  const y = num(r.y);
  const w = num(r.w);
  const h = num(r.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  return { id: zn.id, type: zn.type, shape, rect: { x, y, w, h }, ...layer };
}

export function sanitizeLayout(raw) {
  // sceneMeta (width/height/gridSize) is computed FIRST — Character Slots'
  // grid<->world conversion depends on it, so there is exactly one place
  // that decides the board's dimensions for this whole sanitize pass.
  const sceneMeta = sanitizeSceneMeta(raw?.sceneMeta);
  return {
    // Stamps the CURRENT Slot Grid schema on every save (Section 4 —
    // explicit versioning; see SLOT_SCHEMA_VERSION). The v1->v2 migration
    // itself doesn't need to read an INCOMING version at all: it's a side
    // effect of sanitizeCharacterSlot always preferring a Slot's own x/y
    // over persisted gridX/gridY — see that function's own comment.
    version: SLOT_SCHEMA_VERSION,
    objects: (Array.isArray(raw?.objects) ? raw.objects : []).map(sanitizeObject).filter(Boolean),
    zones: (Array.isArray(raw?.zones) ? raw.zones : []).map(sanitizeZone).filter(Boolean),
    // Scene-level Character Slots — absent/malformed input just yields [],
    // never a load failure (existing layouts predate this field entirely).
    characterSlots: sanitizeCharacterSlots(raw?.characterSlots, sceneMeta.gridSize, sceneMeta.width, sceneMeta.height),
    // Character Role Roster — absent input yields the full default roster
    // (the migration path for every pre-roster scene file), same rule.
    characterRoles: sanitizeCharacterRoles(raw?.characterRoles),
    // Scene tab foundation — absent input yields defaults, same rule.
    sceneMeta,
    // Scene-owned lights. Absent input yields [] — a Scene without lights is
    // completely normal, and every pre-existing layout loads unchanged.
    lights: sanitizeSceneLights(raw?.lights),
    // Light Blockers — a SEPARATE collection from zones on purpose: an
    // obstacle to light is not an obstacle to walking (services/sceneLights.js).
    lightBlockers: sanitizeLightBlockers(raw?.lightBlockers),
    // Scene-owned World snapshot: identity names, custom-name overrides,
    // theme tokens and audio config. Absent in a pre-Phase-1 file, which
    // sanitizes to the Classic defaults; the real migration (copying the
    // referenced World preset in) happens in loadSceneLayout() below so a
    // legacy Scene keeps its authored world until the user saves.
    world: sanitizeSceneWorld(raw?.world),
  };
}

// MIGRATION — a Scene authored before the world snapshot existed.
//
// Such a file has no `world` key at all. Sanitizing it would silently give it
// the built-in Classic defaults, which is wrong for anyone who authored a
// different world: before this change the runtime read the World file
// directly, so THAT file is the identity the Scene was actually displaying.
// So we deep-copy it in, once, in memory.
//
// Nothing is rewritten to disk here. The migrated snapshot becomes permanent
// only when the user saves the Scene, so an unsaved legacy Scene keeps
// working exactly as before and a failed migration cannot corrupt it.
let migrationLogged = false;

async function migrateSceneWorld(sceneMeta) {
  // `worldId` is the Scene's pre-Phase-1 pointer at a world. Empty means the
  // default world, which is the active world FILE — the one the old runtime
  // loaded. Any other id names a World Preset.
  const worldId = sceneMeta?.worldId || DEFAULT_WORLD_ID;
  try {
    const source = worldId === DEFAULT_WORLD_ID ? await loadWorldContent() : await getWorldPreset(worldId);
    if (!source) throw new Error(`world "${worldId}" not found`);
    if (!migrationLogged) {
      migrationLogged = true;
      console.log(
        `[scene-layout] this Scene predates the Scene-owned World snapshot. Copied world "${worldId}" ` +
          "into the Scene in memory; it is written to disk only when the Scene is saved."
      );
    }
    return sceneWorldFromPreset(source);
  } catch (err) {
    console.error("[scene-layout] world migration fell back to the Classic defaults:", err.message);
    return sanitizeSceneWorld(null);
  }
}

// MIGRATION — a Scene authored before the Scene owned its background (v < 3).
//
// Such a file has `background: ""` not because anyone chose a blank Scene, but
// because the field was inert: the runtime drew a hardcoded image regardless.
// Reading it literally now would black out every existing library. So a pre-v3
// file with no background adopts the art it was actually displaying.
//
// A v3 file is trusted absolutely: `""` there is an authored blank Scene and
// must stay blank. That is the whole reason the version is read.
//
// Nothing is written to disk. Like migrateSceneWorld above, the change becomes
// permanent only when the author saves, so an untouched legacy Scene keeps
// working and a migration can never corrupt a file on its own.
let backgroundMigrationLogged = false;

function migrateSceneBackground(layout, rawVersion) {
  if (Number(rawVersion) >= SCENE_SCHEMA_VERSION) return layout;
  if (layout.sceneMeta.background) return layout;
  layout.sceneMeta.background = CLASSIC_LIBRARY_BACKGROUND;
  if (!backgroundMigrationLogged) {
    backgroundMigrationLogged = true;
    console.log(
      "[scene-layout] this Scene predates Scene-owned backgrounds. Applied " +
        `"${CLASSIC_LIBRARY_BACKGROUND}" in memory; it is written to disk only when the Scene is saved.`
    );
  }
  return layout;
}

// The saved layout, or the default Scene when nothing has been saved yet.
export async function loadSceneLayout() {
  try {
    const raw = JSON.parse(await fs.readFile(LAYOUT_PATH, "utf8"));
    const layout = sanitizeLayout(raw);
    if (!raw?.world) layout.world = await migrateSceneWorld(layout.sceneMeta);
    return migrateSceneBackground(layout, raw?.version);
  } catch (err) {
    if (err.code === "ENOENT")
      return {
        version: SCENE_SCHEMA_VERSION,
        objects: [],
        zones: [],
        characterSlots: [],
        characterRoles: sanitizeCharacterRoles(null),
        // The bootstrap Scene — no file has ever been saved on this machine.
        // This is NOT "a new blank Scene" (that is a future New Scene action,
        // which will author "" explicitly): it is the shipped product's only
        // Scene, and it keeps the Classic Library art it has always had.
        sceneMeta: { ...sanitizeSceneMeta(null), background: CLASSIC_LIBRARY_BACKGROUND },
        lights: [],
        lightBlockers: [],
        world: sanitizeSceneWorld(null),
      };
    throw err;
  }
}

// Persists the layout (sanitized) and returns what was actually written.
export async function saveSceneLayout(raw) {
  const layout = sanitizeLayout(raw);
  await fs.mkdir(path.dirname(LAYOUT_PATH), { recursive: true });
  await fs.writeFile(LAYOUT_PATH, JSON.stringify(layout, null, 2), "utf8");
  return layout;
}
