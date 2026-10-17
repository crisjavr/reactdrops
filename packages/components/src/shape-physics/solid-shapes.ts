/**
 * Projected solids: 3D volumes, their projected silhouettes, eye decals and
 * sprites.
 *
 * Every solid is a union of convex 3D pieces, each a point set swept by a
 * sphere (a single point makes a ball). Projecting a piece orthographically
 * gives a rounded convex polygon: the 2D hull of its projected points plus
 * the same radius. Painting and collision use exactly those projected parts,
 * so what you see is what collides, at any 3D orientation. Models are built
 * once per kind, normalized so the resting silhouette has its center of mass
 * at the origin, and scaled per body by a single radius.
 */

export type SolidKind = 'circle' | 'triangle' | 'square' | 'cloud' | 'teardrop' | 'puff';
export const solidKinds: readonly SolidKind[] = [
  'circle',
  'triangle',
  'square',
  'cloud',
  'teardrop',
  'puff',
];
export const isSolidKind = (kind: string): kind is SolidKind =>
  (solidKinds as readonly string[]).includes(kind);

/**
 * Default palette: blue, pink, amber, red, purple, teal, brown, orange and green.
 */
export const solidPalette = [
  '#3c82f6',
  '#eb4699',
  '#f19c38',
  '#ea4044',
  '#8a5cf6',
  '#54b9a7',
  '#906a44',
  '#ed712e',
  '#5bc67a',
] as const;
/**
 * Each solid cycles through its own default colors: blue or brown
 * spheres, pink or orange cones, amber cubes, teal, green or amber clouds,
 * purple drops and red flowers. Indices wrap for custom palettes.
 */
const colorAffinity: Record<SolidKind, readonly number[]> = {
  circle: [0, 6],
  triangle: [1, 7],
  square: [2],
  cloud: [5, 8, 2],
  teardrop: [4],
  puff: [3],
};
/** The `turn`-th color variant of a solid (cycling through its default colors). */
export function solidColorIndex(kind: SolidKind, turn: number, colors: number) {
  const options = colorAffinity[kind];
  return options[Math.abs(Math.floor(turn)) % options.length] % Math.max(1, colors);
}

export type SolidPart = {
  /** Core polygon, clockwise on screen (y down). One vertex makes a circle. */
  x: Float64Array;
  y: Float64Array;
  /** Outward normal of edge i (from vertex i to i + 1). */
  nx: Float64Array;
  ny: Float64Array;
  count: number;
  radius: number;
  /** Bounding circle of the rounded part. */
  cx: number;
  cy: number;
  bound: number;
};

/**
 * A convex 3D piece: the hull of points and balls, swept by a sphere of
 * `radius`. Balls project to exact circles at any orientation.
 */
export type SolidPiece = {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  count: number;
  /** Ball centers and radii (each radius larger than the sweep radius). */
  bx: Float64Array;
  by: Float64Array;
  bz: Float64Array;
  br: Float64Array;
  balls: number;
  radius: number;
  /** Interior fillers are painted but never collide. */
  collide: boolean;
};

type Vec3 = [number, number, number];
/** Eyes live on an ellipsoid cap (curved) or on a flat face (parallelogram). */
export type SolidFace =
  | { type: 'curved'; c: Vec3; r: Vec3; maxTurn: number }
  | {
      type: 'flat';
      o: Vec3;
      u: Vec3;
      v: Vec3;
      /** Largest eye-pair offset, in face units, that keeps both eyes on the face. */
      maxU: number;
      maxV: number;
    };

export type SolidShape = {
  kind: SolidKind;
  pieces: readonly SolidPiece[];
  /** Indices of colliding pieces. */
  colliderIndex: readonly number[];
  /** Resting projection: every piece (painting) and the colliding subset. */
  parts: readonly SolidPart[];
  colliders: readonly SolidPart[];
  /** Area and polar moment (about the origin) per unit radius, at rest. */
  area: number;
  inertia: number;
  /** Farthest silhouette point from the origin at rest, and at any 3D turn. */
  bound: number;
  bound3: number;
  /** Axis-aligned extents at rest, angle 0. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  face: SolidFace;
  /** Eye capsule half-width, half-height and half spacing, in face units. */
  eye: { halfWidth: number; halfHeight: number; spread: number };
};

const tau = Math.PI * 2;

// ---------------------------------------------------------------------------
// 3D models

type RawPiece = {
  points: Vec3[];
  balls?: [Vec3, number][];
  radius: number;
  collide?: boolean;
};
type RawModel = {
  pieces: RawPiece[];
  /** Resting view: rotation about x then y applied before anything else. */
  view?: { pitch: number; yaw: number };
  face: SolidFace;
  eye: SolidShape['eye'];
  /** Target resting area relative to the unit circle. */
  areaScale: number;
};

/** A horizontal ring (in the x-z plane) at height y. */
function ringXZ(cx: number, y: number, cz: number, radius: number, count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * tau;
    return [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius] as Vec3;
  });
}
/** A ring facing the viewer (in the x-y plane) at depth z. */
function ringXY(cx: number, cy: number, z: number, radius: number, count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * tau;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z] as Vec3;
  });
}

const flowerThickness = 1;
const rawModels: Record<SolidKind, () => RawModel> = {
  circle: () => ({
    pieces: [{ points: [[0, 0, 0]], radius: 1 }],
    face: { type: 'curved', c: [0, 0, 0], r: [1, 1, 1], maxTurn: 0.75 },
    eye: { halfWidth: 0.14, halfHeight: 0.28, spread: 0.24 },
    areaScale: 1,
  }),
  // A cone: a round apex over a circular base rim. Seen slightly from above
  // at rest, its base shows as an ellipse.
  triangle: () => {
    const rounding = 0.16;
    return {
      pieces: [
        {
          points: ringXZ(0, 0.575, 0, 1.14 - rounding, 40),
          balls: [[[0, -0.575, 0], 0.49]],
          radius: rounding,
        },
      ],
      view: { pitch: -0.315, yaw: 0 },
      face: { type: 'curved', c: [0, 0.2, 0.15], r: [0.78, 0.66, 0.66], maxTurn: 0.6 },
      eye: { halfWidth: 0.12, halfHeight: 0.27, spread: 0.21 },
      areaScale: 1.05,
    };
  },
  // A rounded cube turned to show its right side and top.
  square: () => {
    const rounding = 0.12,
      h = 1 - rounding;
    const corners: Vec3[] = [];
    for (const x of [-h, h])
      for (const y of [-h, h]) for (const z of [-h, h]) corners.push([x, y, z]);
    const halfWidth = 0.19,
      halfHeight = 0.48,
      spread = 0.3,
      margin = 0.13;
    return {
      pieces: [{ points: corners, radius: rounding }],
      view: { pitch: -0.32, yaw: -0.5 },
      face: {
        type: 'flat',
        o: [0, 0, 1],
        u: [1, 0, 0],
        v: [0, 1, 0],
        maxU: 1 - margin - spread - halfWidth,
        maxV: 1 - margin - halfHeight,
      },
      eye: { halfWidth, halfHeight, spread },
      areaScale: 1.1,
    };
  },
  // Five puffy balls at slightly different depths.
  cloud: () => ({
    pieces: [
      { points: [[-0.228, -0.376, -0.12]], radius: 0.582 },
      { points: [[0.395, -0.328, 0.12]], radius: 0.46 },
      { points: [[-0.627, 0.132, 0.1]], radius: 0.538 },
      { points: [[0.551, 0.239, -0.08]], radius: 0.508 },
      { points: [[-0.057, 0.371, 0.12]], radius: 0.49 },
      { points: [[0, 0, 0]], radius: 0.5, collide: false },
    ],
    face: { type: 'curved', c: [0, 0.05, 0], r: [0.8, 0.62, 0.5], maxTurn: 0.55 },
    eye: { halfWidth: 0.13, halfHeight: 0.29, spread: 0.22 },
    areaScale: 1.12,
  }),
  // A drop of revolution: the hull of a soft tip ball and the round body ball.
  teardrop: () => {
    const rounding = 0.349;
    return {
      pieces: [
        {
          points: [[0, -0.845, 0]],
          balls: [[[0, 0.1, 0], 0.992]],
          radius: rounding,
        },
      ],
      face: { type: 'curved', c: [0, 0.1, 0], r: [0.92, 0.92, 0.92], maxTurn: 0.7 },
      eye: { halfWidth: 0.13, halfHeight: 0.26, spread: 0.24 },
      areaScale: 1,
    };
  },
  // A thick flower: six round lobes extruded into short cylinders. At rest it
  // is tilted so the back face shows below and to the right of the front.
  puff: () => {
    const rounding = 0.05,
      half = flowerThickness / 2;
    const lobe = (cx: number, cy: number, radius: number, collide = true): RawPiece => ({
      points: [
        ...ringXY(cx, cy, half - rounding, radius - rounding, 18),
        ...ringXY(cx, cy, -half + rounding, radius - rounding, 18),
      ],
      radius: rounding,
      collide,
    });
    return {
      pieces: [
        ...Array.from({ length: 6 }, (_, i) => {
          const a = -Math.PI / 2 + (i * tau) / 6;
          return lobe(Math.cos(a) * 0.57, Math.sin(a) * 0.57, 0.42);
        }),
        lobe(0, 0, 0.6, false),
      ],
      view: { pitch: 0.42, yaw: -0.28 },
      face: { type: 'flat', o: [0, 0, half], u: [1, 0, 0], v: [0, 1, 0], maxU: 0.2, maxV: 0.2 },
      eye: { halfWidth: 0.13, halfHeight: 0.32, spread: 0.26 },
      areaScale: 1.05,
    };
  },
};

// ---------------------------------------------------------------------------
// Rotation and projection

/** Row-major 3x3 rotation: about x by `pitch`, then about y by `yaw` (R = Rx · Ry). */
export function solidRotation(pitch: number, yaw: number, out: Float64Array = new Float64Array(9)) {
  const cx = Math.cos(pitch),
    sx = Math.sin(pitch),
    cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  // Rx = [1 0 0; 0 cx -sx; 0 sx cx], Ry = [cy 0 sy; 0 1 0; -sy 0 cy]
  out[0] = cy;
  out[1] = 0;
  out[2] = sy;
  out[3] = sx * sy;
  out[4] = cx;
  out[5] = -sx * cy;
  out[6] = -cx * sy;
  out[7] = sx;
  out[8] = cx * cy;
  return out;
}

const scratchX = new Float64Array(256),
  scratchY = new Float64Array(256),
  scratchOrder = new Int32Array(256),
  scratchHull = new Int32Array(512);

/** Projects one piece with rotation `m` (or none) into a rounded 2D part. */
const ballSteps = 28;
const ballCos = Float64Array.from({ length: ballSteps }, (_, i) => Math.cos((i / ballSteps) * tau));
const ballSin = Float64Array.from({ length: ballSteps }, (_, i) => Math.sin((i / ballSteps) * tau));

export function projectPiece(piece: SolidPiece, m: Float64Array | null, part: SolidPart) {
  let n = piece.count;
  part.radius = piece.radius;
  for (let i = 0; i < n; i++) {
    const x = piece.x[i],
      y = piece.y[i],
      z = piece.z[i];
    scratchX[i] = m ? m[0] * x + m[1] * y + m[2] * z : x;
    scratchY[i] = m ? m[3] * x + m[4] * y + m[5] * z : y;
  }
  // A ball always projects to a circle: add its exact outline (less the sweep).
  for (let b = 0; b < piece.balls; b++) {
    const x = piece.bx[b],
      y = piece.by[b],
      z = piece.bz[b];
    const px = m ? m[0] * x + m[1] * y + m[2] * z : x,
      py = m ? m[3] * x + m[4] * y + m[5] * z : y;
    const r = piece.br[b] - piece.radius;
    for (let k = 0; k < ballSteps; k++) {
      scratchX[n] = px + ballCos[k] * r;
      scratchY[n] = py + ballSin[k] * r;
      n++;
    }
  }
  if (n === 1) {
    part.x[0] = scratchX[0];
    part.y[0] = scratchY[0];
    part.count = 1;
    finishPart(part);
    return;
  }
  // Andrew's monotone chain over preallocated index buffers (no allocation).
  for (let i = 0; i < n; i++) scratchOrder[i] = i;
  const order = scratchOrder.subarray(0, n);
  order.sort((a, b) => scratchX[a] - scratchX[b] || scratchY[a] - scratchY[b]);
  const cross = (o: number, a: number, b: number) =>
    (scratchX[a] - scratchX[o]) * (scratchY[b] - scratchY[o]) -
    (scratchY[a] - scratchY[o]) * (scratchX[b] - scratchX[o]);
  let size = 0;
  for (let k = 0; k < n; k++) {
    const p = order[k];
    while (size >= 2 && cross(scratchHull[size - 2], scratchHull[size - 1], p) <= 1e-10) size--;
    scratchHull[size++] = p;
  }
  const lower = size + 1;
  for (let k = n - 2; k >= 0; k--) {
    const p = order[k];
    while (size >= lower && cross(scratchHull[size - 2], scratchHull[size - 1], p) <= 1e-10) size--;
    scratchHull[size++] = p;
  }
  size = Math.max(1, size - 1);
  let write = 0;
  for (let k = 0; k < size; k++) {
    const x = scratchX[scratchHull[k]],
      y = scratchY[scratchHull[k]];
    if (write && Math.abs(x - part.x[write - 1]) < 1e-9 && Math.abs(y - part.y[write - 1]) < 1e-9)
      continue;
    part.x[write] = x;
    part.y[write] = y;
    write++;
  }
  part.count = write;
  // Ensure clockwise-on-screen order.
  let area = 0;
  for (let i = 0; i < write; i++) {
    const j = i + 1 === write ? 0 : i + 1;
    area += part.x[i] * part.y[j] - part.x[j] * part.y[i];
  }
  if (area < 0)
    for (let i = 0, j = write - 1; i < j; i++, j--) {
      const tx = part.x[i],
        ty = part.y[i];
      part.x[i] = part.x[j];
      part.y[i] = part.y[j];
      part.x[j] = tx;
      part.y[j] = ty;
    }
  finishPart(part);
}

/** A part with room for every point of `piece`. */
export function createPart(piece: SolidPiece): SolidPart {
  const n = Math.max(1, piece.count + piece.balls * ballSteps);
  return {
    x: new Float64Array(n),
    y: new Float64Array(n),
    nx: new Float64Array(n),
    ny: new Float64Array(n),
    count: 0,
    radius: piece.radius,
    cx: 0,
    cy: 0,
    bound: 0,
  };
}

/** Recomputes normals and the bounding circle after the core moved or scaled. */
export function finishPart(part: SolidPart) {
  const { count, x, y } = part;
  let cx = 0,
    cy = 0;
  for (let i = 0; i < count; i++) {
    cx += x[i];
    cy += y[i];
    if (count > 1) {
      const j = i + 1 === count ? 0 : i + 1;
      const dx = x[j] - x[i],
        dy = y[j] - y[i],
        length = Math.hypot(dx, dy) || 1;
      part.nx[i] = dy / length;
      part.ny[i] = -dx / length;
    }
  }
  cx /= count;
  cy /= count;
  let bound = 0;
  for (let i = 0; i < count; i++) bound = Math.max(bound, Math.hypot(x[i] - cx, y[i] - cy));
  part.cx = cx;
  part.cy = cy;
  part.bound = bound + part.radius;
}

/** Distance from a point to a rounded part (negative inside). */
export function partDistance(part: SolidPart, px: number, py: number) {
  const { x, y, count, radius } = part;
  if (count === 1) return Math.hypot(px - x[0], py - y[0]) - radius;
  let inside = true,
    best = Infinity;
  for (let i = 0; i < count; i++) {
    const j = i + 1 === count ? 0 : i + 1;
    const ex = x[j] - x[i],
      ey = y[j] - y[i];
    const t = Math.max(0, Math.min(1, ((px - x[i]) * ex + (py - y[i]) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(px - x[i] - ex * t, py - y[i] - ey * t));
    if ((px - x[i]) * part.nx[i] + (py - y[i]) * part.ny[i] > 0) inside = false;
  }
  return (inside ? -best : best) - radius;
}

/** Signed distance to a projected silhouette (a list of parts). */
export function partsDistance(parts: readonly SolidPart[], px: number, py: number) {
  let best = Infinity;
  for (const part of parts) best = Math.min(best, partDistance(part, px, py));
  return best;
}
/** Signed distance to the resting silhouette. */
export const shapeDistance = (shape: SolidShape, px: number, py: number) =>
  partsDistance(shape.parts, px, py);

function applyView(p: Vec3, m: Float64Array | null): Vec3 {
  if (!m) return p;
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
}

function buildShape(kind: SolidKind): SolidShape {
  const raw = rawModels[kind]();
  const view = raw.view ? solidRotation(raw.view.pitch, raw.view.yaw) : null;
  // Bake the resting view into the model.
  let pieces: SolidPiece[] = raw.pieces.map((p) => {
    const points = p.points.map((point) => applyView(point, view));
    const balls = (p.balls ?? []).map(([c, r]) => [applyView(c, view), r] as const);
    return {
      x: Float64Array.from(points, (q) => q[0]),
      y: Float64Array.from(points, (q) => q[1]),
      z: Float64Array.from(points, (q) => q[2]),
      count: points.length,
      bx: Float64Array.from(balls, (b) => b[0][0]),
      by: Float64Array.from(balls, (b) => b[0][1]),
      bz: Float64Array.from(balls, (b) => b[0][2]),
      br: Float64Array.from(balls, (b) => b[1]),
      balls: balls.length,
      radius: p.radius,
      collide: p.collide !== false,
    };
  });
  let face: SolidFace =
    raw.face.type === 'curved'
      ? { ...raw.face, c: applyView(raw.face.c, view) }
      : {
          ...raw.face,
          o: applyView(raw.face.o, view),
          u: applyView(raw.face.u, view),
          v: applyView(raw.face.v, view),
        };
  const project = () =>
    pieces.map((piece) => {
      const part = createPart(piece);
      projectPiece(piece, null, part);
      return part;
    });
  // Mass properties of the resting silhouette, sampled once per kind.
  const sample = (parts: SolidPart[]) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of parts) {
      minX = Math.min(minX, p.cx - p.bound);
      maxX = Math.max(maxX, p.cx + p.bound);
      minY = Math.min(minY, p.cy - p.bound);
      maxY = Math.max(maxY, p.cy + p.bound);
    }
    const cell = Math.max(maxX - minX, maxY - minY) / 160,
      cellArea = cell * cell;
    let area = 0,
      sx = 0,
      sy = 0,
      sxx = 0;
    for (let gy = minY + cell / 2; gy < maxY; gy += cell)
      for (let gx = minX + cell / 2; gx < maxX; gx += cell)
        if (partsDistance(parts, gx, gy) <= 0) {
          area += cellArea;
          sx += gx * cellArea;
          sy += gy * cellArea;
          sxx += (gx * gx + gy * gy) * cellArea;
        }
    return { area, cx: sx / area, cy: sy / area, sxx };
  };
  const first = sample(project());
  // Turn about the middle of the volume.
  let zSum = 0,
    zCount = 0;
  for (const piece of pieces)
    for (let i = 0; i < piece.count; i++) {
      zSum += piece.z[i];
      zCount++;
    }
  const cz = zSum / zCount;
  const scale = Math.sqrt((Math.PI * raw.areaScale) / first.area);
  const move = (p: Vec3): Vec3 => [
    (p[0] - first.cx) * scale,
    (p[1] - first.cy) * scale,
    (p[2] - cz) * scale,
  ];
  pieces = pieces.map((piece) => {
    for (let i = 0; i < piece.count; i++) {
      [piece.x[i], piece.y[i], piece.z[i]] = move([piece.x[i], piece.y[i], piece.z[i]]);
    }
    for (let i = 0; i < piece.balls; i++) {
      [piece.bx[i], piece.by[i], piece.bz[i]] = move([piece.bx[i], piece.by[i], piece.bz[i]]);
      piece.br[i] *= scale;
    }
    piece.radius *= scale;
    return piece;
  });
  face =
    face.type === 'curved'
      ? { ...face, c: move(face.c), r: [face.r[0] * scale, face.r[1] * scale, face.r[2] * scale] }
      : {
          ...face,
          o: move(face.o),
          u: [face.u[0] * scale, face.u[1] * scale, face.u[2] * scale],
          v: [face.v[0] * scale, face.v[1] * scale, face.v[2] * scale],
        };
  const parts = project();
  const rest = sample(parts);
  const inertia = rest.sxx - rest.area * (rest.cx * rest.cx + rest.cy * rest.cy);
  let bound = 0,
    bound3 = 0,
    left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  for (const p of parts)
    for (let i = 0; i < p.count; i++) {
      bound = Math.max(bound, Math.hypot(p.x[i], p.y[i]) + p.radius);
      left = Math.min(left, p.x[i] - p.radius);
      right = Math.max(right, p.x[i] + p.radius);
      top = Math.min(top, p.y[i] - p.radius);
      bottom = Math.max(bottom, p.y[i] + p.radius);
    }
  for (const piece of pieces) {
    for (let i = 0; i < piece.count; i++)
      bound3 = Math.max(bound3, Math.hypot(piece.x[i], piece.y[i], piece.z[i]) + piece.radius);
    for (let i = 0; i < piece.balls; i++)
      bound3 = Math.max(bound3, Math.hypot(piece.bx[i], piece.by[i], piece.bz[i]) + piece.br[i]);
  }
  const colliderIndex = pieces.flatMap((piece, i) => (piece.collide ? [i] : []));
  return {
    kind,
    pieces,
    colliderIndex,
    parts,
    colliders: colliderIndex.map((i) => parts[i]),
    area: Math.PI * raw.areaScale,
    inertia,
    bound,
    bound3,
    left,
    right,
    top,
    bottom,
    face,
    eye: { ...raw.eye },
  };
}

const shapes = new Map<SolidKind, SolidShape>();
export function solidShape(kind: SolidKind): SolidShape {
  let shape = shapes.get(kind);
  if (!shape) shapes.set(kind, (shape = buildShape(kind)));
  return shape;
}

/** Kept for API compatibility: solids are normalized to equal visual mass. */
export const solidRadiusScale = (_kind: string) => 1;

/** Adds one rounded part to the current path. Coordinates are multiplied by `scale`. */
export function tracePart(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  part: SolidPart,
  scale: number,
  offsetX = 0,
  offsetY = 0,
) {
  const { x, y, nx, ny, count } = part;
  const radius = part.radius * scale;
  if (count === 1) {
    const cx = x[0] * scale + offsetX,
      cy = y[0] * scale + offsetY;
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, tau);
    return;
  }
  if (count === 2) {
    // Capsule: two half circles.
    const a = Math.atan2(ny[1], nx[1]),
      b = Math.atan2(ny[0], nx[0]);
    ctx.moveTo(
      x[0] * scale + offsetX + Math.cos(a) * radius,
      y[0] * scale + offsetY + Math.sin(a) * radius,
    );
    ctx.arc(x[0] * scale + offsetX, y[0] * scale + offsetY, radius, a, b);
    ctx.arc(x[1] * scale + offsetX, y[1] * scale + offsetY, radius, b, a);
    ctx.closePath();
    return;
  }
  // Offset edges of the core; gentle corners (dense hulls of curved
  // volumes) are joined by a quadratic spline through the edge midpoints so
  // the outline reads perfectly smooth, while real corners keep their arc.
  const px = (i: number) => x[i] * scale + offsetX,
    py = (i: number) => y[i] * scale + offsetY;
  const midX = (i: number) => {
    const j = i + 1 === count ? 0 : i + 1;
    return (px(i) + px(j)) / 2 + nx[i] * radius;
  };
  const midY = (i: number) => {
    const j = i + 1 === count ? 0 : i + 1;
    return (py(i) + py(j)) / 2 + ny[i] * radius;
  };
  ctx.moveTo(midX(0), midY(0));
  for (let k = 1; k <= count; k++) {
    const vertex = k === count ? 0 : k,
      before = k - 1;
    const dot = nx[before] * nx[vertex] + ny[before] * ny[vertex];
    const after = vertex + 1 === count ? 0 : vertex + 1;
    const short =
      Math.hypot(x[vertex] - x[before], y[vertex] - y[before]) < smoothEdge &&
      Math.hypot(x[after] - x[vertex], y[after] - y[vertex]) < smoothEdge;
    if (dot > smoothCorner && short) {
      // Offset corner: where both offset edges meet.
      const f = radius / (1 + dot);
      ctx.quadraticCurveTo(
        px(vertex) + (nx[before] + nx[vertex]) * f,
        py(vertex) + (ny[before] + ny[vertex]) * f,
        midX(vertex),
        midY(vertex),
      );
    } else {
      ctx.lineTo(px(vertex) + nx[before] * radius, py(vertex) + ny[before] * radius);
      ctx.arc(
        px(vertex),
        py(vertex),
        radius,
        Math.atan2(ny[before], nx[before]),
        Math.atan2(ny[vertex], nx[vertex]),
      );
      ctx.lineTo(midX(vertex), midY(vertex));
    }
  }
  ctx.closePath();
}

/** Corners gentler than 25° between short edges are drawn as a smooth spline. */
const smoothCorner = Math.cos(0.44),
  smoothEdge = 0.3;

// ---------------------------------------------------------------------------
// Eyes

const capsuleSegments = 7;
/** Capsule outline with round caps, centered at the origin. */
function capsule(halfWidth: number, halfHeight: number) {
  const straight = Math.max(0, halfHeight - halfWidth);
  const points: number[] = [];
  for (let i = 0; i <= capsuleSegments; i++) {
    const a = Math.PI + (Math.PI * i) / capsuleSegments;
    points.push(Math.cos(a) * halfWidth, -straight + Math.sin(a) * halfWidth);
  }
  for (let i = 0; i <= capsuleSegments; i++) {
    const a = (Math.PI * i) / capsuleSegments;
    points.push(Math.cos(a) * halfWidth, straight + Math.sin(a) * halfWidth);
  }
  return points;
}

const capsuleCache = new Map<SolidKind, Float64Array>();
function eyeOutline(shape: SolidShape) {
  let points = capsuleCache.get(shape.kind);
  if (!points) {
    points = Float64Array.from(capsule(shape.eye.halfWidth, shape.eye.halfHeight));
    capsuleCache.set(shape.kind, points);
  }
  return points;
}

/** Bit 0: left eye faces the viewer; bit 1: right eye. Set by `solidEyes`. */
export let solidEyesVisible = 3;

/**
 * Writes the outlines of both eyes, in unit body space, into `out`
 * (x, y pairs; first half left eye, second half right eye). `lookX/lookY`
 * lie in the unit disk: the face turns toward that direction. `open` scales
 * the eyes vertically for blinking. `m` is the body's 3D turn away from its
 * resting pose (null at rest): eyes are decals on the volume, so they turn
 * with it and hide when their side faces away. Returns points per eye.
 */
export function solidEyes(
  shape: SolidShape,
  lookX: number,
  lookY: number,
  open: number,
  out: Float64Array,
  m: Float64Array | null = null,
) {
  const outline = eyeOutline(shape);
  const perEye = outline.length / 2;
  const { spread } = shape.eye;
  const face = shape.face;
  const length = Math.hypot(lookX, lookY);
  if (length > 1) {
    lookX /= length;
    lookY /= length;
  }
  solidEyesVisible = 3;
  if (face.type === 'flat') {
    // Planar faces translate the decal inside the face; nothing bends or leaves it.
    const offsetU = lookX * face.maxU,
      offsetV = lookY * face.maxV;
    const { o, u: U, v: V } = face;
    if (m) {
      // Face normal (U × V), turned with the body.
      const nx = U[1] * V[2] - U[2] * V[1],
        ny = U[2] * V[0] - U[0] * V[2],
        nz = U[0] * V[1] - U[1] * V[0];
      const facing = m[6] * nx + m[7] * ny + m[8] * nz;
      if (facing * Math.sign(nz || 1) < 0.08 * Math.hypot(nx, ny, nz)) solidEyesVisible = 0;
    }
    for (let e = 0; e < 2; e++) {
      const side = e ? 1 : -1;
      for (let i = 0; i < perEye; i++) {
        const a = offsetU + side * spread + outline[i * 2],
          b = offsetV + outline[i * 2 + 1] * open;
        const x = o[0] + U[0] * a + V[0] * b,
          y = o[1] + U[1] * a + V[1] * b,
          z = o[2] + U[2] * a + V[2] * b;
        const k = (e * perEye + i) * 2;
        out[k] = m ? m[0] * x + m[1] * y + m[2] * z : x;
        out[k + 1] = m ? m[3] * x + m[4] * y + m[5] * z : y;
      }
    }
    return perEye;
  }
  // Curved faces: the decal is a texture on an ellipsoid. A shortest-arc
  // rotation turns the face toward the look direction and every outline
  // vertex is mapped onto the surface, so eyes foreshorten, lean and change
  // relative height exactly as the volume dictates.
  const angle = Math.min(1, Math.hypot(lookX, lookY)) * face.maxTurn;
  const sin = Math.sin(angle),
    cos = Math.cos(angle);
  const axisLength = Math.hypot(lookX, lookY) || 1;
  // Rotation axis: z × direction = (-dy, dx, 0).
  const kx = -lookY / axisLength,
    ky = lookX / axisLength;
  const { c, r } = face;
  for (let e = 0; e < 2; e++) {
    const side = e ? 1 : -1;
    for (let i = -1; i < perEye; i++) {
      // i = -1 is the eye center, used for visibility.
      const u = (side * spread + (i < 0 ? 0 : outline[i * 2])) / r[0],
        v = ((i < 0 ? 0 : outline[i * 2 + 1]) * open) / r[1];
      const rho = Math.hypot(u, v);
      const f = rho > 1e-9 ? Math.sin(rho) / rho : 1;
      const sx = u * f,
        sy = v * f,
        sz = Math.cos(rho);
      // Rodrigues rotation with axis k = (kx, ky, 0).
      const dot = kx * sx + ky * sy;
      const X = sx * cos + ky * sz * sin + kx * dot * (1 - cos),
        Y = sy * cos - kx * sz * sin + ky * dot * (1 - cos),
        Z = sz * cos + (kx * sy - ky * sx) * sin;
      if (i < 0) {
        if (m && m[6] * X + m[7] * Y + m[8] * Z < 0.12) solidEyesVisible &= e ? 1 : 2;
        continue;
      }
      const x = c[0] + r[0] * X,
        y = c[1] + r[1] * Y,
        z = c[2] + r[2] * Z;
      const k = (e * perEye + i) * 2;
      out[k] = m ? m[0] * x + m[1] * y + m[2] * z : x;
      out[k + 1] = m ? m[3] * x + m[4] * y + m[5] * z : y;
    }
  }
  return perEye;
}
export const solidEyePointCount = (shape: SolidShape) => eyeOutline(shape).length;

// ---------------------------------------------------------------------------
// Sprites

/** Fills a silhouette (all projected parts) in one flat color. */
function paintParts(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  parts: readonly SolidPart[],
  color: string,
  scale: number,
  x: number,
  y: number,
) {
  ctx.beginPath();
  for (const part of parts) tracePart(ctx, part, scale, x, y);
  ctx.fillStyle = color;
  ctx.fill();
}

type Surface = HTMLCanvasElement | OffscreenCanvas;
export type SolidSprite = { image: Surface; extent: number; radius: number };

function surface(size: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/**
 * Paints the resting silhouette once at a bucketed pixel radius. Resting
 * bodies are drawn by rotating and scaling this bitmap, which is far cheaper
 * than re-filling paths every frame.
 */
export function createSolidSprite(
  shape: SolidShape,
  color: string,
  pixelRadius: number,
): SolidSprite {
  const extent = shape.bound + 0.04;
  const size = Math.max(4, Math.ceil(extent * 2 * pixelRadius) + 2);
  const image = surface(size);
  const ctx = image.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx) paintParts(ctx, shape.parts, color, pixelRadius, size / 2, size / 2);
  return { image, extent: size / 2 / pixelRadius, radius: pixelRadius };
}

/** Paints one solid directly (no sprite cache); used by galleries and tests. */
export function paintSolidPreview(
  ctx: CanvasRenderingContext2D,
  kind: SolidKind,
  options: {
    x: number;
    y: number;
    radius: number;
    angle?: number;
    /** 3D turn away from the resting pose. */
    pitch?: number;
    yaw?: number;
    color: string;
    faceColor?: string;
    lookX?: number;
    lookY?: number;
    open?: number;
  },
) {
  const shape = solidShape(kind);
  const { x, y, radius, angle = 0, pitch = 0, yaw = 0 } = options;
  const m = pitch || yaw ? solidRotation(pitch, yaw) : null;
  const parts = m
    ? shape.pieces.map((piece) => {
        const part = createPart(piece);
        projectPiece(piece, m, part);
        return part;
      })
    : shape.parts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  paintParts(ctx, parts, options.color, radius, 0, 0);
  if (options.faceColor) {
    const points = new Float64Array(solidEyePointCount(shape) * 2);
    const perEye = solidEyes(
      shape,
      options.lookX ?? 0,
      options.lookY ?? 0,
      options.open ?? 1,
      points,
      m,
    );
    ctx.beginPath();
    for (let e = 0; e < 2; e++) {
      if (!(solidEyesVisible & (1 << e))) continue;
      const base = e * perEye * 2;
      ctx.moveTo(points[base] * radius, points[base + 1] * radius);
      for (let i = 1; i < perEye; i++)
        ctx.lineTo(points[base + i * 2] * radius, points[base + i * 2 + 1] * radius);
      ctx.closePath();
    }
    ctx.fillStyle = options.faceColor;
    ctx.fill();
  }
  ctx.restore();
}
