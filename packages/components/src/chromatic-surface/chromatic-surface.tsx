'use client';

import { useEffect, useRef } from 'react';
import { chromaticFragmentShader, chromaticVertexShader } from './chromatic-shaders';
import { chromaticField, chromaticFieldSize } from './chromatic-field';

export const chromaticColorModes = ['fixed', 'gradient-2', 'gradient-3', 'spectrum'] as const;
export type ChromaticColorMode = (typeof chromaticColorModes)[number];
export const chromaticHoverEffects = ['none', 'brighten', 'flow', 'spotlight'] as const;
export type ChromaticHoverEffect = (typeof chromaticHoverEffects)[number];

export type ChromaticMaterialProps = {
  /** Starting color, fixed color, or first gradient stop, in #RGB or #RRGGBB format. */
  color?: string;
  /** Color flow. Defaults to the original full spectrum. Takes precedence over fixedColor. */
  colorMode?: ChromaticColorMode;
  /** Second stop for gradient-2 and gradient-3. */
  color2?: string;
  /** Third stop for gradient-3. */
  color3?: string;
  /** Legacy shorthand for colorMode="fixed". Reflections continue moving. */
  fixedColor?: boolean;
  /** Continuous field rotation and hue cycling. Zero holds the current frame. */
  speed?: number;
  paused?: boolean;
  /** Starting offset within the moving material. */
  phase?: number;
  /** Source plane edge feather, from 0 to 100. Defaults to 95. */
  feather?: number;
  /** Angular size of the projected plane. Defaults to 174 degrees. */
  projectionScale?: number;
  intensity?: number;
  grain?: number;
  seed?: number;
};

export const chromaticDefaults = {
  color: '#b126ff',
  colorMode: 'spectrum',
  color2: '#ff177c',
  color3: '#35d3ff',
  fixedColor: false,
  speed: 0.7,
  paused: false,
  phase: 0,
  feather: 95,
  projectionScale: 174,
  intensity: 1.15,
  grain: 0.035,
  seed: 7,
} as const;

type Settings = Required<ChromaticMaterialProps> & {
  columns: number;
  rows: number;
  gap: number;
  colorSpread: number;
  centerProjectionScale: number | undefined;
  borderRadius: number | undefined;
  hoverEffect: ChromaticHoverEffect;
};
const finite = (value: number, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
const parseColor = (value: string) => {
  let hex = value.replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = Array.from(hex, (c) => c + c).join('');
  if (!/^[\da-f]{6}$/i.test(hex)) hex = 'b126ff';
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
};

export function ChromaticSurface({
  columns = 1,
  rows = 1,
  gap = 0,
  colorSpread = 0,
  centerProjectionScale,
  borderRadius,
  hoverEffect = 'none',
  ...material
}: ChromaticMaterialProps & {
  columns?: number;
  rows?: number;
  gap?: number;
  colorSpread?: number;
  /** Projection for the middle of the face; defaults to projectionScale. */
  centerProjectionScale?: number;
  /** Button corner radius in percent. Omit to retain the grid's original projection. */
  borderRadius?: number;
  hoverEffect?: ChromaticHoverEffect;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const updateRef = useRef<(() => void) | null>(null);
  const resolveSettings = (): Settings => ({
    ...chromaticDefaults,
    ...Object.fromEntries(Object.entries(material).filter(([, value]) => value !== undefined)),
    colorMode: material.colorMode ?? (material.fixedColor ? 'fixed' : 'spectrum'),
    columns,
    rows,
    gap,
    colorSpread,
    centerProjectionScale,
    borderRadius,
    hoverEffect,
  });
  const settings = useRef<Settings>(resolveSettings());

  useEffect(() => {
    settings.current = resolveSettings();
    updateRef.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const button = canvas.parentElement instanceof HTMLButtonElement ? canvas.parentElement : null;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) return;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let texture: WebGLTexture | null = null;
    let disposed = false;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    let hover = 0;
    let hoverTarget = 0;
    let pointerOver = false;
    let keyboardFocus = false;
    let hoverPosition: [number, number] = [0, 0];
    let visible = true;
    let lost = false;
    let mipmaps = false;
    let width = 1;
    let height = 1;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const release = () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteTexture(texture);
      buffer = null;
      program = null;
      vertex = null;
      fragment = null;
      texture = null;
    };
    const initialize = () => {
      vertex = compile(gl.VERTEX_SHADER, chromaticVertexShader);
      const derivatives = !!gl.getExtension('OES_standard_derivatives');
      // Mips need explicit gradients to stay continuous across the field's
      // longitude seam; without them, sample the base level only.
      mipmaps = derivatives && !!gl.getExtension('EXT_shader_texture_lod');
      const defines =
        (derivatives ? '#define USE_CHROMATIC_DERIVATIVES\n' : '') +
        (mipmaps ? '#define USE_CHROMATIC_TEXTURE_LOD\n' : '');
      fragment = compile(gl.FRAGMENT_SHADER, defines + chromaticFragmentShader);
      if (!vertex || !fragment) {
        release();
        return;
      }
      program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        release();
        return;
      }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([20, 0, 35, 255]),
      );
      uniforms = Object.fromEntries(
        [
          'size',
          'resolution',
          'grid',
          'gap',
          'time',
          'phase',
          'feather',
          'projectionScale',
          'centerProjectionScale',
          'borderRadius',
          'intensity',
          'grain',
          'spread',
          'seed',
          'color',
          'colorMode',
          'color2',
          'color3',
          'field',
          'hover',
          'hoverEffect',
          'hoverPosition',
        ].map((name) => [name, gl.getUniformLocation(program!, `u_${name}`)]),
      );
      uploadField();
    };
    const canAnimate = () =>
      !!program &&
      !lost &&
      visible &&
      !document.hidden &&
      !motion.matches &&
      ((!settings.current.paused && settings.current.speed !== 0) ||
        Math.abs(hoverTarget - hover) > 0.001);
    const draw = () => {
      if (!program || lost) return;
      const s = settings.current;
      const gridX = Math.round(finite(s.columns, 1, 1, 24));
      const gridY = Math.round(finite(s.rows, 1, 1, 24));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.grid, gridX, gridY);
      gl.uniform1f(
        uniforms.gap,
        finite(s.gap, 0, 0, Math.max(0, Math.min(width / gridX, height / gridY) - 4)),
      );
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.hover, button?.disabled || s.hoverEffect === 'none' ? 0 : hover);
      gl.uniform1f(uniforms.hoverEffect, Math.max(0, chromaticHoverEffects.indexOf(s.hoverEffect)));
      gl.uniform2f(uniforms.hoverPosition, ...hoverPosition);
      gl.uniform1f(uniforms.phase, finite(s.phase, 0, -1000, 1000));
      gl.uniform1f(uniforms.feather, finite(s.feather, 95, 0, 100));
      const projectionScale = finite(s.projectionScale, 174, 90, 179.5);
      gl.uniform1f(uniforms.projectionScale, projectionScale);
      gl.uniform1f(
        uniforms.centerProjectionScale,
        finite(s.centerProjectionScale ?? projectionScale, projectionScale, 90, 179.5),
      );
      gl.uniform1f(
        uniforms.borderRadius,
        s.borderRadius === undefined ? -1 : finite(s.borderRadius, 50, 0, 50) / 50,
      );
      gl.uniform1f(uniforms.intensity, finite(s.intensity, 1.15, 0, 3));
      gl.uniform1f(uniforms.grain, finite(s.grain, 0.035, 0, 0.5));
      gl.uniform1f(uniforms.spread, finite(s.colorSpread, 0, 0, 2));
      gl.uniform1f(uniforms.seed, finite(s.seed, 7, 0, 65535));
      gl.uniform3fv(uniforms.color, parseColor(s.color));
      gl.uniform1f(uniforms.colorMode, chromaticColorModes.indexOf(s.colorMode));
      gl.uniform3fv(uniforms.color2, parseColor(s.color2));
      gl.uniform3fv(uniforms.color3, parseColor(s.color3));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.field, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const tick = (now: number) => {
      frame = 0;
      if (!canAnimate()) {
        previous = 0;
        return;
      }
      if (previous) {
        const delta = Math.min((now - previous) / 1000, 0.1);
        if (!settings.current.paused) elapsed += delta * finite(settings.current.speed, 0.7, 0, 4);
        hover += (hoverTarget - hover) * (1 - Math.exp(-delta * 14));
        if (Math.abs(hoverTarget - hover) <= 0.001) hover = hoverTarget;
      }
      previous = now;
      draw();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    };
    const syncHover = () => {
      hoverTarget =
        button &&
        !button.disabled &&
        settings.current.hoverEffect !== 'none' &&
        (pointerOver || keyboardFocus)
          ? 1
          : 0;
      if (motion.matches || settings.current.hoverEffect === 'none' || button?.disabled)
        hover = hoverTarget;
    };
    const wakeHover = () => {
      syncHover();
      if (!frame) {
        previous = 0;
        draw();
        if (canAnimate()) frame = requestAnimationFrame(tick);
      }
    };
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerOver = true;
      wakeHover();
    };
    const onLeave = () => {
      pointerOver = false;
      wakeHover();
    };
    const onFocus = () => {
      keyboardFocus = !!button?.matches(':focus-visible');
      if (keyboardFocus) hoverPosition = [0, 0];
      wakeHover();
    };
    const onBlur = () => {
      keyboardFocus = false;
      wakeHover();
    };
    const onMove = (event: PointerEvent) => {
      if (
        !button ||
        button.disabled ||
        event.pointerType === 'touch' ||
        settings.current.hoverEffect !== 'spotlight'
      )
        return;
      const rect = button.getBoundingClientRect();
      hoverPosition = [
        Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1)),
        Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)),
      ];
      if (!frame) draw();
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      syncHover();
      draw();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      // Use layout dimensions so entrance/press transforms do not lower the resolution.
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1500000 / (width * height)));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      refresh();
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      delete canvas.dataset.renderer;
    };
    const onRestored = () => {
      lost = false;
      release();
      initialize();
      resize();
    };
    function uploadField() {
      if (disposed || lost || !program || !texture) return;
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      // The field is generated in code (see chromatic-field.ts), no image.
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        chromaticFieldSize,
        chromaticFieldSize,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        chromaticField(),
      );
      if (mipmaps) {
        gl!.generateMipmap(gl!.TEXTURE_2D);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
      }
      canvas.dataset.renderer = 'webgl';
      refresh();
    }
    initialize();
    button?.addEventListener('pointerenter', onEnter);
    button?.addEventListener('pointerleave', onLeave);
    button?.addEventListener('pointercancel', onLeave);
    button?.addEventListener('pointermove', onMove);
    button?.addEventListener('focus', onFocus);
    button?.addEventListener('blur', onBlur);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', refresh);
    motion.addEventListener('change', refresh);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    updateRef.current = refresh;
    resize();
    return () => {
      disposed = true;
      updateRef.current = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      motion.removeEventListener('change', refresh);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      delete canvas.dataset.renderer;
      release();
      button?.removeEventListener('pointerenter', onEnter);
      button?.removeEventListener('pointerleave', onLeave);
      button?.removeEventListener('pointercancel', onLeave);
      button?.removeEventListener('pointermove', onMove);
      button?.removeEventListener('focus', onFocus);
      button?.removeEventListener('blur', onBlur);
    };
  }, []);

  return <canvas ref={canvasRef} className="chromatic-surface" aria-hidden="true" />;
}
