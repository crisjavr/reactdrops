'use client';

import { gsap } from 'gsap';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type CursorLabelAnimation = 'roll' | 'masked-lift' | 'fade' | 'none';

type Layer = { key: number; text: string; entering: boolean };

const ease = 'power4.out';

function Characters({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((character, index) => (
        <span key={index} className="showcase-pointer-cursor-char" data-char>
          {character === ' ' ? ' ' : character}
        </span>
      ))}
    </>
  );
}

/**
 * Pill label that animates whenever its text changes. The outgoing text stays
 * mounted on top of the incoming one until its exit finishes, so names and
 * messages swap like the faces of a turning wheel instead of cutting over.
 */
export function CursorLabel({
  text,
  animation,
  reducedMotion,
  style,
}: {
  text: string;
  animation: CursorLabelAnimation;
  reducedMotion: boolean;
  style?: CSSProperties;
}) {
  const pill = useRef<HTMLSpanElement>(null);
  const width = useRef(0);
  const sequence = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, text, entering: true }]);
  const current = layers[layers.length - 1];
  const animated = animation !== 'none' && !reducedMotion;

  if (current.text !== text) {
    const key = ++sequence.current;
    setLayers(
      animated
        ? [
            { ...current, entering: false },
            { key, text, entering: true },
          ]
        : [{ key, text, entering: false }],
    );
  }

  useLayoutEffect(() => {
    const element = pill.current;
    if (!element) return;
    const incoming = element.querySelector<HTMLElement>('[data-layer="in"]');
    const outgoing = element.querySelector<HTMLElement>('[data-layer="out"]');
    const previousWidth = width.current;
    gsap.set(element, { clearProps: 'width' });
    const nextWidth = element.getBoundingClientRect().width;
    width.current = nextWidth;
    const context = gsap.context(() => {
      if (!animated) return;
      if (previousWidth && Math.abs(previousWidth - nextWidth) > 0.5)
        gsap.fromTo(
          element,
          { width: previousWidth },
          { width: nextWidth, duration: 0.7, ease, clearProps: 'width' },
        );
      const done = () => setLayers((old) => old.filter((layer) => layer.entering));
      if (animation === 'roll') {
        const charsIn = incoming?.querySelectorAll('[data-char]') ?? [];
        gsap.fromTo(
          charsIn,
          { rotationX: -100, yPercent: 70, opacity: 0 },
          { rotationX: 0, yPercent: 0, opacity: 1, duration: 0.9, ease, stagger: 0.028 },
        );
        if (outgoing)
          gsap.to(outgoing.querySelectorAll('[data-char]'), {
            rotationX: 100,
            yPercent: -70,
            opacity: 0,
            duration: 0.6,
            ease,
            stagger: 0.02,
            onComplete: done,
          });
      } else if (animation === 'fade') {
        if (incoming)
          gsap.fromTo(
            incoming,
            { opacity: 0, scale: 0.82, filter: 'blur(4px)' },
            { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.6, ease },
          );
        if (outgoing)
          gsap.to(outgoing, {
            opacity: 0,
            scale: 1.08,
            filter: 'blur(4px)',
            duration: 0.35,
            ease,
            onComplete: done,
          });
      } else if (animation === 'masked-lift') {
        const line = incoming?.querySelector('[data-lift-line]');
        if (line) gsap.fromTo(line, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease });
        if (outgoing) gsap.to(outgoing, { yPercent: -110, duration: 0.6, ease, onComplete: done });
      }
    }, element);
    return () => context.revert();
    // Layers change only when the text changes; `current.key` captures that.
  }, [current.key, animation, animated]);

  return (
    <span ref={pill} className="showcase-pointer-cursor-label" style={style}>
      {layers.map((layer) => {
        const role = layer.entering || layers.length === 1 ? 'in' : 'out';
        return (
          <span
            key={layer.key}
            className="showcase-pointer-cursor-label-text"
            data-layer={role}
            aria-hidden={role === 'out' || undefined}
          >
            {animated && animation === 'masked-lift' && role === 'in' ? (
              <span className="showcase-pointer-cursor-label-mask">
                <span data-lift-line>{layer.text}</span>
              </span>
            ) : animated && animation === 'roll' ? (
              <Characters text={layer.text} />
            ) : (
              layer.text
            )}
          </span>
        );
      })}
    </span>
  );
}
