/** Interaction timings measured from the 60 Hz native control reference. */
export type SoapBubbleSpring = { value: number; velocity: number };

type ContactBox = { x: number; y: number; width: number; height: number; radius: number };

/** Eligibility is measured before pressing, so distant buttons never reach. */
export function soapBubbleContactStrength(a: ContactBox, b: ContactBox) {
  const radius =
    Math.min(a.radius, a.width / 2, a.height / 2) + Math.min(b.radius, b.width / 2, b.height / 2);
  // Distance to the Minkowski sum includes diagonal gaps and pill ends.
  const x = Math.abs(a.x - b.x) - (a.width + b.width) / 2 + radius;
  const y = Math.abs(a.y - b.y) - (a.height + b.height) / 2 + radius;
  const gap = Math.max(
    0,
    Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - radius,
  );
  const diameter = Math.min(a.width, a.height, b.width, b.height);
  const t = Math.min(1, Math.max(0, (gap / diameter - 0.25) / 0.07));
  return 1 - t * t * (3 - 2 * t);
}

export function stepSoapBubblePress(spring: SoapBubbleSpring, pressed: boolean, dt: number) {
  const stiffness = pressed ? 1250 : 420;
  const damping = pressed ? 40 : 16;
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    spring.velocity +=
      ((Number(pressed) - spring.value) * stiffness - spring.velocity * damping) * h;
    spring.value += spring.velocity * h;
  }
  if (Math.abs(Number(pressed) - spring.value) + Math.abs(spring.velocity) < 0.001) {
    spring.value = Number(pressed);
    spring.velocity = 0;
  }
}

type Key = readonly [time: number, value: number];
// Piecewise cubic interpolation keeps the measured landmarks without a
// frame-rate-dependent Euler spring or a discontinuity in the velocity.
function curve(keys: readonly Key[], time: number) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (time > b[0]) continue;
    const previous = keys[Math.max(0, i - 2)];
    const next = keys[Math.min(keys.length - 1, i + 1)];
    const span = b[0] - a[0];
    const t = (time - a[0]) / span;
    const m0 = i === 1 ? 0 : (b[1] - previous[1]) / (b[0] - previous[0]);
    const m1 = i === keys.length - 1 ? 0 : (next[1] - a[1]) / (next[0] - a[0]);
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] +
      (t ** 3 - 2 * t ** 2 + t) * m0 * span +
      (-2 * t ** 3 + 3 * t ** 2) * b[1] +
      (t ** 3 - t ** 2) * m1 * span
    );
  }
  return keys[keys.length - 1][1];
}

const openingWidth: readonly Key[] = [
  [0, 0],
  [0.025, 0],
  [0.042, 0.252],
  [0.058, 0.403],
  [0.075, 0.54],
  [0.092, 0.657],
  [0.125, 0.825],
  [0.158, 0.925],
  [0.192, 0.975],
  [0.225, 1],
  [0.275, 1.029],
  [0.35, 1.012],
  [0.5, 1],
];
const openingHeight: readonly Key[] = [
  [0, 0],
  [0.025, -0.1],
  [0.042, 0.64],
  [0.058, 0.83],
  [0.108, 1.04],
  [0.142, 1.04],
  [0.225, 0.98],
  [0.3, 0.97],
  [0.5, 1],
];
const openingX: readonly Key[] = [
  [0, 0],
  [0.025, 0.22],
  [0.042, 0.265],
  [0.058, 0.205],
  [0.108, 0.06],
  [0.192, -0.015],
  [0.275, -0.114],
  [0.5, -0.106],
];
const openingY: readonly Key[] = [
  [0, 0],
  [0.025, 0.15],
  [0.058, 0.212],
  [0.125, 0.31],
  [0.192, 0.167],
  [0.275, 0.038],
  [0.35, -0.015],
  [0.5, 0],
];
const closingWidth: readonly Key[] = [
  [0, 1],
  [0.025, 0.97],
  [0.075, 0.75],
  [0.125, 0.47],
  [0.175, 0.25],
  [0.225, 0.1],
  [0.275, 0.01],
  [0.34, 0],
];
const closingHeight: readonly Key[] = [
  [0, 1],
  [0.05, 0.93],
  [0.125, 0.68],
  [0.2, 0.22],
  [0.275, -0.08],
  [0.34, 0],
];

export function soapBubbleMenuFrame(time: number, opening: boolean, jiggle = 1) {
  const duration = opening ? 0.5 : 0.34;
  const t = Math.min(duration, Math.max(0, time));
  const growth = curve(opening ? openingWidth : closingWidth, t);
  const height = curve(opening ? openingHeight : closingHeight, t);
  // At zero Jiggle the morph still runs, with neither overshoot nor bobbing.
  const bounce = Math.min(1.6, Math.max(0, jiggle));
  const focus = opening ? Math.min(1, Math.max(0, (t - 0.065) / 0.175)) : Math.max(0, 1 - t / 0.13);
  return {
    growth: growth > 1 ? 1 + (growth - 1) * bounce : Math.max(0, growth),
    height: height > 1 ? 1 + (height - 1) * bounce : height < 0 ? height * bounce : height,
    x: opening ? -0.106 * growth + (curve(openingX, t) + 0.106 * growth) * bounce : -0.106 * growth,
    y: opening ? curve(openingY, t) * bounce : Math.sin((Math.PI * t) / duration) * 0.3 * bounce,
    focus,
    echo: opening ? Math.max(0, 1 - t / 0.045) : Math.min(1, Math.max(0, (t - 0.22) / 0.1)),
    done: t === duration,
  };
}
