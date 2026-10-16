import { createViewportPlayback, type ViewportPlayback } from '../shared/viewport-playback';
import {
  createFanMotion,
  type FanCardElement,
  type FanLayoutInfo,
  type FanMotionOptions,
} from './fan-motion';
import { fanSettleTime } from './fan-motion';

export type FanAction = 'play' | 'reset' | 'finish';
export type FanTrigger = 'auto' | 'scroll' | 'manual' | 'hover';
export interface FanPlaybackOptions extends FanMotionOptions {
  trigger: FanTrigger;
  viewportStart: number;
  viewportStartUp?: number;
  once: boolean;
}
export interface FanPlayback {
  dispatch: (action: FanAction) => void;
  /** Focus a card (keyboard, taps); -1 clears the focus field. */
  activate: (index: number) => void;
  /** Focus the card under the pointer (stable slots, within the cards' band). */
  point: (clientX: number, clientY: number) => void;
  /** Apply new geometry and timing in place, without restarting anything. */
  update: (options: FanPlaybackOptions) => void;
  destroy: () => void;
}

/** Coordinate playback, input and observers without owning React or DOM transforms. */
export function createFanPlayback(
  element: HTMLElement,
  stage: HTMLDivElement,
  cards: FanCardElement[],
  initial: FanPlaybackOptions,
  pending: { current: FanAction | null },
  onLayout?: (info: FanLayoutInfo) => void,
): FanPlayback {
  let options = initial;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createFanMotion(
    { stage, cards, heading: element.querySelector<HTMLElement>('.fan-gallery-heading') },
    options,
    reduced,
    onLayout,
  );
  let state: 'idle' | 'playing' | 'finished' = 'idle';
  let played = false;
  let ready = false;
  let disposed = false;
  let viewport: ViewportPlayback | undefined;

  const setState = (next: typeof state) => {
    element.dataset.state = state = next;
  };
  const finish = () => {
    motion.cancel();
    motion.finish();
    setState('finished');
  };
  const reset = () => {
    if (reduced.matches) {
      finish();
      return;
    }
    motion.cancel();
    motion.reset();
    setState('idle');
  };
  const play = () => {
    if (disposed) return;
    played = true;
    viewport?.markPlayed();
    if (reduced.matches || fanSettleTime(options.speed, options.bounce) <= 0) {
      finish();
      return;
    }
    motion.cancel();
    setState('playing');
    motion.play(() => setState('finished'));
  };
  // Focus responds at any time, also while cards are arriving.
  const activate = (index: number) => {
    if (state === 'idle') return;
    motion.focusCard(index < 0 ? null : index);
  };
  const point = (clientX: number, clientY: number) => {
    if (state === 'idle') return;
    motion.focusPoint(clientX, clientY);
  };
  const update = (next: FanPlaybackOptions) => {
    options = next;
    motion.update(next);
  };
  const dispatch = (action: FanAction) => {
    if (!ready) {
      pending.current = action;
      return;
    }
    pending.current = null;
    if (action === 'play') play();
    else if (action === 'reset') reset();
    else finish();
  };
  const measure = () => {
    // Poses are recomputed from the new layout, even mid-entrance.
    if (!motion.measure()) return;
    element.dataset.ready = 'true';
  };
  measure();
  let resizeFrame: number | undefined;
  const resize = new ResizeObserver(() => {
    if (resizeFrame !== undefined) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (!disposed) measure();
    });
  });
  resize.observe(stage);

  const onHover = () => {
    if (options.trigger === 'hover' && state !== 'playing') play();
  };
  const onFocus = (event: FocusEvent) => {
    if (!event.relatedTarget || !element.contains(event.relatedTarget as Node)) onHover();
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') onHover();
  };
  const onMotionChange = () => {
    if (reduced.matches) finish();
  };
  element.addEventListener('pointerenter', onHover);
  element.addEventListener('focusin', onFocus);
  element.addEventListener('pointerdown', onPointer);
  reduced.addEventListener('change', onMotionChange);

  // A queued ref action survives StrictMode's discarded first effect.
  Promise.resolve().then(() => {
    if (disposed) return;
    ready = true;
    if (pending.current) dispatch(pending.current);
    else if (reduced.matches) finish();
    else if (options.trigger === 'auto') play();
    else reset();
    if (options.trigger === 'scroll') {
      viewport = createViewportPlayback(element, {
        viewportStart: options.viewportStart,
        viewportStartUp: options.viewportStartUp,
        once: options.once,
        played,
        play,
        reset,
        finish,
        isPlaying: () => state === 'playing',
      });
    }
  });
  const destroy = () => {
    disposed = true;
    viewport?.disconnect();
    resize.disconnect();
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    reduced.removeEventListener('change', onMotionChange);
    element.removeEventListener('pointerenter', onHover);
    element.removeEventListener('focusin', onFocus);
    element.removeEventListener('pointerdown', onPointer);
    motion.destroy();
    delete element.dataset.state;
    delete element.dataset.ready;
  };
  return { dispatch, activate, point, update, destroy };
}
