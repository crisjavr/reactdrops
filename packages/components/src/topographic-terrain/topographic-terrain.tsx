'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  createTopographicRenderer,
  type TopographicConfig,
} from '../topographic-flow/topographic-renderer';
import { createTopographicTerrainSurface } from './topographic-terrain-renderer';
import {
  topographicTerrainDefaults,
  topographicTerrainPresets,
  type TopographicTerrainPreset,
  type TopographicTerrainGradientColors,
} from './topographic-terrain-presets';
import './topographic-terrain.css';

export type TopographicTerrainHandle = { reset: () => void };
export type TopographicTerrainProps = Partial<
  Omit<TopographicConfig, 'lineStyle' | 'dashLength' | 'dashGap'>
> & {
  /** Fade in the first complete frame. Disable for an immediate entrance. */
  animateEntrance?: boolean;
  preset?: TopographicTerrainPreset;
  backgroundImage?: CSSProperties['backgroundImage'];
  height?: number | string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const TopographicTerrain = forwardRef<TopographicTerrainHandle, TopographicTerrainProps>(
  function TopographicTerrain(
    {
      animateEntrance = topographicTerrainDefaults.animateEntrance,
      preset = 'terraced',
      height,
      children,
      className = '',
      style,
      scale,
      density,
      speed,
      distortion,
      lineWidth,
      opacity,
      seed,
      paused,
      lineColor,
      accentColor,
      grain,
      gradientColors,
      gradientDiffusion,
      backgroundColor,
      backgroundImage,
      surfaceColor,
      shadowColor,
      shadowAnimation,
      shadowCycleDuration,
      elevation,
      cameraTilt,
      cameraRotation,
      cameraZoom,
      terraceSoftness,
      lightingBlend,
      lightDirection,
      lightIntensity,
      hover,
      hoverRadius,
      hoverFollow,
      hoverFade,
    },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null),
      canvas = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const renderer = useRef<ReturnType<typeof createTopographicRenderer> | null>(null);
    const palette = topographicTerrainPresets[preset] ?? topographicTerrainPresets.terraced;
    const followsTheme = preset === 'terraced' || preset === 'terraced-top';
    const config = useMemo<TopographicConfig>(
      () => ({
        scale: scale ?? palette.scale,
        density: density ?? palette.density,
        speed: speed ?? palette.speed,
        distortion: distortion ?? palette.distortion,
        lineWidth: lineWidth ?? palette.lineWidth,
        opacity: opacity ?? palette.opacity,
        seed: seed ?? palette.seed,
        paused: paused ?? palette.paused,
        lineColor:
          lineColor ?? (followsTheme ? 'var(--topographic-terrain-ink)' : palette.lineColor),
        accentColor:
          accentColor ?? (followsTheme ? 'var(--topographic-terrain-ink)' : palette.accentColor),
        lineStyle: 'solid',
        dashLength: 7,
        dashGap: 8,
        grain: grain ?? palette.grain,
        gradientColors: gradientColors ?? palette.gradientColors,
        gradientDiffusion: gradientDiffusion ?? palette.gradientDiffusion,
        surfaceColor:
          surfaceColor ??
          (followsTheme ? 'var(--topographic-terrain-material)' : palette.surfaceColor),
        backgroundColor:
          style?.backgroundColor ??
          backgroundColor ??
          (followsTheme ? 'var(--topographic-terrain-material)' : palette.backgroundColor),
        shadowColor:
          shadowColor ??
          (surfaceColor === undefined && !(gradientColors ?? palette.gradientColors).length
            ? followsTheme
              ? 'var(--topographic-terrain-shadow)'
              : palette.shadowColor
            : undefined),
        shadowAnimation: shadowAnimation ?? palette.shadowAnimation,
        shadowCycleDuration: shadowCycleDuration ?? palette.shadowCycleDuration,
        elevation: elevation ?? palette.elevation,
        cameraTilt: cameraTilt ?? palette.cameraTilt,
        cameraRotation: cameraRotation ?? palette.cameraRotation,
        cameraZoom: cameraZoom ?? palette.cameraZoom,
        terraceSoftness: terraceSoftness ?? palette.terraceSoftness,
        lightingBlend: lightingBlend ?? palette.lightingBlend,
        lightDirection: lightDirection ?? palette.lightDirection,
        lightIntensity: lightIntensity ?? palette.lightIntensity,
        hover: hover ?? palette.hover,
        hoverRadius: hoverRadius ?? palette.hoverRadius,
        hoverFollow: hoverFollow ?? palette.hoverFollow,
        hoverFade: hoverFade ?? palette.hoverFade,
      }),
      [
        palette,
        preset,
        followsTheme,
        scale,
        density,
        speed,
        distortion,
        lineWidth,
        opacity,
        seed,
        paused,
        lineColor,
        accentColor,
        grain,
        gradientColors,
        gradientDiffusion,
        surfaceColor,
        shadowColor,
        shadowAnimation,
        shadowCycleDuration,
        style?.backgroundColor,
        backgroundColor,
        elevation,
        cameraTilt,
        cameraRotation,
        cameraZoom,
        terraceSoftness,
        lightingBlend,
        lightDirection,
        lightIntensity,
        hover,
        hoverRadius,
        hoverFollow,
        hoverFade,
      ],
    );
    const latest = useRef(config);
    latest.current = config;
    useImperativeHandle(ref, () => ({ reset: () => renderer.current?.reset() }), []);
    useEffect(() => {
      if (!canvas.current || !host.current) return;
      const instance = createTopographicRenderer(
        canvas.current,
        host.current,
        latest.current,
        createTopographicTerrainSurface,
        () => setReady(true),
      );
      renderer.current = instance;
      return () => {
        instance.destroy();
        renderer.current = null;
      };
    }, []);
    useEffect(() => renderer.current?.update(config), [config]);
    useEffect(() => {
      const syncTheme = () => renderer.current?.update(latest.current);
      const observer = new MutationObserver(syncTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class'],
      });
      const media = matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', syncTheme);
      return () => {
        observer.disconnect();
        media.removeEventListener('change', syncTheme);
      };
    }, []);
    return (
      <div
        ref={host}
        data-ready={ready}
        data-animate-entrance={animateEntrance}
        className={`topographic-terrain ${className}`}
        style={{
          height,
          backgroundColor:
            backgroundColor ??
            (followsTheme ? 'var(--topographic-terrain-material)' : palette.backgroundColor),
          backgroundImage: backgroundImage ?? palette.backgroundImage,
          ...style,
        }}
      >
        <canvas ref={canvas} className="topographic-terrain-canvas" aria-hidden="true" />
        {children && <div className="topographic-terrain-content">{children}</div>}
      </div>
    );
  },
);
export { topographicTerrainDefaults, topographicTerrainPresets };
export type { TopographicTerrainPreset, TopographicTerrainGradientColors };
