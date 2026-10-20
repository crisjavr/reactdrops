/**
 * Procedural color field for the chromatic material, generated in code (no
 * image asset). It is a seamless equirectangular field: the shader wraps it
 * around a sphere, rotates it and projects it, so it repeats horizontally
 * (longitude) and clamps vertically (latitude).
 *
 * Soft magenta-violet blobs on a dark ground: fractal value noise, periodic
 * in x, normalized to a fixed hue, saturation and brightness distribution.
 * Palette modes keep only its brightness; hue mode also uses its hue spread.
 */
export const chromaticFieldSize = 128;

// Target distribution (HSV): hue around magenta-violet, near-full
// saturation, dark brightness with bright blobs.
const target = {
  hue: { mean: 0.83, deviation: 0.05 },
  saturation: { mean: 0.988, deviation: 0.03 },
  // Brightness quantiles (share of texels, value): mostly dark with a long
  // tail of bright highlights, which become the material's glints.
  value: [
    [0, 0.024],
    [0.05, 0.078],
    [0.25, 0.157],
    [0.5, 0.243],
    [0.75, 0.325],
    [0.9, 0.4],
    [0.97, 0.459],
    [0.995, 0.506],
    [1, 0.533],
  ] as const,
};

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Value noise on a lattice that repeats every `period` cells in x. */
function periodicNoise(x: number, y: number, period: number, seed: number) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10),
    sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const wrap = (value: number) => ((value % period) + period) % period;
  const a = hash(wrap(x0), y0, seed),
    b = hash(wrap(x0 + 1), y0, seed),
    c = hash(wrap(x0), y0 + 1, seed),
    d = hash(wrap(x0 + 1), y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal noise over the field, seamless across the horizontal edge. */
function fractal(size: number, basePeriod: number, octaves: number, seed: number) {
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let sum = 0,
        amplitude = 1,
        norm = 0;
      for (let octave = 0; octave < octaves; octave++) {
        const period = basePeriod << octave;
        // Latitude uses half as many cells: the field is twice as wide as tall.
        sum +=
          amplitude *
          periodicNoise((x / size) * period, (y / size) * (period / 2), period, seed + octave * 97);
        norm += amplitude;
        amplitude *= 0.5;
      }
      values[y * size + x] = sum / norm;
    }
  return values;
}

/** Maps values by rank onto a piecewise-linear quantile table. */
function matchQuantiles(values: Float32Array, quantiles: readonly (readonly [number, number])[]) {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  const mapped = new Float32Array(values.length);
  order.forEach((index, rank) => {
    const share = rank / (values.length - 1);
    let k = 1;
    while (k < quantiles.length - 1 && quantiles[k][0] < share) k++;
    const [s0, v0] = quantiles[k - 1],
      [s1, v1] = quantiles[k];
    mapped[index] = v0 + ((share - s0) / Math.max(1e-6, s1 - s0)) * (v1 - v0);
  });
  return mapped;
}

/** Rescales values to a given mean and deviation. */
function normalize(values: Float32Array, mean: number, deviation: number) {
  let total = 0;
  for (const value of values) total += value;
  const currentMean = total / values.length;
  let variance = 0;
  for (const value of values) variance += (value - currentMean) ** 2;
  const currentDeviation = Math.sqrt(variance / values.length) || 1;
  return values.map((value) => mean + ((value - currentMean) / currentDeviation) * deviation);
}

function hsvToRgb(h: number, s: number, v: number) {
  const i = Math.floor(h * 6),
    f = h * 6 - i,
    p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

let cached: Uint8Array | null = null;

/** RGBA bytes of the field (`chromaticFieldSize` squared), computed once. */
export function chromaticField(): Uint8Array {
  if (cached) return cached;
  const size = chromaticFieldSize;
  // Brightness: soft blobs from a 4-cell base period, ranked onto the
  // target distribution so highlights keep their long bright tail.
  const value = matchQuantiles(fractal(size, 4, 4, 11), target.value);
  const hue = normalize(fractal(size, 3, 3, 29), target.hue.mean, target.hue.deviation);
  const saturation = normalize(
    fractal(size, 5, 2, 53),
    target.saturation.mean,
    target.saturation.deviation,
  );
  const bytes = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index++) {
    const [r, g, b] = hsvToRgb(
      ((hue[index] % 1) + 1) % 1,
      Math.min(1, Math.max(0.8, saturation[index])),
      value[index],
    );
    bytes[index * 4] = Math.round(r * 255);
    bytes[index * 4 + 1] = Math.round(g * 255);
    bytes[index * 4 + 2] = Math.round(b * 255);
    bytes[index * 4 + 3] = 255;
  }
  cached = bytes;
  return bytes;
}
