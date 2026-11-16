import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  GlassSlabLogo,
  createGlassSlabLogoRenderer,
  normalizeGlassSlabLogo,
  type GlassSlabLogoHandle,
  type GlassSlabLogoProps,
  type GlassSlabLogoTuning,
} from '@reactdrops/components/glass-slab-logo';
import { ColorControl } from './color-control';
import { ControlField } from './controls-panel';
import { ExportButton, NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ImageUploadControl } from './image-upload-control';
import { observePreviewActivation } from './preview-activation';
import { canvasImageFormatLabels, useImageExportFormats } from './image-export-formats';
import {
  backgroundAccept,
  backgroundDefaults,
  backgroundNumbers,
  backgroundVideoError,
  exportAspects,
  exportLiquidGlassLogoImage,
  exportResolutions,
  isVideoFile,
  liquidGlassLogoVideoFormats,
  probeVideo,
  recordLiquidGlassLogoVideo,
  type BackgroundValues,
  type ExportAspect,
  type LiquidGlassLogoImageFormat,
  type LiquidGlassLogoVideoFormat,
} from './liquid-glass-logo-export';
import {
  VideoSectionTimeline,
  type LogoClip,
  type TimelineTarget,
  type VideoSection,
} from './video-section-timeline';

const defaultDuration = 2.4;
const longestHold = 10;
const longestClip = 30;
const round = (time: number) => Math.round(time * 100) / 100;
const even = (size: number) => Math.max(2, Math.round(size / 2) * 2);

type Playback = { paused: boolean; loop: boolean; loopDelay: number };
const playbackDefaults: Playback = { paused: false, loop: false, loopDelay: 0 };
type Media = { source: string; name: string; type: 'image' | 'video'; duration: number };
type ExportPhase = 'preparing' | 'rendering' | 'encoding' | 'ready';
type MediaProps = Pick<
  GlassSlabLogoProps,
  'backgroundImage' | 'backgroundVideo' | 'backgroundVideoStart' | 'backgroundVideoEnd'
>;

export function useGlassSlabLogoStudio({
  values,
  logo,
  logoLoading,
  cameraAngle,
  onClipChange,
}: {
  values: Omit<GlassSlabLogoTuning, 'logo'>;
  logo: string;
  logoLoading: boolean;
  cameraAngle: { min: number; max: number; onChange: (angle: number) => void };
  onClipChange: (delay: number, speed: number) => void;
}) {
  const ref = useRef<GlassSlabLogoHandle>(null);
  const [readyLogo, setReadyLogo] = useState('');
  const previewReady = readyLogo === logo;
  const [previewStage, setPreviewStage] = useState<HTMLDivElement | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [draggingCamera, setDraggingCamera] = useState(false);
  const cameraDrag = useRef<{ pointer: number; y: number; angle: number; degreesPerPixel: number }>(
    null,
  );
  const [media, setMedia] = useState<Media | null>(null);
  const mediaChoice = useRef(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [background, setBackground] = useState<BackgroundValues>(backgroundDefaults);
  const [colorOpacity, setColorOpacity] = useState(0);
  const [section, setSection] = useState<VideoSection>({ start: 0, end: defaultDuration });
  const [hold, setHold] = useState(0.8);
  const [playback, setPlayback] = useState(playbackDefaults);
  const [playing, setPlaying] = useState(false);
  const playhead = useRef({ offset: 0, start: 0, playing: false });
  const scrub = useRef<{ target: TimelineTarget; edge: 'start' | 'end' | 'move' } | null>(null);
  const [type, setType] = useState<'video' | 'image'>('video');
  const [aspect, setAspect] = useState<ExportAspect>('16:9');
  const [resolution, setResolution] = useState<(typeof exportResolutions)[number]>(1080);
  const [fps, setFps] = useState(60);
  const [imageFormat, setImageFormat] = useState<LiquidGlassLogoImageFormat>('png');
  const imageFormats = useImageExportFormats();
  const [videoFormat, setVideoFormat] = useState<LiquidGlassLogoVideoFormat['extension']>('mp4');
  const [videoFormats, setVideoFormats] = useState<LiquidGlassLogoVideoFormat[]>([]);
  const [imageTime, setImageTime] = useState(0.9);
  const [transparent, setTransparent] = useState(false);
  const [phase, setPhase] = useState<ExportPhase | null>(null);
  const [progress, setProgress] = useState(0);
  const [exportError, setExportError] = useState('');
  const exporting = useRef(false);
  const exportBusy = phase !== null && phase !== 'ready';
  const canDragCamera = previewReady && !logoLoading && !exportBusy;
  const startCameraDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDragCamera || !event.isPrimary || event.button !== 0 || cameraDrag.current) return;
    const frame = event.currentTarget;
    frame.setPointerCapture(event.pointerId);
    cameraDrag.current = {
      pointer: event.pointerId,
      y: event.clientY,
      angle: values.elevation,
      degreesPerPixel: (cameraAngle.max - cameraAngle.min) / frame.getBoundingClientRect().height,
    };
    setDraggingCamera(true);
  };
  const moveCamera = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cameraDrag.current;
    if (!canDragCamera || !drag || drag.pointer !== event.pointerId) return;
    const angle = Math.round(drag.angle + (drag.y - event.clientY) * drag.degreesPerPixel);
    const bounded = Math.max(cameraAngle.min, Math.min(cameraAngle.max, angle));
    if (bounded !== values.elevation) cameraAngle.onChange(bounded);
  };
  const finishCameraDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (cameraDrag.current?.pointer !== event.pointerId) return;
    cameraDrag.current = null;
    setDraggingCamera(false);
  };

  const transparentImage = type === 'image' && imageFormat === 'png' && transparent;
  const fullBleedPhoto = media?.type === 'image' && !transparentImage;
  const photoColorOpacity = fullBleedPhoto ? colorOpacity : 0;
  const logoLength = values.intro ? values.introDuration / values.speed : 0;
  const logoEnd = values.delay + logoLength;
  const clipLength = Math.max(1 / fps, logoEnd + hold);
  const lastFrame = Math.max(0, clipLength - 0.001);
  const frameTime = Math.min(imageTime, lastFrame);
  const video = media?.type === 'video' ? media : null;
  const hasSection = video !== null && Number.isFinite(video.duration);
  const mediaProps: MediaProps = video
    ? {
        backgroundVideo: video.source,
        ...(hasSection
          ? { backgroundVideoStart: section.start, backgroundVideoEnd: section.end }
          : {}),
      }
    : { backgroundImage: media?.source };
  const [across, down] = exportAspects[aspect];

  const time = () => {
    if (type === 'image') return frameTime;
    const clock = playhead.current;
    return clock.playing
      ? Math.min(clipLength, clock.offset + (performance.now() - clock.start) / 1000)
      : clock.offset;
  };
  const seek = (seconds: number) => {
    const offset = Math.max(0, Math.min(lastFrame, seconds));
    if (type === 'image') {
      setImageTime(round(offset));
      return;
    }
    Object.assign(playhead.current, { offset, playing: false });
    setPlaying(false);
    ref.current?.seek(offset);
  };
  const play = (seconds?: number) => {
    if (type !== 'video' || !previewReady || !previewActive) return;
    const clock = playhead.current;
    const offset = seconds ?? (clock.offset >= lastFrame ? 0 : clock.offset);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      seek(lastFrame);
      return;
    }
    Object.assign(clock, { offset, start: performance.now(), playing: true });
    setPlaying(true);
    ref.current?.seek(offset);
    ref.current?.play();
  };
  const replay = () => {
    if (type === 'image') return;
    if (playback.paused) seek(0);
    else play(0);
  };
  const toggle = () => {
    if (playhead.current.playing) seek(time());
    else play();
  };

  useEffect(() => {
    if (!previewStage || previewActive) return;
    return observePreviewActivation(previewStage, () => setPreviewActive(true), {
      waitForPageReveal: true,
    });
  }, [previewStage, previewActive]);
  useEffect(() => {
    const formats = liquidGlassLogoVideoFormats();
    setVideoFormats(formats);
    if (formats[0]) setVideoFormat(formats[0].extension);
    return () => {
      mediaChoice.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (media) URL.revokeObjectURL(media.source);
    },
    [media],
  );
  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setTimeout(() => setPhase(null), 1800);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (type === 'image') {
      Object.assign(playhead.current, { playing: false });
      setPlaying(false);
      ref.current?.seek(frameTime);
    } else if (!previewReady) {
      seek(0);
    } else if (!playhead.current.playing) {
      const offset = Math.min(playhead.current.offset, lastFrame);
      ref.current?.seek(offset);
    }
  }, [type, frameTime, logo, previewReady, values, section, media, lastFrame]);
  useEffect(() => {
    if (type === 'video') replay();
  }, [previewActive, previewReady, type, media?.source, logo]);
  useEffect(() => {
    if (playback.paused) seek(time());
    else if (!playhead.current.playing) play();
  }, [playback.paused]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const watch = () => {
      if (!playhead.current.playing) return;
      if (time() >= lastFrame) {
        seek(lastFrame);
        return;
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [playing, clipLength, lastFrame]);
  useEffect(() => {
    if (
      playing ||
      !playback.loop ||
      playback.paused ||
      type !== 'video' ||
      video ||
      playhead.current.offset < lastFrame
    )
      return;
    const timer = window.setTimeout(() => play(0), playback.loopDelay * 1000);
    return () => clearTimeout(timer);
  }, [playing, playback, type, video, lastFrame]);
  useEffect(() => {
    if (!hasSection || !video) return;
    setSection((old) => {
      const length = Math.min(video.duration, longestClip, clipLength);
      if (Math.abs(old.end - old.start - length) < 0.006) return old;
      const start = Math.min(old.start, Math.max(0, video.duration - length));
      return { start: round(start), end: Math.min(video.duration, round(start + length)) };
    });
  }, [clipLength, hasSection, video]);
  useEffect(() => {
    const pending = scrub.current;
    scrub.current = null;
    if (!pending) return;
    const { target, edge } = pending;
    seek(
      target === 'section'
        ? edge === 'end'
          ? section.end - section.start
          : 0
        : target === 'export'
          ? lastFrame
          : values.delay + (edge === 'end' ? logoLength : 0),
    );
  }, [section, values.delay, values.speed, hold]);

  const clearMedia = () => {
    mediaChoice.current++;
    setMediaLoading(false);
    setMedia(null);
    setMediaError('');
    setBackground(backgroundDefaults);
    setColorOpacity(0);
    setSection({ start: 0, end: defaultDuration });
    onClipChange(0, values.speed);
  };
  const chooseMedia = async (file: File) => {
    const choice = ++mediaChoice.current;
    const source = URL.createObjectURL(file);
    const video = isVideoFile(file);
    setMediaError('');
    setMediaLoading(true);
    let duration: number | null = NaN;
    if (video) duration = await probeVideo(source);
    else {
      const image = new Image();
      image.src = source;
      try {
        await image.decode();
      } catch {
        duration = null;
      }
    }
    if (choice !== mediaChoice.current) {
      URL.revokeObjectURL(source);
      return;
    }
    setMediaLoading(false);
    if (duration === null) {
      URL.revokeObjectURL(source);
      setMediaError(video ? backgroundVideoError : 'This browser cannot open that image.');
      return;
    }
    setBackground(backgroundDefaults);
    setColorOpacity(0);
    setSection({
      start: 0,
      end: Number.isFinite(duration) ? Math.min(duration, clipLength) : clipLength,
    });
    setMedia({ source, type: video ? 'video' : 'image', name: file.name, duration });
  };
  const changeSection = (next: VideoSection) => {
    const shift = next.end === section.end ? next.start - section.start : 0;
    const length = next.end - next.start;
    const delay = round(Math.max(0, Math.min(values.delay - shift, length - logoLength)));
    onClipChange(delay, values.speed);
    setHold(round(Math.max(0, length - delay - logoLength)));
    setSection(next);
  };
  const changeLogo = ({ start, length }: LogoClip) => {
    const speed = values.intro ? Math.max(0.1, Math.min(4, values.introDuration / length)) : 1;
    onClipChange(start, speed);
  };

  const exportFile = async () => {
    const format = videoFormats.find((item) => item.extension === videoFormat);
    if (exporting.current || logoLoading || mediaLoading || (type === 'video' && !format)) return;
    exporting.current = true;
    setExportError('');
    setPhase('preparing');
    setProgress(0);
    const width = even(across >= down ? (resolution * across) / down : resolution);
    const height = even(across >= down ? resolution : (resolution * down) / across);
    let renderer: ReturnType<typeof createGlassSlabLogoRenderer> = null;
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const canvas = document.createElement('canvas');
      const hasMedia = Boolean(media) && !transparentImage;
      const color =
        values.backgroundColor === 'transparent' && !transparentImage
          ? '#ffffff'
          : values.backgroundColor;
      const tuning = normalizeGlassSlabLogo({
        ...values,
        logo,
        tilt: 0,
        backgroundColor: transparentImage || hasMedia ? 'transparent' : color,
      });
      const refractsMedia =
        photoColorOpacity > 0 ||
        tuning.clearGlass ||
        tuning.reflectivity > 0 ||
        tuning.oilFinish !== 'none';
      let onReady!: () => void;
      let onError!: (error: Error) => void;
      const ready = new Promise<void>((resolve, reject) => {
        onReady = resolve;
        onError = reject;
      });
      const exportRenderer = createGlassSlabLogoRenderer(canvas, tuning, {
        paused: true,
        exportSize: { width, height },
        onReady,
        onFallback: () => onError(new Error('Could not render the logo for export.')),
      });
      renderer = exportRenderer;
      if (!exportRenderer) onError(new Error('Could not create the glass renderer.'));
      let timeout = 0;
      try {
        await Promise.race([
          ready,
          new Promise<void>((_, reject) => {
            timeout = window.setTimeout(
              () => reject(new Error('The logo did not load in time.')),
              15000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      if (!exportRenderer) throw new Error('Could not create the glass renderer.');
      const options = {
        source: canvas,
        seek: (seconds: number, source: HTMLImageElement | HTMLVideoElement | null) => {
          exportRenderer.setBackdrop(
            source && refractsMedia
              ? { source, backgroundColor: color, ...background, colorOpacity: photoColorOpacity }
              : null,
          );
          const expanding = type === 'video' && seconds > values.delay && seconds < logoEnd;
          exportRenderer.renderFrame(
            seconds,
            expanding ? Math.min(tuning.samples, 8) : tuning.samples,
          );
        },
        width,
        height,
        background: color,
        ...mediaProps,
        ...background,
        multiplyBackdrop: !refractsMedia,
      };
      const file =
        type === 'image'
          ? await exportLiquidGlassLogoImage({
              ...options,
              format: imageFormat,
              seconds: frameTime,
              transparent: transparentImage,
              onProgress: (fraction, stage) => {
                setPhase(stage);
                setProgress(fraction);
              },
            })
          : await recordLiquidGlassLogoVideo({
              ...options,
              format: format!,
              fps,
              duration: clipLength,
              onProgress: (fraction) => {
                setPhase('rendering');
                setProgress(fraction);
              },
            });
      const link = document.createElement('a');
      const url = URL.createObjectURL(file.blob);
      link.href = url;
      const suffix =
        type === 'video'
          ? `${fps}fps`
          : `${frameTime.toFixed(2)}s${transparentImage ? '-transparent' : ''}`;
      link.download = `glass-slab-logo-${width}x${height}-${suffix}.${file.extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setProgress(1);
      setPhase('ready');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
      setPhase(null);
    } finally {
      renderer?.dispose();
      exporting.current = false;
    }
  };

  const mediaInput = (
    <>
      <ImageUploadControl
        label="Background"
        description="Image or video behind the glass logo. Clear Glass and Oil refract this background in the preview and exports."
        hint="Image or video · drop or click"
        accept={backgroundAccept}
        validate={(file) =>
          file.type.startsWith('image/') || isVideoFile(file)
            ? null
            : 'Use an image or a video file.'
        }
        preview={media?.source}
        previewType={media?.type}
        fit="cover"
        fileName={media?.name}
        onFile={(file) => void chooseMedia(file)}
        onClear={clearMedia}
      />
      {mediaError && (
        <p className="image-upload-control-error" role="alert">
          {mediaError}
        </p>
      )}
    </>
  );

  const backgroundControls = media && (
    <fieldset className="reveal-control-group">
      <legend className="reveal-group-heading">
        <h3>Background</h3>
      </legend>
      <div className="reveal-fields">
        {backgroundNumbers.map(({ name, label, description, min, max, step }) => (
          <ControlField key={name} className="is-number" label={label} description={description}>
            <NumberControl
              label={label}
              value={background[name]}
              min={min}
              max={max}
              step={step}
              onChange={(value) => setBackground((old) => ({ ...old, [name]: value }))}
            />
          </ControlField>
        ))}
        <ControlField
          className="is-color"
          label="Tint color"
          description="Color layered over the background, behind the glass."
        >
          <ColorControl
            label="Tint color"
            value={background.backgroundTint}
            onChange={(value) => setBackground((old) => ({ ...old, backgroundTint: value }))}
          />
        </ControlField>
      </div>
    </fieldset>
  );

  const timeline = hasSection && video && (
    <fieldset className="reveal-control-group">
      <legend className="reveal-group-heading">
        <h3>Timeline</h3>
      </legend>
      <div className="reveal-fields">
        <ControlField
          className="is-video-timeline"
          label="Video, logo and export"
          description="Trim or move the background section, position and stretch the logo entrance, or change the export hold. Click the ruler to choose a frame."
        >
          <VideoSectionTimeline
            src={video.source}
            duration={video.duration}
            section={section}
            minLength={Math.max(0.01, logoLength)}
            maxLength={longestClip}
            logo={{ start: values.delay, length: Math.max(0.01, logoLength) }}
            logoMinLength={values.intro ? values.introDuration / 4 : 0.01}
            logoMaxLength={values.intro ? values.introDuration / 0.1 : 0.01}
            logoLatestEnd={longestClip - hold}
            clipLength={clipLength}
            clipMaxLength={Math.min(longestClip, logoEnd + longestHold)}
            onClipChange={(length) => setHold(round(Math.max(0, length - logoEnd)))}
            time={time}
            playing={playing}
            canPlay={type === 'video'}
            onTogglePlay={toggle}
            onSeek={seek}
            onChange={changeSection}
            onLogoChange={changeLogo}
            onScrub={(target, edge) => {
              if (type === 'video') scrub.current = { target, edge };
            }}
          />
        </ControlField>
      </div>
    </fieldset>
  );

  const playbackControls = (
    <>
      <ControlField
        className="is-number"
        label="Loop delay"
        description="Seconds to wait before replaying the preview."
      >
        <NumberControl
          label="Loop delay"
          value={playback.loopDelay}
          min={0}
          max={10}
          step={0.1}
          onChange={(loopDelay) => setPlayback((old) => ({ ...old, loopDelay }))}
        />
      </ControlField>
      {(['loop', 'paused'] as const).map((name) => {
        const label = name === 'loop' ? 'Loop' : 'Paused';
        return (
          <ControlField
            key={name}
            className="is-boolean"
            label={label}
            description={
              name === 'loop'
                ? 'Replay the preview after the hold. A background video uses the timeline instead.'
                : 'Pause the preview at the current frame.'
            }
          >
            <SwitchControl
              label={label}
              checked={playback[name]}
              onChange={(value) => setPlayback((old) => ({ ...old, [name]: value }))}
            />
          </ControlField>
        );
      })}
    </>
  );

  const exportControls = (
    <fieldset className="reveal-control-group" disabled={exportBusy}>
      <legend className="reveal-group-heading">
        <h3>Export</h3>
      </legend>
      <div className="reveal-fields">
        <ControlField
          label="Type"
          description="Export the animation as a video or a single frame as an image."
        >
          <SelectControl
            label="Type"
            value={type}
            options={[
              { value: 'video', label: 'Video' },
              { value: 'image', label: 'Image' },
            ]}
            onChange={(value) => {
              setType(value as typeof type);
              setExportError('');
            }}
          />
        </ControlField>
        {(type === 'image' || videoFormats.length > 0) && (
          <ControlField label="Format" description="File format used for the export.">
            <SelectControl
              label="Format"
              value={type === 'image' ? imageFormat : videoFormat}
              options={
                type === 'image'
                  ? imageFormats.map((value) => ({ value, label: canvasImageFormatLabels[value] }))
                  : videoFormats.map(({ extension }) => ({
                      value: extension,
                      label: extension.toUpperCase(),
                    }))
              }
              onChange={(value) => {
                if (type === 'image') setImageFormat(value as LiquidGlassLogoImageFormat);
                else setVideoFormat(value as LiquidGlassLogoVideoFormat['extension']);
              }}
            />
          </ControlField>
        )}
        <ControlField label="Aspect ratio" description="Frame shape of the exported file.">
          <SelectControl
            label="Aspect ratio"
            value={aspect}
            options={Object.keys(exportAspects).map((value) => ({ value, label: value }))}
            onChange={(value) => setAspect(value as ExportAspect)}
          />
        </ControlField>
        <ControlField label="Resolution" description="Size of the short side, in pixels.">
          <SelectControl
            label="Resolution"
            value={String(resolution)}
            options={exportResolutions.map((value) => ({
              value: String(value),
              label: value === 2160 ? '4K (2160p)' : `${value}p`,
            }))}
            onChange={(value) => setResolution(Number(value) as typeof resolution)}
          />
        </ControlField>
        {type === 'video' ? (
          <>
            <ControlField label="Frame rate" description="Frames per second.">
              <SelectControl
                label="Frame rate"
                value={String(fps)}
                options={[30, 60].map((value) => ({ value: String(value), label: `${value} fps` }))}
                onChange={(value) => setFps(Number(value))}
              />
            </ControlField>
            <ControlField
              className="is-number"
              label="Hold (s)"
              description={`Seconds to hold the finished logo. Total export length is ${round(clipLength)} s.`}
            >
              <NumberControl
                label="Hold (s)"
                value={hold}
                min={0}
                max={longestHold}
                step={0.1}
                onChange={setHold}
              />
            </ControlField>
          </>
        ) : (
          <ControlField
            className="is-number"
            label="Frame (s)"
            description="Choose the moment to export. The preview shows that frame."
          >
            <NumberControl
              label="Frame (s)"
              value={frameTime}
              min={0}
              max={lastFrame}
              step={0.01}
              onChange={setImageTime}
            />
          </ControlField>
        )}
        {type === 'image' && imageFormat === 'png' && (
          <ControlField
            className="is-boolean"
            label="Transparent background"
            description="Keep the glass and omit the background color, media and tint in the PNG."
          >
            <SwitchControl
              label="Transparent background"
              checked={transparent}
              onChange={setTransparent}
            />
          </ControlField>
        )}
        <div className="reveal-export-action">
          <ExportButton
            aria-label={`Export ${type}`}
            busy={exportBusy}
            ready={phase === 'ready'}
            progress={progress}
            progressLabel={`${type === 'image' ? 'Image' : 'Video'} export progress`}
            data-export-state={phase ?? 'idle'}
            disabled={
              exportBusy ||
              logoLoading ||
              mediaLoading ||
              (type === 'video' && !videoFormats.length)
            }
            onClick={exportFile}
          >
            {phase === 'ready'
              ? type === 'image'
                ? 'Image ready'
                : 'Video ready'
              : phase === 'preparing'
                ? `Preparing ${type}…`
                : phase === 'encoding'
                  ? `Encoding ${imageFormat.toUpperCase()}…`
                  : phase === 'rendering'
                    ? type === 'video'
                      ? 'Exporting video…'
                      : 'Rendering image…'
                    : `Export ${type}`}
          </ExportButton>
          {exportError && (
            <p className="glass-slab-logo-export-error" role="alert">
              {exportError}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );

  return {
    backgroundControls,
    colorOpacityControl: (
      <ControlField
        className="is-number"
        label="Color opacity"
        description="Blend the glass from its original transparency at 0 to solid palette colors at 1. Requires a background photo."
      >
        <NumberControl
          label="Color opacity"
          value={photoColorOpacity}
          min={0}
          max={1}
          step={0.01}
          disabled={!fullBleedPhoto}
          onChange={setColorOpacity}
        />
      </ControlField>
    ),
    mediaInput,
    timeline,
    playbackControls,
    exportControls,
    exportBusy,
    replay: type === 'video' ? replay : undefined,
    reset() {
      clearMedia();
      setHold(0.8);
      setPlayback(playbackDefaults);
      setType('video');
      setAspect('16:9');
      setResolution(1080);
      setFps(60);
      setImageFormat('png');
      setVideoFormat(videoFormats[0]?.extension ?? 'mp4');
      setImageTime(0.9);
      setTransparent(false);
      setPhase(null);
      setExportError('');
      play(0);
    },
    backgroundProps: media
      ? {
          ...mediaProps,
          ...background,
          ...(photoColorOpacity > 0 ? { colorOpacity: photoColorOpacity } : {}),
        }
      : {},
    preview: (
      <div
        className={`glass-slab-logo-demo${fullBleedPhoto ? ' has-background-photo' : ''}`}
        ref={setPreviewStage}
      >
        <div
          className={`glass-slab-logo-frame${transparentImage ? ' is-transparent' : ''}`}
          style={{ '--frame-ratio': across / down } as CSSProperties}
          data-camera-draggable={canDragCamera || undefined}
          data-camera-dragging={draggingCamera || undefined}
          onPointerDown={startCameraDrag}
          onPointerMove={moveCamera}
          onPointerUp={finishCameraDrag}
          onPointerCancel={finishCameraDrag}
          onLostPointerCapture={finishCameraDrag}
        >
          <GlassSlabLogo
            ref={ref}
            onLogoReady={setReadyLogo}
            {...values}
            logo={logo}
            paused
            tilt={type === 'image' || video ? 0 : values.tilt}
            colorOpacity={photoColorOpacity}
            {...(transparentImage
              ? { backgroundColor: 'transparent' }
              : { ...mediaProps, ...background })}
            aria-label="Glass slab logo"
          />
        </div>
      </div>
    ),
  };
}
