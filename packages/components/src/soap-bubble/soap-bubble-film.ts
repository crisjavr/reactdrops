export const soapBubbleSpectralSamples = 16;
/** Thickest film in the lookup table, in nanometres. */
export const soapBubbleFilmMax = 3000;
/** Lookup table size: thickness samples by incidence samples. */
export const soapBubbleFilmSize = [768, 48] as const;

// CIE 1931 2° colour matching functions, multi-lobe fit by Wyman, Sloan and
// Shirley (2013).
function cie(lambda: number) {
  const lobe = (center: number, below: number, above: number) => {
    const t = (lambda - center) * (lambda < center ? below : above);
    return Math.exp(-0.5 * t * t);
  };
  return [
    0.362 * lobe(442, 0.0624, 0.0374) +
      1.056 * lobe(599.8, 0.0264, 0.0323) -
      0.065 * lobe(501.1, 0.049, 0.0382),
    0.821 * lobe(568.8, 0.0213, 0.0247) + 0.286 * lobe(530.9, 0.0613, 0.0322),
    1.217 * lobe(437, 0.0845, 0.0278) + 0.681 * lobe(459, 0.0385, 0.0725),
  ];
}

// Per-sample weights that turn a reflectance spectrum into linear sRGB. Each
// channel is normalised so a flat spectrum stays neutral under the light.
function spectralWeights() {
  const count = soapBubbleSpectralSamples;
  const start = 385;
  const end = 715;
  const step = (end - start) / count;
  const lambda = new Float32Array(count);
  const bandwidth = new Float32Array(count);
  const weights = new Float32Array(count * 3);
  const sum = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const l = start + (i + 0.5) * step;
    const [x, y, z] = cie(l);
    const rgb = [
      3.2406 * x - 1.5372 * y - 0.4986 * z,
      -0.9689 * x + 1.8758 * y + 0.0415 * z,
      0.0557 * x - 0.204 * y + 1.057 * z,
    ];
    lambda[i] = l;
    bandwidth[i] = step / l;
    for (let c = 0; c < 3; c++) {
      weights[i * 3 + c] = rgb[c];
      sum[c] += rgb[c];
    }
  }
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) weights[i * 3 + c] /= sum[c];
  return { lambda, bandwidth, weights };
}

const WATER = 1.333;

// Two-beam Airy reflectance of a symmetric air–water–air film for one
// polarisation; c is the bandwidth-averaged cosine of the phase difference.
const airy = (r2: number, c: number) => (2 * r2 * (1 - c)) / (1 + r2 * r2 - 2 * r2 * c);

/**
 * Interference reflectance of the film in linear sRGB over thickness and the
 * cosine of incidence: 16 wavelengths and both polarisations per entry,
 * averaged over each wavelength band so thick films wash out to white.
 */
export function soapBubbleFilmTable() {
  const { lambda, bandwidth, weights } = spectralWeights();
  const [columns, rows] = soapBubbleFilmSize;
  const count = lambda.length;
  const table = new Float32Array(columns * rows * 4);
  // Phase and band spread grow linearly with thickness, so along a row each
  // wavelength's cosine and sine are stepped by a rotation instead of being
  // evaluated: two trigonometric pairs per wavelength and row, not per entry.
  const cosPhase = new Float64Array(count);
  const sinPhase = new Float64Array(count);
  const stepCos = new Float64Array(count);
  const stepSin = new Float64Array(count);
  const spreadCos = new Float64Array(count);
  const spreadSin = new Float64Array(count);
  const spreadStepCos = new Float64Array(count);
  const spreadStepSin = new Float64Array(count);
  const spreadStep = new Float64Array(count);
  for (let row = 0; row < rows; row++) {
    const cosI = Math.max(1e-4, row / (rows - 1));
    const sin2 = 1 - cosI * cosI;
    const cosT = Math.sqrt(Math.max(0, 1 - sin2 / (WATER * WATER)));
    const rs = (cosI - WATER * cosT) / (cosI + WATER * cosT);
    const rp = (WATER * cosI - cosT) / (WATER * cosI + cosT);
    const rs2 = rs * rs;
    const rp2 = rp * rp;
    // Optical path difference between the two reflected beams per column, in nm.
    const pathStep = (4 * Math.PI * WATER * soapBubbleFilmMax * cosT) / (columns - 1);
    for (let i = 0; i < count; i++) {
      const phase = pathStep / lambda[i];
      const spread = 0.5 * phase * bandwidth[i];
      cosPhase[i] = 1;
      sinPhase[i] = 0;
      stepCos[i] = Math.cos(phase);
      stepSin[i] = Math.sin(phase);
      spreadCos[i] = 1;
      spreadSin[i] = 0;
      spreadStepCos[i] = Math.cos(spread);
      spreadStepSin[i] = Math.sin(spread);
      spreadStep[i] = spread;
    }
    let index = row * columns * 4;
    for (let column = 0; column < columns; column++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < count; i++) {
        const spread = column * spreadStep[i];
        const sinc = spread < 1e-3 ? 1 : spreadSin[i] / spread;
        const c = cosPhase[i] * sinc;
        const reflectance = 0.5 * (airy(rs2, c) + airy(rp2, c));
        r += reflectance * weights[i * 3];
        g += reflectance * weights[i * 3 + 1];
        b += reflectance * weights[i * 3 + 2];
        // On to the next column.
        const phaseCos = cosPhase[i];
        cosPhase[i] = phaseCos * stepCos[i] - sinPhase[i] * stepSin[i];
        sinPhase[i] = sinPhase[i] * stepCos[i] + phaseCos * stepSin[i];
        const bandCos = spreadCos[i];
        spreadCos[i] = bandCos * spreadStepCos[i] - spreadSin[i] * spreadStepSin[i];
        spreadSin[i] = spreadSin[i] * spreadStepCos[i] + bandCos * spreadStepSin[i];
      }
      table[index++] = Math.max(0, r);
      table[index++] = Math.max(0, g);
      table[index++] = Math.max(0, b);
      table[index++] = 1;
    }
  }
  return table;
}
