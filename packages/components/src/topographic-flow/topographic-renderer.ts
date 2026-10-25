import { createCanvasGrain } from './topographic-grain';
import { createTopographicSurface, type TopographicSurfaceFactory } from './topographic-surface';
import {
  createElevationField,
  createContourMotionSpline,
  compileContourPath,
  traceContours,
  roundContour,
  type ContourMotionSpline,
} from './topographic-field';
export type TopographicLineStyle = 'solid' | 'mixed' | 'dashed';
export type TopographicHoverEffect = 'spread' | 'swirl' | 'ripple' | 'rings' | 'drag';
/** Two to eight colors ordered from valley to summit. Empty disables the height gradient. */
export type TopographicGradientColors = readonly [string, string, ...string[]] | readonly [];
export type TopographicReliefProperties =
  | 'surfaceColor'
  | 'shadowColor'
  | 'shadowAnimation'
  | 'shadowCycleDuration'
  | 'elevation'
  | 'cameraTilt'
  | 'cameraRotation'
  | 'cameraZoom'
  | 'terraceSoftness'
  | 'lightingBlend'
  | 'lightDirection'
  | 'lightIntensity';

export type TopographicConfig = {
  scale: number;
  density: number;
  speed: number;
  distortion: number;
  lineWidth: number;
  opacity: number;
  dashLength: number;
  dashGap: number;
  seed: number;
  paused: boolean;
  lineColor: string;
  accentColor: string;
  lineStyle: TopographicLineStyle;
  grain?: number;
  gradientColors?: TopographicGradientColors;
  /** Spread neighboring elevation colors across wider transitions, from 0 to 1. */
  gradientDiffusion?: number;
  surfaceColor?: string;
  /** Relief shade color; omitted chooses neutral contrast for the material/theme. */
  shadowColor?: string;
  /** Continuous saturated RGB hue cycle, held by pause/reduced motion/visibility. */
  shadowAnimation?: 'none' | 'rgb';
  /** Duration of a complete shadow hue cycle in visible playback seconds. */
  shadowCycleDuration?: number;
  backgroundColor?: string;
  /** Vertical relief in CSS pixels, 0–240. */
  elevation?: number;
  /** Degrees from the top-down view, 0–60. */
  cameraTilt?: number;
  cameraRotation?: number;
  cameraZoom?: number;
  /** Fraction of each elevation interval occupied by the smooth bevel, 0.08–0.6. */
  terraceSoftness?: number;
  /** 0 keeps the selected plateau color with all-around relief shading; 1 uses directional light. */
  lightingBlend?: number;
  lightDirection?: number;
  lightIntensity?: number;
  /** How strongly the pointer spreads the terrain horizontally, up to 0.9; negative draws it in, 0 disables hover. */
  hover?: number;
  /** Radius of the pointer push in CSS pixels. */
  hoverRadius?: number;
  /**
   * Flat flow only: how the pointer reshapes the contours. 'rings' (default)
   * raises a hill with new contours, 'spread' moves them away, 'swirl' twists
   * them, 'ripple' sends waves out and 'drag' carries them along the motion.
   */
  hoverEffect?: TopographicHoverEffect;
  /** Seconds for the hill to catch up with the pointer (smoothing time constant). */
  hoverFollow?: number;
  /** Seconds for the terrain to return to normal after the pointer leaves (entering follows `hoverFollow`). */
  hoverFade?: number;
};
const clamp = (value: number, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
const gradientLookupIntervals = 4096;

export function createTopographicRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initial: TopographicConfig,
  surfaceFactory?: TopographicSurfaceFactory,
  onReady?: () => void,
) {
  const surface = createTopographicSurface(canvas, host, initial, surfaceFactory, onReady);
  if (surface) return surface;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { update: (_: TopographicConfig) => {}, reset: () => {}, destroy: () => {} };
  let config = initial;
  let elevation = createElevationField(config.seed);
  const resolveColor = (value: string, fallback: string) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.display = 'none';
    host.append(probe);
    const color = probe.style.color ? getComputedStyle(probe).color : fallback;
    probe.remove();
    return color;
  };
  let lineColor = resolveColor(config.lineColor, '#000000'),
    accentColor = resolveColor(config.accentColor, '#000000');
  const resolveGradient = (colors?: TopographicGradientColors) => {
    if (!colors || colors.length < 2) return null;
    const pixel = document.createElement('canvas');
    pixel.width = pixel.height = 1;
    const context = pixel.getContext('2d');
    if (!context) return null;
    context.globalCompositeOperation = 'copy';
    return colors.slice(0, 8).map((value) => {
      context.fillStyle = resolveColor(value, '#000000');
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
  };
  let gradientColors = resolveGradient(config.gradientColors);
  let width = 0,
    height = 0,
    ratio = 1,
    time = 0,
    last = 0,
    frame = 0;
  let grainStamp: HTMLCanvasElement | null = null,
    grainKey = '';
  let inkStamp: HTMLCanvasElement | null = null,
    inkContext: CanvasRenderingContext2D | null = null;
  let gradientStamp: HTMLCanvasElement | null = null,
    gradientContext: CanvasRenderingContext2D | null = null,
    gradientImage: ImageData | null = null,
    gradientKey = '';
  let gradientHeights = new Float32Array(0),
    gradientCosines = new Float32Array(0),
    gradientSines = new Float32Array(0);
  let gradientLookup: Float32Array | null = null,
    gradientLookupKey = '';
  let visible = true,
    destroyed = false;
  let contours: {
    basis: ContourMotionSpline;
    solid: Float64Array;
    broken: Float64Array | null;
    closed: boolean;
    level: number;
  }[] = [];
  const compileDashes = () => {
    const length = clamp(config.dashLength, 1, 50, 7),
      gap = clamp(config.dashGap, 1, 50, 8);
    for (const curve of contours) curve.broken = null;
    if (config.lineStyle === 'solid') return;
    for (const curve of contours) {
      if (config.lineStyle === 'dashed' || curve.level % 4 === 0)
        curve.broken = compileContourPath(curve.basis, length, gap);
    }
  };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shouldAnimate = () =>
    !destroyed &&
    visible &&
    !document.hidden &&
    !motion.matches &&
    !config.paused &&
    config.speed > 0 &&
    width > 0 &&
    height > 0;

  const updateGradientLookup = () => {
    const diffusion = clamp(config.gradientDiffusion ?? 0, 0, 1, 0);
    if (!gradientColors || diffusion === 0) {
      gradientLookup = null;
      gradientLookupKey = '';
      return;
    }
    const key = `${diffusion}:${gradientColors.map((color) => color.join(',')).join(';')}`;
    if (key === gradientLookupKey) return;
    const segments = gradientColors.length - 1,
      transitionWidth = (1 + 3 * diffusion) / segments;
    gradientLookup = new Float32Array((gradientLookupIntervals + 1) * 3);
    for (let sample = 0; sample <= gradientLookupIntervals; sample++) {
      const t = sample / gradientLookupIntervals,
        offset = sample * 3;
      for (let channel = 0; channel < 3; channel++)
        gradientLookup[offset + channel] = gradientColors[0][channel];
      for (let segment = 0; segment < segments; segment++) {
        const center = (segment + 0.5) / segments,
          fraction = Math.min(
            1,
            Math.max(0, (t - center + transitionWidth * 0.5) / transitionWidth),
          ),
          weight = fraction * fraction * (3 - 2 * fraction);
        for (let channel = 0; channel < 3; channel++)
          gradientLookup[offset + channel] +=
            (gradientColors[segment + 1][channel] - gradientColors[segment][channel]) * weight;
      }
    }
    gradientLookupKey = key;
  };
  updateGradientLookup();

  const rebuildGradient = () => {
    if (!gradientColors || !width || !height) return;
    const scale = clamp(config.scale, 80, 1200, 300),
      distortion = clamp(config.distortion, 0, 3, 2.4),
      key = `${width}:${height}:${scale}:${distortion}:${config.seed}`;
    if (gradientKey === key) return;
    // Cache the fallback's own scalar height modes. Frame rendering only
    // mixes these buffers; no noise sampling or contour rebuilding is needed.
    const cell = Math.max(3, Math.sqrt((width * height) / 45000)),
      columns = Math.max(2, Math.ceil(width / cell)),
      rows = Math.max(2, Math.ceil(height / cell)),
      count = columns * rows,
      offset = ((((Math.round(config.seed) * 0.61803398875) % 1) + 1) % 1) * Math.PI * 2;
    gradientStamp = document.createElement('canvas');
    gradientStamp.width = columns;
    gradientStamp.height = rows;
    gradientContext = gradientStamp.getContext('2d');
    if (!gradientContext) return;
    gradientImage = gradientContext.createImageData(columns, rows);
    gradientHeights = new Float32Array(count);
    gradientCosines = new Float32Array(count);
    gradientSines = new Float32Array(count);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const px = (((x + 0.5) / columns) * width) / scale,
          py = (((y + 0.5) / rows) * height) / scale,
          index = y * columns + x;
        gradientHeights[index] = elevation(px, py, 0, distortion);
        gradientCosines[index] = 0.035 * Math.sin(0.3 * px + 0.55 * py + offset + 0.7);
        gradientSines[index] =
          (0.11 + 0.02 * distortion) * (0.7 + 0.3 * Math.cos(0.6 * px - 0.4 * py + offset));
        gradientImage.data[index * 4 + 3] = 255;
      }
    gradientKey = key;
  };

  const rebuild = () => {
    if (!width || !height) return;
    const scale = clamp(config.scale, 80, 1200, 300);
    // Overscan covers the full displacement, so boundary crossings never remesh
    // a curve or change its sampling origin during animation.
    const margin = scale * 0.45,
      spanX = width + margin * 2,
      spanY = height + margin * 2;
    const cell = Math.max(3, Math.sqrt((spanX * spanY) / 60000));
    const columns = Math.max(2, Math.ceil(spanX / cell) + 1),
      rows = Math.max(2, Math.ceil(spanY / cell) + 1);
    const field = new Float32Array(columns * rows);
    const distortion = clamp(config.distortion, 0, 3, 2.4);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        field[y * columns + x] = elevation(
          ((x * spanX) / (columns - 1) - margin) / scale,
          ((y * spanY) / (rows - 1) - margin) / scale,
          0,
          distortion,
        );
      }
    contours = traceContours(
      field,
      columns,
      rows,
      spanX,
      spanY,
      clamp(config.density, 2, 20, 9),
    ).map((curve) => {
      const rounded = {
        ...curve,
        points: roundContour(
          curve.points.map((point) => ({ x: point.x - margin, y: point.y - margin })),
          curve.closed,
          8,
          Math.min(16, Math.max(8, scale * 0.035)),
        ),
      };
      const basis = createContourMotionSpline(rounded, scale, distortion, config.seed, elevation);
      return {
        basis,
        solid: compileContourPath(basis),
        broken: null,
        closed: curve.closed,
        level: curve.level,
      };
    });
    compileDashes();
    rebuildGradient();
  };
  let presented = false;
  const draw = () => {
    if (!width || !height || destroyed) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const pace = (0.18 + 0.27 * Math.log2(1 + Math.max(width, height) / 320)) / 0.63;
    const phase = time * pace * 0.12;
    const cosine = Math.cos(phase) - 1,
      sine = Math.sin(phase);
    const amount = clamp(config.grain ?? 0, 0, 1, 0);
    if (amount > 0) {
      const key = `${width}:${height}:${ratio}:${config.seed}`;
      if (key !== grainKey) {
        grainStamp = createCanvasGrain(width, height, ratio, config.seed);
        grainKey = key;
      }
    }
    if (gradientColors && gradientImage && gradientContext && gradientStamp) {
      const data = gradientImage.data;
      for (let i = 0; i < gradientHeights.length; i++) {
        const altitude = gradientHeights[i] + gradientCosines[i] * cosine + gradientSines[i] * sine,
          t = Math.min(1, Math.max(0, (altitude + 0.65) / 1.3));
        if (gradientLookup) {
          const position = t * gradientLookupIntervals,
            index = Math.min(gradientLookupIntervals - 1, Math.floor(position)),
            fraction = position - index,
            offset = index * 3;
          for (let channel = 0; channel < 3; channel++)
            data[i * 4 + channel] = Math.round(
              gradientLookup[offset + channel] +
                (gradientLookup[offset + 3 + channel] - gradientLookup[offset + channel]) *
                  fraction,
            );
        } else {
          // Diffusion zero retains the original ramp exactly, including its
          // rounding, rather than approximating it with the lookup texture.
          const position = t * (gradientColors.length - 1),
            segment = Math.min(gradientColors.length - 2, Math.floor(position)),
            fraction = position - segment,
            weight = fraction * fraction * (3 - 2 * fraction),
            from = gradientColors[segment],
            to = gradientColors[segment + 1];
          for (let channel = 0; channel < 3; channel++)
            data[i * 4 + channel] = Math.round(
              from[channel] + (to[channel] - from[channel]) * weight,
            );
        }
      }
      gradientContext.putImageData(gradientImage, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(gradientStamp, 0, 0, width, height);
    }
    let contourContext = ctx;
    if (gradientColors && grainStamp && amount > 0) {
      if (!inkStamp) {
        inkStamp = document.createElement('canvas');
        inkContext = inkStamp.getContext('2d');
      }
      if (inkContext) {
        if (inkStamp.width !== canvas.width || inkStamp.height !== canvas.height) {
          inkStamp.width = canvas.width;
          inkStamp.height = canvas.height;
        }
        // White exposure belongs to the opaque height colors. Contour pigment
        // is masked separately so grain never darkens the background or opens
        // holes through its alpha coverage.
        ctx.globalAlpha = amount * 0.36;
        ctx.drawImage(grainStamp, 0, 0, width, height);
        ctx.globalAlpha = 1;
        inkContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        inkContext.clearRect(0, 0, width, height);
        contourContext = inkContext;
      }
    }
    contourContext.lineCap = 'round';
    contourContext.lineJoin = 'round';
    contourContext.setLineDash([]);
    const terraced = !!surfaceFactory,
      lineWidth = clamp(config.lineWidth, 0.25, 5, 1),
      // 3D presets rely on lighting instead of ink. Keep their contours visible
      // when Canvas cannot provide the geometry and shading that replace it.
      opacity = Math.max(terraced ? 0.35 : 0, clamp(config.opacity, 0, 1, 1));
    // Fixed command buffers: no noise, curve fitting, trig per point or
    // transient objects in the animation loop. Only two shared time coefficients.
    const coordinate = (buffer: Float64Array, index: number) =>
      buffer[index] + buffer[index + 2] * cosine + buffer[index + 4] * sine;
    for (const curve of contours) {
      const major = curve.level % 4 === 0;
      contourContext.strokeStyle = major ? accentColor : lineColor;
      contourContext.lineWidth = lineWidth;
      contourContext.globalAlpha = opacity;
      const commands = terraced ? curve.solid : (curve.broken ?? curve.solid);
      contourContext.beginPath();
      for (let i = 0; i < commands.length; i += 25) {
        if (commands[i + 24])
          contourContext.moveTo(coordinate(commands, i), coordinate(commands, i + 1));
        contourContext.bezierCurveTo(
          coordinate(commands, i + 6),
          coordinate(commands, i + 7),
          coordinate(commands, i + 12),
          coordinate(commands, i + 13),
          coordinate(commands, i + 18),
          coordinate(commands, i + 19),
        );
      }
      if (curve.closed && (terraced || !curve.broken)) contourContext.closePath();
      contourContext.stroke();
    }
    contourContext.globalAlpha = 1;
    if (grainStamp && amount > 0) {
      if (!gradientColors || contourContext !== ctx) {
        contourContext.globalCompositeOperation = 'destination-out';
        contourContext.globalAlpha = amount * 0.4;
        contourContext.drawImage(grainStamp, 0, 0, width, height);
        contourContext.globalCompositeOperation = 'source-over';
        contourContext.globalAlpha = 1;
      }
      if (contourContext !== ctx && inkStamp) ctx.drawImage(inkStamp, 0, 0, width, height);
      else {
        ctx.globalAlpha = amount * 0.36;
        ctx.drawImage(grainStamp, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    }
    if (!presented) {
      presented = true;
      onReady?.();
    }
  };
  const tick = (now: number) => {
    frame = 0;
    if (!shouldAnimate()) {
      last = 0;
      return;
    }
    if (last)
      time += Math.min(0.05, Math.max((now - last) / 1000, 0)) * clamp(config.speed, 0, 4, 1.5);
    last = now;
    // Match the display's cadence, like Grain Gradient, without a second gate.
    draw();
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (shouldAnimate()) {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  };
  const resize = () => {
    const changed = width !== host.clientWidth || height !== host.clientHeight;
    width = host.clientWidth;
    height = host.clientHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    if (changed || !contours.length) rebuild();
    draw();
    sync();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
  intersection?.observe(host);
  const onMotion = () => {
    draw();
    sync();
  };
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', resize);
  resize();
  return {
    update(next: TopographicConfig) {
      const changed =
        next.seed !== config.seed ||
        next.scale !== config.scale ||
        next.density !== config.density ||
        next.distortion !== config.distortion;
      if (next.seed !== config.seed) {
        elevation = createElevationField(next.seed);
      }
      const dashChanged =
        next.lineStyle !== config.lineStyle ||
        next.dashLength !== config.dashLength ||
        next.dashGap !== config.dashGap;
      config = next;
      lineColor = resolveColor(config.lineColor, '#000000');
      accentColor = resolveColor(config.accentColor, '#000000');
      gradientColors = resolveGradient(config.gradientColors);
      updateGradientLookup();
      if (changed) rebuild();
      else if (dashChanged) compileDashes();
      rebuildGradient();
      draw();
      sync();
    },
    reset() {
      time = 0;
      last = 0;
      draw();
      sync();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection?.disconnect();
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', resize);
      contours = [];
      grainStamp = null;
      inkStamp = null;
      inkContext = null;
      gradientStamp = null;
      gradientContext = null;
      gradientImage = null;
      gradientLookup = null;
      gradientHeights = gradientCosines = gradientSines = new Float32Array(0);
      canvas.width = canvas.height = 1;
    },
  };
}
