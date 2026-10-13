import { createRef, forwardRef, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { gsap } from 'gsap';
import { createAgentCustomLensCurve } from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-search-curve';
import { createAgentMotion } from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-motion';
import {
  FluidAgentOrb as AnimatedFluidAgentOrb,
  fluidAgentOrbStates,
  fluidAgentOrbThinkingAnimations,
  fluidAgentOrbThinkingAnimationLabels,
  fluidAgentOrbSearchingAnimations,
  fluidAgentOrbSearchingAnimationLabels,
  fluidAgentOrbDefaults,
  fluidAgentOrbPresets,
  fluidAgentOrbSearchCurveDefaults,
  type FluidAgentOrbSearchCurve,
  type FluidAgentOrbHandle,
  type FluidAgentOrbProps,
  type FluidAgentOrbState,
} from '../packages/components/src/fluid-agent-orb';
import {
  FluidGlassGradient,
  type FluidGlassGradientProps,
} from '../packages/components/src/fluid-glass-gradient';
import {
  fluidGlassGradientDefaults,
  fluidGlassGradientPresets,
} from '../packages/components/src/fluid-glass-gradient/fluid-glass-gradient-renderer';

// Material/state checks need a settled compositor; entrance has its own tests.
const FluidAgentOrb = forwardRef<FluidAgentOrbHandle, FluidAgentOrbProps>((props, ref) => (
  <AnimatedFluidAgentOrb animateEntrance={false} {...props} ref={ref} />
));

const frames = new Map<HTMLCanvasElement, Uint8Array>();
const draws = new Map<HTMLCanvasElement, number>();
let programs: Set<WebGLProgram>, buffers: Set<WebGLBuffer>, textures: Set<WebGLTexture>;
beforeEach(() => {
  programs = new Set();
  buffers = new Set();
  textures = new Set();
  frames.clear();
  draws.clear();
  for (const [createName, deleteName, resources] of [
    ['createProgram', 'deleteProgram', programs],
    ['createBuffer', 'deleteBuffer', buffers],
    ['createTexture', 'deleteTexture', textures],
  ] as const) {
    const create = WebGLRenderingContext.prototype[createName];
    const destroy = WebGLRenderingContext.prototype[deleteName];
    vi.spyOn(WebGLRenderingContext.prototype, createName).mockImplementation(function (
      this: WebGLRenderingContext,
    ) {
      const resource = create.call(this);
      if (resource) (resources as Set<object>).add(resource);
      return resource as WebGLProgram & WebGLBuffer & WebGLTexture;
    });
    vi.spyOn(WebGLRenderingContext.prototype, deleteName).mockImplementation(function (
      this: WebGLRenderingContext,
      resource: WebGLProgram | WebGLBuffer | WebGLTexture | null,
    ) {
      if (resource) (resources as Set<object>).delete(resource);
      destroy.call(this, resource);
    });
  }
  const draw = WebGLRenderingContext.prototype.drawArrays;
  vi.spyOn(WebGLRenderingContext.prototype, 'drawArrays').mockImplementation(function (
    this: WebGLRenderingContext,
    ...args
  ) {
    draw.apply(this, args);
    if (this.getParameter(this.FRAMEBUFFER_BINDING)) return;
    const canvas = this.canvas as HTMLCanvasElement;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    this.readPixels(0, 0, canvas.width, canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
    frames.set(canvas, pixels);
    draws.set(canvas, (draws.get(canvas) ?? 0) + 1);
  });
});
afterEach(() => {
  cleanup();
  expect(programs.size).toBe(0);
  expect(buffers.size).toBe(0);
  expect(textures.size).toBe(0);
  vi.restoreAllMocks();
});
async function ready(container: HTMLElement) {
  await waitFor(() =>
    expect(container.querySelectorAll('[data-flow-ready="true"]').length).toBe(
      container.querySelectorAll('.fluid-glass-gradient').length,
    ),
  );
  const canvas = container.querySelector('canvas')!;
  await waitFor(() => expect(frames.has(canvas)).toBe(true));
  const gl = canvas.getContext('webgl')!;
  return { canvas, gl, program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram };
}
const difference = (a: Uint8Array, b: Uint8Array) =>
  a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;

it('owns its default entrance without a catalog wrapper, including in StrictMode', async () => {
  const view = (state: FluidAgentOrbState) => (
    <StrictMode>
      <AnimatedFluidAgentOrb state={state} size={96} paused />
    </StrictMode>
  );
  const { container, rerender } = render(view('idle'));
  const host = container.querySelector<HTMLElement>('.fluid-agent-orb')!;
  const { canvas, gl, program } = await ready(container);
  expect(fluidAgentOrbDefaults.animateEntrance).toBe(true);
  expect(host).toHaveClass('fluid-agent-orb--entrance');
  expect(host.getBoundingClientRect().width).toBeLessThan(96);
  const resources = [programs.size, buffers.size, textures.size];
  const size = [canvas.width, canvas.height];
  await waitFor(() => expect(host).toHaveAttribute('data-orb-entered', 'true'), { timeout: 3000 });
  expect(host.getBoundingClientRect().width).toBeCloseTo(96);
  expect(getComputedStyle(host).opacity).toBe('1');
  expect([canvas.width, canvas.height]).toEqual(size);
  expect([programs.size, buffers.size, textures.size]).toEqual(resources);
  rerender(view('error'));
  await waitFor(() => expect(host).toHaveAttribute('data-state', 'error'));
  expect(host).toHaveAttribute('data-orb-entered', 'true');
  expect(gsap.getTweensOf(host)).toHaveLength(0);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  rerender(view('speaking'));
  await waitFor(() => expect(host.getBoundingClientRect().width).toBeGreaterThan(96));
  expect(host).toHaveAttribute('data-orb-entered', 'true');
});

it('can disable an ongoing entrance and replay it by re-enabling the prop', async () => {
  const { container, rerender } = render(<AnimatedFluidAgentOrb size={96} paused />);
  await ready(container);
  const host = container.querySelector<HTMLElement>('.fluid-agent-orb')!;
  rerender(<AnimatedFluidAgentOrb size={96} paused animateEntrance={false} />);
  expect(host).not.toHaveClass('fluid-agent-orb--entrance');
  expect(host.getBoundingClientRect().width).toBeCloseTo(96);
  expect(getComputedStyle(host).opacity).toBe('1');
  expect(gsap.getTweensOf(host)).toHaveLength(0);
  rerender(<AnimatedFluidAgentOrb size={96} paused animateEntrance />);
  expect(host).toHaveClass('fluid-agent-orb--entrance');
  expect(host.getBoundingClientRect().width).toBeLessThan(96);
  await waitFor(() => expect(host).toHaveAttribute('data-orb-entered', 'true'), { timeout: 3000 });
  expect(host.getBoundingClientRect().width).toBeCloseTo(96);
});

it.each(['success', 'error', 'thinking', 'searching'] as const)(
  'keeps %s icon relief independent of voice Responsiveness',
  async (state) => {
    const { container, rerender } = render(
      <FluidAgentOrb state={state} intensity={0} size={96} paused />,
    );
    const { canvas, gl, program } = await ready(container);
    const original = frames.get(canvas)!.slice();
    rerender(<FluidAgentOrb state={state} intensity={2} size={96} paused />);
    await waitFor(() =>
      expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentIntensity')!)).toBe(2),
    );
    expect(difference(original, frames.get(canvas)!)).toBe(0);
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
    // The material's explicit Relief control remains effective.
    rerender(<FluidAgentOrb state={state} intensity={2} relief={1} size={96} paused />);
    await waitFor(() =>
      expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBe(1),
    );
    expect(difference(original, frames.get(canvas)!)).toBeGreaterThan(0.1);
  },
);

it('uses Responsiveness for microphone voice response without hiding its resting shape', async () => {
  const { container, rerender } = render(
    <FluidAgentOrb state="listening" audioLevel={1} intensity={0} size={96} paused />,
  );
  const { canvas, gl, program } = await ready(container);
  const original = frames.get(canvas)!.slice();
  rerender(<FluidAgentOrb state="listening" audioLevel={0} intensity={0} size={96} paused />);
  await waitFor(() =>
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentVoice')!)).toBe(0),
  );
  expect(difference(original, frames.get(canvas)!)).toBe(0);
  rerender(<FluidAgentOrb state="listening" audioLevel={1} intensity={2} size={96} paused />);
  await waitFor(() =>
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentIntensity')!)).toBe(2),
  );
  expect(difference(original, frames.get(canvas)!)).toBeGreaterThan(0.1);
});

it('keeps pointer interaction disabled even when an older integration enables it', async () => {
  const { container } = render(<FluidAgentOrb interactive size={96} paused />);
  const { canvas, gl, program } = await ready(container);
  const original = frames.get(canvas)!.slice();
  const host = container.querySelector<HTMLElement>('.fluid-agent-orb')!;
  const bounds = host.getBoundingClientRect();
  fireEvent.pointerMove(host, { clientX: bounds.left + 12, clientY: bounds.top + 12 });
  await act(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uPointerActive')!)).toBe(0);
  expect(difference(original, frames.get(canvas)!)).toBe(0);
});

it('inherits Fluid Glass material and palettes with the custom orb defaults', async () => {
  const changedDefaults = new Set([
    'distortion',
    'grain',
    ...Object.keys(fluidGlassGradientPresets.monochrome),
  ]);
  for (const [key, value] of Object.entries(fluidGlassGradientDefaults))
    if (!changedDefaults.has(key))
      expect(fluidAgentOrbDefaults[key as keyof typeof fluidAgentOrbDefaults], key).toEqual(value);
  expect(fluidAgentOrbPresets).toMatchObject({
    ...fluidGlassGradientPresets,
    honey: { ...fluidGlassGradientPresets.honey, seed: 58 },
  });
  expect(fluidAgentOrbDefaults).toMatchObject(fluidGlassGradientPresets.monochrome);
  expect(fluidAgentOrbDefaults.grain).toBe(0.3);
  expect(fluidAgentOrbDefaults.distortion).toBe(0.8);
  expect(fluidAgentOrbDefaults.size).toBe(250);
  expect(fluidAgentOrbDefaults.state).toBe('idle');
  expect(fluidAgentOrbDefaults.thinkingAnimation).toBe('ripples');
  expect(fluidAgentOrbDefaults.searchingAnimation).toBe('lens');
  const html = renderToString(<FluidAgentOrb />);
  expect(html).toContain('data-shape="circle"');
  expect(html).toContain('data-state="idle"');
  expect(html).toContain('250px');
  const { container } = render(<FluidAgentOrb state="thinking" size={96} paused />);
  const { gl, program } = await ready(container);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uFleck')!)).toBeCloseTo(0.3);
  expect(
    Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentThinkingModes')!)),
  ).toEqual([0, 1, 0, 0]);
});

it.each([
  { derivatives: true, state: 'idle' },
  { derivatives: false, state: 'idle' },
  { derivatives: true, state: 'speaking' },
  { derivatives: false, state: 'speaking' },
] as const)(
  'matches native circular Fluid Glass pixel for pixel without voice in $state (derivatives: $derivatives)',
  async ({ derivatives, state }) => {
    if (!derivatives) {
      const get = WebGLRenderingContext.prototype.getExtension;
      vi.spyOn(WebGLRenderingContext.prototype, 'getExtension').mockImplementation(function (
        this: WebGLRenderingContext,
        name: string,
      ) {
        return name === 'OES_standard_derivatives' ? null : Reflect.apply(get, this, [name]);
      });
    }
    const variants: FluidGlassGradientProps[] = [
      {},
      { preset: 'monochrome', distortion: 8, scale: 0.64, startTime: 360 },
      { clusterCount: 0, grain: 0, relief: 1.8, softness: 0.55 },
      {
        flowType: 'wave',
        reliefFade: true,
        reliefFadeSide: 'right',
        reliefFadeAmount: 25,
        rotation: 38,
      },
      {
        preset: 'cobalt-dark',
        flowType: 'vortex',
        grainMode: 'coarse',
        grainSize: 2,
        caustics: 0.5,
        dispersion: 0.4,
      },
    ];
    const pair = (props: FluidGlassGradientProps) => (
      <div
        style={{ display: 'flex', gap: 24, padding: 24, background: '#111', width: 'max-content' }}
      >
        <div style={{ width: 160 }}>
          <FluidGlassGradient
            {...{
              seed: fluidAgentOrbDefaults.seed,
              startTime: fluidAgentOrbDefaults.startTime,
              distortion: fluidAgentOrbDefaults.distortion,
              grain: fluidAgentOrbDefaults.grain,
              baseColor: fluidAgentOrbDefaults.baseColor,
              colorA: fluidAgentOrbDefaults.colorA,
              colorB: fluidAgentOrbDefaults.colorB,
              colorC: fluidAgentOrbDefaults.colorC,
            }}
            {...(props.preset ? fluidAgentOrbPresets[props.preset] : {})}
            {...props}
            shape="circle"
            size={160}
            paused
          />
          <p>Fluid Glass Gradient</p>
        </div>
        <div style={{ width: 160 }}>
          <FluidAgentOrb
            {...props}
            preserveWhites={false}
            state={state}
            audioLevel={0}
            shape="circle"
            size={160}
            paused
          />
          <p>Fluid Agent Orb · {state}</p>
        </div>
      </div>
    );
    const { container, rerender } = render(pair(variants[0]));
    await ready(container);
    const canvases = Array.from(container.querySelectorAll('canvas'));
    for (let i = 0; i < variants.length; i++) {
      if (i) {
        const before = canvases.map((canvas) => draws.get(canvas)!);
        rerender(pair(variants[i]));
        await waitFor(() =>
          canvases.forEach((canvas, j) => expect(draws.get(canvas)).toBeGreaterThan(before[j])),
        );
      }
      expect(canvases[0].width).toBe(canvases[1].width);
      expect(difference(frames.get(canvases[0])!, frames.get(canvases[1])!), `variant ${i}`).toBe(
        0,
      );
      expect(canvases[1].parentElement).toHaveStyle({ borderRadius: '50%', aspectRatio: '1' });
      expect(canvases[1].getContext('webgl')!.getError()).toBe(0);
      if (i === 0 && derivatives && state === 'idle')
        await page
          .elementLocator(container.firstElementChild!)
          .screenshot({ path: '.vitest/attachments/fluid-agent-orb/native-parity.png' });
    }
  },
  60000,
);

it('renders palette whites brightly and restores the previous treatment without changing the material settings', async () => {
  await page.viewport(680, 380);
  const settings = {
    size: 250,
    paused: true,
    state: 'searching' as const,
    seed: 92,
    baseColor: '#ffffff',
    colorA: '#5d027e',
    colorB: '#ffffff',
    colorC: '#fafafa',
    grain: 0,
  };
  const { container, rerender } = render(
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 250px)',
        gap: 24,
        padding: 24,
        background: '#111',
        color: '#eee',
        width: 'max-content',
      }}
    >
      <div>
        <FluidAgentOrb {...settings} preserveWhites={false} />
        <p>Before</p>
      </div>
      <div>
        <FluidAgentOrb {...settings} />
        <p>Preserve whites</p>
      </div>
    </div>,
  );
  await ready(container);
  const canvases = Array.from(container.querySelectorAll('canvas'));
  const brightWhites = (pixels: Uint8Array) => {
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (low > 230 && high - low < 20) count++;
    }
    return count;
  };
  const before = frames.get(canvases[0])!.slice(),
    corrected = frames.get(canvases[1])!.slice();
  expect(brightWhites(corrected)).toBeGreaterThan(brightWhites(before) * 1.3);
  const canvas = canvases[1],
    gl = canvas.getContext('webgl')!,
    program = gl.getParameter(gl.CURRENT_PROGRAM);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uSalt')!)).toBe(92);
  await page
    .elementLocator(container.firstElementChild!)
    .screenshot({ path: '.vitest/attachments/fluid-agent-orb/white-before-after.png' });
  const count = draws.get(canvas)!;
  rerender(
    <div>
      <div>
        <FluidAgentOrb {...settings} preserveWhites={false} />
      </div>
      <div>
        <FluidAgentOrb {...settings} preserveWhites={false} />
      </div>
    </div>,
  );
  await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(count));
  expect(difference(before, frames.get(canvas)!)).toBe(0);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
});

it('renders an unlit pure-white palette as actual white', async () => {
  const { container } = render(
    <FluidAgentOrb
      size={64}
      paused
      grain={0}
      relief={0}
      reflection={0}
      refraction={0}
      baseColor="#ffffff"
      colorA="#ffffff"
      colorB="#ffffff"
      colorC="#ffffff"
    />,
  );
  const { canvas } = await ready(container);
  expect(Array.from(frames.get(canvas)!).every((value) => value === 255)).toBe(true);
});

it('distinguishes glass states while Speaking adds voice depth to the native folds', async () => {
  await page.viewport(1100, 760);
  const { container } = render(
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 220px)',
        gap: 18,
        padding: 24,
        width: 'max-content',
        background: '#111',
        color: '#eee',
      }}
    >
      {fluidAgentOrbStates.map((state) => (
        <div key={state} style={{ textAlign: 'center' }}>
          <FluidAgentOrb state={state} seed={92} size={220} paused audioLevel={0.55} />
          <p>{state}</p>
        </div>
      ))}
    </div>,
  );
  await ready(container);
  const canvases = Array.from(container.querySelectorAll('canvas'));
  for (const canvas of canvases) {
    const gl = canvas.getContext('webgl')!,
      program = gl.getParameter(gl.CURRENT_PROGRAM);
    for (const [name, value] of Object.entries({
      uBend: 0.8,
      uSalt: 92,
      uClusterCount: 7.2,
      uClusterIntensity: 3,
      uClusterSize: 22.5,
      uZoom: 0.23,
      uRelief: 2.94,
      uRefraction: 0.65,
      uReflection: 1.3,
      uEase: 0.31,
      uTwist: 0,
    }))
      expect(gl.getUniform(program, gl.getUniformLocation(program, name)!), name).toBeCloseTo(
        value,
      );
    expect(gl.getError()).toBe(0);
  }
  for (let i = 0; i < canvases.length; i++)
    for (let j = i + 1; j < canvases.length; j++) {
      const change = difference(frames.get(canvases[i])!, frames.get(canvases[j])!);
      const label = `${fluidAgentOrbStates[i]} vs ${fluidAgentOrbStates[j]}`;
      if (fluidAgentOrbStates[i] === 'idle' && fluidAgentOrbStates[j] === 'speaking')
        expect(change, label).toBeGreaterThan(1);
      else expect(change, label).toBeGreaterThan(3);
    }
  await page
    .elementLocator(container.firstElementChild!)
    .screenshot({ path: '.vitest/attachments/fluid-agent-orb/states.png' });
});

it('renders three distinct full-surface Thinking animations with the same glass material', async () => {
  await page.viewport(950, 380);
  const { container } = render(
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 250px)',
        gap: 18,
        padding: 24,
        background: '#111',
        color: '#eee',
        width: 'max-content',
      }}
    >
      {fluidAgentOrbThinkingAnimations.map((animation) => (
        <div key={animation} style={{ textAlign: 'center' }}>
          <FluidAgentOrb state="thinking" thinkingAnimation={animation} size={250} paused />
          <p>{fluidAgentOrbThinkingAnimationLabels[animation]}</p>
        </div>
      ))}
    </div>,
  );
  await ready(container);
  const canvases = Array.from(container.querySelectorAll('canvas'));
  canvases.forEach((canvas, index) => {
    const gl = canvas.getContext('webgl')!,
      program = gl.getParameter(gl.CURRENT_PROGRAM);
    expect(
      Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentThinkingModes')!)),
    ).toEqual([0, 1, 2, 3].map((value) => (value === index ? 1 : 0)));
    for (const [name, value] of Object.entries({
      uRelief: 2.94,
      uRefraction: 0.65,
      uReflection: 1.3,
      uTwist: 0,
    }))
      expect(gl.getUniform(program, gl.getUniformLocation(program, name)!), name).toBeCloseTo(
        value,
      );
    expect(gl.getError()).toBe(0);
  });
  for (let i = 0; i < canvases.length; i++)
    for (let j = i + 1; j < canvases.length; j++)
      expect(difference(frames.get(canvases[i])!, frames.get(canvases[j])!)).toBeGreaterThan(4);
  await page
    .elementLocator(container.firstElementChild!)
    .screenshot({ path: '.vitest/attachments/fluid-agent-orb/thinking-animations.png' });
});

it('moves Searching lenses along a circular orbit and continuous intervals with the same glass material', async () => {
  await page.viewport(680, 380);
  const { container } = render(
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 250px)',
        gap: 24,
        padding: 24,
        background: '#111',
        color: '#eee',
        width: 'max-content',
      }}
    >
      {fluidAgentOrbSearchingAnimations.map((animation) => (
        <div key={animation} style={{ textAlign: 'center' }}>
          <FluidAgentOrb state="searching" searchingAnimation={animation} size={250} paused />
          <p>{fluidAgentOrbSearchingAnimationLabels[animation]}</p>
        </div>
      ))}
    </div>,
  );
  await ready(container);
  const canvases = Array.from(container.querySelectorAll('canvas'));
  const resources = [programs.size, buffers.size, textures.size];
  for (const [index, canvas] of canvases.entries()) {
    const gl = canvas.getContext('webgl')!,
      program = gl.getParameter(gl.CURRENT_PROGRAM);
    expect(
      Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentSearchingModes')!)),
    ).toEqual(index === 0 ? [1, 0, 0, 0] : [0, 1, 0, 0]);
    for (const [name, value] of Object.entries({
      uRelief: 2.94,
      uRefraction: 0.65,
      uReflection: 1.3,
      uTwist: 0,
    }))
      expect(gl.getUniform(program, gl.getUniformLocation(program, name)!), name).toBeCloseTo(
        value,
      );
    expect(canvas.parentElement).toHaveAttribute('data-shape', 'circle');
  }
  expect(difference(frames.get(canvases[0])!, frames.get(canvases[1])!)).toBeGreaterThan(3);
  const normalGl = canvases[0].getContext('webgl')!,
    normalProgram = normalGl.getParameter(normalGl.CURRENT_PROGRAM),
    normalClock = normalGl.getUniformLocation(normalProgram, 'uAgentClock')!;
  expect(
    Array.from(
      normalGl.getUniform(
        normalProgram,
        normalGl.getUniformLocation(normalProgram, 'uAgentLensCurve')!,
      ),
    ),
  ).toEqual([expect.closeTo(4.245, 5), 1, 2, 6]);
  expect(
    normalGl.getUniform(
      normalProgram,
      normalGl.getUniformLocation(normalProgram, 'uAgentLensPosition')!,
    ),
  ).toBe(1.5);
  const sampleCurve = createAgentCustomLensCurve(fluidAgentOrbSearchCurveDefaults.bezier);
  const lap = fluidAgentOrbSearchCurveDefaults.duration * 1.5;
  const sampleNormal = (time: number) => {
    normalGl.uniform1f(
      normalGl.getUniformLocation(normalProgram, 'uAgentLensCustomPhase'),
      sampleCurve((((time / lap) % 1) + 1) % 1),
    );
    normalGl.uniform1f(normalClock, time);
    normalGl.drawArrays(normalGl.TRIANGLES, 0, 3);
    return frames.get(canvases[0])!.slice();
  };
  const orbit = [0, 0.25, 0.5, 0.75].map((fraction) => sampleNormal(lap * fraction));
  for (let i = 0; i < orbit.length; i++)
    for (let j = i + 1; j < orbit.length; j++)
      expect(difference(orbit[i], orbit[j])).toBeGreaterThan(0.5);
  expect(difference(orbit[0], sampleNormal(lap))).toBeLessThan(0.05);
  // The incoming pickup is already moving before the outgoing lap ends.
  for (const fraction of [0, 0.5, 0.85, 0.9, 0.95, 0.99, 1])
    expect(
      difference(sampleNormal(lap * fraction), sampleNormal(lap * (fraction + 0.025))),
    ).toBeGreaterThan(0.05);
  expect(difference(sampleNormal(lap - 0.0001), sampleNormal(lap + 0.0001))).toBeLessThan(0.05);
  sampleNormal(0);
  await page
    .elementLocator(container.firstElementChild!)
    .screenshot({ path: '.vitest/attachments/fluid-agent-orb/searching-animations.png' });
  const canvas = canvases[1],
    gl = canvas.getContext('webgl')!,
    program = gl.getParameter(gl.CURRENT_PROGRAM);
  const clock = gl.getUniformLocation(program, 'uAgentClock')!;
  const sample = (time: number) => {
    gl.uniform1f(clock, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return frames.get(canvas)!.slice();
  };
  const firstFrame = sample(0);
  expect(difference(firstFrame, sample(0.5))).toBeGreaterThan(0.5);
  expect(difference(firstFrame, sample(1.4))).toBeGreaterThan(2);
  expect(difference(sample(2.1), sample(2.7))).toBeGreaterThan(0.5);
  for (const boundary of [2, 4, 6, 8, 10, 12]) {
    // The lens keeps moving through every interval and through the loop seam.
    expect(difference(sample(boundary - 0.06), sample(boundary + 0.06))).toBeGreaterThan(0.05);
    expect(difference(sample(boundary - 0.0001), sample(boundary + 0.0001))).toBeLessThan(0.3);
  }
  expect(difference(firstFrame, sample(6 / 0.5))).toBe(0);
  expect([programs.size, buffers.size, textures.size]).toEqual(resources);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  expect(gl.getError()).toBe(0);
});

it('removes the seeded organic distortion from active glass patterns', async () => {
  const neutral = {
    size: 128,
    paused: true,
    distortion: 0,
    grain: 0,
    baseColor: '#78a9a9',
    colorA: '#78a9a9',
    colorB: '#78a9a9',
    colorC: '#78a9a9',
  };
  const { container, rerender } = render(<FluidAgentOrb {...neutral} state="listening" seed={0} />);
  const { canvas } = await ready(container);
  for (const state of fluidAgentOrbStates.filter(
    (state) => state !== 'idle' && state !== 'speaking',
  )) {
    let before = draws.get(canvas)!;
    rerender(<FluidAgentOrb {...neutral} state={state} seed={1} />);
    await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
    const a = frames.get(canvas)!.slice();
    before = draws.get(canvas)!;
    rerender(<FluidAgentOrb {...neutral} state={state} seed={183} />);
    await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
    // Flat pigment isolates glass geometry: active motifs have no seeded
    // organic relief left; the original seed still controls Idle and Speaking.
    expect(difference(a, frames.get(canvas)!), state).toBeLessThan(0.02);
  }
});

it('keeps the background identical across states when glass relief and optics are disabled', async () => {
  const settings = {
    size: 128,
    paused: true,
    grain: 0,
    relief: 0,
    reflection: 0,
    refraction: 0,
    caustics: 0,
    audioLevel: 1,
  };
  const { container, rerender } = render(<FluidAgentOrb {...settings} state="idle" />);
  const { canvas } = await ready(container);
  const background = frames.get(canvas)!.slice();
  for (const state of fluidAgentOrbStates.slice(1)) {
    const before = draws.get(canvas)!;
    rerender(<FluidAgentOrb {...settings} state={state} />);
    await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
    expect(difference(background, frames.get(canvas)!), state).toBe(0);
  }
});

it('lets Distortion bend the active glass pattern while Relief stays fixed', async () => {
  const props = { state: 'thinking' as const, size: 128, paused: true, grain: 0 };
  const { container, rerender } = render(<FluidAgentOrb {...props} distortion={0} />);
  const { canvas, gl, program } = await ready(container);
  const original = frames.get(canvas)!.slice(),
    before = draws.get(canvas)!;
  rerender(<FluidAgentOrb {...props} distortion={8} />);
  await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
  expect(difference(original, frames.get(canvas)!)).toBeGreaterThan(1);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
});

it('responds to voice in Listening and Speaking while keeping the base material fixed', async () => {
  const settings = { size: 128, paused: true, grain: 0 };
  const { container, rerender } = render(
    <FluidAgentOrb {...settings} state="idle" audioLevel={0.55} />,
  );
  const { canvas, gl, program } = await ready(container);
  for (const state of fluidAgentOrbStates) {
    let before = draws.get(canvas)!;
    rerender(<FluidAgentOrb {...settings} state={state} audioLevel={0} />);
    await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
    const quiet = frames.get(canvas)!.slice();
    before = draws.get(canvas)!;
    rerender(<FluidAgentOrb {...settings} state={state} audioLevel={1} />);
    await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
    const change = difference(quiet, frames.get(canvas)!);
    if (state === 'listening' || state === 'speaking') expect(change, state).toBeGreaterThan(2);
    else expect(change, state).toBe(0);
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uTwist')!)).toBe(0);
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  }
});

it('pulses Speaking relief and the circle with voice while preserving the drawing buffer', async () => {
  const ref = createRef<FluidAgentOrbHandle>();
  const { container, rerender } = render(
    <FluidAgentOrb ref={ref} state="speaking" audioLevel={0} size={128} paused />,
  );
  const { canvas, gl, program } = await ready(container);
  const host = canvas.parentElement!;
  const bufferSize = [canvas.width, canvas.height];
  expect(host.getBoundingClientRect().width).toBeCloseTo(128);
  const original = frames.get(canvas)!.slice(),
    resources = [programs.size, buffers.size, textures.size];
  act(() => ref.current!.setAudioLevel(1));
  await waitFor(() =>
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentVoice')!)).toBe(1),
  );
  const fullVoiceChange = difference(original, frames.get(canvas)!);
  expect(fullVoiceChange).toBeGreaterThan(2);
  const fullVoice = frames.get(canvas)!.slice();
  const warpClock = gl.getUniformLocation(program, 'uAgentWarpOffset')!;
  expect(warpClock).toBeTruthy();
  gl.uniform1f(warpClock, 0.5);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  expect(difference(fullVoice, frames.get(canvas)!)).toBeGreaterThan(0);
  gl.uniform1f(warpClock, 0);
  const speechClock = gl.getUniformLocation(program, 'uAgentWrinkleTime')!;
  expect(speechClock).toBeTruthy();
  const strip = document.createElement('canvas');
  strip.dataset.testid = 'speaking-wrinkles';
  strip.width = canvas.width * 4;
  strip.height = canvas.height;
  const preview = strip.getContext('2d')!;
  for (const [index, time] of [0, 0.5, 1, 2].entries()) {
    gl.uniform1f(speechClock, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const image = preview.createImageData(canvas.width, canvas.height);
    const pixels = frames.get(canvas)!;
    for (let y = 0; y < canvas.height; y++) {
      const row = (canvas.height - y - 1) * canvas.width * 4;
      image.data.set(pixels.subarray(row, row + canvas.width * 4), y * canvas.width * 4);
    }
    preview.putImageData(image, index * canvas.width, 0);
  }
  container.append(strip);
  await page.getByTestId('speaking-wrinkles').screenshot({
    path: '.vitest/attachments/fluid-agent-orb/speaking-wrinkles.png',
  });
  strip.remove();
  gl.uniform1f(speechClock, 2);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  expect(difference(fullVoice, frames.get(canvas)!)).toBeGreaterThan(2);
  // New fields enter continuously, including when the bounded clock wraps.
  for (const boundary of [1, 2, 256]) {
    gl.uniform1f(speechClock, boundary - 0.0001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const before = frames.get(canvas)!.slice();
    gl.uniform1f(speechClock, (boundary + 0.0001) % 256);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    expect(difference(before, frames.get(canvas)!), `wrinkle renewal ${boundary}`).toBeLessThan(
      0.3,
    );
  }
  gl.uniform1f(speechClock, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  expect(difference(fullVoice, frames.get(canvas)!)).toBe(0);
  expect(host.style.getPropertyValue('--agent-voice-shift')).toBe('-4.000px');
  const speakingWidth = host.getBoundingClientRect().width;
  expect(speakingWidth).toBeGreaterThan(128 * 1.1);
  expect(host.clientWidth).toBe(128);
  expect([canvas.width, canvas.height]).toEqual(bufferSize);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  rerender(<FluidAgentOrb ref={ref} state="speaking" audioLevel={0.25} size={128} paused />);
  await waitFor(() =>
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentVoice')!)).toBe(0.25),
  );
  expect(difference(original, frames.get(canvas)!)).toBeLessThan(fullVoiceChange);
  expect(host.getBoundingClientRect().width).toBeGreaterThan(128);
  expect(host.getBoundingClientRect().width).toBeLessThan(speakingWidth);
  expect(host.style.getPropertyValue('--agent-voice-shift')).toBe('-1.000px');
  rerender(<FluidAgentOrb ref={ref} state="listening" audioLevel={1} size={128} paused />);
  await waitFor(() => expect(host.getBoundingClientRect().width).toBeCloseTo(128));
  expect(Number.parseFloat(host.style.getPropertyValue('--agent-voice-shift'))).toBe(0);
  rerender(<FluidAgentOrb ref={ref} state="idle" audioLevel={1} size={128} paused />);
  await waitFor(() => expect(host).toHaveAttribute('data-state', 'idle'));
  await waitFor(() =>
    expect(
      (gl.getUniform(program, gl.getUniformLocation(program, 'uAgentModesA')!) as Float32Array)[0],
    ).toBe(1),
  );
  expect(host.getBoundingClientRect().width).toBeCloseTo(128);
  expect(difference(original, frames.get(canvas)!)).toBe(0);
  rerender(
    <FluidAgentOrb ref={ref} state="speaking" intensity={0} audioLevel={1} size={128} paused />,
  );
  await waitFor(() => expect(host).toHaveAttribute('data-state', 'speaking'));
  await waitFor(() =>
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentIntensity')!)).toBe(0),
  );
  expect(host.getBoundingClientRect().width).toBeCloseTo(128);
  expect(difference(original, frames.get(canvas)!)).toBe(0);
  expect([canvas.width, canvas.height]).toEqual(bufferSize);
  expect([programs.size, buffers.size, textures.size]).toEqual(resources);
});

it('updates Lens curve controls on the existing GPU program without changing the glass material', async () => {
  const { container, rerender } = render(<FluidAgentOrb state="searching" paused size={96} />);
  const { gl, program } = await ready(container);
  const resources = [programs.size, buffers.size, textures.size];
  const before = frames.get(container.querySelector('canvas')!)!.slice();
  rerender(
    <FluidAgentOrb
      state="searching"
      paused
      size={96}
      searchingCurve={{ duration: 1.8, easing: 'power4.out', position: 2 }}
    />,
  );
  await waitFor(() => {
    expect(
      Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentLensCurve')!)),
    ).toEqual([expect.closeTo(2.7, 5), expect.closeTo(0.7, 5), 2, 5]);
    expect(gl.getUniform(program, gl.getUniformLocation(program, 'uAgentLensPosition')!)).toBe(2);
  });
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  expect([programs.size, buffers.size, textures.size]).toEqual(resources);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRelief')!)).toBeCloseTo(2.94);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uRefraction')!)).toBeCloseTo(0.65);
  expect(difference(before, frames.get(container.querySelector('canvas')!)!)).toBeGreaterThan(0.1);
  rerender(
    <FluidAgentOrb
      state="searching"
      paused
      size={96}
      searchingCurve={{ easing: 'custom', bezier: [0.25, 0.1, 0.25, 1] }}
    />,
  );
  await waitFor(() =>
    expect(
      (
        gl.getUniform(program, gl.getUniformLocation(program, 'uAgentLensCurve')!) as Float32Array
      )[3],
    ).toBe(6),
  );
  const customBefore = frames.get(container.querySelector('canvas')!)!.slice();
  gl.uniform1f(gl.getUniformLocation(program, 'uAgentLensCustomPhase'), 0.35);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  expect(difference(customBefore, frames.get(container.querySelector('canvas')!)!)).toBeGreaterThan(
    0.1,
  );
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  expect([programs.size, buffers.size, textures.size]).toEqual(resources);
});

it('keeps the Lens position continuous when its duration is tuned live', () => {
  let searchingCurve: Partial<FluidAgentOrbSearchCurve> = {};
  const motion = createAgentMotion(() => ({
    ...fluidAgentOrbDefaults,
    searchingCurve,
    audioLevel: 0,
  }));
  const host = document.createElement('div');
  motion.frame(fluidAgentOrbDefaults, 500, true, 0.5, host);
  const fraction = () => {
    const uniforms = motion.uniforms();
    return (uniforms.uAgentClock + uniforms.uAgentLensOffset) / uniforms.uAgentLensCurve[0];
  };
  const before = fraction();
  searchingCurve = { duration: 1.8, easing: 'power4.out', position: 2 };
  motion.frame(fluidAgentOrbDefaults, 500, false, 0, host);
  expect(fraction()).toBeCloseTo(before, 6);
  expect(Array.from(motion.uniforms().uAgentLensCurve)).toEqual([
    expect.closeTo(2.7, 5),
    expect.closeTo(0.7, 5),
    2,
    5,
  ]);
  expect(motion.uniforms().uAgentLensPosition).toBe(2);
  motion.frame(fluidAgentOrbDefaults, 600, true, 0.1, host);
  expect(fraction() - before).toBeCloseTo(0.1 / 1.8, 6);
  const tuned = fraction();
  searchingCurve = fluidAgentOrbSearchCurveDefaults;
  motion.frame(fluidAgentOrbDefaults, 600, false, 0, host);
  expect(fraction()).toBeCloseTo(tuned, 6);
  motion.reset();
  expect(motion.uniforms().uAgentLensOffset).toBe(0);
});

it('adds only a gentle voice speed boost and renews wrinkles without reversing the glass clock', () => {
  let state: FluidAgentOrbState = 'speaking',
    audioLevel = 0,
    intensity = 1;
  const base = { ...fluidGlassGradientDefaults };
  const host = document.createElement('div');
  const motion = createAgentMotion(() => ({
    state,
    audioLevel,
    intensity,
    thinkingAnimation: 'spiral',
    searchingAnimation: 'lens',
  }));
  const advance = (frames: number, moving = true) => {
    for (let i = 0; i < frames; i++) {
      const before = motion.uniforms();
      const glassTime = before.uAgentClock + before.uAgentWarpOffset;
      motion.frame(base, i * 50, moving, 0.05, host);
      const after = motion.uniforms();
      expect(after.uAgentClock + after.uAgentWarpOffset).toBeGreaterThanOrEqual(glassTime - 1e-10);
    }
    return motion.uniforms().uAgentWrinkleTime;
  };
  expect(advance(20)).toBe(0);
  expect(motion.uniforms().uAgentWarpOffset).toBe(0);
  expect(motion.uniforms().uAgentClock).toBeGreaterThan(0);
  audioLevel = 1;
  advance(15);
  const start = motion.uniforms().uAgentWrinkleTime;
  const warpStart = motion.uniforms().uAgentWarpOffset;
  const loudTravel = advance(5) - start;
  // Even full voice renews less than one field per native second.
  expect(loudTravel).toBeGreaterThan(0.05);
  expect(loudTravel).toBeLessThan(0.25 * base.speed * 0.41);
  const extraTravel = motion.uniforms().uAgentWarpOffset - warpStart;
  expect(extraTravel / (0.25 * base.speed)).toBeCloseTo(0.1, 3);
  intensity = 2;
  advance(15);
  const responsiveStart = motion.uniforms().uAgentWarpOffset;
  advance(5);
  expect((motion.uniforms().uAgentWarpOffset - responsiveStart) / (0.25 * base.speed)).toBeCloseTo(
    0.1,
    8,
  );
  intensity = 1;
  audioLevel = 0;
  advance(15);
  const quietStart = motion.uniforms().uAgentWrinkleTime;
  expect(advance(5) - quietStart).toBeLessThan(loudTravel / 5);
  const frozen = motion.uniforms().uAgentWrinkleTime;
  const offset = motion.uniforms().uAgentWarpOffset;
  audioLevel = 1;
  expect(advance(20, false)).toBe(frozen);
  expect(motion.uniforms().uAgentWarpOffset).toBe(offset);
  base.animateDistortion = false;
  expect(advance(20)).toBe(frozen);
  expect(motion.uniforms().uAgentWarpOffset).toBe(offset);
  base.animateDistortion = true;
  state = 'idle';
  advance(80);
  const settled = motion.uniforms().uAgentWrinkleTime;
  const settledOffset = motion.uniforms().uAgentWarpOffset;
  const idleClock = motion.uniforms().uAgentClock;
  expect(advance(10)).toBe(settled);
  expect(motion.uniforms().uAgentWarpOffset).toBe(settledOffset);
  expect(motion.uniforms().uAgentClock).toBeGreaterThan(idleClock);
  expect(base.speed).toBe(fluidGlassGradientDefaults.speed);
  base.startTime += 5;
  motion.frame(base, 0, false, 0, host);
  expect(motion.uniforms().uAgentWarpOffset).toBe(0);
  expect(motion.uniforms().uAgentWrinkleTime).toBe(0);
  motion.reset();
  expect(motion.uniforms().uAgentWarpOffset).toBe(0);
  expect(motion.uniforms().uAgentWrinkleTime).toBe(0);
  state = 'speaking';
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const reduced = createAgentMotion(() => ({
    state,
    audioLevel: 1,
    intensity: 1,
    thinkingAnimation: 'spiral',
    searchingAnimation: 'lens',
  }));
  for (let i = 0; i < 20; i++) reduced.frame(base, i * 50, true, 0.05, host);
  expect(reduced.uniforms().uAgentWarpOffset).toBe(0);
  expect(reduced.uniforms().uAgentWrinkleTime).toBe(0);
  expect(reduced.uniforms().uAgentSpeech).toBe(0);
});

it('blends interrupted states on the native clock without spinning the composition', async () => {
  const { container, rerender } = render(<FluidAgentOrb state="idle" size={96} grain={0} />);
  const { gl, program } = await ready(container);
  const clock = gl.getUniformLocation(program, 'uElapsed')!;
  const modes = gl.getUniformLocation(program, 'uAgentModesA')!;
  const initial = gl.getUniform(program, clock) as number;
  rerender(<FluidAgentOrb state="thinking" thinkingAnimation="spiral" size={96} grain={0} />);
  await waitFor(() =>
    expect((gl.getUniform(program, modes) as Float32Array)[2]).toBeGreaterThan(0.05),
  );
  expect((gl.getUniform(program, modes) as Float32Array)[0]).toBeGreaterThan(0);
  const thinking = gl.getUniformLocation(program, 'uAgentThinkingModes')!;
  for (const [index, animation] of fluidAgentOrbThinkingAnimations.entries()) {
    if (index === 0) continue;
    rerender(<FluidAgentOrb state="thinking" thinkingAnimation={animation} size={96} grain={0} />);
    await waitFor(() =>
      expect((gl.getUniform(program, thinking) as Float32Array)[index]).toBeGreaterThan(0.05),
    );
    const weights = gl.getUniform(program, thinking) as Float32Array;
    expect(weights[index - 1]).toBeGreaterThan(0);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
    expect(gl.getError()).toBe(0);
  }
  rerender(<FluidAgentOrb state="searching" size={96} grain={0} />);
  await waitFor(() =>
    expect((gl.getUniform(program, modes) as Float32Array)[3]).toBeGreaterThan(0.05),
  );
  const searching = gl.getUniformLocation(program, 'uAgentSearchingModes')!;
  rerender(<FluidAgentOrb state="searching" searchingAnimation="small-lens" size={96} grain={0} />);
  await waitFor(() =>
    expect((gl.getUniform(program, searching) as Float32Array)[1]).toBeGreaterThan(0.05),
  );
  const searchWeights = gl.getUniform(program, searching) as Float32Array;
  expect(searchWeights[0]).toBeGreaterThan(0);
  expect(searchWeights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
  expect(gl.getUniform(program, clock)).toBeGreaterThan(initial);
  expect(gl.getUniform(program, gl.getUniformLocation(program, 'uTwist')!)).toBe(0);
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
});

it('holds the Error cross still as the agent animation clock advances', async () => {
  const { container } = render(<FluidAgentOrb state="error" size={128} grain={0} paused />);
  const { canvas, gl, program } = await ready(container);
  const original = frames.get(canvas)!.slice();
  const clock = gl.getUniformLocation(program, 'uAgentClock')!;
  for (const time of [1.7, 3.2, 9, 27]) {
    gl.uniform1f(clock, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    expect(difference(original, frames.get(canvas)!), `time ${time}`).toBe(0);
    expect(gl.getError()).toBe(0);
  }
  expect(canvas.parentElement!.getBoundingClientRect().width).toBeCloseTo(128);
  expect(
    Number.parseFloat(canvas.parentElement!.style.getPropertyValue('--agent-voice-shift')),
  ).toBe(0);
});

it('returns to exact Idle, supports replay, and releases all native resources in StrictMode', async () => {
  const ref = createRef<FluidAgentOrbHandle>();
  const view = (state: FluidAgentOrbState) => (
    <StrictMode>
      <FluidAgentOrb ref={ref} state={state} size={128} paused />
    </StrictMode>
  );
  const { container, rerender } = render(view('idle'));
  const { canvas, gl, program } = await ready(container);
  const original = frames.get(canvas)!.slice();
  let before = draws.get(canvas)!;
  rerender(view('thinking'));
  await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
  before = draws.get(canvas)!;
  rerender(view('idle'));
  await waitFor(() => expect(draws.get(canvas)).toBeGreaterThan(before));
  expect(difference(original, frames.get(canvas)!)).toBe(0);
  act(() => ref.current!.reset());
  expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(program);
});

it('keeps the reserved orb space empty when WebGL is unavailable', () => {
  const get = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    ...args
  ) {
    return args[0] === 'webgl' ? null : Reflect.apply(get, this, args);
  } as typeof get);
  const { container } = render(<FluidAgentOrb />);
  const host = container.querySelector('.fluid-agent-orb')!;
  expect(host).toHaveClass('fluid-glass-gradient');
  expect(host).toHaveAttribute('data-shape', 'circle');
  expect(host).toHaveAccessibleName('AI assistant: Ready to talk');
  expect(host).not.toHaveAttribute('data-flow-ready');
  expect(getComputedStyle(host).backgroundImage).toBe('none');
  expect(getComputedStyle(host).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(getComputedStyle(host.querySelector('canvas')!).opacity).toBe('0');
  expect(programs.size).toBe(0);
});
