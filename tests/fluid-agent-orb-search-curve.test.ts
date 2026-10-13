import { expect, it } from 'vitest';
import {
  agentBezierEase,
  createAgentCustomLensCurve,
} from '../packages/components/src/fluid-agent-orb/fluid-agent-orb-search-curve';

it('matches the browser cubic-bezier timing function, including crossed handles', () => {
  const element = document.createElement('div');
  document.body.append(element);
  try {
    for (const points of [
      [0.165, 0.84, 0.44, 1],
      [0.167, 0.723, 0.448, 0.924],
      [0.25, 0.1, 0.25, 1],
      [1, 0, 0, 1],
    ] as const) {
      const animation = element.animate(
        [{ transform: 'translateX(0px)' }, { transform: 'translateX(100px)' }],
        { duration: 1000, easing: `cubic-bezier(${points.join(',')})`, fill: 'both' },
      );
      animation.pause();
      for (const time of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        animation.currentTime = time * 1000;
        const browser = new DOMMatrix(getComputedStyle(element).transform).m41 / 100;
        expect(Math.abs(agentBezierEase(time, points) - browser)).toBeLessThan(0.001);
      }
      animation.cancel();
    }
  } finally {
    element.remove();
  }
});

it('keeps custom circular travel moving forward through extreme handles', () => {
  for (const points of [
    [0.165, 0.84, 0.44, 1],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 1, 1, 1],
  ] as const) {
    const curve = createAgentCustomLensCurve(points);
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBe(1);
    for (let step = 0; step < 240; step++)
      expect(curve((step + 1) / 240) - curve(step / 240)).toBeGreaterThan(0.4 / 240 - 1e-10);
    expect(Math.abs(curve(0.001) - (1 - curve(0.999)))).toBeLessThan(0.0001);
  }
});
