import { fluidRipplesFragment, fluidRipplesVertex } from './fluid-ripples-shaders';
import { createFluidNoise, fluidRipplesField as field } from './fluid-ripples-field';

export type FluidRipplesTuning = {
  theme: 'auto' | 'light' | 'dark';
  palette: FluidRipplesPalette;
  backgroundColor: string;
  blueColor: string;
  lavenderColor: string;
  highlightColor: string;
  rippleCount: number;
  rippleWidth: number;
  rippleSpacing: number;
  distortion: number;
  turbulenceScale: number;
  blur: number;
  refraction: number;
  centerX: number;
  centerY: number;
  travel: number;
  speed: number;
  phase: number;
  seed: number;
  paused: boolean;
  typing: boolean;
  interactive: boolean;
  interactionStrength: number;
  maxFps: number;
  resolutionScale: number;
  maxDpr: number;
  maxPixels: number;
};

export const fluidRipplesPalettes = {
  light: ['#e6eef0', '#bddcf4', '#d7d9f1', '#ffffff'],
  dark: ['#000000', '#168eea', '#8055f0', '#000000'],
} as const;

/** Reference and gradient palettes, each with a matching dark variation. */
export const fluidRipplesPresets = {
  turquoise: {
    label: 'Turquoise',
    light: ['#11b6df', '#bddcf4', '#d7d9f1', '#ffffff'],
    dark: ['#000000', '#0cc8ee', '#167af5', '#000000'],
    text: ['#10394b', '#c8f5ff'],
  },
  'rose-lagoon': {
    label: 'Rose Lagoon',
    light: ['#11b6df', '#ffeafb', '#d5d7f5', '#ffffff'],
    dark: ['#000000', '#ff3598', '#ff0075', '#000000'],
    text: ['#10394b', '#fff0f7'],
  },
  silk: {
    label: 'Silk',
    light: ['#fbfcfd', '#b6a0f9', '#edb3f4', '#ffffff'],
    dark: ['#000000', '#966bff', '#f044dc', '#000000'],
    text: ['#352543', '#f0e3ff'],
  },
  opal: {
    label: 'Opal',
    light: ['#f8fcfb', '#adeee8', '#c1aff5', '#f5c7da'],
    dark: ['#000000', '#21dfce', '#a56bff', '#000000'],
    text: ['#263c46', '#e7f9f4'],
  },
  aurora: {
    label: 'Aurora',
    light: ['#e9f8f1', '#62e6b9', '#8e77da', '#a7fcdf'],
    dark: ['#000000', '#00e6a8', '#8052ff', '#000000'],
    text: ['#163e37', '#d5ffeb'],
  },
  rose: {
    label: 'Rose',
    light: ['#fff8fa', '#ec9fc7', '#e47bab', '#fff5ec'],
    dark: ['#000000', '#ff469a', '#ed0067', '#000000'],
    text: ['#4b2439', '#ffe6f0'],
  },
  glacier: {
    label: 'Glacier',
    light: ['#f6fcfe', '#7ce2e7', '#bcaef2', '#ffffff'],
    dark: ['#000000', '#00dcea', '#916dff', '#000000'],
    text: ['#193b4e', '#d8f7ff'],
  },
  solar: {
    label: 'Solar',
    light: ['#fffaf0', '#ecaf62', '#f395a1', '#fffce1'],
    dark: ['#000000', '#ffb029', '#ff564e', '#000000'],
    text: ['#4c321c', '#fff2cb'],
  },
  graphite: {
    label: 'Graphite',
    light: ['#f1f3f7', '#95acbd', '#8b788e', '#ffffff'],
    dark: ['#000000', '#738aff', '#a277e8', '#000000'],
    text: ['#252c39', '#edf0f7'],
  },
} as const;

export type FluidRipplesPalette = 'auto' | keyof typeof fluidRipplesPresets;

export function resolveFluidRipplesPalette(palette: FluidRipplesPalette, theme: 'light' | 'dark') {
  return palette === 'auto' ? fluidRipplesPalettes[theme] : fluidRipplesPresets[palette][theme];
}

export const fluidRipplesDefaults: FluidRipplesTuning = {
  theme: 'auto',
  palette: 'auto',
  backgroundColor: '',
  blueColor: '',
  lavenderColor: '',
  highlightColor: '',
  rippleCount: 7,
  rippleWidth: 0.09,
  rippleSpacing: 0.14,
  distortion: 0.0133,
  turbulenceScale: 0.093,
  blur: 0.05,
  refraction: 0.41,
  centerX: 0.34,
  centerY: 0.5,
  travel: 0.36,
  speed: 0.25,
  phase: 0,
  seed: 1,
  paused: false,
  typing: false,
  interactive: true,
  interactionStrength: 1.4,
  maxFps: 60,
  resolutionScale: 0.75,
  maxDpr: 1.5,
  maxPixels: 1000000,
};

const bounds = {
  rippleCount: [1, 24],
  rippleWidth: [0.01, 0.4],
  rippleSpacing: [0.03, 1],
  distortion: [0, 0.2],
  turbulenceScale: [0.02, 1],
  blur: [0, 0.15],
  refraction: [0, 1.5],
  centerX: [-1, 2],
  centerY: [-1, 2],
  travel: [0, 2],
  speed: [0, 2],
  seed: [0, 100],
  maxFps: [1, 120],
  resolutionScale: [0.25, 1],
  maxDpr: [0.5, 3],
  maxPixels: [65536, 4000000],
  interactionStrength: [0, 2],
} as const;
/**
 * Ring radius in height units. A larger drop makes longer waves, which travel faster (deep-water
 * dispersion: speed ∝ √wavelength). A drop larger than a keystroke first spreads as a shock front
 * that decelerates (radius ∝ √t) until it has slowed to that wave speed.
 */
function rippleRadius(age: number, size: number) {
  const speed = field.growth * Math.sqrt(size);
  const shock = field.shock * Math.max(0, size - 1);
  const settle = (shock / (2 * speed)) ** 2;
  return (
    field.radius * size +
    (age < settle ? shock * Math.sqrt(age) : shock * Math.sqrt(settle) + speed * (age - settle))
  );
}

const rippleLifetime = (size: number) => field.lifetime * Math.sqrt(size);
const colorNames = ['backgroundColor', 'blueColor', 'lavenderColor', 'highlightColor'] as const;
const scalarUniforms = {
  rippleWidth: 'uWidth',
  distortion: 'uDistortion',
  turbulenceScale: 'uTurbulence',
  blur: 'uBlur',
  refraction: 'uRefraction',
  seed: 'uSeed',
} as const;

export function normalizeFluidRipples(input: Partial<FluidRipplesTuning>): FluidRipplesTuning {
  const value = { ...fluidRipplesDefaults, ...input };
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const number = value[key];
    value[key] = Number.isFinite(number)
      ? Math.max(bounds[key][0], Math.min(bounds[key][1], number))
      : fluidRipplesDefaults[key];
  }
  value.rippleCount = Math.round(value.rippleCount);
  value.phase = Number.isFinite(value.phase) ? ((value.phase % 1) + 1) % 1 : 0;
  if (!['light', 'dark', 'auto'].includes(value.theme)) value.theme = 'auto';
  if (value.palette !== 'auto' && !Object.hasOwn(fluidRipplesPresets, value.palette))
    value.palette = 'auto';
  value.interactive = input.interactive ?? fluidRipplesDefaults.interactive;
  for (const key of colorNames) if (typeof value[key] !== 'string') value[key] = '';
  return value;
}

export function createFluidRipplesRenderer(canvas: HTMLCanvasElement, initial: FluidRipplesTuning) {
  const parent = canvas.parentElement,
    doc = canvas.ownerDocument,
    ownerWindow = doc.defaultView;
  if (!parent || !ownerWindow) return null;
  const host = parent,
    win = ownerWindow;
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!context) return null;
  const gl = context;
  let tuning = normalizeFluidRipples(initial);
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let disposed = false,
    lost = false,
    inView = true,
    dirty = true;
  let frame = 0,
    timer = 0,
    time = 0,
    lastTime = 0,
    nextDraw = 0;
  let width = 1,
    height = 1;
  let forcedPause: boolean | null = null;
  const emissions: {
    birth: number;
    x: number;
    y: number;
    strength: number;
    size: number;
    end?: number;
  }[] = [];
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = win.matchMedia('(prefers-color-scheme: dark)');
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const colorCanvas = doc.createElement('canvas');
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colorProbe = doc.createElement('span');
  colorProbe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  colorProbe.setAttribute('aria-hidden', 'true');
  host.appendChild(colorProbe);
  const visible = () => !disposed && !lost && !!program && inView && !doc.hidden;
  const moving = () =>
    !(forcedPause ?? tuning.paused) &&
    !motion.matches &&
    tuning.speed > 0 &&
    (!tuning.typing || emissions.length > 0);
  const cycle = () => Math.max(2.8, tuning.rippleCount * tuning.rippleSpacing + 2.2);
  const rings = new Float32Array(24 * 4),
    amplitudes = new Float32Array(24);
  const smooth = (value: number) => {
    const x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
  };
  function sampleRings() {
    let count = 0;
    // Size scales the wavelength: ring thickness and height grow together, so strength alone sets
    // the refracting slope, while larger waves travel faster and persist longer.
    const add = (age: number, x: number, y: number, strength: number, size = 1) => {
      const lifetime = rippleLifetime(size);
      if (count >= 24 || age < 0 || age > lifetime) return;
      const fade = smooth(age / field.fadeIn) * smooth((lifetime - age) / field.fadeOut);
      const at = count * 4;
      rings[at] = (x * width) / height;
      rings[at + 1] = y;
      rings[at + 2] = rippleRadius(age, size);
      rings[at + 3] = (field.width + age * 0.006) * size;
      amplitudes[count++] = field.height * fade * strength * size;
    };
    for (let i = emissions.length - 1; i >= 0; i--) {
      const emission = emissions[i];
      if (i < emissions.length - tuning.rippleCount && emission.end === undefined)
        emission.end = time;
      if (
        time - emission.birth > rippleLifetime(emission.size) ||
        (emission.end !== undefined && time - emission.end > field.fadeOut)
      )
        emissions.splice(i, 1);
    }
    for (let i = Math.max(0, emissions.length - 24); i < emissions.length; i++) {
      const emission = emissions[i];
      const fade =
        emission.end === undefined
          ? 1
          : smooth((field.fadeOut - time + emission.end) / field.fadeOut);
      add(time - emission.birth, emission.x, emission.y, emission.strength * fade, emission.size);
    }
    if (!tuning.typing) {
      const period = cycle(),
        clock = time + tuning.phase * period;
      for (let i = 0; i < tuning.rippleCount; i++) {
        const age = (((clock - i * tuning.rippleSpacing) % period) + period) % period;
        add(
          age,
          tuning.centerX + (i / Math.max(1, tuning.rippleCount - 1)) * tuning.travel,
          tuning.centerY,
          1,
        );
      }
    }
    gl.uniform1f(uniform('uCount'), count);
    gl.uniform4fv(uniform('uRings[0]'), rings);
    gl.uniform1fv(uniform('uAmplitude[0]'), amplitudes);
  }
  const uniform = (name: string) => {
    if (!program) return null;
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  function theme() {
    if (tuning.theme !== 'auto') return tuning.theme;
    const declared = host.closest<HTMLElement>('[data-theme]')?.dataset.theme;
    if (declared === 'dark' || declared === 'light') return declared;
    if (host.closest('.dark')) return 'dark';
    const inherited = win.getComputedStyle(host).colorScheme;
    if (inherited === 'light' || inherited === 'dark') return inherited;
    return scheme.matches ? 'dark' : 'light';
  }
  function stop() {
    win.cancelAnimationFrame(frame);
    win.clearTimeout(timer);
    frame = timer = lastTime = 0;
  }
  function request(invalidate = false) {
    dirty ||= invalidate;
    if (visible() && !frame && !timer) frame = win.requestAnimationFrame(render);
  }
  function measure() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const scale = Math.min(win.devicePixelRatio, tuning.maxDpr) * tuning.resolutionScale;
    const limit = Math.min(
      1,
      Math.sqrt(tuning.maxPixels / (width * height * scale * scale)),
      4096 / (Math.max(width, height) * scale),
    );
    const w = Math.max(1, Math.floor(width * scale * limit)),
      h = Math.max(1, Math.floor(height * scale * limit));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    request(true);
  }
  function resolveColors() {
    const actual = theme();
    host.dataset.fluidTheme = actual;
    const palette = resolveFluidRipplesPalette(tuning.palette, actual);
    const names = ['uBackground', 'uBlue', 'uLavender', 'uHighlight'];
    colorNames.forEach((key, index) => {
      const input = tuning[key].trim() || palette[index];
      colorProbe.style.color = palette[index];
      colorProbe.style.color = input;
      const resolved = win.getComputedStyle(colorProbe).color;
      if (colorContext) {
        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillStyle = palette[index];
        colorContext.fillStyle = resolved;
        colorContext.fillRect(0, 0, 1, 1);
        const data = colorContext.getImageData(0, 0, 1, 1).data;
        gl.uniform3f(uniform(names[index]), data[0] / 255, data[1] / 255, data[2] / 255);
      } else {
        const hex = Number.parseInt(palette[index].slice(1), 16);
        gl.uniform3f(
          uniform(names[index]),
          ((hex >> 16) & 255) / 255,
          ((hex >> 8) & 255) / 255,
          (hex & 255) / 255,
        );
      }
    });
    gl.uniform1f(uniform('uDark'), actual === 'dark' ? 1 : 0);
    gl.uniform1f(
      uniform('uCustomPalette'),
      tuning.palette !== 'auto' || colorNames.some((key) => tuning[key].trim()) ? 1 : 0,
    );
  }
  function render(now: number) {
    frame = 0;
    if (!visible()) {
      lastTime = 0;
      return;
    }
    if (moving() && lastTime) time += Math.max(0, (now - lastTime) / 1000) * tuning.speed * 4;
    lastTime = now;
    if (dirty || now >= nextDraw) {
      gl.useProgram(program);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (dirty) {
        gl.uniform2f(uniform('uResolution'), width, height);
        for (const [key, name] of Object.entries(scalarUniforms))
          gl.uniform1f(uniform(name), tuning[key as keyof typeof scalarUniforms]);
        resolveColors();
        gl.uniform2f(uniform('uBufferSize'), canvas.width, canvas.height);
        gl.uniform1i(uniform('uNoise'), 0);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      sampleRings();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      host.dataset.fluidReady = 'true';
      dirty = false;
      nextDraw = Math.max(now, nextDraw) + 1000 / tuning.maxFps;
    }
    if (moving()) {
      const wait = Math.max(0, nextDraw - win.performance.now() - 14);
      if (wait > 4)
        timer = win.setTimeout(() => {
          timer = 0;
          request();
        }, wait);
      else request();
    }
  }
  function release() {
    if (program && !lost) gl.deleteProgram(program);
    if (texture && !lost) gl.deleteTexture(texture);
    texture = null;
    program = null;
    uniforms.clear();
    delete host.dataset.fluidReady;
  }
  function initialize() {
    const shaders: WebGLShader[] = [];
    let next: WebGLProgram | null = null;
    let nextTexture: WebGLTexture | null = null;
    try {
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, fluidRipplesVertex],
        [gl.FRAGMENT_SHADER, fluidRipplesFragment],
      ] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
      }
      next = gl.createProgram();
      // WebGL may return null on allocation failure, despite lib.dom's non-null signature.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!next) throw new Error('Program allocation failed');
      const linked = next;
      shaders.forEach((shader) => {
        gl.attachShader(linked, shader);
      });
      gl.linkProgram(next);
      if (!gl.getProgramParameter(next, gl.LINK_STATUS)) throw new Error('Shader linking failed');
      nextTexture = gl.createTexture();
      // WebGL allocation can fail even though lib.dom declares a non-null result.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!nextTexture) throw new Error('Texture allocation failed');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, nextTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        field.noiseWidth,
        field.noiseHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        createFluidNoise(),
      );
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture upload failed');
      release();
      texture = nextTexture;
      nextTexture = null;
      program = next;
      next = null;
      lost = false;
      measure();
      request(true);
    } catch {
      if (next) gl.deleteProgram(next);
      if (nextTexture) gl.deleteTexture(nextTexture);
      release();
      lost = true;
    } finally {
      shaders.forEach((shader) => {
        gl.deleteShader(shader);
      });
    }
  }
  const visibility = () => {
    stop();
    request(true);
  };
  const recolor = () => {
    request(true);
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    stop();
    lost = true;
    program = null;
    texture = null;
    uniforms.clear();
    delete host.dataset.fluidReady;
  };
  const contextRestored = () => {
    if (!disposed) {
      lost = false;
      initialize();
    }
  };
  function emit(x: number, y: number, strength = 1, size = 1) {
    if (![x, y, strength, size].every(Number.isFinite)) return;
    const now = win.performance.now();
    if (moving() && lastTime) time += Math.max(0, (now - lastTime) / 1000) * tuning.speed * 4;
    lastTime = now;
    const drop = {
      birth: time,
      x: Math.max(-1, Math.min(2, x)),
      y: Math.max(-1, Math.min(2, y)),
      strength: Math.max(0, Math.min(2, strength)),
      size: Math.max(0.25, Math.min(4, size)),
    };
    emissions.push(drop);
    // The rebound jet of a large drop falls back and sends a weaker, shorter trailing ring.
    if (drop.size >= field.reboundSize)
      emissions.push({
        ...drop,
        birth: time + field.reboundDelay * Math.sqrt(drop.size),
        strength: drop.strength * 0.55,
        size: drop.size * 0.5,
      });
    while (emissions.length > 72) emissions.shift();
    request(true);
  }
  const pointerDown = (event: PointerEvent) => {
    if (
      !tuning.interactive ||
      tuning.interactionStrength === 0 ||
      !visible() ||
      (forcedPause ?? tuning.paused) ||
      motion.matches ||
      tuning.speed === 0 ||
      event.defaultPrevented ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    const target = event.target;
    if (
      target instanceof win.Element &&
      target.closest(
        'a,button,input,textarea,select,summary,[role="button"],[contenteditable]:not([contenteditable="false"])',
      )
    )
      return;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    emit(
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      tuning.interactionStrength,
    );
  };
  const resize = new win.ResizeObserver(measure);
  resize.observe(host);
  const intersection = new win.IntersectionObserver(([entry]) => {
    if (inView !== entry.isIntersecting) {
      inView = entry.isIntersecting;
      visibility();
    }
  });
  intersection.observe(host);
  const observer = new win.MutationObserver(recolor);
  for (let node: HTMLElement | null = host; node; node = node.parentElement)
    observer.observe(node, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  doc.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', visibility);
  scheme.addEventListener('change', recolor);
  win.addEventListener('resize', measure);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  host.addEventListener('pointerdown', pointerDown);
  initialize();
  return {
    update(next: FluidRipplesTuning) {
      const normalized = normalizeFluidRipples(next);
      if (normalized.paused !== tuning.paused) forcedPause = null;
      if (normalized.typing !== tuning.typing) emissions.length = 0;
      tuning = normalized;
      stop();
      measure();
      request(true);
    },
    reset() {
      time = 0;
      emissions.length = 0;
      stop();
      request(true);
    },
    seek(seconds: number) {
      if (Number.isFinite(seconds)) {
        time = Math.max(0, seconds) * tuning.speed * 4;
        stop();
        request(true);
      }
    },
    pause() {
      forcedPause = true;
      stop();
      request(true);
    },
    play() {
      forcedPause = false;
      stop();
      request(true);
    },
    rippleAt: emit,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      resize.disconnect();
      intersection.disconnect();
      observer.disconnect();
      doc.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', visibility);
      scheme.removeEventListener('change', recolor);
      win.removeEventListener('resize', measure);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      host.removeEventListener('pointerdown', pointerDown);
      colorProbe.remove();
      release();
      delete host.dataset.fluidTheme;
    },
  };
}
