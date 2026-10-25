import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import {
  createRefractedRenderer,
  type RefractedLiftEase,
  type RefractedRenderer,
} from './refracted-renderer';
import './refracted-text.css';

export type RefractedTextProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Typography edits are applied after 350ms of inactivity; the initial text renders immediately. */
  text: string;
  /** Follow the inherited color scheme, or use a palette for a specific surface. */
  theme?: 'auto' | 'light' | 'dark';
  /** CSS color for the upper glass. "auto" keeps the theme's original palette. */
  topColor?: string;
  /** CSS color for the lower glass. "auto" keeps the theme's original palette. */
  bottomColor?: string;
  /** Lift the characters into place. Enabled by default. */
  reveal?: boolean;
  /** Total delay in seconds between the first and last character, from 0 to 1. */
  stagger?: number;
  /** Total time in seconds from the first rising character to the last character settling. */
  liftDuration?: number;
  /** Easing for the upward character lift. Does not alter the shader flow. */
  ease?: RefractedLiftEase;
  /** Move the beam with each rising letter. By default the beam stays in canvas space. */
  beamFollowsLift?: boolean;
  /** Set false to show the beam at its settled state while the character lift can still play. */
  animateBeam?: boolean;
  /** Length of the opening light pass. The lifted beam eases to a stop afterward. */
  openingDuration?: number;
  duration?: number;
  intensity?: number;
  /** Spectral coverage, from 0 to 3. One preserves the original glass; higher values widen its existing colors without boosting saturation. */
  dispersion?: number;
  /** Strength of the spectral colors, from 0 to 2, independent of white light. */
  colorIntensity?: number;
  /** Height of the fixed beam, equivalent to the cursor's vertical position. */
  beamPosition?: number;
  /** Hold the beam at beamPosition until the cursor steers it. */
  fixedBeam?: boolean;
  paused?: boolean;
  /** The cursor bends the beam locally by default. Enable this to steer the whole beam. */
  cursorMovesBeam?: boolean;
  fontSize?: CSSProperties['fontSize'];
  /** Defaults to the bundled Librestile Extended Bold face. */
  fontFamily?: CSSProperties['fontFamily'];
  fontWeight?: CSSProperties['fontWeight'];
  letterSpacing?: CSSProperties['letterSpacing'];
};

type OpticalStyle = CSSProperties & { '--refracted-width': string };

function stillFrameTime(duration: number) {
  return duration * 0.35;
}

export function RefractedText({
  text,
  theme = 'auto',
  topColor = 'auto',
  bottomColor = 'auto',
  reveal = true,
  stagger = 0.55,
  liftDuration = 1.75,
  ease = 'power4.out',
  beamFollowsLift = false,
  animateBeam = true,
  openingDuration = 4.9,
  duration = 10.5,
  intensity = 1,
  dispersion = 1,
  colorIntensity = 1,
  beamPosition = 0.5,
  fixedBeam = false,
  paused = false,
  cursorMovesBeam = false,
  fontSize = 'clamp(4rem, 42cqw, 23rem)',
  fontFamily = "'ReactDrops Librestile', 'Arial Black', sans-serif",
  fontWeight = 900,
  letterSpacing = 'normal',
  className = '',
  style,
  ...props
}: RefractedTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RefractedRenderer | null>(null);
  const requestRender = useRef(() => {});
  // Keep the current canvas while typing. Only the settled typography incurs
  // font loading and glyph rasterization. The WebGL program stays alive.
  const [typography, setTypography] = useState({
    text,
    fontSize,
    fontFamily,
    fontWeight,
    letterSpacing,
  });
  useEffect(() => {
    if (
      text === typography.text &&
      fontSize === typography.fontSize &&
      fontFamily === typography.fontFamily &&
      fontWeight === typography.fontWeight &&
      letterSpacing === typography.letterSpacing
    )
      return;
    const timeout = window.setTimeout(() => {
      setTypography({ text, fontSize, fontFamily, fontWeight, letterSpacing });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [text, fontSize, fontFamily, fontWeight, letterSpacing, typography]);
  const options = useRef({
    theme,
    topColor,
    bottomColor,
    reveal,
    stagger,
    liftDuration,
    ease,
    beamFollowsLift,
    animateBeam,
    openingDuration,
    duration,
    intensity,
    dispersion,
    colorIntensity,
    beamPosition,
    fixedBeam,
    paused,
    cursorMovesBeam,
  });
  const [failed, setFailed] = useState(false);
  options.current = {
    theme,
    topColor,
    bottomColor,
    reveal,
    stagger,
    liftDuration,
    ease,
    beamFollowsLift,
    animateBeam,
    openingDuration,
    duration,
    intensity,
    dispersion,
    colorIntensity,
    beamPosition,
    fixedBeam,
    paused,
    cursorMovesBeam,
  };
  const letters = Array.from(typography.text);
  const virtualWidth = Math.max(1, letters.length * 394);
  const opticalStyle: OpticalStyle = {
    ...style,
    fontSize: typography.fontSize,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight,
    letterSpacing: typography.letterSpacing,
    aspectRatio: `${virtualWidth} / 318`,
    '--refracted-width': `${letters.length * 1.28}em`,
  };

  useEffect(() => {
    const { text, fontFamily, fontWeight, letterSpacing } = typography;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    const renderer =
      rendererRef.current ??
      createRefractedRenderer(canvas, text, String(fontFamily), fontWeight, String(letterSpacing));
    if (!renderer) {
      setFailed(true);
      return;
    }
    if (rendererRef.current)
      renderer.setTypography(text, String(fontFamily), fontWeight, String(letterSpacing));
    rendererRef.current = renderer;
    setFailed(false);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkPreference = window.matchMedia('(prefers-color-scheme: dark)');
    const readAutoLightTheme = () => {
      const colorScheme = window.getComputedStyle(canvas).colorScheme.trim();
      if (colorScheme === 'light') return true;
      if (colorScheme === 'dark') return false;
      return !darkPreference.matches;
    };
    let autoLightTheme = readAutoLightTheme();
    let themeMix = theme === 'light' || (theme === 'auto' && autoLightTheme) ? 1 : 0;
    const syncTheme = () => {
      const next = readAutoLightTheme();
      if (next === autoLightTheme) return;
      autoLightTheme = next;
      if (options.current.theme === 'auto') syncPlayback();
    };
    const themeObserver = new MutationObserver(syncTheme);
    for (
      let element: HTMLElement | null = canvas.parentElement;
      element;
      element = element.parentElement
    ) {
      themeObserver.observe(element, {
        attributes: true,
        attributeFilter: ['data-theme', 'class', 'style'],
      });
    }
    darkPreference.addEventListener('change', syncTheme);
    let frame = 0;
    let fontFrame = 0;
    let previous = 0;
    let elapsed = paused ? stillFrameTime(duration) : 0;
    let previousAnimateBeam = animateBeam;
    let revealElapsed = 0;
    let disposed = false;
    let inView = true;
    // Canvas text does not update when a web font swaps in. The glyph mask
    // must be created only after the face is ready, then rebuilt on later loads.
    let fontReady = !document.fonts;
    const pointer = {
      x: 0.5,
      y: 0.435,
      influence: 0,
      targetX: 0.5,
      targetY: 0.435,
      targetInfluence: 0,
    };
    let pointerClientX = 0;
    let pointerClientY = 0;
    let pointerDirty = false;
    const movePointer = (event: PointerEvent) => {
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      pointerDirty = true;
      syncPlayback();
    };
    const leavePointer = () => {
      pointerDirty = false;
      pointer.targetInfluence = 0;
      syncPlayback();
    };
    host?.addEventListener('pointerenter', movePointer);
    host?.addEventListener('pointermove', movePointer);
    host?.addEventListener('pointerdown', movePointer);
    host?.addEventListener('pointerleave', leavePointer);
    const tick = (now: number) => {
      frame = 0;
      if (disposed || !inView || document.hidden || !fontReady) return;
      // Pointer events can arrive faster than frames. Measure layout once for
      // the latest event, instead of forcing a rect read on every mouse move.
      if (pointerDirty) {
        pointerDirty = false;
        const rect = canvas.getBoundingClientRect();
        if (rect.width && rect.height) {
          pointer.targetX = Math.max(0, Math.min(1, (pointerClientX - rect.left) / rect.width));
          pointer.targetY = Math.max(0, Math.min(1, (pointerClientY - rect.top) / rect.height));
          pointer.targetInfluence = 1;
        }
      }
      const {
        theme,
        topColor,
        bottomColor,
        reveal,
        stagger,
        liftDuration,
        ease,
        beamFollowsLift,
        animateBeam,
        openingDuration,
        duration,
        intensity,
        dispersion,
        colorIntensity,
        beamPosition,
        fixedBeam,
        paused,
        cursorMovesBeam,
      } = options.current;
      const delta = previous ? Math.min(0.05, Math.max(0, (now - previous) / 1000)) : 1 / 60;
      if (animateBeam && !previousAnimateBeam) elapsed = paused ? stillFrameTime(duration) : 0;
      previousAnimateBeam = animateBeam;
      if (
        fontReady &&
        previous &&
        animateBeam &&
        !paused &&
        !motion.matches &&
        document.visibilityState === 'visible'
      ) {
        elapsed += delta;
      }
      if (fontReady && previous && !motion.matches && document.visibilityState === 'visible') {
        revealElapsed += delta;
      }
      previous = now;
      const follow = motion.matches ? 1 : 1 - Math.exp(-delta * 20);
      const fade = motion.matches
        ? 1
        : 1 - Math.exp(-delta * (pointer.targetInfluence > pointer.influence ? 16 : 8));
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.influence += (pointer.targetInfluence - pointer.influence) * fade;
      if (Math.abs(pointer.targetX - pointer.x) < 0.0001) pointer.x = pointer.targetX;
      if (Math.abs(pointer.targetY - pointer.y) < 0.0001) pointer.y = pointer.targetY;
      if (Math.abs(pointer.targetInfluence - pointer.influence) < 0.0001)
        pointer.influence = pointer.targetInfluence;
      const targetTheme = theme === 'light' || (theme === 'auto' && autoLightTheme) ? 1 : 0;
      themeMix += (targetTheme - themeMix) * (motion.matches ? 1 : 1 - Math.exp(-delta * 9));
      if (Math.abs(targetTheme - themeMix) < 0.0001) themeMix = targetTheme;
      // The beam shares one opening clock across the word. The character
      // stagger remains independent, and static text keeps its light cycle.
      const flowLength = Number.isFinite(openingDuration)
        ? Math.max(2.1, Math.min(12, openingDuration))
        : 4.9;
      const settledTime = flowLength;
      const lightTime = !animateBeam
        ? settledTime
        : motion.matches
          ? stillFrameTime(duration)
          : reveal
            ? Math.min(elapsed, settledTime)
            : elapsed;
      if (fontReady)
        renderer.render(
          lightTime,
          duration,
          openingDuration,
          intensity,
          beamPosition,
          fixedBeam,
          pointer.x,
          pointer.y,
          pointer.influence,
          cursorMovesBeam,
          themeMix,
          motion.matches || !reveal ? Infinity : revealElapsed,
          liftDuration,
          stagger,
          ease,
          beamFollowsLift,
          topColor,
          bottomColor,
          dispersion,
          colorIntensity,
        );
      const totalLiftDuration = Number.isFinite(liftDuration)
        ? Math.max(0.2, Math.min(5, liftDuration))
        : 1.75;
      const beamMoving = animateBeam && !paused && (!reveal || elapsed < settledTime);
      const lettersMoving = reveal && revealElapsed < totalLiftDuration;
      const pointerMoving =
        pointer.x !== pointer.targetX ||
        pointer.y !== pointer.targetY ||
        pointer.influence !== pointer.targetInfluence;
      if (
        (!motion.matches && (beamMoving || lettersMoving)) ||
        pointerMoving ||
        themeMix !== targetTheme
      )
        frame = window.requestAnimationFrame(tick);
      else previous = 0;
    };
    const syncPlayback = () => {
      if (disposed || !inView || document.hidden || !fontReady) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      } else if (!frame) frame = window.requestAnimationFrame(tick);
    };
    requestRender.current = syncPlayback;
    const viewport =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            syncPlayback();
          });
    viewport?.observe(canvas);
    document.addEventListener('visibilitychange', syncPlayback);
    motion.addEventListener('change', syncPlayback);
    const resize = (force = false) => {
      if (!disposed && fontReady) {
        renderer.resize(force);
        syncPlayback();
      }
    };
    const families = String(fontFamily)
      .split(',')
      .map((family) =>
        family
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase(),
      );
    const queueResize = (event: FontFaceSetLoadEvent) => {
      if (
        !event.fontfaces.some((face) =>
          families.includes(face.family.replace(/^['"]|['"]$/g, '').toLowerCase()),
        )
      )
        return;
      if (!fontReady) return;
      window.cancelAnimationFrame(fontFrame);
      fontFrame = window.requestAnimationFrame(() => resize(true));
    };
    // Rebuilding the glyph masks is synchronous CPU work (hundreds of ms on
    // large, high-DPR canvases). Coalesce bursts from layout transitions and
    // window resizing into one rebuild once the size settles; a pending
    // rebuild is dropped if the page navigates away first.
    let resizeTimer = 0;
    // The observer also reports the initial size, which resize() below
    // already applies; only a changed layout size schedules a rebuild.
    let observedSize = `${canvas.clientWidth}x${canvas.clientHeight}`;
    const onResize = () => {
      const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (size === observedSize) return;
      observedSize = size;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => resize(), 120);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    if (observer) observer.observe(canvas);
    else window.addEventListener('resize', onResize);
    // The first size is applied right away; only later changes are coalesced.
    resize();
    syncPlayback();
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', queueResize);
      void document.fonts
        .load(`${fontWeight} 342px ${fontFamily}`, text)
        .catch(() => [])
        .then(async () => {
          await document.fonts.ready;
          if (disposed) return;
          // FontFaceSet may resolve before the new face reaches Canvas 2D.
          // Rasterize on the next paint, after its font cache has updated.
          window.cancelAnimationFrame(fontFrame);
          fontFrame = window.requestAnimationFrame(() => {
            if (disposed) return;
            fontReady = true;
            resize(true);
            syncPlayback();
          });
        });
    }
    return () => {
      disposed = true;
      requestRender.current = () => {};
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(fontFrame);
      window.clearTimeout(resizeTimer);
      document.fonts?.removeEventListener('loadingdone', queueResize);
      observer?.disconnect();
      viewport?.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', syncPlayback);
      themeObserver.disconnect();
      darkPreference.removeEventListener('change', syncTheme);
      window.removeEventListener('resize', onResize);
      host?.removeEventListener('pointerenter', movePointer);
      host?.removeEventListener('pointermove', movePointer);
      host?.removeEventListener('pointerdown', movePointer);
      host?.removeEventListener('pointerleave', leavePointer);
    };
  }, [typography.text, typography.fontFamily, typography.fontWeight, typography.letterSpacing]);

  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    },
    [],
  );

  useEffect(() => {
    requestRender.current();
  }, [
    theme,
    topColor,
    bottomColor,
    reveal,
    stagger,
    liftDuration,
    ease,
    beamFollowsLift,
    animateBeam,
    openingDuration,
    duration,
    intensity,
    dispersion,
    colorIntensity,
    beamPosition,
    fixedBeam,
    paused,
    cursorMovesBeam,
  ]);

  return (
    <span
      {...props}
      role="img"
      aria-label={typography.text}
      className={`refracted-text${className ? ` ${className}` : ''}`}
      style={opticalStyle}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {failed && (
        <span className="refracted-text__fallback" aria-hidden="true">
          {typography.text}
        </span>
      )}
    </span>
  );
}
