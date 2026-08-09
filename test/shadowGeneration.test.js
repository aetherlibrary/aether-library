// Auto Shadow Generation v1.
//
// WHAT THIS IS: an AUTHORING tool that derives a Shadow PNG from an object's
// own sprite and feeds it into the Shadow `asset` field the existing runtime
// renderer already reads. It is NOT a second Shadow renderer, and every
// transform the author already had (Shadow X/Y, Width, Height, Opacity) keeps
// working identically on a generated Shadow.
//
// THE DEPENDENCY ANSWER, recorded so nobody re-derives it: the project has no
// server-side image library (no sharp, jimp, canvas or pngjs) and Node has no
// built-in ImageData. None was added. The pixels are made in the browser with
// Canvas 2D — the same way the runtime already reads alpha in
// measureShadowContent() — and the server only validates and atomically writes
// the finished PNG.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  SHADOW_PRESETS,
  SHADOW_PRESET_IDS,
  SHADOW_SOURCE_MODES,
  SHADOW_EDGE_STYLES,
  SHADOW_GENERATION_LIMITS,
  GENERATED_SHADOW_ROOT,
  DEFAULT_SHADOW_SOURCE,
  shadowPreset,
  sanitizeShadowGeneration,
  generatedShadowPath,
  generatedShadowId,
  sanitizeGeneratedShadowPath,
  sanitizeShadowComponent,
} from "../src/services/shadowPresets.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const shadow = (s) => sanitizeShadowComponent(s, num);

// ======================================================== no new dependency

test("no image-processing dependency was added", async () => {
  const pkg = JSON.parse(await readSource("../package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["express", "pdf-parse"]);
  for (const forbidden of ["sharp", "jimp", "canvas", "pngjs", "gm", "@napi-rs/canvas"]) {
    assert.ok(!pkg.dependencies[forbidden], `${forbidden} must not be a dependency`);
    assert.ok(!(pkg.devDependencies || {})[forbidden], `${forbidden} must not be a devDependency`);
  }
});

test("the server never decodes an image — it validates and writes bytes", async () => {
  const server = await readSource("../src/server.js");
  const start = server.indexOf('app.post("/api/dev/shadow/generate"');
  const route = server.slice(start, server.indexOf("\n  });", start));
  assert.ok(route.length > 0, "could not locate the generate route");
  // PNG magic + a size cap is the whole validation; no pixel work server-side.
  assert.match(route, /const PNG_MAGIC = Buffer\.from\(\[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a\]\);/);
  assert.match(route, /bytes\.subarray\(0, 8\)\.equals\(PNG_MAGIC\)/);
  assert.doesNotMatch(route, /getImageData|createCanvas|sharp|jimp/);
});

// ================================================================= presets

test("all three presets exist as explicit constants", () => {
  assert.deepEqual(SHADOW_PRESET_IDS, ["contact", "character", "projected"]);
  assert.deepEqual(Object.keys(SHADOW_PRESETS).sort(), ["character", "contact", "projected"]);
  for (const id of SHADOW_PRESET_IDS) {
    const p = SHADOW_PRESETS[id];
    assert.equal(p.id, id);
    for (const key of Object.keys(SHADOW_GENERATION_LIMITS)) {
      assert.equal(typeof p[key], "number", `${id}.${key} must be an explicit number`);
    }
    assert.match(p.color, /^#[0-9a-f]{6}$/i);
    assert.ok(SHADOW_EDGE_STYLES.includes(p.edgeStyle));
    assert.ok(Object.isFrozen(p), "presets are constants, not mutable defaults");
  }
});

test("Contact reads as a grounded contact shadow: short, wider, moderate softness", () => {
  const p = SHADOW_PRESETS.contact;
  assert.ok(p.scaleY < 0.3, "short");
  assert.ok(p.scaleX > 1, "horizontally wider than the object");
  assert.equal(p.skewX, 0, "no directional lean");
  assert.ok(p.blur > 0 && p.blur < 5, "moderate softness");
  assert.ok(p.offsetY === 0, "sits at the object's own bottom anchor");
});

test("Character avoids preserving noisy full-body silhouette detail", () => {
  const p = SHADOW_PRESETS.character;
  // A HIGH threshold drops soft sprite edges, and heavy dilate+blur collapses
  // what is left into a simplified footprint rather than a body outline.
  assert.ok(p.alphaThreshold > SHADOW_PRESETS.contact.alphaThreshold, "tighter threshold");
  assert.ok(p.alphaThreshold > SHADOW_PRESETS.projected.alphaThreshold);
  assert.ok(p.dilate >= 3, "expanded into a blob");
  assert.ok(p.blur >= 5, "the softest of the three");
  assert.ok(p.scaleY <= 0.2, "a flat oval under the foot anchor");
  assert.ok(p.scaleX < 1, "narrower than the sprite — a footprint, not a body");
});

test("Projected is derived from the silhouette, squashed and leaned", () => {
  const p = SHADOW_PRESETS.projected;
  // The LOWEST threshold: the silhouette is the point here.
  assert.ok(p.alphaThreshold < SHADOW_PRESETS.character.alphaThreshold);
  assert.equal(p.dilate, 0, "no blobbing — detail is preserved");
  assert.ok(p.scaleY < 1 && p.scaleY > SHADOW_PRESETS.contact.scaleY, "vertically compressed, not flattened");
  assert.ok(p.scaleX > 1, "horizontally stretched");
  assert.notEqual(p.skewX, 0, "a directional cast");
  // Direction and length are ordinary parameters, so a future Scene light can
  // drive them without any schema change.
  assert.ok(SHADOW_GENERATION_LIMITS.skewX.min < 0 && SHADOW_GENERATION_LIMITS.skewX.max > 0);
});

test("the three presets are genuinely distinct", () => {
  const sig = (p) => `${p.alphaThreshold}|${p.dilate}|${p.blur}|${p.scaleX}|${p.scaleY}|${p.skewX}`;
  const sigs = SHADOW_PRESET_IDS.map((id) => sig(SHADOW_PRESETS[id]));
  assert.equal(new Set(sigs).size, 3);
});

test("an unknown preset falls back to Contact", () => {
  assert.equal(shadowPreset("nope").id, "contact");
  assert.equal(shadowPreset(undefined).id, "contact");
});

// ================================================ generation parameters

test("authored parameters override the preset and are clamped", () => {
  const g = sanitizeShadowGeneration({ blur: 999, scaleY: -5, alphaThreshold: 500, skewX: 99 }, "contact");
  assert.equal(g.blur, SHADOW_GENERATION_LIMITS.blur.max);
  assert.equal(g.scaleY, SHADOW_GENERATION_LIMITS.scaleY.min);
  assert.equal(g.alphaThreshold, SHADOW_GENERATION_LIMITS.alphaThreshold.max);
  assert.equal(g.skewX, SHADOW_GENERATION_LIMITS.skewX.max);
  // Unspecified keys keep the preset's value.
  assert.equal(g.scaleX, SHADOW_PRESETS.contact.scaleX);
});

test("garbage parameters fall back to the preset, never to NaN", () => {
  const g = sanitizeShadowGeneration({ blur: "x", scaleX: null, dilate: {}, opacity: [] }, "character");
  assert.equal(g.blur, SHADOW_PRESETS.character.blur);
  assert.equal(g.scaleX, SHADOW_PRESETS.character.scaleX);
  assert.equal(g.dilate, SHADOW_PRESETS.character.dilate);
  assert.equal(g.opacity, SHADOW_PRESETS.character.opacity);
  for (const v of Object.values(g)) assert.ok(typeof v !== "number" || Number.isFinite(v));
});

test("only a hex colour and a known edge style survive", () => {
  assert.equal(sanitizeShadowGeneration({ color: "#Ff8800" }, "contact").color, "#ff8800");
  assert.equal(sanitizeShadowGeneration({ color: "red" }, "contact").color, SHADOW_PRESETS.contact.color);
  assert.equal(sanitizeShadowGeneration({ color: "javascript:x" }, "contact").color, "#000000");
  assert.equal(sanitizeShadowGeneration({ edgeStyle: "pixel" }, "contact").edgeStyle, "pixel");
  assert.equal(sanitizeShadowGeneration({ edgeStyle: "nonsense" }, "contact").edgeStyle, "soft");
});

test("unknown generation fields cannot enter the document", () => {
  const g = sanitizeShadowGeneration({ evil: 1, __proto__: { x: 1 }, script: "<img>" }, "contact");
  assert.deepEqual(
    Object.keys(g).sort(),
    [...Object.keys(SHADOW_GENERATION_LIMITS), "color", "edgeStyle"].sort()
  );
});

// ================================================== filenames + reuse

test("the filename is derived from the SOURCE ASSET id, not the scene instance", () => {
  assert.equal(generatedShadowPath("core_book", "contact"), "assets/shadows/generated/core_book_contact.png");
  assert.equal(generatedShadowPath("classic_alpha", "character"), "assets/shadows/generated/classic_alpha_character.png");
  assert.equal(
    generatedShadowPath("wood_cabinet_small", "projected"),
    "assets/shadows/generated/wood_cabinet_small_projected.png"
  );
});

test("two instances of the same asset share one generated file", () => {
  // The scene instance id is deliberately NOT part of the name.
  const a = generatedShadowPath("core_book", "contact", "core_book_001");
  const b = generatedShadowPath("core_book", "contact", "core_book_002");
  assert.equal(a, b, "one PNG per source asset, reused by every instance");
});

test("distinct source assets never collide, and neither do presets", () => {
  const paths = [
    generatedShadowPath("core_book", "contact"),
    generatedShadowPath("core_desk", "contact"),
    generatedShadowPath("core_book", "character"),
    generatedShadowPath("core_book", "projected"),
  ];
  assert.equal(new Set(paths).size, 4);
});

test("the scene instance id is used only when there is no asset identity", () => {
  assert.equal(generatedShadowPath("", "contact", "podium"), "assets/shadows/generated/podium_contact.png");
  assert.equal(generatedShadowPath(null, "contact", null), "", "no identity at all yields no path");
});

test("an id that could escape its folder is neutralised", () => {
  assert.equal(generatedShadowId("../../etc/passwd"), "_etc_passwd".replace(/^_+/, ""));
  assert.equal(generatedShadowId("a/b\\c"), "a_b_c");
  assert.equal(generatedShadowId("Name With Spaces"), "name_with_spaces");
  // Whatever the id, the result stays inside the generated root.
  for (const evil of ["../../x", "C:/x", "//srv/x", "a\0b"]) {
    const p = generatedShadowPath(evil, "contact");
    if (p) assert.ok(sanitizeGeneratedShadowPath(p), `${evil} produced an unsafe path: ${p}`);
  }
});

// ============================================== output root restriction

test("generated output may live only under assets/shadows/generated/", () => {
  assert.equal(GENERATED_SHADOW_ROOT, "assets/shadows/generated/");
  const ok = "assets/shadows/generated/core_book_contact.png";
  assert.equal(sanitizeGeneratedShadowPath(ok), ok);
  for (const bad of [
    "assets/shadows/generated/../../evil.png",
    "assets/shadows/evil.png",
    "assets/props/podium.png",
    "assets/background/classic_library_bg.png",
    "/assets/shadows/generated/x.png",
    "C:/Users/example/evil.png",
    "\\\\srv\\share\\x.png",
    "http://evil.test/x.png",
    "assets/shadows/generated/x.exe",
    "assets/shadows/generated/x.svg",
  ]) {
    assert.equal(sanitizeGeneratedShadowPath(bad), "", `${bad} must be rejected`);
  }
});

test("the route derives the output path server-side, never from the client", async () => {
  const server = await readSource("../src/server.js");
  const start = server.indexOf('app.post("/api/dev/shadow/generate"');
  const route = server.slice(start, server.indexOf("\n  });", start));
  assert.match(route, /const rel = generatedShadowPath\(req\.body\?\.assetId, req\.body\?\.preset, req\.body\?\.fallbackId\);/);
  assert.match(route, /if \(!rel \|\| !sanitizeGeneratedShadowPath\(rel\)\)/);
  // No client-supplied path is ever joined.
  assert.doesNotMatch(route, /req\.body\?\.path|req\.body\.path/);
  assert.match(route, /const target = path\.join\(projectRoot, rel\);/);
});

// ==================================================== atomic + failure

test("the write is atomic and cleans up its temp file", async () => {
  const server = await readSource("../src/server.js");
  const start = server.indexOf('app.post("/api/dev/shadow/generate"');
  const route = server.slice(start, server.indexOf("\n  });", start));
  assert.match(route, /const temp = path\.join\(dir, `\.\$\{path\.basename\(target\)\}/);
  assert.match(route, /await fsp\.writeFile\(temp, bytes\);/);
  assert.match(route, /const back = await fsp\.readFile\(temp\);/);
  assert.match(route, /await fsp\.rename\(temp, target\);/);
  assert.match(route, /await fsp\.rm\(temp, \{ force: true \}\)\.catch\(\(\) => \{\}\);/);
});

test("a non-PNG body is refused before anything is written", async () => {
  const server = await readSource("../src/server.js");
  const start = server.indexOf('app.post("/api/dev/shadow/generate"');
  const route = server.slice(start, server.indexOf("\n  });", start));
  const magicAt = route.indexOf("PNG_MAGIC)");
  const writeAt = route.indexOf("await fsp.writeFile(temp");
  assert.ok(magicAt > 0 && writeAt > magicAt, "validation precedes the write");
  assert.match(route, /Expected a base64 PNG data URL/);
  assert.match(route, /bytes\.length > 4 \* 1024 \* 1024/);
});

// ========================================================== the pipeline

// ============================================================ the schema

test("Custom mode is unchanged — absent source means custom", () => {
  const s = shadow({ enabled: true, asset: "assets/shared/shadows/shadow_medium.png", offsetX: 3, offsetY: -2, width: 90, height: 14, opacity: 0.6 });
  assert.equal(DEFAULT_SHADOW_SOURCE, "custom");
  assert.equal(s.source, undefined, "custom is the absent default — no migration needed");
  assert.equal(s.asset, "assets/shared/shadows/shadow_medium.png");
  assert.deepEqual(
    { offsetX: s.offsetX, offsetY: s.offsetY, width: s.width, height: s.height, opacity: s.opacity },
    { offsetX: 3, offsetY: -2, width: 90, height: 14, opacity: 0.6 }
  );
  assert.equal(s.preset, undefined);
  assert.equal(s.generation, undefined);
});

test("Generated mode carries the preset, parameters and generated file", () => {
  const s = shadow({
    source: "generated",
    preset: "character",
    generatedAsset: "assets/shadows/generated/classic_alpha_character.png",
    asset: "assets/shadows/generated/classic_alpha_character.png",
    generation: { blur: 8 },
    offsetX: 1, offsetY: 2, width: 60, height: 12, opacity: 0.5,
  });
  assert.equal(s.source, "generated");
  assert.equal(s.preset, "character");
  assert.equal(s.generatedAsset, "assets/shadows/generated/classic_alpha_character.png");
  assert.equal(s.generation.blur, 8);
  assert.equal(s.generation.alphaThreshold, SHADOW_PRESETS.character.alphaThreshold);
  // The transform fields are the SAME ones Custom uses.
  assert.deepEqual(
    { offsetX: s.offsetX, offsetY: s.offsetY, width: s.width, height: s.height, opacity: s.opacity },
    { offsetX: 1, offsetY: 2, width: 60, height: 12, opacity: 0.5 }
  );
});

test("a generated file outside the root never survives sanitization", () => {
  const s = shadow({ source: "generated", preset: "contact", generatedAsset: "assets/props/evil.png" });
  assert.equal(s.generatedAsset, undefined);
  const t = shadow({ source: "generated", preset: "contact", generatedAsset: "../../evil.png" });
  assert.equal(t.generatedAsset, undefined);
});

test("an unknown source mode reads as custom", () => {
  assert.equal(shadow({ source: "hijack" }).source, undefined);
  assert.deepEqual(SHADOW_SOURCE_MODES, ["custom", "generated"]);
});

test("tint is a reserved schema location only — nothing reads it yet", async () => {
  const s = shadow({ tint: "#3366FF" });
  assert.equal(s.tint, "#3366ff");
  assert.equal(shadow({ tint: "notacolour" }).tint, undefined);
  // Global Shadow Tint is deliberately deferred to the future Camera/Effects
  // system, which must be able to re-tint without regenerating any PNG. The
  // runtime renderer does not consume the field.
  const app = await readSource("../public/app.js");
  const cfg = app.slice(app.indexOf("function shadowConfig(def) {"), app.indexOf("// Opaque-content bounds"));
  assert.doesNotMatch(cfg, /tint/i);
  // ...and the generated mask itself is neutral, not pre-tinted with lighting.
  assert.equal(SHADOW_PRESETS.contact.color, "#000000");
  assert.equal(SHADOW_PRESETS.character.color, "#000000");
  assert.equal(SHADOW_PRESETS.projected.color, "#000000");
});

test("the shadow sanitizer exists once and is shared by both documents", async () => {
  const layout = await readSource("../src/services/sceneLayout.js");
  const config = await readSource("../src/services/sceneConfig.js");
  for (const src of [layout, config]) {
    assert.match(src, /import \{ sanitizeShadowComponent \} from "\.\/shadowPresets\.js";/);
    assert.match(src, /return sanitizeShadowComponent\(s, num\);/);
    // The old duplicated body is gone from both.
    assert.doesNotMatch(src, /const out = \{ enabled: s\.enabled !== false \};/);
  }
});

// ================================================== persistence round-trip

test("a generated Shadow round-trips through the Scene layout", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const shadowIn = {
    enabled: true,
    source: "generated",
    preset: "projected",
    generatedAsset: "assets/shadows/generated/core_desk_projected.png",
    asset: "assets/shadows/generated/core_desk_projected.png",
    generation: { blur: 4, skewX: -0.8, edgeStyle: "pixel" },
    offsetX: 5, offsetY: -3, width: 120, height: 30, opacity: 0.35,
  };
  const out = sanitizeLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.1, z: 1, shadow: shadowIn }],
  });
  const s = out.objects[0].shadow;
  assert.equal(s.source, "generated");
  assert.equal(s.preset, "projected");
  assert.equal(s.generatedAsset, shadowIn.generatedAsset);
  assert.equal(s.generation.blur, 4);
  assert.equal(s.generation.skewX, -0.8);
  assert.equal(s.generation.edgeStyle, "pixel");
  assert.equal(s.width, 120);
  assert.equal(s.opacity, 0.35);
});

test("a generated Shadow round-trips through an ALS document", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  const doc = sceneFile.sanitizeSceneDocument({
    scene: {
      objects: [{
        id: "podium", world: { x: 0.4, y: 0.6 }, width: 0.2, z: 1,
        shadow: {
          enabled: true, source: "generated", preset: "contact",
          generatedAsset: "assets/shadows/generated/podium_contact.png",
          asset: "assets/shadows/generated/podium_contact.png",
          generation: { blur: 2 }, width: 100, height: 20, opacity: 0.5,
        },
      }],
      props: [{
        instance_id: "core_book_01", asset_uid: "asset_core_book_c57100",
        x: 900, y: 500, scale: 1, flipX: false, z: 1,
        shadow: {
          enabled: true, source: "generated", preset: "character",
          generatedAsset: "assets/shadows/generated/core_book_character.png",
          asset: "assets/shadows/generated/core_book_character.png",
          generation: { dilate: 5 }, width: 40, height: 10, opacity: 0.8,
        },
      }],
    },
  });
  // Both document shapes carry it — the shared sanitizer is why.
  assert.equal(doc.scene.objects[0].shadow.source, "generated");
  assert.equal(doc.scene.objects[0].shadow.preset, "contact");
  assert.equal(doc.scene.props[0].shadow.source, "generated");
  assert.equal(doc.scene.props[0].shadow.generation.dilate, 5);
  assert.equal(doc.scene.props[0].shadow.opacity, 0.8, "instance-level opacity is preserved");
});

test("two instances of one asset keep their own transforms while sharing the file", async () => {
  const { sanitizeSceneConfig } = await import("../src/services/sceneConfig.js");
  const shared = "assets/shadows/generated/small_chair_contact.png";
  const mk = (id, width, opacity) => ({
    instance_id: id, asset_uid: "asset_small_chair", x: 100, y: 200, scale: 1, flipX: false, z: 1,
    shadow: { enabled: true, source: "generated", preset: "contact", generatedAsset: shared, asset: shared, width, opacity },
  });
  const out = sanitizeSceneConfig({ objects: [mk("a", 50, 0.3), mk("b", 90, 0.9)] });
  assert.equal(out.objects[0].shadow.asset, out.objects[1].shadow.asset, "one shared PNG");
  assert.equal(out.objects[0].shadow.width, 50);
  assert.equal(out.objects[1].shadow.width, 90);
  assert.equal(out.objects[0].shadow.opacity, 0.3);
  assert.equal(out.objects[1].shadow.opacity, 0.9);
});

// ============================================================== dev-only

// ================================================== the runtime is untouched

test("the runtime Shadow renderer was not redesigned", async () => {
  const app = await readSource("../public/app.js");
  // The same config reader and the same render rule as before.
  assert.match(app, /function shadowConfig\(def\) \{/);
  assert.match(app, /const renderable = cfg\.enabled && bounds && !sh\.dataset\.missing;/);
  assert.match(app, /sh\.style\.display = renderable \? "" : "none";/);
  // It still reads `asset` — a generated Shadow is just a different file in
  // the field the renderer already used.
  assert.match(app, /asset: typeof s\.asset === "string" && s\.asset \? s\.asset : SHADOW_DEFAULT_ASSET,/);
});

test("New Scene tears generated Shadows down like any other", async () => {
  const app = await readSource("../public/app.js");
  // The canonical reset walks every Scene Object through teardownSceneObject,
  // which hides the shadow node — generated or custom, it is the same node.
  const fn = app.slice(app.indexOf("function resetSceneRuntime() {"), app.indexOf("window.__resetSceneRuntime = resetSceneRuntime;"));
  assert.match(fn, /for \(const def of SCENE_OBJECTS\) \{\s*teardownSceneObject\(def\.id\);/);
  assert.doesNotMatch(fn, /generated|shadowPresets/i, "no generated-specific teardown is needed");
});

// ============================================= the custom Shadow asset picker

// The Browse dialog under Selected Object -> Shadow -> Source: Custom used to
// offer every PNG in the project, so backgrounds, Start Menu art and Props
// showed up as "shadows". Shadow art lives in exactly one folder, and that is
// a product rule about this picker — not a change to asset browsing at large.
const SHADOW_ASSET_DIR = "assets/shared/shadows/";

test("the shadow folder actually holds selectable PNGs", async () => {
  const dir = new URL(`../${SHADOW_ASSET_DIR}`, import.meta.url);
  const pngs = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png"));
  assert.ok(pngs.length > 0, "the picker would be empty and never open");
  // Every shipped default preset resolves inside the folder the picker offers.
  for (const id of SHADOW_PRESET_IDS) {
    const asset = shadowPreset(id)?.asset;
    if (asset) assert.ok(asset.startsWith(SHADOW_ASSET_DIR), `${id} preset points outside the picker folder: ${asset}`);
  }
});

// ============================== the ONE generated shadow the Scene ships with
//
// Generated shadows are an AUTHORING output: they are produced in the browser
// behind F8 (POST /api/dev/shadow/generate lives inside the devTools gate), so
// a production install can never create one. Any generated PNG the shipping
// Scene references is therefore an authored asset that must travel with the
// Scene — a fresh checkout cannot regenerate it.
//
// Today that is exactly one file. This test is the ownership record: if the
// Scene starts referencing another generated shadow, the public snapshot's
// asset list has to change too, and this fails until it is acknowledged.

test("classic_library ships exactly one generated shadow, and it exists", async () => {
  const scene = JSON.parse(await readSource("../assets/scenes/classic_library.json"));
  const referenced = new Set();
  for (const obj of scene.objects || []) {
    for (const value of [obj.shadow?.asset, obj.shadow?.generatedAsset]) {
      if (typeof value === "string" && value.startsWith(GENERATED_SHADOW_ROOT)) referenced.add(value);
    }
  }
  assert.deepEqual(
    [...referenced],
    ["assets/shadows/generated/bookshelf_projected.png"],
    "the shipping Scene's generated-shadow dependencies changed — update the public snapshot manifest"
  );
  // It must actually be on disk: production has no way to make it.
  await fs.access(new URL(`../${[...referenced][0]}`, import.meta.url));
});

test("no runtime path generates shadows — generation stays an F8 authoring action", async () => {
  const server = await readSource("../src/server.js");
  const gateAt = server.indexOf("if (config.devTools) {");
  const genAt = server.indexOf('app.post("/api/dev/shadow/generate"');
  assert.ok(gateAt > 0 && genAt > gateAt, "the generate route stays inside the devTools gate");
  // The production runtime never writes into the generated-shadow directory.
  const app = await readSource("../public/app.js");
  assert.doesNotMatch(app, /shadow\/generate/, "app.js must not call the generation route");
});
