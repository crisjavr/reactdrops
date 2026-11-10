export const depthOrigins = {
  'top-left': [0, 0],
  'top-center': [0.5, 0],
  'top-right': [1, 0],
  'center-left': [0, 0.5],
  center: [0.5, 0.5],
  'center-right': [1, 0.5],
  'bottom-left': [0, 1],
  'bottom-center': [0.5, 1],
  'bottom-right': [1, 1],
} as const;
export type DepthFieldOrigin = keyof typeof depthOrigins;
export type DepthFieldRotationDirection = 'counterclockwise' | 'clockwise';
export const depthPerspective = 1000;
export const depthPlaneUnit = 24;
const depthLensScale = 1.26;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export type DepthTrack = { x: number; y: number; size: number; delay: number };
const trackCache = new Map<string, DepthTrack[]>();

function variation(index: number) {
  let value = Math.imul(index + 11, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

/** Balance screen coverage at every count without arranging images into rings. */
export function createTracks(count: number, spread: number, depth: number): DepthTrack[] {
  const key = `${count}:${spread}:${depth}`;
  let tracks = trackCache.get(key);
  if (tracks) trackCache.delete(key);
  else tracks = buildTracks(count, spread, depth);
  // Replay, source changes and repeated mounts share construction work. Keep
  // only four scenes, and return independent records so callers cannot mutate
  // cached geometry or its source ordering.
  trackCache.set(key, tracks);
  if (trackCache.size > 4) trackCache.delete(trackCache.keys().next().value!);
  return tracks.map((track) => ({ ...track }));
}

function buildTracks(count: number, spread: number, depth: number): DepthTrack[] {
  const duration = depth + 7;
  const gaps = Array.from({ length: count }, (_, index) => 0.7 + variation(index + 157) * 0.6);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  let arrival = variation(421);
  const delays = gaps.map((gap) => {
    arrival += gap / total;
    return (arrival % 1) * duration;
  });
  const tracks: DepthTrack[] = [];
  // Score coverage in projection, not distance between world-space anchors.
  // The same screen area is filled at every count; more images subdivide
  // the gaps instead of adding another radial/depth layer.
  const probes = Array.from({ length: 25 }, (_, index) => ({
    x: ((index % 5) - 2) * 0.2,
    y: (Math.floor(index / 5) - 2) * 0.2,
  })).filter((point) => Math.abs(point.x) > 0.2 || Math.abs(point.y) > 0.2);
  const coverage = Array.from({ length: 12 }, () => probes.map(() => 0.5));
  const project = (track: DepthTrack, step: number) => {
    const phase = (track.delay / duration + step / 12) % 1;
    const distance = duration - (duration - 0.5) * phase;
    const zoom = (depthLensScale / distance) * depthProjectionScale(distance, duration);
    const angle = step * 2.399963229728653;
    return {
      x: ((track.x * Math.cos(angle) - track.y * Math.sin(angle)) * zoom) / 2,
      y: (track.x * Math.sin(angle) + track.y * Math.cos(angle)) * zoom,
      size: track.size * 3.8 * zoom * foregroundSizeScale(phase),
      weight: fadeAt(phase),
    };
  };
  const projections: ReturnType<typeof project>[][] = [];
  for (let index = 0; index < count; index++) {
    let best: DepthTrack = { x: spread, y: 0, size: 1, delay: delays[index] };
    let bestPenalty = Infinity;
    let bestProjection: ReturnType<typeof project>[] = [];
    for (let candidate = 0; candidate < 48; candidate++) {
      const seed = index * 193 + candidate * 2 + 1051;
      const x = (variation(seed) * 2 - 1) * spread * 1.25;
      const y = (variation(seed + 1) * 2 - 1) * spread;
      // Clearance only guarantees that a foreground image exits before its
      // depth wraps. It is not a target radius for placing images.
      if (Math.hypot(x, y) < spread * 0.55) continue;
      const track = { x, y, size: 1 + variation(index + 79) * 0.3, delay: delays[index] };
      const projected = Array.from({ length: 12 }, (_, step) => project(track, step));
      let penalty = 0;
      let coverageGain = 0;
      for (let step = 0; step < projected.length; step++) {
        const point = projected[step];
        if (point.weight < 0.15 || Math.abs(point.x) > 0.65 || Math.abs(point.y) > 0.65) continue;
        for (let probe = 0; probe < probes.length; probe++) {
          const target = probes[probe];
          const gap = ((point.x - target.x) * 2) ** 2 + (point.y - target.y) ** 2;
          coverageGain += Math.max(0, coverage[step][probe] - gap);
        }
        for (const previous of projections) {
          const other = previous[step];
          if (other.weight < 0.15) continue;
          const clearance = (point.size + other.size) * 0.42;
          const separation = Math.hypot((point.x - other.x) * 2, point.y - other.y);
          const overlap = Math.max(0, 1 - separation / clearance);
          penalty += overlap * overlap * Math.min(point.weight, other.weight);
        }
      }
      // Arrivals that are visible together should occupy different angular
      // directions, especially when only a few planes are requested.
      for (const other of tracks) {
        const gap = Math.abs(track.delay - other.delay) / duration;
        const arrivalGap = Math.min(gap, 1 - gap);
        const cosine =
          (track.x * other.x + track.y * other.y) /
          (Math.hypot(track.x, track.y) * Math.hypot(other.x, other.y));
        penalty +=
          Math.max(0, cosine) *
          Math.max(0, 1 - arrivalGap / 0.35) *
          512 *
          clamp((24 - count) / 12, 0, 1);
      }
      // Coverage has the same influence per image across counts. Small
      // jitter breaks ties without turning sparse scenes into random clumps.
      penalty = penalty / Math.max(1, tracks.length) - coverageGain * 4;
      penalty += variation(seed + 9031) * 0.015;
      if (penalty < bestPenalty) {
        best = track;
        bestPenalty = penalty;
        bestProjection = projected;
      }
    }
    for (let step = 0; step < bestProjection.length; step++) {
      const point = bestProjection[step];
      if (point.weight < 0.15 || Math.abs(point.x) > 0.65 || Math.abs(point.y) > 0.65) continue;
      for (let probe = 0; probe < probes.length; probe++) {
        const target = probes[probe];
        coverage[step][probe] = Math.min(
          coverage[step][probe],
          ((point.x - target.x) * 2) ** 2 + (point.y - target.y) ** 2,
        );
      }
    }
    tracks.push(best);
    projections.push(
      bestProjection.length
        ? bestProjection
        : Array.from({ length: 12 }, (_, step) => project(best, step)),
    );
  }
  disperseTracks(tracks, spread, depth);
  // Keep the complete geometry and depth distribution, but assign source
  // images through an independent permutation. Consecutive/repeated source
  // images must not follow the construction order through depth.
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const swap = Math.floor(variation(index + 7219) * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order.map((index) => tracks[index]);
}

/** Fill the outer sides through depth and rotation, not just isolated frames. */
function disperseTracks(tracks: DepthTrack[], spread: number, depth: number) {
  if (tracks.length < 12) return;
  const phases = 96;
  const turns = 24;
  const span = depth + 7;
  const boxes = [
    [2, 1],
    [1, 1.25],
  ];
  const angles = Array.from({ length: turns }, (_, index) => {
    const angle = (index * Math.PI * 2) / turns;
    return [Math.cos(angle), Math.sin(angle)];
  });
  // One irregular angular slot per plane; depth order is independently mixed.
  // Keeping every azimuth occupied prevents the volume collapsing into trails.
  const slot = (Math.PI * 2) / tracks.length;
  const bearings = tracks.map((_, index) => (index + 0.5) * slot);
  for (let index = bearings.length - 1; index > 0; index--) {
    const swap = Math.floor(variation(index + 31117) * (index + 1));
    [bearings[index], bearings[swap]] = [bearings[swap], bearings[index]];
  }
  // Angular slots and arrival gaps stay fixed during the swap search. Compute
  // their factors once instead of repeating trigonometry in every comparison.
  const bearingSlots = tracks.map((_, index) => index);
  const angularCosts = bearings.map((a) =>
    bearings.map((b) => {
      const cosine = Math.cos(a - b);
      return [
        Math.max(0, cosine - 0.2) ** 2,
        Math.max(0, cosine - 0.866) ** 2,
        Math.max(0, cosine - 0.5) ** 2,
      ];
    }),
  );
  const interval = Math.min(0.45, 2.5 / tracks.length);
  const arrivalCosts = tracks.map((a) =>
    tracks.map((b) => {
      const gap = Math.abs(a.delay - b.delay) / span;
      const separation = Math.min(gap, 1 - gap);
      return {
        narrow: Math.max(0, 1 - separation / interval),
        broad: Math.max(0, 1 - separation / 0.45),
        consecutive: separation < 1.5 / tracks.length,
      };
    }),
  );
  const pairCost = (a: number, b: number, slotA: number, slotB: number) => {
    const angle = angularCosts[slotA][slotB];
    const arrival = arrivalCosts[a][b];
    return (
      angle[0] * arrival.narrow * 40 +
      angle[1] * arrival.broad * 600 +
      (arrival.consecutive ? angle[2] * 8000 : 0)
    );
  };
  for (let pass = 0; pass < 80; pass++) {
    for (let a = 0; a < tracks.length; a++) {
      const b = Math.floor(variation(pass * tracks.length + a + 44107) * tracks.length);
      if (a === b) continue;
      let before = 0,
        after = 0;
      for (let other = 0; other < tracks.length; other++) {
        if (other === a || other === b) continue;
        before +=
          pairCost(a, other, bearingSlots[a], bearingSlots[other]) +
          pairCost(b, other, bearingSlots[b], bearingSlots[other]);
        after +=
          pairCost(a, other, bearingSlots[b], bearingSlots[other]) +
          pairCost(b, other, bearingSlots[a], bearingSlots[other]);
      }
      if (after < before) {
        [bearings[a], bearings[b]] = [bearings[b], bearings[a]];
        [bearingSlots[a], bearingSlots[b]] = [bearingSlots[b], bearingSlots[a]];
      }
    }
  }
  tracks.forEach((track, index) => {
    const radius = Math.hypot(track.x, track.y);
    track.x = Math.cos(bearings[index]) * radius;
    track.y = Math.sin(bearings[index]) * radius;
  });
  const scenarios = phases * turns * boxes.length;
  const counts = new Uint16Array(scenarios * 4);
  const masks: Uint8Array[] = [];
  const coefficients = tracks.map((track) =>
    Array.from({ length: phases }, (_, step) => {
      const phase = (track.delay / span + step / phases) % 1;
      const distance = span - (span - 0.5) * phase;
      const scale = (depthLensScale / distance) * depthProjectionScale(distance, span);
      const size = track.size * 3.8 * scale * foregroundSizeScale(phase);
      return { scale, half: size * 0.25, visible: fadeAt(phase) >= 0.25 && size >= 0.06 };
    }),
  );
  const project = (
    track: DepthTrack,
    index: number,
    result: Uint8Array = new Uint8Array(scenarios),
  ) => {
    result.fill(0);
    let scenario = 0;
    for (const plane of coefficients[index]) {
      if (!plane.visible) {
        scenario += turns * boxes.length;
        continue;
      }
      for (const [cos, sin] of angles) {
        const x = (track.x * cos - track.y * sin) * plane.scale;
        const y = -(track.x * sin + track.y * cos) * plane.scale;
        for (const [width, height] of boxes) {
          if (
            Math.abs(x) < width / 2 + plane.half - 0.05 &&
            Math.abs(y) < height / 2 + plane.half - 0.05
          ) {
            // Use an inscribed box, so cropped/portrait sources must also
            // occupy the side. A faint speck behind the title does not count.
            if (x - plane.half < -width * 0.25) result[scenario] |= 1;
            if (x + plane.half > width * 0.25) result[scenario] |= 2;
            if (y - plane.half < -height * 0.25) result[scenario] |= 4;
            if (y + plane.half > height * 0.25) result[scenario] |= 8;
          }
          scenario++;
        }
      }
    }
    return result;
  };
  const update = (mask: Uint8Array, direction: number) => {
    for (let scenario = 0; scenario < scenarios; scenario++)
      for (let side = 0; side < 4; side++)
        if (mask[scenario] & (1 << side)) counts[scenario * 4 + side] += direction;
  };
  tracks.forEach((track, index) => {
    const mask = project(track, index);
    masks.push(mask);
    update(mask, 1);
  });
  const score = (track: DepthTrack, index: number, mask: Uint8Array) => {
    let benefit = 0;
    for (let scenario = 0; scenario < scenarios; scenario++)
      for (let side = 0; side < 4; side++) {
        if (!(mask[scenario] & (1 << side))) continue;
        const occupied = counts[scenario * 4 + side];
        benefit += occupied === 0 ? 150 : occupied === 1 ? 20 : 0;
      }
    let trail = 0;
    const radius = Math.hypot(track.x, track.y);
    const interval = Math.min(0.45, 2.5 / tracks.length);
    tracks.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const gap = Math.abs(track.delay - other.delay) / span;
      const separation = Math.min(gap, 1 - gap);
      const cosine =
        (track.x * other.x + track.y * other.y) / (radius * Math.hypot(other.x, other.y));
      // Balance the whole visible depth window, including across recycling.
      // Separating only consecutive arrivals leaves longer radial queues.
      trail += Math.max(0, cosine - 0.2) ** 2 * Math.max(0, 1 - separation / interval);
      trail += Math.max(0, cosine - 0.866) ** 2 * Math.max(0, 1 - separation / 0.45) * 45;
      if (separation < 1.5 / tracks.length) trail += Math.max(0, cosine - 0.5) ** 2 * 200;
      const angularGap = Math.acos(clamp(cosine, -1, 1));
      trail += Math.max(0, 1 - angularGap / ((Math.PI * 1.6) / tracks.length)) ** 2 * 0.5;
    });
    return benefit / scenarios - trail * 40;
  };
  // Refinement happens only when constructing the scene. Runtime frames still
  // sample immutable anchors with exactly the same circular/depth clocks.
  let workMask: Uint8Array = new Uint8Array(scenarios);
  for (let pass = 0; pass < 4; pass++) {
    for (let index = 0; index < tracks.length; index++) {
      const original = tracks[index];
      update(masks[index], -1);
      let best = original;
      let bestMask = masks[index];
      let bestScore = score(best, index, bestMask);
      for (let candidate = 0; candidate < 32; candidate++) {
        const seed = index * 173 + pass * 16001 + candidate * 2 + 29021;
        const angle = bearings[index] + (variation(seed) - 0.5) * slot * 0.4;
        const radius = spread * (0.55 + variation(seed + 1) * 1.05);
        const track = { ...original, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        const mask = project(track, index, workMask);
        const value = score(track, index, mask);
        if (value > bestScore) {
          best = track;
          workMask = bestMask;
          bestMask = mask;
          bestScore = value;
        }
      }
      tracks[index] = best;
      masks[index] = bestMask;
      update(bestMask, 1);
    }
  }
}

export type DepthViewport = { width: number; height: number };
export type DepthClock = { travel: number; rotation: number };
export type DepthLayoutOptions = {
  depth: number;
  imageSize: number;
  origin: DepthFieldOrigin;
  emptyStart?: boolean;
};
export type DepthSample = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  distance: number;
};

/** Values shared by every plane in a frame. */
export function prepareDepthProjection(
  clock: DepthClock,
  viewport: DepthViewport,
  options: DepthLayoutOptions,
) {
  const radians = (clock.rotation * Math.PI) / 180;
  const [anchorX, anchorY] = depthOrigins[options.origin] ?? depthOrigins.center;
  return {
    span: options.depth + 7,
    travel: Math.max(0, clock.travel),
    lens: Math.max(0, Math.min(viewport.width, viewport.height)) * depthLensScale,
    cos: Math.cos(radians),
    sin: Math.sin(radians),
    originX: viewport.width * anchorX,
    originY: viewport.height * anchorY,
    imageSize: clamp(options.imageSize, 0.3, 8),
    emptyStart: options.emptyStart === true,
  };
}

const fadeStops = [
  [0, 0],
  [0.12, 0.1],
  [0.3, 0.23],
  [0.5, 0.5],
  [0.72, 0.84],
  [0.94, 1],
  [0.999, 1],
  [1, 0],
];
function fadeAt(progress: number) {
  for (let index = 1; index < fadeStops.length; index++) {
    const [end, value] = fadeStops[index];
    if (progress > end) continue;
    const [start, previous] = fadeStops[index - 1];
    return previous + ((value - previous) * (progress - start)) / (end - start);
  }
  return 0;
}

/** Both displacement and growth accelerate toward the viewer through depth. */
export function depthProjectionScale(distance: number, span: number) {
  return ((span * 0.4) / distance) ** 0.5;
}

function foregroundSizeScale(phase: number) {
  const progress = clamp((phase - 0.35) / 0.5, 0, 1);
  return 0.75 + 1.05 * progress * progress * (3 - 2 * progress);
}

/** A frame is derived from immutable anchors and clocks, without advancing planes. */
export function sampleTrack(
  track: DepthTrack,
  clock: DepthClock,
  viewport: DepthViewport,
  options: DepthLayoutOptions,
) {
  return sampleTrackInto(track, prepareDepthProjection(clock, viewport, options), {
    left: 0,
    top: 0,
    size: 0,
    opacity: 0,
    distance: 0,
  });
}

/** Reuse the projection and output record instead of allocating per image. */
export function sampleTrackInto(
  track: DepthTrack,
  projection: ReturnType<typeof prepareDepthProjection>,
  result: DepthSample,
) {
  const { span } = projection;
  const travel = projection.travel + track.delay;
  // On entrance, introduce each plane at its first distant arrival. Showing
  // its pre-existing cycle phase would reveal foreground images immediately.
  // Once introduced, its normal projection and recycling remain unchanged.
  if (projection.emptyStart && travel < span) {
    result.left = projection.originX;
    result.top = projection.originY;
    result.size = 0;
    result.opacity = 0;
    result.distance = span;
    return result;
  }
  const phase = travel / span - Math.floor(travel / span);
  const distance = span - (span - 0.5) * phase;
  const zoom = projection.lens / distance;
  // Rotate immutable anchors with one uniform screen scale. An aspect stretch
  // after rotation turns circular orbits into ellipses; animated local drifts
  // also distort their radius.
  const x = track.x;
  const y = track.y;
  const horizontal = x * projection.cos - y * projection.sin;
  const vertical = x * projection.sin + y * projection.cos;
  // One perspective projection brings distant images together behind the
  // title and expands both their position and size as they approach. A fixed
  // screen-space offset would turn this into an orbit around an empty center.
  const fieldScale = zoom * depthProjectionScale(distance, span);
  const size = track.size * projection.imageSize * fieldScale * foregroundSizeScale(phase);
  result.left = projection.originX + horizontal * fieldScale - size / 2;
  result.top = projection.originY - vertical * fieldScale - size / 2;
  result.size = size;
  result.opacity = fadeAt(phase);
  result.distance = distance;
  return result;
}

/** A smooth entry pulse with a short rise and a three-times-longer slowdown. */
export function entryTravel(elapsed: number, duration: number, speed: number, burst: number) {
  const time = Math.max(0, elapsed);
  if (duration <= 0) return time * speed;
  const rise = duration * 0.25;
  const fall = duration - rise;
  const entryTime = Math.min(time, duration);
  const tail = Math.max(0, entryTime - rise);
  // Integrate the two half-cosine speed curves exactly. Velocity and its
  // slope match at the peak and return smoothly to drift after the tail.
  const pulse =
    entryTime <= rise
      ? (entryTime - (rise / Math.PI) * Math.sin((Math.PI * entryTime) / rise)) / 2
      : (rise + tail + (fall / Math.PI) * Math.sin((Math.PI * tail) / fall)) / 2;
  return speed * time + Math.max(0, burst - speed) * pulse;
}

/** Rotation follows the same entrance speed multiplier as forward travel. */
export function entryRotationTravel(elapsed: number, duration: number, speed = 5, burst = 70) {
  // A zero drift speed still permits rotation-only scenes. Use the normal
  // drift reference for their entrance rather than dividing by zero.
  const referenceSpeed = speed > 0 ? speed : 4;
  return entryTravel(elapsed, duration, referenceSpeed, burst) / referenceSpeed;
}

/** Exact decay integral keeps scroll impulses consistent across frame rates. */
export function scrollTravel(impulse: number, elapsed: number) {
  const remaining = Math.exp(-3.5 * Math.max(0, elapsed));
  return { remaining: impulse * remaining, travel: (impulse * (1 - remaining)) / 3.5 };
}

/** Ease into a scroll impulse without introducing frame-rate-dependent motion. */
export function smoothScrollTravel(impulse: number, velocity: number, elapsed: number) {
  const time = Math.max(0, elapsed);
  const decay = scrollTravel(impulse, time);
  const attack = Math.exp(-18 * time);
  const response = (18 * impulse) / (18 - 3.5);
  const velocityTravel = (velocity * -Math.expm1(-18 * time)) / 18;
  const responseTravel = response * (-Math.expm1(-3.5 * time) / 3.5 + Math.expm1(-18 * time) / 18);
  return {
    remaining: decay.remaining,
    velocity: velocity * attack + response * (Math.exp(-3.5 * time) - attack),
    travel: velocityTravel + responseTravel,
  };
}
