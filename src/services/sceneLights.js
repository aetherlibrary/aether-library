// Light System v1 — Scene-owned lights.
//
// STYLIZED, NOT PHYSICAL. This is a 2D/2.5D pixel-art scene: lights are
// authored overlays, not a lighting model. Nothing here computes normals,
// occlusion or bounce, and nothing is baked into any source art — the renderer
// composites a separate layer that can be removed without touching a single
// background, prop, sprite or generated Shadow PNG.
//
// OWNERSHIP: lights belong to the SCENE, exactly like objects and zones. There
// is no light file. They live in data/scene-layout.json and travel inside ALS,
// so New Scene empties them and opening another Scene REPLACES them.
//
// FUTURE, deliberately not implemented here but not designed out either:
//   * Light Blockers — a SEPARATE Scene collection (`lightBlockers: []`) that
//     will reuse the existing Rectangle/Ellipse/Polygon authoring geometry.
//     Kept separate from movement Zones on purpose: an obstacle to light is
//     not an obstacle to walking.
//   * Post Effects — bloom/brightness/contrast/saturation/grading/vignette/
//     grain. No empty controls are added for them now; they will be their own
//     Scene collection, not fields on a Light.
//   * Projected shadows — `castShadows`/`shadowStrength` are authored and
//     persisted now so the data exists before the renderer does.

const LIGHT_TYPES = ["directional", "point", "spot"];

export const SCENE_LIGHT_TYPES = Object.freeze([
  Object.freeze({ id: "directional", label: "Directional Light" }),
  Object.freeze({ id: "point", label: "Point Light" }),
  Object.freeze({ id: "spot", label: "Spot Light" }),
]);

export const DEFAULT_LIGHT_TYPE = "directional";
export const MAX_SCENE_LIGHTS = 64;

// Ranges. One table so the inspector, the sanitizer and the tests agree.
export const LIGHT_LIMITS = Object.freeze({
  intensity: { min: 0, max: 2 },
  // Directional
  angle: { min: 0, max: 360 },
  shadowStrength: { min: 0, max: 1 },
  shadowLength: { min: 0, max: 1 },
  shadowSoftness: { min: 0, max: 1 },
  // Point / Spot — position is a NORMALIZED scene coordinate, the same 0..1
  // space every scene object already uses, so a light lands in the same place
  // at any resolution.
  x: { min: -1, max: 2 },
  y: { min: -1, max: 2 },
  radius: { min: 0, max: 2 },
  falloff: { min: 0, max: 1 },
  // Spot
  coneAngle: { min: 1, max: 360 },
  distance: { min: 0, max: 3 },
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Per-type defaults. Explicit constants, never derived, so "what does a new
// Point Light look like" is answerable from one place.
export const LIGHT_DEFAULTS = Object.freeze({
  directional: Object.freeze({
    color: "#ffd9a0", // warm daylight
    intensity: 1,
    // 45 deg in SCREEN space (y grows downward) = travelling down-right,
    // i.e. light coming FROM the upper left. See shadowVector() in app.js.
    angle: 45,
    castShadows: false,
    shadowStrength: 0.5,
    // How far a Light Blocker's shadow is thrown, as a fraction of the scene's
    // width. Stylized: a longer shadow reads as a lower sun, nothing more.
    shadowLength: 0.12,
    // Edge softness of the projected shadow. Implemented as a CSS blur on the
    // projection layer — see applyLightBlockerShadows in public/app.js.
    shadowSoftness: 0.3,
  }),
  point: Object.freeze({
    color: "#ffc46b", // candle / lamp
    intensity: 1,
    x: 0.5,
    y: 0.5,
    radius: 0.25,
    falloff: 0.6,
  }),
  spot: Object.freeze({
    color: "#ffffff",
    intensity: 1,
    x: 0.5,
    y: 0.4,
    angle: 90, // pointing down
    coneAngle: 45,
    distance: 0.6,
    falloff: 0.5,
  }),
});

function clamp(value, fallback, range) {
  let n;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value);
  else return fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

function cleanName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const v = value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 60);
  return v || fallback;
}

export function lightTypeLabel(type) {
  return SCENE_LIGHT_TYPES.find((t) => t.id === type)?.label || SCENE_LIGHT_TYPES[0].label;
}

// "Directional Light 01" — the next free number for that TYPE, so deleting a
// light never causes a duplicate name later.
export function nextLightName(lights, type) {
  const label = lightTypeLabel(type);
  const used = new Set(
    (Array.isArray(lights) ? lights : [])
      .filter((l) => l?.type === type)
      .map((l) => {
        const m = new RegExp(`^${label} (\\d+)$`).exec(String(l?.name || ""));
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n !== null)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `${label} ${String(n).padStart(2, "0")}`;
}

// Stable, unique, and never derived from a name (renaming must not re-key a
// light). `randomId` is injectable so tests get deterministic ids.
export function newLightId(randomId = () => Math.random().toString(36).slice(2, 10)) {
  return `light-${randomId()}`;
}

// STRICT ALLOWLIST. The output is built from the known field list for the
// resolved type, so an unknown key — or a field belonging to a different light
// type — cannot enter the Scene. A malformed light is DROPPED (returns null)
// rather than repaired into something the author never authored.
export function sanitizeSceneLight(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = LIGHT_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const d = LIGHT_DEFAULTS[type];

  const out = {
    id,
    type,
    name: cleanName(raw.name, lightTypeLabel(type)),
    enabled: raw.enabled !== false,
    color: typeof raw.color === "string" && HEX_COLOR.test(raw.color.trim()) ? raw.color.trim().toLowerCase() : d.color,
    intensity: clamp(raw.intensity, d.intensity, LIGHT_LIMITS.intensity),
  };

  if (type === "directional") {
    out.angle = clamp(raw.angle, d.angle, LIGHT_LIMITS.angle);
    out.castShadows = raw.castShadows === true;
    out.shadowStrength = clamp(raw.shadowStrength, d.shadowStrength, LIGHT_LIMITS.shadowStrength);
    out.shadowLength = clamp(raw.shadowLength, d.shadowLength, LIGHT_LIMITS.shadowLength);
    out.shadowSoftness = clamp(raw.shadowSoftness, d.shadowSoftness, LIGHT_LIMITS.shadowSoftness);
  } else if (type === "point") {
    out.x = clamp(raw.x, d.x, LIGHT_LIMITS.x);
    out.y = clamp(raw.y, d.y, LIGHT_LIMITS.y);
    out.radius = clamp(raw.radius, d.radius, LIGHT_LIMITS.radius);
    out.falloff = clamp(raw.falloff, d.falloff, LIGHT_LIMITS.falloff);
  } else {
    out.x = clamp(raw.x, d.x, LIGHT_LIMITS.x);
    out.y = clamp(raw.y, d.y, LIGHT_LIMITS.y);
    out.angle = clamp(raw.angle, d.angle, LIGHT_LIMITS.angle);
    out.coneAngle = clamp(raw.coneAngle, d.coneAngle, LIGHT_LIMITS.coneAngle);
    out.distance = clamp(raw.distance, d.distance, LIGHT_LIMITS.distance);
    out.falloff = clamp(raw.falloff, d.falloff, LIGHT_LIMITS.falloff);
  }
  return out;
}

// The Scene's whole lights collection. Absent/malformed input yields [] — a
// Scene without lights is completely normal, never a load failure. Duplicate
// ids collapse to the first, so a hand-edited file cannot produce two lights
// the editor cannot tell apart.
export function sanitizeSceneLights(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const light = sanitizeSceneLight(entry);
    if (!light || seen.has(light.id)) continue;
    seen.add(light.id);
    out.push(light);
    if (out.length >= MAX_SCENE_LIGHTS) break;
  }
  return out;
}

// A new light of `type`, named for the lights already present.
export function createSceneLight(type, existingLights, randomId) {
  const t = LIGHT_TYPES.includes(type) ? type : DEFAULT_LIGHT_TYPE;
  return sanitizeSceneLight({
    id: newLightId(randomId),
    type: t,
    name: nextLightName(existingLights, t),
    enabled: true,
    ...LIGHT_DEFAULTS[t],
  });
}

// Duplicate: same values, a NEW id, and the next free name for its type.
export function duplicateSceneLight(light, existingLights, randomId) {
  const clean = sanitizeSceneLight(light);
  if (!clean) return null;
  return sanitizeSceneLight({
    ...clean,
    id: newLightId(randomId),
    name: nextLightName(existingLights, clean.type),
  });
}

// ======================================================= Light Blockers v1
// Fake 2D occluders. A Light Blocker is a surface that stops light — a window
// frame, a beam, a pillar — used to create the ILLUSION of 3D environmental
// shadowing in a 2.5D scene. No ray tracing: a blocker's geometry is projected
// away from the light and drawn as a translucent dark shape.
//
// SEPARATE FROM MOVEMENT ZONES, deliberately and permanently. A blocker is not
// a fourth zone type and never enters `zones`: an obstacle to light is not an
// obstacle to walking, and the two must be able to evolve independently. The
// editor reuses zone GEOMETRY (rect / ellipse / polygon) and its drawing
// interaction; only the persistence is separate.
//
// FUTURE-COMPATIBLE BY SHAPE, none of it implemented here:
//   * partial transmission and stained-glass tint — `opacity` is already a
//     0..1 blocking strength, and a `tint` field slots beside it.
//   * per-light blocker masks — `blocks` is already a per-light-TYPE map, so
//     narrowing it to specific light ids is an additive change.
//   * Point/Spot occlusion — `blocks.point` / `blocks.spot` are authored and
//     persisted now; only the directional RENDERER exists in v1.
//   * animated blockers — nothing here assumes a blocker is static.

export const BLOCKER_SHAPES = ["rect", "ellipse", "polygon"];
export const DEFAULT_BLOCKER_SHAPE = "rect";
export const MAX_SCENE_LIGHT_BLOCKERS = 256;

export const BLOCKER_LIMITS = Object.freeze({
  x: { min: -1, max: 2 },
  y: { min: -1, max: 2 },
  w: { min: 0.001, max: 3 },
  h: { min: 0.001, max: 3 },
  opacity: { min: 0, max: 1 },
  softness: { min: 0, max: 1 },
});

export const BLOCKER_DEFAULTS = Object.freeze({
  // Normalized scene coordinates, the same 0..1 space zones and objects use.
  rect: Object.freeze({ x: 0.4, y: 0.35, w: 0.2, h: 0.15 }),
  opacity: 1,
  softness: 0,
});

// Which light TYPES this blocker occludes. Directional is the only one with a
// renderer in v1; the other two are authored and persisted so enabling them
// later needs no migration.
function sanitizeBlocks(raw) {
  const b = raw && typeof raw === "object" ? raw : {};
  return {
    directional: b.directional !== false, // default ON — the v1 use case
    point: b.point === true,
    spot: b.spot === true,
  };
}

export function nextBlockerName(blockers) {
  const used = new Set(
    (Array.isArray(blockers) ? blockers : [])
      .map((b) => {
        const m = /^blocker-(\d+)$/.exec(String(b?.name || ""));
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n !== null)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `blocker-${String(n).padStart(2, "0")}`;
}

export function newBlockerId(randomId = () => Math.random().toString(36).slice(2, 10)) {
  return `blocker-${randomId()}`;
}

// STRICT ALLOWLIST, same rule as a light: an unknown key cannot enter, and a
// malformed blocker is DROPPED rather than repaired. A polygon needs at least
// three valid vertices — an incomplete shape is worse than absence, the same
// rule sanitizeZone already applies.
export function sanitizeLightBlocker(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const shape = BLOCKER_SHAPES.includes(raw.shape) ? raw.shape : DEFAULT_BLOCKER_SHAPE;

  const out = {
    id,
    shape,
    name: cleanName(raw.name, id),
    enabled: raw.enabled !== false,
    blocks: sanitizeBlocks(raw.blocks),
    opacity: clamp(raw.opacity, BLOCKER_DEFAULTS.opacity, BLOCKER_LIMITS.opacity),
    softness: clamp(raw.softness, BLOCKER_DEFAULTS.softness, BLOCKER_LIMITS.softness),
  };

  if (shape === "polygon") {
    const pts = Array.isArray(raw.points) ? raw.points : [];
    const points = pts
      .map((p) => {
        const x = clampOrNull(p?.x, BLOCKER_LIMITS.x);
        const y = clampOrNull(p?.y, BLOCKER_LIMITS.y);
        return x === null || y === null ? null : { x, y };
      })
      .filter(Boolean);
    if (points.length < 3) return null;
    out.points = points;
    return out;
  }
  const r = raw.rect && typeof raw.rect === "object" ? raw.rect : {};
  out.rect = {
    x: clamp(r.x, BLOCKER_DEFAULTS.rect.x, BLOCKER_LIMITS.x),
    y: clamp(r.y, BLOCKER_DEFAULTS.rect.y, BLOCKER_LIMITS.y),
    w: clamp(r.w, BLOCKER_DEFAULTS.rect.w, BLOCKER_LIMITS.w),
    h: clamp(r.h, BLOCKER_DEFAULTS.rect.h, BLOCKER_LIMITS.h),
  };
  return out;
}

function clampOrNull(value, range) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(range.max, Math.max(range.min, value));
}

export function sanitizeLightBlockers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const b = sanitizeLightBlocker(entry);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
    if (out.length >= MAX_SCENE_LIGHT_BLOCKERS) break;
  }
  return out;
}

export function createLightBlocker(shape, existing, randomId) {
  const s = BLOCKER_SHAPES.includes(shape) ? shape : DEFAULT_BLOCKER_SHAPE;
  const base = {
    id: newBlockerId(randomId),
    shape: s,
    name: nextBlockerName(existing),
    enabled: true,
  };
  if (s === "polygon") {
    const { x, y, w, h } = BLOCKER_DEFAULTS.rect;
    // A triangle: the minimum a polygon can be, so the author immediately has
    // real vertices to drag rather than an invalid shape.
    base.points = [
      { x: x + w / 2, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  } else {
    base.rect = { ...BLOCKER_DEFAULTS.rect };
  }
  return sanitizeLightBlocker(base);
}

export function duplicateLightBlocker(blocker, existing, randomId) {
  const clean = sanitizeLightBlocker(blocker);
  if (!clean) return null;
  const copy = { ...clean, id: newBlockerId(randomId), name: nextBlockerName(existing) };
  if (clean.rect) copy.rect = { ...clean.rect };
  if (clean.points) copy.points = clean.points.map((p) => ({ ...p }));
  return sanitizeLightBlocker(copy);
}

// The axis-aligned bounds of any blocker shape, in normalized scene space.
// One place, so the renderer and the editor agree.
export function blockerBounds(blocker) {
  if (blocker?.shape === "polygon") {
    const xs = blocker.points.map((p) => p.x);
    const ys = blocker.points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { ...(blocker?.rect || BLOCKER_DEFAULTS.rect) };
}
