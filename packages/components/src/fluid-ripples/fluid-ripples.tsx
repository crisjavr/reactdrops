'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  createFluidRipplesRenderer,
  normalizeFluidRipples,
  fluidRipplesPresets,
  resolveFluidRipplesPalette,
  type FluidRipplesTuning,
} from './fluid-ripples-renderer';
import './fluid-ripples.css';

export type FluidRipplesHandle = {
  reset: () => void;
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
  /** Size scales the drop: 1 is a keystroke; larger drops make broader, faster, longer waves. */
  rippleAt: (x: number, y: number, strength?: number, size?: number) => void;
};
export type FluidRipplesProps = Partial<FluidRipplesTuning> & {
  height?: number | string;
  borderRadius?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
};
export const FluidRipples = forwardRef<FluidRipplesHandle, FluidRipplesProps>(function FluidRipples(
  { height, borderRadius = 32, children, className = '', style, 'aria-label': label, ...options },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createFluidRipplesRenderer>>(null);
  const tuning = normalizeFluidRipples(options),
    key = JSON.stringify(tuning);
  const latest = useRef(tuning);
  latest.current = tuning;
  const preset = tuning.palette === 'auto' ? null : fluidRipplesPresets[tuning.palette];
  const light = resolveFluidRipplesPalette(tuning.palette, 'light');
  const dark = resolveFluidRipplesPalette(tuning.palette, 'dark');
  const paletteStyle = {
    '--fluid-palette-background-light': light[0],
    '--fluid-palette-blue-light': light[1],
    '--fluid-palette-lavender-light': light[2],
    '--fluid-palette-background-dark': dark[0],
    '--fluid-palette-blue-dark': dark[1],
    '--fluid-palette-lavender-dark': dark[2],
    ...(preset
      ? {
          '--fluid-typing-palette-light': preset.text[0],
          '--fluid-typing-palette-dark': preset.text[1],
        }
      : {}),
  };
  useImperativeHandle(
    ref,
    () => ({
      reset: () => engine.current?.reset(),
      seek: (seconds) => engine.current?.seek(seconds),
      pause: () => engine.current?.pause(),
      play: () => engine.current?.play(),
      rippleAt: (x, y, strength, size) => engine.current?.rippleAt(x, y, strength, size),
    }),
    [],
  );
  useEffect(() => {
    if (!canvas.current) return;
    const instance = createFluidRipplesRenderer(canvas.current, latest.current);
    engine.current = instance;
    return () => {
      instance?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => engine.current?.update(latest.current), [key]);
  return (
    <div
      className={`fluid-ripples ${className}`.trim()}
      data-fluid-mode={tuning.theme}
      data-fluid-palette={tuning.palette}
      data-fluid-interactive={tuning.interactive}
      style={{
        height,
        borderRadius: Number.isFinite(borderRadius) ? Math.max(0, borderRadius) : 32,
        ...paletteStyle,
        ...(tuning.backgroundColor ? { '--fluid-background': tuning.backgroundColor } : {}),
        ...(tuning.blueColor ? { '--fluid-blue': tuning.blueColor } : {}),
        ...(tuning.lavenderColor ? { '--fluid-lavender': tuning.lavenderColor } : {}),
        ...style,
      }}
      role={label ? (children === undefined ? 'img' : 'group') : undefined}
      aria-label={label}
    >
      <canvas ref={canvas} aria-hidden="true" />
      {children !== undefined && <div className="fluid-ripples-content">{children}</div>}
    </div>
  );
});
