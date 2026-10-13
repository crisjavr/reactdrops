export function agentBezierEase(t: number, points: readonly [number, number, number, number]) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cubic = (s: number, a: number, b: number) =>
    3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let low = 0,
    high = 1;
  // Invert time, rather than treating a Bezier parameter as elapsed time.
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (cubic(mid, points[0], points[2]) < t) low = mid;
    else high = mid;
  }
  return cubic((low + high) / 2, points[1], points[3]);
}

export function agentCustomLensPhase(t: number, points: readonly [number, number, number, number]) {
  return 0.5 * (1 + agentBezierEase(t, points) - agentBezierEase(1 - t, points));
}

export function createAgentCustomLensCurve(points: readonly [number, number, number, number]) {
  const count = 256;
  const travel = new Float64Array(count + 1);
  // Build only when a handle changes. The full Bezier controls timing without
  // an independent strength or area modifier. Carry 40% of the average lap
  // speed through flat tails, retaining the easing, duration and loop seam.
  for (let i = 1; i <= count; i++) {
    const time = i / count;
    travel[i] = 0.4 * time + 0.6 * agentCustomLensPhase(time, points);
  }
  return (time: number) => {
    const coordinate = Math.max(0, Math.min(1, time)) * count;
    const index = Math.min(count - 1, Math.floor(coordinate));
    return travel[index] + (travel[index + 1] - travel[index]) * (coordinate - index);
  };
}
