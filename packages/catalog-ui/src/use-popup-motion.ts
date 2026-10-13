import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { popupContentBlur, popupEntranceDuration } from './popup-motion-settings';

// Precompute spring timing once; the browser animates the resulting transforms.
function springSamples(stiffness: number, damping: number, mass: number, duration: number) {
  const decay = damping / (2 * mass);
  const frequency = Math.sqrt(stiffness / mass - decay * decay);
  const steps = Math.ceil(duration / 16);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = ((index / steps) * duration) / 1000;
    const offset = index / steps;
    const residual =
      Math.exp(-decay * t) *
      (Math.cos(frequency * t) + (decay / frequency) * Math.sin(frequency * t));
    // Keep the visible bounce, then land exactly instead of scaling borders by
    // tiny fractions for the rest of the animation. Smoothstep avoids a snap.
    const settle = Math.max(0, Math.min(1, (offset - 0.5) / 0.2));
    const tail = 1 - settle * settle * (3 - 2 * settle);
    return { offset, progress: 1 - residual * tail };
  });
}
const panelSpring = springSamples(460, 23, 0.9, 650);
const softPanelSpring = springSamples(460, 31, 0.9, 650);
// One overshoot followed by a smooth return, without repeated spring oscillations.
const singleBounce = Array.from({ length: 45 }, (_, index) => {
  const offset = index / 44,
    t = offset - 1,
    overshoot = 4;
  return { offset, progress: index === 0 ? 0 : 1 + (overshoot + 1) * t ** 3 + overshoot * t ** 2 };
});

// Between GSAP power3.out (exponent 4) and power4.out (exponent 5).
// Sample the custom exponent once for native CSS timing.
const borderIntermediateOut = `linear(${Array.from({ length: 101 }, (_, i) => 1 - (1 - i / 100) ** 4.6).join(', ')})`;

/** Shared select and color-picker presence, entrance and exit choreography. */
export function usePopupMotion({
  open,
  ready,
  anchor,
  shell,
  panel,
  unfold = 'vertical',
  bounce = true,
  scale = true,
  entranceDuration = popupEntranceDuration,
  surfaceBlurAmount = 1.4,
  contentBlurAmount = popupContentBlur.amount,
  contentBlurDuration = popupContentBlur.duration,
  contentBlurEasing = popupContentBlur.easing,
}: {
  open: boolean;
  ready: boolean;
  anchor: RefObject<HTMLDivElement | null>;
  shell: RefObject<HTMLDivElement | null>;
  panel: RefObject<HTMLDivElement | null>;
  unfold?: 'vertical' | 'corner' | 'center';
  bounce?: boolean | 'soft' | 'single';
  scale?: boolean;
  entranceDuration?: number;
  surfaceBlurAmount?: number;
  contentBlurAmount?: number;
  contentBlurDuration?: number;
  contentBlurEasing?: string;
}) {
  const [present, setPresent] = useState(open);
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  useLayoutEffect(() => {
    if (!present || !ready || !shell.current || !panel.current || !anchor.current) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const body = panel.current;
    const surface = body.querySelector<HTMLElement>('[data-popup-surface]')!;
    const content =
      unfold === 'vertical' ? body.querySelector<HTMLElement>('[data-popup-content]')! : body;
    const field =
      anchor.current.closest<HTMLElement>('.reveal-field') ??
      anchor.current.querySelector<HTMLElement>('[role=combobox]') ??
      anchor.current;
    const running = animations.current;
    // Capture a mid-flight reversal once, before replacing the animations.
    const mover = unfold === 'vertical' ? content : body;
    const current = running.length ? new DOMMatrix(getComputedStyle(mover).transform) : null;
    const filter = running.length
      ? getComputedStyle(content).filter
      : open
        ? `blur(${contentBlurAmount}px)`
        : 'blur(0px)';
    const surfaceFilter = running.length
      ? getComputedStyle(surface).filter
      : open
        ? `blur(${surfaceBlurAmount}px)`
        : 'blur(0px)';
    const opacity = running.length ? getComputedStyle(content).opacity : open ? '0' : '1';
    const panelOpacity = running.length ? getComputedStyle(body).opacity : '1';
    running.forEach((animation) => animation.cancel());
    animations.current = [];
    body.style.opacity = '';
    content.style.opacity = '';
    body.style.overflow = '';
    body.style.visibility = '';
    let alive = true;
    if (preference.matches) {
      mover.style.transform = 'none';
      surface.style.top = '0px';
      surface.style.height = '100%';
      surface.style.filter = content.style.filter = 'blur(0px)';
      if (!open) setPresent(false);
      return;
    }
    const from = field.getBoundingClientRect();
    const to = shell.current.getBoundingClientRect();
    const upward = to.top < from.top;
    const corner = unfold === 'corner';
    const direction = upward ? 1 : -1;
    // Panel and content unfold from the edge next to the trigger.
    // Above the field, mirror both the origin and the vertical travel.
    mover.style.transformOrigin = `${corner ? '0%' : '50%'} ${upward ? '100%' : '0%'}`;
    const animate = (
      element: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const animation = element.animate(frames, { fill: 'both', ...options });
      animations.current.push(animation);
      // Preserve the exact final rendering state before releasing the effect.
      // In particular, blur(0px) must not turn into none on a separate paint:
      // that can change the antialiasing of a thin border after it looks settled.
      animation.finished.then(
        () => {
          if (!alive) return;
          const final = frames[frames.length - 1];
          if (typeof final.filter === 'string') element.style.filter = final.filter;
          if (typeof final.transform === 'string') element.style.transform = final.transform;
          if (typeof final.top === 'string') element.style.top = final.top;
          if (typeof final.height === 'string') element.style.height = final.height;
          if (final.opacity !== undefined) element.style.opacity = String(final.opacity);
          if (!open && frames.some((frame) => frame.opacity === 0))
            body.style.visibility = 'hidden';
          animation.cancel();
          animations.current = animations.current.filter((item) => item !== animation);
        },
        () => {},
      );
      return animation;
    };
    const start = current
      ? { x: current.a, y: current.d, shift: current.f }
      : open
        ? {
            x: !scale || unfold === 'vertical' ? 1 : 0.86,
            y: scale ? 0.72 : 1,
            shift: direction * 10,
          }
        : { x: 1, y: 1, shift: 0 };
    const end = open
      ? { x: 1, y: 1, shift: 0 }
      : {
          x: !scale || unfold === 'vertical' ? 1 : 0.92,
          y: scale ? 0.86 : 1,
          shift: direction * 8,
        };
    const motionSamples =
      bounce === 'single'
        ? singleBounce
        : bounce === 'soft'
          ? softPanelSpring
          : bounce
            ? panelSpring
            : [
                { offset: 0, progress: 0 },
                { offset: 1, progress: 1 },
              ];
    const transformFrames = motionSamples.map(({ offset, progress }) => {
      const shift = start.shift + (end.shift - start.shift) * progress;
      const height = start.y + (end.y - start.y) * progress;
      return {
        offset,
        transform: `translateY(${shift}px) scale(${start.x + (end.x - start.x) * progress}, ${height})`,
      };
    });
    const transformTiming = {
      duration: open ? entranceDuration : 260,
      easing: bounce ? 'linear' : 'cubic-bezier(.22, 1, .36, 1)',
    };
    animate(mover, transformFrames, transformTiming);
    if (unfold === 'vertical') {
      // Resize the surface's geometry instead of scaling a rasterized 1px stroke.
      // Content keeps its existing motion; the border stays 1 CSS pixel throughout
      // the bounce and never has to switch from a scaled bitmap to a sharp stroke.
      // Percentages track the content's height, including filtering while open.
      animate(
        surface,
        motionSamples.map(({ offset, progress }) => {
          const height = start.y + (end.y - start.y) * progress;
          const shift = start.shift + (end.shift - start.shift) * progress;
          return {
            offset,
            height: `${height * 100}%`,
            top: `calc(${upward ? (1 - height) * 100 : 0}% + ${shift}px)`,
          };
        }),
        transformTiming,
      );
    }
    if (!open && unfold === 'vertical') {
      // Fade the entire menu on exit so its surface cannot outlive the text.
      // Freeze any unfinished content fade while the parent fades as one layer.
      content.style.opacity = opacity;
      animate(body, [{ opacity: panelOpacity }, { opacity: 0 }], {
        duration: 120,
        easing: 'ease-out',
      });
    } else {
      animate(content, [{ opacity }, { opacity: open ? 1 : 0 }], {
        duration: 120,
        easing: 'ease-out',
      });
    }
    if (unfold === 'vertical') {
      // The border sharpens sooner, without stacking blur on the text.
      animate(surface, [{ filter: surfaceFilter }, { filter: 'blur(0px)' }], {
        duration: open ? 270 : 120,
        easing: open ? borderIntermediateOut : 'ease-out',
      });
      animate(content, [{ filter }, { filter: 'blur(0px)' }], {
        duration: open ? contentBlurDuration : 120,
        easing: open ? contentBlurEasing : 'ease-out',
      });
    }
    // Options appear together with the panel; only hover animates independently.
    const finish = () => {
      if (!alive) return;
      // Preserve the invisible exit before cancel() restores the CSS state.
      // React can commit the portal removal after the browser's next paint.
      if (!open) body.style.visibility = 'hidden';
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      body.style.overflow = '';
      if (!open) setPresent(false);
    };
    Promise.all(animations.current.map((animation) => animation.finished)).then(finish, () => {});
    const reduce = () => {
      if (preference.matches) finish();
    };
    preference.addEventListener('change', reduce);
    return () => {
      alive = false;
      preference.removeEventListener('change', reduce);
    };
  }, [
    open,
    present,
    ready,
    anchor,
    shell,
    panel,
    unfold,
    bounce,
    scale,
    entranceDuration,
    surfaceBlurAmount,
    contentBlurAmount,
    contentBlurDuration,
    contentBlurEasing,
  ]);

  useLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
    },
    [],
  );
  return present;
}
