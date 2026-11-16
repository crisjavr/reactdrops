/** The section of a video of `duration` seconds that plays, clamped to the file. */
export function videoSection(duration: number, start = 0, end?: number) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const from = Number.isFinite(start) && start > 0 && start < length ? start : 0;
  const to =
    end !== undefined && Number.isFinite(end) && end > from ? Math.min(end, length) : length;
  return { from, to };
}

/**
 * Where a background video is at animation time `seconds`: its section starts
 * at time 0 and loops back to its start after its end.
 */
export function liquidGlassLogoVideoTime(
  seconds: number,
  duration: number,
  start?: number,
  end?: number,
) {
  const { from, to } = videoSection(duration, start, end);
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Number.isFinite(to) ? from + (time % (to - from)) : from + time;
}
