export type FractalGlassDirection = 'vertical' | 'horizontal';
export type FractalGlassSide = 'left' | 'right';
export type FractalGlassMode = 'default' | 'optical';
export type FractalGlassCoverageMode = 'continuous' | 'stripes';
export type FractalGlassHoverAnimation = 'procedural' | 'transition' | 'circle';
export type FractalGlassHoverPreset = 'glass-on-hover' | 'reveal-on-hover';
export type FractalGlassRecoveryDirection = 'reverse' | 'same' | 'left-to-right' | 'right-to-left';
export const fractalGlassEases = [
  'power4.out',
  'power3.out',
  'power2.out',
  'power1.out',
  'power4.inOut',
  'power3.inOut',
  'sine.out',
  'sine.inOut',
  'expo.out',
  'smoothstep',
  'none',
] as const;
export type FractalGlassEase = (typeof fractalGlassEases)[number];

export const fractalGlassDefaults = {
  animateEntrance: true,
  mode: 'default' as FractalGlassMode,
  stripes: 26,
  distortion: 24,
  refractionBias: -0.1,
  blur: 20,
  grain: 0.005,
  smoothness: 7.3,
  textureScale: 103,
  blackPoint: 0,
  whitePoint: 232,
  gamma: 0.78,
  edgeWidth: 0,
  relief: 1.25,
  refraction: 1.1,
  roughness: 0.08,
  reflection: 1.15,
  dispersion: 0.25,
  caustics: 0,
  coverage: 0.55,
  coverageMode: 'stripes' as FractalGlassCoverageMode,
  side: 'left' as FractalGlassSide,
  direction: 'vertical' as FractalGlassDirection,
  hoverEffect: true,
  hoverPreset: 'reveal-on-hover' as FractalGlassHoverPreset,
  recoveryDirection: 'same' as FractalGlassRecoveryDirection,
  hoverAnimation: 'procedural' as FractalGlassHoverAnimation,
  hoverDuration: 880,
  hoverRadius: 120,
  hoverFeather: 16,
  transitionBlend: 0.5,
  duration: 570,
  ease: 'power4.out' as FractalGlassEase,
  disabled: false,
  maxDpr: 2,
  maxPixels: 2_000_000,
};
export type FractalGlassSettings = typeof fractalGlassDefaults;

const hoverDefaults = {
  hoverEffect: true,
  hoverAnimation: fractalGlassDefaults.hoverAnimation,
  hoverDuration: fractalGlassDefaults.hoverDuration,
  transitionBlend: fractalGlassDefaults.transitionBlend,
  duration: fractalGlassDefaults.duration,
  ease: fractalGlassDefaults.ease,
  disabled: fractalGlassDefaults.disabled,
  recoveryDirection: 'reverse' as FractalGlassRecoveryDirection,
};

/** Spread a preset into FractalGlass; individual props can override its values. */
export const fractalGlassPresets = {
  'glass-on-hover': {
    ...hoverDefaults,
    hoverPreset: 'glass-on-hover' as FractalGlassHoverPreset,
    coverage: 0.44,
    side: fractalGlassDefaults.side,
  },
  'reveal-on-hover': {
    ...hoverDefaults,
    hoverPreset: 'reveal-on-hover' as FractalGlassHoverPreset,
    coverage: 1,
    side: 'right' as FractalGlassSide,
  },
  'circular-glass': {
    hoverEffect: true,
    hoverAnimation: 'circle' as FractalGlassHoverAnimation,
    hoverDuration: 1720,
    hoverRadius: 191,
    hoverFeather: 241,
    ease: 'power4.out' as FractalGlassEase,
    disabled: false,
  },
};

const bounded = (value: number, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeFractalGlass(settings: FractalGlassSettings): FractalGlassSettings {
  const d = fractalGlassDefaults;
  return {
    ...settings,
    animateEntrance: settings.animateEntrance !== false,
    stripes: Math.round(bounded(settings.stripes, d.stripes, 1, 200)),
    distortion: bounded(settings.distortion, d.distortion, 0, 300),
    refractionBias: bounded(settings.refractionBias, d.refractionBias, -1, 1),
    blur: bounded(settings.blur, d.blur, 0, 80),
    grain: bounded(settings.grain, d.grain, 0, 0.15),
    smoothness: bounded(settings.smoothness, d.smoothness, 0, 15),
    textureScale: bounded(settings.textureScale, d.textureScale, 25, 400),
    blackPoint: bounded(settings.blackPoint, d.blackPoint, 0, 254),
    whitePoint: bounded(settings.whitePoint, d.whitePoint, 1, 255),
    gamma: bounded(settings.gamma, d.gamma, 0.1, 3),
    edgeWidth: bounded(settings.edgeWidth, d.edgeWidth, 0, 12),
    relief: bounded(settings.relief, d.relief, 0, 4),
    refraction: bounded(settings.refraction, d.refraction, 0, 2),
    roughness: bounded(settings.roughness, d.roughness, 0, 1),
    reflection: bounded(settings.reflection, d.reflection, 0, 2),
    dispersion: bounded(settings.dispersion, d.dispersion, 0, 2),
    caustics: bounded(settings.caustics, d.caustics, 0, 2),
    coverage: bounded(settings.coverage, d.coverage, 0, 1),
    coverageMode: settings.coverageMode === 'stripes' ? 'stripes' : 'continuous',
    hoverAnimation: ['transition', 'circle'].includes(settings.hoverAnimation)
      ? settings.hoverAnimation
      : 'procedural',
    hoverPreset: settings.hoverPreset === 'reveal-on-hover' ? 'reveal-on-hover' : 'glass-on-hover',
    recoveryDirection: ['reverse', 'same', 'left-to-right', 'right-to-left'].includes(
      settings.recoveryDirection,
    )
      ? settings.recoveryDirection
      : d.recoveryDirection,
    hoverDuration: bounded(settings.hoverDuration, d.hoverDuration, 0, 2000),
    hoverRadius: bounded(settings.hoverRadius, d.hoverRadius, 10, 600),
    hoverFeather: bounded(settings.hoverFeather, d.hoverFeather, 0, 300),
    transitionBlend: bounded(settings.transitionBlend, d.transitionBlend, 0, 1),
    duration: bounded(settings.duration, d.duration, 0, 3000),
    ease: fractalGlassEases.includes(settings.ease) ? settings.ease : d.ease,
    maxDpr: bounded(settings.maxDpr, d.maxDpr, 0.5, 3),
    maxPixels: bounded(settings.maxPixels, d.maxPixels, 1024, 8_000_000),
    side: settings.side === 'right' ? 'right' : 'left',
    direction: settings.direction === 'horizontal' ? 'horizontal' : 'vertical',
    mode: settings.mode === 'optical' ? 'optical' : 'default',
  };
}

/** Bounded timing curves using the standard Power, Sine and Expo definitions. */
export function fractalGlassEase(progress: number, ease: FractalGlassEase) {
  const p = Math.max(0, Math.min(1, progress));
  if (p === 0 || p === 1) return p;
  switch (ease) {
    case 'none':
      return p;
    case 'smoothstep':
      return p * p * (3 - 2 * p);
    case 'power1.out':
      return 1 - (1 - p) ** 2;
    case 'power2.out':
      return 1 - (1 - p) ** 3;
    case 'power3.out':
      return 1 - (1 - p) ** 4;
    case 'power4.inOut':
      return p < 0.5 ? (2 * p) ** 5 / 2 : 1 - (2 * (1 - p)) ** 5 / 2;
    case 'power3.inOut':
      return p < 0.5 ? (2 * p) ** 4 / 2 : 1 - (2 * (1 - p)) ** 4 / 2;
    case 'sine.out':
      return Math.sin((p * Math.PI) / 2);
    case 'sine.inOut':
      return (1 - Math.cos(p * Math.PI)) / 2;
    case 'expo.out':
      return 1 - 2 ** (-10 * p) * (1 - p) - (1 - p) ** 6 * p;
    default:
      return 1 - (1 - p) ** 5;
  }
}

/** Keep the curtain's overlap consistent with the selected curve's visible pace. */
export function fractalGlassEaseStagger(ease: FractalGlassEase) {
  let low = 0,
    high = 1;
  for (let step = 0; step < 16; step++) {
    const midpoint = (low + high) / 2;
    if (fractalGlassEase(midpoint, ease) < 0.5) low = midpoint;
    else high = midpoint;
  }
  // Smoothstep reaches half visibility at half duration. Faster out curves
  // need closer starts, so the first strip does not finish before others appear.
  return Math.min(1, low + high);
}

/** Snap the panel to the actual texture divisions, including clipped edge strips. */
export function fractalGlassCoverage(
  settings: FractalGlassSettings,
  coverage = settings.coverage,
  roundUp = false,
) {
  const { coverageMode, mode, stripes, textureScale, side, direction } = settings;
  if (coverageMode === 'continuous' || coverage <= 0 || coverage >= 1) return coverage;
  const count = stripes * (mode === 'default' ? 100 / textureScale : 1);
  // Texture UVs ascend from left to right and from bottom to top.
  const fromHigh = (side === 'right') !== (direction === 'horizontal');
  const round = fromHigh !== roundUp ? Math.ceil : Math.floor;
  const epsilon = fromHigh !== roundUp ? -1e-7 : 1e-7;
  const boundary = fromHigh
    ? 1 - round((1 - coverage) * count + epsilon) / count
    : round(coverage * count + epsilon) / count;
  return Math.max(0, Math.min(1, boundary));
}

/** The repeated black-to-white ramp, centered on neutral displacement. */
export function fractalGlassDisplacement(coordinate: number, stripes: number, distortion: number) {
  const phase = coordinate * stripes;
  return (phase - Math.floor(phase) - 0.5) * distortion;
}

/** Period average of the uncentered ray field. Default mode uses UVs; optical uses CSS pixels. */
export function fractalGlassRefractionMean(
  settings: FractalGlassSettings,
  width: number,
  height: number,
  amount: number,
) {
  if (amount === 0) return [0, 0] as const;
  const samples = 256;
  let sum = 0,
    absolute = 0;
  const stripes =
    settings.stripes * (settings.mode === 'default' ? 100 / settings.textureScale : 1);
  const stripeWidth = (settings.direction === 'horizontal' ? height : width) / stripes;
  const sigma = Math.max(0.008, settings.smoothness / Math.max(1, 1080 / stripes));
  const thickness = stripeWidth * 0.42 * settings.relief * amount;
  const profileScale = Math.sqrt(1.035) - Math.sqrt(0.035);
  const eta = 1 / 1.46;
  for (let i = 0; i < samples; i++) {
    const phase = (i + 0.5) / samples;
    let displacement: number;
    if (settings.mode === 'default') {
      let slope = 1;
      for (let k = 1; k <= 12; k++)
        slope -=
          2 *
          Math.cos(2 * Math.PI * k * phase) *
          Math.exp(-2 * Math.PI * Math.PI * k * k * sigma * sigma);
      displacement = (Math.max(-6, Math.min(2, slope)) * settings.distortion * 2 * amount) / 1080;
    } else {
      const across = phase * 2 - 1;
      const root = Math.sqrt(Math.max(0.035, 1.035 - across * across));
      const profile = (root - Math.sqrt(0.035)) / profileScale;
      const height = thickness * (0.14 + 0.86 * profile);
      const slope = (-thickness * 0.86 * 2 * across) / (stripeWidth * root * profileScale);
      const nz = 1 / Math.sqrt(1 + slope * slope),
        nx = -slope * nz;
      const rayScale = -eta * nz + Math.sqrt(1 - eta * eta * (1 - nz * nz));
      const rayX = -rayScale * nx,
        rayZ = -eta - rayScale * nz;
      const ray =
        (rayX / Math.max(0.25, Math.abs(rayZ))) *
        (stripeWidth * 0.22 + height) *
        settings.refraction;
      displacement = (phase - 0.5) * settings.distortion * amount * settings.refraction + ray;
    }
    sum += displacement;
    absolute += Math.abs(displacement);
  }
  return [sum / samples, absolute / samples] as const;
}

/** UV scale for a centered object-fit: cover image; independent of the drawing resolution. */
export function fractalGlassCover(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
) {
  const ratio = width / height / (imageWidth / imageHeight);
  return [Math.min(1, ratio), Math.min(1, 1 / ratio)] as const;
}
