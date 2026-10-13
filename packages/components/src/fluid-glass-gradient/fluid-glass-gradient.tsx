'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import {
  createFlowEngine,
  fluidGlassGradientDefaults,
  fluidGlassGradientPresets,
  type FlowTuning,
  type FlowFrameObserver,
  type FlowMaterialAnimation,
  type FluidGlassGradientPreset,
} from './fluid-glass-gradient-renderer';
import './fluid-glass-gradient.css';

export type FluidGlassGradientHandle = {
  readonly element: HTMLDivElement | null;
  reset: () => void;
  invalidate: () => void;
};

export type FluidGlassGradientProps = Partial<FlowTuning> & {
  preset?: FluidGlassGradientPreset;
  /** Optional material animation evaluated inside the existing render loop. */
  onFrame?: FlowFrameObserver;
  materialAnimation?: FlowMaterialAnimation;
  'aria-hidden'?: boolean | 'true' | 'false';
  'data-state'?: string;
  shape?: 'background' | 'circle' | 'rounded' | 'rectangle';
  size?: number;
  aspectRatio?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
};

export const FluidGlassGradient = forwardRef<FluidGlassGradientHandle, FluidGlassGradientProps>(
  function FluidGlassGradient(
    {
      preset,
      onFrame,
      materialAnimation,
      'aria-hidden': hidden,
      'data-state': state,
      shape = 'background',
      size = 480,
      aspectRatio = 1,
      borderRadius = 24,
      className = '',
      style,
      'aria-label': label,
      ...overrides
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ReturnType<typeof createFlowEngine>>(null);
    const frameObserver = useRef(onFrame);
    frameObserver.current = onFrame;
    const tuning = {
      ...fluidGlassGradientDefaults,
      ...(preset ? fluidGlassGradientPresets[preset] : {}),
      ...overrides,
    };
    // Tuning contains only scalar values; equal props should not restart the clock.
    const tuningKey = JSON.stringify(tuning);

    useImperativeHandle(
      ref,
      () => ({
        get element() {
          return hostRef.current;
        },
        reset: () => engineRef.current?.reset(),
        invalidate: () => engineRef.current?.invalidate(),
      }),
      [],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const engine = createFlowEngine(
        canvas,
        tuning,
        onFrame
          ? (base, now, moving, dt, host) => frameObserver.current?.(base, now, moving, dt, host)
          : undefined,
        materialAnimation,
      );
      engineRef.current = engine;
      return () => {
        engine?.dispose();
        engineRef.current = null;
      };
    }, []);

    useEffect(() => {
      engineRef.current?.update(tuning);
    }, [tuningKey]);

    const isBackground = shape === 'background';
    const safeSize = Number.isFinite(size) ? Math.max(40, size) : 480;
    const ratio =
      shape === 'circle'
        ? 1
        : Number.isFinite(aspectRatio)
          ? Math.max(0.2, Math.min(5, aspectRatio))
          : 1;
    const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? Math.max(0, borderRadius) : 0;
    const containerStyle = {
      width: isBackground ? '100%' : `min(100%, ${safeSize}px)`,
      aspectRatio: isBackground ? undefined : ratio,
      borderRadius: radius,
      '--gradient-base': tuning.baseColor,
      '--gradient-a': tuning.colorA,
      '--gradient-b': tuning.colorB,
      '--gradient-c': tuning.colorC,
      ...style,
    } as CSSProperties;

    return (
      <div
        ref={hostRef}
        className={`fluid-glass-gradient ${className}`.trim()}
        data-shape={shape}
        data-state={state}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={hidden ?? (label ? undefined : true)}
        style={containerStyle}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    );
  },
);
