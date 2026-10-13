/** Seeded gradient noise and marching squares; no external runtime or assets. */
export type ContourPoint = { x: number; y: number };
export type Contour = { points: ContourPoint[]; closed: boolean; level: number };
export type ContourSpline = {
  start: ContourPoint;
  segments: { control1: ContourPoint; control2: ContourPoint; end: ContourPoint }[];
};

/** Uniform cubic B-splines keep both tangent and curvature continuous at every join. */
export function createContourSpline(points: ContourPoint[], closed: boolean): ContourSpline {
  const at = (index: number) =>
    points[
      closed
        ? (index + points.length) % points.length
        : Math.max(0, Math.min(points.length - 1, index))
    ];
  const knot = (a: ContourPoint, b: ContourPoint, c: ContourPoint) => ({
    x: (a.x + 4 * b.x + c.x) / 6,
    y: (a.y + 4 * b.y + c.y) / 6,
  });
  const startIndex = closed ? 0 : -1;
  const start = knot(at(startIndex - 1), at(startIndex), at(startIndex + 1));
  const segments: ContourSpline['segments'] = [];
  for (let i = startIndex; i < points.length; i++) {
    const a = at(i),
      b = at(i + 1),
      c = at(i + 2);
    segments.push({
      control1: { x: (2 * a.x + b.x) / 3, y: (2 * a.y + b.y) / 3 },
      control2: { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 },
      end: knot(a, b, c),
    });
  }
  return { start, segments };
}

export type ContourMotionSpline = {
  rest: ContourSpline;
  cosine: ContourSpline;
  sine: ContourSpline;
};

/** Convert a change in elevation into travel along the contour normal.
 * The local curvature limits travel near summits and narrow turns, while broad
 * slopes breathe more freely. There is no translation or rotation field.
 */
export function createContourMotionSpline(
  curve: Contour,
  scale: number,
  distortion: number,
  seed: number,
  sampleHeight = createElevationField(seed),
): ContourMotionSpline {
  const offset = ((((Math.round(seed) * 0.61803398875) % 1) + 1) % 1) * Math.PI * 2;
  const at = (index: number) =>
    curve.points[
      curve.closed
        ? (index + curve.points.length) % curve.points.length
        : Math.max(0, Math.min(curve.points.length - 1, index))
    ];
  const normals = curve.points.map((_, index) => {
    const before = at(index - 1),
      after = at(index + 1);
    const length = Math.hypot(after.x - before.x, after.y - before.y);
    return {
      x: length > 1e-8 ? -(after.y - before.y) / length : 0,
      y: length > 1e-8 ? (after.x - before.x) / length : 0,
    };
  });
  let basis = curve.points.map((point, index) => {
    const before = at(index - 1),
      after = at(index + 1);
    const tx = after.x - before.x,
      ty = after.y - before.y;
    const length = Math.hypot(tx, ty);
    if (length < 1e-8) return { cosine: { x: 0, y: 0 }, sine: { x: 0, y: 0 } };
    const nx = -ty / length,
      ny = tx / length;
    const ax = point.x - before.x,
      ay = point.y - before.y;
    const bx = after.x - point.x,
      by = after.y - point.y;
    const turn = Math.abs(ax * by - ay * bx);
    const radius =
      turn < 1e-8 ? Infinity : (Math.hypot(ax, ay) * Math.hypot(bx, by) * length) / (2 * turn);
    const x = point.x / scale,
      y = point.y / scale,
      epsilon = 2 / scale;
    const slope =
      (sampleHeight(x + nx * epsilon, y + ny * epsilon, 0, distortion) -
        sampleHeight(x - nx * epsilon, y - ny * epsilon, 0, distortion)) /
      (2 * epsilon);
    // Vertical height modes are coherent across neighboring elevations.
    // A regularized inverse slope prevents singular travel at a flat summit.
    const gain = (-scale * slope) / (slope * slope + 0.25);
    const heightSine =
      (0.11 + 0.02 * distortion) * (0.7 + 0.3 * Math.cos(0.6 * x - 0.4 * y + offset));
    const heightCosine = 0.035 * Math.sin(0.3 * x + 0.55 * y + offset + 0.7);
    const maximumTravel = Math.abs(gain) * (Math.abs(heightSine) + 2 * Math.abs(heightCosine));
    let limit = Math.min(scale * 0.14, radius * 0.22);
    // Opposing branches also bound travel: a long narrow summit may have
    // almost straight sides even though there is very little room between them.
    for (let other = 0; other < curve.points.length; other++) {
      let separation = Math.abs(index - other);
      if (curve.closed) separation = Math.min(separation, curve.points.length - separation);
      if (separation < 5 || nx * normals[other].x + ny * normals[other].y > -0.7) continue;
      const neighbor = curve.points[other];
      limit = Math.min(limit, 0.18 * Math.hypot(point.x - neighbor.x, point.y - neighbor.y));
    }
    const weight = maximumTravel > 0 ? Math.min(1, limit / maximumTravel) : 0;
    const sine = gain * heightSine * weight,
      cosine = gain * heightCosine * weight;
    return { cosine: { x: nx * cosine, y: ny * cosine }, sine: { x: nx * sine, y: ny * sine } };
  });
  // Smooth the height response along material distance, before fitting. This
  // removes small slope/curvature variations from the morph without resampling
  // the line or changing the locations of its material cuts.
  const passes = Math.max(4, Math.min(18, Math.round(2 * ((scale * 0.035) / 8) ** 2)));
  for (let pass = 0; pass < passes; pass++) {
    basis = basis.map((point, index) => {
      if (!curve.closed && (index === 0 || index === basis.length - 1)) return point;
      const before = basis[(index + basis.length - 1) % basis.length],
        after = basis[(index + 1) % basis.length];
      return {
        cosine: {
          x: (before.cosine.x + 2 * point.cosine.x + after.cosine.x) / 4,
          y: (before.cosine.y + 2 * point.cosine.y + after.cosine.y) / 4,
        },
        sine: {
          x: (before.sine.x + 2 * point.sine.x + after.sine.x) / 4,
          y: (before.sine.y + 2 * point.sine.y + after.sine.y) / 4,
        },
      };
    });
  }
  return {
    rest: createContourSpline(curve.points, curve.closed),
    cosine: createContourSpline(
      basis.map((point) => point.cosine),
      curve.closed,
    ),
    sine: createContourSpline(
      basis.map((point) => point.sine),
      curve.closed,
    ),
  };
}

/** Each cubic stores four [rest x/y, cosine x/y, sine x/y] points plus a move flag. */
export function compileContourPath(
  basis: ContourMotionSpline,
  dashLength?: number,
  dashGap = 0,
): Float64Array {
  const commands: number[] = [];
  let distance = 0,
    connected = false;
  const period = (dashLength ?? 0) + dashGap;
  const point = (rest: ContourPoint, cosine: ContourPoint, sine: ContourPoint) => [
    rest.x,
    rest.y,
    cosine.x,
    cosine.y,
    sine.x,
    sine.y,
  ];
  const split = (cubic: number[][], t: number): [number[][], number[][]] => {
    const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * t);
    const a = mix(cubic[0], cubic[1]),
      b = mix(cubic[1], cubic[2]),
      c = mix(cubic[2], cubic[3]);
    const d = mix(a, b),
      e = mix(b, c),
      f = mix(d, e);
    return [
      [cubic[0], a, d, f],
      [f, e, c, cubic[3]],
    ];
  };
  for (let index = 0; index < basis.rest.segments.length; index++) {
    const cubic = [
      point(
        index ? basis.rest.segments[index - 1].end : basis.rest.start,
        index ? basis.cosine.segments[index - 1].end : basis.cosine.start,
        index ? basis.sine.segments[index - 1].end : basis.sine.start,
      ),
      ...(['control1', 'control2', 'end'] as const).map((key) =>
        point(
          basis.rest.segments[index][key],
          basis.cosine.segments[index][key],
          basis.sine.segments[index][key],
        ),
      ),
    ];
    if (dashLength === undefined) {
      commands.push(...cubic.flat(), index === 0 ? 1 : 0);
      continue;
    }
    // Measure in the rest pose only. These material cut points never slide
    // around a changing contour as Canvas's native dash pattern would.
    const lengths = [0];
    let previous = cubic[0];
    for (let sample = 1; sample <= 16; sample++) {
      const t = sample / 16,
        u = 1 - t;
      const at = [0, 1].map(
        (axis) =>
          u ** 3 * cubic[0][axis] +
          3 * u * u * t * cubic[1][axis] +
          3 * u * t * t * cubic[2][axis] +
          t ** 3 * cubic[3][axis],
      );
      lengths.push(lengths.at(-1)! + Math.hypot(at[0] - previous[0], at[1] - previous[1]));
      previous = at;
    }
    const length = lengths.at(-1)!;
    const parameterAt = (offset: number) => {
      if (offset >= length) return 1;
      let sample = 1;
      while (lengths[sample] < offset) sample++;
      return (
        (sample -
          1 +
          (offset - lengths[sample - 1]) / Math.max(1e-12, lengths[sample] - lengths[sample - 1])) /
        16
      );
    };
    let offset = 0,
      from = 0;
    while (offset < length - 1e-9) {
      const phase = (distance + offset + 1e-9) % period;
      const visible = phase < dashLength;
      const remaining = (visible ? dashLength : period) - phase;
      const end = Math.min(length, offset + remaining);
      const to = parameterAt(end);
      if (visible) {
        const left = to === 1 ? cubic : split(cubic, to)[0];
        const piece = from === 0 ? left : split(left, from / to)[1];
        commands.push(...piece.flat(), connected ? 0 : 1);
      }
      connected = visible;
      offset = end;
      from = to;
    }
    distance += length;
  }
  return new Float64Array(commands);
}

/** Smooth by physical distance, so clustered grid crossings cannot form pinched tips. */
export function roundContour(
  points: ContourPoint[],
  closed: boolean,
  spacing: number,
  radius = spacing,
) {
  const lengths = [0];
  const count = points.length + (closed ? 1 : 0);
  for (let i = 1; i < count; i++) {
    const a = points[i - 1],
      b = points[i % points.length];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = lengths.at(-1)!;
  if (length < 0.01) return points;
  const segments = Math.max(closed ? 8 : 2, Math.ceil(length / spacing));
  const samples: ContourPoint[] = [];
  let edge = 1;
  for (let i = 0; i < segments + (closed ? 0 : 1); i++) {
    const distance = (i / segments) * length;
    while (edge < lengths.length - 1 && lengths[edge] < distance) edge++;
    const a = points[edge - 1],
      b = points[edge % points.length];
    const t = (distance - lengths[edge - 1]) / Math.max(1e-10, lengths[edge] - lengths[edge - 1]);
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  let rounded = samples;
  // Preserve the rounding radius when using a denser support grid.
  const passes = Math.max(2, Math.min(128, Math.round(2 * (radius / spacing) ** 2)));
  for (let pass = 0; pass < passes; pass++) {
    rounded = rounded.map((point, i, all) => {
      if (!closed && (i === 0 || i === all.length - 1)) return point;
      const before = all[(i + all.length - 1) % all.length],
        after = all[(i + 1) % all.length];
      return {
        x: (before.x + 2 * point.x + after.x) / 4,
        y: (before.y + 2 * point.y + after.y) / 4,
      };
    });
  }
  return rounded;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createElevationField(seed: number) {
  const permutation = new Uint8Array(512);
  const values = Array.from({ length: 256 }, (_, i) => i);
  let state = (Math.round(seed) ^ 0x9e3779b9) >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  for (let i = 0; i < 512; i++) permutation[i] = values[i & 255];
  const gradientX = new Float64Array(256),
    gradientY = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const angle = random() * Math.PI * 2;
    gradientX[i] = Math.cos(angle);
    gradientY[i] = Math.sin(angle);
  }
  const gradient = (hash: number, x: number, y: number, cosine: number, sine: number) => {
    const gx = gradientX[hash],
      gy = gradientY[hash];
    return (gx * cosine - gy * sine) * x + (gx * sine + gy * cosine) * y;
  };
  const noise = (x: number, y: number, cosine: number, sine: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy;
    const a = permutation[ix & 255] + (iy & 255);
    const b = permutation[(ix + 1) & 255] + (iy & 255);
    return lerp(
      lerp(
        gradient(permutation[a], fx, fy, cosine, sine),
        gradient(permutation[b], fx - 1, fy, cosine, sine),
        fade(fx),
      ),
      lerp(
        gradient(permutation[a + 1], fx, fy - 1, cosine, sine),
        gradient(permutation[b + 1], fx - 1, fy - 1, cosine, sine),
        fade(fx),
      ),
      fade(fy),
    );
  };
  type Rotation = [number, number, number, number];
  const rotation = (phase: number): Rotation => {
    const a = 0.3 * Math.sin(phase),
      b = 0.3 * Math.cos(phase);
    return [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
  };
  let previousTime = NaN,
    phase = 0;
  let mainRotation = rotation(0),
    layerRotation = rotation(0.7),
    crossRotation = rotation(-1.3);
  let orbitX = 0,
    orbitY = 0,
    secondX = 0,
    secondY = 0,
    pigmentX = 0,
    pigmentY = 0;
  const morph = (x: number, y: number, r: Rotation) =>
    0.96 * noise(x, y, r[0], r[1]) +
    0.12 * noise(0.8 * x - 0.6 * y + 29, 0.6 * x + 0.8 * y - 17, r[2], r[3]);
  return (x: number, y: number, time: number, distortion: number) => {
    if (time !== previousTime) {
      previousTime = time;
      // Grain Gradient's Drift cadence: a slow closed cycle with continuous velocity.
      phase = ((time + 18) * 0.02) % (Math.PI * 2);
      mainRotation = rotation(phase);
      layerRotation = rotation(phase + 0.7);
      crossRotation = rotation(phase - 1.3);
      orbitX = Math.cos(phase);
      orbitY = Math.sin(phase);
      secondX = Math.cos(2 * phase);
      secondY = Math.sin(2 * phase);
      pigmentX = 0.32 * (secondX - 1);
      pigmentY = 0.32 * secondY;
    }
    // Two broad, evolving domains carry the hills together. Small detail shares
    // the same phase, rather than animating each contour independently.
    const frequency = 1.25;
    const reach = 0.23 * distortion;
    let bendX = 0,
      bendY = 0;
    for (let layer = 0; layer < 2; layer++) {
      const px = x * frequency + bendX + 17 * layer;
      const py = y * frequency + bendY - 9 * layer;
      const ox = layer ? secondX : orbitX,
        oy = layer ? secondY : orbitY;
      bendX = reach * morph(px + 0.55 * ox, py + 0.55 * oy, layer ? layerRotation : mainRotation);
      bendY =
        reach *
        morph(
          0.6 * px - 0.8 * py - 13 - 0.42 * ox,
          0.8 * px + 0.6 * py + 8 - 0.42 * oy,
          crossRotation,
        );
    }
    return (
      1.6 * morph(x * frequency + bendX + pigmentX, y * frequency + bendY + pigmentY, mainRotation)
    );
  };
}

/** Stitch shared grid edges so dashes follow entire curves, never individual cells. */
export function traceContours(
  field: Float32Array,
  columns: number,
  rows: number,
  width: number,
  height: number,
  density: number,
): Contour[] {
  const contours: Contour[] = [];
  const stepX = width / (columns - 1),
    stepY = height / (rows - 1);
  const horizontalCount = (columns - 1) * rows;
  const spacing = 1 / density;
  // Reject cells using cached ranges before allocating intersection data.
  // Most cells cross no contour, especially on broad, smooth terrain.
  const ranges = new Float32Array((columns - 1) * (rows - 1) * 2);
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < columns - 1; x++) {
      const i = y * columns + x;
      const a = field[i],
        b = field[i + 1],
        c = field[i + columns + 1],
        d = field[i + columns];
      const index = (y * (columns - 1) + x) * 2;
      ranges[index] = Math.min(a, b, c, d);
      ranges[index + 1] = Math.max(a, b, c, d);
    }
  }
  for (let levelIndex = -Math.ceil(density); levelIndex <= Math.ceil(density); levelIndex++) {
    const level = levelIndex * spacing + 0.037;
    const nodes = new Map<number, { point: ContourPoint; neighbors: number[] }>();
    const connect = (a: number, b: number) => {
      nodes.get(a)!.neighbors.push(b);
      nodes.get(b)!.neighbors.push(a);
    };
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < columns - 1; x++) {
        const rangeIndex = (y * (columns - 1) + x) * 2;
        if (level <= ranges[rangeIndex] || level > ranges[rangeIndex + 1]) continue;
        const i = y * columns + x;
        const corners = [field[i], field[i + 1], field[i + columns + 1], field[i + columns]];
        const ids = [
          y * (columns - 1) + x,
          horizontalCount + y * columns + x + 1,
          (y + 1) * (columns - 1) + x,
          horizontalCount + y * columns + x,
        ];
        const coordinates = [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
        ];
        const crossed: number[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if (corners[edge] >= level === corners[next] >= level) continue;
          const id = ids[edge];
          crossed.push(id);
          if (!nodes.has(id)) {
            const t = (level - corners[edge]) / (corners[next] - corners[edge]);
            nodes.set(id, {
              point: {
                x: lerp(coordinates[edge][0], coordinates[next][0], t) * stepX,
                y: lerp(coordinates[edge][1], coordinates[next][1], t) * stepY,
              },
              neighbors: [],
            });
          }
        }
        if (crossed.length === 2) connect(crossed[0], crossed[1]);
        else if (crossed.length === 4) {
          // Asymptotic decider resolves saddle cells without crossing contours.
          const q =
            (corners[0] - level) * (corners[2] - level) -
            (corners[1] - level) * (corners[3] - level);
          if (q >= 0) {
            connect(crossed[0], crossed[1]);
            connect(crossed[2], crossed[3]);
          } else {
            connect(crossed[0], crossed[3]);
            connect(crossed[1], crossed[2]);
          }
        }
      }
    const visited = new Set<number>();
    const walk = (start: number) => {
      const points: ContourPoint[] = [];
      let id: number | undefined = start;
      let closed = false;
      while (id !== undefined && !visited.has(id)) {
        visited.add(id);
        const node: { point: ContourPoint; neighbors: number[] } = nodes.get(id)!;
        points.push(node.point);
        if (points.length > 2 && node.neighbors.includes(start)) {
          closed = true;
          break;
        }
        id = node.neighbors.find((neighbor) => !visited.has(neighbor));
      }
      if (points.length > 2) {
        if (closed) {
          let area = 0;
          for (let i = 0; i < points.length; i++) {
            const a = points[i],
              b = points[(i + 1) % points.length];
            area += a.x * b.y - b.x * a.y;
          }
          if (area < 0) points.reverse();
        }
        contours.push({ points, closed, level: levelIndex });
      }
    };
    // Start open curves at the viewport boundary before consuming closed loops.
    for (const [id, node] of nodes) if (node.neighbors.length === 1 && !visited.has(id)) walk(id);
    for (const id of nodes.keys()) if (!visited.has(id)) walk(id);
  }
  return contours;
}
