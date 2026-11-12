/** Height-normalized calibration of the supplied blurred ripple / water refraction tutorial. */
export const fluidRipplesField = {
  growth: 0.58,
  height: 0.0574,
  width: 0.045,
  radius: 0.025,
  lifetime: 3.2,
  fadeIn: 0.08,
  fadeOut: 0.65,
  /** A drop larger than a keystroke first spreads as a decelerating shock front (radius ∝ √t). */
  shock: 0.62,
  /** Drops at least this size rebound once, sending a weaker trailing ring. */
  reboundSize: 1.6,
  reboundDelay: 0.12,
  depth: 0.85,
  refractiveIndex: 1.34,
  ambient: 0.73,
  lightPower: 0.5,
  lighting: 0.06,
  backgroundTwist: 0.22,
  noiseWidth: 20,
  noiseHeight: 12,
} as const;

/** A small periodic vector field models the tutorial's static turbulence (Evolution 0). */
export function createFluidNoise() {
  const { noiseWidth: width, noiseHeight: height } = fluidRipplesField;
  const data = new Uint8Array(width * height * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width,
        v = (y + 0.5) / height;
      const a =
        Math.sin(tau * (4 * u + 2 * v) + 0.8) * 0.45 +
        Math.sin(tau * (2 * u - 3 * v) + 2.1) * 0.28 +
        Math.cos(tau * (7 * u + 4 * v) + 1.7) * 0.17;
      const b =
        Math.cos(tau * (3 * u - 2 * v) + 2.4) * 0.45 +
        Math.sin(tau * (5 * u + 3 * v) + 3.7) * 0.28 +
        Math.cos(tau * (8 * u - 5 * v) + 0.3) * 0.17;
      const offset = (y * width + x) * 4;
      data[offset] = Math.round((a * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((b * 0.5 + 0.5) * 255);
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  return data;
}
