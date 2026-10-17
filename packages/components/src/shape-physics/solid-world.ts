/**
 * A small rigid-body world for projected solids.
 *
 * - Rounded convex parts collide with SAT + edge clipping (two-point
 *   manifolds keep flat faces flat) or closest features when cores separate.
 * - Sweep-and-prune broadphase on a persistently sorted array (near O(n)).
 * - Soft-step solver: 60 Hz steps with substeps, warm starting, relax
 *   iterations and a final restitution pass. Speculative contacts stop
 *   fast bodies before they sink into each other.
 * - Islands fall asleep together; sleeping pairs skip all collision work and
 *   a fully settled world skips the solver entirely.
 * Everything in the hot path reuses preallocated objects.
 */
import {
  createPart,
  finishPart,
  projectPiece,
  solidRotation,
  type SolidPart,
  type SolidShape,
} from './solid-shapes';

export type SolidBody = {
  id: number;
  shape: SolidShape;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  w: number;
  /** Pixels per unit of the shape. */
  radius: number;
  /** Appearance scale (0..1) applied to both painting and collision. */
  growth: number;
  inverseMass: number;
  inverseInertia: number;
  awake: boolean;
  sleepTime: number;
  /** Sleeping island tag; bodies that fell asleep together wake together. */
  island: number;
  /** Set once the body is fully inside the container (spawn walls are open before). */
  entered: boolean;
  /** Seconds spent outside the container without entering. */
  outside: number;
  /** Fade-out progress when an overfull container releases this body. */
  leaving: number;
  /** Asleep when this step's collision pass started. */
  skipped: boolean;
  /** In contact with anything during the last step. */
  touching: boolean;
  /** 3D turn away from the resting pose (about x, then y) and its rates. */
  pitch: number;
  yaw: number;
  pitchRate: number;
  yawRate: number;
  /** True while the body is turned away from its resting pose. */
  turned: boolean;
  rotation: Float64Array;
  /** Current projected silhouette: every piece, and the colliding subset (local space). */
  paint: SolidPart[];
  local: SolidPart[];
  // Solver scratch
  dx: number;
  dy: number;
  da: number;
  root: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  parts: SolidPart[];
};

type ContactPoint = {
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  separation: number;
  normalImpulse: number;
  tangentImpulse: number;
  maxNormalImpulse: number;
  normalMass: number;
  tangentMass: number;
  relativeVelocity: number;
};
type Manifold = {
  key: number;
  a: SolidBody;
  b: SolidBody | null;
  nx: number;
  ny: number;
  count: number;
  points: [ContactPoint, ContactPoint];
  touching: boolean;
  fresh: boolean;
};

export type SolidWorldSettings = {
  gravity: number;
  wind: number;
  restitution: number;
  friction: number;
  damping: number;
  /** '2d' keeps every figure flat (no out-of-plane tumbling). */
  depth?: '3d' | '2d';
};

const substeps = 4;
const maxBiasVelocity = 420;
const linearSlop = 0.5;
const speculativeDistance = 3;
const sleepVelocity = 7;
const sleepDelay = 0.45;
const maxVelocity = 4200;
const wallKeyBase = 0xfffff;
const uprightStiffness = 9;
/** Supported bodies return to their resting 3D pose with this spring. */
const tumbleStiffness = 55;
const tumbleDamping = 13;
const maxTumbleRate = 14;
const uprightResting = 5;
const uprightDamping = 1.6;

const makePoint = (): ContactPoint => ({
  id: 0,
  ax: 0,
  ay: 0,
  bx: 0,
  by: 0,
  separation: 0,
  normalImpulse: 0,
  tangentImpulse: 0,
  maxNormalImpulse: 0,
  normalMass: 0,
  tangentMass: 0,
  relativeVelocity: 0,
});
const makeManifold = (): Manifold => ({
  key: 0,
  a: null as unknown as SolidBody,
  b: null,
  nx: 0,
  ny: 0,
  count: 0,
  points: [makePoint(), makePoint()],
  touching: false,
  fresh: true,
});

export function createSolidBody(
  id: number,
  shape: SolidShape,
  radius: number,
  x: number,
  y: number,
): SolidBody {
  const body: SolidBody = {
    id,
    shape,
    x,
    y,
    angle: 0,
    vx: 0,
    vy: 0,
    w: 0,
    radius,
    growth: 1,
    inverseMass: 0,
    inverseInertia: 0,
    awake: true,
    sleepTime: 0,
    island: 0,
    entered: false,
    outside: 0,
    leaving: 0,
    skipped: false,
    touching: false,
    pitch: 0,
    yaw: 0,
    pitchRate: 0,
    yawRate: 0,
    turned: false,
    rotation: new Float64Array(9),
    paint: [],
    local: [],
    dx: 0,
    dy: 0,
    da: 0,
    root: 0,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    parts: [],
  };
  attachSolidShape(body, shape);
  setSolidRadius(body, radius);
  return body;
}

/** (Re)builds the per-body silhouette buffers for `shape`, at rest. */
export function attachSolidShape(body: SolidBody, shape: SolidShape) {
  body.shape = shape;
  body.paint = shape.pieces.map((piece) => {
    const part = createPart(piece);
    projectPiece(piece, null, part);
    return part;
  });
  body.local = shape.colliderIndex.map((i) => body.paint[i]);
  body.parts = shape.colliderIndex.map((i) => createPart(shape.pieces[i]));
  body.turned = false;
  body.pitch = body.yaw = 0;
}

/**
 * Reprojects the silhouette for the current 3D turn. Resting bodies copy the
 * shared resting projection instead of recomputing hulls.
 */
export function projectSolidBody(body: SolidBody) {
  const turned = Math.abs(body.pitch) + Math.abs(body.yaw) > 2e-3;
  if (!turned && !body.turned) return;
  body.turned = turned;
  const pieces = body.shape.pieces;
  if (turned) {
    solidRotation(body.pitch, body.yaw, body.rotation);
    for (let i = 0; i < pieces.length; i++) projectPiece(pieces[i], body.rotation, body.paint[i]);
  } else {
    body.pitch = body.yaw = 0;
    for (let i = 0; i < pieces.length; i++) projectPiece(pieces[i], null, body.paint[i]);
  }
}

/** Mass follows area; a unit density keeps impulses in a comfortable range. */
export function setSolidRadius(body: SolidBody, radius: number) {
  body.radius = radius;
  const scale = radius * Math.max(0.05, body.growth);
  const mass = (body.shape.area * scale * scale) / 1000;
  body.inverseMass = 1 / mass;
  body.inverseInertia = 1 / ((body.shape.inertia * scale ** 4) / 1000);
}

/**
 * Highest (direction 1) or lowest (direction -1) silhouette point of a
 * world-space rounded part above/below the vertical line at `x`; NaN if the
 * line misses the part.
 */
export function partProfile(part: SolidPart, x: number, direction: number) {
  const { count, radius } = part;
  let best = NaN;
  const better = (y: number) => {
    if (Number.isNaN(best) || (direction > 0 ? y < best : y > best)) best = y;
  };
  for (let i = 0; i < count; i++) {
    const dx = x - part.x[i];
    if (Math.abs(dx) <= radius) {
      const rise = Math.sqrt(radius * radius - dx * dx);
      better(part.y[i] - direction * rise);
    }
    if (count === 1) break;
    // Offset edges facing the open side.
    const ny = part.ny[i];
    if (direction > 0 ? ny >= 0 : ny <= 0) continue;
    const j = i + 1 === count ? 0 : i + 1;
    const ax = part.x[i] + part.nx[i] * radius,
      bx = part.x[j] + part.nx[i] * radius;
    if ((x - ax) * (x - bx) > 0 || ax === bx) continue;
    const t = (x - ax) / (bx - ax);
    better(part.y[i] + (part.y[j] - part.y[i]) * t + ny * radius);
  }
  return best;
}

/** Moves the collision parts into world space and refreshes the AABB. */
export function updateSolidTransform(body: SolidBody, margin = 0) {
  const scale = body.radius * body.growth;
  const cos = Math.cos(body.angle),
    sin = Math.sin(body.angle);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const local = body.local;
  for (let p = 0; p < local.length; p++) {
    const source = local[p],
      target = body.parts[p];
    const radius = source.radius * scale;
    target.count = source.count;
    for (let i = 0; i < source.count; i++) {
      const lx = source.x[i] * scale,
        ly = source.y[i] * scale;
      const x = body.x + lx * cos - ly * sin,
        y = body.y + lx * sin + ly * cos;
      target.x[i] = x;
      target.y[i] = y;
      target.nx[i] = source.nx[i] * cos - source.ny[i] * sin;
      target.ny[i] = source.nx[i] * sin + source.ny[i] * cos;
      // Exact extents of the rounded core.
      if (x - radius < minX) minX = x - radius;
      if (x + radius > maxX) maxX = x + radius;
      if (y - radius < minY) minY = y - radius;
      if (y + radius > maxY) maxY = y + radius;
    }
    target.radius = radius;
    const cx = source.cx * scale,
      cy = source.cy * scale;
    target.cx = body.x + cx * cos - cy * sin;
    target.cy = body.y + cx * sin + cy * cos;
    target.bound = source.bound * scale;
  }
  body.minX = minX - margin;
  body.minY = minY - margin;
  body.maxX = maxX + margin;
  body.maxY = maxY + margin;
}
export { finishPart };

// ---------------------------------------------------------------------------
// Narrow phase. Each function writes world points/separations into `m`
// with the normal pointing from part A to part B.

function setPoint(
  m: Manifold,
  index: number,
  x: number,
  y: number,
  separation: number,
  id: number,
) {
  const p = m.points[index];
  p.ax = x; // world position for now; converted to anchors later
  p.ay = y;
  p.separation = separation;
  p.id = id;
}

function collideCircles(a: SolidPart, b: SolidPart, margin: number, m: Manifold) {
  const dx = b.x[0] - a.x[0],
    dy = b.y[0] - a.y[0];
  const distance = Math.hypot(dx, dy);
  const separation = distance - a.radius - b.radius;
  if (separation > margin) return 0;
  const nx = distance > 1e-9 ? dx / distance : 0,
    ny = distance > 1e-9 ? dy / distance : 1;
  m.nx = nx;
  m.ny = ny;
  const reach = a.radius + separation / 2;
  setPoint(m, 0, a.x[0] + nx * reach, a.y[0] + ny * reach, separation, 0);
  return 1;
}

/** Polygon `p` against circle `c`; the normal points from p to c. */
function collidePolygonCircle(
  p: SolidPart,
  c: SolidPart,
  margin: number,
  m: Manifold,
  flip: boolean,
) {
  const cx = c.x[0],
    cy = c.y[0],
    radius = p.radius + c.radius;
  let best = -Infinity,
    edge = 0;
  for (let i = 0; i < p.count; i++) {
    const s = p.nx[i] * (cx - p.x[i]) + p.ny[i] * (cy - p.y[i]);
    if (s > best) {
      best = s;
      edge = i;
    }
  }
  if (best - radius > margin) return 0;
  const next = edge + 1 === p.count ? 0 : edge + 1;
  const x1 = p.x[edge],
    y1 = p.y[edge],
    x2 = p.x[next],
    y2 = p.y[next];
  let nx = p.nx[edge],
    ny = p.ny[edge],
    distance = best,
    // Closest point on the core
    qx = cx - nx * best,
    qy = cy - ny * best;
  if (best > 0) {
    const u1 = (cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1),
      u2 = (cx - x2) * (x1 - x2) + (cy - y2) * (y1 - y2);
    if (u1 < 0 || u2 < 0) {
      qx = u1 < 0 ? x1 : x2;
      qy = u1 < 0 ? y1 : y2;
      const dx = cx - qx,
        dy = cy - qy;
      distance = Math.hypot(dx, dy);
      if (distance - radius > margin) return 0;
      nx = dx / distance;
      ny = dy / distance;
    }
  }
  const separation = distance - radius;
  // Midpoint between the two surfaces
  const px = qx + nx * (p.radius + separation / 2),
    py = qy + ny * (p.radius + separation / 2);
  m.nx = flip ? -nx : nx;
  m.ny = flip ? -ny : ny;
  setPoint(m, 0, px, py, separation, 0);
  return 1;
}

let separationEdge = 0;
function maxSeparation(a: SolidPart, b: SolidPart) {
  let best = -Infinity;
  for (let i = 0; i < a.count; i++) {
    const nx = a.nx[i],
      ny = a.ny[i],
      ax = a.x[i],
      ay = a.y[i];
    let s = Infinity;
    for (let j = 0; j < b.count; j++) {
      const d = nx * (b.x[j] - ax) + ny * (b.y[j] - ay);
      if (d < s) s = d;
    }
    if (s > best) {
      best = s;
      separationEdge = i;
    }
  }
  return best;
}

// Closest points between two segments (Real-Time Collision Detection 5.1.9)
let segmentS = 0,
  segmentT = 0;
function segmentDistance(
  p1x: number,
  p1y: number,
  q1x: number,
  q1y: number,
  p2x: number,
  p2y: number,
  q2x: number,
  q2y: number,
) {
  const d1x = q1x - p1x,
    d1y = q1y - p1y,
    d2x = q2x - p2x,
    d2y = q2y - p2y,
    rx = p1x - p2x,
    ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y,
    e = d2x * d2x + d2y * d2y,
    f = d2x * rx + d2y * ry;
  const c = d1x * rx + d1y * ry,
    b = d1x * d2x + d1y * d2y,
    denominator = a * e - b * b;
  let s = denominator > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denominator)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.max(0, Math.min(1, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.max(0, Math.min(1, (b - c) / a));
  }
  segmentS = s;
  segmentT = t;
}

function collidePolygons(a: SolidPart, b: SolidPart, margin: number, m: Manifold) {
  const radius = a.radius + b.radius;
  const separationA = maxSeparation(a, b);
  const edgeA = separationEdge;
  if (separationA - radius > margin) return 0;
  const separationB = maxSeparation(b, a);
  const edgeB = separationEdge;
  if (separationB - radius > margin) return 0;
  const flip = separationB > separationA + 0.1 * linearSlop;
  const ref = flip ? b : a,
    inc = flip ? a : b,
    edge = flip ? edgeB : edgeA;
  const refNext = edge + 1 === ref.count ? 0 : edge + 1;
  const nx = ref.nx[edge],
    ny = ref.ny[edge];
  // Incident edge: most anti-parallel to the reference normal.
  let incident = 0,
    lowest = Infinity;
  for (let i = 0; i < inc.count; i++) {
    const d = nx * inc.nx[i] + ny * inc.ny[i];
    if (d < lowest) {
      lowest = d;
      incident = i;
    }
  }
  const incNext = incident + 1 === inc.count ? 0 : incident + 1;
  const v11x = ref.x[edge],
    v11y = ref.y[edge],
    v12x = ref.x[refNext],
    v12y = ref.y[refNext];
  // Incident edge runs opposite to the reference edge.
  const v21x = inc.x[incident],
    v21y = inc.y[incident],
    v22x = inc.x[incNext],
    v22y = inc.y[incNext];
  const separation = Math.max(separationA, separationB);
  if (separation > 0.1 * linearSlop) {
    segmentDistance(v11x, v11y, v12x, v12y, v21x, v21y, v22x, v22y);
    const s = segmentS,
      t = segmentT;
    if ((s === 0 || s === 1) && (t === 0 || t === 1)) {
      // Vertex against vertex: a single rounded contact.
      const ax = v11x + (v12x - v11x) * s,
        ay = v11y + (v12y - v11y) * s,
        bx = v21x + (v22x - v21x) * t,
        by = v21y + (v22y - v21y) * t;
      const dx = bx - ax,
        dy = by - ay,
        distance = Math.hypot(dx, dy);
      if (distance - radius > margin || distance < 1e-9) return 0;
      let ux = dx / distance,
        uy = dy / distance;
      const separation = distance - radius;
      const px = ax + ux * (ref.radius + separation / 2),
        py = ay + uy * (ref.radius + separation / 2);
      if (flip) {
        ux = -ux;
        uy = -uy;
      }
      m.nx = ux;
      m.ny = uy;
      setPoint(m, 0, px, py, separation, (edge << 8) | (incident << 1) | 1);
      return 1;
    }
  }
  // Clip the incident edge against the reference face side planes.
  const tx = v12x - v11x,
    ty = v12y - v11y,
    length = Math.hypot(tx, ty);
  const ux = tx / length,
    uy = ty / length;
  const upper1 = length;
  const upper2 = (v21x - v11x) * ux + (v21y - v11y) * uy;
  const lower2 = (v22x - v11x) * ux + (v22y - v11y) * uy;
  let lowerX = v22x,
    lowerY = v22y,
    upperX = v21x,
    upperY = v21y;
  const span = upper2 - lower2;
  if (span > 1e-9) {
    if (lower2 < 0) {
      const f = -lower2 / span;
      lowerX = v22x + (v21x - v22x) * f;
      lowerY = v22y + (v21y - v22y) * f;
    }
    if (upper2 > upper1) {
      const f = (upper1 - lower2) / span;
      upperX = v22x + (v21x - v22x) * f;
      upperY = v22y + (v21y - v22y) * f;
    }
  }
  const separationLower = (lowerX - v11x) * nx + (lowerY - v11y) * ny;
  const separationUpper = (upperX - v11x) * nx + (upperY - v11y) * ny;
  m.nx = flip ? -nx : nx;
  m.ny = flip ? -ny : ny;
  let count = 0;
  const lowerReach = (ref.radius - inc.radius - separationLower) / 2;
  const upperReach = (ref.radius - inc.radius - separationUpper) / 2;
  if (separationLower - radius <= margin)
    setPoint(
      m,
      count++,
      lowerX + nx * lowerReach,
      lowerY + ny * lowerReach,
      separationLower - radius,
      (edge << 8) | (incNext << 1),
    );
  if (separationUpper - radius <= margin)
    setPoint(
      m,
      count++,
      upperX + nx * upperReach,
      upperY + ny * upperReach,
      separationUpper - radius,
      (edge << 8) | (incident << 1) | 0x10000,
    );
  return count;
}

function collideParts(a: SolidPart, b: SolidPart, margin: number, m: Manifold) {
  if (a.count === 1 && b.count === 1) return collideCircles(a, b, margin, m);
  if (b.count === 1) return collidePolygonCircle(a, b, margin, m, false);
  if (a.count === 1) return collidePolygonCircle(b, a, margin, m, true);
  return collidePolygons(a, b, margin, m);
}

/** Wall planes: normal points from the container interior into the wall. */
function collideWall(
  part: SolidPart,
  nx: number,
  ny: number,
  offset: number,
  margin: number,
  m: Manifold,
) {
  // Two deepest core vertices keep flat faces resting on two points.
  let first = -1,
    second = -1,
    s1 = Infinity,
    s2 = Infinity;
  for (let i = 0; i < part.count; i++) {
    const s = offset - (nx * part.x[i] + ny * part.y[i]) - part.radius;
    if (s < s1) {
      second = first;
      s2 = s1;
      first = i;
      s1 = s;
    } else if (s < s2) {
      second = i;
      s2 = s;
    }
  }
  if (s1 > margin) return 0;
  m.nx = nx;
  m.ny = ny;
  let count = 0;
  for (const [index, s] of [
    [first, s1],
    [second, s2],
  ] as const) {
    if (index < 0 || s > margin) continue;
    const reach = part.radius + s / 2;
    setPoint(m, count++, part.x[index] + nx * reach, part.y[index] + ny * reach, s, index);
  }
  return count;
}

// ---------------------------------------------------------------------------

export function createSolidWorld() {
  const bodies: SolidBody[] = [];
  /** Broadphase order, kept sorted by minX between steps. */
  const order: SolidBody[] = [];
  let manifolds: Manifold[] = [];
  let previous = new Map<number, Manifold>();
  let current = new Map<number, Manifold>();
  const pool: Manifold[] = [];
  let islandCounter = 0;
  let width = 0,
    height = 0;
  /** Which side is open for spawning: 1 = top (gravity down), -1 = bottom, 0 = none. */
  let spawnSide = 1;
  let dragged: {
    body: SolidBody;
    localX: number;
    localY: number;
    targetX: number;
    targetY: number;
  } | null = null;

  const take = () => {
    const m = pool.pop() ?? makeManifold();
    m.fresh = true;
    return m;
  };

  function wakeIsland(island: number) {
    if (!island) return;
    for (const body of bodies)
      if (!body.awake && body.island === island) {
        body.awake = true;
        body.sleepTime = 0;
        body.island = 0;
      }
  }
  function wake(body: SolidBody) {
    if (body.awake) {
      body.sleepTime = 0;
      return;
    }
    wakeIsland(body.island);
  }
  function wakeAll() {
    for (const body of bodies) {
      body.awake = true;
      body.sleepTime = 0;
      body.island = 0;
    }
  }

  function key(a: SolidBody, b: SolidBody | null, partA: number, partB: number) {
    const idB = b ? b.id & wallKeyBase : partB;
    return ((a.id & wallKeyBase) * 1048576 + idB) * 1024 + partA * 32 + (b ? partB : 31);
  }

  function addManifold(m: Manifold, a: SolidBody, b: SolidBody | null, k: number, count: number) {
    m.key = k;
    m.a = a;
    m.b = b;
    m.count = count;
    m.touching = false;
    // Convert world points to anchors and match warm-start impulses.
    const old = previous.get(k);
    for (let i = 0; i < count; i++) {
      const p = m.points[i];
      const wx = p.ax,
        wy = p.ay;
      p.ax = wx - a.x;
      p.ay = wy - a.y;
      p.bx = b ? wx - b.x : 0;
      p.by = b ? wy - b.y : 0;
      p.normalImpulse = 0;
      p.tangentImpulse = 0;
      p.maxNormalImpulse = 0;
      if (p.separation < linearSlop) m.touching = true;
      if (old)
        for (let j = 0; j < old.count; j++)
          if (old.points[j].id === p.id) {
            p.normalImpulse = old.points[j].normalImpulse;
            p.tangentImpulse = old.points[j].tangentImpulse;
            break;
          }
    }
    m.fresh = !old;
    current.set(k, m);
    manifolds.push(m);
  }

  function collidePair(a: SolidBody, b: SolidBody, margin: number) {
    for (let i = 0; i < a.parts.length; i++) {
      const pa = a.parts[i];
      for (let j = 0; j < b.parts.length; j++) {
        const pb = b.parts[j];
        const dx = pb.cx - pa.cx,
          dy = pb.cy - pa.cy,
          reach = pa.bound + pb.bound + margin;
        if (dx * dx + dy * dy > reach * reach) continue;
        const m = take();
        const count = collideParts(pa, pb, margin, m);
        if (!count) {
          pool.push(m);
          continue;
        }
        addManifold(m, a, b, key(a, b, i, j), count);
        // A new touch from an awake body wakes a sleeping neighbor's island;
        // anything the held body touches must be free to move out of its way.
        if ((m.fresh && m.touching) || (dragged && (dragged.body === a || dragged.body === b))) {
          if (!a.awake) wake(a);
          if (!b.awake) wake(b);
        }
      }
    }
  }

  function collideWalls(body: SolidBody, margin: number) {
    const ignoreTop = !body.entered && spawnSide === 1,
      ignoreBottom = !body.entered && spawnSide === -1;
    for (let i = 0; i < body.parts.length; i++) {
      const part = body.parts[i];
      const walls = [
        part.cy + part.bound + margin >= height && !ignoreBottom ? 0 : -1,
        part.cy - part.bound - margin <= 0 && !ignoreTop ? 1 : -1,
        part.cx - part.bound - margin <= 0 ? 2 : -1,
        part.cx + part.bound + margin >= width ? 3 : -1,
      ];
      for (const wall of walls) {
        if (wall < 0) continue;
        const m = take();
        const count =
          wall === 0
            ? collideWall(part, 0, 1, height, margin, m)
            : wall === 1
              ? collideWall(part, 0, -1, 0, margin, m)
              : wall === 2
                ? collideWall(part, -1, 0, 0, margin, m)
                : collideWall(part, 1, 0, width, margin, m);
        if (!count) {
          pool.push(m);
          continue;
        }
        addManifold(m, body, null, key(body, null, i, wall), count);
      }
    }
  }

  function findRoot(body: SolidBody): SolidBody {
    let b = body;
    while (bodies[b.root] !== b) b = bodies[b.root];
    return b;
  }

  function step(dt: number, settings: SolidWorldSettings) {
    const tumbling = settings.depth !== '2d';
    if (!width || !height) return;
    const awakeCount = bodies.reduce((n, b) => n + (b.awake ? 1 : 0), 0);
    if (!awakeCount) return;
    const h = dt / substeps,
      inverseH = 1 / h;

    // 1. Transforms and AABBs (speculative margin grows with speed).
    for (const body of bodies) {
      if (!body.awake) continue;
      const speed = Math.hypot(body.vx, body.vy) + Math.abs(body.w) * body.radius;
      updateSolidTransform(body, speculativeDistance + speed * dt);
    }

    // 2. Broadphase + narrowphase. Swap the contact caches; last step's
    // manifolds are only recycled after warm starting has read them.
    const swap = previous;
    previous = current;
    current = swap;
    current.clear();
    const solved = manifolds;
    manifolds = [];
    for (const body of bodies) body.skipped = !body.awake;
    for (let i = 1; i < order.length; i++) {
      const body = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].minX > body.minX) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = body;
    }
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        if (b.minX > a.maxX) break;
        if (b.minY > a.maxY || b.maxY < a.minY) continue;
        if (!a.awake && !b.awake) continue;
        const margin =
          speculativeDistance +
          (Math.hypot(a.vx - b.vx, a.vy - b.vy) +
            Math.abs(a.w) * a.radius +
            Math.abs(b.w) * b.radius) *
            dt;
        if (a.id < b.id) collidePair(a, b, margin);
        else collidePair(b, a, margin);
      }
      if (a.awake) collideWalls(a, speculativeDistance + Math.hypot(a.vx, a.vy) * dt);
    }
    // Pairs that were asleep keep their manifolds unchanged (they have not
    // moved). If a fresh touch woke them during this pass, they are solved too.
    const kept = new Set<Manifold>();
    for (const m of previous.values()) {
      if (!m.a.skipped || (m.b && !m.b.skipped) || current.has(m.key)) continue;
      current.set(m.key, m);
      kept.add(m);
      if (m.a.awake || (m.b && m.b.awake)) manifolds.push(m);
    }
    for (const m of solved) if (!kept.has(m)) pool.push(m);

    // 3. Prepare contacts.
    for (const body of bodies) body.touching = false;
    for (const m of manifolds) {
      if (m.touching) {
        m.a.touching = true;
        if (m.b) m.b.touching = true;
      }
      const a = m.a,
        b = m.b;
      const mA = a.awake ? a.inverseMass : 0,
        iA = a.awake ? a.inverseInertia : 0,
        mB = b && b.awake ? b.inverseMass : 0,
        iB = b && b.awake ? b.inverseInertia : 0;
      const nx = m.nx,
        ny = m.ny,
        tx = ny,
        ty = -nx;
      for (let i = 0; i < m.count; i++) {
        const p = m.points[i];
        const rnA = p.ax * ny - p.ay * nx,
          rnB = p.bx * ny - p.by * nx;
        const kNormal = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        p.normalMass = kNormal > 0 ? 1 / kNormal : 0;
        const rtA = p.ax * ty - p.ay * tx,
          rtB = p.bx * ty - p.by * tx;
        const kTangent = mA + mB + iA * rtA * rtA + iB * rtB * rtB;
        p.tangentMass = kTangent > 0 ? 1 / kTangent : 0;
        const vAx = a.vx - a.w * p.ay,
          vAy = a.vy + a.w * p.ax;
        const vBx = b ? b.vx - b.w * p.by : 0,
          vBy = b ? b.vy + b.w * p.bx : 0;
        p.relativeVelocity = (vBx - vAx) * nx + (vBy - vAy) * ny;
        p.maxNormalImpulse = 0;
      }
    }

    // Softness (Box2D v3 style): stiff but damped, static contacts twice as stiff.
    const soft = (hertz: number, zeta = 10) => {
      const omega = 2 * Math.PI * hertz;
      const a1 = 2 * zeta + h * omega,
        a2 = h * omega * a1,
        a3 = 1 / (1 + a2);
      return { biasRate: omega / a1, massScale: a2 * a3, impulseScale: a3 };
    };
    const contactHertz = Math.min(60, 0.25 * inverseH);
    const dynamicSoft = soft(contactHertz),
      staticSoft = soft(2 * contactHertz);
    const gravity = settings.gravity,
      wind = settings.wind,
      linearDamping = 1 / (1 + h * settings.damping),
      angularDamping = 1 / (1 + h * (settings.damping + 0.35));
    const friction = settings.friction;

    for (const body of bodies) body.dx = body.dy = body.da = 0;

    // Drag and drop: a stiff, critically damped spring keeps the held figure
    // under the cursor while still letting contacts push back.
    const mouseSoft = soft(18, 1);
    for (let sub = 0; sub < substeps; sub++) {
      // Integrate velocities
      for (const body of bodies) {
        if (!body.awake) continue;
        body.vx = (body.vx + h * wind) * linearDamping;
        body.vy = (body.vy + h * gravity) * linearDamping;
        body.w *= angularDamping;
        // Bottom-heavy characters: they right themselves in the air and lean
        // back toward upright when resting, so faces mostly look forward.
        // Contacts and throws still rotate them freely.
        if (dragged?.body !== body) {
          const k = body.touching ? uprightResting : uprightStiffness;
          body.w += h * (-k * Math.sin(body.angle) - (body.touching ? 0 : uprightDamping * body.w));
        }
      }
      // Mouse joint: a soft spring at the grabbed point.
      if (dragged) {
        const d = dragged,
          body = d.body;
        const cos = Math.cos(body.angle),
          sin = Math.sin(body.angle);
        const rx = d.localX * cos - d.localY * sin,
          ry = d.localX * sin + d.localY * cos;
        const cx = body.x + rx - d.targetX,
          cy = body.y + ry - d.targetY;
        const m = body.inverseMass,
          i = body.inverseInertia;
        const k11 = m + i * ry * ry,
          k12 = -i * rx * ry,
          k22 = m + i * rx * rx;
        const det = k11 * k22 - k12 * k12 || 1;
        const vx = body.vx - body.w * ry + mouseSoft.biasRate * cx,
          vy = body.vy + body.w * rx + mouseSoft.biasRate * cy;
        // A soft spring per substep, limited to a strong but finite force.
        let ix = -mouseSoft.massScale * ((k22 * vx - k12 * vy) / det),
          iy = -mouseSoft.massScale * ((k11 * vy - k12 * vx) / det);
        const maxImpulse = (h * 400 * Math.max(400, Math.abs(gravity))) / m;
        const total = Math.hypot(ix, iy);
        if (total > maxImpulse) {
          ix *= maxImpulse / total;
          iy *= maxImpulse / total;
        }
        body.vx += m * ix;
        body.vy += m * iy;
        body.w += i * (rx * iy - ry * ix);
        body.w *= 0.9;
      }
      // Warm start
      for (const m of manifolds) {
        const a = m.a,
          b = m.b;
        const mA = a.awake ? a.inverseMass : 0,
          iA = a.awake ? a.inverseInertia : 0,
          mB = b && b.awake ? b.inverseMass : 0,
          iB = b && b.awake ? b.inverseInertia : 0;
        for (let i = 0; i < m.count; i++) {
          const p = m.points[i];
          const px = p.normalImpulse * m.nx + p.tangentImpulse * m.ny,
            py = p.normalImpulse * m.ny - p.tangentImpulse * m.nx;
          a.vx -= mA * px;
          a.vy -= mA * py;
          a.w -= iA * (p.ax * py - p.ay * px);
          if (b) {
            b.vx += mB * px;
            b.vy += mB * py;
            b.w += iB * (p.bx * py - p.by * px);
          }
        }
      }
      solve(true);
      // Integrate positions
      for (const body of bodies) {
        if (!body.awake) continue;
        const speed = Math.hypot(body.vx, body.vy);
        if (speed > maxVelocity) {
          body.vx *= maxVelocity / speed;
          body.vy *= maxVelocity / speed;
        }
        body.x += h * body.vx;
        body.y += h * body.vy;
        body.angle += h * body.w;
        if (body.angle > Math.PI) body.angle -= 2 * Math.PI;
        else if (body.angle < -Math.PI) body.angle += 2 * Math.PI;
        body.dx += h * body.vx;
        body.dy += h * body.vy;
        body.da += h * body.w;
      }
      solve(false);
    }

    // Restitution only for real impacts.
    const restitution = settings.restitution;
    if (restitution > 0)
      for (const m of manifolds) {
        const a = m.a,
          b = m.b;
        const mA = a.awake ? a.inverseMass : 0,
          iA = a.awake ? a.inverseInertia : 0,
          mB = b && b.awake ? b.inverseMass : 0,
          iB = b && b.awake ? b.inverseInertia : 0;
        for (let i = 0; i < m.count; i++) {
          const p = m.points[i];
          if (p.relativeVelocity > -60 || p.maxNormalImpulse === 0) continue;
          const vAx = a.vx - a.w * p.ay,
            vAy = a.vy + a.w * p.ax,
            vBx = b ? b.vx - b.w * p.by : 0,
            vBy = b ? b.vy + b.w * p.bx : 0;
          const vn = (vBx - vAx) * m.nx + (vBy - vAy) * m.ny;
          // Real impacts also tip the volumes out of the screen plane.
          if (tumbling) {
            kick(a, p.ax, p.ay, -p.relativeVelocity);
            if (b) kick(b, p.bx, p.by, -p.relativeVelocity);
          }
          let impulse = -p.normalMass * (vn + restitution * p.relativeVelocity);
          const total = Math.max(p.normalImpulse + impulse, 0);
          impulse = total - p.normalImpulse;
          p.normalImpulse = total;
          const px = impulse * m.nx,
            py = impulse * m.ny;
          a.vx -= mA * px;
          a.vy -= mA * py;
          a.w -= iA * (p.ax * py - p.ay * px);
          if (b) {
            b.vx += mB * px;
            b.vy += mB * py;
            b.w += iB * (p.bx * py - p.by * px);
          }
        }
      }

    function solve(useBias: boolean) {
      for (const m of manifolds) {
        const a = m.a,
          b = m.b;
        const mA = a.awake ? a.inverseMass : 0,
          iA = a.awake ? a.inverseInertia : 0,
          mB = b && b.awake ? b.inverseMass : 0,
          iB = b && b.awake ? b.inverseInertia : 0;
        const softness = b && b.awake && a.awake ? dynamicSoft : staticSoft;
        const nx = m.nx,
          ny = m.ny;
        let totalNormal = 0;
        for (let i = 0; i < m.count; i++) {
          const p = m.points[i];
          // Current separation from the accumulated substep motion.
          const dAx = a.dx - a.da * p.ay,
            dAy = a.dy + a.da * p.ax;
          const dBx = b ? b.dx - b.da * p.by : 0,
            dBy = b ? b.dy + b.da * p.bx : 0;
          const s = (dBx - dAx) * nx + (dBy - dAy) * ny + p.separation;
          let bias = 0,
            massScale = 1,
            impulseScale = 0;
          if (s > 0) bias = s * inverseH;
          else if (useBias) {
            bias = Math.max(softness.biasRate * Math.min(0, s + linearSlop), -maxBiasVelocity);
            massScale = softness.massScale;
            impulseScale = softness.impulseScale;
          }
          const vAx = a.vx - a.w * p.ay,
            vAy = a.vy + a.w * p.ax,
            vBx = b ? b.vx - b.w * p.by : 0,
            vBy = b ? b.vy + b.w * p.bx : 0;
          const vn = (vBx - vAx) * nx + (vBy - vAy) * ny;
          let impulse = -p.normalMass * massScale * (vn + bias) - impulseScale * p.normalImpulse;
          const total = Math.max(p.normalImpulse + impulse, 0);
          impulse = total - p.normalImpulse;
          p.normalImpulse = total;
          if (impulse > p.maxNormalImpulse) p.maxNormalImpulse = impulse;
          totalNormal += total;
          const px = impulse * nx,
            py = impulse * ny;
          a.vx -= mA * px;
          a.vy -= mA * py;
          a.w -= iA * (p.ax * py - p.ay * px);
          if (b) {
            b.vx += mB * px;
            b.vy += mB * py;
            b.w += iB * (p.bx * py - p.by * px);
          }
        }
        const tx = ny,
          ty = -nx;
        for (let i = 0; i < m.count; i++) {
          const p = m.points[i];
          const vAx = a.vx - a.w * p.ay,
            vAy = a.vy + a.w * p.ax,
            vBx = b ? b.vx - b.w * p.by : 0,
            vBy = b ? b.vy + b.w * p.bx : 0;
          const vt = (vBx - vAx) * tx + (vBy - vAy) * ty;
          const limit = friction * p.normalImpulse;
          let impulse = -p.tangentMass * vt;
          const total = Math.max(-limit, Math.min(limit, p.tangentImpulse + impulse));
          impulse = total - p.tangentImpulse;
          p.tangentImpulse = total;
          const px = impulse * tx,
            py = impulse * ty;
          a.vx -= mA * px;
          a.vy -= mA * py;
          a.w -= iA * (p.ax * py - p.ay * px);
          if (b) {
            b.vx += mB * px;
            b.vy += mB * py;
            b.w += iB * (p.bx * py - p.by * px);
          }
        }
        // Rolling resistance keeps spheres from creeping forever on a pile.
        if (totalNormal > 0) {
          const limit = 0.004 * totalNormal * Math.min(a.radius, b ? b.radius : a.radius);
          const relative = (b ? b.w : 0) - a.w;
          const k = iA + iB;
          if (k > 0) {
            const impulse = Math.max(-limit, Math.min(limit, -relative / k));
            a.w -= iA * impulse;
            if (b) b.w += iB * impulse;
          }
        }
      }
    }

    // 3D tumbling: free in the air, springing back to rest when supported.
    for (const body of bodies) {
      if (!body.awake || body.growth < 1) continue;
      if (!tumbling) {
        flatten(body);
        continue;
      }
      if (body.touching || dragged?.body === body) {
        body.pitch = wrapAngle(body.pitch);
        body.yaw = wrapAngle(body.yaw);
        body.pitchRate += dt * (-tumbleStiffness * body.pitch - tumbleDamping * body.pitchRate);
        body.yawRate += dt * (-tumbleStiffness * body.yaw - tumbleDamping * body.yawRate);
      }
      body.pitchRate = Math.max(-maxTumbleRate, Math.min(maxTumbleRate, body.pitchRate));
      body.yawRate = Math.max(-maxTumbleRate, Math.min(maxTumbleRate, body.yawRate));
      body.pitch += dt * body.pitchRate;
      body.yaw += dt * body.yawRate;
      if (
        body.touching &&
        Math.abs(body.pitch) + Math.abs(body.yaw) < 2e-3 &&
        Math.abs(body.pitchRate) + Math.abs(body.yawRate) < 0.05
      )
        body.pitch = body.yaw = body.pitchRate = body.yawRate = 0;
      projectSolidBody(body);
    }
    for (const body of bodies) {
      if (!body.awake) continue;
      updateSolidTransform(body);
      if (!body.entered && body.minY >= -1 && body.maxY <= height + 1) body.entered = true;
    }

    // 4. Islands and sleep.
    for (let i = 0; i < bodies.length; i++) bodies[i].root = i;
    const union = (a: SolidBody, b: SolidBody) => {
      const ra = findRoot(a),
        rb = findRoot(b);
      if (ra !== rb) rb.root = ra.root;
    };
    for (const m of manifolds) if (m.b && m.a.awake && m.b.awake && m.touching) union(m.a, m.b);
    const islandSleep = new Map<SolidBody, number>();
    for (const body of bodies) {
      if (!body.awake) continue;
      const speed = Math.hypot(body.vx, body.vy) + Math.abs(body.w) * body.radius;
      const pinned =
        dragged?.body === body ||
        body.leaving > 0 ||
        body.growth < 1 ||
        !body.entered ||
        body.turned ||
        body.pitchRate !== 0 ||
        body.yawRate !== 0;
      body.sleepTime = speed < sleepVelocity && !pinned ? body.sleepTime + dt : 0;
      const root = findRoot(body);
      islandSleep.set(root, Math.min(islandSleep.get(root) ?? Infinity, body.sleepTime));
    }
    const sleeping = new Map<SolidBody, number>();
    for (const [root, time] of islandSleep)
      if (time >= sleepDelay) sleeping.set(root, ++islandCounter);
    if (!sleeping.size) return;
    // An island that settles on sleeping bodies joins their island, so waking
    // any support later also wakes everything resting on it.
    const merged = new Map<number, number>();
    for (const m of current.values()) {
      if (!m.b || !m.touching) continue;
      const awake = m.a.awake ? m.a : m.b.awake ? m.b : null,
        asleep = awake === m.a ? m.b : m.a;
      if (!awake || asleep.awake || !asleep.island) continue;
      const island = sleeping.get(findRoot(awake));
      if (island) merged.set(asleep.island, island);
    }
    for (const body of bodies) {
      if (body.awake) {
        const island = sleeping.get(findRoot(body));
        if (!island) continue;
        body.awake = false;
        body.island = island;
        body.vx = body.vy = body.w = 0;
      } else if (merged.has(body.island)) body.island = merged.get(body.island)!;
    }
  }

  return {
    bodies,
    get awakeCount() {
      let n = 0;
      for (const body of bodies) if (body.awake) n++;
      return n;
    },
    get contactCount() {
      return manifolds.length;
    },
    setBounds(nextWidth: number, nextHeight: number, side: number) {
      width = nextWidth;
      height = nextHeight;
      spawnSide = side;
    },
    add(body: SolidBody) {
      updateSolidTransform(body);
      bodies.push(body);
      order.push(body);
    },
    remove(body: SolidBody) {
      const index = bodies.indexOf(body);
      if (index < 0) return;
      bodies.splice(index, 1);
      order.splice(order.indexOf(body), 1);
      if (dragged?.body === body) dragged = null;
      // Anything that touched it may have lost support.
      for (const map of [previous, current])
        for (const [k, m] of map) {
          if (m.a !== body && m.b !== body) continue;
          if (m.a === body && m.b) wake(m.b);
          if (m.b === body) wake(m.a);
          map.delete(k);
        }
      manifolds = manifolds.filter((m) => m.a !== body && m.b !== body);
    },
    clear() {
      bodies.length = 0;
      order.length = 0;
      for (const m of manifolds) pool.push(m);
      manifolds = [];
      previous.clear();
      current.clear();
      dragged = null;
    },
    wake,
    wakeAll,
    step,
    grab(body: SolidBody, x: number, y: number) {
      wake(body);
      const cos = Math.cos(body.angle),
        sin = Math.sin(body.angle);
      const dx = x - body.x,
        dy = y - body.y;
      dragged = {
        body,
        localX: dx * cos + dy * sin,
        localY: dy * cos - dx * sin,
        targetX: x,
        targetY: y,
      };
    },
    drag(x: number, y: number) {
      if (!dragged) return;
      dragged.targetX = x;
      dragged.targetY = y;
      wake(dragged.body);
    },
    release() {
      dragged = null;
    },
    get dragging() {
      return dragged?.body ?? null;
    },
    /** True when a full-size candidate would overlap an existing body or a wall. */
    overlaps(candidate: SolidBody, tolerance = 0) {
      updateSolidTransform(candidate);
      if (
        candidate.minX < -tolerance ||
        candidate.maxX > width + tolerance ||
        candidate.minY < -tolerance ||
        candidate.maxY > height + tolerance
      )
        return true;
      const m = scratch;
      for (const body of bodies) {
        if (
          body.minX > candidate.maxX ||
          body.maxX < candidate.minX ||
          body.minY > candidate.maxY ||
          body.maxY < candidate.minY
        )
          continue;
        for (const pa of candidate.parts)
          for (const pb of body.parts) {
            const count = collideParts(pa, pb, 0, m);
            for (let i = 0; i < count; i++) if (m.points[i].separation < -tolerance) return true;
          }
      }
      return false;
    },
  };
}
const scratch = makeManifold();

/** Puts a body back in its flat resting projection, with no 3D turn. */
export function flatten(body: SolidBody) {
  body.pitch = body.yaw = body.pitchRate = body.yawRate = 0;
  projectSolidBody(body);
}

const wrapAngle = (a: number) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

/** Converts an impact at anchor (x, y) into an out-of-plane tumble. */
function kick(body: SolidBody, x: number, y: number, speed: number) {
  if (!body.awake || speed < 120) return;
  const size = Math.max(1, body.radius);
  const strength = Math.min(6, (speed - 120) * 0.012);
  body.pitchRate += (strength * y) / size;
  body.yawRate -= (strength * x) / size;
}

export type SolidWorld = ReturnType<typeof createSolidWorld>;
