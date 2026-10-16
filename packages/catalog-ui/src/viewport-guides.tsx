import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useControlMotion } from './use-control-motion';
import { popupEntranceDuration } from './popup-motion-settings';
import './viewport-guides.css';

export type ViewportGuideInteraction = { input: HTMLInputElement; direction: 'down' | 'up' };

function ViewportGuide({
  direction,
  value,
  active,
}: {
  direction: 'down' | 'up';
  value: number;
  active: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(value < 8);
  const placement = useRef(below);
  const previousPlacement = useRef<boolean | null>(null);
  useControlMotion(value, (position) => {
    if (root.current)
      root.current.style.transform = `translate3d(0, clamp(1px, ${position}vh, calc(100vh - 1px)), 0)`;
    // Switch sides when the rendered line reaches the edge, not its target value.
    const next = position < 8;
    if (placement.current !== next) {
      placement.current = next;
      setBelow(next);
    }
  });
  useLayoutEffect(() => {
    if (!label.current) return;
    const badge = label.current;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    // The label's origin is inside the line's 1px border: include that pixel
    // above so the visible gap is exactly 7px on either side.
    const target = { y: below ? 7 : -8, yPercent: below ? 0 : -100 };
    let animation: gsap.core.Timeline | undefined;
    const settle = () => {
      animation?.kill();
      gsap.set(badge, target);
      badge.removeAttribute('data-flipping');
    };
    if (previousPlacement.current === null || previousPlacement.current === below || motion.matches)
      settle();
    else {
      badge.dataset.flipping = 'true';
      // The badge floats opposite to the line's travel. Retarget from its current
      // position on reversals.
      animation = gsap
        .timeline({
          onComplete: () => {
            badge.removeAttribute('data-flipping');
          },
        })
        .to(badge, { ...target, duration: popupEntranceDuration / 1000, ease: 'back.out(1)' }, 0);
    }
    previousPlacement.current = below;
    const onMotion = () => {
      if (motion.matches) settle();
    };
    motion.addEventListener('change', onMotion);
    return () => {
      animation?.kill();
      motion.removeEventListener('change', onMotion);
    };
  }, [below]);
  return (
    <div
      ref={root}
      className={`viewport-guide is-${direction}${active ? ' is-active' : ''}`}
      data-direction={direction}
      data-position={value}
      data-at-top={below}
    >
      <span ref={label} className="viewport-guide-label">
        <span className="viewport-guide-label-surface">
          <span className="viewport-guide-label-text">
            {direction === 'down' ? '↓ Scroll down' : '↑ Scroll up'}{' '}
            <b>{Number(value.toFixed(2))}%</b>
          </span>
        </span>
      </span>
    </div>
  );
}

/** Catalog-only guides use the same viewport as the entrance observers. */
export function ViewportGuides({
  interaction,
  down,
  up,
  separate,
}: {
  interaction: ViewportGuideInteraction | null;
  down: number;
  up: number;
  separate: boolean;
}) {
  const [presentation, setPresentation] = useState<{
    style: CSSProperties;
    direction: 'down' | 'up';
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const open = !!interaction;
  useLayoutEffect(() => {
    if (!interaction) return;
    const css = getComputedStyle(interaction.input);
    const properties = [
      '--theme-background',
      '--theme-ink',
      '--theme-ink-muted',
      '--theme-border-strong',
      '--radius-md',
    ];
    setPresentation({
      direction: interaction.direction,
      style: {
        fontFamily: css.fontFamily,
        ...Object.fromEntries(properties.map((name) => [name, css.getPropertyValue(name)])),
      },
    });
  }, [interaction?.input, interaction?.direction]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let animation: gsap.core.Timeline | undefined;
    const settle = () => {
      animation?.kill();
      gsap.set(element, { opacity: open ? 1 : 0 });
      if (!open) setPresentation(null);
    };
    if (motion.matches) settle();
    else {
      // Tween from the current pose so a quick re-press smoothly reverses the fade.
      animation = gsap
        .timeline({
          onComplete: () => {
            if (!open) setPresentation(null);
          },
        })
        .to(
          element,
          { opacity: open ? 1 : 0, duration: open ? 0.18 : 0.14, ease: 'power2.out' },
          0,
        );
    }
    const onMotion = () => {
      if (motion.matches) settle();
    };
    motion.addEventListener('change', onMotion);
    return () => {
      animation?.kill();
      motion.removeEventListener('change', onMotion);
    };
  }, [open, presentation]);
  if (!presentation) return null;
  return createPortal(
    <div
      ref={root}
      className="viewport-guides"
      data-state={open ? 'visible' : 'exiting'}
      style={presentation.style}
      aria-hidden="true"
    >
      {(['down', 'up'] as const).map((direction) => {
        const value = Math.max(0, Math.min(100, direction === 'down' ? down : up));
        return (
          <ViewportGuide
            key={direction}
            direction={direction}
            value={value}
            active={!separate || presentation.direction === direction}
          />
        );
      })}
    </div>,
    document.body,
  );
}
