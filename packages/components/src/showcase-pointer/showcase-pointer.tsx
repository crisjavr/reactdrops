'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { CursorLabel, type CursorLabelAnimation } from './cursor-label';
import {
  createRandom,
  hashString,
  idleSway,
  defaultCursorMotion,
  planReach,
  readableTextColor,
  springStep,
  type CursorMotion,
  type Point,
} from './showcase-pointer-motion';
import './showcase-pointer.css';

export type { CursorLabelAnimation } from './cursor-label';
export {
  defaultCursorMotion,
  type CursorEasing,
  type CursorMotion,
} from './showcase-pointer-motion';

/**
 * Where a cursor goes: a CSS selector or element inside the component (its
 * center, or `x`/`y` fractions of its box), or a point in local CSS pixels or
 * percentages of the component.
 */
export type CursorTarget =
  | string
  | Element
  | { target: string | Element; x?: number; y?: number }
  | { x: number | `${number}%`; y: number | `${number}%` };

type MoveOptions = { duration?: number };

export type CursorPress = {
  cursorId: string;
  target: Element;
};

export type CursorStep =
  | { action: 'enter'; at?: CursorTarget }
  | { action: 'leave' }
  | ({ action: 'move'; to: CursorTarget } & MoveOptions)
  | ({ action: 'hover'; target: CursorTarget } & MoveOptions)
  | ({ action: 'click'; target: CursorTarget } & MoveOptions)
  | ({ action: 'drag'; from: CursorTarget; to: CursorTarget } & MoveOptions)
  | ({
      action: 'select';
      target: string | Element;
      /** Character offsets in the element's text; defaults to all of it. */
      start?: number;
      end?: number;
    } & MoveOptions)
  | ({
      action: 'marquee';
      from: CursorTarget;
      to: CursorTarget;
      /** Elements marked with `data-cursor-selected` when the box touches them. */
      items?: string;
    } & MoveOptions)
  | { action: 'type'; target: string | Element; text: string; delay?: number }
  | { action: 'say'; text: string; duration?: number }
  | { action: 'wait'; duration: number }
  | { action: 'clear' }
  | { action: 'call'; run: () => void | Promise<void> };

export type CursorConfig = {
  id: string;
  name: string;
  color: string;
  /** Label text color; defaults to white or near-black, whichever reads better. */
  textColor?: string;
  /** Initial position. Defaults to a spread across the lower half. */
  start?: CursorTarget;
  /** Steps run in order. All cursors run their scripts at the same time. */
  script?: CursorStep[];
};

type StepOf<A extends CursorStep['action']> = Omit<Extract<CursorStep, { action: A }>, 'action'>;

export type CursorController = {
  enter: (at?: CursorTarget) => Promise<void>;
  leave: () => Promise<void>;
  moveTo: (to: CursorTarget, options?: MoveOptions) => Promise<void>;
  hover: (target: CursorTarget, options?: MoveOptions) => Promise<void>;
  click: (target: CursorTarget, options?: MoveOptions) => Promise<void>;
  drag: (from: CursorTarget, to: CursorTarget, options?: MoveOptions) => Promise<void>;
  select: (target: string | Element, options?: Omit<StepOf<'select'>, 'target'>) => Promise<void>;
  marquee: (
    from: CursorTarget,
    to: CursorTarget,
    options?: Omit<StepOf<'marquee'>, 'from' | 'to'>,
  ) => Promise<void>;
  type: (target: string | Element, text: string, delay?: number) => Promise<void>;
  say: (text: string, duration?: number) => Promise<void>;
  wait: (duration: number) => Promise<void>;
  clear: () => Promise<void>;
};

export type ShowcasePointerHandle = {
  cursor: (id: string) => CursorController;
  /** Run steps for one cursor; resolves when they finish. */
  run: (id: string, steps: CursorStep[]) => Promise<void>;
  /** Restart every script from its first step. */
  restart: () => void;
};

export interface ShowcasePointerProps {
  cursors: CursorConfig[];
  children?: ReactNode;
  /** Run the scripts. False pauses every cursor in place. */
  playing?: boolean;
  /** Replay all scripts once every cursor has finished. */
  loop?: boolean;
  /** Pause between loops in milliseconds. */
  loopDelay?: number;
  /** Time scale for movement, waits and typing. */
  speed?: number;
  labelAnimation?: CursorLabelAnimation;
  showLabels?: boolean;
  /** Press the arrow and pulse a ring on click. */
  clickEffect?: boolean;
  /** Maximum idle sway in CSS pixels while a cursor rests. */
  idleDrift?: number;
  /** How much the label trails the arrow, from 0 (rigid) to 1. */
  labelLag?: number;
  /** Movement rules: trajectory, overshoot, timing, easing and landing. Omitted rules keep their defaults. */
  motion?: CursorMotion;
  /** Length of a fading trail behind each arrow in milliseconds. 0 draws no trail. */
  trail?: number;
  /** Trail stroke width in CSS pixels. */
  trailWidth?: number;
  /** Cursor scale. 1 draws a 22 px arrow. */
  cursorSize?: number;
  /** Called before each loop restarts, after selections are cleared. Reset demo state here. */
  onCycle?: () => void;
  /** Visual activation only. Update preview state here; no native click or form action is dispatched. */
  onCursorPress?: (press: CursorPress) => void;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}

type Cancel = { cancelled: boolean };
class Cancelled extends Error {}

type Ticker = (time: number, dt: number) => boolean | void;

type CursorRuntime = {
  id: string;
  index: number;
  position: Point;
  label: Point;
  labelVelocity: Point;
  drift: number;
  driftTarget: number;
  phase: number;
  visible: boolean;
  pressed: boolean;
  hovered: Element | null;
  random: () => number;
  element: HTMLDivElement | null;
  trailElement: SVGSVGElement | null;
  history: { x: number; y: number; t: number }[];
  sayTimer: number;
  selections: { range: Range; layer: HTMLDivElement }[];
  marked: Set<Element>;
};

const hoverOwners = new WeakMap<Element, Set<string>>();

function cssPoint(value: number | `${number}%`, size: number) {
  return typeof value === 'number' ? value : (parseFloat(value) / 100) * size;
}

/** Simulated multiplayer cursors that move, hover, click, drag and select inside their children. */
export const ShowcasePointer = forwardRef<ShowcasePointerHandle, ShowcasePointerProps>(
  function ShowcasePointer(
    {
      cursors,
      children,
      playing = true,
      loop = true,
      loopDelay = 1400,
      speed = 1,
      labelAnimation = 'fade',
      showLabels = true,
      clickEffect = true,
      idleDrift = 1.5,
      labelLag = 0.35,
      motion,
      trail = 0,
      trailWidth = 3,
      cursorSize = 1,
      onCycle,
      onCursorPress,
      height,
      className = '',
      style,
    },
    forwardedRef,
  ) {
    const root = useRef<HTMLDivElement>(null);
    const overlay = useRef<HTMLDivElement>(null);
    const runtimes = useRef(new Map<string, CursorRuntime>());
    const tickers = useRef(new Set<Ticker>());
    const clock = useRef({ time: 0, last: 0, frame: 0, visible: true });
    const rules = { ...defaultCursorMotion, ...motion };
    const live = useRef({
      playing,
      speed,
      clickEffect,
      idleDrift,
      labelLag,
      loop,
      loopDelay,
      rules,
      trail,
    });
    live.current = {
      playing,
      speed,
      clickEffect,
      idleDrift,
      labelLag,
      loop,
      loopDelay,
      rules,
      trail,
    };
    const onCycleRef = useRef(onCycle);
    onCycleRef.current = onCycle;
    const onCursorPressRef = useRef(onCursorPress);
    onCursorPressRef.current = onCursorPress;
    const cursorsRef = useRef(cursors);
    cursorsRef.current = cursors;
    const [labels, setLabels] = useState<Record<string, string | undefined>>({});
    const [visible, setVisible] = useState<Record<string, number>>({});
    const [reducedMotion, setReducedMotion] = useState(false);
    const reduced = useRef(false);
    reduced.current = reducedMotion;
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReducedMotion(query.matches);
      update();
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }, []);

    const runtime = (id: string) => {
      let state = runtimes.current.get(id);
      if (!state) {
        const index = runtimes.current.size;
        const seed = hashString(id);
        state = {
          id,
          index,
          position: { x: 0, y: 0 },
          label: { x: 0, y: 0 },
          labelVelocity: { x: 0, y: 0 },
          drift: 0,
          driftTarget: 1,
          phase: (seed % 1000) / 37,
          visible: false,
          pressed: false,
          hovered: null,
          random: createRandom(seed),
          element: null,
          trailElement: null,
          history: [],
          sayTimer: 0,
          selections: [],
          marked: new Set(),
        };
        runtimes.current.set(id, state);
      }
      return state;
    };

    // The trail ages in real time, so it shrinks away while a cursor rests or is paused.
    const drawTrail = (cursor: CursorRuntime, x: number, y: number, now: number) => {
      const svg = cursor.trailElement;
      if (!svg) return;
      const length = live.current.trail;
      const history = cursor.history;
      if (length > 0 && cursor.visible && !reduced.current) {
        const last = history[history.length - 1];
        if (!last || Math.abs(last.x - x) > 0.3 || Math.abs(last.y - y) > 0.3)
          history.push({ x, y, t: now });
        while (history.length && now - history[0].t > length) history.shift();
      } else history.length = 0;
      const segments = svg.children;
      const count = segments.length;
      for (let index = 0; index < count; index++) {
        // Older slices are thinner and fainter; each starts on the previous slice's last point.
        const from = now - (length * (count - index)) / count;
        const to = now - (length * (count - index - 1)) / count;
        let d = '';
        for (let point = 0; point < history.length; point++) {
          const sample = history[point];
          const next = history[point + 1];
          if (sample.t < from && !(next && next.t >= from)) continue;
          if (sample.t > to) break;
          d += `${d ? 'L' : 'M'}${sample.x.toFixed(1)} ${sample.y.toFixed(1)}`;
        }
        if (index === count - 1 && history.length)
          d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        segments[index].setAttribute('d', d);
      }
    };

    // One frame loop drives every cursor; time only advances while playing and visible.
    const frame = (now: number) => {
      const state = clock.current;
      const dtReal = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0);
      state.last = now;
      const running = live.current.playing && state.visible;
      const dt = running ? dtReal * 1000 * live.current.speed : 0;
      if (running) state.time += dt;
      for (const ticker of [...tickers.current])
        if (ticker(state.time, dt) === false) tickers.current.delete(ticker);
      const omega = 70 - 52 * Math.min(1, Math.max(0, live.current.labelLag));
      const drift = reduced.current ? 0 : live.current.idleDrift;
      for (const cursor of runtimes.current.values()) {
        const element = cursor.element;
        if (!element) continue;
        cursor.drift += (cursor.driftTarget - cursor.drift) * Math.min(1, dtReal * 2.5);
        const sway = idleSway(state.time, cursor.phase);
        const x = cursor.position.x + sway.x * drift * cursor.drift;
        const y = cursor.position.y + sway.y * drift * cursor.drift;
        if (reduced.current) {
          cursor.label = { x, y };
          cursor.labelVelocity = { x: 0, y: 0 };
        } else {
          const [lx, vx] = springStep(cursor.label.x, cursor.labelVelocity.x, x, omega, dtReal);
          const [ly, vy] = springStep(cursor.label.y, cursor.labelVelocity.y, y, omega, dtReal);
          cursor.label = { x: lx, y: ly };
          cursor.labelVelocity = { x: vx, y: vy };
        }
        drawTrail(cursor, x, y, now);
        element.style.setProperty('--cursor-x', `${x.toFixed(2)}px`);
        element.style.setProperty('--cursor-y', `${y.toFixed(2)}px`);
        element.style.setProperty('--label-dx', `${(cursor.label.x - x).toFixed(2)}px`);
        element.style.setProperty('--label-dy', `${(cursor.label.y - y).toFixed(2)}px`);
      }
      state.frame = requestAnimationFrame(frame);
    };

    useEffect(() => {
      const state = clock.current;
      state.last = 0;
      state.frame = requestAnimationFrame(frame);
      const element = root.current;
      const observer =
        element && 'IntersectionObserver' in window
          ? new IntersectionObserver(([entry]) => {
              state.visible = entry.isIntersecting;
            })
          : undefined;
      if (element) observer?.observe(element);
      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(state.frame);
        else {
          state.last = 0;
          cancelAnimationFrame(state.frame);
          state.frame = requestAnimationFrame(frame);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        cancelAnimationFrame(state.frame);
        observer?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
      };
      // The frame callback reads everything through refs.
    }, []);

    /* ---------- geometry ---------- */

    // React detaches the ref before unmount cleanups run; measure nothing then.
    const rootRect = () => root.current?.getBoundingClientRect() ?? new DOMRect();
    const resolveElement = (target: string | Element) =>
      typeof target === 'string' ? root.current?.querySelector(target) : target;

    const resolve = (cursor: CursorRuntime, target: CursorTarget, jitter = true) => {
      const box = rootRect();
      if (typeof target === 'object' && !(target instanceof Element) && !('target' in target))
        return {
          point: { x: cssPoint(target.x, box.width), y: cssPoint(target.y, box.height) },
          size: 40,
          element: null as Element | null,
        };
      const spec = typeof target === 'string' || target instanceof Element ? { target } : target;
      const element = resolveElement(spec.target);
      if (!element) throw new Error(`ShowcasePointer: no element for ${String(spec.target)}`);
      const rect = element.getBoundingClientRect();
      // Land near the center like a person would, not on the exact same pixel every time.
      const spread = live.current.rules.landingSpread;
      const fx = spec.x ?? 0.5 + (jitter ? (cursor.random() - 0.5) * 0.28 * spread : 0);
      const fy = spec.y ?? 0.5 + (jitter ? (cursor.random() - 0.5) * 0.24 * spread : 0);
      return {
        point: {
          x: rect.left - box.left + rect.width * fx,
          y: rect.top - box.top + rect.height * fy,
        },
        size: Math.min(rect.width, rect.height),
        element,
      };
    };

    /* ---------- scheduling ---------- */

    const tween = (
      cancel: Cancel,
      duration: number,
      update: (progress: number) => void,
      motion = true,
    ) =>
      new Promise<void>((resolvePromise, reject) => {
        if (cancel.cancelled) return reject(new Cancelled());
        // Reduced motion skips movement, but pauses keep the script's rhythm.
        if (duration <= 0 || (motion && reduced.current)) {
          update(1);
          return resolvePromise();
        }
        let start = -1;
        tickers.current.add((time) => {
          if (cancel.cancelled) {
            reject(new Cancelled());
            return false;
          }
          if (start < 0) start = time;
          const progress = Math.min(1, (time - start) / duration);
          try {
            update(progress);
          } catch (error) {
            // Fail this script, never the shared frame loop.
            reject(error);
            return false;
          }
          if (progress >= 1) {
            resolvePromise();
            return false;
          }
        });
      });

    const wait = (cancel: Cancel, duration: number) => tween(cancel, duration, () => {}, false);

    /* ---------- synthetic input ---------- */

    const dispatch = (
      cursor: CursorRuntime,
      element: Element,
      types: string[],
      point: Point,
      extra: MouseEventInit = {},
    ) => {
      if (!root.current) return;
      const box = rootRect();
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: box.left + point.x,
        clientY: box.top + point.y,
        view: window,
        ...extra,
      };
      for (const type of types) {
        const pointer = type.startsWith('pointer');
        const event =
          pointer && 'PointerEvent' in window
            ? new PointerEvent(type, {
                ...init,
                pointerId: 9000 + cursor.index,
                pointerType: 'mouse',
                isPrimary: false,
                bubbles: !type.endsWith('enter') && !type.endsWith('leave'),
              })
            : pointer
              ? null
              : new MouseEvent(type, {
                  ...init,
                  bubbles: !type.endsWith('enter') && !type.endsWith('leave'),
                });
        if (event) element.dispatchEvent(event);
      }
    };

    const hitTest = (point: Point, fallback: Element | null) => {
      const box = rootRect();
      const hit = document.elementFromPoint(box.left + point.x, box.top + point.y);
      return hit && root.current?.contains(hit) && !overlay.current?.contains(hit) ? hit : fallback;
    };

    const setHovered = (cursor: CursorRuntime, element: Element | null) => {
      if (cursor.hovered === element) return;
      const previous = cursor.hovered;
      if (previous) {
        const owners = hoverOwners.get(previous);
        owners?.delete(cursor.id);
        if (!owners?.size) previous.removeAttribute('data-cursor-hover');
        dispatch(
          cursor,
          previous,
          ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'],
          cursor.position,
          {
            relatedTarget: element,
          },
        );
      }
      cursor.hovered = element;
      if (element) {
        const owners = hoverOwners.get(element) ?? new Set();
        owners.add(cursor.id);
        hoverOwners.set(element, owners);
        element.setAttribute('data-cursor-hover', cursor.id);
        (element as HTMLElement).style?.setProperty(
          '--showcase-pointer-cursor-color',
          cursorsRef.current.find((item) => item.id === cursor.id)?.color ?? '',
        );
        dispatch(
          cursor,
          element,
          ['pointerover', 'pointerenter', 'mouseover', 'mouseenter'],
          cursor.position,
          {
            relatedTarget: previous,
          },
        );
      }
    };

    const travel = async (
      cancel: Cancel,
      cursor: CursorRuntime,
      to: Point,
      size: number,
      options: MoveOptions & { pace?: number; onMove?: (point: Point) => void } = {},
    ) => {
      const from = { ...cursor.position };
      const plan = planReach(from, to, size, cursor.random, options.pace, live.current.rules);
      cursor.driftTarget = 0;
      await tween(cancel, options.duration ?? plan.duration, (progress) => {
        cursor.position = plan.at(progress);
        options.onMove?.(cursor.position);
      });
      cursor.position = { ...to };
      cursor.driftTarget = 1;
    };

    const pulse = (cursor: CursorRuntime) => {
      const element = cursor.element;
      if (!element || !live.current.clickEffect) return;
      const arrow = element.querySelector<HTMLElement>('.showcase-pointer-cursor-arrow');
      if (reduced.current) return;
      arrow?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(0.82)', offset: 0.35 },
          { transform: 'scale(1)' },
        ],
        { duration: 320 / live.current.speed, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      const ring = document.createElement('span');
      ring.className = 'showcase-pointer-cursor-ripple';
      element.append(ring);
      ring
        .animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.55 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
          ],
          { duration: 620 / live.current.speed, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        )
        .finished.finally(() => ring.remove());
    };

    const press = (cursor: CursorRuntime, down: boolean) => {
      cursor.pressed = down;
      cursor.element?.toggleAttribute('data-pressed', down && live.current.clickEffect);
    };

    const color = (cursor: CursorRuntime) =>
      cursorsRef.current.find((item) => item.id === cursor.id)?.color ?? '#0d99ff';

    const drawRange = (cursor: CursorRuntime, range: Range, layer: HTMLDivElement) => {
      const box = rootRect();
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.5);
      layer.replaceChildren(
        ...rects.map((rect) => {
          const block = document.createElement('span');
          block.className = 'showcase-pointer-cursor-highlight';
          block.style.cssText = `left:${rect.left - box.left}px;top:${rect.top - box.top}px;width:${rect.width}px;height:${rect.height}px;--showcase-pointer-cursor-color:${color(cursor)}`;
          return block;
        }),
      );
    };

    const clear = (cursor: CursorRuntime) => {
      for (const selection of cursor.selections) selection.layer.remove();
      cursor.selections = [];
      for (const element of cursor.marked) element.removeAttribute('data-cursor-selected');
      cursor.marked.clear();
    };

    /* ---------- actions ---------- */

    const enter = async (cancel: Cancel, cursor: CursorRuntime, at?: CursorTarget) => {
      if (at) cursor.position = resolve(cursor, at, false).point;
      cursor.label = { ...cursor.position };
      cursor.visible = true;
      setVisible((old) => ({ ...old, [cursor.id]: Math.abs(old[cursor.id] ?? 0) + 1 }));
      await wait(cancel, 450);
    };

    const leave = async (cancel: Cancel, cursor: CursorRuntime) => {
      setHovered(cursor, null);
      cursor.visible = false;
      setVisible((old) => ({ ...old, [cursor.id]: -Math.abs(old[cursor.id] ?? 1) }));
      await wait(cancel, 300);
    };

    const runStep = async (cancel: Cancel, cursor: CursorRuntime, step: CursorStep) => {
      if (cancel.cancelled) throw new Cancelled();
      if (
        !cursor.visible &&
        step.action !== 'enter' &&
        step.action !== 'wait' &&
        step.action !== 'call'
      )
        await enter(cancel, cursor);
      switch (step.action) {
        case 'enter':
          return enter(cancel, cursor, step.at);
        case 'leave':
          return leave(cancel, cursor);
        case 'wait':
          return wait(cancel, step.duration);
        case 'call':
          return step.run();
        case 'clear':
          return clear(cursor);
        case 'say': {
          const text = step.text;
          setLabels((old) => ({ ...old, [cursor.id]: text }));
          const id = ++cursor.sayTimer;
          if (step.duration)
            void wait(cancel, step.duration)
              .then(() => {
                if (cursor.sayTimer === id)
                  setLabels((old) => ({ ...old, [cursor.id]: undefined }));
              })
              .catch(() => {});
          return;
        }
        case 'move': {
          const { point, size } = resolve(cursor, step.to);
          setHovered(cursor, null);
          return travel(cancel, cursor, point, size, step);
        }
        case 'hover':
        case 'click': {
          const { point, size, element } = resolve(cursor, step.target);
          await travel(cancel, cursor, point, size, step);
          setHovered(cursor, hitTest(point, element));
          if (step.action === 'hover') return;
          await wait(cancel, 120 + cursor.random() * 120);
          const target = hitTest(point, element) ?? element;
          if (!target) return;
          press(cursor, true);
          target.setAttribute('data-cursor-press', cursor.id);
          pulse(cursor);
          try {
            await wait(cancel, 90);
          } finally {
            target.removeAttribute('data-cursor-press');
            press(cursor, false);
          }
          onCursorPressRef.current?.({ cursorId: cursor.id, target });
          return;
        }
        case 'drag': {
          const start = resolve(cursor, step.from);
          await travel(cancel, cursor, start.point, start.size, step);
          const target = hitTest(start.point, start.element) ?? start.element;
          setHovered(cursor, target);
          await wait(cancel, 140);
          if (!target) return;
          press(cursor, true);
          target.setAttribute('data-cursor-press', cursor.id);
          dispatch(cursor, target, ['pointerdown', 'mousedown'], start.point, {
            button: 0,
            buttons: 1,
          });
          await wait(cancel, 160);
          const end = resolve(cursor, step.to);
          await travel(cancel, cursor, end.point, Math.max(60, end.size), {
            pace: live.current.rules.dragPace,
            onMove: (point) =>
              dispatch(cursor, target, ['pointermove', 'mousemove'], point, { buttons: 1 }),
          });
          await wait(cancel, 120);
          dispatch(cursor, target, ['pointerup', 'mouseup'], end.point, { button: 0 });
          target.removeAttribute('data-cursor-press');
          press(cursor, false);
          return;
        }
        case 'select': {
          const element = resolveElement(step.target);
          if (!element) return;
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const nodes: Text[] = [];
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          const total = nodes.reduce((sum, node) => sum + node.length, 0);
          const from = Math.max(0, Math.min(total, step.start ?? 0));
          const to = Math.max(from, Math.min(total, step.end ?? total));
          const locate = (offset: number) => {
            let rest = offset;
            for (const node of nodes) {
              if (rest <= node.length) return [node, rest] as const;
              rest -= node.length;
            }
            return [nodes[nodes.length - 1], nodes[nodes.length - 1].length] as const;
          };
          const caret = (offset: number, edge: 'start' | 'end') => {
            const range = document.createRange();
            const [node, position] = locate(offset);
            const a = edge === 'start' ? position : Math.max(0, position - 1);
            range.setStart(node, a);
            range.setEnd(node, Math.min(node.length, a + 1));
            const rect = range.getBoundingClientRect();
            const box = rootRect();
            return {
              x: (edge === 'start' ? rect.left : rect.right) - box.left,
              y: rect.top - box.top + rect.height * 0.62,
            };
          };
          const startPoint = caret(from, 'start');
          await travel(cancel, cursor, startPoint, 16);
          setHovered(cursor, element);
          await wait(cancel, 120);
          press(cursor, true);
          const layer = document.createElement('div');
          layer.className = 'showcase-pointer-cursor-selection';
          overlay.current?.prepend(layer);
          const range = document.createRange();
          range.setStart(...locate(from));
          range.setEnd(...locate(from));
          cursor.selections.push({ range, layer });
          const points = Array.from({ length: to - from }, (_, index) =>
            caret(from + index + 1, 'end'),
          );
          cursor.driftTarget = 0;
          let shown = from;
          await tween(cancel, step.duration ?? Math.min(1800, 260 + (to - from) * 38), (p) => {
            const eased = 1 - (1 - p) ** 3;
            const exact = eased * points.length;
            const index = Math.min(points.length - 1, Math.floor(exact));
            const before = index > 0 ? points[index - 1] : startPoint;
            const after = points[index] ?? startPoint;
            const t = exact - index;
            // Stay on the line while crossing a wrap instead of cutting diagonally.
            cursor.position =
              Math.abs(after.y - before.y) > 4 && t < 0.5
                ? before
                : {
                    x: before.x + (after.x - before.x) * t,
                    y: before.y + (after.y - before.y) * t,
                  };
            const next = from + Math.min(points.length, Math.round(exact));
            if (next !== shown) {
              shown = next;
              range.setEnd(...locate(next));
              drawRange(cursor, range, layer);
            }
          });
          range.setEnd(...locate(to));
          drawRange(cursor, range, layer);
          cursor.driftTarget = 1;
          press(cursor, false);
          return;
        }
        case 'marquee': {
          const start = resolve(cursor, step.from, false);
          await travel(cancel, cursor, start.point, 30);
          setHovered(cursor, null);
          await wait(cancel, 120);
          press(cursor, true);
          const box = document.createElement('div');
          box.className = 'showcase-pointer-cursor-marquee';
          box.style.setProperty('--showcase-pointer-cursor-color', color(cursor));
          overlay.current?.prepend(box);
          const items = step.items ? [...(root.current?.querySelectorAll(step.items) ?? [])] : [];
          const end = resolve(cursor, step.to, false);
          const update = (point: Point) => {
            const left = Math.min(start.point.x, point.x);
            const top = Math.min(start.point.y, point.y);
            const width = Math.abs(point.x - start.point.x);
            const height = Math.abs(point.y - start.point.y);
            box.style.cssText += `;left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
            const area = rootRect();
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              const hit =
                rect.right - area.left > left &&
                rect.left - area.left < left + width &&
                rect.bottom - area.top > top &&
                rect.top - area.top < top + height;
              if (hit && !cursor.marked.has(item)) {
                cursor.marked.add(item);
                item.setAttribute('data-cursor-selected', cursor.id);
                (item as HTMLElement).style?.setProperty(
                  '--showcase-pointer-cursor-color',
                  color(cursor),
                );
              } else if (!hit && cursor.marked.has(item)) {
                cursor.marked.delete(item);
                item.removeAttribute('data-cursor-selected');
              }
            }
          };
          update(start.point);
          await travel(cancel, cursor, end.point, 80, {
            pace: live.current.rules.dragPace * 0.93,
            onMove: update,
          });
          await wait(cancel, 160);
          press(cursor, false);
          await tween(cancel, 220, (p) => {
            box.style.opacity = String(1 - p);
          });
          box.remove();
          return;
        }
        case 'type': {
          const element = resolveElement(step.target);
          if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
            return;
          const { point, size } = resolve(cursor, element);
          await travel(cancel, cursor, point, size);
          setHovered(cursor, element);
          pulse(cursor);
          element.setAttribute('data-cursor-focus', cursor.id);
          element.style.setProperty('--showcase-pointer-cursor-color', color(cursor));
          const prototype = Object.getPrototypeOf(element) as object;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          for (const character of step.text) {
            await wait(cancel, (step.delay ?? 70) * (0.6 + cursor.random() * 0.9));
            // The native setter keeps React-controlled inputs in sync.
            setter?.call(element, element.value + character);
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
          await wait(cancel, 300);
          element.removeAttribute('data-cursor-focus');
          return;
        }
      }
    };

    const controller = (id: string, cancel: Cancel = { cancelled: false }): CursorController => {
      const cursor = runtime(id);
      const run = (step: CursorStep) => runStep(cancel, cursor, step);
      return {
        enter: (at) => run({ action: 'enter', at }),
        leave: () => run({ action: 'leave' }),
        moveTo: (to, options) => run({ action: 'move', to, ...options }),
        hover: (target, options) => run({ action: 'hover', target, ...options }),
        click: (target, options) => run({ action: 'click', target, ...options }),
        drag: (from, to, options) => run({ action: 'drag', from, to, ...options }),
        select: (target, options) => run({ action: 'select', target, ...options }),
        marquee: (from, to, options) => run({ action: 'marquee', from, to, ...options }),
        type: (target, text, delay) => run({ action: 'type', target, text, delay }),
        say: (text, duration) => run({ action: 'say', text, duration }),
        wait: (duration) => run({ action: 'wait', duration }),
        clear: () => run({ action: 'clear' }),
      };
    };

    const placeAtStart = (config: CursorConfig, index: number, count: number) => {
      const cursor = runtime(config.id);
      const box = rootRect();
      cursor.position = config.start
        ? resolve(cursor, config.start, false).point
        : {
            x: box.width * ((index + 1) / (count + 1)),
            y: box.height * (0.72 + (index % 2) * 0.1),
          };
      cursor.label = { ...cursor.position };
      cursor.labelVelocity = { x: 0, y: 0 };
    };

    const resetAll = () => {
      for (const cursor of runtimes.current.values()) {
        clear(cursor);
        setHovered(cursor, null);
        press(cursor, false);
        cursor.sayTimer++;
      }
      setLabels({});
    };

    // Restart only when ids or steps change; names and colors update live.
    const scriptKey = JSON.stringify(
      cursors.map(({ id, start, script }) => ({ id, start, script })),
      (_, value) =>
        typeof Element !== 'undefined' && value instanceof Element ? '[element]' : value,
    );

    useLayoutEffect(() => {
      if (!root.current) return;
      const cancel: Cancel = { cancelled: false };
      const configs = cursorsRef.current;
      resetAll();
      configs.forEach((config, index) => {
        placeAtStart(config, index, configs.length);
        runtime(config.id).visible = !config.script?.length || config.script[0].action !== 'enter';
      });
      setVisible(
        Object.fromEntries(
          configs.map((config) => [config.id, runtime(config.id).visible ? 1 : 0]),
        ),
      );
      const cycle = async () => {
        while (!cancel.cancelled) {
          await Promise.all(
            cursorsRef.current.map(async (config) => {
              const cursor = runtime(config.id);
              for (const step of config.script ?? []) await runStep(cancel, cursor, step);
            }),
          );
          if (!live.current.loop) return;
          await wait(cancel, live.current.loopDelay);
          resetAll();
          onCycleRef.current?.();
          const current = cursorsRef.current;
          current.forEach((config, index) => {
            const cursor = runtime(config.id);
            if (config.script?.[0]?.action === 'enter' && cursor.visible) {
              cursor.visible = false;
              setVisible((old) => ({ ...old, [config.id]: -Math.abs(old[config.id] ?? 1) }));
            }
            if (!cursor.visible) placeAtStart(config, index, current.length);
          });
          await wait(cancel, 300);
        }
      };
      cycle().catch((error) => {
        if (!(error instanceof Cancelled)) console.error(error);
      });
      return () => {
        cancel.cancelled = true;
      };
      // scriptKey and generation capture every reason to restart.
    }, [scriptKey, generation]);

    // Selections follow reflow.
    useEffect(() => {
      const element = root.current;
      if (!element || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        for (const cursor of runtimes.current.values())
          for (const selection of cursor.selections)
            drawRange(cursor, selection.range, selection.layer);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    useEffect(
      () => () => {
        for (const cursor of runtimes.current.values()) {
          clear(cursor);
          setHovered(cursor, null);
        }
      },
      [],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        cursor: (id) => controller(id),
        run: async (id, steps) => {
          const cancel = { cancelled: false };
          for (const step of steps) await runStep(cancel, runtime(id), step);
        },
        restart: () => setGeneration((value) => value + 1),
      }),
      [],
    );

    return (
      <div
        ref={root}
        className={`showcase-pointer ${className}`.trim()}
        style={{ ...style, ...(height !== undefined ? { height } : null) }}
      >
        {children}
        <div ref={overlay} className="showcase-pointer-overlay" aria-hidden="true">
          {trail > 0 &&
            cursors.map((config) => (
              <svg
                key={`trail-${config.id}`}
                ref={(element) => {
                  runtime(config.id).trailElement = element;
                }}
                className="showcase-pointer-cursor-trail"
                style={{ color: config.color }}
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <path
                    key={index}
                    strokeWidth={trailWidth * (0.3 + (0.7 * (index + 1)) / 8)}
                    strokeOpacity={(0.6 * (index + 1)) / 8}
                  />
                ))}
              </svg>
            ))}
          {cursors.map((config) => {
            const shown = visible[config.id] ?? 0;
            return (
              <div
                key={config.id}
                ref={(element) => {
                  runtime(config.id).element = element;
                }}
                className="showcase-pointer-cursor"
                data-visible={shown > 0 || undefined}
                style={
                  {
                    '--showcase-pointer-cursor-color': config.color,
                    '--showcase-pointer-cursor-text':
                      config.textColor ?? readableTextColor(config.color),
                    '--showcase-pointer-cursor-scale': cursorSize,
                  } as CSSProperties
                }
              >
                <div className="showcase-pointer-cursor-body">
                  <svg
                    className="showcase-pointer-cursor-arrow"
                    viewBox="0 0 24 24"
                    width="28"
                    height="28"
                  >
                    <path
                      className="showcase-pointer-cursor-arrow-edge"
                      d="M4.2 3.3 20.1 9.6 13.3 12.3 10.6 19.2Z"
                    />
                    <path
                      className="showcase-pointer-cursor-arrow-fill"
                      d="M4.2 3.3 20.1 9.6 13.3 12.3 10.6 19.2Z"
                    />
                  </svg>
                  {showLabels && (
                    <div className="showcase-pointer-cursor-label-anchor">
                      {shown !== 0 && (
                        <CursorLabel
                          key={Math.abs(shown)}
                          text={labels[config.id] ?? config.name}
                          animation={labelAnimation}
                          reducedMotion={reducedMotion}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
