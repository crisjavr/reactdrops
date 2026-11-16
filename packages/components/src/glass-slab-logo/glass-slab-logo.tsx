'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  createGlassSlabLogoRenderer,
  glassSlabLogoColorPresets,
  glassSlabLogoDefaults,
  normalizeGlassSlabLogo,
  type GlassSlabLogoRenderer,
  type GlassSlabLogoTuning,
} from './glass-slab-logo-renderer';
import { liquidGlassLogoVideoTime } from '../liquid-glass-logo/liquid-glass-logo-video';
import './glass-slab-logo.css';

export type GlassSlabLogoHandle = {
  /** Play the bottom-to-top expansion again. */
  replay: () => void;
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
};
export type GlassSlabLogoProps = Partial<GlassSlabLogoTuning> & {
  /** Palette preset; explicit color props override it. */
  colorPreset?: keyof typeof glassSlabLogoColorPresets;
  paused?: boolean;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundVideoStart?: number;
  backgroundVideoEnd?: number;
  backgroundX?: number;
  backgroundY?: number;
  backgroundScale?: number;
  backgroundTint?: string;
  backgroundTintOpacity?: number;
  /** Blend the glass toward its solid palette colors over a background photo, from 0 to 1. */
  colorOpacity?: number;
  onReady?: () => void;
  /** Called after the first frame of each logo has been drawn. */
  onLogoReady?: (logo: string) => void;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; defaults to "Logo". */
  'aria-label'?: string;
};

/**
 * Turns any logo into a stack of real glass discs: each horizontal run of the
 * logo becomes a tinted disc, ray traced with refraction, Fresnel reflection,
 * total internal reflection and absorption, seen from below like a product
 * shot on a lit card.
 */
export const GlassSlabLogo = forwardRef<GlassSlabLogoHandle, GlassSlabLogoProps>(
  function GlassSlabLogo(
    {
      colorPreset = 'citrus',
      paused = false,
      backgroundImage,
      backgroundVideo,
      backgroundVideoStart = 0,
      backgroundVideoEnd,
      backgroundX = 0,
      backgroundY = 0,
      backgroundScale = 1,
      backgroundTint = '#000000',
      backgroundTintOpacity = 0,
      colorOpacity = 0,
      onReady,
      onLogoReady,
      height,
      className = '',
      style,
      'aria-label': label = 'Logo',
      ...overrides
    },
    ref,
  ) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const image = useRef<HTMLImageElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const videoTime = useRef(0);
    const playback = useRef(!paused);
    const section = useRef({ start: backgroundVideoStart, end: backgroundVideoEnd });
    section.current = { start: backgroundVideoStart, end: backgroundVideoEnd };
    const engine = useRef<GlassSlabLogoRenderer | null>(null);
    const [ready, setReady] = useState(false);
    const readyCallback = useRef(onReady);
    readyCallback.current = onReady;
    const logoReadyCallback = useRef(onLogoReady);
    logoReadyCallback.current = onLogoReady;
    const [fallback, setFallback] = useState(false);
    const tuning = normalizeGlassSlabLogo({
      ...glassSlabLogoDefaults,
      ...glassSlabLogoColorPresets[colorPreset],
      ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
    });
    const hasMedia = Boolean(backgroundImage || backgroundVideo);
    const rendered = hasMedia ? { ...tuning, backgroundColor: 'transparent' } : tuning;
    const key = JSON.stringify(rendered);
    const latest = useRef(rendered);
    latest.current = rendered;
    const seekVideo = (seconds: number) => {
      videoTime.current = Math.max(0, seconds);
      const media = video.current;
      if (!media || media.readyState < 1) return;
      const { start, end } = section.current;
      const target = liquidGlassLogoVideoTime(videoTime.current, media.duration, start, end);
      if (Math.abs(media.currentTime - target) > 0.001) media.currentTime = target;
    };
    const playVideo = () => {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        void video.current?.play().catch(() => {});
    };
    const start = () => {
      playback.current = true;
      engine.current?.play();
      playVideo();
    };
    const stop = () => {
      playback.current = false;
      engine.current?.pause();
      video.current?.pause();
    };
    useImperativeHandle(
      ref,
      () => ({
        replay() {
          engine.current?.replay();
          seekVideo(0);
          start();
        },
        seek(seconds) {
          stop();
          engine.current?.seek(seconds);
          seekVideo(seconds);
        },
        pause: stop,
        play: start,
      }),
      [],
    );
    useEffect(() => {
      if (!canvas.current) return;
      const renderer = createGlassSlabLogoRenderer(canvas.current, latest.current, {
        paused,
        onReady: () => {
          setReady(true);
          setFallback(false);
          readyCallback.current?.();
        },
        onLogoReady: (logo) => logoReadyCallback.current?.(logo),
        onFallback: () => setFallback(true),
      });
      engine.current = renderer;
      return () => {
        renderer?.dispose();
        engine.current = null;
      };
    }, []);
    useEffect(() => engine.current?.update(latest.current), [key]);
    useEffect(() => {
      if (paused) stop();
      else start();
    }, [paused]);
    useEffect(() => {
      const media = video.current;
      if (!media) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      let frame = 0;
      const sync = () => {
        if (reduced.matches) media.pause();
        else if (playback.current) playVideo();
      };
      const watch = () => {
        const { start, end } = section.current;
        if (end !== undefined && (media.currentTime >= end || media.currentTime < start - 0.01))
          seekVideo(0);
        frame = requestAnimationFrame(watch);
      };
      const loaded = () => {
        seekVideo(videoTime.current);
        sync();
      };
      const cancel = () => cancelAnimationFrame(frame);
      const watchPlaying = () => {
        cancel();
        frame = requestAnimationFrame(watch);
      };
      media.addEventListener('loadedmetadata', loaded);
      media.addEventListener('play', watchPlaying);
      media.addEventListener('pause', cancel);
      reduced.addEventListener('change', sync);
      if (media.readyState >= 1) loaded();
      return () => {
        cancel();
        media.removeEventListener('loadedmetadata', loaded);
        media.removeEventListener('play', watchPlaying);
        media.removeEventListener('pause', cancel);
        reduced.removeEventListener('change', sync);
      };
    }, [backgroundVideo]);
    useEffect(() => {
      if (video.current?.paused) seekVideo(videoTime.current);
    }, [backgroundVideoStart, backgroundVideoEnd]);
    const photoColorOpacity =
      backgroundImage && !backgroundVideo && Number.isFinite(colorOpacity)
        ? Math.max(0, Math.min(1, colorOpacity))
        : 0;
    const refractsMedia =
      hasMedia &&
      (photoColorOpacity > 0 ||
        tuning.clearGlass ||
        tuning.reflectivity > 0 ||
        tuning.oilFinish !== 'none');
    useEffect(() => {
      const media = video.current;
      const source = media ?? image.current;
      const renderer = engine.current;
      if (!refractsMedia || !source || !renderer) {
        renderer?.setBackdrop(null);
        return;
      }
      const sync = () =>
        renderer.setBackdrop({
          source,
          backgroundColor: tuning.backgroundColor,
          backgroundX,
          backgroundY,
          backgroundScale,
          backgroundTint,
          backgroundTintOpacity,
          colorOpacity: photoColorOpacity,
        });
      const events = media
        ? ['loadeddata', 'seeked', 'play', 'pause', 'ended', 'emptied', 'error']
        : ['load', 'error'];
      for (const event of events) source.addEventListener(event, sync);
      let frame: number | undefined;
      let watching = true;
      if (media?.requestVideoFrameCallback) {
        const watch = () => {
          if (!watching) return;
          sync();
          frame = media.requestVideoFrameCallback(watch);
        };
        frame = media.requestVideoFrameCallback(watch);
      } else if (media) {
        media.addEventListener('timeupdate', sync);
      }
      sync();
      return () => {
        watching = false;
        if (frame !== undefined) media?.cancelVideoFrameCallback(frame);
        media?.removeEventListener('timeupdate', sync);
        for (const event of events) source.removeEventListener(event, sync);
      };
    }, [
      refractsMedia,
      backgroundImage,
      backgroundVideo,
      tuning.backgroundColor,
      backgroundX,
      backgroundY,
      backgroundScale,
      backgroundTint,
      backgroundTintOpacity,
      photoColorOpacity,
    ]);
    const transparent = tuning.backgroundColor === 'transparent';
    const transform = `translate(${Math.max(-100, Math.min(100, backgroundX))}%, ${Math.max(-100, Math.min(100, backgroundY))}%) scale(${Math.max(1, Math.min(3, backgroundScale))})`;
    return (
      <div
        className={`glass-slab-logo ${className}`.trim()}
        role="img"
        aria-label={label}
        data-glass-slab-ready={ready || undefined}
        data-glass-slab-media={hasMedia || undefined}
        data-glass-slab-reflective={refractsMedia || undefined}
        style={
          {
            height,
            '--glass-slab-background': transparent ? 'transparent' : tuning.backgroundColor,
            '--glass-slab-scale': tuning.logoScale,
            ...style,
          } as CSSProperties
        }
      >
        {backgroundVideo ? (
          <video
            ref={video}
            className="glass-slab-logo-media"
            src={backgroundVideo}
            poster={backgroundImage}
            aria-hidden="true"
            tabIndex={-1}
            muted
            playsInline
            loop
            preload="auto"
            style={{ transform }}
          />
        ) : (
          backgroundImage && (
            <img
              ref={image}
              className="glass-slab-logo-media"
              src={backgroundImage}
              alt=""
              style={{ transform }}
            />
          )
        )}
        {hasMedia && (
          <div
            className="glass-slab-logo-media"
            aria-hidden="true"
            style={{
              backgroundColor: backgroundTint,
              opacity: Math.max(0, Math.min(1, backgroundTintOpacity)),
            }}
          />
        )}
        <canvas ref={canvas} aria-hidden="true" />
        {fallback && <img className="glass-slab-logo-fallback" src={tuning.logo} alt="" />}
      </div>
    );
  },
);
