'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { createSolidEngine } from './solid-engine';
import { shapeDefaults, type ShapeSettings } from './shape-settings';
import './shape-physics.css';

export type ShapePhysicsProps = Partial<ShapeSettings> & {
  height?: number | string;
  onSizeLimitChange?: (maximum: number) => void;
  onFullChange?: (full: boolean) => void;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
};
export type ShapePhysicsHandle = {
  replay: () => void;
  clear: () => void;
  addShape: () => void;
  shake: () => void;
};

export const ShapePhysics = forwardRef<ShapePhysicsHandle, ShapePhysicsProps>(function ShapePhysics(
  {
    height,
    onSizeLimitChange,
    onFullChange,
    className = '',
    style,
    'aria-label':
      label = 'Playful shapes with gravity. Drag a shape or click empty space to add one.',
    ...overrides
  },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createSolidEngine>>(null);
  const settings = { ...shapeDefaults, ...overrides };
  const latest = useRef(settings);
  latest.current = settings;
  const sizeLimitCallback = useRef(onSizeLimitChange);
  sizeLimitCallback.current = onSizeLimitChange;
  const fullCallback = useRef(onFullChange);
  fullCallback.current = onFullChange;
  const key = JSON.stringify(settings);
  useImperativeHandle(
    ref,
    () => ({
      replay: () => engine.current?.reset(),
      clear: () => engine.current?.clear(),
      addShape: () => engine.current?.add(),
      shake: () => engine.current?.shake(),
    }),
    [],
  );
  useEffect(() => {
    if (!canvas.current) return;
    const instance = createSolidEngine(
      canvas.current,
      latest.current,
      (maximum) => sizeLimitCallback.current?.(maximum),
      (full) => fullCallback.current?.(full),
    );
    engine.current = instance;
    return () => {
      instance?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => engine.current?.update(settings), [key]);
  return (
    <div
      className={`shape-physics ${className}`.trim()}
      style={{ height, background: settings.background, ...style }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        tabIndex={settings.interactive ? 0 : undefined}
        data-interactive={settings.interactive}
        onKeyDown={(event) => {
          if (!settings.interactive || event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            engine.current?.add();
          }
          if (event.key.toLowerCase() === 'r') engine.current?.reset();
        }}
      />
    </div>
  );
});
