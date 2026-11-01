'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import type { SoapBubbleRenderer, SoapBubbleSettings } from './soap-bubble-renderer';
import { splitMaterial, useSoapBubble, type SoapBubbleMaterialProps } from './use-soap-bubble';
import './soap-bubble.css';

/**
 * Material the interface components start from: rainbow glass, with broad
 * oil bands, a narrow bevel and lighting that follows the
 * page's light or dark theme. The shared SoapBubbleMaterial and each component's own props
 * override it.
 */
export const soapBubbleSystemDefaults: Partial<SoapBubbleSettings> = {
  glass: 0.95,
  iridescence: 2,
  filmScale: 4.85,
  oilCoverage: 1,
  // Panels and bars keep a clear middle; buttons stay iridescent all over.
  oilEdge: 18,
  thickness: 480,
  drainage: 0.35,
  swirl: 0.5,
  refraction: 0.15,
  dispersion: 1,
  reflectivity: 1.3,
  mirage: 0.7,
  // A surface over another bubble (an open menu over a field) shows a little
  // of it, bent.
  seeThrough: 0.3,
  seeThroughBend: 0.3,
  reach: 2,
  bevel: 14,
  environment: 'auto',
  wobble: 0.4,
};

/**
 * How much springs overshoot, from the wobble (Jiggle) setting: 1 at a
 * wobble of 0.8, 0 when nothing should jiggle.
 */
const jiggleOf = (wobble: number) => wobble / 0.8;

// Draw every frame for a while, so a bubble that slides by CSS or by a spring
// stays matched to the backdrop even while its film is paused.
function useFollow(engine: RefObject<SoapBubbleRenderer | null>) {
  const until = useRef(0);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useCallback(
    (milliseconds = 600) => {
      until.current = performance.now() + milliseconds;
      if (frame.current) return;
      const step = () => {
        engine.current?.invalidate();
        frame.current = performance.now() < until.current ? requestAnimationFrame(step) : 0;
      };
      frame.current = requestAnimationFrame(step);
    },
    [engine],
  );
}

const pixels = (value: number) => `${value}px`;

// ------------------------------------------------------------------ surface

type SurfaceTag = 'div' | 'section' | 'nav' | 'header' | 'footer' | 'aside' | 'button';

export type SoapBubbleSurfaceProps = HTMLAttributes<HTMLElement> &
  SoapBubbleMaterialProps & {
    /** Element to render. Defaults to div. */
    as?: SurfaceTag;
    /**
     * Wobble under the pointer. Defaults to false; panels are calm. A number
     * wobbles that fraction as much as a button.
     */
    interactive?: boolean | number;
    /** Change this value to replay the fluid's elastic rebound. */
    reboundKey?: string | number;
    /** Receives the surface's renderer, to hand its motion to another bubble. */
    rendererRef?: MutableRefObject<SoapBubbleRenderer | null>;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  };

/** A panel, bar or card made of the bubble material. Content sits on top. */
export const SoapBubbleSurface = forwardRef<HTMLElement, SoapBubbleSurfaceProps>(
  function SoapBubbleSurface(
    {
      as: Tag = 'div',
      interactive = false,
      reboundKey,
      rendererRef,
      className = '',
      style,
      children,
      ...props
    },
    ref,
  ) {
    const [material, rest] = splitMaterial(props);
    const host = useRef<HTMLElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => host.current!, []);
    const { ready, tuning, engine } = useSoapBubble({
      host,
      canvas,
      material,
      interactive: interactive !== false && interactive !== 0,
      defaults: { ...soapBubbleSystemDefaults, radius: 24 },
      adjust:
        typeof interactive === 'number'
          ? (tuning) => ({ wobble: tuning.wobble * interactive })
          : undefined,
    });
    useEffect(() => {
      if (!rendererRef) return;
      rendererRef.current = engine.current;
      return () => {
        rendererRef.current = null;
      };
    }, [rendererRef, engine]);
    const previousRebound = useRef(reboundKey);
    useEffect(() => {
      if (previousRebound.current !== reboundKey) {
        previousRebound.current = reboundKey;
        engine.current?.rebound();
      }
    }, [reboundKey, engine]);
    const Element = Tag as 'div';
    return (
      <Element
        {...(rest as HTMLAttributes<HTMLDivElement>)}
        ref={host as RefObject<HTMLDivElement>}
        data-soap-bubble=""
        data-soap-bubble-ready={ready || undefined}
        className={`soap-bubble-surface ${className}`.trim()}
        style={{ '--soap-bubble-radius': `${tuning.radius / 16}em`, ...style } as CSSProperties}
      >
        <canvas ref={canvas} className="soap-bubble-surface-canvas" aria-hidden="true" />
        {children}
      </Element>
    );
  },
);

// ------------------------------------------------------------------ button

export type SoapBubbleButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  SoapBubbleMaterialProps &
  Pick<SoapBubbleSurfaceProps, 'reboundKey' | 'rendererRef'>;

/** A button sized by its content, pill-shaped unless radius says otherwise. */
export const SoapBubbleButton = forwardRef<HTMLButtonElement, SoapBubbleButtonProps>(
  function SoapBubbleButton({ className = '', type = 'button', radius = 9999, ...props }, ref) {
    return (
      <SoapBubbleSurface
        {...(props as SoapBubbleSurfaceProps)}
        ref={ref as RefObject<HTMLElement>}
        as="button"
        type={type}
        radius={radius}
        interactive
        className={`soap-bubble-button ${className}`.trim()}
      />
    );
  },
);

// ------------------------------------------------------------------ toggle

export type SoapBubbleToggleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value'
> &
  SoapBubbleMaterialProps & {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    /** Track colour when on. */
    color?: string;
    /** Scale of the whole switch; 1 is a 64 × 28 px track. */
    scale?: number;
  };

/**
 * An on/off switch with a pill-shaped bubble lens that magnifies the track
 * even at rest, and swells over it while pressed or moving.
 */
export const SoapBubbleToggle = forwardRef<HTMLButtonElement, SoapBubbleToggleProps>(
  function SoapBubbleToggle(
    {
      checked,
      defaultChecked = false,
      onCheckedChange,
      color = '#34c759',
      scale = 1,
      className = '',
      style,
      onClick,
      onPointerDown,
      ...props
    },
    ref,
  ) {
    const [material, rest] = splitMaterial(props);
    const [own, setOwn] = useState(defaultChecked);
    const on = checked ?? own;
    const root = useRef<HTMLButtonElement>(null);
    const thumb = useRef<HTMLSpanElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => root.current!, []);
    const [pressed, setPressed] = useState(false);
    const [moving, setMoving] = useState(false);
    const lens = pressed || moving;
    const s = Math.min(12, Math.max(0.5, scale));
    const { ready, engine, setLayer, tuning } = useSoapBubble({
      host: thumb,
      canvas,
      material,
      pointerTarget: root,
      defaults: { ...soapBubbleSystemDefaults, bevel: 9 },
    });
    const follow = useFollow(engine);
    const jiggle = useRef(1);
    jiggle.current = jiggleOf(tuning.wobble);
    const track = { width: 64 * s, height: 28 * s };
    const thumbSize = { width: 38 * s, height: 24 * s };
    const inset = (track.height - thumbSize.height) / 2;
    const bleed = 14 * s;
    const travel = track.width - thumbSize.width - inset * 2;
    // A spring carries the thumb, so it overshoots a little and settles.
    const motion = useRef({ position: on ? 1 : 0, velocity: 0, frame: 0 });
    const place = useCallback(() => {
      const { position } = motion.current;
      const center = inset + thumbSize.width / 2 + position * travel;
      if (thumb.current)
        thumb.current.style.transform = `translate(${center}px, -50%) translateX(-50%)`;
      setLayer({
        x: bleed,
        y: bleed,
        width: track.width,
        height: track.height,
        radius: track.height / 2,
        fill: Math.min(1, Math.max(0, position)),
        track: 'rgb(120 120 128 / 0.22)',
        from: color,
      });
    }, [inset, thumbSize.width, travel, bleed, track.width, track.height, color, setLayer]);
    useLayoutEffect(place, [place, ready]);
    // The lens grows and shrinks by CSS; the film follows it.
    useEffect(() => follow(450), [lens, follow]);
    useEffect(() => {
      if (!pressed) return;
      const release = () => setPressed(false);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      return () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
      };
    }, [pressed]);
    useEffect(() => {
      const state = motion.current;
      const target = on ? 1 : 0;
      if (
        matchMedia('(prefers-reduced-motion: reduce)').matches ||
        Math.abs(target - state.position) + Math.abs(state.velocity) < 1e-3
      ) {
        state.position = target;
        state.velocity = 0;
        place();
        return;
      }
      setMoving(true);
      let last = 0;
      const step = (now: number) => {
        const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
        last = now;
        // Jiggle sets how far the thumb overshoots: none at 0.
        const damping = Math.max(10, 32 - 12 * jiggle.current);
        state.velocity += ((target - state.position) * 260 - state.velocity * damping) * dt;
        state.position += state.velocity * dt;
        place();
        // Shrink once the slide looks settled; the spring can finish its tail.
        if (Math.abs(target - state.position) < 0.02 && Math.abs(state.velocity) < 0.35) {
          setMoving(false);
        }
        if (Math.abs(target - state.position) + Math.abs(state.velocity) < 1e-3) {
          state.position = target;
          state.velocity = 0;
          place();
          state.frame = 0;
          setMoving(false);
          return;
        }
        state.frame = requestAnimationFrame(step);
      };
      cancelAnimationFrame(state.frame);
      state.frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(state.frame);
    }, [on, place]);
    return (
      <button
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={root}
        type="button"
        role="switch"
        aria-checked={on}
        data-soap-bubble=""
        data-soap-bubble-ready={ready || undefined}
        data-lens={lens || undefined}
        className={`soap-bubble-toggle ${className}`.trim()}
        style={
          {
            width: track.width,
            height: track.height,
            // The thumb's bevel and shadow follow this, so scale keeps the look.
            fontSize: pixels(16 * s),
            '--soap-bubble-control-bleed': pixels(bleed),
            '--soap-bubble-toggle-color': color,
            '--soap-bubble-thumb-width': pixels(thumbSize.width),
            '--soap-bubble-thumb-height': pixels(thumbSize.height),
            ...style,
          } as CSSProperties
        }
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (!event.defaultPrevented && !props.disabled) setPressed(true);
        }}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          if (checked === undefined) setOwn(!on);
          onCheckedChange?.(!on);
        }}
      >
        <canvas ref={canvas} className="soap-bubble-control-canvas" aria-hidden="true" />
        <span ref={thumb} className="soap-bubble-toggle-thumb" />
      </button>
    );
  },
);

// ------------------------------------------------------------------ slider

export type SoapBubbleSliderProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> &
  SoapBubbleMaterialProps & {
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    onValueChange?: (value: number) => void;
    /** Fill colour at the start of the track. */
    from?: string;
    /** Fill colour at the end of the track; defaults to from. */
    to?: string;
    disabled?: boolean;
    /** Accessible name of the slider. */
    label?: string;
    /** Scale of the thumb and track; 1 is a 38 × 26 px thumb. */
    scale?: number;
  };

/** A slider whose bubble thumb lenses the fill and swells while dragged. */
export const SoapBubbleSlider = forwardRef<HTMLDivElement, SoapBubbleSliderProps>(
  function SoapBubbleSlider(
    {
      value,
      defaultValue = 50,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      from = '#0a84ff',
      to,
      disabled,
      label = 'Value',
      scale = 1,
      className = '',
      style,
      ...props
    },
    ref,
  ) {
    const [material, rest] = splitMaterial(props);
    const [own, setOwn] = useState(defaultValue);
    const current = Math.min(max, Math.max(min, value ?? own));
    const root = useRef<HTMLDivElement>(null);
    const thumb = useRef<HTMLSpanElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => root.current!, []);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(false);
    const s = Math.min(12, Math.max(0.5, scale));
    const { ready, engine, setLayer } = useSoapBubble({
      host: thumb,
      canvas,
      material,
      pointerTarget: root,
      defaults: { ...soapBubbleSystemDefaults, bevel: 8 },
    });
    const follow = useFollow(engine);
    const thumbSize = { width: 38 * s, height: 26 * s };
    const trackHeight = 6 * s;
    const height = 44 * s;
    const bleed = 16 * s;
    const fraction = max > min ? (current - min) / (max - min) : 0;
    const center = thumbSize.width / 2 + fraction * Math.max(0, width - thumbSize.width);
    useLayoutEffect(() => {
      const element = root.current!;
      const observer = new ResizeObserver(() => setWidth(element.clientWidth));
      observer.observe(element);
      setWidth(element.clientWidth);
      return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => {
      if (!width) return;
      setLayer({
        x: bleed,
        y: bleed + (height - trackHeight) / 2,
        width,
        height: trackHeight,
        radius: trackHeight / 2,
        fill: center / width,
        track: 'rgb(120 120 128 / 0.2)',
        from,
        to,
      });
      follow(active ? 400 : 250);
    }, [width, center, from, to, height, trackHeight, bleed, setLayer, ready, follow, active]);
    useEffect(() => {
      if (!active) return;
      follow(400);
      // The range input does not always see the release; the window does.
      const release = () => setActive(false);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      return () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
      };
    }, [active, follow]);
    return (
      <div
        {...(rest as HTMLAttributes<HTMLDivElement>)}
        ref={root}
        data-soap-bubble=""
        data-soap-bubble-ready={ready || undefined}
        data-active={active || undefined}
        data-disabled={disabled || undefined}
        className={`soap-bubble-slider ${className}`.trim()}
        style={
          {
            height,
            fontSize: pixels(16 * s),
            '--soap-bubble-control-bleed': pixels(bleed),
            '--soap-bubble-thumb-width': pixels(thumbSize.width),
            '--soap-bubble-thumb-height': pixels(thumbSize.height),
            ...style,
          } as CSSProperties
        }
      >
        <canvas ref={canvas} className="soap-bubble-control-canvas" aria-hidden="true" />
        <span ref={thumb} className="soap-bubble-slider-thumb" style={{ left: center }} />
        <input
          type="range"
          className="soap-bubble-slider-input"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (value === undefined) setOwn(next);
            onValueChange?.(next);
          }}
          onPointerDown={() => setActive(true)}
          onPointerUp={() => setActive(false)}
          onPointerCancel={() => setActive(false)}
          onBlur={() => setActive(false)}
        />
      </div>
    );
  },
);

// ------------------------------------------------------------------ icon button

export type SoapBubbleIconButtonProps = SoapBubbleButtonProps & {
  /** Icon buttons have no text, so they need a name. */
  'aria-label': string;
};

/** A round button for one icon. It swells while pressed. */
export const SoapBubbleIconButton = forwardRef<HTMLButtonElement, SoapBubbleIconButtonProps>(
  function SoapBubbleIconButton({ className = '', ...props }, ref) {
    return (
      <SoapBubbleButton
        {...props}
        ref={ref}
        className={`soap-bubble-icon-button ${className}`.trim()}
      />
    );
  },
);

// ------------------------------------------------------------------ search

export type SoapBubbleSearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  SoapBubbleMaterialProps;

/** A search field in a bubble pill, with a magnifier at the start. */
export const SoapBubbleSearch = forwardRef<HTMLInputElement, SoapBubbleSearchProps>(
  function SoapBubbleSearch(
    { className = '', style, placeholder = 'Search', 'aria-label': label, ...props },
    ref,
  ) {
    const [material, rest] = splitMaterial(props);
    return (
      <SoapBubbleSurface
        {...material}
        radius={material.radius ?? 9999}
        // A field wobbles like a button, only gentler.
        interactive={0.4}
        className={`soap-bubble-search ${className}`.trim()}
        style={style}
      >
        <svg className="soap-bubble-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          ref={ref}
          type="search"
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          className="soap-bubble-search-input"
        />
      </SoapBubbleSurface>
    );
  },
);

// ------------------------------------------------------------------ menu

export type SoapBubbleMenuItem = {
  label: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SoapBubbleMenuProps = SoapBubbleMaterialProps & {
  /** Content of the trigger button. */
  label: ReactNode;
  /** Accessible name of the trigger; needed when label is an icon. */
  triggerLabel?: string;
  /** A round icon trigger instead of a pill. */
  round?: boolean;
  items: SoapBubbleMenuItem[];
  /** Edge of the trigger the menu grows from. */
  align?: 'start' | 'end';
  className?: string;
  style?: CSSProperties;
};

/**
 * A button that grows into a bubble panel of actions. The trigger itself
 * swells into the panel and the actions come into focus inside it; closing
 * draws the panel back into the button. The active action is shaded.
 */
export function SoapBubbleMenu({
  label,
  triggerLabel,
  round = false,
  items,
  align = 'start',
  className = '',
  style,
  ...props
}: SoapBubbleMenuProps) {
  const [material] = splitMaterial(props);
  const [open, setOpen] = useState(false);
  // The panel stays while it shrinks back into the trigger.
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelCanvas = useRef<HTMLCanvasElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const echo = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const motion = useRef({
    progress: 0,
    velocity: 0,
    frame: 0,
    // The trigger as it looks (a pressed trigger is swollen) and how far
    // that reaches past its layout box on each side.
    from: { width: 0, height: 0, x: 0, y: 0 },
    to: { width: 0, height: 0 },
  });
  const triggerEngine = useRef<SoapBubbleRenderer | null>(null);
  const menuJiggle = useRef(1);
  const id = useId();
  const panelMaterial = { ...material, radius: material.radius ?? 26 };
  const {
    ready: panelReady,
    tuning: panelTuning,
    engine: panelEngine,
  } = useSoapBubble({
    host: panel,
    canvas: panelCanvas,
    material: panelMaterial,
    interactive: false,
    defaults: soapBubbleSystemDefaults,
  });
  menuJiggle.current = jiggleOf(panelTuning.wobble);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) entries.current[active]?.focus();
  }, [open, active]);
  // The trigger's box as it is drawn right now, which the panel starts from
  // on opening and returns to on closing.
  const measureTrigger = useCallback(() => {
    const button = trigger.current;
    if (!button) return;
    const { width, height } = button.getBoundingClientRect();
    motion.current.from = {
      width,
      height,
      x: (width - button.offsetWidth) / 2,
      y: (height - button.offsetHeight) / 2,
    };
  }, []);
  // The actions' size, measured once per opening. The panel takes the open
  // size in layout right away and keeps it.
  const measure = useCallback(() => {
    const state = motion.current;
    if (!trigger.current || !content.current || !panel.current) return;
    measureTrigger();
    state.to = { width: content.current.offsetWidth, height: content.current.offsetHeight };
    panel.current.style.width = pixels(state.to.width);
    panel.current.style.height = pixels(state.to.height);
    if (echo.current) {
      const { from } = state;
      echo.current.style.width = pixels(from.width);
      echo.current.style.height = pixels(from.height);
      echo.current.style.translate = `${align === 'end' ? from.x : -from.x}px ${-from.y}px`;
    }
  }, [align, measureTrigger]);
  // The morph never touches layout or paint: the renderer draws the bubble
  // at its in-between size inside the open panel's canvas, and the actions
  // are clipped by a scale and its inverse, both on the compositor.
  const place = useCallback(() => {
    const { progress, from, to } = motion.current;
    if (!to.width || !to.height) return;
    const width = Math.max(1, from.width + (to.width - from.width) * progress);
    const height = Math.max(1, from.height + (to.height - from.height) * progress);
    const whole = progress === 1;
    // A swollen trigger reaches past its corner; the panel starts there and
    // slides its corner home as it opens.
    const rest = 1 - progress;
    const x = align === 'end' ? to.width - width + from.x * rest : -from.x * rest;
    panelEngine.current?.setShape(whole ? null : { x, y: -from.y * rest, width, height });
    const scaleX = width / to.width;
    const scaleY = height / to.height;
    if (clip.current) clip.current.style.transform = whole ? '' : `scale(${scaleX}, ${scaleY})`;
    if (content.current)
      content.current.style.transform = whole ? '' : `scale(${1 / scaleX}, ${1 / scaleY})`;
  }, [align, panelEngine]);
  useLayoutEffect(() => {
    if (open) setShown(true);
  }, [open]);
  useLayoutEffect(() => {
    if (!shown) return;
    const state = motion.current;
    const target = open ? 1 : 0;
    const settle = () => {
      state.progress = target;
      state.velocity = 0;
      state.frame = 0;
      place();
      if (!open) setShown(false);
    };
    // The panel carries on the trigger's film, wobble and tilt, and hands
    // them back when it has shrunk into it, so neither swap shows.
    if (open && state.progress === 0) {
      measure();
      const handed = triggerEngine.current?.motion();
      if (handed) panelEngine.current?.adopt(handed);
    }
    if (!open) measureTrigger();
    const finish = () => {
      settle();
      if (!open) {
        const handed = panelEngine.current?.motion();
        if (handed) triggerEngine.current?.adopt(handed);
      }
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    place();
    // Opening springs past the open size and back a couple of times, and the
    // film jiggles as it fills out; closing is quick and does not bounce.
    if (open) panelEngine.current?.rebound();
    let last = 0;
    const stiffness = open ? 420 : 640;
    // Jiggle sets the bounce: a couple of swings at 1, none at 0. The floor
    // keeps the overshoot within the canvas's room for it.
    const damping = open ? Math.max(11, 46 - 31 * menuJiggle.current) : 46;
    const step = (now: number) => {
      const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
      last = now;
      state.velocity += ((target - state.progress) * stiffness - state.velocity * damping) * dt;
      state.progress += state.velocity * dt;
      if (Math.abs(target - state.progress) + Math.abs(state.velocity) < 2e-3) return finish();
      place();
      state.frame = requestAnimationFrame(step);
    };
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(state.frame);
  }, [open, shown, place, measure, measureTrigger, panelEngine]);
  const move = (delta: number) => {
    const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((i) => i >= 0);
    if (!enabled.length) return;
    const position = enabled.indexOf(active);
    setActive(enabled[(position + delta + enabled.length) % enabled.length]);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
    trigger.current?.focus();
  };
  const highlighted = active >= 0 ? entries.current[active] : null;
  return (
    <div
      ref={root}
      className={`soap-bubble-menu ${className}`.trim()}
      data-align={align}
      data-open={shown || undefined}
      data-state={open ? 'open' : shown ? 'closing' : undefined}
      // Opening and closing only restyle bubbles: no new backdrop capture.
      data-soap-bubble-group=""
      style={style}
    >
      <SoapBubbleButton
        {...material}
        ref={trigger}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        rendererRef={triggerEngine}
        className={round ? 'soap-bubble-icon-button' : undefined}
        onClick={() => {
          setOpen(!open);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive(event.key === 'ArrowDown' ? 0 : items.length - 1);
          }
        }}
      >
        {label}
      </SoapBubbleButton>
      {/* Mounted for good, so opening reuses one renderer. */}
      <div
        ref={panel}
        id={id}
        role="menu"
        aria-label={triggerLabel}
        data-soap-bubble=""
        data-soap-bubble-ready={panelReady || undefined}
        className="soap-bubble-surface soap-bubble-menu-panel"
        style={{ '--soap-bubble-radius': `${panelTuning.radius / 16}em` } as CSSProperties}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Tab') setOpen(false);
        }}
        onPointerLeave={() => setActive(-1)}
        aria-hidden={!shown || undefined}
      >
        <canvas ref={panelCanvas} className="soap-bubble-surface-canvas" aria-hidden="true" />
        <span
          ref={echo}
          className={`soap-bubble-menu-echo ${round ? 'soap-bubble-icon-button' : ''}`.trim()}
          aria-hidden="true"
        >
          {label}
        </span>
        <div ref={clip} className="soap-bubble-menu-clip">
          <div ref={content} className="soap-bubble-menu-content">
            <span
              className="soap-bubble-menu-highlight"
              aria-hidden="true"
              style={
                highlighted
                  ? {
                      height: highlighted.offsetHeight,
                      transform: `translateY(${highlighted.offsetTop}px)`,
                    }
                  : { opacity: 0 }
              }
            />
            {items.map((item, index) => (
              <button
                key={index}
                ref={(element) => {
                  entries.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === active ? 0 : -1}
                disabled={item.disabled}
                className="soap-bubble-menu-item"
                onPointerEnter={() => !item.disabled && setActive(index)}
                onClick={() => {
                  item.onSelect?.();
                  close();
                }}
              >
                {item.icon && <span className="soap-bubble-menu-icon">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
