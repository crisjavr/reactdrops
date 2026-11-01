import {
  soapBubbleFilmMax,
  soapBubbleFilmSize,
  soapBubbleFragment,
  soapBubbleNoisePeriod,
  soapBubbleNoiseSize,
  soapBubbleSpectralSamples,
  soapBubbleVertex,
} from './soap-bubble-shaders';

// Every surface on the page draws through one WebGL context: browsers allow
// only a handful, and a menu or toolbar would run out. Each surface renders
// into the shared canvas and copies its pixels into its own 2D canvas.

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
function filmTable() {
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

/**
 * Tiling 3D gradient noise (Perlin, quintic fade) sampled on a grid, for the
 * film's swirls. Gradients wrap every soapBubbleNoisePeriod cells.
 */
function noiseVolume() {
  const period = soapBubbleNoisePeriod;
  const size = soapBubbleNoiseSize;
  let state = 0x2545f491;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const gradients = new Float64Array(period ** 3 * 3);
  for (let index = 0; index < gradients.length; index += 3) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    gradients[index] = r * Math.cos(angle);
    gradients[index + 1] = r * Math.sin(angle);
    gradients[index + 2] = z;
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  // The grid is the same on every axis, so each sample's wrapped cell, offset
  // from either corner and fade weight is worked out once per coordinate:
  // two entries per coordinate, for the near and the far corner.
  const step = period / size;
  const cells = new Int32Array(size * 2);
  const offsets = new Float64Array(size * 2);
  const weights = new Float64Array(size * 2);
  for (let n = 0; n < size; n++) {
    const p = n * step;
    const cell = Math.floor(p);
    const f = p - cell;
    const u = fade(f);
    for (let o = 0; o < 2; o++) {
      cells[n * 2 + o] = (((cell + o) % period) + period) % period;
      offsets[n * 2 + o] = f - o;
      weights[n * 2 + o] = o ? u : 1 - u;
    }
  }
  const volume = new Uint8Array(size ** 3);
  let index = 0;
  for (let k = 0; k < size; k++)
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        let value = 0;
        for (let corner = 0; corner < 8; corner++) {
          const x = i * 2 + (corner & 1);
          const y = j * 2 + ((corner >> 1) & 1);
          const z = k * 2 + ((corner >> 2) & 1);
          const g = 3 * (cells[x] + period * (cells[y] + period * cells[z]));
          const dot =
            gradients[g] * offsets[x] +
            gradients[g + 1] * offsets[y] +
            gradients[g + 2] * offsets[z];
          value += dot * (weights[x] * weights[y] * weights[z]);
        }
        volume[index++] = Math.round(Math.min(1, Math.max(0, 0.5 + 0.5 * value * 1.6)) * 255);
      }
  return volume;
}

const uniformNames = [
  'uCenter',
  'uRadius',
  'uExtent',
  'uCorner',
  'uBevel',
  'uModeBasis',
  'uSquash',
  'uTime',
  'uFlow',
  'uThickness',
  'uIridescence',
  'uDrainage',
  'uSwirl',
  'uOilCoverage',
  'uOilOpacity',
  'uOilEdge',
  'uOilLarge',
  'uOilFade',
  'uClearCenter',
  'uTint',
  'uSoapColor',
  'uCustomSoapPalette',
  'uSoapPaletteRed',
  'uSoapPaletteGold',
  'uSoapPaletteGreen',
  'uSoapPaletteCyan',
  'uSoapPaletteBlue',
  'uSoapPaletteViolet',
  'uSoapShadeColor',
  'uSoapHighlightColor',
  'uLightTheme',
  'uWindowLight',
  'uKeyLight',
  'uWindowTwin',
  'uWindowWidth',
  'uWindowGradient',
  'uTopFade',
  'uTopTail',
  'uTopLength',
  'uWindowHead',
  'uWindowTail',
  'uGlintShape',
  'uGlintSize',
  'uGlintIntensity',
  'uGlintOffset',
  'uWindowStyle',
  'uWindowLength',
  'uWindowMargin',
  'uWindowBend',
  'uWindowSize',
  'uWindowIntensity',
  'uTwinShape',
  'uSpark',
  'uBottomShade',
  'uShadeColor',
  'uFilmScale',
  'uReflectivity',
  'uMirage',
  'uSeeThrough',
  'uCoveredBend',
  'uHasCovered',
  'uFloorLight',
  'uReach',
  'uRefraction',
  'uGlass',
  'uDispersion',
  'uSeed',
  'uEnvironment',
  'uEnvRotation',
  'uBackdrop',
  'uHasBackdrop',
  'uBackdropOrigin',
  'uBackdropScale',
  'uBackdropSize',
  'uHasLayer',
  'uLayerRect',
  'uLayerCorner',
  'uLayerFill',
  'uLayerTrack',
  'uLayerFrom',
  'uLayerTo',
] as const;

export type SoapBubbleUniform = (typeof uniformNames)[number];

type Location = WebGLUniformLocation | null;
export type SoapBubbleUniforms = {
  f1: (location: Location, x: number) => void;
  f2: (location: Location, x: number, y: number) => void;
  f4: (location: Location, x: number, y: number, z: number, w: number) => void;
  v4: (location: Location, value: ArrayLike<number>) => void;
  i1: (location: Location, value: number) => void;
  m3: (location: Location, value: ArrayLike<number>) => void;
};

function uniformSetters(gl: WebGL2RenderingContext): SoapBubbleUniforms {
  // The last values sent per location; NaN never matches, so the first
  // value always goes through.
  const sent = new Map<WebGLUniformLocation, Float64Array>();
  const held = (location: WebGLUniformLocation, size: number) => {
    let values = sent.get(location);
    if (!values) sent.set(location, (values = new Float64Array(size).fill(Number.NaN)));
    return values;
  };
  const f4 = (location: Location, x: number, y: number, z: number, w: number) => {
    if (!location) return;
    const v = held(location, 4);
    if (v[0] === x && v[1] === y && v[2] === z && v[3] === w) return;
    v[0] = x;
    v[1] = y;
    v[2] = z;
    v[3] = w;
    gl.uniform4f(location, x, y, z, w);
  };
  return {
    f1(location, x) {
      if (!location) return;
      const v = held(location, 1);
      if (v[0] === x) return;
      v[0] = x;
      gl.uniform1f(location, x);
    },
    f2(location, x, y) {
      if (!location) return;
      const v = held(location, 2);
      if (v[0] === x && v[1] === y) return;
      v[0] = x;
      v[1] = y;
      gl.uniform2f(location, x, y);
    },
    f4,
    v4: (location, value) => f4(location, value[0], value[1], value[2], value[3]),
    i1(location, value) {
      if (!location) return;
      const v = held(location, 1);
      if (v[0] === value) return;
      v[0] = value;
      gl.uniform1i(location, value);
    },
    m3(location, value) {
      if (!location) return;
      const v = held(location, 9);
      let same = true;
      for (let i = 0; i < 9; i++)
        if (v[i] !== value[i]) {
          same = false;
          v[i] = value[i];
        }
      if (!same) gl.uniformMatrix3fv(location, false, Array.from(value));
    },
  };
}

export type SoapBubbleRect = { x: number; y: number; width: number; height: number };

export type SoapBubbleContext = {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  u: Record<SoapBubbleUniform, WebGLUniformLocation | null>;
  /**
   * Uniform setters that skip a value the program already holds. Every
   * surface draws with the one program, and most of a draw's values (its
   * whole material, when surfaces share one) repeat those of the draw
   * before, so most calls never reach the driver.
   */
  set: SoapBubbleUniforms;
  /**
   * Reserves a region of the shared drawing buffer for one draw of this size
   * and points the viewport at it. Returns where the draw's bottom-left
   * corner lands, which it adds to its gl_FragCoord-based centre. With part,
   * only that rectangle of the draw (CSS-style, from the top left) is shaded
   * and later replaced; the rest of the surface's canvas keeps its pixels.
   */
  begin: (width: number, height: number, part?: SoapBubbleRect | null) => [number, number];
  /**
   * Queues the last draw for its surface's own canvas; see flush. A context
   * that draws in its surface's canvas has nothing to hand over.
   */
  present: (surface: CanvasRenderingContext2D | null) => void;
  emptyTexture: WebGLTexture;
  /** Present queued surfaces immediately when composed inside another canvas. */
  flush: () => void;
  /**
   * True once the program has linked. A paced context links on the driver's
   * own thread, and its surfaces wait for it instead of the page.
   */
  ready: () => boolean;
  /** Frames handed over that the GPU has not finished drawing yet. */
  inFlight: (now: number) => number;
};

let shared: SoapBubbleContext | null | undefined;

// Every surface over one backdrop asks for its box in the same task; the
// box is read once and forgotten when the task's draws are handed over.
const rects = new Map<Element, DOMRect>();
export function frameRect(element: Element) {
  let rect = rects.get(element);
  if (!rect) rects.set(element, (rect = element.getBoundingClientRect()));
  return rect;
}

export function soapBubbleContext(): SoapBubbleContext | null {
  if (shared === undefined) shared = createSoapBubbleContext(soapBubbleFragment, { paced: true });
  return shared;
}

// In iOS Safari a copy out of the shared buffer reads that buffer back from
// the GPU, which a surface that animates whole (a menu opening) pays on
// every frame. There each surface draws in its own canvas with a context of
// its own instead, so nothing is copied.
const ownContexts =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// WebKit keeps 16 WebGL contexts on a page and fails past that, counting a
// released context until it is collected. Surfaces take at most 12 of those
// still alive, leaving the page room for its own; any more share the one
// context as everywhere else.
const ownContextLimit = 12;
const ownContextsInUse = new Map<HTMLCanvasElement, SoapBubbleContext>();
let ownContextsAlive = 0;
const ownContextCollected =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<null>(() => {
        ownContextsAlive--;
      })
    : null;

function releaseOwnContext(canvas: HTMLCanvasElement) {
  const context = ownContextsInUse.get(canvas);
  if (!context) return;
  ownContextsInUse.delete(canvas);
  for (const entry of backdrops.values()) entry.uploads.delete(context.gl);
  context.gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * The context a surface drawing in canvas should use: its own where that
 * pays and the limit allows, otherwise null for the shared one. A canvas
 * keeps the context it was first given, so a surface mounted on it again
 * (as React does in development) takes that context back.
 */
export function soapBubbleOwnContext(canvas: HTMLCanvasElement): SoapBubbleContext | null {
  if (!ownContexts) return null;
  const existing = ownContextsInUse.get(canvas);
  if (existing) return existing;
  for (const used of ownContextsInUse.keys()) if (!used.isConnected) releaseOwnContext(used);
  if (ownContextsAlive >= ownContextLimit) return null;
  const context = createSoapBubbleContext(soapBubbleFragment, { surface: canvas });
  if (!context) return null;
  ownContextsInUse.set(canvas, context);
  ownContextsAlive++;
  ownContextCollected?.register(context.gl, null);
  return context;
}

/** Frees the own context of a surface whose canvas has left the page. */
export function releaseSoapBubbleOwnContext(canvas: HTMLCanvasElement) {
  // React removes the canvas before it runs the effect's cleanup; a canvas
  // still on the page is mounted again.
  window.setTimeout(() => {
    if (!canvas.isConnected) releaseOwnContext(canvas);
  });
}

/** Same Bubble UI optics and resources, with an optional custom outline shader. */
export function createSoapBubbleContext(
  fragmentSource = soapBubbleFragment,
  {
    paced = false,
    surface,
  }: {
    paced?: boolean;
    /** A surface's own canvas, to draw in directly. */
    surface?: HTMLCanvasElement;
  } = {},
): SoapBubbleContext | null {
  // Off screen where possible, so the shared buffer is never composited.
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    surface ??
    (typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(1024, 512)
      : Object.assign(document.createElement('canvas'), { width: 1024, height: 512 }));
  const gl = canvas.getContext('webgl2', {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
    // The shared context shades every frame's regions afresh, so its buffer
    // need not be kept between frames. In its own canvas, a surface's resting
    // outline stays from the last whole draw.
    preserveDrawingBuffer: !paced || Boolean(surface),
  });
  if (!gl) return null;
  // The driver compiles and links on its own thread while the lookup tables
  // are built here; nothing asks for the result until both are done. Paced,
  // the surfaces then ask each frame whether it is done rather than wait.
  const parallel = paced || surface ? gl.getExtension('KHR_parallel_shader_compile') : null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  const vertex = compile(gl.VERTEX_SHADER, soapBubbleVertex);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The film table lives on unit 1 for good; backdrops take unit 0.
  const film = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, film);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    soapBubbleFilmSize[0],
    soapBubbleFilmSize[1],
    0,
    gl.RGBA,
    gl.FLOAT,
    filmTable(),
  );
  // Noise on unit 2.
  const noise = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_3D, noise);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
    gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.R8,
    soapBubbleNoiseSize,
    soapBubbleNoiseSize,
    soapBubbleNoiseSize,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    noiseVolume(),
  );
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.activeTexture(gl.TEXTURE0);

  const u = {} as SoapBubbleContext['u'];
  let linked = false;
  let failed = false;
  const link = () => {
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message =
        [vertex, fragment]
          .map((shader) =>
            gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? '' : gl.getShaderInfoLog(shader),
          )
          .find(Boolean) || gl.getProgramInfoLog(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
      throw new Error(message || 'Soap Bubble program failed to link.');
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    for (const name of uniformNames) u[name] = gl.getUniformLocation(program, name);
    gl.uniform1i(u.uBackdrop, 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uFilmTable'), 1);
    gl.uniform1i(gl.getUniformLocation(program, 'uNoise'), 2);
    gl.uniform1i(gl.getUniformLocation(program, 'uCovered'), 3);
    linked = true;
  };
  if (!parallel) link();

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const emptyTexture = createBackdropTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.generateMipmap(gl.TEXTURE_2D);

  const context: SoapBubbleContext = {
    gl,
    canvas,
    u,
    set: uniformSetters(gl),
    emptyTexture,
    flush: () => flush(),
    ready() {
      if (linked) return true;
      if (failed || !gl.getProgramParameter(program, parallel!.COMPLETION_STATUS_KHR)) return false;
      try {
        link();
      } catch {
        failed = true;
      }
      return linked;
    },
    inFlight(now) {
      while (fences.length) {
        const status = gl.isContextLost()
          ? gl.SIGNALED
          : gl.getSyncParameter(fences[0].sync, gl.SYNC_STATUS);
        if (status !== gl.SIGNALED) break;
        const done = fences.shift()!;
        gl.deleteSync(done.sync);
        gpuDone(now - done.at);
      }
      return fences.length;
    },
    begin(width, height, part) {
      if (surface) {
        gl.viewport(0, 0, width, height);
        if (part) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(part.x, height - part.y - part.height, part.width, part.height);
        } else gl.disable(gl.SCISSOR_TEST);
        return [0, 0];
      }
      const rect = part ?? { x: 0, y: 0, width, height };
      const [x, y] = reserve(rect.width, rect.height);
      // The draw is placed so that its part falls on the reserved region.
      const originX = x - rect.x;
      const originY = y - (height - rect.y - rect.height);
      gl.viewport(originX, originY, width, height);
      // The shader writes every pixel it covers, so nothing is cleared.
      if (part) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x, y, rect.width, rect.height);
      } else gl.disable(gl.SCISSOR_TEST);
      queued = { x, y, width: rect.width, height: rect.height, left: rect.x, top: rect.y };
      return [originX, originY];
    },
    present(target) {
      if (target) pending.push({ target, ...queued });
      if (!flushQueued) {
        flushQueued = true;
        // Every surface drawn in this task shares one hand-over.
        queueMicrotask(flush);
      }
    },
  };

  // The frame's draws are packed side by side into the shared buffer, in
  // shelves from the bottom, and handed to their canvases together: one GPU
  // read-back a frame instead of one per surface.
  type Region = { x: number; y: number; width: number; height: number; left: number; top: number };
  const pending: (Region & { target: CanvasRenderingContext2D })[] = [];
  const atlas = { x: 0, y: 0, shelf: 0, right: 0 };
  // That read-back takes the whole buffer, in Safari at a cost that follows
  // its area rather than the regions drawn: a buffer grown for one menu
  // opening slowed every frame after it. So the buffer is kept to what the
  // frames use, grown to fit the frame that overflowed it and shrunk once
  // the frames of the last two seconds or so all needed far less.
  const used = { width: 0, height: 0, frames: 0 };
  const fit = (width: number, height: number) => {
    const round = (size: number) => Math.min(8192, Math.max(64, Math.ceil(size / 64) * 64));
    if (canvas.width !== round(width)) canvas.width = round(width);
    if (canvas.height !== round(height)) canvas.height = round(height);
  };
  let queued: Region = { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 };
  let flushQueued = false;
  // A paced context marks the end of each frame's draws, to learn when the
  // GPU is through with them.
  const fences: { sync: WebGLSync; at: number }[] = [];
  const reserve = (width: number, height: number): [number, number] => {
    if (atlas.x + width > canvas.width) {
      atlas.x = 0;
      atlas.y += atlas.shelf;
      atlas.shelf = 0;
    }
    if (atlas.y + height > canvas.height || width > canvas.width) {
      // Full: hand over what is drawn, then grow so a frame like this fits.
      const need = atlas.y + height;
      flush();
      fit(Math.max(canvas.width, width), Math.max(canvas.height, need));
    }
    const at: [number, number] = [atlas.x, atlas.y];
    atlas.x += width;
    atlas.shelf = Math.max(atlas.shelf, height);
    atlas.right = Math.max(atlas.right, atlas.x);
    return at;
  };
  const flush = () => {
    flushQueued = false;
    rects.clear();
    const usedWidth = atlas.right;
    const usedHeight = atlas.y + atlas.shelf;
    atlas.x = 0;
    atlas.y = 0;
    atlas.shelf = 0;
    atlas.right = 0;
    if (!pending.length) return;
    if (paced && fences.length < 4) {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (sync) fences.push({ sync, at: performance.now() });
    }
    // Copied straight from the buffer. Through transferToImageBitmap, Safari
    // reads every copy back from the GPU while painting, and the page falls
    // to a few frames a second.
    for (const { target, x, y, width, height, left, top } of pending) {
      target.clearRect(left, top, width, height);
      // WebGL rows start at the bottom of the buffer.
      target.drawImage(
        canvas,
        x,
        canvas.height - y - height,
        width,
        height,
        left,
        top,
        width,
        height,
      );
    }
    pending.length = 0;
    used.width = Math.max(used.width, usedWidth);
    used.height = Math.max(used.height, usedHeight);
    if (++used.frames < 60) return;
    if (used.width * used.height * 2 < canvas.width * canvas.height) fit(used.width, used.height);
    used.width = 0;
    used.height = 0;
    used.frames = 0;
  };
  return context;
}

/**
 * The backdrop's last capture as a texture of the context gl, uploaded once
 * per capture and context.
 */
export function backdropTexture(gl: WebGL2RenderingContext, backdrop: SoapBubbleBackdrop) {
  const entry = backdrop as BackdropEntry;
  return uploaded(gl, entry.uploads, entry.source, entry.version, true);
}

/**
 * What the backdrop looks like with its bubbles in it, for a surface that
 * shows the bubbles it covers: null until that is captured. A floating
 * surface (in a group, as a menu's panel) passes null; one laid among the
 * others passes its own element, which that view then leaves out so the
 * surface does not see itself.
 */
export function coveredTexture(
  gl: WebGL2RenderingContext,
  backdrop: SoapBubbleBackdrop,
  self: Element | null,
) {
  const view = (backdrop as BackdropEntry).covered.get(self);
  if (!view?.canvas) return null;
  // Sampled once, near where it lies: no mipmaps to build.
  return uploaded(gl, view.uploads, view.canvas, view.version, false);
}

/** Counts the surfaces that show what they cover, per view. */
export function wantCoveredBackdrop(
  backdrop: SoapBubbleBackdrop,
  self: Element | null,
  want: boolean,
) {
  const entry = backdrop as BackdropEntry;
  let view = entry.covered.get(self);
  if (!view) {
    if (!want) return;
    entry.covered.set(self, (view = { canvas: null, version: 0, uploads: new Map(), wanted: 0 }));
    if (entry.layer.canvas) compose(entry, self, view);
    scheduleLayer(entry);
  }
  view.wanted += want ? 1 : -1;
  if (view.wanted > 0) return;
  deleteUploads(view.uploads);
  entry.covered.delete(self);
}

function deleteUploads(uploads: Uploads) {
  for (const [gl, upload] of uploads) if (!gl.isContextLost()) gl.deleteTexture(upload.texture);
}

type Uploads = Map<WebGL2RenderingContext, { texture: WebGLTexture; version: number }>;

function uploaded(
  gl: WebGL2RenderingContext,
  uploads: Uploads,
  source: TexImageSource | null,
  version: number,
  mipmaps: boolean,
) {
  let upload = uploads.get(gl);
  if (!upload)
    uploads.set(gl, (upload = { texture: createBackdropTexture(gl, mipmaps), version: 0 }));
  if (source && upload.version !== version) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, upload.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    upload.version = version;
  }
  return upload.texture;
}

function createBackdropTexture(gl: WebGL2RenderingContext, mipmaps = true) {
  const texture = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export type SoapBubbleBackdrop = {
  element: HTMLElement;
  /** Texel size, or null until the first capture lands. */
  size: [number, number] | null;
  failed: boolean;
};

type BackdropEntry = SoapBubbleBackdrop & {
  /** The last capture, counted so each context uploads it once. */
  source: TexImageSource | null;
  version: number;
  uploads: Uploads;
  /**
   * The backdrop with its bubbles in it (groups left out, and the surface a
   * view is for), for surfaces that show what they cover. Every view is put
   * together from one capture of the bubbles' content, taken only while a
   * view is wanted, and then only when the page has settled after a change.
   */
  covered: Map<Element | null, CoveredView>;
  layer: { canvas: HTMLCanvasElement | null; stale: boolean; capturing: boolean; timer: number };
  fontEmbedCSS: Promise<string> | null;
  listeners: Set<() => void>;
  capturing: boolean;
  dirty: boolean;
  timer: number;
  mutations: MutationObserver;
  resize: ResizeObserver;
};

type CoveredView = {
  canvas: HTMLCanvasElement | null;
  version: number;
  uploads: Uploads;
  wanted: number;
};

const backdrops = new Map<HTMLElement, BackdropEntry>();

// Changes inside any surface (labels, moving thumbs, ready flags) are left
// out of the snapshot anyway and must not trigger another capture. A group
// (a menu, a burst) holds only surfaces, so it is left out the same way.
const bubbleSelector = '[data-soap-bubble], [data-soap-bubble-group]';
const insideSurface = (node: Node) =>
  (node instanceof Element ? node : node.parentElement)?.closest(bubbleSelector) != null;
const groupSelector = '[data-soap-bubble-group]';
const insideGroup = (node: Node) =>
  (node instanceof Element ? node : node.parentElement)?.closest(groupSelector) != null;

/**
 * One rasterised copy of a backdrop element, shared by every surface over it
 * and refreshed whenever the element changes. Returns a release function.
 */
export function subscribeBackdrop(
  element: HTMLElement,
  onChange: (backdrop: SoapBubbleBackdrop) => void,
): () => void {
  let entry = backdrops.get(element);
  if (!entry) {
    const created: BackdropEntry = {
      element,
      source: null,
      version: 0,
      uploads: new Map(),
      covered: new Map(),
      layer: { canvas: null, stale: true, capturing: false, timer: 0 },
      fontEmbedCSS: null,
      size: null,
      failed: false,
      listeners: new Set(),
      capturing: false,
      dirty: false,
      timer: 0,
      mutations: new MutationObserver((records) => {
        if (records.some((record) => !insideSurface(record.target))) schedule(created);
        // The bubbles are in the covered view; a menu opening is not, nor the
        // flags surfaces set on their canvases.
        if (
          records.some(
            (record) => !insideGroup(record.target) && record.attributeName !== 'data-backdrop',
          )
        )
          staleCovered(created);
      }),
      resize: new ResizeObserver(() => {
        schedule(created);
        staleCovered(created);
      }),
    };
    created.mutations.observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    created.resize.observe(element);
    backdrops.set(element, created);
    entry = created;
    void capture(created);
  }
  const current = entry;
  const listener = () => onChange(current);
  current.listeners.add(listener);
  if (current.size || current.failed) listener();
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size) return;
    window.clearTimeout(current.timer);
    current.mutations.disconnect();
    current.resize.disconnect();
    deleteUploads(current.uploads);
    window.clearTimeout(current.layer.timer);
    for (const view of current.covered.values()) deleteUploads(view.uploads);
    backdrops.delete(element);
  };
}

function schedule(entry: BackdropEntry) {
  window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => void capture(entry), 180);
}

async function capture(entry: BackdropEntry) {
  if (entry.capturing) {
    entry.dirty = true;
    return;
  }
  entry.capturing = true;
  entry.dirty = false;
  const { element } = entry;
  try {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) throw new Error('Empty backdrop');
    let source: HTMLImageElement | HTMLCanvasElement;
    if (element instanceof HTMLImageElement) {
      await element.decode();
      source = element;
    } else if (element instanceof HTMLCanvasElement) {
      source = element;
    } else {
      await document.fonts?.ready;
      const { toCanvas } = await import('html-to-image');
      source = await toCanvas(element, {
        width: rect.width,
        height: rect.height,
        pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
        includeQueryParams: true,
        fontEmbedCSS: await fontEmbedCSS(entry),
        style: { transform: 'none' },
        filter: (node) => !(node instanceof Element && node.matches(bubbleSelector)),
      });
    }
    if (backdrops.get(element) !== entry) return;
    entry.source = source;
    entry.version++;
    entry.size =
      source instanceof HTMLImageElement
        ? [source.naturalWidth, source.naturalHeight]
        : [source.width, source.height];
    entry.failed = false;
    staleCovered(entry);
  } catch {
    entry.failed = !entry.size;
  } finally {
    entry.capturing = false;
    entry.listeners.forEach((listener) => listener());
    if (entry.dirty && backdrops.get(element) === entry) schedule(entry);
  }
}

// The page's fonts, inlined once per backdrop rather than on every capture.
function fontEmbedCSS(entry: BackdropEntry) {
  entry.fontEmbedCSS ??= import('html-to-image')
    .then(({ getFontEmbedCSS }) => getFontEmbedCSS(entry.element))
    .catch(() => '');
  return entry.fontEmbedCSS;
}

function staleCovered(entry: BackdropEntry) {
  entry.layer.stale = true;
  scheduleLayer(entry);
}

// The bubbles' content costs another rasterisation, so it waits for the page
// to settle (a slider being dragged, a theme switching) and is skipped while
// no surface shows what it covers.
function scheduleLayer(entry: BackdropEntry) {
  const { layer } = entry;
  if (!entry.covered.size || !layer.stale || !entry.source) return;
  window.clearTimeout(layer.timer);
  layer.timer = window.setTimeout(() => void captureLayer(entry), 700);
}

async function captureLayer(entry: BackdropEntry) {
  const { element, layer } = entry;
  if (layer.capturing || !entry.covered.size || !entry.source) return;
  layer.capturing = true;
  layer.stale = false;
  try {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    let canvas: HTMLCanvasElement;
    if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement) {
      canvas = Object.assign(document.createElement('canvas'), {
        width: entry.size![0],
        height: entry.size![1],
      });
    } else {
      // Everything stays where it is laid out (leaving a surface out would
      // let the rest close up); only the films, drawn apart, are skipped.
      // At the backdrop's own scale, so the page matches it pixel for pixel.
      const { toCanvas } = await import('html-to-image');
      canvas = await toCanvas(element, {
        width: rect.width,
        height: rect.height,
        pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
        includeQueryParams: true,
        // Groups are never part of a covered view. Hide their paint in the
        // snapshot while preserving layout: erasing at their live position
        // afterwards can leave a ghost if they move during rasterisation.
        fontEmbedCSS: `${await fontEmbedCSS(entry)}\n${groupSelector}, ${groupSelector} * { visibility: hidden !important; }`,
        style: { transform: 'none', background: 'transparent' },
        filter: (node) => !(node instanceof Element && node.localName === 'canvas'),
      });
    }
    if (backdrops.get(element) !== entry) return;
    layer.canvas = canvas;
    for (const [self, view] of entry.covered) compose(entry, self, view);
    entry.listeners.forEach((listener) => listener());
  } catch {
    // Without it, surfaces show the backdrop alone.
  } finally {
    layer.capturing = false;
    if (layer.stale) scheduleLayer(entry);
  }
}

// One view from the content layer: groups were hidden during capture; erase
// the surface it is for, then draw the other bubbles' films and the page
// underneath.
function compose(entry: BackdropEntry, self: Element | null, view: CoveredView) {
  const { element, layer } = entry;
  if (!layer.canvas || !entry.source) return;
  const rect = element.getBoundingClientRect();
  const scale = layer.canvas.width / Math.max(1, rect.width);
  const canvas = Object.assign(document.createElement('canvas'), {
    width: layer.canvas.width,
    height: layer.canvas.height,
  });
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(layer.canvas, 0, 0);
  const leftOut = [...element.querySelectorAll(groupSelector), ...(self ? [self] : [])];
  if (self && !insideGroup(self)) eraseContent(context, self, rect, scale);
  context.globalCompositeOperation = 'destination-over';
  for (const film of element.querySelectorAll<HTMLCanvasElement>('[data-soap-bubble] canvas')) {
    if (!film.width || leftOut.some((root) => root.contains(film))) continue;
    const box = film.getBoundingClientRect();
    context.drawImage(
      film,
      (box.left - rect.left) * scale,
      (box.top - rect.top) * scale,
      box.width * scale,
      box.height * scale,
    );
  }
  context.drawImage(entry.source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  view.canvas = canvas;
  view.version++;
}

// Clears what a surface draws itself, its text and icons, from the layer.
function eraseContent(
  context: CanvasRenderingContext2D,
  root: Element,
  origin: DOMRect,
  scale: number,
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const range = document.createRange();
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    let boxes: Iterable<DOMRect>;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      boxes = range.getClientRects();
    } else if (node instanceof SVGSVGElement || node instanceof HTMLImageElement) {
      boxes = [node.getBoundingClientRect()];
    } else continue;
    for (const box of boxes)
      context.clearRect(
        (box.left - origin.left) * scale - 1,
        (box.top - origin.top) * scale - 1,
        box.width * scale + 2,
        box.height * scale + 2,
      );
  }
}

// One animation frame drives every surface on the page, instead of one
// requestAnimationFrame loop each.
let frameTasks = new Set<(now: number) => void>();
let frameHandle = 0;

export function requestSoapBubbleFrame(task: (now: number) => void) {
  frameTasks.add(task);
  if (!frameHandle) frameHandle = requestAnimationFrame(runFrame);
}

export function cancelSoapBubbleFrame(task: (now: number) => void) {
  frameTasks.delete(task);
}

let runningTasks = new Set<(now: number) => void>();

// One clock for the film's 30 frames a second, shared by every surface.
let filmAt = 0;
let filmFrame = false;
export const isFilmFrame = () => filmFrame;

// The GPU's pace. A frame is held back while two earlier ones are still
// being drawn, so a slow GPU never queues work ahead of the page's own
// scrolling and compositing. Should it stay behind, every surface is drawn
// with fewer pixels; a GPU that keeps up never sees a difference.
const resolutionLevels = [1, 0.8, 0.65, 0.5];
let resolutionLevel = 0;
const resolutionListeners = new Set<() => void>();
/** Share of each surface's pixel density the GPU can afford. */
export const soapBubbleResolution = () => resolutionLevels[resolutionLevel];
export function onSoapBubbleResolution(listener: () => void) {
  resolutionListeners.add(listener);
  return () => {
    resolutionListeners.delete(listener);
  };
}

const latencies: number[] = [];
let paceFrom = 0;
let paceLast = 0;
let paceHeld = 0;
let paceFrames = 0;
let slowSpells = 0;
// Time from handing a frame over to its last pixel, as seen from the next
// animation frame.
function gpuDone(latency: number) {
  latencies.push(latency);
}

function pace(now: number, held: boolean) {
  // A gap (a hidden tab, nothing moving, a long task) starts afresh.
  if (now - paceLast > 250) {
    paceFrom = now;
    paceHeld = 0;
    paceFrames = 0;
    latencies.length = 0;
  }
  paceLast = now;
  paceFrames++;
  if (held) paceHeld++;
  if (now - paceFrom < 1000) return;
  // Slow: most frames took the GPU over two display frames, or a third of
  // the animation frames had to wait for it.
  latencies.sort((a, b) => a - b);
  const typical = latencies.length >= 8 ? latencies[latencies.length >> 1] : 0;
  const slow = typical > 34 || paceHeld * 3 > paceFrames;
  slowSpells = slow ? slowSpells + 1 : 0;
  paceFrom = now;
  paceHeld = 0;
  paceFrames = 0;
  latencies.length = 0;
  // Two slow seconds in a row, never a single hitch.
  if (slowSpells >= 2 && resolutionLevel < resolutionLevels.length - 1) {
    slowSpells = 0;
    resolutionLevel++;
    resolutionListeners.forEach((listener) => listener());
  }
}

function runFrame(now: number) {
  frameHandle = 0;
  const held = (shared?.inFlight(now) ?? 0) >= 2;
  if (shared) pace(now, held);
  if (held) {
    // Everything waits a frame; the tasks stay queued.
    frameHandle = requestAnimationFrame(runFrame);
    return;
  }
  filmFrame = now - filmAt >= 31;
  if (filmFrame) filmAt = now;
  // Swap the sets instead of copying: tasks queued while running wait for
  // the next frame.
  const tasks = frameTasks;
  frameTasks = runningTasks;
  runningTasks = tasks;
  for (const task of tasks) task(now);
  tasks.clear();
}
