'use client';

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  createLiquidGlassLogoRenderer,
  liquidGlassLogoDefaults,
  liquidGlassLogoThemes,
  normalizeLiquidGlassLogo,
  type LiquidGlassLogoTuning,
} from './liquid-glass-logo-renderer';
import './liquid-glass-logo.css';

export type LiquidGlassLogoHandle = {
  replay: () => void;
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
};
export type LiquidGlassLogoProps = Partial<LiquidGlassLogoTuning> & {
  height?: number | string;
  /** Image URL drawn behind the animation, covering the container. The plate turns see-through. */
  backgroundImage?: string;
  /**
   * Video URL played muted and looping behind the animation, covering the container.
   * It replaces backgroundImage, which then serves as the poster until the video plays.
   * The video follows paused, replay(), seek(), pause() and play(), and stays still
   * when the visitor prefers reduced motion.
   */
  backgroundVideo?: string;
  /** Horizontal and vertical offsets as percentages of the frame; 0 centers the background. */
  backgroundX?: number;
  backgroundY?: number;
  /** Scale of the cover image or video, from 1 to 3. */
  backgroundScale?: number;
  /** Color and opacity (0–1) of the overlay between the background and the logo. */
  backgroundTint?: string;
  backgroundTintOpacity?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; defaults to "Logo" or the visible wordmark text. */
  'aria-label'?: string;
};

export const LiquidGlassLogo = forwardRef<LiquidGlassLogoHandle, LiquidGlassLogoProps>(
  function LiquidGlassLogo(
    {
      height,
      backgroundImage,
      backgroundVideo,
      backgroundX = 0,
      backgroundY = 0,
      backgroundScale = 1,
      backgroundTint = '#000000',
      backgroundTintOpacity = 0,
      className = '',
      style,
      'aria-label': label,
      ...overrides
    },
    ref,
  ) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const engine = useRef<ReturnType<typeof createLiquidGlassLogoRenderer>>(null);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);
    // A theme supplies the colors; any color passed explicitly still wins.
    const theme = liquidGlassLogoThemes[overrides.theme === 'light' ? 'light' : 'dark'];
    // Over a background image or video the plate is see-through: the glass keeps
    // its optics, but its own color would hide the picture behind it.
    const hasBackground = Boolean(backgroundImage || backgroundVideo);
    const tuning = normalizeLiquidGlassLogo({
      ...liquidGlassLogoDefaults,
      ...theme,
      ...overrides,
      ...(hasBackground ? { tile: false } : {}),
    });
    const key = JSON.stringify(tuning);
    const latest = useRef(tuning);
    latest.current = tuning;
    // The background video shares the animation's clock: it pauses, restarts and
    // seeks with it, and stays still when the visitor prefers reduced motion.
    const playVideo = () => {
      const media = video.current;
      if (!media || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      void media.play().catch(() => {});
    };
    const seekVideo = (seconds: number) => {
      const media = video.current;
      if (!media) return;
      const length = media.duration;
      const target = Number.isFinite(length) && length > 0 ? seconds % length : seconds;
      if (Math.abs(media.currentTime - target) > 0.001) media.currentTime = target;
    };
    useImperativeHandle(
      ref,
      () => ({
        replay: () => {
          engine.current?.replay();
          seekVideo(0);
        },
        seek: (seconds) => {
          engine.current?.seek(seconds);
          seekVideo(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
        },
        pause: () => {
          engine.current?.pause();
          video.current?.pause();
        },
        play: () => {
          engine.current?.play();
          playVideo();
        },
      }),
      [],
    );
    useEffect(() => {
      const media = video.current;
      if (!media) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const sync = () => (tuning.paused || reduced?.matches ? media.pause() : playVideo());
      sync();
      reduced?.addEventListener?.('change', sync);
      return () => reduced?.removeEventListener?.('change', sync);
      // playVideo only reads refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tuning.paused, backgroundVideo]);
    useEffect(() => {
      if (!canvas.current) return;
      let renderer: ReturnType<typeof createLiquidGlassLogoRenderer> = null;
      try {
        renderer = createLiquidGlassLogoRenderer(canvas.current, latest.current, () =>
          setReady(true),
        );
      } catch {
        renderer = null;
      }
      if (!renderer) setFallback(true);
      engine.current = renderer;
      return () => {
        renderer?.dispose();
        engine.current = null;
      };
    }, []);
    // Apply size and DPR changes before the resized canvas can be painted.
    useLayoutEffect(() => engine.current?.update(latest.current), [key]);
    const markSource = tuning.mark === 'logo' ? tuning.logo : tuning.mark;
    const backgroundTransform = `translate(${Math.max(-100, Math.min(100, backgroundX))}%, ${Math.max(-100, Math.min(100, backgroundY))}%) scale(${Math.max(1, Math.min(3, backgroundScale))})`;
    return (
      <div
        className={`liquid-glass-logo ${className}`.trim()}
        style={{
          height,
          background: tuning.background,
          ...style,
        }}
        role="img"
        aria-label={label ?? (tuning.ending === 'logo' ? 'Logo' : tuning.text)}
        data-liquid-glass-ready={ready || undefined}
      >
        {backgroundVideo ? (
          <video
            ref={video}
            className="liquid-glass-logo-background"
            aria-hidden="true"
            tabIndex={-1}
            src={backgroundVideo}
            poster={backgroundImage}
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            style={{ transform: backgroundTransform }}
          />
        ) : (
          backgroundImage && (
            <div
              className="liquid-glass-logo-background"
              aria-hidden="true"
              style={{
                background: `url(${JSON.stringify(backgroundImage)}) center / cover no-repeat`,
                transform: backgroundTransform,
              }}
            />
          )
        )}
        {hasBackground && (
          <div
            className="liquid-glass-logo-background"
            aria-hidden="true"
            style={{
              backgroundColor: backgroundTint,
              opacity: Math.max(0, Math.min(1, backgroundTintOpacity)),
            }}
          />
        )}
        <canvas ref={canvas} aria-hidden="true" />
        {fallback && (
          <span
            className="liquid-glass-logo-fallback"
            aria-hidden="true"
            style={{
              color: tuning.textColor,
              fontFamily: tuning.fontFamily,
              fontWeight: tuning.fontWeight,
              fontSize: tuning.fontSize,
              letterSpacing: `${tuning.letterSpacing}em`,
              gap: `${tuning.markGap}em`,
            }}
          >
            {tuning.ending === 'logo' ? (
              <img
                src={tuning.logo}
                alt=""
                style={{
                  width: tuning.logoSize * tuning.logoScale * tuning.finalLogoScale,
                  height: tuning.logoSize * tuning.logoScale * tuning.finalLogoScale,
                  maxWidth: '80%',
                  maxHeight: '80%',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <>
                {markSource && <img src={markSource} alt="" />}
                {tuning.text}
              </>
            )}
          </span>
        )}
      </div>
    );
  },
);
