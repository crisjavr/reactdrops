import { useLayoutEffect, useRef } from 'react';

type Spring = { position: number; velocity: number };
function advance(spring: Spring, target: number, stiffness: number, damping: number, dt: number) {
  spring.velocity += ((target - spring.position) * stiffness - spring.velocity * damping) * dt;
  spring.position += spring.velocity * dt;
}

/** A small, interruptible spring. Updates one transform, only while moving. */
export function useSwitchMotion(checked: boolean) {
  const thumb = useRef<HTMLSpanElement>(null);
  const controller = useRef<{
    target: (value: boolean) => void;
    hover: (value: boolean) => void;
  } | null>(null);
  const initial = useRef(checked);

  useLayoutEffect(() => {
    const element = thumb.current;
    if (!element) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let destination = Number(initial.current);
    let hovered = false;
    let frame = 0;
    let previous = 0;
    const travel: Spring = { position: destination, velocity: 0 };
    const momentum: Spring = { position: 0, velocity: 0 };
    const hover: Spring = { position: 1, velocity: 0 };
    const paint = () => {
      // Normalized travel keeps the deformation consistent at our compact size.
      const elongation = 1 + Math.min(0.4, Math.abs(momentum.position) / 13) * 0.36;
      element.style.transform = `translateX(calc(var(--switch-travel) * ${travel.position})) scale(${elongation * hover.position}, ${hover.position / elongation})`;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      element.style.willChange = '';
    };
    const settle = () => {
      stop();
      travel.position = destination;
      travel.velocity = 0;
      momentum.position = momentum.velocity = 0;
      hover.position = preference.matches ? 1 : hovered ? 1.035 : 1;
      hover.velocity = 0;
      paint();
    };
    const tick = (now: number) => {
      const elapsed = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
      previous = now;
      // Small bounded steps keep the spring stable across display refresh rates.
      const steps = Math.ceil(elapsed * 240);
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        advance(travel, destination, 190, 24, dt);
        advance(momentum, travel.velocity, 530, 67, dt);
        advance(hover, hovered ? 1.035 : 1, 865, 57, dt);
      }
      if (
        Math.abs(destination - travel.position) < 0.0005 &&
        Math.abs(travel.velocity) < 0.005 &&
        Math.abs(momentum.position) < 0.005 &&
        Math.abs(momentum.velocity) < 0.01 &&
        Math.abs(hover.position - (hovered ? 1.035 : 1)) < 0.0005 &&
        Math.abs(hover.velocity) < 0.005
      ) {
        settle();
        return;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (preference.matches) {
        settle();
        return;
      }
      if (!frame) {
        element.style.willChange = 'transform';
        frame = requestAnimationFrame(tick);
      }
    };
    controller.current = {
      target(value) {
        if (destination !== Number(value)) {
          destination = Number(value);
          wake();
        }
      },
      hover(value) {
        if (hovered !== value) {
          hovered = value;
          wake();
        }
      },
    };
    const onPreferenceChange = () => {
      if (preference.matches) settle();
    };
    preference.addEventListener('change', onPreferenceChange);
    paint();
    return () => {
      stop();
      preference.removeEventListener('change', onPreferenceChange);
      controller.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    controller.current?.target(checked);
  }, [checked]);
  return { thumb, setHovered: (value: boolean) => controller.current?.hover(value) };
}
