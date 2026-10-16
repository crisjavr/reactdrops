/**
 * Fan geometry. Equal-size cards sit on a symmetric curve around the middle
 * of the collection: horizontal spacing is a fraction of the card width, the
 * outer cards drop along a parabola and tilt outward in proportion to their
 * distance from the middle. One card at a time can be active: it rises,
 * straightens and comes forward, and each side of the fan slides away far
 * enough that the active card overlaps nothing, plus a gap.
 */
export type FanEntrance = 'stack' | 'deal' | 'rise' | 'flip' | 'circular' | 'deck';
export type FanStack = 'left' | 'right';

export interface FanOptions {
  cardWidth: number;
  aspectRatio: number;
  /** Distance between card centers, as a fraction of the card width. */
  spacing: number;
  /** How far the outermost cards drop, as a fraction of the card height. */
  curve: number;
  /** Tilt of the outermost cards, in degrees (inner cards tilt proportionally). */
  tilt: number;
  /** Pixels the active card rises. */
  lift: number;
  /** Extra space opened on each side of the active card, as a fraction of the card width. */
  spread: number;
  /** Which side's cards lie in front at rest (and where travelling entrances come from). */
  stackFrom: FanStack;
}

export const fanDefaults: FanOptions = {
  cardWidth: 176,
  aspectRatio: 0.8,
  spacing: 1.25,
  curve: 0.14,
  tilt: 14.5,
  lift: 42,
  spread: 0.2,
  stackFrom: 'left',
};

export interface FanPose {
  x: number;
  y: number;
  /** In-plane rotation, degrees. */
  rotation: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const radians = Math.PI / 180;

/** Resting pose of card `index`, relative to the middle of the fan (y down). */
function restPose(index: number, count: number, options: FanOptions): FanPose {
  const width = options.cardWidth,
    height = width / options.aspectRatio;
  const middle = (count - 1) / 2;
  const offset = index - middle;
  const share = offset / Math.max(1, middle); // -1 … 1 from the left edge to the right edge
  return {
    x: offset * Math.max(0, options.spacing) * width,
    y: Math.max(0, options.curve) * height * share * share,
    rotation: options.tilt * share,
  };
}

// Allocation-free polygon scratch for the clearance test.
const leftX = new Float64Array(4),
  leftY = new Float64Array(4),
  rightX = new Float64Array(4),
  rightY = new Float64Array(4);
const signs = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
function corners(pose: FanPose, width: number, height: number, xs: Float64Array, ys: Float64Array) {
  const cos = Math.cos(pose.rotation * radians),
    sin = Math.sin(pose.rotation * radians);
  for (let k = 0; k < 4; k++) {
    const dx = (signs[k][0] * width) / 2,
      dy = (signs[k][1] * height) / 2;
    xs[k] = pose.x + dx * cos - dy * sin;
    ys[k] = pose.y + dx * sin + dy * cos;
  }
}
/** Rightmost (side 1) or leftmost (side -1) point of a quad on the line y. */
function edgeAt(xs: Float64Array, ys: Float64Array, y: number, side: number) {
  let best = side > 0 ? -Infinity : Infinity;
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) & 3;
    const ay = ys[k],
      by = ys[j];
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    const x = xs[k] + ((y - ay) / (by - ay)) * (xs[j] - xs[k]);
    best = side > 0 ? Math.max(best, x) : Math.min(best, x);
  }
  return best;
}
/**
 * How far the `right` card overlaps into the `left` card horizontally, over
 * every height where both exist (negative when they are already apart).
 * Both edges are piecewise linear in y, so checking the vertex heights and
 * the shared top and bottom is exact.
 */
function overlapWidth(left: FanPose, right: FanPose, width: number, height: number) {
  corners(left, width, height, leftX, leftY);
  corners(right, width, height, rightX, rightY);
  const top = Math.max(Math.min(...leftY), Math.min(...rightY));
  const bottom = Math.min(Math.max(...leftY), Math.max(...rightY));
  if (top >= bottom) return -Infinity;
  let overlap = -Infinity;
  const check = (y: number) => {
    if (y < top || y > bottom) return;
    const a = edgeAt(leftX, leftY, y, 1),
      b = edgeAt(rightX, rightY, y, -1);
    if (Number.isFinite(a) && Number.isFinite(b)) overlap = Math.max(overlap, a - b);
  };
  check(top);
  check(bottom);
  for (let k = 0; k < 4; k++) {
    check(leftY[k]);
    check(rightY[k]);
  }
  return overlap;
}

/**
 * Side shifts for every possible active card, computed once per options
 * object: each side slides as one piece so the active card overlaps nothing
 * (outer cards can tilt farther into its space than the nearest one), then
 * opens `spread` more so the gap is always visible.
 */
const shiftCache = new WeakMap<FanOptions, { count: number; left: Float64Array; right: Float64Array }>();
function sideShifts(count: number, options: FanOptions) {
  const cached = shiftCache.get(options);
  if (cached && cached.count === count) return cached;
  const width = options.cardWidth,
    height = width / options.aspectRatio;
  const gap = Math.max(0, options.spread) * width;
  const left = new Float64Array(count),
    right = new Float64Array(count);
  for (let active = 0; active < count; active++) {
    const lifted = { ...restPose(active, count, options), rotation: 0 };
    lifted.y -= options.lift;
    let l = 0,
      r = 0;
    for (let i = 0; i < count; i++) {
      if (i === active) continue;
      const pose = restPose(i, count, options);
      if (i > active) r = Math.max(r, overlapWidth(lifted, pose, width, height));
      else l = Math.max(l, overlapWidth(pose, lifted, width, height));
    }
    left[active] = l + gap;
    right[active] = r + gap;
  }
  const result = { count, left, right };
  shiftCache.set(options, result);
  return result;
}

/**
 * Pose of card `index` with card `active` selected (-1 for none).
 * Coordinates are relative to the middle of the fan, in layout pixels;
 * y grows downward. Reuse the same options object to keep it O(1).
 */
export function fanPose(index: number, count: number, options: FanOptions, active = -1): FanPose {
  const pose = restPose(index, count, options);
  if (active < 0 || active >= count) return pose;
  if (index === active) return { x: pose.x, y: pose.y - options.lift, rotation: 0 };
  const shifts = sideShifts(count, options);
  pose.x += index > active ? shifts.right[active] : -shifts.left[active];
  return pose;
}

/** Card whose horizontal slot holds `t` (0 … 1 across the fan). */
export function fanSlot(t: number, count: number) {
  return clamp(Math.floor(clamp(t, 0, 0.9999) * count), 0, Math.max(0, count - 1));
}

/** Paint order at rest: one side in front. */
export function fanLayer(index: number, count: number, options: FanOptions) {
  return options.stackFrom === 'right' ? index : count - 1 - index;
}

/** True when neighboring cards overlap at rest (so Front cards is visible). */
export function fanOverlaps(count: number, options: FanOptions) {
  if (count < 2) return false;
  const width = options.cardWidth,
    height = width / options.aspectRatio;
  for (let i = 1; i < count; i++)
    if (overlapWidth(restPose(i - 1, count, options), restPose(i, count, options), width, height) > 0)
      return true;
  return false;
}

/** Half-extents of a rotated card. */
function extents(rotation: number, width: number, height: number) {
  const c = Math.abs(Math.cos(rotation * radians)),
    s = Math.abs(Math.sin(rotation * radians));
  return { x: (c * width + s * height) / 2, y: (s * width + c * height) / 2 };
}

/**
 * Fits the resting fan to the available width; while a card is active its
 * neighbors may extend past the sides (the component stops clipping
 * horizontally), so hover never shrinks the fan. Height reserves the active
 * card's rise. Spacing compresses first (down to 40%, solved exactly: the
 * fan's half-width is linear in spacing), then cards scale down.
 * O(n) per call.
 */
export function fanLayout(availableWidth: number, count: number, input: FanOptions) {
  const width = Math.max(40, input.cardWidth),
    aspectRatio = clamp(input.aspectRatio, 0.3, 3),
    height = width / aspectRatio;
  const padding = 16;
  const available = Math.max(1, availableWidth - padding * 2);
  const middle = (count - 1) / 2;
  // Each card reaches |offset|·spacing·width + its rotated half-width; the
  // largest spacing that fits is the smallest of those per-card solutions.
  const requested = Math.max(0, input.spacing);
  let spacing = requested;
  for (let i = 0; i < count; i++) {
    const offset = Math.abs(i - middle);
    if (!offset) continue;
    const edge = extents(input.tilt * ((i - middle) / Math.max(1, middle)), width, height).x;
    spacing = Math.min(spacing, (available / 2 - edge) / (offset * width));
  }
  spacing = clamp(spacing, requested * 0.4, requested);
  const options: FanOptions = { ...input, cardWidth: width, aspectRatio, spacing };
  let half = 1,
    top = 0,
    restTop = Infinity,
    bottom = 0;
  for (let i = 0; i < count; i++) {
    const pose = restPose(i, count, options);
    const e = extents(pose.rotation, width, height);
    half = Math.max(half, Math.abs(pose.x) + e.x);
    restTop = Math.min(restTop, pose.y - e.y);
    top = Math.min(top, pose.y - e.y, pose.y - options.lift - height / 2);
    bottom = Math.max(bottom, pose.y + e.y);
  }
  if (!count) restTop = 0;
  const fit = Math.min(1, available / (half * 2));
  return {
    fit,
    width: width * fit,
    height: height * fit,
    /** Middle of the fan inside the stage, in pixels. */
    originX: availableWidth / 2,
    originY: -top * fit + padding,
    stageHeight: (bottom - top) * fit + padding * 2,
    /** Vertical band of the resting cards inside the stage (hover hit area). */
    bandTop: padding + (restTop - top) * fit,
    bandBottom: padding + (bottom - top) * fit,
    /** Effective spacing after fitting (equal to the request when it fits). */
    spacing,
    options,
  };
}
