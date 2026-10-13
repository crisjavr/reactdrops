import { streamVertex, streamFragment, grainCacheFragment } from './fluid-glass-gradient-shaders';

export const fluidGlassGradientPresets = {
  tide: {
    baseColor: '#e7f3f1',
    colorA: '#1f6669',
    colorB: '#5fa8a6',
    colorC: '#a8d7d0',
    seed: 119,
    startTime: 18,
  },
  cobalt: {
    baseColor: '#e4e9f8',
    colorA: '#3c6bc8',
    colorB: '#9cc8dc',
    colorC: '#7d9ee7',
    seed: 154,
    startTime: 0,
  },
  'cobalt-dark': {
    baseColor: '#000000',
    colorA: '#3c6bc8',
    colorB: '#5f7b88',
    colorC: '#364567',
    colorDistribution: 0,
    seed: 154,
    startTime: 0,
  },
  lilac: {
    baseColor: '#f1e9f5',
    colorA: '#70458f',
    colorB: '#9d6bb0',
    colorC: '#c9a3d5',
    seed: 118,
    startTime: 0,
  },
  dune: {
    baseColor: '#f0ece4',
    colorA: '#756a5b',
    colorB: '#aa9a85',
    colorC: '#d2c6b3',
    seed: 176,
    startTime: 0,
  },
  honey: {
    baseColor: '#fff1bd',
    colorA: '#b74308',
    colorB: '#f47e0b',
    colorC: '#ffd13b',
    seed: 89,
    startTime: 0,
  },
  berry: {
    baseColor: '#f9e8ef',
    colorA: '#a63f67',
    colorB: '#d27e9e',
    colorC: '#e8b4c8',
    seed: 48,
    startTime: 0,
  },
  frost: {
    baseColor: '#e9f3f6',
    colorA: '#4b758a',
    colorB: '#89b4c4',
    colorC: '#bfdce5',
    seed: 36,
    startTime: 0,
  },
  aqua: {
    baseColor: '#ffffff',
    colorA: '#007f79',
    colorB: '#0eb9ad',
    colorC: '#defcf7',
    seed: 107,
    startTime: 0,
  },
  red: {
    baseColor: '#ffffff',
    colorA: '#b41438',
    colorB: '#f13559',
    colorC: '#ffe4e9',
    seed: 68,
    startTime: 0,
  },
  monochrome: {
    baseColor: '#ffffff',
    colorA: '#000000',
    colorB: '#4d4d4d',
    colorC: '#a9a9a9',
    seed: 145,
    startTime: 18,
  },
} as const;

export type FluidGlassGradientPreset = keyof typeof fluidGlassGradientPresets;
export type GrainMode = 'fine' | 'coarse' | 'rough' | 'monochrome';
export type FlowType = 'drift' | 'vortex' | 'wave';
export type ReliefFadeSide = 'left' | 'right' | 'top' | 'bottom';

export type FlowTuning = {
  baseColor: string;
  colorA: string;
  colorB: string;
  colorC: string;
  speed: number;
  distortion: number;
  clusterCount: number;
  clusterIntensity: number;
  clusterSize: number;
  scale: number;
  spotSize: number;
  rotation: number;
  softness: number;
  relief: number;
  reliefFade: boolean;
  reliefFadeSide: ReliefFadeSide;
  reliefFadeAmount: number;
  reliefFadeWidth: number;
  refraction: number;
  roughness: number;
  reflection: number;
  caustics: number;
  dispersion: number;
  colorDistribution: number;
  grain: number;
  grainSize: number;
  seed: number;
  startTime: number;
  paused: boolean;
  /** @deprecated Grain is always static and responds only to pigment brightness. */
  animatedGrain: boolean;
  animateDistortion: boolean;
  interactive: boolean;
  grainMode: GrainMode;
  flowType: FlowType;
};

export const fluidGlassGradientDefaults: FlowTuning = {
  ...fluidGlassGradientPresets.tide,
  seed: 113,
  startTime: 46,
  speed: 1.5,
  distortion: 2.4,
  clusterCount: 7.2,
  clusterIntensity: 3,
  clusterSize: 22.5,
  scale: 0.23,
  spotSize: 1.15,
  rotation: 0,
  softness: 0.31,
  relief: 2.94,
  reliefFade: false,
  reliefFadeSide: 'left',
  reliefFadeAmount: 35,
  reliefFadeWidth: 25,
  refraction: 0.65,
  roughness: 0,
  reflection: 1.3,
  caustics: 0,
  dispersion: 1,
  colorDistribution: 0,
  grain: 0.02,
  grainSize: 1,
  paused: false,
  animatedGrain: false,
  animateDistortion: true,
  interactive: false,
  grainMode: 'fine',
  flowType: 'drift',
};

function finiteInRange(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeFlow(input: FlowTuning): FlowTuning {
  const defaults = fluidGlassGradientDefaults;
  return {
    ...input,
    interactive: input.interactive === true,
    animateDistortion: input.animateDistortion !== false,
    reliefFade: input.reliefFade === true,
    reliefFadeSide: (['left', 'right', 'top', 'bottom'] as string[]).includes(input.reliefFadeSide)
      ? input.reliefFadeSide
      : defaults.reliefFadeSide,
    grainMode: (['fine', 'coarse', 'rough', 'monochrome'] as string[]).includes(input.grainMode)
      ? input.grainMode
      : defaults.grainMode,
    flowType: (['drift', 'vortex', 'wave'] as string[]).includes(input.flowType)
      ? input.flowType
      : defaults.flowType,
    startTime: finiteInRange(input.startTime, defaults.startTime, 0, 86400),
    speed: finiteInRange(input.speed, defaults.speed, 0, 3),
    distortion: finiteInRange(input.distortion, defaults.distortion, 0, 8),
    clusterCount: finiteInRange(input.clusterCount, defaults.clusterCount, 0, 64),
    clusterIntensity: finiteInRange(input.clusterIntensity, defaults.clusterIntensity, 0, 12),
    clusterSize: finiteInRange(input.clusterSize, defaults.clusterSize, 0.25, 32),
    spotSize: finiteInRange(input.spotSize, defaults.spotSize, 0.1, 5),
    scale: finiteInRange(input.scale, defaults.scale, 0.01, 5),
    rotation: finiteInRange(input.rotation, defaults.rotation, -360, 360),
    colorDistribution: finiteInRange(input.colorDistribution, defaults.colorDistribution, -1, 1),
    softness: finiteInRange(input.softness, defaults.softness, 0, 1),
    relief: finiteInRange(input.relief, defaults.relief, 0, 3),
    reliefFadeAmount: finiteInRange(input.reliefFadeAmount, defaults.reliefFadeAmount, 0, 100),
    reliefFadeWidth: finiteInRange(input.reliefFadeWidth, defaults.reliefFadeWidth, 0, 100),
    refraction: finiteInRange(input.refraction, defaults.refraction, 0, 2),
    roughness: finiteInRange(input.roughness, defaults.roughness, 0, 1),
    reflection: finiteInRange(input.reflection, defaults.reflection, 0, 2),
    caustics: finiteInRange(input.caustics, defaults.caustics, 0, 2),
    dispersion: finiteInRange(input.dispersion, defaults.dispersion, 0, 1),
    grain: finiteInRange(input.grain, defaults.grain, 0, 0.5),
    grainSize: finiteInRange(input.grainSize, defaults.grainSize, 0.5, 5),
    seed: finiteInRange(input.seed, defaults.seed, 0, 200),
  };
}

// Wrap Drift's cycle for GPU float precision without resetting the active clock.
export function flowSeconds(seconds: number, extent: number, mode: FlowType): number {
  if (mode !== 'drift') return seconds;
  const pace = (0.18 + 0.27 * Math.log2(1 + extent / 320)) / 0.63;
  const cycleSeconds = (2 * Math.PI) / 0.02 / pace;
  return seconds % cycleSeconds;
}

export type GrainCacheInput = {
  width: number;
  height: number;
  pixelRatio: number;
  size: number;
  seed: number;
  style: number;
};

// Cache grain at drawing-buffer resolution. Float storage retains signed
// noise and bright flecks without clipping or tiling.
// Unsupported devices evaluate grain in the color pass.
export function createGrainCache(gl: WebGLRenderingContext, vertexSource: string) {
  if (!gl.getExtension('OES_texture_float') || !gl.getExtension('WEBGL_color_buffer_float'))
    return null;
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const target = gl.createFramebuffer();
  const buffer = gl.createBuffer();
  const shaders: WebGLShader[] = [];
  let width = 1;
  let height = 1;
  let key = '';

  function dispose() {
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(target);
    gl.deleteBuffer(buffer);
  }

  try {
    if (!program || !texture || !target || !buffer) throw new Error('Grain cache unavailable');
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, grainCacheFragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Grain shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Grain shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Grain shader link failed');
    const attribute = gl.getAttribLocation(program, 'aSpan');
    const uniforms = {
      seed: gl.getUniformLocation(program, 'uSalt'),
      style: gl.getUniformLocation(program, 'uGrainMode'),
      size: gl.getUniformLocation(program, 'uFleckSpan'),
      pixelRatio: gl.getUniformLocation(program, 'uPixelScale'),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // A complete sampler is also required while grain amount is zero.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (
      gl.getError() !== gl.NO_ERROR ||
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
    ) {
      throw new Error('Float grain target unavailable');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
      prepare(input: GrainCacheInput, enabled: boolean) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (!enabled) return true;
        const nextKey = [
          input.width,
          input.height,
          input.pixelRatio,
          input.size,
          input.seed,
          input.style,
        ].join(':');
        if (nextKey === key) return true;
        try {
          if (width !== input.width || height !== input.height) {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              input.width,
              input.height,
              0,
              gl.RGBA,
              gl.FLOAT,
              null,
            );
            width = input.width;
            height = input.height;
            gl.bindFramebuffer(gl.FRAMEBUFFER, target);
            if (
              gl.getError() !== gl.NO_ERROR ||
              gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
            )
              return false;
          } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target);
          }
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.viewport(0, 0, width, height);
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
          for (const name of Object.keys(uniforms) as (keyof typeof uniforms)[])
            gl.uniform1f(uniforms[name], input[name]);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          key = nextKey;
          return true;
        } finally {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.bindTexture(gl.TEXTURE_2D, texture);
        }
      },
      dispose,
    };
  } catch {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    dispose();
    return null;
  }
}

// Resolve polished glass at Retina density, including a 1080p full-screen
// surface at DPR 2. Keep a bounded allocation for larger displays.
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_PIXELS = 8_294_400;
const MAX_RENDER_DIMENSION = 4096;

const flowModes = { drift: 0, vortex: 1, wave: 2 } as const;
const grainModes = { fine: 0, coarse: 1, rough: 2, monochrome: 3 } as const;
const reliefFadeSides = { left: 0, right: 1, top: 2, bottom: 3 } as const;
const uniformNames = [
  'uSpan',
  'uElapsed',
  'uWarpElapsed',
  'uZoom',
  'uSpotSize',
  'uBend',
  'uClusterCount',
  'uClusterIntensity',
  'uClusterSize',
  'uTwist',
  'uEase',
  'uRelief',
  'uReliefFade',
  'uReliefFadeSide',
  'uReliefFadeAmount',
  'uReliefFadeWidth',
  'uRefraction',
  'uRoughness',
  'uReflection',
  'uCaustics',
  'uDispersion',
  'uDistribution',
  'uFleck',
  'uFleckSpan',
  'uSalt',
  'uPixelScale',
  'uFlowType',
  'uGrainMode',
  'uPointer',
  'uPointerActive',
  'uBase',
  'uTintA',
  'uTintB',
  'uTintC',
  'uGrainCache',
] as const;
type UniformName = (typeof uniformNames)[number];

export type FlowFrameObserver = (
  tuning: FlowTuning,
  now: number,
  moving: boolean,
  deltaSeconds: number,
  host: HTMLElement,
) => void;

export type FlowMaterialAnimation = {
  fragment: string;
  uniformNames: readonly string[];
  uniforms: () => Record<string, number | Float32Array>;
};

export function createFlowEngine(
  canvas: HTMLCanvasElement,
  initial: FlowTuning,
  observeFrame?: FlowFrameObserver,
  animation?: FlowMaterialAnimation,
) {
  const parent = canvas.parentElement;
  const doc = canvas.ownerDocument;
  const ownerWindow = doc.defaultView;
  if (!parent || !ownerWindow) return null;
  const host = parent;
  const win = ownerWindow;

  const context = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!context) return null;
  const gl = context;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');

  let tuning = normalizeFlow(initial);
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let spanAttribute = 0;
  let grainCache: ReturnType<typeof createGrainCache> = null;
  let allowGrainCache = true;
  let uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  const animationUniforms: Record<string, WebGLUniformLocation | null> = {};
  let frame = 0;
  let lastTime = 0;
  let phase = 0;
  let warpPhase = 0;
  let pixelScale = 1;
  let inView = true;
  let disposed = false;
  let unavailable = false;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerActive = false;

  const colorCanvas = doc.createElement('canvas');
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map<string, number[]>();

  // Let the browser resolve CSS colors before passing normalized RGB to WebGL.
  function parseColor(value: string) {
    const cached = colorCache.get(value);
    if (cached) return cached;
    if (!colorContext) return [1, 1, 1];

    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = '#ffffff';
    colorContext.fillStyle = value;
    colorContext.fillRect(0, 0, 1, 1);
    const bytes = colorContext.getImageData(0, 0, 1, 1).data;
    const rgb = [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255];
    colorCache.set(value, rgb);
    return rgb;
  }

  function stop() {
    win.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function scheduleFrame() {
    if (disposed || unavailable || !inView || doc.visibilityState === 'hidden' || frame) return;
    frame = win.requestAnimationFrame(drawFrame);
  }

  function drawFrame(now: number) {
    frame = 0;
    if (disposed || unavailable || !program || !inView || doc.visibilityState === 'hidden') {
      lastTime = 0;
      return;
    }

    const moving = !tuning.paused && !motion.matches;
    observeFrame?.(
      tuning,
      now,
      moving && tuning.speed > 0,
      lastTime ? Math.max(0, (now - lastTime) / 1000) : 0,
      host,
    );
    // Both clocks use active elapsed time; pause and visibility reset lastTime.
    if (moving && lastTime) {
      const step = Math.max(0, (now - lastTime) / 1000) * tuning.speed;
      phase += step;
      if (tuning.animateDistortion) warpPhase += step;
    }
    lastTime = now;

    const extent = Math.max(canvas.width, canvas.height) / pixelScale;
    const seconds = phase + tuning.startTime;
    const scalars = {
      uElapsed: flowSeconds(seconds, extent, tuning.flowType),
      uWarpElapsed: flowSeconds(warpPhase + tuning.startTime, extent, tuning.flowType),
      uZoom: tuning.scale,
      uSpotSize: tuning.spotSize,
      uBend: tuning.distortion,
      uClusterCount: tuning.clusterCount,
      uClusterIntensity: tuning.clusterIntensity,
      uClusterSize: tuning.clusterSize,
      uTwist: (tuning.rotation * Math.PI) / 180,
      uEase: tuning.softness,
      uRelief: tuning.relief,
      uReliefFade: tuning.reliefFade ? 1 : 0,
      uReliefFadeSide: reliefFadeSides[tuning.reliefFadeSide],
      uReliefFadeAmount: tuning.reliefFadeAmount / 100,
      uReliefFadeWidth: tuning.reliefFadeWidth / 100,
      uRefraction: tuning.refraction,
      uRoughness: tuning.roughness,
      uReflection: tuning.reflection,
      uCaustics: tuning.caustics,
      uDispersion: tuning.dispersion,
      uDistribution: tuning.colorDistribution,
      uFleck: tuning.grain,
      uFleckSpan: tuning.grainSize,
      uSalt: tuning.seed,
      uPixelScale: pixelScale,
      uFlowType: flowModes[tuning.flowType],
      uGrainMode: grainModes[tuning.grainMode],
      uPointerActive: tuning.interactive && pointerActive ? 1 : 0,
    };
    const colors = {
      uBase: tuning.baseColor,
      uTintA: tuning.colorA,
      uTintB: tuning.colorB,
      uTintC: tuning.colorC,
    };

    if (
      grainCache &&
      !grainCache.prepare(
        {
          width: canvas.width,
          height: canvas.height,
          pixelRatio: pixelScale,
          size: tuning.grainSize,
          seed: tuning.seed,
          style: scalars.uGrainMode,
        },
        tuning.grain > 0,
      )
    ) {
      // If a resized cache cannot allocate, compute grain in the color pass.
      allowGrainCache = false;
      initialize();
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(spanAttribute);
    gl.vertexAttribPointer(spanAttribute, 2, gl.FLOAT, false, 0, 0);
    if (grainCache) gl.uniform1i(uniforms.uGrainCache, 0);
    gl.uniform2f(uniforms.uSpan, canvas.width, canvas.height);
    for (const name of Object.keys(scalars) as (keyof typeof scalars)[]) {
      gl.uniform1f(uniforms[name], scalars[name]);
    }
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY);
    for (const name of Object.keys(colors) as (keyof typeof colors)[]) {
      gl.uniform3fv(uniforms[name], parseColor(colors[name]));
    }
    if (animation) {
      for (const [name, value] of Object.entries(animation.uniforms())) {
        if (typeof value === 'number') gl.uniform1f(animationUniforms[name], value);
        else gl.uniform4fv(animationUniforms[name], value);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    host.dataset.flowReady = 'true';

    if (moving && tuning.speed > 0) scheduleFrame();
    else lastTime = 0;
  }

  function measure() {
    if (disposed || unavailable) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    const maxDimension = Math.min(
      MAX_RENDER_DIMENSION,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    );
    pixelScale = Math.min(
      win.devicePixelRatio || 1,
      MAX_PIXEL_RATIO,
      Math.sqrt(MAX_RENDER_PIXELS / Math.max(width * height, 1)),
      maxDimension / Math.max(width, height, 1),
    );
    const renderWidth = Math.max(1, Math.round(width * pixelScale));
    const renderHeight = Math.max(1, Math.round(height * pixelScale));
    if (canvas.width !== renderWidth) canvas.width = renderWidth;
    if (canvas.height !== renderHeight) canvas.height = renderHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    scheduleFrame();
  }

  function releaseResources() {
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    grainCache?.dispose();
    grainCache = null;
    program = null;
    buffer = null;
  }

  function initialize() {
    const shaders: WebGLShader[] = [];
    let nextProgram: WebGLProgram | null = null;
    let nextBuffer: WebGLBuffer | null = null;
    let nextGrainCache: ReturnType<typeof createGrainCache> = null;
    try {
      nextGrainCache = allowGrainCache ? createGrainCache(gl, streamVertex) : null;
      const defines =
        (gl.getExtension('OES_standard_derivatives') ? '#define USE_GLASS_DERIVATIVES\n' : '') +
        (nextGrainCache ? '#define USE_GRAIN_CACHE\n' : '');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, streamVertex],
        [gl.FRAGMENT_SHADER, defines + (animation?.fragment ?? streamFragment)],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Shader unavailable');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error('Shader compilation failed');
        }
      }

      nextProgram = gl.createProgram();
      if (!nextProgram) throw new Error('Program unavailable');
      for (const shader of shaders) gl.attachShader(nextProgram, shader);
      gl.linkProgram(nextProgram);
      if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
        throw new Error('Program link failed');
      }

      nextBuffer = gl.createBuffer();
      if (!nextBuffer) throw new Error('Buffer unavailable');
      gl.useProgram(nextProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, nextBuffer);
      // An oversized triangle covers the canvas without an internal diagonal.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(nextProgram, 'aSpan');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of uniformNames) {
        uniforms[name] = gl.getUniformLocation(nextProgram, name);
      }

      for (const name of animation?.uniformNames ?? []) {
        animationUniforms[name] = gl.getUniformLocation(nextProgram, name);
      }
      releaseResources();
      program = nextProgram;
      buffer = nextBuffer;
      spanAttribute = position;
      grainCache = nextGrainCache;
      unavailable = false;
      measure();
    } catch {
      if (nextProgram) gl.deleteProgram(nextProgram);
      if (nextBuffer) gl.deleteBuffer(nextBuffer);
      nextGrainCache?.dispose();
      releaseResources();
      unavailable = true;
      delete host.dataset.flowReady;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  function onVisibilityChange() {
    stop();
    scheduleFrame();
  }

  function onPointerMove(event: PointerEvent) {
    if (!tuning.interactive) return;
    const bounds = host.getBoundingClientRect();
    pointerX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
    pointerY = Math.max(
      0,
      Math.min(1, 1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)),
    );
    pointerActive = true;
    scheduleFrame();
  }

  function onPointerLeave() {
    if (!pointerActive) return;
    pointerActive = false;
    scheduleFrame();
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    unavailable = true;
    stop();
    delete host.dataset.flowReady;
  }

  function onContextRestored() {
    if (!disposed) initialize();
  }

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(host);
  const intersectionObserver =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
          inView = entry.isIntersecting;
          stop();
          scheduleFrame();
        })
      : null;
  intersectionObserver?.observe(host);

  win.addEventListener('pageshow', onVisibilityChange);
  win.addEventListener('focus', onVisibilityChange);
  // Browser zoom can change DPR while the host retains the same CSS size.
  win.addEventListener('resize', measure);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  motion.addEventListener('change', onVisibilityChange);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  initialize();

  return {
    invalidate: scheduleFrame,
    update(next: FlowTuning) {
      const normalized = normalizeFlow(next);
      if (normalized.startTime !== tuning.startTime) phase = warpPhase = 0;
      tuning = normalized;
      if (!tuning.interactive) pointerActive = false;
      colorCache.clear();
      stop();
      scheduleFrame();
    },
    reset() {
      phase = warpPhase = 0;
      stop();
      scheduleFrame();
    },
    dispose() {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      win.removeEventListener('pageshow', onVisibilityChange);
      win.removeEventListener('focus', onVisibilityChange);
      win.removeEventListener('resize', measure);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      motion.removeEventListener('change', onVisibilityChange);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      releaseResources();
      delete host.dataset.flowReady;
      colorCache.clear();
    },
  };
}
