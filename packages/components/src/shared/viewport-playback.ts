export type ViewportEntrySide = 'above' | 'below' | null;
export type ViewportPlayback = {
  disconnect: () => void;
  markPlayed: () => void;
  getEntrySide: () => ViewportEntrySide;
};

/** IntersectionObserver also clips against ancestor scrollports, not just its root. */
function verticalVisibleBounds(element: HTMLElement, rootBounds: DOMRectReadOnly | null) {
  let top = rootBounds?.top ?? 0;
  let bottom = rootBounds?.bottom ?? innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (!/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(parent).overflowY)) continue;
    const bounds = parent.getBoundingClientRect();
    const scale = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1;
    const clipTop = bounds.top + parent.clientTop * scale;
    top = Math.max(top, clipTop);
    bottom = Math.min(bottom, clipTop + parent.clientHeight * scale);
  }
  return { top, bottom };
}

/** Directional entry lines, with reset only outside the full viewport. */
export function createViewportPlayback(
  element: HTMLElement,
  {
    viewportStart = 85,
    viewportStartUp,
    once = true,
    played: initiallyPlayed = false,
    play,
    reset,
    finish,
    isPlaying = () => false,
    entryElement = element,
    entrySide = null,
  }: {
    viewportStart?: number;
    viewportStartUp?: number;
    once?: boolean;
    played?: boolean;
    play: () => void;
    reset: () => void;
    finish: () => void;
    isPlaying?: () => boolean;
    /** Stable visual bounds for entry; the outer element still controls full-exit reset. */
    entryElement?: HTMLElement;
    /** Retain the last exit side when playback settings rebuild an observer. */
    entrySide?: ViewportEntrySide;
  },
): ViewportPlayback {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let played = initiallyPlayed,
    armed = !initiallyPlayed,
    disposed = false;
  let side = entrySide;
  let frame = 0,
    generation = 0;
  let observers: IntersectionObserver[] = [];
  const stop = () => {
    generation++;
    cancelAnimationFrame(frame);
    observers.forEach((observer) => observer.disconnect());
    observers = [];
  };
  const markPlayed = () => {
    played = true;
    armed = false;
  };
  const observe = () => {
    stop();
    if (disposed || motion.matches || (once && played)) return;
    if (typeof IntersectionObserver === 'undefined') {
      markPlayed();
      play();
      return;
    }
    const down = Number.isFinite(viewportStart) ? Math.min(100, Math.max(1, viewportStart)) : 85;
    const up =
      typeof viewportStartUp === 'number' && Number.isFinite(viewportStartUp)
        ? Math.min(100, Math.max(0, viewportStartUp))
        : 100 - down;
    const run = generation;
    const intersections: { visible?: boolean; above?: boolean; below?: boolean } = {};
    const evaluate = () => {
      if (disposed || motion.matches || run !== generation) return;
      if (intersections.visible === false) {
        if (!once) {
          const shouldReset = !armed || played || isPlaying();
          played = false;
          armed = true;
          if (shouldReset) reset();
        }
      } else if (intersections.visible && armed && side && intersections[side] && !isPlaying()) {
        markPlayed();
        play();
        if (once) stop();
      }
    };
    const watch = (key: keyof typeof intersections, rootMargin: string) => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (disposed || run !== generation) return;
          const entry = entries.at(-1);
          if (!entry) return;
          intersections[key] = entry.isIntersecting;
          if (key === 'visible') {
            if (!entry.isIntersecting) {
              // A gallery can leave a nested scrollport while its bounds are still
              // inside the browser viewport. Remember the actual side it left.
              const { top, bottom } = verticalVisibleBounds(element, entry.rootBounds);
              if (entry.boundingClientRect.bottom <= top) side = 'above';
              else if (entry.boundingClientRect.top >= bottom) side = 'below';
            } else if (!side) {
              // Initially visible content may already be past the downward entry line.
              // Upward entry requires having observed the element leave above first.
              side = 'below';
            }
          }
          // Batch observers so delivery order cannot trigger a spurious play/reset.
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(evaluate);
        },
        { rootMargin, threshold: 0 },
      );
      observers.push(observer);
      observer.observe(key === 'visible' ? element : entryElement);
    };
    watch('visible', '0px');
    watch('below', `0px 0px -${innerHeight * (1 - down / 100)}px 0px`);
    watch('above', `-${(innerHeight * up) / 100}px 0px 0px 0px`);
  };
  const onMotion = () => {
    if (motion.matches) {
      stop();
      finish();
    } else observe();
  };
  window.addEventListener('resize', observe);
  motion.addEventListener('change', onMotion);
  if (motion.matches) finish();
  else observe();
  return {
    markPlayed,
    getEntrySide: () => side,
    disconnect: () => {
      disposed = true;
      stop();
      window.removeEventListener('resize', observe);
      motion.removeEventListener('change', onMotion);
    },
  };
}
