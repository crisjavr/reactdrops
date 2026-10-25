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
  topographicDefaults,
  topographicPresets,
  type TopographicPreset,
  type TopographicLineStyle,
  type TopographicGradientColors,
  type TopographicHoverEffect,
} from './topographic-presets';
import {
  createTopographicRenderer,
  type TopographicConfig,
  type TopographicReliefProperties,
} from './topographic-renderer';
import './topographic-flow.css';

export type TopographicFlowHandle = { reset: () => void };
export type TopographicFlowProps = Partial<Omit<TopographicConfig, TopographicReliefProperties>> & {
  /** Fade in the first complete frame. Disable for an immediate entrance. */
  animateEntrance?: boolean;
  preset?: TopographicPreset;
  backgroundColor?: string;
  backgroundImage?: CSSProperties['backgroundImage'];
  /** Dense, static photographic grain across the gradient and contours. */
  grain?: number;
  height?: number | string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const TopographicFlow = forwardRef<TopographicFlowHandle, TopographicFlowProps>(
  function TopographicFlow(
    {
      animateEntrance = topographicDefaults.animateEntrance,
      preset = 'paper',
      backgroundColor,
      backgroundImage,
      gradientColors,
      gradientDiffusion,
      grain,
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
      dashLength,
      dashGap,
      seed,
      paused,
      lineColor,
      accentColor,
      lineStyle,
      hover,
      hoverRadius,
      hoverFollow,
      hoverFade,
      hoverEffect,
    },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null),
      canvas = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const renderer = useRef<ReturnType<typeof createTopographicRenderer> | null>(null);
    const palette = topographicPresets[preset] ?? topographicPresets.paper;
    const customImage = style?.backgroundImage ?? backgroundImage;
    const gradient = customImage ?? palette.backgroundImage;
    const colors =
      customImage === 'none'
        ? topographicPresets.paper.gradientColors
        : (gradientColors ??
          (customImage === undefined || customImage === palette.backgroundImage
            ? palette.gradientColors
            : topographicPresets.paper.gradientColors));
    const grainAmount = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(grain ?? palette.grain) ? (grain ?? palette.grain) : palette.grain,
      ),
    );
    const textured = (colors.length >= 2 || gradient !== 'none') && grainAmount > 0;
    const config = useMemo<TopographicConfig>(
      () => ({
        scale: scale ?? palette.scale,
        density: density ?? palette.density,
        speed: speed ?? topographicDefaults.speed,
        distortion: distortion ?? topographicDefaults.distortion,
        lineWidth: lineWidth ?? palette.lineWidth,
        opacity: opacity ?? palette.opacity,
        dashLength: dashLength ?? topographicDefaults.dashLength,
        dashGap: dashGap ?? topographicDefaults.dashGap,
        seed: seed ?? topographicDefaults.seed,
        paused: paused ?? false,
        lineColor:
          lineColor ?? (preset === 'paper' ? 'var(--topographic-flow-ink)' : palette.lineColor),
        accentColor:
          accentColor ?? (preset === 'paper' ? 'var(--topographic-flow-ink)' : palette.accentColor),
        lineStyle: lineStyle ?? palette.lineStyle,
        hover: hover ?? topographicDefaults.hover,
        hoverRadius: hoverRadius ?? topographicDefaults.hoverRadius,
        hoverFollow: hoverFollow ?? topographicDefaults.hoverFollow,
        hoverFade: hoverFade ?? topographicDefaults.hoverFade,
        hoverEffect: hoverEffect ?? palette.hoverEffect,
        grain: textured ? grainAmount : 0,
        gradientColors: colors,
        gradientDiffusion: gradientDiffusion ?? palette.gradientDiffusion,
        backgroundColor:
          style?.backgroundColor ??
          backgroundColor ??
          (preset === 'paper' ? 'var(--topographic-flow-background)' : palette.backgroundColor),
      }),
      [
        palette,
        preset,
        textured,
        grainAmount,
        colors,
        gradientDiffusion,
        backgroundColor,
        style?.backgroundColor,
        scale,
        density,
        speed,
        distortion,
        lineWidth,
        opacity,
        dashLength,
        dashGap,
        seed,
        paused,
        lineColor,
        accentColor,
        lineStyle,
        hover,
        hoverRadius,
        hoverFollow,
        hoverFade,
        hoverEffect,
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
        undefined,
        () => setReady(true),
      );
      renderer.current = instance;
      return () => {
        instance.destroy();
        renderer.current = null;
      };
    }, [createTopographicRenderer]);
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
        className={`topographic-flow ${className}`}
        style={{
          height,
          backgroundColor:
            backgroundColor ??
            (preset === 'paper' ? 'var(--topographic-flow-background)' : palette.backgroundColor),
          backgroundImage: backgroundImage ?? palette.backgroundImage,
          ...style,
        }}
      >
        <canvas ref={canvas} className="topographic-flow-canvas" aria-hidden="true" />
        {children && <div className="topographic-flow-content">{children}</div>}
      </div>
    );
  },
);

export { topographicDefaults, topographicPresets };
export type {
  TopographicPreset,
  TopographicLineStyle,
  TopographicGradientColors,
  TopographicHoverEffect,
};
