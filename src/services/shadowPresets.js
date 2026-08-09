// Auto Shadow Generation v1 — the authoritative preset constants, the
// generation parameter schema, and the shared Shadow sanitizer.
//
// WHAT THIS IS NOT: a second Shadow renderer. Generation is an AUTHORING tool
// that produces a PNG and feeds it into the Shadow `asset` field the existing
// runtime renderer already reads. Every transform the author already had
// (Shadow X/Y, Width, Height, Opacity) keeps working unchanged, on a generated
// Shadow exactly as on a custom one.
//
// WHERE THE PIXELS ARE MADE: in the browser, by the F8 editor, using Canvas
// 2D. The project has NO server-side image library (no sharp, jimp, canvas or
// pngjs) and Node has no built-in ImageData — but the runtime already reads
// alpha channels this way in measureShadowContent() (public/app.js), from
// same-origin /assets/ images, so the canvas is never tainted. The server only
// validates and atomically writes the finished PNG. No new dependency.
//
// SHARED SANITIZER: sceneLayout.js and sceneConfig.js each carried a
// byte-identical copy of sanitizeShadow. They now both import this one, so the
// new fields cannot land in a Scene's baked objects but not its props.

import { sanitizeProjectAssetPath } from "./assetPaths.js";

// ------------------------------------------------------------------ modes
// "custom"    — the author imported a Shadow image themselves. Unchanged.
// "generated" — the Shadow PNG was derived from the object's source sprite.
// Absent/unknown reads as "custom", so every pre-existing Shadow keeps its
// exact meaning without a migration.
export const SHADOW_SOURCE_MODES = ["custom", "generated"];
export const DEFAULT_SHADOW_SOURCE = "custom";

export const SHADOW_PRESET_IDS = ["contact", "character", "projected"];
export const DEFAULT_SHADOW_PRESET = "contact";

// Soft may blur; Pixel keeps integer bounds, nearest-neighbour scaling and
// quantized alpha so pixel art never picks up smeared edges.
export const SHADOW_EDGE_STYLES = ["soft", "pixel"];
export const DEFAULT_SHADOW_EDGE_STYLE = "soft";

// Everything generated lands here, and nowhere else.
export const GENERATED_SHADOW_ROOT = "assets/shadows/generated/";

// ---------------------------------------------------------------- presets
// EXPLICIT constants, in one place, so a preset is data a test can assert
// rather than behaviour buried in the generator.
//
//   alphaThreshold — alpha (0-255) at or above which a source pixel counts as
//                    silhouette. Higher = tighter, drops soft sprite edges.
//   dilate         — silhouette expansion in source pixels, before transform.
//   blur           — softening radius in output pixels (Soft edge style only).
//   scaleX/scaleY  — silhouette scaling. scaleY < 1 is the vertical squash
//                    that turns an upright sprite into a ground shadow.
//   skewX          — horizontal lean, for a directional cast.
//   offsetX/offsetY— shift within the generated canvas, in output pixels.
//   opacity        — the mask's own peak alpha (0-1). The object's Shadow
//                    Opacity still multiplies this at runtime.
//   color          — mask colour. Neutral by design; see the tint note below.
export const SHADOW_PRESETS = Object.freeze({
  // Furniture and grounded props: short, wider than the object, hugging the
  // bottom anchor, moderate softness.
  contact: Object.freeze({
    id: "contact",
    label: "Contact",
    alphaThreshold: 24,
    dilate: 1,
    blur: 3,
    scaleX: 1.12,
    scaleY: 0.22,
    skewX: 0,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.55,
    color: "#000000",
    edgeStyle: "soft",
  }),
  // NPCs and the player: a soft simplified footprint under the foot anchor.
  // The high threshold plus heavy dilate+blur is what discards noisy full-body
  // silhouette detail instead of preserving a recognisable body outline.
  character: Object.freeze({
    id: "character",
    label: "Character",
    alphaThreshold: 96,
    dilate: 3,
    blur: 6,
    scaleX: 0.85,
    scaleY: 0.16,
    skewX: 0,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.45,
    color: "#000000",
    edgeStyle: "soft",
  }),
  // Taller objects and stylised directional casts: the silhouette is kept
  // (low threshold), squashed vertically, stretched and leaned horizontally.
  // skewX/scaleY are the seam a future Scene light direction/length drives —
  // it can re-run generation with different values without any schema change.
  projected: Object.freeze({
    id: "projected",
    label: "Projected",
    alphaThreshold: 16,
    dilate: 0,
    blur: 2,
    scaleX: 1.35,
    scaleY: 0.45,
    skewX: -0.55,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.4,
    color: "#000000",
    edgeStyle: "soft",
  }),
});

// Ranges every authored value is clamped into. One table so the UI, the
// sanitizer and the tests agree on what is legal.
export const SHADOW_GENERATION_LIMITS = Object.freeze({
  alphaThreshold: { min: 0, max: 255 },
  dilate: { min: 0, max: 32 },
  blur: { min: 0, max: 32 },
  scaleX: { min: 0.05, max: 4 },
  scaleY: { min: 0.02, max: 4 },
  skewX: { min: -2, max: 2 },
  offsetX: { min: -512, max: 512 },
  offsetY: { min: -512, max: 512 },
  opacity: { min: 0, max: 1 },
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clampNum(value, fallback, { min, max }) {
  // Only a real number, or a numeric STRING, counts. Number() would turn
  // null, "", [] and false into 0 — which is finite, so they would clamp to
  // the range minimum instead of falling back to the preset's value.
  let n;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value);
  else return fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function shadowPreset(id) {
  return SHADOW_PRESETS[id] || SHADOW_PRESETS[DEFAULT_SHADOW_PRESET];
}

// The generation parameters for one object: the preset's values, with any
// authored override clamped on top. Driven by the preset's own key list, so an
// unknown field cannot enter the document.
export function sanitizeShadowGeneration(raw, presetId = DEFAULT_SHADOW_PRESET) {
  const base = shadowPreset(presetId);
  const g = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of Object.keys(SHADOW_GENERATION_LIMITS)) {
    out[key] = clampNum(g[key], base[key], SHADOW_GENERATION_LIMITS[key]);
  }
  out.color = typeof g.color === "string" && HEX_COLOR.test(g.color.trim()) ? g.color.trim().toLowerCase() : base.color;
  out.edgeStyle = SHADOW_EDGE_STYLES.includes(g.edgeStyle) ? g.edgeStyle : base.edgeStyle;
  return out;
}

// ------------------------------------------------------------- file naming
// A stable name derived from the SOURCE ASSET id, not the Scene instance —
// two instances of the same Prop share one generated PNG and differ only in
// their instance-level position/width/height/opacity. See the reuse note in
// the F8 panel and docs.
//
// Falls back to a scene-instance id only when the object has no reusable asset
// identity at all (a baked cast member), which is why the caller passes both.
export function generatedShadowId(assetId, fallbackId) {
  const raw = String(assetId || fallbackId || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return cleaned;
}

export function generatedShadowPath(assetId, presetId, fallbackId) {
  const id = generatedShadowId(assetId, fallbackId);
  if (!id) return "";
  const preset = SHADOW_PRESET_IDS.includes(presetId) ? presetId : DEFAULT_SHADOW_PRESET;
  return `${GENERATED_SHADOW_ROOT}${id}_${preset}.png`;
}

// Generated output may live ONLY under the generated root, and only as a PNG.
// Same shared validator every other project asset path uses, so traversal,
// absolute paths, UNC and URLs are refused identically.
export function sanitizeGeneratedShadowPath(value) {
  return sanitizeProjectAssetPath(value, { root: GENERATED_SHADOW_ROOT, extensions: [".png"] });
}

// ------------------------------------------------------------- the schema
// THE shared Shadow sanitizer (previously duplicated byte-for-byte in
// sceneLayout.js and sceneConfig.js).
//
// The transform fields are unchanged. `source`, `preset` and `generation` are
// additive and only meaningful in generated mode; `tint` is a reserved
// SCHEMA LOCATION only — a neutral mask is generated and global Shadow Tint is
// deliberately deferred to the future Camera/Effects system, which must be
// able to re-tint without regenerating any PNG.
export function sanitizeShadowComponent(s, num) {
  if (!s || typeof s !== "object") return null;
  const out = { enabled: s.enabled !== false };
  if (typeof s.asset === "string" && /^assets\/[\w\-./ ]+\.png$/i.test(s.asset) && !s.asset.includes("..")) {
    out.asset = s.asset;
  }
  for (const k of ["offsetX", "offsetY"]) {
    const v = num(s[k]);
    if (v !== null) out[k] = v;
  }
  for (const k of ["width", "height"]) {
    const v = num(s[k]);
    if (v !== null && v > 0) out[k] = v;
  }
  const op = num(s.opacity);
  if (op !== null) out.opacity = Math.max(0, Math.min(1, op));

  // Auto Shadow Generation. Absent source = "custom" = exactly the old
  // behaviour, so no migration is needed for any existing Scene.
  const source = SHADOW_SOURCE_MODES.includes(s.source) ? s.source : DEFAULT_SHADOW_SOURCE;
  if (source !== DEFAULT_SHADOW_SOURCE) out.source = source;
  if (source === "generated") {
    out.preset = SHADOW_PRESET_IDS.includes(s.preset) ? s.preset : DEFAULT_SHADOW_PRESET;
    out.generation = sanitizeShadowGeneration(s.generation, out.preset);
    // The generated file, validated against its own root. Kept separate from
    // `asset` so switching to Custom and back does not lose it.
    const gen = sanitizeGeneratedShadowPath(s.generatedAsset);
    if (gen) out.generatedAsset = gen;
  }
  // Reserved for the future Camera/Effects tint. Only a hex colour survives;
  // nothing reads it yet.
  if (typeof s.tint === "string" && HEX_COLOR.test(s.tint.trim())) out.tint = s.tint.trim().toLowerCase();
  return out;
}
