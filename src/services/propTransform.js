// Advanced Prop transform — free scale + four-corner perspective.
//
// WHAT THE AUDIT FOUND, and why the schema looks like this:
//
// A scene-config Prop has ONE size scalar — `scale`. There is no height field
// anywhere in the model, and there never was: the runtime sets
// `el.style.width` and lets height fall out of the image's natural aspect
// (see applySceneObjectStyle in public/app.js). So "resize keeps the aspect
// ratio" was not a policy anyone chose — it is the only thing the data could
// express. Free Scale therefore needs a genuine SECOND dimension, not a
// toggle.
//
// The addition is one optional `transform` object. A Prop without it is
// untouched by every function here, which is what makes existing Scenes
// pixel-identical rather than merely close.
//
//   scaleX / scaleY  multiply the derived width/height independently.
//   corners          the unit square's four corners after distortion, in
//                    normalized space: [0,0] top-left .. [0,1] bottom-left.
//                    An undistorted Prop stores the identity square (or omits
//                    corners entirely) and takes the cheap render path.
//
// COORDINATE ORDER is fixed at TL, TR, BR, BL — clockwise from top-left. Every
// consumer depends on it, so it is asserted rather than inferred.

export const IDENTITY_CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// A corner may be dragged outside the unit square (that is the whole point of
// perspective), but not arbitrarily far — a runaway drag would produce a
// numerically unstable homography and a prop the author cannot find again.
export const CORNER_BOUND = 4;

const num = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round = (n, dp = 6) => Number(n.toFixed(dp));

// Scale factors are bounded well away from zero: a 0 or negative factor
// collapses the sprite (and inverts it, which is what flipX is for).
export const MIN_SCALE_FACTOR = 0.01;
export const MAX_SCALE_FACTOR = 100;

function scaleFactor(value) {
  const n = num(value);
  if (n === null) return 1;
  return round(Math.max(MIN_SCALE_FACTOR, Math.min(MAX_SCALE_FACTOR, n)), 6);
}

export function sanitizeCorners(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const out = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const x = num(point[0]);
    const y = num(point[1]);
    if (x === null || y === null) return null;
    out.push([
      round(Math.max(-CORNER_BOUND, Math.min(CORNER_BOUND, x))),
      round(Math.max(-CORNER_BOUND, Math.min(CORNER_BOUND, y))),
    ]);
  }
  // A degenerate quad (zero area, or corners collapsed onto each other) has no
  // invertible homography — it is dropped rather than allowed to produce NaN
  // transforms at render time.
  if (!isUsableQuad(out)) return null;
  return out;
}

export function cornersAreIdentity(corners) {
  if (!corners) return true;
  return corners.every((p, i) => p[0] === IDENTITY_CORNERS[i][0] && p[1] === IDENTITY_CORNERS[i][1]);
}

// Shoelace area, plus a minimum separation between every pair of corners.
export function isUsableQuad(c) {
  if (!Array.isArray(c) || c.length !== 4) return false;
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x1, y1] = c[i];
    const [x2, y2] = c[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  if (Math.abs(area / 2) < 0.01) return false;
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      const dx = c[i][0] - c[j][0];
      const dy = c[i][1] - c[j][1];
      if (Math.hypot(dx, dy) < 0.02) return false;
    }
  }
  return true;
}

// -------------------------------------------------------------- the schema
// Returns null for "no transform", so an untransformed Prop carries no new key
// at all and its serialized form is byte-identical to before this feature.
// CORNER SPACE — the one rule.
//
//   corners + cornerSpace:"content"  -> CONTENT-normalized (current, canonical)
//   corners + no cornerSpace         -> LEGACY element-normalized, needs the
//                                       browser-side migration in public/app.js
//   no corners                       -> no marker at all
//
// The marker is only ever written ALONGSIDE corners, so a free-scale-only Prop
// (scaleY without perspective) never acquires perspective metadata.
//
// THIS LAYER CANNOT MIGRATE. Converting element->content needs the sprite's
// measured alpha bounds, which only exist once the image has decoded in a
// browser; the server has no image decoder and is not gaining one. So the
// sanitizer preserves the marker faithfully and migration happens at render
// time — see migratePropCornerSpace() in public/app.js.
export const CONTENT_CORNER_SPACE = "content";

export function sanitizePropTransform(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const scaleX = scaleFactor(raw.scaleX);
  const scaleY = scaleFactor(raw.scaleY);
  const corners = sanitizeCorners(raw.corners);
  const distorted = corners && !cornersAreIdentity(corners);
  // Nothing meaningful to store -> no transform object.
  if (scaleX === 1 && scaleY === 1 && !distorted) return null;
  const contentSpace = raw.cornerSpace === CONTENT_CORNER_SPACE;
  return {
    scaleX,
    scaleY,
    ...(distorted ? { corners } : {}),
    ...(distorted && contentSpace ? { cornerSpace: CONTENT_CORNER_SPACE } : {}),
  };
}

// True when the corners still carry the OLD element-normalized meaning.
export function cornersAreLegacy(transform) {
  const t = transform;
  return Boolean(
    t && Array.isArray(t.corners) && t.corners.length === 4 && t.cornerSpace !== CONTENT_CORNER_SPACE
  );
}

// Element-normalized -> content-normalized, given the sprite's alpha bounds in
// element space. Deliberately UNCLAMPED: a perspective corner may legitimately
// sit outside the visible artwork.
export function legacyCornersToContent(corners, bounds) {
  if (!Array.isArray(corners) || corners.length !== 4 || !bounds) return null;
  const { x0, y0 } = bounds;
  const cw = bounds.widthFraction;
  const ch = bounds.heightFraction;
  if (!(cw > 0) || !(ch > 0)) return null;
  return corners.map(([ex, ey]) => [round((ex - x0) / cw), round((ey - y0) / ch)]);
}

// What the renderer needs, with every absent field defaulted. Callers never
// branch on null.
export function resolvePropTransform(transform) {
  const t = sanitizePropTransform(transform);
  return {
    scaleX: t ? t.scaleX : 1,
    scaleY: t ? t.scaleY : 1,
    corners: t && t.corners ? t.corners : IDENTITY_CORNERS,
    distorted: Boolean(t && t.corners),
  };
}

// ---------------------------------------------------------- the homography
// Maps the UNIT SQUARE (0,0)-(1,1) onto four arbitrary corners.
//
// Deliberately a projective transform, not skew/rotate/scale: those are affine
// and keep parallel edges parallel, so they cannot produce the converging
// sides that make a plane read as receding. The 8 unknowns of
//
//     x' = (a·x + b·y + c) / (g·x + h·y + 1)
//     y' = (d·x + e·y + f) / (g·x + h·y + 1)
//
// are solved from the four point correspondences by Gaussian elimination.
// Returns null when the system is singular (a degenerate quad), so the caller
// can fall back to the plain rectangle instead of emitting NaNs.
export function homographyFromCorners(corners) {
  const c = Array.isArray(corners) && corners.length === 4 ? corners : null;
  if (!c || !isUsableQuad(c)) return null;
  const src = IDENTITY_CORNERS;
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const [sx, sy] = src[i];
    const [dx, dy] = c[i];
    rows.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx, dx]);
    rows.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy, dy]);
  }
  const sol = solve8(rows);
  if (!sol) return null;
  const [a, b, cc, d, e, f, g, h] = sol;
  return [a, b, cc, d, e, f, g, h, 1];
}

// Gauss-Jordan with partial pivoting on the 8x9 augmented matrix.
function solve8(rows) {
  const m = rows.map((r) => r.slice());
  const n = 8;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null; // singular
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= p;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col];
      if (!factor) continue;
      for (let k = col; k <= n; k += 1) m[r][k] -= factor * m[col][k];
    }
  }
  const out = m.map((r) => r[n]);
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

// CSS matrix3d() is COLUMN-MAJOR and 4x4. A 2D homography
// [[a,b,c],[d,e,f],[g,h,1]] embeds with the projective row/column moved into
// the w slots — getting this ordering wrong is the classic way these come out
// mirrored or inside-out, so it is spelled out rather than transcribed.
//
// `w`/`h` are the element's pixel size: the homography is defined on the unit
// square, so it is pre-scaled by 1/size and post-scaled by size to act in the
// element's own pixel space.
export function matrix3dFromCorners(corners, w, h, bounds) {
  // CONTENT BASIS. corners are CONTENT-normalized, but the matrix acts on the
  // ELEMENT. `bounds` is the sprite's alpha rect in element space
  // ({x0,y0,widthFraction,heightFraction}); absent means "content == element",
  // which reproduces the pre-migration behaviour exactly.
  //
  //   Q_i = [x0 + c.x*cw, y0 + c.y*ch]      content corner -> element space
  //   H   = homography(unitSquare -> Q)
  //   T   = H . Ainv,  Ainv = element -> content-unit
  //
  // One composition, one place; the solver below is untouched.
  const Q = bounds && bounds.widthFraction > 0 && bounds.heightFraction > 0
    ? corners.map(([cx, cy]) => [bounds.x0 + cx * bounds.widthFraction, bounds.y0 + cy * bounds.heightFraction])
    : corners;
  const H = homographyFromCorners(Q);
  if (!H || !(w > 0) || !(h > 0)) return "";
  // H acts on the UNIT square. The element is w x h pixels, so conjugate it
  // into pixel space: T = S . H . S^-1, where S = scale(w, h).
  //
  //   S.H.S^-1 = | a        b*w/h    c*w |
  //              | d*h/w    e        f*h |
  //              | g/w      hh/h     1   |
  //
  // `hh` is the homography's 8th coefficient — deliberately NOT named `h`,
  // which is the element height and would silently shadow it.
  let [a, b, c, d, e, f, g, hh] = H;
  if (bounds && bounds.widthFraction > 0 && bounds.heightFraction > 0) {
    const bx = bounds.x0, by = bounds.y0;
    const bw = bounds.widthFraction, bh = bounds.heightFraction;
    const iw = 1 / bw, ih = 1 / bh;
    const t00 = a * iw, t01 = b * ih, t02 = a * -bx * iw + b * -by * ih + c;
    const t10 = d * iw, t11 = e * ih, t12 = d * -bx * iw + e * -by * ih + f;
    const t20 = g * iw, t21 = hh * ih, t22 = g * -bx * iw + hh * -by * ih + 1;
    if (!(Math.abs(t22) > 1e-12)) return "";
    a = t00 / t22; b = t01 / t22; c = t02 / t22;
    d = t10 / t22; e = t11 / t22; f = t12 / t22;
    g = t20 / t22; hh = t21 / t22;
  }
  const m00 = a;
  const m01 = (b * w) / h;
  const m02 = c * w;
  const m10 = (d * h) / w;
  const m11 = e;
  const m12 = f * h;
  const m20 = g / w;
  const m21 = hh / h;

  // CSS matrix3d is COLUMN-MAJOR 4x4. For a 2D projective transform the third
  // row/column is identity and the projective terms live in the w slots:
  //   col0: m00 m10 0 m20   col1: m01 m11 0 m21
  //   col2: 0   0   1 0     col3: m02 m12 0 1
  const v = (n, dp = 8) => round(n, dp);
  return `matrix3d(${v(m00)}, ${v(m10)}, 0, ${v(m20, 10)}, ${v(m01)}, ${v(m11)}, 0, ${v(
    m21,
    10
  )}, 0, 0, 1, 0, ${v(m02, 6)}, ${v(m12, 6)}, 0, 1)`;
}

// The axis-aligned bounding box of a distorted quad, in normalized space.
// Used for hit testing and for the editor's selection outline — NOT for
// collision, which v1 leaves alone (see docs).
export function cornersBounds(corners) {
  const c = Array.isArray(corners) && corners.length === 4 ? corners : IDENTITY_CORNERS;
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Which vertices an edge owns, clockwise from the top edge. Ctrl+dragging an
// edge moves BOTH of its vertices together.
export const EDGE_VERTICES = {
  top: [0, 1],
  right: [1, 2],
  bottom: [2, 3],
  left: [3, 0],
};

// Moves one corner, or both vertices of an edge, by a normalized delta.
// Returns a NEW corner array; rejects a move that would degenerate the quad,
// so a drag can never leave an unrenderable Prop behind.
export function moveCorners(corners, target, dx, dy) {
  const base = Array.isArray(corners) && corners.length === 4 ? corners : IDENTITY_CORNERS;
  const idx = typeof target === "number" ? [target] : EDGE_VERTICES[target];
  if (!idx || idx.some((i) => i < 0 || i > 3)) return base.map((p) => p.slice());
  const next = base.map((p) => p.slice());
  for (const i of idx) {
    next[i][0] = round(Math.max(-CORNER_BOUND, Math.min(CORNER_BOUND, next[i][0] + dx)));
    next[i][1] = round(Math.max(-CORNER_BOUND, Math.min(CORNER_BOUND, next[i][1] + dy)));
  }
  return isUsableQuad(next) ? next : base.map((p) => p.slice());
}
