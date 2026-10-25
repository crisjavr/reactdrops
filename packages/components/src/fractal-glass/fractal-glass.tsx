'use client';

import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import {
  fractalGlassDefaults,
  fractalGlassCoverage,
  normalizeFractalGlass,
  type FractalGlassSettings,
} from './fractal-glass-model';
import { createFractalGlassRenderer } from './fractal-glass-renderer';
import './fractal-glass.css';

export { fractalGlassPresets } from './fractal-glass-model';

export type FractalGlassProps = HTMLAttributes<HTMLDivElement> &
  Partial<FractalGlassSettings> & {
    /** Image to refract. Remote images must allow anonymous CORS for WebGL. */
    src: string;
    alt: string;
    height?: CSSProperties['height'];
    borderRadius?: CSSProperties['borderRadius'];
  };

export type FractalGlassHandle = {
  /** Export the current glass image, including its crop and rounded corners, as PNG. */
  exportImage: () => Promise<Blob>;
};

export const FractalGlass = forwardRef<FractalGlassHandle, FractalGlassProps>(function FractalGlass(
  {
    src,
    alt,
    children,
    height,
    borderRadius = 0,
    className = '',
    style,
    animateEntrance = fractalGlassDefaults.animateEntrance,
    mode = fractalGlassDefaults.mode,
    smoothness = fractalGlassDefaults.smoothness,
    textureScale = fractalGlassDefaults.textureScale,
    blackPoint = fractalGlassDefaults.blackPoint,
    whitePoint = fractalGlassDefaults.whitePoint,
    gamma = fractalGlassDefaults.gamma,
    edgeWidth = fractalGlassDefaults.edgeWidth,
    stripes = fractalGlassDefaults.stripes,
    distortion = fractalGlassDefaults.distortion,
    refractionBias = fractalGlassDefaults.refractionBias,
    blur = fractalGlassDefaults.blur,
    grain = fractalGlassDefaults.grain,
    relief = fractalGlassDefaults.relief,
    refraction = fractalGlassDefaults.refraction,
    roughness = fractalGlassDefaults.roughness,
    reflection = fractalGlassDefaults.reflection,
    dispersion = fractalGlassDefaults.dispersion,
    caustics = fractalGlassDefaults.caustics,
    coverage = fractalGlassDefaults.coverage,
    coverageMode = fractalGlassDefaults.coverageMode,
    side = fractalGlassDefaults.side,
    direction = fractalGlassDefaults.direction,
    hoverEffect = fractalGlassDefaults.hoverEffect,
    hoverPreset = fractalGlassDefaults.hoverPreset,
    recoveryDirection = fractalGlassDefaults.recoveryDirection,
    hoverAnimation = fractalGlassDefaults.hoverAnimation,
    hoverDuration = fractalGlassDefaults.hoverDuration,
    hoverRadius = fractalGlassDefaults.hoverRadius,
    hoverFeather = fractalGlassDefaults.hoverFeather,
    transitionBlend = fractalGlassDefaults.transitionBlend,
    duration = fractalGlassDefaults.duration,
    ease = fractalGlassDefaults.ease,
    disabled = false,
    maxDpr = fractalGlassDefaults.maxDpr,
    maxPixels = fractalGlassDefaults.maxPixels,
    tabIndex,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createFractalGlassRenderer>>(null);
  useImperativeHandle(
    ref,
    () => ({
      async exportImage() {
        const snapshot = engine.current?.captureFrame();
        const element = host.current;
        if (!snapshot || !element)
          throw new Error(
            'The glass image is not ready. Use an uploaded image or a URL that allows CORS.',
          );
        const output = document.createElement('canvas');
        output.width = snapshot.width;
        output.height = snapshot.height;
        const context = output.getContext('2d');
        if (!context) throw new Error('Image export is unavailable in this browser.');
        const style = getComputedStyle(element);
        const radius = (value: string) => {
          const [x, y = x] = value.split(' ');
          const resolve = (part: string, size: number, cssSize: number) =>
            (parseFloat(part) || 0) *
            (part.endsWith('%') ? size / 100 : size / Math.max(1, cssSize));
          return {
            x: resolve(x, output.width, element.clientWidth),
            y: resolve(y, output.height, element.clientHeight),
          };
        };
        context.beginPath();
        context.roundRect(
          0,
          0,
          output.width,
          output.height,
          [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius,
          ].map(radius),
        );
        context.clip();
        context.drawImage(snapshot, 0, 0);
        return new Promise<Blob>((resolve, reject) => {
          output.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG image.'))),
            'image/png',
          );
        });
      },
    }),
    [],
  );
  const [ready, setReady] = useState(false);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [touched, setTouched] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerType = useRef('');
  const settings = normalizeFractalGlass({
    animateEntrance,
    mode,
    smoothness,
    textureScale,
    blackPoint,
    whitePoint,
    gamma,
    edgeWidth,
    stripes,
    distortion,
    refractionBias,
    blur,
    grain,
    relief,
    refraction,
    roughness,
    reflection,
    dispersion,
    caustics,
    coverage,
    coverageMode,
    side,
    direction,
    hoverEffect,
    hoverPreset,
    recoveryDirection,
    hoverAnimation,
    hoverDuration,
    hoverRadius,
    hoverFeather,
    transitionBlend,
    duration,
    ease,
    disabled,
    maxDpr,
    maxPixels,
  });
  const active = hovered || focused || touched;
  const latest = useRef({ settings, active });
  latest.current = { settings, active };
  const insideGlass = (x: number, y: number, bounds = host.current?.getBoundingClientRect()) => {
    const current = latest.current.settings;
    const covered = fractalGlassCoverage(current);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0 || current.disabled) return false;
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
    if (current.hoverEffect && current.hoverAnimation === 'circle') return true;
    if (covered <= 0) return false;
    const horizontal = current.coverageMode === 'stripes' && current.direction === 'horizontal';
    const position = horizontal
      ? current.side === 'right'
        ? bounds.bottom - y
        : y - bounds.top
      : current.side === 'right'
        ? bounds.right - x
        : x - bounds.left;
    return position <= (horizontal ? bounds.height : bounds.width) * covered;
  };
  const moveCircle = (x: number, y: number, bounds = host.current?.getBoundingClientRect()) => {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    engine.current?.setPointer(
      (x - bounds.left) / bounds.width,
      1 - (y - bounds.top) / bounds.height,
    );
  };
  const trackPointer = (x: number, y: number) => {
    pointer.current = { x, y };
    const bounds = host.current?.getBoundingClientRect();
    moveCircle(x, y, bounds);
    const next = insideGlass(x, y, bounds);
    setHovered(next);
  };
  useLayoutEffect(() => {
    if (pointer.current) {
      const { x, y } = pointer.current;
      const bounds = host.current?.getBoundingClientRect();
      setHovered(insideGlass(x, y, bounds));
    }
  }, [
    coverage,
    coverageMode,
    stripes,
    textureScale,
    mode,
    direction,
    side,
    disabled,
    hoverEffect,
    hoverAnimation,
    height,
    style?.width,
    style?.height,
  ]);
  useEffect(() => {
    if (!canvas.current || !host.current) return;
    let mounted = true;
    const renderer = createFractalGlassRenderer(
      canvas.current,
      host.current,
      latest.current.settings,
      latest.current.active,
      (value) => {
        if (mounted) setReady(value);
      },
    );
    engine.current = renderer;
    return () => {
      mounted = false;
      renderer?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setSource(src);
  }, [src]);
  useLayoutEffect(() => {
    engine.current?.update(latest.current.settings, latest.current.active);
  }, [
    mode,
    smoothness,
    textureScale,
    blackPoint,
    whitePoint,
    gamma,
    edgeWidth,
    stripes,
    distortion,
    refractionBias,
    blur,
    grain,
    relief,
    refraction,
    roughness,
    reflection,
    dispersion,
    caustics,
    coverage,
    coverageMode,
    side,
    direction,
    hoverEffect,
    hoverPreset,
    recoveryDirection,
    hoverAnimation,
    hoverDuration,
    hoverRadius,
    hoverFeather,
    transitionBlend,
    duration,
    ease,
    disabled,
    maxDpr,
    maxPixels,
    active,
  ]);
  return (
    <div
      {...props}
      ref={host}
      className={`fractal-glass ${className}`.trim()}
      style={{
        height,
        borderRadius,
        aspectRatio: (style?.height ?? height) === undefined ? undefined : 'auto',
        ...style,
      }}
      data-renderer={ready ? 'webgl' : 'native'}
      data-animate-entrance={animateEntrance}
      data-image-ready={loadedSource === src}
      data-glass-mode={disabled ? 'disabled' : hoverEffect ? 'hover' : 'always'}
      data-hover-preset={hoverPreset}
      data-hover-animation={hoverAnimation}
      tabIndex={tabIndex ?? (hoverEffect && !disabled ? 0 : undefined)}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') trackPointer(event.clientX, event.clientY);
        onPointerEnter?.(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch') trackPointer(event.clientX, event.clientY);
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        pointer.current = null;
        touch.current = null;
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
        if (event.pointerType === 'touch' && insideGlass(event.clientX, event.clientY)) {
          touch.current = { x: event.clientX, y: event.clientY };
          moveCircle(event.clientX, event.clientY);
        }
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        const start = touch.current;
        touch.current = null;
        if (
          hoverEffect &&
          !disabled &&
          event.pointerType === 'touch' &&
          start &&
          insideGlass(event.clientX, event.clientY) &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
        )
          setTouched((value) => !value);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        touch.current = null;
        pointer.current = null;
        setHovered(false);
        onPointerCancel?.(event);
      }}
      onFocus={(event) => {
        if (pointerType.current !== 'touch' && event.target.matches(':focus-visible')) {
          engine.current?.setPointer(0.5, 0.5);
          setFocused(true);
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          pointerType.current = '';
        }
        onBlur?.(event);
      }}
    >
      <img
        className="fractal-glass-image"
        src={src || undefined}
        alt={alt}
        decoding="async"
        onLoad={(event) => {
          const image = event.currentTarget;
          void image
            .decode()
            .catch(() => {})
            .then(() => {
              if (image.isConnected && image.getAttribute('src') === src) setLoadedSource(src);
            });
        }}
      />
      <canvas ref={canvas} className="fractal-glass-canvas" aria-hidden="true" />
      {children !== undefined && <div className="fractal-glass-content">{children}</div>}
    </div>
  );
});
