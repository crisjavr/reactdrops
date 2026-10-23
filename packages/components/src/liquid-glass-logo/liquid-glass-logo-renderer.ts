import {
  liquidGlassLogoComposite,
  liquidGlassLogoRender,
  liquidGlassLogoVertex,
} from './liquid-glass-logo-shaders';

export type LiquidGlassLogoTuning = {
  /** Image URL (SVG, PNG, data URL…) for the logo. */
  logo: string;
  /** Image placed before the wordmark: "logo" reuses the logo, an empty string hides it. */
  mark: string;
  text: string;
  /** Reveal the full wordmark, or finish on the original logo alone. */
  ending: 'logo' | 'wordmark';
  /** Lens edge in CSS pixels before fitting. */
  logoSize: number;
  /** Logo width or height as a fraction of the plate edge. */
  logoScale: number;
  /** Resting logo scale; 1 holds its normal size while the glass disappears. */
  finalLogoScale: number;
  /** Draw the logo on an icon plate. */
  tile: boolean;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  /** Canvas font stretch keyword, such as "normal" or "expanded". */
  fontStretch: string;
  /** Letter spacing in em. */
  letterSpacing: number;
  /** Gap between the mark and the text in em. */
  markGap: number;
  /** Color scheme for the logo, plate and background when they are not set. */
  theme: 'dark' | 'light';
  /** Recolor the logo silhouette; "original" keeps the image colors. */
  logoColor: string;
  /** Rounded shading on a recolored logo or wordmark: 0 is flat, 1 is full relief. */
  logoRelief: number;
  textColor: string;
  tileColor: string;
  background: string;
  /** Optical depth as a multiple of the lens edge; deeper glass bends more. */
  depth: number;
  /** Spread between the wavelengths' indices of refraction. */
  dispersion: number;
  /** Intensity of the inset glass back face and its second refracted image. */
  relief: number;
  /** Brightness of light focused onto the artwork by the lens. */
  caustics: number;
  /** Strength of reflections caught by the glass reliefs. */
  highlights: number;
  /** Diffused light around bright glass and image edges. */
  bloom: number;
  /** Initial wordmark lens radius as a fraction of the plate edge. */
  dropSize: number;
  /** Strength of the lens curvature. */
  dropStrength: number;
  /** How much the faint line just outside the rim takes the plate color (0–1). */
  echoTint: number;
  /** 0 draws the full inner wall; 1 keeps it to the upper-left and lower-right corners. */
  innerWallFocus: number;
  /** Seconds for the secondary glass rings to fade. */
  decay: number;
  speed: number;
  loop: boolean;
  /** Seconds the finished wordmark holds before a loop restarts. */
  loopDelay: number;
  paused: boolean;
  maxDpr: number;
};

const noteLogo = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 104"><path fill="#fff" d="M35 24c0-2.6 1.7-4.8 4.2-5.5L79.6 7.6C82.6 6.8 85 9 85 12.1V64c0 8.9-7.3 17-16.5 19.2C59.3 85.4 52 81 52 73.2c0-9 7.5-16.9 16.7-19.1 3.3-.8 6.3-.9 8.3-.2V28.8L43 38.1V77c0 8.9-7.3 17-16.5 19.2C17.3 98.4 10 94 10 86.2c0-9 7.5-16.9 16.7-19.1 3.3-.8 6.3-.9 8.3-.2V24Z"/></svg>',
)}`;

const referenceMark = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
)}`;

export const liquidGlassLogoDefaults: LiquidGlassLogoTuning = {
  logo: noteLogo,
  mark: referenceMark,
  text: 'music',
  ending: 'logo',
  logoSize: 256,
  logoScale: 0.72,
  finalLogoScale: 1,
  tile: true,
  fontSize: 64,
  fontFamily: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontWeight: 850,
  fontStretch: 'expanded',
  letterSpacing: -0.01,
  markGap: 0.12,
  theme: 'dark',
  logoColor: '#ffffff',
  logoRelief: 1,
  textColor: '#e2e6ee',
  tileColor: '#060c18',
  background: '#000000',
  depth: 1.2,
  dispersion: 1,
  relief: 1,
  caustics: 1,
  highlights: 1,
  bloom: 0.55,
  dropSize: 0.32,
  dropStrength: 1,
  echoTint: 0.5,
  innerWallFocus: 0,
  decay: 1.4,
  speed: 1,
  loop: false,
  loopDelay: 1.6,
  paused: false,
  maxDpr: 2,
};

export const liquidGlassLogoNoteLogo = noteLogo;
export const liquidGlassLogoReferenceMark = referenceMark;

/** Length of the scripted sequence at speed 1, in seconds. */
export const liquidGlassLogoDuration = 3.3;
const logoFinishTime = 1.8;

type Keys = readonly (readonly [number, number])[];

/** Smooth curve through [time, value] keys (Catmull-Rom with uneven spacing). */
function track(keys: Keys, t: number) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t1, v1] = keys[i];
  const [t2, v2] = keys[i + 1];
  const [t0, v0] = keys[i - 1] ?? [t1 - (t2 - t1), v1];
  const [t3, v3] = keys[i + 2] ?? [t2 + (t2 - t1), v2];
  const span = t2 - t1;
  const m1 = ((v2 - v0) / (t2 - t0)) * span;
  const m2 = ((v3 - v1) / (t3 - t1)) * span;
  const x = (t - t1) / span;
  const x2 = x * x;
  const x3 = x2 * x;
  return (
    (2 * x3 - 3 * x2 + 1) * v1 + (x3 - 2 * x2 + x) * m1 + (-2 * x3 + 3 * x2) * v2 + (x3 - x2) * m2
  );
}

// Size of the artwork under the glass relative to its resting size, measured from the
// reference: magnified by the young drop, slowly receding as the glass settles, then
// drawn into the second drop. Independent of the artwork itself.
const artworkScale: Keys = [
  [0.12, 1.4],
  [0.33, 1.45],
  [0.46, 1.44],
  [0.63, 1.33],
  [0.79, 1.24],
  [0.96, 1.2],
  [1.13, 1.11],
  [1.25, 1.0],
  [1.335, 0.865],
  [1.376, 0.81],
  [1.418, 0.735],
  [1.46, 0.41],
];

// The second drop, in wordmark half-widths (W) from the reference: its radius, the
// radius of its magnifying core, how slowly its rim stretches the image (1 = not at
// all), the core's center factor (negative inverts) and its edge magnification.
const dropRadius: Keys = [
  [1.46, 0.32],
  [1.55, 0.36],
  [1.67, 0.49],
  [1.75, 0.52],
  [1.84, 0.56],
  [1.92, 0.68],
  [2.0, 0.88],
  [2.15, 0.95],
  [2.4, 1.06],
  [2.95, 1.3],
];
const dropCore: Keys = [
  [1.46, 1.5],
  [1.84, 1.5],
  [1.92, 0.55],
  [2.0, 0.6],
  [2.09, 0.68],
  [2.17, 0.78],
  [2.3, 0.85],
  [2.5, 0.9],
  [2.75, 0.93],
  [2.95, 0.97],
  [3.02, 1.03],
];
const dropStretch: Keys = [
  [1.46, 0.3],
  [1.84, 0.3],
  [2.0, 0.25],
  [2.1, 0.2],
  [2.2, 0.2],
  [2.4, 0.25],
  [2.7, 0.3],
  [2.85, 0.45],
  [2.95, 0.8],
  [3.02, 1],
];
const dropCenter: Keys = [
  [1.46, -0.6],
  [1.6, -0.5],
  [1.75, -0.3],
  [1.8, 0.4],
  [1.84, 1],
];
const dropMagnify: Keys = [
  [1.46, 1.5],
  [1.6, 1.5],
  [1.75, 2.2],
  [1.84, 1.4],
  [1.92, 1.2],
  [2.0, 1.05],
  [2.1, 1],
];
const smooth = (from: number, to: number, value: number) => {
  const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

// Colors measured from the light and dark versions of the reference clip: a pale
// gray page under a slightly cooler frosted plate with near-black ink, and the
// original white ink on a deep blue-black plate.
export const liquidGlassLogoThemes = {
  dark: { logoColor: '#ffffff', textColor: '#e2e6ee', tileColor: '#060c18', background: '#000000' },
  light: {
    logoColor: '#09111b',
    textColor: '#09111b',
    tileColor: '#e4e6ea',
    background: '#e2e2e5',
  },
} as const satisfies Record<LiquidGlassLogoTuning['theme'], Partial<LiquidGlassLogoTuning>>;

export function normalizeLiquidGlassLogo(value: LiquidGlassLogoTuning): LiquidGlassLogoTuning {
  const finite = (input: number, fallback: number, min: number, max: number) =>
    Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback;
  const d = liquidGlassLogoDefaults;
  return {
    ...value,
    ending: value.ending === 'wordmark' ? 'wordmark' : 'logo',
    theme: value.theme === 'light' ? 'light' : 'dark',
    logoSize: finite(value.logoSize, d.logoSize, 24, 1024),
    logoScale: finite(value.logoScale, d.logoScale, 0.1, 1),
    finalLogoScale: finite(value.finalLogoScale, d.finalLogoScale, 0.1, 1),
    fontSize: finite(value.fontSize, d.fontSize, 8, 400),
    fontWeight: finite(value.fontWeight, d.fontWeight, 100, 1000),
    letterSpacing: finite(value.letterSpacing, d.letterSpacing, -0.3, 1),
    markGap: finite(value.markGap, d.markGap, 0, 2),
    depth: finite(value.depth, d.depth, 0, 6),
    dispersion: finite(value.dispersion, d.dispersion, 0, 4),
    relief: finite(value.relief, d.relief, 0, 3),
    caustics: finite(value.caustics, d.caustics, 0, 4),
    highlights: finite(value.highlights, d.highlights, 0, 4),
    bloom: finite(value.bloom, d.bloom, 0, 2),
    dropSize: finite(value.dropSize, d.dropSize, 0.05, 1.5),
    dropStrength: finite(value.dropStrength, d.dropStrength, 0, 4),
    echoTint: finite(value.echoTint, d.echoTint, 0, 1),
    logoRelief: finite(value.logoRelief, d.logoRelief, 0, 1),
    innerWallFocus: finite(value.innerWallFocus, d.innerWallFocus, 0, 1),
    decay: finite(value.decay, d.decay, 0.1, 10),
    speed: finite(value.speed, d.speed, 0.1, 4),
    loopDelay: finite(value.loopDelay, d.loopDelay, 0, 30),
    maxDpr: finite(value.maxDpr, d.maxDpr, 0.5, 4),
  };
}

type Raster = { canvas: HTMLCanvasElement; box: [number, number] };

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(Math.max(2, value)));

function drawTinted(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  if (color === 'original') {
    context.drawImage(image, x, y, width, height);
    return;
  }
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.ceil(width));
  layer.height = Math.max(1, Math.ceil(height));
  const ink = layer.getContext('2d')!;
  ink.drawImage(image, 0, 0, layer.width, layer.height);
  ink.globalCompositeOperation = 'source-in';
  ink.fillStyle = color;
  ink.fillRect(0, 0, layer.width, layer.height);
  context.drawImage(layer, x, y, width, height);
}

function imageSize(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  return { width, height };
}

// A shallow relief follows the uploaded alpha silhouette, rather than any hard-coded
// glyph. A distance transform supplies a rounded shoulder for the diffuse studio light.
function shadeLogo(canvas: HTMLCanvasElement, radius: number, strength: number) {
  if (strength <= 0) return;
  const context = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const distance = new Float32Array(width * height);
  for (let i = 0; i < distance.length; i++) distance[i] = pixels[i * 4 + 3] > 127 ? 1e6 : 0;
  const diagonal = Math.SQRT2;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      distance[i] = Math.min(
        distance[i],
        distance[i - 1] + 1,
        distance[i - width] + 1,
        distance[i - width - 1] + diagonal,
        distance[i - width + 1] + diagonal,
      );
    }
  }
  for (let y = height - 2; y > 0; y--) {
    for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;
      distance[i] = Math.min(
        distance[i],
        distance[i + 1] + 1,
        distance[i + width] + 1,
        distance[i + width - 1] + diagonal,
        distance[i + width + 1] + diagonal,
      );
    }
  }
  for (let i = 0; i < distance.length; i++) {
    const q = Math.max(0, 1 - distance[i] / radius);
    distance[i] = Math.sqrt(Math.max(0, 1 - q * q)) * radius * 0.4;
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!pixels[i * 4 + 3]) continue;
      const nx = (distance[i - 1] - distance[i + 1]) * 0.5;
      const ny = (distance[i - width] - distance[i + width]) * 0.5;
      const diffuse = Math.max(0, (-nx * 0.45 - ny * 0.6 + 0.8) / Math.hypot(nx, ny, 1));
      const shaded = (0.74 + diffuse * 0.26) / (0.74 + 0.8 * 0.26);
      const light = 1 + (shaded - 1) * strength;
      for (let c = 0; c < 3; c++) pixels[i * 4 + c] *= light;
    }
  }
  context.putImageData(image, 0, 0);
}

// The logo fills a square box one plate edge wide.
function rasterLogo(
  image: HTMLImageElement | null,
  tuning: LiquidGlassLogoTuning,
  dpr: number,
): Raster {
  const size = Math.min(2048, nextPowerOfTwo(tuning.logoSize * dpr * 2));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  if (image) {
    const { width, height } = imageSize(image);
    const fit = (size * tuning.logoScale) / Math.max(width, height);
    const w = width * fit;
    const h = height * fit;
    drawTinted(context, image, (size - w) / 2, (size - h) / 2, w, h, tuning.logoColor);
  }
  if (image && tuning.logoColor !== 'original') {
    shadeLogo(canvas, canvas.width * 0.03, tuning.logoRelief);
  }
  return { canvas, box: [tuning.logoSize, tuning.logoSize] };
}

function font(tuning: LiquidGlassLogoTuning) {
  return `${tuning.fontWeight} ${tuning.fontSize}px ${tuning.fontFamily}`;
}

// The wordmark box is padded so refracted rays sample transparent texels past its edges.
function rasterText(mark: HTMLImageElement | null, tuning: LiquidGlassLogoTuning, dpr: number) {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font(tuning);
  probe.fontStretch = tuning.fontStretch as CanvasFontStretch;
  const spacing = tuning.letterSpacing * tuning.fontSize;
  probe.letterSpacing = `${spacing}px`;
  // Shape the whole string: per-character drawing loses kerning, ligatures and Arabic joining.
  const textWidth = Math.max(0, probe.measureText(tuning.text).width);
  const metrics = probe.measureText(tuning.text || 'x');
  const ascent = metrics.actualBoundingBoxAscent || tuning.fontSize * 0.72;
  const descent = metrics.actualBoundingBoxDescent || tuning.fontSize * 0.2;
  const xHeight = probe.measureText('x').actualBoundingBoxAscent || tuning.fontSize * 0.52;
  let markWidth = 0;
  let markHeight = 0;
  if (mark) {
    const { width, height } = imageSize(mark);
    markHeight = Math.max(ascent, xHeight * 1.3);
    markWidth = (width / height) * markHeight;
  }
  const gap = mark && tuning.text.length ? tuning.markGap * tuning.fontSize : 0;
  const contentWidth = markWidth + gap + textWidth;
  const pad = tuning.fontSize * 0.5;
  const box: [number, number] = [contentWidth + pad * 2, tuning.fontSize * 2];
  const scale = Math.min(dpr * 2, 4096 / box[0], 4096 / box[1]);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(4096, nextPowerOfTwo(box[0] * scale));
  canvas.height = Math.min(4096, nextPowerOfTwo(box[1] * scale));
  const context = canvas.getContext('2d')!;
  context.scale(canvas.width / box[0], canvas.height / box[1]);
  // Center the ink box vertically.
  const baseline = box[1] / 2 + (ascent - descent) / 2;
  let x = pad;
  if (mark) {
    const color = tuning.logoColor === 'original' ? 'original' : tuning.textColor;
    drawTinted(context, mark, x, baseline - markHeight, markWidth, markHeight, color);
    x += markWidth + gap;
  }
  context.font = font(tuning);
  context.fontStretch = tuning.fontStretch as CanvasFontStretch;
  context.fillStyle = tuning.textColor;
  context.textBaseline = 'alphabetic';
  context.letterSpacing = `${spacing}px`;
  context.textAlign = 'left';
  context.fillText(tuning.text, x, baseline);
  if (tuning.logoColor !== 'original') {
    shadeLogo(canvas, (tuning.fontSize * 0.04 * canvas.height) / box[1], tuning.logoRelief);
  }
  return { canvas, box, contentWidth };
}

function parseColor(value: string): [number, number, number] {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  const hex = String(probe.fillStyle);
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const parts = hex.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

export type LiquidGlassLogoRenderer = {
  update: (tuning: LiquidGlassLogoTuning) => void;
  replay: () => void;
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
  dispose: () => void;
};

export function createLiquidGlassLogoRenderer(
  canvas: HTMLCanvasElement,
  initial: LiquidGlassLogoTuning,
  onReady?: () => void,
): LiquidGlassLogoRenderer | null {
  const gl = canvas.getContext('webgl2', {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
  });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message ?? 'Liquid Glass Logo shader failed to compile.');
    }
    return shader;
  };
  const link = (fragment: string) => {
    const result = gl.createProgram()!;
    const vertex = compile(gl.VERTEX_SHADER, liquidGlassLogoVertex);
    const pixel = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(result, vertex);
    gl.attachShader(result, pixel);
    gl.bindAttribLocation(result, 0, 'aPosition');
    gl.linkProgram(result);
    gl.deleteShader(vertex);
    gl.deleteShader(pixel);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(result);
      gl.deleteProgram(result);
      throw new Error(message ?? 'Liquid Glass Logo program failed to link.');
    }
    return result;
  };
  const program = link(liquidGlassLogoRender);
  const composite = link(liquidGlassLogoComposite);
  const compositeUniform = Object.fromEntries(
    [
      'uScene',
      'uResolution',
      'uDpr',
      'uUnit',
      'uSettle',
      'uBloom',
      'uTime',
      'uFinish',
      'uPageLight',
    ].map((name) => [name, gl.getUniformLocation(composite, name)]),
  );
  const locations = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name)!;
  };
  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const texture = () => {
    const value = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, value);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return value;
  };
  const logoTexture = texture();
  const textTexture = texture();
  const sceneTexture = texture();
  const sceneFramebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let sceneWidth = 0;
  let sceneHeight = 0;
  const resizeScene = () => {
    if (sceneWidth === canvas.width && sceneHeight === canvas.height) return;
    sceneWidth = canvas.width;
    sceneHeight = canvas.height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      sceneWidth,
      sceneHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  };
  const upload = (value: WebGLTexture, source: HTMLCanvasElement) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, value);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  let tuning = initial;
  let dpr = 1;
  let width = 1;
  let height = 1;
  let textBox: [number, number] = [1, 1];
  let textWidth = 0;
  let loaded = false;
  let disposed = false;
  let rasterKey = '';
  let rasterVersion = 0;
  let logoCache: { key: string; raster: Raster } | null = null;
  let clock = 0;
  let last = 0;
  let playing = !initial.paused;
  let visible = true;
  let frame = 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const fit = () =>
    Math.min(
      1,
      // Reserve room for the side reflections as they travel away from the plate.
      width / Math.max(tuning.logoSize * 1.9, tuning.ending === 'wordmark' ? textWidth * 1.22 : 0),
      height / (tuning.logoSize * 1.5),
    );
  const draw = () => {
    if (!loaded || disposed) return;
    const scale = fit();
    resizeScene();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(quad);
    [logoTexture, textTexture].forEach((value, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, value);
    });
    gl.uniform1i(uniform('uLogo'), 0);
    gl.uniform1i(uniform('uText'), 1);
    gl.uniform2f(uniform('uResolution'), canvas.width, canvas.height);
    gl.uniform1f(uniform('uDpr'), canvas.width / width);
    gl.uniform1f(uniform('uUnit'), tuning.logoSize * scale);
    // The logo always occupies one plate edge. Its bounds must follow the
    // current size immediately, even while a sharper texture loads asynchronously.
    gl.uniform2f(uniform('uLogoBox'), tuning.logoSize * scale, tuning.logoSize * scale);
    gl.uniform2f(uniform('uTextBox'), textBox[0] * scale, textBox[1] * scale);
    gl.uniform1f(uniform('uTextWidth'), textWidth * scale);
    const finishTime = tuning.ending === 'logo' ? logoFinishTime : liquidGlassLogoDuration;
    const sequenceTime = reduced?.matches ? finishTime : clock;
    const displayTime =
      tuning.ending === 'logo' ? Math.min(logoFinishTime, sequenceTime) : sequenceTime;
    gl.uniform1f(uniform('uTime'), displayTime);
    gl.uniform1f(uniform('uWordmarkEnabled'), tuning.ending === 'wordmark' ? 1 : 0);
    const settle =
      tuning.ending === 'logo' ? Math.max(0, Math.min(1, (sequenceTime - 1.16) / (1.4 - 1.16))) : 0;
    // The wordmark drop scales with the measured wordmark so any text gets the same optics.
    const unitPx = tuning.logoSize * scale;
    const reach = Math.max((textWidth * scale) / 2, unitPx * 0.3);
    const t = displayTime;
    const settleWaves = 1 - smooth(2.85, 3.02, t);
    gl.uniform4f(
      uniform('uDrop'),
      reach * track(dropRadius, t),
      reach * track(dropCore, t),
      Math.max(0.02, Math.min(1, track(dropStretch, t))),
      1 + (track(dropCenter, t) - 1) * tuning.dropStrength,
    );
    gl.uniform4f(
      uniform('uDropLens'),
      1 + (track(dropMagnify, t) - 1) * tuning.dropStrength,
      2 + 4 * smooth(1.74, 1.84, t),
      unitPx *
        (0.009 * Math.exp(-Math.max(t - 1.46, 0) / 0.5) * (1 - smooth(1.85, 1.95, t)) +
          0.012 * smooth(2.2, 2.4, t)) *
        settleWaves,
      unitPx * (0.07 + (0.03 - 0.07) * smooth(1.9, 2.4, t)),
    );
    gl.uniform4f(
      uniform('uDropWave'),
      (t - 1.45) * 42,
      1 - smooth(1.85, 2.0, t),
      2 * (0.12 + 1.6 * smooth(1.86, 2.0, t) - 0.9 * smooth(2.25, 2.5, t)) * settleWaves,
      0,
    );
    const artworkSettle = smooth(1.13, 1.28, sequenceTime);
    const artScale =
      tuning.ending === 'logo' && sequenceTime > 1.13
        ? track(artworkScale, 1.13) * (1 - artworkSettle) + tuning.finalLogoScale * artworkSettle
        : track(artworkScale, displayTime);
    gl.uniform1f(uniform('uArtScale'), artScale);
    // The logo reaches its resting size first, then holds while the glass clears.
    gl.uniform1f(uniform('uSettle'), settle);
    gl.uniform3fv(uniform('uTile'), parseColor(tuning.tileColor));
    const [pageR, pageG, pageB] = parseColor(tuning.background);
    const pageLuma = 0.299 * pageR + 0.587 * pageG + 0.114 * pageB;
    const pageLight = Math.min(1, Math.max(0, (pageLuma - 0.35) / 0.4));
    gl.uniform1f(uniform('uPageLight'), pageLight);
    gl.uniform1f(uniform('uTileEnabled'), tuning.tile ? 1 : 0);
    gl.uniform1f(uniform('uDepth'), tuning.depth);
    gl.uniform1f(uniform('uDispersion'), tuning.dispersion);
    gl.uniform1f(uniform('uRelief'), tuning.relief);
    gl.uniform1f(uniform('uCaustics'), tuning.caustics);
    gl.uniform1f(uniform('uHighlights'), tuning.highlights);
    gl.uniform1f(uniform('uEchoTint'), tuning.echoTint);
    gl.uniform1f(uniform('uInnerWallFocus'), tuning.innerWallFocus);
    gl.uniform1f(uniform('uDropSize'), tuning.dropSize);
    gl.uniform1f(uniform('uDropStrength'), tuning.dropStrength);
    gl.uniform1f(uniform('uDecay'), tuning.decay);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // A mip pyramid supplies soft light at several scales without a costly blur kernel.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(compositeUniform.uScene, 0);
    gl.uniform2f(compositeUniform.uResolution, canvas.width, canvas.height);
    gl.uniform1f(compositeUniform.uDpr, canvas.width / width);
    gl.uniform1f(compositeUniform.uUnit, unitPx);
    gl.uniform1f(compositeUniform.uSettle, settle);
    gl.uniform1f(compositeUniform.uBloom, tuning.bloom);
    gl.uniform1f(compositeUniform.uPageLight, pageLight);
    gl.uniform1f(compositeUniform.uTime, displayTime);
    gl.uniform1f(
      compositeUniform.uFinish,
      tuning.ending === 'logo'
        ? Math.max(0, Math.min(1, (sequenceTime - 1.05) / (logoFinishTime - 1.05)))
        : Math.max(0, Math.min(1, (sequenceTime - 2.8) / (liquidGlassLogoDuration - 2.8))),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const raster = async () => {
    const key = JSON.stringify([
      tuning.logo,
      tuning.mark,
      tuning.text,
      tuning.logoSize,
      tuning.logoScale,
      tuning.fontSize,
      tuning.fontFamily,
      tuning.fontWeight,
      tuning.fontStretch,
      tuning.letterSpacing,
      tuning.markGap,
      tuning.logoColor,
      tuning.logoRelief,
      tuning.textColor,
      dpr,
    ]);
    if (key === rasterKey) return;
    rasterKey = key;
    const version = ++rasterVersion;
    // Snapshot the options: a late image or font load must never rasterize newer props.
    const options = { ...tuning };
    const markSource = options.mark === 'logo' ? options.logo : options.mark;
    const [logo, mark] = await Promise.all([
      loadImage(options.logo),
      markSource === options.logo ? null : loadImage(markSource),
      document.fonts?.load(font(options), options.text || 'x').catch(() => undefined),
    ]);
    if (disposed || version !== rasterVersion) return;
    const markImage = markSource === options.logo ? logo : mark;
    const logoKey = JSON.stringify([
      options.logo,
      options.logoSize,
      options.logoScale,
      options.logoColor,
      options.logoRelief,
      dpr,
    ]);
    const logoRaster =
      logoCache?.key === logoKey ? logoCache.raster : rasterLogo(logo, options, dpr);
    logoCache = { key: logoKey, raster: logoRaster };
    const textRaster = rasterText(markSource ? markImage : null, options, dpr);
    upload(logoTexture, logoRaster.canvas);
    upload(textTexture, textRaster.canvas);
    textBox = textRaster.box;
    textWidth = textRaster.contentWidth;
    if (!loaded) {
      loaded = true;
      last = 0;
      onReady?.();
    }
    draw();
    request();
  };

  const tick = (now: number) => {
    frame = 0;
    const delta = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const moving = playing && visible && !reduced?.matches && loaded;
    if (moving) {
      clock += delta * tuning.speed;
      const cycle =
        (tuning.ending === 'logo' ? logoFinishTime : liquidGlassLogoDuration) + tuning.loopDelay;
      if (tuning.loop && clock >= cycle) clock %= cycle;
    }
    draw();
    if (
      moving &&
      (tuning.loop || clock < (tuning.ending === 'logo' ? logoFinishTime : liquidGlassLogoDuration))
    )
      request();
    else last = 0;
  };
  function request() {
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  }

  const resize = () => {
    // CSS transforms can move and scale the preview without changing its layout.
    // Keep WebGL coordinates tied to that layout throughout the animation.
    const style = getComputedStyle(canvas);
    width = Math.max(1, Number.parseFloat(style.width) || canvas.clientWidth);
    height = Math.max(1, Number.parseFloat(style.height) || canvas.clientHeight);
    const nextDpr = Math.min(window.devicePixelRatio || 1, tuning.maxDpr);
    canvas.width = Math.max(1, Math.round(width * nextDpr));
    canvas.height = Math.max(1, Math.round(height * nextDpr));
    if (nextDpr !== dpr) {
      dpr = nextDpr;
      void raster();
    }
    draw();
    request();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    last = 0;
    if (visible) request();
  });
  visibility.observe(canvas);
  const onMotion = () => {
    last = 0;
    request();
  };
  reduced?.addEventListener?.('change', onMotion);
  resize();
  void raster();

  return {
    update(next) {
      const wasPlaying = playing;
      tuning = next;
      playing = !next.paused;
      if (!wasPlaying && playing) last = 0;
      resize();
      void raster();
    },
    replay() {
      clock = 0;
      last = 0;
      draw();
      request();
    },
    seek(seconds) {
      clock = Number.isFinite(seconds) ? Math.max(0, Math.min(3600, seconds)) : 0;
      last = 0;
      draw();
    },
    pause() {
      playing = false;
      last = 0;
    },
    play() {
      playing = true;
      last = 0;
      request();
    },
    dispose() {
      disposed = true;
      logoCache = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      reduced?.removeEventListener?.('change', onMotion);
      gl.deleteTexture(logoTexture);
      gl.deleteTexture(textTexture);
      gl.deleteTexture(sceneTexture);
      gl.deleteFramebuffer(sceneFramebuffer);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(quad);
      gl.deleteProgram(program);
      gl.deleteProgram(composite);
    },
  };
}
