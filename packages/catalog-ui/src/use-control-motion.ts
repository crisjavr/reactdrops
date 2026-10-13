import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function useControlMotion(
  progress: number,
  renderValue: (value: number) => void,
  disabled = false,
) {
  const renderRef = useRef(renderValue);
  renderRef.current = renderValue;
  const motion = useRef({ progress, target: progress });
  const follow = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const preference = useRef<MediaQueryList | null>(null);

  useLayoutEffect(() => {
    const state = motion.current;
    const render = () => renderRef.current(state.progress);
    // Reusable follower for slider fills and viewport guides; no React updates per frame.
    const move = gsap.quickTo(state, 'progress', {
      duration: 0.3,
      ease: 'power4',
      onUpdate: render,
    });
    follow.current = move;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.current = reduced;
    const syncPreference = () => {
      if (reduced.matches) {
        move.tween.pause();
        state.progress = state.target;
        render();
      }
    };
    reduced.addEventListener('change', syncPreference);
    render();
    return () => {
      move.tween.kill();
      reduced.removeEventListener('change', syncPreference);
      follow.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const state = motion.current;
    state.target = progress;
    if (disabled || preference.current?.matches) {
      follow.current?.tween.pause();
      state.progress = progress;
      renderRef.current(progress);
    } else if (state.progress !== progress) {
      follow.current?.(progress);
    } else {
      follow.current?.tween.pause();
    }
  }, [progress, disabled]);
}
