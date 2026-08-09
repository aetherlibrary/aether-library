// Advanced Prop transform — free scale + four-corner perspective.
//
// THE INVARIANT EVERYTHING ELSE DEPENDS ON: a Prop with no transform gains no
// key, renders through the old path, and serializes byte-identically. Every
// existing Scene has to survive this feature untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const T = await import("../src/services/propTransform.js");
const { sanitizeSceneConfig } = await import("../src/services/sceneConfig.js");
const sceneFile = await import("../src/services/sceneFile.js");

const prop = (over = {}) => ({ instance_id: "p1", asset_uid: "a1", x: 100, y: 200, scale: 1, ...over });
const one = (over) => sanitizeSceneConfig({ objects: [prop(over)] }).objects[0];

// Applies a homography to a point, the same way the renderer's matrix will.
const apply = (H, x, y) => {
  const [a, b, c, d, e, f, g, hh] = H;
  const w = g * x + hh * y + 1;
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
};

// ======================================================== the homography

test("the homography reproduces exactly the corners it was built from", () => {
  for (const quad of [
    [[0.1, 0.05], [0.95, 0], [1, 1], [0, 0.9]],
    [[0.3, 0], [1, 0], [1, 1], [0, 1]],          // Ctrl-drag of corner A
    [[0.2, 0.1], [0.8, 0.1], [1, 1], [0, 1]],    // both top vertices: an edge drag
    [[-0.4, -0.2], [1.5, 0.1], [1.2, 1.3], [-0.1, 1.1]], // dragged outside the square
  ]) {
    const H = T.homographyFromCorners(quad);
    assert.ok(H, `no homography for ${JSON.stringify(quad)}`);
    T.IDENTITY_CORNERS.forEach((src, i) => {
      const [gx, gy] = apply(H, src[0], src[1]);
      assert.ok(Math.hypot(gx - quad[i][0], gy - quad[i][1]) < 1e-9, `corner ${i} of ${JSON.stringify(quad)}`);
    });
  }
});

test("it is projective, not affine — parallel edges may converge", () => {
  // A trapezoid: the top edge shorter than the bottom. An affine transform
  // (skew/rotate/scale) cannot produce this, which is why those are excluded.
  const trapezoid = [[0.25, 0], [0.75, 0], [1, 1], [0, 1]];
  const H = T.homographyFromCorners(trapezoid);
  const [, , , , , , g, hh] = H;
  assert.ok(Math.abs(g) > 1e-6 || Math.abs(hh) > 1e-6, "projective terms must be non-zero");
  // THE PROJECTIVE SIGNATURE: the texture centre does NOT land at the quad's
  // centroid. An affine map (skew/rotate/scale) would put (0.5,0.5) at y=0.5
  // exactly; a homography pulls it toward the short edge — here y≈0.333 — which
  // is what makes the surface read as receding rather than merely sheared.
  const [mx, my] = apply(H, 0.5, 0.5);
  assert.ok(Math.abs(mx - 0.5) < 1e-9, "a symmetric trapezoid keeps its centre line");
  assert.ok(my < 0.5 - 1e-6, `foreshortening expected, got y=${my}`);
  assert.ok(Math.abs(my - 1 / 3) < 1e-6, "and by the amount the homography prescribes");
});

test("the identity square produces the identity matrix", () => {
  assert.equal(
    T.matrix3dFromCorners(T.IDENTITY_CORNERS, 200, 100),
    "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)"
  );
});

test("the matrix is conjugated into the element's pixel space", () => {
  // T = S.H.S^-1, so the same quad on a different-sized element yields
  // different matrix coefficients — a matrix built in unit space and applied
  // raw would distort by the aspect ratio.
  const quad = [[0.2, 0], [1, 0], [1, 1], [0, 1]];
  assert.notEqual(T.matrix3dFromCorners(quad, 200, 100), T.matrix3dFromCorners(quad, 100, 200));
  // Square elements are the degenerate case where they agree.
  assert.equal(T.matrix3dFromCorners(quad, 150, 150), T.matrix3dFromCorners(quad, 150, 150));
});

test("degenerate quads are refused rather than emitting NaN", () => {
  for (const bad of [
    [[0, 0], [0, 0], [1, 1], [0, 1]],   // duplicated corner
    [[0, 0], [1, 0], [1, 0], [0, 0]],   // zero area
    [[0, 0], [0.005, 0], [0.005, 0.005], [0, 0.005]], // collapsed
    null, undefined, [], [[0, 0], [1, 0], [1, 1]],
  ]) {
    assert.equal(T.homographyFromCorners(bad), null, JSON.stringify(bad));
    assert.equal(T.matrix3dFromCorners(bad, 100, 100), "");
  }
  assert.equal(T.matrix3dFromCorners(T.IDENTITY_CORNERS, 0, 100), "", "zero-size element");
});

// ============================================================ the schema

test("a Prop with no transform gains no key at all", () => {
  const p = one();
  assert.equal("transform" in p, false);
  assert.deepEqual(Object.keys(p), ["instance_id", "asset_uid", "x", "y", "scale", "flipX"]);
});

test("free scale stores two independent factors", () => {
  assert.deepEqual(one({ transform: { scaleX: 1.6, scaleY: 0.7 } }).transform, { scaleX: 1.6, scaleY: 0.7 });
  // Independent, not a ratio: one axis may move without the other.
  assert.deepEqual(one({ transform: { scaleX: 2 } }).transform, { scaleX: 2, scaleY: 1 });
  assert.deepEqual(one({ transform: { scaleY: 0.5 } }).transform, { scaleX: 1, scaleY: 0.5 });
});

test("an identity transform is dropped, so it can never bloat a Scene", () => {
  assert.equal("transform" in one({ transform: { scaleX: 1, scaleY: 1 } }), false);
  assert.equal("transform" in one({ transform: { scaleX: 1, scaleY: 1, corners: T.IDENTITY_CORNERS } }), false);
  assert.equal("transform" in one({ transform: {} }), false);
});

test("junk and hostile input are dropped, never partially honoured", () => {
  assert.equal("transform" in one({ transform: "nope" }), false);
  assert.equal("transform" in one({ transform: [] }), false);
  assert.equal("transform" in one({ transform: { scaleX: "abc", scaleY: null, corners: "x" } }), false);
  // Unknown keys vanish by construction.
  const t = one({ transform: { scaleX: 2, evil: "hijack", corners: [[0.2, 0], [1, 0], [1, 1], [0, 1]] } }).transform;
  assert.deepEqual(Object.keys(t).sort(), ["corners", "scaleX", "scaleY"]);
  // A degenerate quad is dropped but a valid scale survives alongside it.
  assert.deepEqual(one({ transform: { scaleX: 2, corners: [[0, 0], [0, 0], [1, 1], [0, 1]] } }).transform, {
    scaleX: 2,
    scaleY: 1,
  });
});

test("scale factors are bounded away from zero and negatives", () => {
  assert.equal(one({ transform: { scaleX: 0 } }).transform.scaleX, T.MIN_SCALE_FACTOR);
  assert.equal(one({ transform: { scaleX: -3 } }).transform.scaleX, T.MIN_SCALE_FACTOR);
  assert.equal(one({ transform: { scaleX: 1e6 } }).transform.scaleX, T.MAX_SCALE_FACTOR);
  // Mirroring stays the separate flipX boolean — never a negative scale.
  assert.equal(one({ flipX: true }).flipX, true);
});

test("corners are clamped, not rejected, when dragged well outside", () => {
  const far = [[-99, -99], [99, -99], [99, 99], [-99, 99]];
  const c = T.sanitizeCorners(far);
  assert.ok(c.every((p) => Math.abs(p[0]) <= T.CORNER_BOUND && Math.abs(p[1]) <= T.CORNER_BOUND));
});

// ================================================== corner / edge editing

test("a corner drag moves exactly one vertex", () => {
  const next = T.moveCorners(T.IDENTITY_CORNERS, 0, 0.3, 0.1);
  assert.deepEqual(next[0], [0.3, 0.1]);
  assert.deepEqual(next.slice(1), [[1, 0], [1, 1], [0, 1]], "the other three are untouched");
});

test("an edge drag moves both of that edge's vertices", () => {
  // A ---- B      Ctrl+drag the left edge moves A and D together.
  // |      |
  // D ---- C
  assert.deepEqual(T.EDGE_VERTICES, { top: [0, 1], right: [1, 2], bottom: [2, 3], left: [3, 0] });
  const left = T.moveCorners(T.IDENTITY_CORNERS, "left", 0.2, 0);
  assert.deepEqual(left[0], [0.2, 0], "A moved");
  assert.deepEqual(left[3], [0.2, 1], "D moved");
  assert.deepEqual(left[1], [1, 0], "B untouched");
  assert.deepEqual(left[2], [1, 1], "C untouched");

  const top = T.moveCorners(T.IDENTITY_CORNERS, "top", 0, 0.25);
  assert.deepEqual(top[0], [0, 0.25]);
  assert.deepEqual(top[1], [1, 0.25]);
  assert.deepEqual(top.slice(2), [[1, 1], [0, 1]]);
});

test("a drag that would degenerate the quad is refused, not applied", () => {
  // Dragging A onto B would collapse the top edge.
  const collapsed = T.moveCorners(T.IDENTITY_CORNERS, 0, 1, 0);
  assert.deepEqual(collapsed, T.IDENTITY_CORNERS, "the previous quad stands");
  // And the source array is never mutated in place.
  const original = T.IDENTITY_CORNERS.map((p) => p.slice());
  T.moveCorners(original, 0, 0.4, 0.4);
  assert.deepEqual(original, T.IDENTITY_CORNERS);
});

test("resolvePropTransform gives the renderer defaults, never null", () => {
  const none = T.resolvePropTransform(null);
  assert.deepEqual(none, { scaleX: 1, scaleY: 1, corners: T.IDENTITY_CORNERS, distorted: false });
  const dist = T.resolvePropTransform({ scaleX: 2, corners: [[0.2, 0], [1, 0], [1, 1], [0, 1]] });
  assert.equal(dist.distorted, true);
  assert.equal(dist.scaleX, 2);
});

test("the bounding box of a distorted quad is available for hit testing", () => {
  assert.deepEqual(T.cornersBounds([[0.2, -0.1], [1.2, 0], [1, 1], [0, 0.9]]), {
    x: 0, y: -0.1, w: 1.2, h: 1.1,
  });
  assert.deepEqual(T.cornersBounds(T.IDENTITY_CORNERS), { x: 0, y: 0, w: 1, h: 1 });
});

// ============================================ persistence + round trips

test("the transform survives an ALS round trip unchanged", () => {
  const transform = { scaleX: 1.6, scaleY: 0.7, corners: [[0.2, 0], [1, 0], [1, 1], [0, 1]] };
  const doc = sceneFile.sanitizeSceneDocument({
    scene: { props: [prop({ transform }), prop({ instance_id: "p2" })] },
  });
  assert.deepEqual(doc.scene.props[0].transform, transform);
  assert.equal("transform" in doc.scene.props[1], false, "a plain Prop stays plain");
  // Stable across repeated saves.
  assert.deepEqual(sceneFile.sanitizeSceneDocument(doc).scene.props, doc.scene.props);
  // And through the Default Scene runtime split.
  assert.deepEqual(sceneFile.sceneDocumentToRuntime(doc).config.objects[0].transform, transform);
});

test("the real project Scene round-trips byte-identically", async () => {
  // The proof that existing Props are untouched: not "equivalent", identical.
  const real = JSON.parse(await fs.readFile(new URL("../assets/scenes/classic_library.json", import.meta.url), "utf8"));
  const out = sanitizeSceneConfig(real);
  assert.equal(JSON.stringify(out.objects), JSON.stringify(real.objects));
  // Props WITHOUT a transform must gain no key — that is the compatibility
  // guarantee. Props the author has since transformed legitimately carry one;
  // asserting "none exist" was only ever true before the feature was usable.
  const untransformed = real.objects.filter((o) => !("transform" in o));
  assert.ok(untransformed.length > 0, "there are still plain Props to protect");
  for (const o of untransformed) {
    assert.equal(JSON.stringify(sanitizeSceneConfig({ objects: [o] }).objects[0]), JSON.stringify(o));
  }
});

// ==================================================== scope + limitations

test("the transform is Props-only — no other entity gains it", async () => {
  const { sanitizeLayout } = await import("../src/services/sceneLayout.js");
  const layout = sanitizeLayout({
    objects: [{ id: "podium", world: { x: 0.5, y: 0.5 }, width: 0.2, transform: { scaleX: 2 } }],
    zones: [{ id: "z", type: "blocked", shape: "rect", rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, transform: { scaleX: 2 } }],
    lights: [{ id: "l", type: "point", x: 0.5, y: 0.5, transform: { scaleX: 2 } }],
    lightBlockers: [{ id: "b", shape: "rect", rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, transform: { scaleX: 2 } }],
  });
  assert.equal(layout.objects[0].transform, undefined, "baked objects/Characters excluded");
  assert.equal(layout.zones[0].transform, undefined, "Zones excluded");
  assert.equal(layout.lights[0].transform, undefined, "Lights excluded");
  assert.equal(layout.lightBlockers[0].transform, undefined, "Light Blockers excluded");
});

test("collision is deliberately untouched by the transform (documented v1 limit)", () => {
  // Collision stays an anchor-relative axis-aligned shape. Distorting it would
  // silently change where the player can walk, which is not something a visual
  // transform should do behind the author's back.
  const p = one({
    transform: { scaleX: 2, scaleY: 0.5, corners: [[0.2, 0], [1, 0], [1, 1], [0, 1]] },
    collision: { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -20, width: 40, height: 30 },
  });
  assert.deepEqual(p.collision, { enabled: true, shape: "rectangle", offsetX: -10, offsetY: -20, width: 40, height: 30 });
});

// ============================================ runtime rendering (app.js)
//
// app.js is a plain <script> and cannot import this service, so the homography
// is MIRRORED there. These tests are what keep the two from drifting — a
// divergence here means the editor and the shipping runtime would disagree
// about where a Prop's corners are.

const appJs = async () =>
  (await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");