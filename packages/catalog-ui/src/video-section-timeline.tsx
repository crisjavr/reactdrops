import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { requestComponentPreview } from './component-preview-miniature';
import './video-section-timeline.css';

// An editing-style timeline for a background video and the animation over it.
// The video track shows frames of the whole file with the chosen section; the
// tracks below line up with the section: the logo animation, which can move and
// stretch, and the exported clip, which grows to hold them both. A playhead
// marks the moment the preview shows, in export seconds; it plays once to the
// end of the export, pauses with Space and can be dragged to any frame.

export type VideoSection = { start: number; end: number };
/** The logo animation: when it starts after the section start, and how long it runs. */
export type LogoClip = { start: number; length: number };
type Edge = 'start' | 'end' | 'move';
export type TimelineTarget = 'section' | 'logo' | 'export';

type VideoSectionTimelineProps = {
  src: string;
  /** Length of the video, in seconds. */
  duration: number;
  section: VideoSection;
  /** Shortest and longest section, in seconds. */
  minLength: number;
  maxLength: number;
  logo: LogoClip;
  /** Shortest and longest logo animation, and the latest it may end, in seconds. */
  logoMinLength: number;
  logoMaxLength: number;
  logoLatestEnd: number;
  /** Length of the exported clip, which starts with the section. */
  clipLength: number;
  /** Longest the export may run; its end edge reaches from the logo's end to here. */
  clipMaxLength?: number;
  /** The export's end edge moved: the hold after the logo changes. */
  onClipChange?: (length: number) => void;
  /** The playhead, in seconds of the export. */
  time: () => number;
  playing: boolean;
  /** Whether the clip can play; a still export only moves the playhead. */
  canPlay?: boolean;
  onTogglePlay?: () => void;
  /** The playhead moved to `seconds` of the export. */
  onSeek?: (seconds: number) => void;
  onChange: (section: VideoSection) => void;
  onLogoChange: (logo: LogoClip) => void;
  /** While a clip or one of its edges moves, before the change is committed. */
  onScrub?: (target: TimelineTarget, edge: Edge) => void;
  /** After a drag or a key press ends. */
  onCommit?: (target: TimelineTarget) => void;
};

const round = (seconds: number) => Math.round(seconds * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const timelineKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'];
const zoomLevels = [1, 1.5, 2, 3, 4, 6, 8];
// The playhead steps one frame of a 30 fps export at a time.
const frameStep = 1 / 30;

/** Seconds to one decimal, or two when the hundredths count (1.75, 0.65). */
export function formatSeconds(seconds: number) {
  const hundredths = Math.round(seconds * 100);
  return (hundredths / 100).toFixed(hundredths % 10 ? 2 : 1);
}

export function formatVideoTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

// Labeled ticks at a readable step, about six per visible width. A label right
// at the end would run past it, so the last stretch has none.
function ticks(span: number, zoom: number) {
  const visible = span / zoom;
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(
    (value) => visible / value <= 6,
  );
  const size = step ?? Math.ceil(visible / 6);
  const list: number[] = [];
  for (let index = 0; index * size <= span - visible * 0.08; index++)
    list.push(round(index * size));
  return list;
}

// Space plays and pauses unless it belongs to the focused control.
function ownsSpace(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, button, a[href], summary')) return true;
  return [
    'button',
    'checkbox',
    'switch',
    'combobox',
    'option',
    'menuitem',
    'tab',
    'radio',
  ].includes(target.getAttribute('role') ?? '');
}

/** Moves one edge or the whole section by `delta` seconds, within the video and length limits. */
export function moveVideoSection(
  edge: Edge,
  from: VideoSection,
  delta: number,
  { duration, minLength, maxLength }: { duration: number; minLength: number; maxLength: number },
): VideoSection {
  const shortest = Math.min(minLength, duration);
  const longest = Math.min(maxLength, duration);
  if (edge === 'move') {
    const length = from.end - from.start;
    const start = round(clamp(from.start + delta, 0, duration - length));
    return { start, end: round(start + length) };
  }
  if (edge === 'start') {
    const start = clamp(from.start + delta, Math.max(0, from.end - longest), from.end - shortest);
    return { start: round(start), end: from.end };
  }
  const end = clamp(
    from.end + delta,
    from.start + shortest,
    Math.min(duration, from.start + longest),
  );
  return { start: from.start, end: round(end) };
}

/**
 * Moves the logo animation, or stretches it from one edge, by `delta` seconds.
 * It starts no earlier than the section and ends no later than `latestEnd`.
 */
export function moveLogoClip(
  edge: Edge,
  from: LogoClip,
  delta: number,
  { minLength, maxLength, latestEnd }: { minLength: number; maxLength: number; latestEnd: number },
): LogoClip {
  if (edge === 'move') {
    return {
      start: round(clamp(from.start + delta, 0, latestEnd - from.length)),
      length: from.length,
    };
  }
  if (edge === 'start') {
    const end = from.start + from.length;
    const start = round(clamp(from.start + delta, Math.max(0, end - maxLength), end - minLength));
    return { start, length: round(end - start) };
  }
  const length = clamp(from.length + delta, minLength, Math.min(maxLength, latestEnd - from.start));
  return { start: from.start, length: round(length) };
}

export function VideoSectionTimeline({
  src,
  duration,
  section,
  minLength,
  maxLength,
  logo,
  logoMinLength,
  logoMaxLength,
  logoLatestEnd,
  clipLength,
  clipMaxLength = clipLength,
  onClipChange,
  time,
  playing,
  canPlay = true,
  onTogglePlay,
  onSeek,
  onChange,
  onLogoChange,
  onScrub,
  onCommit,
}: VideoSectionTimelineProps) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const drag = useRef<{
    target: TimelineTarget;
    edge: Edge;
    x: number;
    section: VideoSection;
    logo: LogoClip;
    clip: number;
  } | null>(null);
  const seeking = useRef(false);
  const latest = useRef({ section, logo, clip: clipLength });
  latest.current = { section, logo, clip: clipLength };
  const [dragging, setDragging] = useState<TimelineTarget | null>(null);
  const [zoom, setZoom] = useState(1);
  const sectionLimits = { duration, minLength, maxLength };
  const logoLimits = {
    minLength: logoMinLength,
    maxLength: logoMaxLength,
    latestEnd: logoLatestEnd,
  };
  // The whole video is the section when it is shorter than the shortest one.
  const fixed = duration <= minLength + 0.005;
  // The timeline reaches past the video when the clip loops it.
  const span = Math.max(duration, section.start + clipLength);
  const at = (seconds: number) => `${(clamp(seconds, 0, span) / span) * 100}%`;
  const width = (seconds: number) => `${(Math.max(0, seconds) / span) * 100}%`;
  const length = section.end - section.start;
  const clipEnd = section.start + clipLength;
  const logoStart = section.start + logo.start;
  const logoEnd = logo.start + logo.length;
  const holdLength = Math.max(0, clipLength - logoEnd);
  const view = useRef({ at, span, sectionStart: section.start, clipLength, playing, time });
  view.current = { at, span, sectionStart: section.start, clipLength, playing, time };

  // Frames of the whole video, drawn as tiles across its track.
  useEffect(() => {
    const canvas = strip.current;
    if (!canvas) return;
    let cancelled = false;
    let timer = 0;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const once = (event: 'loadeddata' | 'seeked') =>
      new Promise<void>((resolve, reject) => {
        const done = () => {
          video.removeEventListener(event, done);
          video.removeEventListener('error', failed);
          resolve();
        };
        const failed = () => {
          video.removeEventListener(event, done);
          video.removeEventListener('error', failed);
          reject(new Error('The video frames could not be read.'));
        };
        video.addEventListener(event, done);
        video.addEventListener('error', failed);
      });
    const loaded = once('loadeddata');
    video.src = src;
    let run = 0;
    const draw = async () => {
      const id = ++run;
      await loaded;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (!cssWidth || !cssHeight || cancelled || id !== run) return;
      canvas.width = Math.min(16384, Math.round(cssWidth * pixelRatio));
      canvas.height = Math.round(cssHeight * pixelRatio);
      const context = canvas.getContext('2d');
      if (!context) return;
      const aspect = video.videoWidth / video.videoHeight || 16 / 9;
      // Zoomed in, tiles widen rather than multiply, to keep the seeks few.
      const count = clamp(Math.round(cssWidth / Math.max(28, cssHeight * aspect)), 1, 64);
      const tile = canvas.width / count;
      for (let index = 0; index < count; index++) {
        const seeked = once('seeked');
        video.currentTime = Math.min(duration - 0.01, ((index + 0.5) / count) * duration);
        await seeked;
        if (cancelled || id !== run) return;
        // Cover-crop the frame into its tile.
        const scale = Math.max(tile / video.videoWidth, canvas.height / video.videoHeight);
        const sourceWidth = tile / scale;
        const sourceHeight = canvas.height / scale;
        context.drawImage(
          video,
          (video.videoWidth - sourceWidth) / 2,
          (video.videoHeight - sourceHeight) / 2,
          sourceWidth,
          sourceHeight,
          Math.round(index * tile),
          0,
          Math.ceil(tile),
          canvas.height,
        );
      }
    };
    void draw().catch(() => {});
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void draw().catch(() => {}), 150);
    });
    observer.observe(canvas);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, duration]);

  // The playhead and the time readout follow the preview without re-rendering;
  // while playing zoomed in, the view scrolls along with the playhead.
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const { at, span, sectionStart, clipLength, playing, time } = view.current;
      const seconds = clamp(time(), 0, clipLength);
      const head = playhead.current;
      if (head) {
        head.style.left = at(sectionStart + seconds);
        if (head.getAttribute('aria-valuenow') !== String(round(seconds))) {
          head.setAttribute('aria-valuenow', String(round(seconds)));
          head.setAttribute('aria-valuetext', formatVideoTime(seconds));
          head.setAttribute('aria-valuemax', String(round(clipLength)));
        }
      }
      if (clock.current) {
        clock.current.textContent = `${formatVideoTime(seconds)} / ${formatVideoTime(clipLength)}`;
      }
      const box = scroller.current;
      const lane = track.current;
      if (playing && box && lane && box.scrollWidth > box.clientWidth) {
        const x = lane.offsetLeft + ((sectionStart + seconds) / span) * lane.clientWidth;
        if (x < box.scrollLeft + 24 || x > box.scrollLeft + box.clientWidth - 24) {
          box.scrollLeft = x - box.clientWidth * 0.2;
        }
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Space plays and pauses anywhere on the page, unless a control uses it.
  const toggle = useRef(onTogglePlay);
  toggle.current = canPlay ? onTogglePlay : undefined;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.metaKey || event.ctrlKey)
        return;
      if (!toggle.current || ownsSpace(event.target)) return;
      event.preventDefault();
      toggle.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new zoom keeps the playhead in view, near the middle.
  useEffect(() => {
    const box = scroller.current;
    const lane = track.current;
    if (!box || !lane) return;
    const { span, sectionStart, time } = view.current;
    const x = lane.offsetLeft + ((sectionStart + time()) / span) * lane.clientWidth;
    box.scrollLeft = x - box.clientWidth / 2;
  }, [zoom]);

  const locked = (target: TimelineTarget) => target === 'section' && fixed;
  const apply = (target: TimelineTarget, edge: Edge, delta: number, from = latest.current) => {
    if (target === 'section') {
      const next = moveVideoSection(edge, from.section, delta, sectionLimits);
      if (next.start === latest.current.section.start && next.end === latest.current.section.end)
        return;
      latest.current = { ...latest.current, section: next };
      onChange(next);
    } else if (target === 'logo') {
      const next = moveLogoClip(edge, from.logo, delta, logoLimits);
      if (next.start === latest.current.logo.start && next.length === latest.current.logo.length)
        return;
      latest.current = { ...latest.current, logo: next };
      onLogoChange(next);
    } else {
      // The export ends no earlier than the logo, which it must show whole.
      const next = round(clamp(from.clip + delta, logoEnd, Math.max(logoEnd, clipMaxLength)));
      if (Math.abs(next - latest.current.clip) < 0.005) return;
      latest.current = { ...latest.current, clip: next };
      onClipChange?.(next);
    }
    requestComponentPreview(root.current);
    onScrub?.(target, edge);
  };
  const begin = (target: TimelineTarget, edge: Edge) => (event: PointerEvent<HTMLElement>) => {
    if (locked(target) || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    capture(event);
    (event.currentTarget as HTMLElement).focus();
    drag.current = { target, edge, x: event.clientX, ...latest.current };
    setDragging(target);
    onScrub?.(target, edge);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    const box = track.current?.getBoundingClientRect();
    if (!active || !box?.width) return;
    const delta = ((event.clientX - active.x) / box.width) * span;
    apply(active.target, active.edge, delta, active);
  };
  const end = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    setDragging(null);
    onCommit?.(active.target);
  };
  const dragHandlers = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
  // The ruler, the Export track and the playhead itself move the playhead.
  const seekTo = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box?.width) return;
    const seconds = ((clientX - box.left) / box.width) * span - section.start;
    onSeek?.(clamp(seconds, 0, clipLength));
  };
  const seekHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      capture(event);
      seeking.current = true;
      seekTo(event.clientX);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (seeking.current) seekTo(event.clientX);
    },
    onPointerUp: () => (seeking.current = false),
    onPointerCancel: () => (seeking.current = false),
    onLostPointerCapture: () => (seeking.current = false),
  };
  // A click beside the section centers it there.
  const jump = (event: PointerEvent<HTMLDivElement>) => {
    const box = track.current?.getBoundingClientRect();
    if (fixed || !box?.width || event.button !== 0 || event.target !== event.currentTarget) return;
    const seconds = ((event.clientX - box.left) / box.width) * span;
    const from = latest.current.section;
    apply('section', 'move', seconds - (from.start + from.end) / 2);
    onCommit?.('section');
  };
  const keys = (target: TimelineTarget, edge: Edge) => (event: KeyboardEvent<HTMLElement>) => {
    if (locked(target)) return;
    const step = event.shiftKey || event.key.startsWith('Page') ? 1 : 0.1;
    const delta =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown'
        ? -step
        : event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp'
          ? step
          : event.key === 'Home'
            ? -span - 60
            : event.key === 'End'
              ? span + 60
              : 0;
    if (!delta) return;
    // The edges sit inside their clip, which would move it too.
    event.preventDefault();
    event.stopPropagation();
    apply(target, edge, delta);
  };
  const commitKey = (target: TimelineTarget) => (event: KeyboardEvent<HTMLElement>) => {
    if (locked(target) || ![...timelineKeys, 'Home', 'End'].includes(event.key)) return;
    event.stopPropagation();
    onCommit?.(target);
  };
  const playheadKeys = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey || event.key.startsWith('Page') ? 1 : frameStep;
    const now = time();
    const next =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown'
        ? now - step
        : event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp'
          ? now + step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? clipLength
              : null;
    if (next === null) return;
    event.preventDefault();
    onSeek?.(clamp(next, 0, clipLength));
  };
  const slider = (
    target: TimelineTarget,
    edge: Edge,
    label: string,
    now: number,
    min: number,
    max: number,
    text: string,
  ) => ({
    role: 'slider',
    tabIndex: locked(target) ? -1 : 0,
    'aria-disabled': locked(target) || undefined,
    'aria-label': label,
    'aria-valuemin': round(min),
    'aria-valuemax': round(max),
    'aria-valuenow': round(now),
    'aria-valuetext': text,
    onPointerDown: begin(target, edge),
    onKeyDown: keys(target, edge),
    onKeyUp: commitKey(target),
  });
  const shortest = Math.min(minLength, duration);
  const longest = Math.min(maxLength, duration);
  const zoomIndex = zoomLevels.indexOf(zoom);
  const now = clamp(time(), 0, clipLength);

  return (
    <div
      ref={root}
      className={`video-section-timeline${fixed ? ' is-fixed' : ''}${dragging ? ` is-dragging-${dragging}` : ''}`}
    >
      <div className="video-section-timeline-toolbar">
        <button
          type="button"
          className="video-section-timeline-tool is-play"
          aria-label={playing ? 'Pause' : 'Play'}
          aria-keyshortcuts="Space"
          title={canPlay ? `${playing ? 'Pause' : 'Play'} (Space)` : 'A still export plays no clip'}
          disabled={!canPlay}
          onClick={onTogglePlay}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {playing ? (
              <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" />
            ) : (
              <path d="M5 2.8v10.4L13 8z" />
            )}
          </svg>
        </button>
        <span ref={clock} className="video-section-timeline-clock">
          {formatVideoTime(now)} / {formatVideoTime(clipLength)}
        </span>
        <span className="video-section-timeline-zoom">
          <button
            type="button"
            className="video-section-timeline-tool"
            aria-label="Zoom out"
            disabled={zoomIndex <= 0}
            onClick={() => setZoom(zoomLevels[Math.max(0, zoomIndex - 1)])}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8h9" />
            </svg>
          </button>
          <span className="video-section-timeline-zoom-level" aria-live="polite">
            {zoom}×
          </span>
          <button
            type="button"
            className="video-section-timeline-tool"
            aria-label="Zoom in"
            disabled={zoomIndex >= zoomLevels.length - 1}
            onClick={() => setZoom(zoomLevels[Math.min(zoomLevels.length - 1, zoomIndex + 1)])}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8h9M8 3.5v9" />
            </svg>
          </button>
        </span>
      </div>
      <div className="video-section-timeline-grid">
        <div className="video-section-timeline-labels" aria-hidden="true">
          <span />
          <span className="video-section-timeline-label">Video</span>
          <span className="video-section-timeline-label">Logo</span>
          <span className="video-section-timeline-label">Export</span>
        </div>
        <div ref={scroller} className="video-section-timeline-scroller">
          <div className="video-section-timeline-lanes" style={{ width: `${zoom * 100}%` }}>
            <div className="video-section-timeline-ruler" aria-hidden="true" {...seekHandlers}>
              {ticks(span, zoom).map((seconds) => (
                <span key={seconds} style={{ left: at(seconds) }}>
                  {formatVideoTime(seconds).replace(/\.0$/, '')}
                </span>
              ))}
            </div>
            <div
              ref={track}
              className="video-section-timeline-track is-video"
              style={{ gridRow: 2 }}
              onPointerDown={jump}
            >
              <canvas
                ref={strip}
                className="video-section-timeline-strip"
                aria-hidden="true"
                style={{ width: width(duration) }}
              />
              {clipEnd > duration + 0.005 && (
                <div
                  className="video-section-timeline-loop"
                  aria-hidden="true"
                  style={{ left: at(duration), width: width(clipEnd - duration) }}
                >
                  Loop
                </div>
              )}
              <div
                className="video-section-timeline-shade"
                style={{ left: 0, width: width(section.start) }}
              />
              <div
                className="video-section-timeline-shade"
                style={{ left: at(section.end), width: width(duration - section.end) }}
              />
              <div
                className="video-section-timeline-section"
                {...slider(
                  'section',
                  'move',
                  'Video section',
                  section.start,
                  0,
                  duration - length,
                  `${formatVideoTime(section.start)} to ${formatVideoTime(section.end)}`,
                )}
                style={{ left: at(section.start), width: width(length) }}
                {...dragHandlers}
              >
                <span
                  className="video-section-timeline-handle is-start"
                  {...slider(
                    'section',
                    'start',
                    'Section start',
                    section.start,
                    Math.max(0, section.end - longest),
                    section.end - shortest,
                    formatVideoTime(section.start),
                  )}
                />
                <span
                  className="video-section-timeline-handle is-end"
                  {...slider(
                    'section',
                    'end',
                    'Section end',
                    section.end,
                    section.start + shortest,
                    Math.min(duration, section.start + longest),
                    formatVideoTime(section.end),
                  )}
                />
              </div>
            </div>
            <div className="video-section-timeline-track is-logo" style={{ gridRow: 3 }}>
              <div
                className={`video-section-timeline-clip is-animation${holdLength > 0 ? ' has-hold' : ''}`}
                {...slider(
                  'logo',
                  'move',
                  'Logo animation',
                  logo.start,
                  0,
                  logoLatestEnd - logo.length,
                  `Starts at ${formatSeconds(logo.start)} s, lasts ${formatSeconds(logo.length)} s`,
                )}
                style={{ left: at(logoStart), width: width(logo.length) }}
                title={`Logo animation · starts at ${formatSeconds(logo.start)} s · ${formatSeconds(logo.length)} s`}
                {...dragHandlers}
              >
                <span className="video-section-timeline-clip-label">
                  Logo {formatSeconds(logo.length)} s
                </span>
                <span
                  className="video-section-timeline-handle is-start"
                  {...slider(
                    'logo',
                    'start',
                    'Logo start',
                    logo.start,
                    Math.max(0, logoEnd - logoMaxLength),
                    logoEnd - logoMinLength,
                    `${formatSeconds(logo.start)} s`,
                  )}
                />
                <span
                  className="video-section-timeline-handle is-end"
                  {...slider(
                    'logo',
                    'end',
                    'Logo end',
                    logoEnd,
                    logo.start + logoMinLength,
                    Math.min(logo.start + logoMaxLength, logoLatestEnd),
                    `${formatSeconds(logoEnd)} s`,
                  )}
                />
              </div>
              {(holdLength > 0 || onClipChange) && (
                // The hold follows the logo; dragging it or its end edge sets how
                // long the finished logo stays, down to nothing.
                <div
                  className={`video-section-timeline-clip is-hold${onClipChange ? ' is-adjustable' : ''}${holdLength > 0 ? '' : ' is-empty'}`}
                  style={{ left: at(section.start + logoEnd), width: width(holdLength) }}
                  title={`Logo holds · ${formatSeconds(holdLength)} s`}
                  onPointerDown={onClipChange ? begin('export', 'end') : undefined}
                  {...dragHandlers}
                >
                  <span className="video-section-timeline-clip-label" aria-hidden="true">
                    Hold {formatSeconds(holdLength)} s
                  </span>
                  {onClipChange && (
                    <span
                      className="video-section-timeline-handle is-end"
                      {...slider(
                        'export',
                        'end',
                        'Hold',
                        holdLength,
                        0,
                        Math.max(0, clipMaxLength - logoEnd),
                        `${formatSeconds(holdLength)} s`,
                      )}
                    />
                  )}
                </div>
              )}
            </div>
            <div
              className="video-section-timeline-track is-export"
              style={{ gridRow: 4 }}
              {...seekHandlers}
            >
              <div
                className="video-section-timeline-clip is-export"
                style={{ left: at(section.start), width: width(clipLength) }}
                title={`Exported clip · ${formatSeconds(clipLength)} s · hold ${formatSeconds(holdLength)} s`}
                {...dragHandlers}
              >
                <span className="video-section-timeline-clip-label">
                  {formatSeconds(clipLength)} s
                </span>
                {onClipChange && (
                  <span
                    className="video-section-timeline-handle is-end"
                    {...slider(
                      'export',
                      'end',
                      'Export end',
                      clipLength,
                      logoEnd,
                      Math.max(logoEnd, clipMaxLength),
                      `${formatSeconds(clipLength)} s, hold ${formatSeconds(holdLength)} s`,
                    )}
                  />
                )}
              </div>
            </div>
            <div className="video-section-timeline-overlay">
              <div
                ref={playhead}
                className="video-section-timeline-playhead"
                role="slider"
                tabIndex={0}
                aria-label="Playhead"
                aria-valuemin={0}
                aria-valuemax={round(clipLength)}
                aria-valuenow={round(now)}
                aria-valuetext={formatVideoTime(now)}
                style={{ left: at(section.start + now) }}
                onKeyDown={playheadKeys}
              />
            </div>
          </div>
        </div>
      </div>
      <p className="video-section-timeline-summary" aria-live="polite">
        {fixed
          ? `The whole ${formatSeconds(duration)} s video loops through the ${formatSeconds(clipLength)} s export.`
          : `Uses ${formatVideoTime(section.start)}–${formatVideoTime(section.end)} of ${formatVideoTime(duration)} · exports ${formatSeconds(clipLength)} s`}
        {` · logo at ${formatSeconds(logo.start)} s for ${formatSeconds(logo.length)} s`}
      </p>
    </div>
  );
}

function capture(event: PointerEvent<HTMLElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // A pointer that is no longer active cannot be captured; the drag still works.
  }
}
