// Scene configuration persistence — the data side of the Classic Library's
// Scene Objects (assets/scenes/classic_library.json). Reading is plain
// static serving; WRITING happens only through the dev-only Scene Editor
// route (see server.js), which funnels through the sanitizer here.
//
// v2 object shape (see the _format note in the JSON itself):
//   { instance_id, asset_uid, x, y, scale, flipX, z, renderLayer?, sortY? }
// x/y are the sprite content's bottom-center anchor in 1920×1080 scene px;
// scale is ALWAYS >= 0 — horizontal mirroring is the separate boolean flipX
// (absent = false, the backward-compatibility default), never a negative
// scale. v1 entries ({ id, asset, width }) are preserved as-is if ever
// posted, so older configs cannot be destroyed by a save.
//
// Depth-layer fields (both OPTIONAL — absent keeps the default dynamic
// Y-sort, so pre-layer scenes load unchanged):
//   renderLayer — integer 0..9: pins the object to a fixed render layer
//                 band (priority = layer first, then Y-sort within it)
//   sortY       — ground-line override in scene px, for props standing ON
//                 other props (their own content-bottom is not their
//                 logical ground line)
// The old z field still round-trips but no longer drives stacking.
//
// Shadow and Collision are UNIVERSAL, INDEPENDENTLY-toggleable Scene Object
// components — every prop supports both, neither is special-cased to any
// particular object. Both default to absent/disabled for a freshly-minted
// prop (see sanitizeShadow/sanitizeCollision below).
//
// Player Interaction (see sanitizePlayerInteraction below) is the same kind
// of universal, opt-in component, scoped to scene-config (registry) Props:
// direct player/pointer hover behavior, authored as an ORDERED, extensible
// list of effects (never a fixed set of boolean flags) so a Prop can combine
// any number of built-in effects (float/scale/glow/animation) — this is what
// core_book_01 uses to replace the old hardcoded book-hotspot hover CSS; the
// book works because it HAS this data, not because its id is special.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeShadowComponent } from "./shadowPresets.js";
import { sanitizePropTransform } from "./propTransform.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Overridable for tests so they never touch the real scene file.
const SCENE_CONFIG_PATH = process.env.SCENE_CONFIG_PATH
  ? path.resolve(process.env.SCENE_CONFIG_PATH)
  : path.join(projectRoot, "assets", "scenes", "classic_library.json");

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// A ground-shadow block on a scene-config prop — SAME shape/rules as the
// baked-object shadow in sceneLayout.js (kept as two copies rather than a
// shared module, matching this codebase's existing convention for
// sanitizeCollision): explicit visible size + anchor-local offsets, plus a
// PROJECT-RELATIVE asset path — absolute machine paths and path escapes are
// rejected outright. Universal component (every Prop gets one, not
// special-cased) — absent = no shadow rendered, matching the "new props
// default to shadow.enabled = false" requirement (the editor writes an
// explicit `{enabled: false}` block for new props, which round-trips here).
function sanitizeShadow(s) {
  // Shared with sceneConfig.js — the two were byte-identical copies, and Auto
  // Shadow Generation's new fields must not land in one document shape but
  // not the other. See services/shadowPresets.js.
  return sanitizeShadowComponent(s, num);
}

// Collision component (movement blocking — see the collision section in
// public/app.js): an anchor-relative SHAPE, fully independent of the depth
// fields. Three shapes:
//   rectangle/ellipse — { enabled, shape, offsetX, offsetY, width, height }
//   polygon           — { enabled, shape: "polygon", points: [[x,y], …] }
// `shape` absent/unrecognized defaults to "rectangle" — every collision
// block written before shapes existed still loads unchanged. Absent block =
// the object blocks nothing; malformed numbers fall back to inert defaults
// rather than rejecting the object. A polygon with fewer than 3 valid
// points persists nothing (an incomplete shape is worse than absence).
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

// Interaction Slots (foundation only — see the interaction-slots section in
// public/app.js): a precise anchor-local position + facing where an NPC
// must stand to perform one action, DELIBERATELY SEPARATE from the existing
// "interaction" Zone type (a Zone is a detection AREA; a Slot is the exact
// action position — zones are untouched by this). An array — today's editor
// authors only the first entry, but the schema already supports more per
// Prop. Absent/empty = no authored slot.
//
// `occupied`/`reservedBy` are deliberately NOT sanitized/persisted here:
// they are runtime reservation state a future NPC system sets at play time,
// never authored data — persisting them would make a slot load back as
// "still occupied" from a stale save.
const FACING_DIRECTIONS = ["up", "down", "left", "right"];

// `slotId` is a SEPARATE, stable, human-readable destination identifier
// ("omega_home", "core_book_wait") — independent of `actionId`. slotId
// names a DESTINATION; actionId is optional legacy/default action metadata.
// Runtime slot resolution keys on slotId only. Optional/absent for backward
// compat — a legacy slot without one still loads unchanged.
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

// Player Interaction (Props only — see the F8 Scene Editor's "PLAYER
// INTERACTION" component): direct player/pointer hover behavior, DELIBERATELY
// separate from Interaction Slots above (an NPC standing-position system) and
// from Collision/Shadow. An extensible ORDERED effect list, never a fixed set
// of boolean flags — `hoverFloat`/`hoverGlow`/`hoverScale: 1.05` was
// explicitly rejected in favor of `hover.effects[]` so a Prop can combine any
// number of effects (Float + Glow + Animation, etc.) and so a future
// declarative external preset ({type:"effectDefinition", source:"assets/
// effects/x.json"}) can slot into the SAME array without a schema change —
// that type round-trips here (string source only, validated as a
// project-relative .json path) even though no runtime code consumes it yet;
// arbitrary JS is never accepted, only declarative data references.
// Order is preserved (array order = the array's own order, never resorted).
const PLAYER_INTERACTION_EFFECT_TYPES = ["float", "scale", "glow", "animation", "effectDefinition"];
// Loose (3 or 6 hex digit) so a designer can paste from any color picker.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// Project-relative asset path, same rule family as sanitizeShadow's `asset`
// field: no absolute machine paths, no ../ escapes, extension-restricted.
function projectAssetPath(v, extRe) {
  return typeof v === "string" && extRe.test(v) && !v.includes("..") ? v : "";
}

// Animation effect Speed: a DISCRETE control (F8's slider produces
// 0.5/0.6/0.7/.../3.0 in 0.1 steps — widened from an earlier 0.5-increment
// slider for finer authoring control, e.g. 1.1x/1.2x) — snapped, not merely
// clamped, so a value from hand-edited JSON or an old continuous-range save
// (a 0.25–4.0 slider existed briefly before either of these) always lands
// on a stop the UI can actually display and re-select, rather than
// rendering a slider with no matching tick. Legacy 0.5-increment values
// (0.5/1.0/1.5/2.0/2.5/3.0) are themselves valid 0.1 stops too, so old
// saves round-trip unchanged — no migration needed.
const ANIMATION_SPEED_MIN = 0.5;
const ANIMATION_SPEED_MAX = 3;
const ANIMATION_SPEED_STEP = 0.1;
function snapAnimationSpeed(v) {
  const snapped = Math.round(v / ANIMATION_SPEED_STEP) * ANIMATION_SPEED_STEP;
  const clamped = Math.max(ANIMATION_SPEED_MIN, Math.min(ANIMATION_SPEED_MAX, snapped));
  // Guards against float artifacts (e.g. 1.5000000000000002) from the
  // division/multiplication above.
  return Math.round(clamped * 100) / 100;
}

function sanitizeHoverEffect(e) {
  if (!e || typeof e !== "object" || !PLAYER_INTERACTION_EFFECT_TYPES.includes(e.type)) return null;
  if (e.type === "float") {
    const distance = num(e.distance);
    const duration = num(e.duration);
    return {
      type: "float",
      // Clamped to sane ranges rather than rejected outright — a bad number
      // from hand-edited JSON degrades to a safe default, never drops the
      // whole effect (and never the whole Prop).
      distance: distance !== null ? Math.max(0, Math.min(100, distance)) : 6,
      duration: duration !== null && duration > 0 ? Math.min(10, duration) : 1.2,
    };
  }
  if (e.type === "scale") {
    const scale = num(e.scale);
    const duration = num(e.duration);
    return {
      type: "scale",
      scale: scale !== null ? Math.max(0.5, Math.min(3, scale)) : 1.05,
      duration: duration !== null && duration > 0 ? Math.min(10, duration) : 0.3,
    };
  }
  if (e.type === "glow") {
    const size = num(e.size);
    const opacity = num(e.opacity);
    // No color -> "" (unset), never a hardcoded book-specific default here —
    // the RUNTIME's own fallback (public/app.js) is a neutral, non-book
    // color; core_book_01 itself carries its warm-gold color as authored
    // data, not a system default.
    const color = typeof e.color === "string" && HEX_COLOR_RE.test(e.color.trim()) ? e.color.trim() : "";
    return {
      type: "glow",
      size: size !== null ? Math.max(0, Math.min(50, size)) : 4,
      color,
      opacity: opacity !== null ? Math.max(0, Math.min(1, opacity)) : 0.7,
    };
  }
  if (e.type === "animation") {
    // A normal artist-supplied animated GIF swapped in on hover — the source
    // may legitimately be unset yet (the field/runtime support exists so it
    // can be assigned later, per spec); an unset source is simply a no-op at
    // hover time, never a reason to drop the effect entry itself.
    //
    // `speed` is a playback MULTIPLIER on the GIF's own authored frame
    // timing (never a replacement for it), authored here as the DEFAULT —
    // see decodeGifFrames()/startDecodedGifPlayback() in public/app.js for
    // the runtime that actually plays it back at this rate (browser
    // ImageDecoder decodes the real per-frame delays once; each frame's
    // effective delay is simply originalDelay / speed — no separate fps/
    // frame-count concept exists here to author). A later runtime override
    // (e.g. a book flipping faster during active Council processing) stacks
    // on top of this author-defined base value without touching it — see
    // setSceneObjectAnimationSpeedOverride(), public/app.js.
    //
    // Snapped to the F8 slider's own discrete stops (0.5..3.0 by 0.5) rather
    // than merely clamped, so a hand-edited or legacy in-between value (e.g.
    // 1.8) always lands on a value the UI can actually display/re-select.
    //
    // A short-lived "spriteSheet" mode (manual frameWidth/frameHeight/
    // frameCount/fps/loop authoring) existed briefly and has been removed in
    // favor of this decoded-GIF approach — those fields are never persisted
    // for ANY input anymore, even if still present in old saved data (see
    // the "legacy" sanitizer test), so an old scene file loads cleanly with
    // its Animation effect surviving as just {type, source, speed}.
    const speed = num(e.speed);
    const out = {
      type: "animation",
      source: projectAssetPath(e.source, /^assets\/[\w\-./ ]+\.(gif|png|webp)$/i),
      speed: speed !== null && speed > 0 ? snapAnimationSpeed(speed) : 1,
    };
    // `behavior`: an OPTIONAL path to an external Behavior JSON file (see
    // src/services/animationBehavior.js for the validated shape of the file
    // itself). Scene Config stores ONLY this path, never the file's
    // contents — the runtime (public/app.js) loads/parses/caches it
    // separately, same "path in config, content on disk" split already used
    // for `source` above. Omitted entirely when unset/invalid, matching
    // every other optional field in this sanitizer (never written as "").
    const behavior = projectAssetPath(e.behavior, /^assets\/[\w\-./ ]+\.json$/i);
    if (behavior) out.behavior = behavior;
    return out;
  }
  // effectDefinition: a future external, DECLARATIVE-ONLY effect preset
  // reference. Not consumed by any runtime code yet (see the module comment
  // above) — schema-only so it can be wired up later without another
  // migration. A missing/invalid source drops the entry: unlike the other
  // types, this one is nothing BUT its source reference.
  const source = projectAssetPath(e.source, /^assets\/[\w\-./ ]+\.json$/i);
  return source ? { type: "effectDefinition", source } : null;
}

function sanitizeHoverEffects(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeHoverEffect).filter(Boolean);
}

// Absent/never-authored -> null (a freshly-minted Prop has no Player
// Interaction block at all, same "omit rather than write an inert default"
// convention as sanitizeShadow/sanitizeInteractionSlots). Once the author
// either turns Enabled on OR adds at least one effect, the block persists —
// an authored-but-currently-off state is meaningful data (the effects list
// is worth keeping even while toggled off), not nothing.
function sanitizePlayerInteraction(pi) {
  if (!pi || typeof pi !== "object") return null;
  const effects = sanitizeHoverEffects(pi.hover?.effects);
  const enabled = pi.enabled === true;
  if (!enabled && effects.length === 0) return null;
  return { enabled, hover: { effects } };
}

function sanitizeSceneObject(o) {
  if (!o || typeof o !== "object") return null;

  // v2: instance_id + asset_uid + scale.
  if (typeof o.instance_id === "string" && o.instance_id && typeof o.asset_uid === "string" && o.asset_uid) {
    const x = num(o.x);
    const y = num(o.y);
    const scale = num(o.scale);
    if (x === null || y === null || scale === null || scale < 0) return null;
    const z = num(o.z);
    const renderLayer = num(o.renderLayer);
    const sortY = num(o.sortY);
    return {
      instance_id: o.instance_id,
      asset_uid: o.asset_uid,
      x,
      y,
      scale,
      flipX: o.flipX === true, // absent/malformed → false (compat default)
      ...(z !== null ? { z } : {}),
      // Depth layers: renderLayer clamps to the 0..9 band range; sortY is a
      // free scene-px ground line. Absent = dynamic Y-sort (compat default).
      ...(renderLayer !== null ? { renderLayer: Math.max(0, Math.min(9, Math.round(renderLayer))) } : {}),
      ...(sortY !== null ? { sortY } : {}),
      ...(() => {
        const collision = sanitizeCollision(o.collision);
        return collision ? { collision } : {};
      })(),
      ...(() => {
        const shadow = sanitizeShadow(o.shadow);
        return shadow ? { shadow } : {};
      })(),
      ...(() => {
        const interactionSlots = sanitizeInteractionSlots(o.interactionSlots);
        return interactionSlots ? { interactionSlots } : {};
      })(),
      // Advanced transform (free scale + four-corner perspective). Emitted
      // ONLY when it carries something — an untransformed Prop gains no key,
      // so every existing Scene serializes byte-identically. See
      // src/services/propTransform.js for the schema and the homography.
      ...(() => {
        const transform = sanitizePropTransform(o.transform);
        return transform ? { transform } : {};
      })(),
      // Player Interaction (hover effects) — see sanitizePlayerInteraction's
      // own comment above. Scene-config (registry) Props only, matching this
      // task's scope; the baked-object schema (sceneLayout.js) is untouched.
      ...(() => {
        const playerInteraction = sanitizePlayerInteraction(o.playerInteraction);
        return playerInteraction ? { playerInteraction } : {};
      })(),
      // Prop Footprint milestone: forward reference to this Prop instance's
      // owned canonical Slot (state.characterSlots, sceneLayout.js) — the
      // reciprocal ownerPropId lives on that Slot. See sanitizeObject's
      // matching slotId field in sceneLayout.js for the baked-object half
      // of this same schema addition.
      ...(typeof o.slotId === "string" && o.slotId.trim() ? { slotId: o.slotId.trim() } : {}),
      // Ground Projection calibration: a designer-authored, per-instance
      // offset used ONLY by the owned Slot/Footprint — independent of
      // collision/shadow/sortY/x/y above. Absent/malformed = 0,0 (a no-op:
      // groundProjection === this Prop's own x/y anchor exactly), so a
      // legacy Prop behaves identically to before this field existed.
      ...(() => {
        const gx = num(o.groundOffsetX);
        const gy = num(o.groundOffsetY);
        return { ...(gx ? { groundOffsetX: gx } : {}), ...(gy ? { groundOffsetY: gy } : {}) };
      })(),
    };
  }

  // v1 fallback: { id, asset, x, y, width } — passed through untouched so a
  // legacy config survives a round-trip.
  if (typeof o.id === "string" && o.id && typeof o.asset === "string" && /^assets\//.test(o.asset)) {
    const x = num(o.x);
    const y = num(o.y);
    const width = num(o.width);
    if (x === null || y === null || width === null || width <= 0) return null;
    const z = num(o.z);
    return { id: o.id, asset: o.asset, x, y, width, ...(z !== null ? { z } : {}) };
  }

  return null;
}

export function sanitizeSceneConfig(raw) {
  const seen = new Set();
  const objects = (Array.isArray(raw?.objects) ? raw.objects : [])
    .map(sanitizeSceneObject)
    .filter(Boolean)
    // instance ids must stay unique — a duplicate would render twice.
    .filter((o) => {
      const key = o.instance_id || o.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    version: 2,
    scene: typeof raw?.scene === "string" && raw.scene ? raw.scene : "classic_library",
    ...(typeof raw?._format === "string" ? { _format: raw._format } : {}),
    objects,
  };
}

export async function loadSceneConfig() {
  try {
    return sanitizeSceneConfig(JSON.parse(await fs.readFile(SCENE_CONFIG_PATH, "utf8")));
  } catch (err) {
    if (err.code === "ENOENT") return { version: 2, scene: "classic_library", objects: [] };
    throw err;
  }
}

// Persists the scene config, PRESERVING the existing _format documentation
// string when the caller didn't send one.
export async function saveSceneConfig(raw) {
  let existingFormat;
  try {
    existingFormat = JSON.parse(await fs.readFile(SCENE_CONFIG_PATH, "utf8"))?._format;
  } catch {
    /* first save */
  }
  const cfg = sanitizeSceneConfig(raw);
  if (!cfg._format && typeof existingFormat === "string") cfg._format = existingFormat;
  await fs.mkdir(path.dirname(SCENE_CONFIG_PATH), { recursive: true });
  await fs.writeFile(SCENE_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  return cfg;
}
