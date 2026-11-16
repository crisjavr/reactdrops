/**
 * Turns any logo image into a stack of horizontal glass discs. The logo is
 * rasterized to a coverage mask, cut by evenly spaced horizontal lines, and
 * every solid run along a line becomes one disc whose width is the run width.
 * Units: the logo's height is 1, its center is the origin, y points up.
 */

export type GlassSlabSpan = { x: number; a: number; halfDepth?: number };
export type GlassSlabRow = { y: number; pitch: number; tint?: number; spans: GlassSlabSpan[] };
export type GlassSlabLayout = {
  /** Rows from the bottom of the logo to the top. */
  rows: GlassSlabRow[];
  /** Spacing of the main rows. */
  pitch: number;
  /** Logo box width in logo heights. */
  width: number;
  /**
   * The logo cut into each disc. Every disc is a plate: its ellipse
   * intersected with the row's slice of the logo laid flat, front edge = top
   * of the slice. Where the logo is white or empty the plate has a gap. Four
   * values per texel: glass density (1 the logo's main color, up to 3 where
   * it is darker), the signed distance to the glass's edge in logo heights
   * (negative inside) and the direction away from the glass (across, then
   * down the logo). Each row holds `depth` lines of `size` texels across the
   * logo width, covering `span` logo heights centered on its cut. The
   * renderer maps a point of a disc to the logo as its camera sees it.
   * Absent when the discs are the logo's plain outline.
   */
  inlay?: {
    data: Float32Array;
    /** Half the local thickness of the glass, in logo heights, per texel. */
    widths: Float32Array;
    size: number;
    depth: number;
    span: number;
  };
};
export type LogoCoverage = {
  /** Ink coverage 0..1 per pixel, rows from the top. */
  data: Float32Array;
  width: number;
  height: number;
  /**
   * Density of each pixel's color relative to the logo's main color, times
   * TONE_UNIT: TONE_UNIT is the main color, 0 white, 3 * TONE_UNIT black.
   */
  tone?: Uint8Array;
  /**
   * How close each pixel is to white, next to the logo's main color (0 the
   * main color, 255 white). White parts of a colored logo are gaps.
   */
  white?: Uint8Array;
};

export const MAX_SPANS_PER_ROW = 32;
export const MAX_ROWS = 64;
const BASE_ROW_COUNT = 17;
const MAX_RECOMMENDED_ROW_COUNT = 20;
/** Use the rounded profile at 25 rows as the reference for the logo's cut edges. */
const EDGE_PROFILE_ROWS = 25;
// Keep the neighboring cut for slider reversals and repeat exports. A full
// cut-out atlas can occupy around 30 MB, so retain only two cuts of the logo.
const CACHED_LAYOUTS = 2;
/** Texels across the logo width in the design inlay. */
export const INLAY_SIZE = 768;
/** Most lines from the front to the back of each disc in the cut-out field. */
export const INLAY_DEPTH = 80;
/**
 * Rows of the logo each disc's cut-out field spans around its cut: enough
 * for the camera to see three rows of logo across a disc's depth.
 */
const PLATE_SPAN = 3;
/** Tallest cut-out texture: rows times lines stay within WebGL 2's minimum. */
const INLAY_HEIGHT = 2048;
const TONE_UNIT = 85;
const RASTER = 1024;
const MIN_DETAIL_AREA = 4;

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const srgbToLinear = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
/** Perceptual lightness (CIE L*) of an sRGB color, 0..1. */
function lightness(r: number, g: number, b: number) {
  const y = 0.2126 * srgbToLinear[r] + 0.7152 * srgbToLinear[g] + 0.0722 * srgbToLinear[b];
  return y > 0.008856 ? 1.16 * Math.cbrt(y) - 0.16 : 9.033 * y;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/**
 * Glass density of a color next to the logo's main color: lighter parts of
 * the design turn to clear glass (white is fully clear), darker parts denser.
 * Small differences (shading, compression noise) keep the main density.
 */
function toneOf(light: number, main: number) {
  if (light >= main) return 1 - smooth(0.12, 0.6, (light - main) / Math.max(1 - main, 0.05));
  return 1 + 2 * smooth(0.12, 0.6, (main - light) / Math.max(main, 0.05));
}

export type LogoPixels = { width: number; height: number; data: Uint8ClampedArray };

export async function readLogoPixels(src: string): Promise<LogoPixels | null> {
  const image = await loadImage(src);
  if (!image) return null;
  const naturalWidth = image.naturalWidth || image.width || 1;
  const naturalHeight = image.naturalHeight || image.height || 1;
  const fit = RASTER / Math.max(naturalWidth, naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * fit));
  const height = Math.max(1, Math.round(naturalHeight * fit));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, width, height);
    return { width, height, data: context.getImageData(0, 0, width, height).data };
  } catch {
    return null;
  }
}

/**
 * Coverage of the logo cropped to its bounding box, 0..1 per pixel, and the
 * glass density of its colors. Images without transparency use their color
 * difference from the background, taken as the median color of the border.
 */
export function coverageFromPixels({ data, width, height }: LogoPixels): LogoCoverage | null {
  const coverage = new Float32Array(width * height);
  // Any real transparency means the alpha channel draws the logo, even when
  // the logo fills nearly the whole image (a badge with rounded corners).
  // Only images without it (photos, JPEG exports) use their background.
  let clear = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] < 128) clear++;
  const solid = clear < 0.001 * ((width * height) / 2);
  if (solid) {
    const border: number[][] = [[], [], []];
    const step = Math.max(1, Math.floor((width + height) / 512));
    const sample = (x: number, y: number) => {
      for (let c = 0; c < 3; c++) border[c].push(data[(y * width + x) * 4 + c]);
    };
    for (let x = 0; x < width; x += step) {
      sample(x, 0);
      sample(x, height - 1);
    }
    for (let y = 0; y < height; y += step) {
      sample(0, y);
      sample(width - 1, y);
    }
    const background = border.map((values) => values.sort((p, q) => p - q)[values.length >> 1]);
    for (let i = 0; i < coverage.length; i++) {
      const o = i * 4;
      const difference = Math.max(
        Math.abs(data[o] - background[0]),
        Math.abs(data[o + 1] - background[1]),
        Math.abs(data[o + 2] - background[2]),
      );
      coverage[i] = Math.min(1, Math.max(0, (difference / 255 - 0.06) / 0.2));
    }
  } else {
    for (let i = 0; i < coverage.length; i++) coverage[i] = data[i * 4 + 3] / 255;
  }
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (coverage[y * width + x] >= 0.5) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0 || y1 < y0) return null;
  // One pixel of margin keeps the subpixel crossings at the box edges.
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(width - 1, x1 + 1);
  y1 = Math.min(height - 1, y1 + 1);
  const boxWidth = x1 - x0 + 1;
  const boxHeight = y1 - y0 + 1;
  const cropped = new Float32Array(boxWidth * boxHeight);
  const light = new Float32Array(boxWidth * boxHeight);
  // The main color is the most common lightness among the solid ink.
  const histogram = new Float64Array(64);
  for (let y = 0; y < boxHeight; y++)
    for (let x = 0; x < boxWidth; x++) {
      const i = y * boxWidth + x;
      const source = (y + y0) * width + x + x0;
      const o = source * 4;
      cropped[i] = coverage[source];
      light[i] = lightness(data[o], data[o + 1], data[o + 2]);
      if (cropped[i] >= 0.9) histogram[Math.min(63, Math.floor(light[i] * 64))]++;
    }
  let mode = 0;
  for (let b = 1; b < 64; b++) if (histogram[b] > histogram[mode]) mode = b;
  let total = 0,
    weighted = 0;
  for (let b = Math.max(0, mode - 1); b <= Math.min(63, mode + 1); b++) {
    total += histogram[b];
    weighted += histogram[b] * ((b + 0.5) / 64);
  }
  const main = total ? weighted / total : 0.5;
  // Whiteness is the darkest channel: white has all three high, a saturated
  // yellow does not. Measured against the main color's own darkest channel.
  const lowest = (source: number) =>
    Math.min(data[source * 4], data[source * 4 + 1], data[source * 4 + 2]) / 255;
  let mainLowest = 0,
    mainCount = 0;
  for (let y = 0; y < boxHeight; y++)
    for (let x = 0; x < boxWidth; x++) {
      const i = y * boxWidth + x;
      if (cropped[i] < 0.9 || Math.abs(light[i] - main) > 1.5 / 64) continue;
      mainLowest += lowest((y + y0) * width + x + x0);
      mainCount++;
    }
  mainLowest = mainCount ? mainLowest / mainCount : 0;
  const white = new Uint8Array(boxWidth * boxHeight);
  // A white logo has nothing whiter to cut away.
  if (mainLowest < 0.8)
    for (let y = 0; y < boxHeight; y++)
      for (let x = 0; x < boxWidth; x++) {
        const i = y * boxWidth + x;
        const w = (lowest((y + y0) * width + x + x0) - mainLowest) / (1 - mainLowest);
        white[i] = Math.round(Math.min(1, Math.max(0, w)) * 255);
      }
  const tone = new Uint8Array(boxWidth * boxHeight);
  for (let i = 0; i < tone.length; i++)
    // Antialiased edges of an opaque image blend into the background color;
    // they keep the main density instead of reading as a lighter fringe.
    tone[i] =
      solid && cropped[i] < 0.9 ? TONE_UNIT : Math.round(toneOf(light[i], main) * TONE_UNIT);
  return { data: cropped, width: boxWidth, height: boxHeight, tone, white };
}

const coverageCache = new Map<string, Promise<LogoCoverage | null>>();
function cacheCoverage(src: string, result: Promise<LogoCoverage | null>) {
  coverageCache.set(src, result);
  if (coverageCache.size > 6) coverageCache.delete(coverageCache.keys().next().value!);
}

export function logoCoverage(src: string) {
  let result = coverageCache.get(src);
  if (!result) {
    result = readLogoPixels(src)
      .then((pixels) => (pixels ? coverageFromPixels(pixels) : null))
      .catch(() => null);
    cacheCoverage(src, result);
  }
  return result;
}

export type GlassSlabLogoRenderMode = 'auto' | 'detailed' | 'ellipses';

export type SliceOptions = {
  /** Total rows across the logo, including any cuts used for detached details. */
  slabs: number;
  renderMode?: GlassSlabLogoRenderMode;
  /** Where each row samples the logo inside its band, 0 (top) to 1 (bottom). */
  phase: number;
  /**
   * Share of the band, centered on the cut, that a disc covers. 0 takes the
   * logo's width along the cut line alone; 1 the widest part of the whole slice,
   * as a slab cut from a solid logo would be.
   */
  band: number;
  /**
   * Detached pieces shorter than this many rows (a leaf, a dot) get their own,
   * denser rows so they still read as a stack of at least this many discs.
   */
  minPieceSlabs: number;
  /** Runs shorter than this share of the row pitch are dropped. */
  minSpan: number;
  /** Gaps narrower than this share of the row pitch are bridged. */
  bridge: number;
};

export function glassSlabCutOptions(
  options: Omit<SliceOptions, 'minSpan' | 'bridge'>,
): SliceOptions {
  return { ...options, minSpan: 0.3, bridge: 0.12 };
}

export type LogoCutSettings = Omit<SliceOptions, 'slabs' | 'minSpan' | 'bridge'>;

export function prepareLogoPixels(pixels: LogoPixels, settings: LogoCutSettings) {
  const coverage = coverageFromPixels(pixels);
  if (!coverage) return null;
  const options = glassSlabCutOptions({ ...settings, slabs: recommendSlabCount(coverage) });
  return { coverage, options, layout: sliceLogo(coverage, options) };
}

type Field = { width: number; height: number };

/**
 * Connected pieces of a mask (8-neighbour), with antialiased edge pixels
 * given to the piece next to them. Returns per-pixel labels (0 = empty).
 */
function labelPieces(data: Float32Array, { width, height }: Field) {
  const labels = new Int32Array(width * height);
  const boxes: { top: number; bottom: number; area: number }[] = [{ top: 0, bottom: 0, area: 0 }];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || data[start] < 0.5) continue;
    const label = boxes.length;
    const box = { top: height, bottom: 0, area: 0 };
    let size = 0;
    stack[size++] = start;
    labels[start] = label;
    while (size) {
      const i = stack[--size];
      const x = i % width;
      const y = (i - x) / width;
      box.area++;
      if (y < box.top) box.top = y;
      if (y > box.bottom) box.bottom = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!labels[j] && data[j] >= 0.5) {
            labels[j] = label;
            stack[size++] = j;
          }
        }
    }
    boxes.push(box);
  }
  // Two rings of edge pixels inherit their neighbour's label.
  for (let ring = 0; ring < 2; ring++) {
    const next = labels.slice();
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] || data[i] <= 0) continue;
      const x = i % width;
      const y = (i - x) / width;
      for (let k = 0; k < 4 && !next[i]; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0),
          ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && labels[ny * width + nx])
          next[i] = labels[ny * width + nx];
      }
    }
    labels.set(next);
  }
  return { labels, boxes };
}

/** Largest closing radius, in pixels (the distance field's margin). */
const MAX_CLOSE = 160;

/**
 * Exact squared distance to the nearest marked pixel. The binary input
 * needs only two scans to find the nearest mark in each column. The row pass
 * combines those distances with the lower envelope of parabolas.
 */
function distanceSquared(marked: Uint8Array, width: number, height: number) {
  const far = 1e20;
  const d = new Float32Array(width * height);
  const nearest = new Int32Array(width).fill(-1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (marked[row + x]) nearest[x] = y;
      const dy = y - nearest[x];
      d[row + x] = nearest[x] < 0 ? far : dy * dy;
    }
  }
  nearest.fill(height);
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (marked[row + x]) nearest[x] = y;
      if (nearest[x] === height) continue;
      const dy = nearest[x] - y;
      d[row + x] = Math.min(d[row + x], dy * dy);
    }
  }
  const f = new Float64Array(width);
  const out = new Float64Array(width);
  const v = new Int32Array(width);
  const z = new Float64Array(width + 1);
  const envelope = (length: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = d[row + x];
    envelope(width);
    for (let x = 0; x < width; x++) d[row + x] = out[x];
  }
  return d;
}

/** Marks the pixels of a mask's background that cannot reach its border (4-neighbour). */
function enclosed(background: (i: number) => boolean, width: number, height: number) {
  const n = width * height;
  const reached = new Uint8Array(n);
  const stack = new Int32Array(n);
  let size = 0;
  const visit = (i: number) => {
    if (!reached[i] && background(i)) {
      reached[i] = 1;
      stack[size++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (size) {
    const i = stack[--size];
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < n) visit(i + width);
  }
  return reached;
}

/** Grows a mask by a few pixels (4-neighbour steps). */
function dilate(mask: Uint8Array, { width }: Field, steps: number) {
  let current = mask;
  for (let step = 0; step < steps; step++) {
    const next = current.slice();
    for (let i = 0; i < current.length; i++) {
      if (current[i]) continue;
      const x = i % width;
      if (
        (x > 0 && current[i - 1]) ||
        (x < width - 1 && current[i + 1]) ||
        current[i - width] ||
        current[i + width]
      )
        next[i] = 1;
    }
    current = next;
  }
  return current;
}

type CutRow = {
  y: number;
  pitch: number;
  spans: GlassSlabSpan[];
  /** The cut line, in pixel rows from the top. */
  line: number;
};
type CutStats = { runs: number; thin: number };

/** Solid runs along evenly spaced lines through a coverage field. */
function cutRows(
  field: Field,
  value: (i: number) => number,
  top: number,
  bottom: number,
  count: number,
  options: SliceOptions,
  stats?: CutStats,
  occupied?: number[],
): CutRow[] {
  const { width, height } = field;
  const pitchPx = (occupied?.length ?? bottom - top) / count;
  const unit = 1 / height;
  const line = new Float32Array(width);
  const rows: CutRow[] = [];
  for (let k = 0; k < count; k++) {
    const offset = (k + options.phase) * pitchPx;
    const cell = occupied ? Math.min(occupied.length - 1e-6, offset) : 0;
    const cut = occupied ? occupied[Math.floor(cell)] + (cell % 1) : top + offset;
    const yPx = occupied
      ? occupied[Math.floor(cell)]
      : Math.min(height - 1, Math.max(0, cut - 0.5));
    const row = Math.floor(yPx);
    const blend = yPx - row;
    const below = Math.min(height - 1, row + 1);
    for (let x = 0; x < width; x++)
      line[x] = value(row * width + x) * (1 - blend) + value(below * width + x) * blend;
    // A disc covers the widest part of its slice of the logo.
    const reach = (options.band * pitchPx) / 2;
    const first = Math.max(0, Math.ceil(yPx - reach));
    const last = Math.min(height - 1, Math.floor(yPx + reach));
    for (let y = first; y <= last; y++)
      for (let x = 0; x < width; x++) {
        const v = value(y * width + x);
        if (v > line[x]) line[x] = v;
      }
    const runs: [number, number][] = [];
    let start = -1;
    const crossing = (x: number) => {
      const a = x > 0 ? line[x - 1] : 0;
      const b = x < width ? line[x] : 0;
      return x - 1 + (0.5 - a) / (b - a || 1);
    };
    for (let x = 0; x <= width; x++) {
      const inside = x < width && line[x] >= 0.5;
      if (inside && start < 0) start = crossing(x);
      else if (!inside && start >= 0) {
        runs.push([start, crossing(x)]);
        start = -1;
      }
    }
    const merged: [number, number][] = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && run[0] - last[1] < options.bridge * pitchPx) last[1] = run[1];
      else merged.push([run[0], run[1]]);
    }
    if (stats)
      for (const [from, to] of merged) {
        stats.runs++;
        if (to - from < pitchPx) stats.thin++;
      }
    const spans = merged
      .filter(([from, to]) => occupied || to - from >= options.minSpan * pitchPx)
      .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
      .slice(0, MAX_SPANS_PER_ROW)
      .sort((p, q) => p[0] - q[0])
      .map(([from, to]) => ({
        x: ((from + to) / 2 + 0.5 - width / 2) * unit,
        a: ((to - from) / 2) * unit,
      }));
    if (spans.length)
      rows.push({
        y: (height / 2 - cut) * unit,
        pitch: pitchPx * unit,
        spans,
        line: cut,
      });
  }
  return rows;
}

function cutOccupiedRows(
  field: Field,
  value: (i: number) => number,
  top: number,
  bottom: number,
  count: number,
  options: SliceOptions,
) {
  const rows = cutRows(field, value, top, bottom, count, options);
  if (rows.length === count) return rows;
  // Redistribute cuts over the occupied scanlines when the regular spacing
  // lands in a gap or when a stroke is narrower than the usual run filter.
  const occupied: number[] = [];
  for (let y = top; y < bottom; y++) {
    const end = (y + 1) * field.width;
    for (let i = y * field.width; i < end; i++) {
      if (value(i) < 0.5) continue;
      occupied.push(y);
      break;
    }
  }
  return occupied.length
    ? cutRows(field, value, top, bottom, count, options, undefined, occupied)
    : rows;
}

/** Horizontal interpolation shared by every plate and its edge gradients. */
function plateColumns(
  { width, height }: Field,
  distance: Float32Array,
  normalDistance: Float32Array,
) {
  const perTexel = width / INLAY_SIZE;
  return [
    { shift: 0, field: distance },
    { shift: -1, field: normalDistance },
    { shift: 0, field: normalDistance },
    { shift: 1, field: normalDistance },
  ].map(({ shift, field }) => {
    const columns = new Float64Array(height * INLAY_SIZE);
    const from = new Int32Array(INLAY_SIZE);
    const to = new Int32Array(INLAY_SIZE);
    const weight = new Float64Array(INLAY_SIZE);
    for (let t = 0; t < INLAY_SIZE; t++) {
      const x = (t + 0.5) * perTexel + shift;
      const fx = Math.min(width - 1, Math.max(0, x - 0.5));
      const x0 = Math.floor(fx);
      from[t] = x0;
      to[t] = Math.min(width - 1, x0 + 1);
      weight[t] = fx - x0;
    }
    for (let y = 0; y < height; y++) {
      const line = y * width;
      const offset = y * INLAY_SIZE;
      for (let t = 0; t < INLAY_SIZE; t++)
        columns[offset + t] =
          field[line + from[t]] * (1 - weight[t]) + field[line + to[t]] * weight[t];
    }
    return columns;
  });
}

/**
 * One row of the cut-out field: the logo `span` pixels tall around the row's
 * cut, sampled as glass density and signed distance.
 */
function plateRow(
  field: Field,
  row: CutRow,
  glass: ReturnType<typeof glassOf>,
  columns: Float64Array[],
  density: ((i: number) => number) | null,
  span: number,
  depth: number,
  out: Float32Array,
  offset: number,
  widths: Float32Array,
  widthOffset: number,
) {
  const { width, height } = field;
  const center = row.line;
  const halfWidth = Math.ceil(width / 2);
  const halfHeight = Math.ceil(height / 2);
  const perTexel = width / INLAY_SIZE;
  const perLine = span / depth;
  const limit = (2 * span) / height;
  const [distance, left, middle, right] = columns;
  const rowAt = (y: number) => {
    const fy = Math.min(height - 1, Math.max(0, y - 0.5));
    const y0 = Math.floor(fy);
    return [y0 * INLAY_SIZE, Math.min(height - 1, y0 + 1) * INLAY_SIZE, fy - y0] as const;
  };
  const at = (samples: Float64Array, t: number, [top, bottom, ty]: ReturnType<typeof rowAt>) =>
    samples[top + t] * (1 - ty) + samples[bottom + t] * ty;
  for (let line = 0; line < depth; line++) {
    const y = center + ((line + 0.5) / depth - 0.5) * span;
    const yFrom = Math.max(0, Math.floor(y - perLine / 2));
    const yTo = Math.min(height, Math.ceil(y + perLine / 2));
    const above = rowAt(y - 1);
    const here = rowAt(y);
    const below = rowAt(y + 1);
    const cy = Math.min(halfHeight - 1, Math.max(0, Math.floor(y / 2)));
    for (let t = 0; t < INLAY_SIZE; t++) {
      const x = (t + 0.5) * perTexel;
      let sum = 0,
        count = 0;
      if (density) {
        const xFrom = Math.floor(t * perTexel);
        const xTo = Math.min(width, Math.ceil((t + 1) * perTexel));
        for (let py = yFrom; py < yTo; py++)
          for (let px = xFrom; px < xTo; px++) {
            const i = py * width + px;
            if (glass.value[i] < 0.5) continue;
            sum += density(i);
            count++;
          }
      }
      const o = offset + (line * INLAY_SIZE + t) * 4;
      out[o] = count ? sum / count : 1;
      // Logo heights, clamped where it no longer matters (two rows away).
      out[o + 1] = Math.max(-limit, Math.min(limit, at(distance, t, here) / height));
      const gx = at(right, t, here) - at(left, t, here);
      const gy = at(middle, t, below) - at(middle, t, above);
      // These gradients are bounded by the size of the source raster.
      const length = Math.sqrt(gx * gx + gy * gy) || 1;
      out[o + 2] = gx / length;
      out[o + 3] = gy / length;
      const cx = Math.min(halfWidth - 1, Math.max(0, Math.floor(x / 2)));
      widths[widthOffset + line * INLAY_SIZE + t] = glass.thickness[cy * halfWidth + cx] / height;
    }
  }
}

/**
 * What slicing needs from a logo that does not change with the cut settings:
 * the distance from every point to the ink, the outlines closed at each gap
 * width, and the pieces of a body. Kept for the last logo, so dragging a
 * slider only re-cuts it.
 */
/** silhouette: the shape is the logo's own outline (a badge's hull). */
type Outline = { data: Float32Array; near: Uint8Array; silhouette: boolean };
type Analysis = {
  coverage: LogoCoverage;
  /**
   * Per body: the glass (ink that is not white, and everything outside the
   * body, which the discs' ellipses already bound) and its signed distance
   * in pixels.
   */
  glass: Map<
    string,
    {
      value: Float32Array;
      distance: Float32Array;
      normalDistance: Float32Array;
      /** Half the local thickness of the glass (pixels), half resolution. */
      thickness: Float32Array;
    }
  >;
  bodies: Map<Float32Array, number>;
  /** Squared distance to the ink on a half-resolution grid with a margin. */
  toInk?: { field: Float32Array; ink: Uint8Array; width: number; height: number; pad: number };
  outlines: Map<number, Outline>;
  pieces: Map<Float32Array, ReturnType<typeof labelPieces>>;
  layouts: Map<string, GlassSlabLayout>;
};
let lastAnalysis: Analysis | null = null;
function analyze(coverage: LogoCoverage) {
  if (lastAnalysis?.coverage !== coverage)
    lastAnalysis = {
      coverage,
      outlines: new Map(),
      pieces: new Map(),
      glass: new Map(),
      bodies: new Map(),
      layouts: new Map(),
    };
  return lastAnalysis;
}
/**
 * Flips connected regions (4-neighbour) of one value smaller than minArea
 * pixels: specks of glass and pinholes too small to cut.
 */
function dropSpecks(
  mask: Uint8Array,
  width: number,
  height: number,
  value: number,
  minArea: number,
) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const region = new Int32Array(minArea);
  let size = 0;
  const visit = (i: number) => {
    if (!seen[i] && mask[i] === value) {
      seen[i] = 1;
      stack[size++] = i;
    }
  };
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || mask[start] !== value) continue;
    let area = 0;
    visit(start);
    while (size) {
      const i = stack[--size];
      if (area < minArea) region[area] = i;
      area++;
      const x = i % width;
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (i >= width) visit(i - width);
      if (i + width < mask.length) visit(i + width);
    }
    if (area < minArea) for (let i = 0; i < area; i++) mask[region[i]] = 1 - value;
  }
}

/**
 * Trace the half-coverage contour between source pixels, then measure to those
 * segments throughout the bevel's neighborhood. Distances to pixel centers
 * leave a stepped normal even when the original alpha edge was antialiased.
 */
function refineCutDistance(
  field: Float32Array,
  inside: Uint8Array,
  distance: Float32Array,
  { width, height }: Field,
) {
  const reach = 5;
  const nearby = new Float32Array(distance.length).fill(reach * reach);
  const coverageAt = (index: number) =>
    field[index] >= 0.5 === Boolean(inside[index]) ? field[index] : inside[index];
  const crossing = (a: number, b: number) => (0.5 - a) / (b - a);
  type Point = [number, number];
  const measure = ([ax, ay]: Point, [bx, by]: Point) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return;
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx) - reach));
    const x1 = Math.min(width - 1, Math.floor(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.ceil(Math.min(ay, by) - reach));
    const y1 = Math.min(height - 1, Math.floor(Math.max(ay, by) + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x - ax;
        const py = y - ay;
        const along = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
        const ex = px - along * dx;
        const ey = py - along * dy;
        const index = y * width + x;
        nearby[index] = Math.min(nearby[index], ex * ex + ey * ey);
      }
    }
  };
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const tl = inside[i];
      const tr = inside[i + 1];
      const bl = inside[i + width];
      const br = inside[i + width + 1];
      if (tl === tr && tl === bl && tl === br) continue;
      const a = coverageAt(i);
      const b = coverageAt(i + 1);
      const c = coverageAt(i + width + 1);
      const d = coverageAt(i + width);
      const edges: Point[] = [];
      if (tl !== tr) edges.push([x + crossing(a, b), y]);
      if (tr !== br) edges.push([x + 1, y + crossing(b, c)]);
      if (bl !== br) edges.push([x + crossing(d, c), y + 1]);
      if (tl !== bl) edges.push([x, y + crossing(a, d)]);
      if (edges.length === 2) {
        measure(edges[0], edges[1]);
      } else if (a + b + c + d >= 2 === Boolean(tl)) {
        measure(edges[0], edges[1]);
        measure(edges[2], edges[3]);
      } else {
        measure(edges[0], edges[3]);
        measure(edges[1], edges[2]);
      }
    }
  }
  for (let i = 0; i < distance.length; i++) {
    if (nearby[i] >= reach * reach) continue;
    const exact = Math.sqrt(nearby[i]);
    const weight = Math.min(1, (reach - exact) / 2);
    distance[i] += ((inside[i] ? -exact : exact) - distance[i]) * weight;
  }
}

/**
 * Reduce raster-sized changes in curvature at the cut. Limit the movement
 * to a fraction of a source pixel so the logo's fine details retain their
 * outline. Only the signed distance near the bevel is changed.
 */
function stabilizeCutContour(distance: Float32Array, { width, height }: Field) {
  const horizontal = new Float32Array(distance.length);
  const filtered = new Float32Array(distance.length);
  const columnSums = new Float64Array(width);
  let source = distance;
  for (const radius of [2, 2, 1]) {
    const window = 2 * radius + 1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx++)
        sum += source[row + Math.min(width - 1, Math.max(0, dx))];
      for (let x = 0; x < width; x++) {
        horizontal[row + x] = sum / window;
        sum +=
          source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
      }
    }
    columnSums.fill(0);
    for (let dy = -radius; dy <= radius; dy++) {
      const row = Math.min(height - 1, Math.max(0, dy)) * width;
      for (let x = 0; x < width; x++) columnSums[x] += horizontal[row + x];
    }
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const leaving = Math.max(0, y - radius) * width;
      const entering = Math.min(height - 1, y + radius + 1) * width;
      for (let x = 0; x < width; x++) {
        filtered[row + x] = columnSums[x] / window;
        columnSums[x] += horizontal[entering + x] - horizontal[leaving + x];
      }
    }
    source = filtered;
  }
  for (let i = 0; i < distance.length; i++) {
    const near = 5 - Math.abs(distance[i]);
    if (near <= 0) continue;
    const shift = Math.min(0.65, Math.max(-0.65, filtered[i] - distance[i]));
    distance[i] += shift * Math.min(1, near / 2);
  }
}

/** Filter the direction field over one raster pixel without moving the cut. */
function smoothCutNormals(distance: Float32Array, { width, height }: Field) {
  const across = new Float32Array(distance.length);
  const filtered = new Float32Array(distance.length);
  for (let y = 0; y < height; y++) {
    const line = y * width;
    for (let x = 0; x < width; x++) {
      const i = line + x;
      across[i] =
        (distance[line + Math.max(0, x - 1)] +
          2 * distance[i] +
          distance[line + Math.min(width - 1, x + 1)]) /
        4;
    }
  }
  for (let y = 0; y < height; y++) {
    const line = y * width;
    const above = Math.max(0, y - 1) * width;
    const below = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++)
      filtered[line + x] = (across[above + x] + 2 * across[line + x] + across[below + x]) / 4;
  }
  return filtered;
}

/**
 * Where the discs keep their glass, at the scale of the cut. When the body is
 * the logo's own outline (silhouette), only the gaps inside it are cut and
 * each disc keeps its clean elliptical end past it; otherwise the logo cuts
 * everything. Slivers thinner than the cutter (radius px) are smoothed away,
 * and specks of glass or gap smaller than minArea pixels go.
 */
function glassOf(analysis: Analysis, body: Float32Array, silhouette: boolean) {
  let id = analysis.bodies.get(body);
  if (id === undefined) analysis.bodies.set(body, (id = analysis.bodies.size));
  const key = `${id}:${silhouette ? 1 : 0}`;
  let glass = analysis.glass.get(key);
  if (!glass) {
    const { data, width, height, white } = analysis.coverage;
    // A logo's edge smoothing and corner widths follow its shape. Use one
    // spacing to compute them so moving the cut lines keeps the same finish.
    const referencePitch = height / EDGE_PROFILE_ROWS;
    const roundedScale = (value: number) =>
      1.2 ** Math.round(Math.log(Math.max(1, value)) / Math.log(1.2));
    const radius = roundedScale(Math.min(1.8, 0.04 * referencePitch));
    const pitch = roundedScale(referencePitch);
    // The glass as a continuous field, 0..1, keeping the image's antialiased
    // edges: its 0.5 level is the cut, drawn between pixels.
    const value = new Float32Array(data.length);
    for (let i = 0; i < value.length; i++)
      value[i] =
        silhouette && body[i] < 0.5 ? 1 : white ? Math.min(data[i], 1 - white[i] / 255) : data[i];
    const field = value.slice();
    if (radius >= 1.5) {
      // Melt the outline slightly: blur the glass and redraw its edge at
      // half. Tapering tips and corners become smooth curves of about the
      // blur's radius, while lines wider than ~1.35 blur radii survive. The
      // blur runs on a half-resolution grid and comes back smoothly
      // (bilinear), so the cut stays a smooth curve at full resolution.
      const w = Math.ceil(width / 2),
        h = Math.ceil(height / 2);
      const half = new Float32Array(w * h);
      for (let y = 0; y < height; y += 2)
        for (let x = 0; x < width; x += 2) {
          let sum = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              sum += value[Math.min(height - 1, y + dy) * width + Math.min(width - 1, x + dx)];
          half[(y >> 1) * w + (x >> 1)] = sum / 4;
        }
      const melt = (src: Float32Array, sigma: number) => {
        const taps = Math.ceil(3 * sigma);
        const kernel = new Float32Array(2 * taps + 1);
        let total = 0;
        for (let k = -taps; k <= taps; k++)
          total += kernel[k + taps] = Math.exp(-(k * k) / (2 * sigma * sigma));
        for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
        const pass = (from: Float32Array, horizontal: boolean) => {
          const to = new Float32Array(from.length);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              let sum = 0;
              for (let k = -taps; k <= taps; k++) {
                const xx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
                const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
                sum += from[yy * w + xx] * kernel[k + taps];
              }
              to[y * w + x] = sum;
            }
          return to;
        };
        return pass(pass(src, true), false);
      };
      const soft = melt(half, radius / 2);
      if (silhouette) {
        // Along the logo's own outline the discs end; details there (hair
        // tapering into the rim) would leave pointed tails, so the band
        // within about 1.5 rows of the outline melts more. Lines wider than
        // about a fifth of a row (lettering) still survive.
        const outside = new Uint8Array(w * h);
        for (let y = 0; y < height; y += 2)
          for (let x = 0; x < width; x += 2)
            if (body[y * width + x] < 0.5) outside[(y >> 1) * w + (x >> 1)] = 1;
        const toOutline = distanceSquared(outside, w, h);
        const strong = melt(half, (1.45 * radius) / 2);
        const band = (1.5 * pitch) / 2;
        for (let c = 0; c < soft.length; c++) {
          const d = Math.sqrt(toOutline[c]);
          const t = Math.min(1, Math.max(0, (band - d) / (0.4 * band)));
          soft[c] += (strong[c] - soft[c]) * t;
        }
      }
      for (let y = 0; y < height; y++) {
        const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const y0 = Math.floor(fy),
          y1 = Math.min(h - 1, y0 + 1),
          ty = fy - y0;
        for (let x = 0; x < width; x++) {
          const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
          const x0 = Math.floor(fx),
            x1 = Math.min(w - 1, x0 + 1),
            tx = fx - x0;
          const top = soft[y0 * w + x0] * (1 - tx) + soft[y0 * w + x1] * tx;
          const bottom = soft[y1 * w + x0] * (1 - tx) + soft[y1 * w + x1] * tx;
          field[y * width + x] = top * (1 - ty) + bottom * ty;
        }
      }
    }
    const inside = Uint8Array.from(field, (v) => (v >= 0.5 ? 1 : 0));
    dropSpecks(inside, width, height, 1, MIN_DETAIL_AREA);
    dropSpecks(inside, width, height, 0, MIN_DETAIL_AREA);
    const outside = inside.map((v) => 1 - v);
    const toGlass = distanceSquared(inside, width, height);
    const toGap = distanceSquared(outside, width, height);
    const distance = new Float32Array(data.length);
    for (let i = 0; i < distance.length; i++) {
      distance[i] = inside[i] ? 0.5 - Math.sqrt(toGap[i]) : Math.sqrt(toGlass[i]) - 0.5;
      value[i] = inside[i];
    }
    refineCutDistance(field, inside, distance, analysis.coverage);
    stabilizeCutContour(distance, analysis.coverage);
    const normalDistance = smoothCutNormals(distance, analysis.coverage);
    // Local thickness: the largest disc that fits in the glass around each
    // pixel, in a few steps, from openings on the half-resolution grid. The
    // tracer rounds a piece's corners in proportion to it, so broad pieces
    // get soft corners while thin lines keep theirs.
    const w = Math.ceil(width / 2),
      h = Math.ceil(height / 2);
    const half = new Uint8Array(w * h);
    for (let y = 0; y < height; y += 2)
      for (let x = 0; x < width; x += 2) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++)
            sum += inside[Math.min(height - 1, y + dy) * width + Math.min(width - 1, x + dx)];
        half[(y >> 1) * w + (x >> 1)] = sum >= 2 ? 1 : 0;
      }
    const thickness = new Float32Array(w * h);
    const toEdge = distanceSquared(
      half.map((v) => 1 - v),
      w,
      h,
    );
    for (const share of [0.08, 0.14, 0.2, 0.28]) {
      const reach = ((share * pitch) / 2) ** 2;
      const core = Uint8Array.from(toEdge, (d) => (d > reach ? 1 : 0));
      const toCore = distanceSquared(core, w, h);
      for (let c = 0; c < half.length; c++)
        if (half[c] && toCore[c] <= reach) thickness[c] = share * pitch;
    }
    analysis.glass.set(key, (glass = { value, distance, normalDistance, thickness }));
  }
  return glass;
}
function piecesOf(analysis: Analysis, body: Float32Array) {
  let pieces = analysis.pieces.get(body);
  if (!pieces) analysis.pieces.set(body, (pieces = labelPieces(body, analysis.coverage)));
  return pieces;
}

/**
 * Pixel coverage of the convex hull of a set of pixels, as [left, right)
 * spans per row (monotone chain over each row's outermost pixel edges).
 */
function hullSpans(left: Float64Array, right: Float64Array, height: number) {
  const points: [number, number][] = [];
  for (let y = 0; y < height; y++)
    if (right[y] > left[y]) points.push([left[y], y + 0.5], [right[y], y + 0.5]);
  points.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  const upper: [number, number][] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (let k = points.length - 1; k >= 0; k--) {
    const p = points[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  const polygon = lower.slice(0, -1).concat(upper.slice(0, -1));
  const from = new Float64Array(height).fill(Infinity);
  const to = new Float64Array(height).fill(-Infinity);
  for (let k = 0; k < polygon.length; k++) {
    const [ax, ay] = polygon[k];
    const [bx, by] = polygon[(k + 1) % polygon.length];
    const y0 = Math.ceil(Math.min(ay, by) - 0.5);
    const y1 = Math.floor(Math.max(ay, by) - 0.5);
    for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
      const t = ay === by ? 0 : (y + 0.5 - ay) / (by - ay);
      const x = ax + (bx - ax) * t;
      if (x < from[y]) from[y] = x;
      if (x > to[y]) to[y] = x;
    }
  }
  return { from, to };
}

/**
 * The solid shape a logo is cut from when its own cut would splinter: the
 * ink closed over gaps narrower than about twice the radius (a stripe of an
 * emblem's design that runs out through its edge, the space between the
 * strokes of a script), with everything it encloses filled. A shape that
 * nearly fills its convex hull (a badge, a seal) is cut from the hull. The
 * background inside it is printed as clear glass.
 */
function outlineOf(analysis: Analysis, radius: number): Outline {
  // Radii within a fifth of each other share an outline, so dragging the
  // disc count rarely needs a new one.
  const step = Math.round(Math.log(Math.max(2, radius)) / Math.log(1.2));
  const key = Math.min(MAX_CLOSE, Math.round(1.2 ** step));
  let outline = analysis.outlines.get(key);
  if (outline) return outline;
  const { data, width, height } = analysis.coverage;
  // The closing runs on a half-resolution grid: it only decides which gaps
  // between the ink fill in; the ink keeps its own antialiased edges.
  if (!analysis.toInk) {
    const pad = MAX_CLOSE / 2 + 2;
    const w = Math.ceil(width / 2) + 2 * pad;
    const h = Math.ceil(height / 2) + 2 * pad;
    const ink = new Uint8Array(w * h);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[y * width + x] >= 0.5) ink[((y >> 1) + pad) * w + (x >> 1) + pad] = 1;
    analysis.toInk = { field: distanceSquared(ink, w, h), ink, width: w, height: h, pad };
  }
  const { field, ink, width: w, height: h, pad } = analysis.toInk;
  const reach = (key / 2) * (key / 2);
  const beyond = new Uint8Array(w * h);
  for (let i = 0; i < beyond.length; i++) beyond[i] = field[i] > reach ? 1 : 0;
  const toBeyond = distanceSquared(beyond, w, h);
  const cell = (x: number, y: number) => ((y >> 1) + pad) * w + (x >> 1) + pad;
  // Gap cells the closing fills; cells holding ink keep their pixels as drawn.
  const solid = (i: number) => {
    if (data[i] >= 0.5) return true;
    const x = i % width;
    const c = cell(x, (i - x) / width);
    return !ink[c] && toBeyond[c] > reach;
  };
  const outside = enclosed((i) => !solid(i), width, height);
  const filled = data.slice();
  for (let i = 0; i < filled.length; i++) if (!outside[i]) filled[i] = 1;
  // A badge: the largest piece nearly fills its convex hull. Pieces are
  // found on the half-resolution grid, which is plenty to tell.
  const halfWidth = Math.ceil(width / 2);
  const halfHeight = Math.ceil(height / 2);
  const cells = new Float32Array(halfWidth * halfHeight);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (filled[y * width + x] >= 0.5) cells[(y >> 1) * halfWidth + (x >> 1)] = 1;
  const { labels, boxes } = labelPieces(cells, { width: halfWidth, height: halfHeight });
  let badge = false;
  let main = 1;
  for (let label = 2; label < boxes.length; label++)
    if (boxes[label].area > boxes[main].area) main = label;
  if (boxes.length > 1) {
    const left = new Float64Array(height).fill(Infinity);
    const right = new Float64Array(height).fill(-Infinity);
    for (let cy = 0; cy < halfHeight; cy++)
      for (let cx = 0; cx < halfWidth; cx++) {
        if (labels[cy * halfWidth + cx] !== main || !cells[cy * halfWidth + cx]) continue;
        for (let y = 2 * cy; y < Math.min(height, 2 * cy + 2); y++) {
          if (2 * cx < left[y]) left[y] = 2 * cx;
          if (2 * cx + 2 > right[y]) right[y] = Math.min(width, 2 * cx + 2);
        }
      }
    const { from, to } = hullSpans(left, right, height);
    let hullArea = 0;
    for (let y = 0; y < height; y++) if (to[y] > from[y]) hullArea += to[y] - from[y];
    badge = 4 * boxes[main].area >= 0.9 * hullArea;
    if (badge)
      for (let y = 0; y < height; y++)
        for (let x = Math.max(0, Math.floor(from[y])); x < Math.min(width, Math.ceil(to[y])); x++) {
          const i = y * width + x;
          const inside = Math.min(x + 1, to[y]) - Math.max(x, from[y]);
          if (inside > filled[i]) filled[i] = inside;
        }
  }
  const opening = new Uint8Array(width * height);
  for (let i = 0; i < opening.length; i++) if (filled[i] >= 0.5 && data[i] < 0.5) opening[i] = 1;
  outline = { data: filled, near: dilate(opening, analysis.coverage, 2), silhouette: badge };
  analysis.outlines.set(key, outline);
  return outline;
}

/** Estimate how much of the artwork changes between the base cut lines. */
function detailedRowCount(
  { data, width, height, white }: LogoCoverage,
  count: number,
  phase: number,
) {
  const pitch = height / count;
  const hasInk = (i: number) => data[i] >= 0.5 && (!white || white[i] < 128);
  const sample = (y: number) => {
    const start = Math.min(height - 1, Math.floor(y)) * width;
    let left = width;
    let right = -1;
    let runs = 0;
    let inside = false;
    for (let x = 0; x < width; x++) {
      const ink = hasInk(start + x);
      if (ink) {
        left = Math.min(left, x);
        right = x;
        if (!inside) runs++;
      }
      inside = ink;
    }
    return { start, left, right, runs };
  };
  let detailed = 0;
  for (let row = 0; row < count; row++) {
    const cut = sample((row + phase) * pitch);
    for (const offset of [0.125, 0.5, 0.875]) {
      const neighbor = sample((row + offset) * pitch);
      if (Math.max(cut.runs, neighbor.runs) < 4) continue;
      // Ignore changes to the outer silhouette. A broad diagonal or a
      // circular rim does not need finer cuts just because it moves sideways.
      const left = Math.max(cut.left, neighbor.left);
      const right = Math.min(cut.right, neighbor.right);
      let changes = 0;
      for (let x = left; x <= right; x++) {
        if (hasInk(cut.start + x) !== hasInk(neighbor.start + x)) changes++;
      }
      if (changes >= Math.max(3, 0.06 * (right - left + 1))) {
        detailed++;
        break;
      }
    }
  }
  // A small isolated feature already has a cut inside the disc. Increase
  // the base sampling when changes extend across a substantial part of it.
  return detailed < Math.ceil(count / 4) ? count : Math.min(MAX_ROWS, count + detailed);
}

/** Suggest a count from changing contours and the widths of the thinner strokes. */
export function recommendSlabCount(coverage: LogoCoverage) {
  const { data, width, height, white } = coverage;
  const widths: number[] = [];
  for (const [across, along, stride, offset] of [
    [height, width, 1, width],
    [width, height, width, 1],
  ]) {
    for (let row = 0; row < across; row += Math.max(1, Math.floor(across / 32))) {
      let run = 0;
      for (let p = 0; p <= along; p++) {
        const i = row * offset + p * stride;
        if (p < along && data[i] >= 0.5 && (!white || white[i] < 128)) run++;
        else {
          if (run >= 2) widths.push(run);
          run = 0;
        }
      }
    }
  }
  widths.sort((a, b) => a - b);
  const stroke = widths[Math.floor(widths.length / 4)] ?? height;
  const contourRows = detailedRowCount(coverage, BASE_ROW_COUNT, 0.75);
  const strokeRows = Math.ceil((0.65 * height) / stroke);
  // Use detail to add a few rows to the starting count. A shape that
  // calls for twice the base sampling uses the full recommendation range.
  const detail = Math.min(1, (Math.max(contourRows, strokeRows) - BASE_ROW_COUNT) / BASE_ROW_COUNT);
  return BASE_ROW_COUNT + Math.ceil(detail * (MAX_RECOMMENDED_ROW_COUNT - BASE_ROW_COUNT));
}

const rowCount = (slabs: number) => Math.max(1, Math.min(MAX_ROWS, Math.round(slabs)));

function cutKey(options: SliceOptions) {
  return [
    rowCount(options.slabs),
    options.renderMode ?? 'auto',
    options.phase,
    options.band,
    options.minPieceSlabs,
    options.minSpan,
    options.bridge,
  ].join();
}

export function cachePreparedLogo(
  src: string,
  coverage: LogoCoverage,
  options: SliceOptions,
  layout: GlassSlabLayout,
) {
  cacheCoverage(src, Promise.resolve(coverage));
  analyze(coverage).layouts.set(cutKey(options), layout);
}

/**
 * Evenly spaced horizontal cuts through the logo; each solid run becomes a
 * disc. A few small detached pieces (a leaf) get their own denser cuts and
 * specks (dots, stars) a single disc each. The detailed cut follows interior
 * openings and fine edges within the discs.
 */
export function sliceLogo(coverage: LogoCoverage, options: SliceOptions): GlassSlabLayout {
  const { width, height, tone } = coverage;
  const { renderMode = 'auto' } = options;
  const count = rowCount(options.slabs);
  const analysis = analyze(coverage);
  const key = cutKey(options);
  const existing = analysis.layouts.get(key);
  if (existing) {
    analysis.layouts.delete(key);
    analysis.layouts.set(key, existing);
    return existing;
  }
  const pitchPx = height / count;
  const toneAt = tone ? (i: number) => tone[i] / TONE_UNIT : () => 1;
  let body = coverage.data;
  // Whether the body is the logo's own outline: past it, each disc keeps its
  // clean elliptical end. Otherwise (a script's merged outline) the space
  // past it is the logo's white space and stays empty.
  let silhouette = true;
  // A logo whose own cut splinters into discs narrower than a row (strokes,
  // stripes running through an emblem's edge) is cut from its outline when
  // that cuts cleaner; the logo is then cut out of each disc. Evaluate both
  // methods at the base spacing so changing the count keeps the same outline.
  const open: CutStats = { runs: 0, thin: 0 };
  if (renderMode === 'auto')
    cutRows(coverage, (i) => coverage.data[i], 0, height, BASE_ROW_COUNT, options, open);
  if (renderMode === 'detailed' || (open.runs && open.thin >= 0.15 * open.runs)) {
    const outline = outlineOf(analysis, height / BASE_ROW_COUNT);
    const closed: CutStats = { runs: 0, thin: 0 };
    if (renderMode === 'auto')
      cutRows(coverage, (i) => outline.data[i], 0, height, BASE_ROW_COUNT, options, closed);
    if (renderMode === 'detailed' || open.runs >= 1.5 * closed.runs) {
      body = outline.data;
      silhouette = outline.silhouette;
    }
  }
  const { labels, boxes } = piecesOf(analysis, body);
  let total = 0;
  for (const box of boxes) total += box.area;
  // 0: cut with the main rows, 1: its own stack, 2: one disc, 3: dropped.
  const role = new Uint8Array(boxes.length);
  const small: number[] = [];
  boxes.forEach((box, label) => {
    if (!label) return;
    if (box.area < MIN_DETAIL_AREA) role[label] = 3;
    else if (box.bottom - box.top + 1 < options.minPieceSlabs * pitchPx) small.push(label);
  });
  small.sort((p, q) => boxes[q].area - boxes[p].area);
  small.forEach((label, rank) => {
    const box = boxes[label];
    const span = box.bottom - box.top + 1;
    // A leaf gets its own stack; a thin stroke (steam, a flourish) would only
    // turn into a column of beads, so it is cut with the main rows.
    if (rank < 4 && box.area >= total * 0.01 && box.area / span >= pitchPx) role[label] = 1;
    else if (span < 1.5 * pitchPx) role[label] = 2;
  });
  const details = small.filter((label) => role[label] === 1 || role[label] === 2);
  // Leave room for the main shape before assigning cuts to detached accents.
  for (const label of details.splice(count - 1)) role[label] = 0;
  if (!boxes.some((_, label) => label > 0 && role[label] === 0)) {
    role.fill(0);
    details.length = 0;
  }
  let extra = Math.max(0, Math.floor(count / 2) - details.length);
  const detailCuts = details.map((label) => {
    const box = boxes[label];
    const span = box.bottom - box.top + 1;
    const desired =
      role[label] === 1
        ? Math.max(
            Math.round(span / pitchPx),
            Math.min(options.minPieceSlabs, Math.floor(span / 3)),
            1,
          )
        : 1;
    const count = Math.min(desired, 1 + extra);
    extra -= count - 1;
    return count;
  });
  const mainCount = count - detailCuts.reduce((sum, cuts) => sum + cuts, 0);
  const rows = cutOccupiedRows(
    coverage,
    (i) => (role[labels[i]] === 0 ? body[i] : 0),
    0,
    height,
    mainCount,
    options,
  );
  details.forEach((label, index) => {
    const box = boxes[label];
    const value = (i: number) => (labels[i] === label ? body[i] : 0);
    rows.push(
      ...cutOccupiedRows(
        coverage,
        value,
        box.top,
        box.bottom + 1,
        detailCuts[index],
        role[label] === 2 ? { ...options, phase: 0.5, band: 1, minSpan: 0 } : options,
      ),
    );
  });
  rows.sort((p, q) => p.y - q.y);
  const logoWidth = width / height;
  let inlay: GlassSlabLayout['inlay'];
  // Cut the logo out of its discs when white or empty parts fall inside them
  // (an emblem's design, a script's counters), or when it has darker parts.
  let bodyArea = 0,
    gaps = 0,
    toned = 0;
  const { white } = coverage;
  if (renderMode !== 'ellipses') {
    for (let i = 0; i < body.length; i++) {
      if (body[i] < 0.5) continue;
      bodyArea++;
      const glass = white ? Math.min(coverage.data[i], 1 - white[i] / 255) : coverage.data[i];
      if (glass < 0.5) gaps++;
      else if (tone && Math.abs(tone[i] - TONE_UNIT) > TONE_UNIT / 4) toned++;
    }
  }
  if (
    rows.length &&
    renderMode !== 'ellipses' &&
    (renderMode === 'detailed' || gaps >= 0.01 * bodyArea || toned >= 0.01 * bodyArea)
  ) {
    const depth = Math.max(8, Math.min(INLAY_DEPTH, Math.floor(INLAY_HEIGHT / rows.length)));
    const perRow = INLAY_SIZE * depth * 4;
    const data = new Float32Array(rows.length * perRow);
    const widths = new Float32Array(rows.length * INLAY_SIZE * depth);
    const cut = glassOf(analysis, body, silhouette);
    const columns = plateColumns(coverage, cut.distance, cut.normalDistance);
    const span = PLATE_SPAN * pitchPx;
    rows.forEach((row, k) =>
      plateRow(
        coverage,
        row,
        cut,
        columns,
        toned ? toneAt : null,
        span,
        depth,
        data,
        k * perRow,
        widths,
        k * INLAY_SIZE * depth,
      ),
    );
    inlay = { data, widths, size: INLAY_SIZE, depth, span: span / height };
  }
  const layout = {
    rows: rows.map(({ y, pitch, spans }) => ({ y, pitch, spans })),
    pitch: pitchPx / height,
    width: logoWidth,
    inlay,
  };
  analysis.layouts.set(key, layout);
  if (analysis.layouts.size > CACHED_LAYOUTS) {
    const oldest = analysis.layouts.keys().next();
    if (!oldest.done) analysis.layouts.delete(oldest.value);
  }
  return layout;
}
