import { useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { gsap } from 'gsap';

/** Stretch only the painted surface; layout, text and native range stay fixed. */
export function useNumberElasticity(root: RefObject<HTMLDivElement | null>, disabled: boolean) {
  const state = useRef({
    pointer: null as number | null,
    left: 0,
    right: 0,
    width: 1,
    leftLimit: 2,
    rightLimit: 2,
    pull: 0,
    edge: 1,
    element: null as HTMLDivElement | null,
    offset: '',
    elastic: null as string | null,
  });
  const spring = useRef<gsap.core.Tween | null>(null);
  const preference = useRef<MediaQueryList | null>(null);
  const restore = () => {
    const current = state.current;
    if (current.element) {
      if (current.offset) current.element.style.setProperty('--reveal-pull', current.offset);
      else current.element.style.removeProperty('--reveal-pull');
      if (current.elastic === null) delete current.element.dataset.elastic;
      else current.element.dataset.elastic = current.elastic;
    }
    current.pull = 0;
  };
  const paint = () => {
    const current = state.current;
    if (!current.element) return;
    current.element.style.setProperty(
      '--reveal-pull',
      `${current.edge * Math.max(0, current.pull)}px`,
    );
    current.element.dataset.elastic = 'true';
  };
  const reset = () => {
    spring.current?.kill();
    spring.current = null;
    state.current.pointer = null;
    restore();
  };
  const release = () => {
    const current = state.current;
    if (current.pointer === null) return;
    current.pointer = null;
    spring.current?.kill();
    if (disabled || preference.current?.matches || current.pull === 0) {
      restore();
      return;
    }
    spring.current = gsap.to(current, {
      pull: 0,
      duration: 0.85,
      ease: 'elastic.out(1, 0.6)',
      onUpdate: paint,
      onComplete: () => {
        restore();
        spring.current = null;
      },
    });
  };

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.current = reduced;
    const syncPreference = () => {
      if (reduced.matches) reset();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') release();
    };
    reduced.addEventListener('change', syncPreference);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', escape);
    if (disabled) reset();
    return () => {
      reduced.removeEventListener('change', syncPreference);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', escape);
      reset();
    };
  }, [disabled]);

  const begin = (event: PointerEvent<HTMLInputElement>) => {
    if (disabled || event.button !== 0 || !event.isPrimary || state.current.pointer !== null)
      return;
    reset();
    const element = root.current;
    if (!element) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const field = element.closest('.reveal-field');
    const fieldBounds = (field ?? element).getBoundingClientRect();
    let leftLimit = 2;
    let rightLimit = 2;
    // Reserve most of the gap even if two neighboring controls are pulled at once.
    for (const sibling of field?.parentElement?.children ?? []) {
      if (sibling === field || !sibling.matches('.reveal-field')) continue;
      const neighbor = sibling.getBoundingClientRect();
      if (neighbor.bottom <= fieldBounds.top || neighbor.top >= fieldBounds.bottom) continue;
      if (neighbor.right <= fieldBounds.left)
        leftLimit = Math.min(leftLimit, (fieldBounds.left - neighbor.right) / 3);
      else if (neighbor.left >= fieldBounds.right)
        rightLimit = Math.min(rightLimit, (neighbor.left - fieldBounds.right) / 3);
    }
    Object.assign(state.current, {
      pointer: event.pointerId,
      left: bounds.left,
      right: bounds.right,
      width: Math.max(1, bounds.width),
      leftLimit,
      rightLimit,
      element,
      offset: element.style.getPropertyValue('--reveal-pull'),
      elastic: element.getAttribute('data-elastic'),
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLInputElement>) => {
    const current = state.current;
    if (disabled || preference.current?.matches || current.pointer !== event.pointerId) return;
    const distance =
      event.clientX < current.left
        ? current.left - event.clientX
        : event.clientX > current.right
          ? event.clientX - current.right
          : 0;
    spring.current?.kill();
    spring.current = null;
    if (distance === 0) {
      restore();
      return;
    }
    current.edge = event.clientX < current.left ? -1 : 1;
    const limit = Math.min(
      current.edge < 0 ? current.leftLimit : current.rightLimit,
      current.width * 0.006,
    );
    // Increasing resistance keeps visual travel below the pointer's excess travel.
    current.pull = limit > 0 ? limit * (1 - Math.exp((-distance * 0.08) / limit)) : 0;
    paint();
  };
  return { begin, move, release };
}
