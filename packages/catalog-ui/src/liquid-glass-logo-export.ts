import { liquidGlassLogoVideoTime } from '../../components/src/liquid-glass-logo';
import { canvasVideoEncoderCodec, encodeCanvasVideo } from './canvas-video-encode';
import { recordCanvasVideo } from './canvas-video-export';

// Exports the Liquid Glass Logo as a still image or a video. Both use the same
// background composition and explicitly seek the animation before copying it.
// Video is encoded frame by frame at exact times where WebCodecs allows, and
// otherwise follows the recording clock so slow rendering does not stretch time.
// A background video shares that clock: frame t of the export shows the
// background at t seconds (looping), exactly like the preview after a replay.

export type LiquidGlassLogoVideoFormat = { mimeType: string; extension: 'mp4' | 'webm' };
export type LiquidGlassLogoImageFormat = 'png' | 'jpeg' | 'webp';

const formats: LiquidGlassLogoVideoFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.640033', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

/** One supported codec per container, preferring MP4. */
export function liquidGlassLogoVideoFormats(): LiquidGlassLogoVideoFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const supported: LiquidGlassLogoVideoFormat[] = [];
  for (const format of formats) {
    if (
      !supported.some((item) => item.extension === format.extension) &&
      MediaRecorder.isTypeSupported(format.mimeType)
    ) {
      supported.push(format);
    }
  }
  return supported;
}

type FrameOptions = {
  /** The animation's WebGL canvas, already sized to width × height pixels. */
  source: HTMLCanvasElement;
  seek: (
    seconds: number,
    backdrop: HTMLImageElement | HTMLVideoElement | null,
  ) => void | Promise<void>;
  width: number;
  height: number;
  background: string;
  backgroundImage?: string;
  /** Takes the place of backgroundImage, like the component's backgroundVideo. */
  backgroundVideo?: string;
  /** Section of the background video, as in the component: export time 0 shows the start. */
  backgroundVideoStart?: number;
  backgroundVideoEnd?: number;
  backgroundX?: number;
  backgroundY?: number;
  backgroundScale?: number;
  backgroundTint?: string;
  backgroundTintOpacity?: number;
  /** Glass with transparent gaps can filter an uploaded backdrop. */
  multiplyBackdrop?: boolean;
};
type RecordOptions = FrameOptions & {
  fps: number;
  format: LiquidGlassLogoVideoFormat;
  duration: number;
  onProgress?: (fraction: number) => void;
};

async function loadImage(src: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  return image;
}

function waitForVideo(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', message: string) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      resolve();
    };
    const failed = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
      reject(new Error(message));
    };
    const timeout = setTimeout(failed, 15000);
    video.addEventListener(event, done);
    video.addEventListener('error', failed);
  });
}

async function loadVideo(src: string) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  const loaded = waitForVideo(video, 'loadeddata', 'The background video could not be loaded.');
  video.src = src;
  await loaded;
  if (video.duration === Infinity) {
    // WebM files from MediaRecorder can omit their length. Reading the end makes
    // the browser measure it, so the export can loop the video like the preview.
    for (const time of [1e7, 0]) {
      const seeked = waitForVideo(video, 'seeked', 'The background video could not be read.');
      video.currentTime = time;
      await seeked;
    }
  }
  return video;
}

/**
 * Keeps a background video at the export time. Stills seek to the exact frame;
 * a recording plays along in real time, like the recording clock, and only seeks
 * when the two drift apart (at the start, after a slow frame, or where the
 * section loops back to its start).
 */
function createVideoClock(video: HTMLVideoElement, live: boolean, start?: number, end?: number) {
  return async (seconds: number) => {
    // A time right on a frame boundary can land on the frame before it; half a
    // millisecond later is still the same frame at any frame rate.
    const target = Math.min(
      liquidGlassLogoVideoTime(seconds, video.duration, start, end) + 0.0005,
      Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : Infinity,
    );
    if (Math.abs(video.currentTime - target) > (live && !video.paused ? 0.12 : 0.001)) {
      const seeked = waitForVideo(video, 'seeked', 'The background video could not be read.');
      video.currentTime = target;
      await seeked;
    }
    if (live && video.paused) await video.play().catch(() => {});
  };
}

// Same cover framing, zoom and frame-relative translation as the preview.
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
  x: number,
  y: number,
  zoom: number,
) {
  const [sourceWidth, sourceHeight] =
    image instanceof HTMLVideoElement
      ? [image.videoWidth || 1, image.videoHeight || 1]
      : [image.naturalWidth || 1, image.naturalHeight || 1];
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2 + (width * x) / 100,
    (height - drawHeight) / 2 + (height * y) / 100,
    drawWidth,
    drawHeight,
  );
}

async function createFramePainter(
  {
    source,
    seek,
    width,
    height,
    background,
    backgroundImage,
    backgroundVideo,
    backgroundVideoStart,
    backgroundVideoEnd,
    backgroundX = 0,
    backgroundY = 0,
    backgroundScale = 1,
    backgroundTint = '#000000',
    backgroundTintOpacity = 0,
    multiplyBackdrop = false,
  }: FrameOptions,
  { transparent = false, live = false } = {},
) {
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const context = frame.getContext('2d');
  if (!context) throw new Error('Could not create the export canvas.');
  const video = !transparent && backgroundVideo ? await loadVideo(backgroundVideo) : null;
  const image =
    video ?? (!transparent && backgroundImage ? await loadImage(backgroundImage) : null);
  const syncVideo = video
    ? createVideoClock(video, live, backgroundVideoStart, backgroundVideoEnd)
    : null;
  // The WebGL canvas does not keep its buffer, so it is copied right after each seek.
  // The video frame is ready first, so the background and the glass stay in step.
  const paint = async (seconds: number) => {
    await syncVideo?.(seconds);
    await seek(seconds, image);
    context.clearRect(0, 0, width, height);
    if (!transparent) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    if (image) {
      drawCover(
        context,
        image,
        width,
        height,
        Math.max(-100, Math.min(100, backgroundX)),
        Math.max(-100, Math.min(100, backgroundY)),
        Math.max(1, Math.min(3, backgroundScale)),
      );
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, backgroundTintOpacity));
      context.fillStyle = backgroundTint;
      context.fillRect(0, 0, width, height);
      context.restore();
    }
    context.save();
    if (image && multiplyBackdrop) context.globalCompositeOperation = 'multiply';
    context.drawImage(source, 0, 0, width, height);
    context.restore();
  };
  const dispose = () => {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  return { frame, paint, dispose };
}

/** Export a selected animation frame; transparent PNG omits all background layers. */
export async function exportLiquidGlassLogoImage(
  options: FrameOptions & {
    format: LiquidGlassLogoImageFormat;
    seconds: number;
    transparent?: boolean;
    /** Completed preparation, frame composition and encoding stages. */
    onProgress?: (fraction: number, stage: 'preparing' | 'rendering' | 'encoding') => void;
  },
) {
  options.onProgress?.(0, 'preparing');
  const { frame, paint, dispose } = await createFramePainter(options, {
    transparent: options.format === 'png' && options.transparent,
  });
  try {
    options.onProgress?.(0.4, 'rendering');
    // Let the progress update paint before composing a potentially large frame.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await paint(options.seconds);
  } finally {
    dispose();
  }
  options.onProgress?.(0.7, 'encoding');
  const mimeType = `image/${options.format}`;
  const blob = await new Promise<Blob>((resolve, reject) => {
    frame.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not create the image.'));
        else if (blob.type !== mimeType)
          reject(new Error('This browser cannot export that image format.'));
        else resolve(blob);
      },
      mimeType,
      0.95,
    );
  });
  options.onProgress?.(1, 'encoding');
  return { blob, extension: options.format === 'jpeg' ? 'jpg' : options.format };
}

/**
 * Exports the video frame by frame where the browser can encode it (WebCodecs):
 * every frame lands on its exact time, background video included, however slowly
 * it renders. Elsewhere it records in real time, which drops slow frames.
 */
export async function recordLiquidGlassLogoVideo(options: RecordOptions) {
  const probe = { ...options, canvas: options.source, paint: () => {} };
  const codec = await canvasVideoEncoderCodec(probe);
  const { frame, paint, dispose } = await createFramePainter(options, { live: !codec });
  try {
    const video = { ...options, canvas: frame, paint };
    return codec ? await encodeCanvasVideo(video, codec) : await recordCanvasVideo(video);
  } finally {
    dispose();
  }
}

export const exportResolutions = [720, 1080, 1440, 2160] as const;
export const exportAspects = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '4:3': [4, 3],
} as const;
export type ExportAspect = keyof typeof exportAspects;

export const backgroundDefaults = {
  backgroundX: 0,
  backgroundY: 0,
  backgroundScale: 1,
  backgroundTint: '#000000',
  backgroundTintOpacity: 0,
};
export type BackgroundValues = typeof backgroundDefaults;
export const backgroundNumbers = [
  {
    name: 'backgroundX',
    label: 'Position X',
    min: -100,
    max: 100,
    step: 1,
    description: 'Move the background left or right, as a percentage of the frame width.',
  },
  {
    name: 'backgroundY',
    label: 'Position Y',
    min: -100,
    max: 100,
    step: 1,
    description: 'Move the background up or down, as a percentage of the frame height.',
  },
  {
    name: 'backgroundScale',
    label: 'Zoom',
    min: 1,
    max: 3,
    step: 0.05,
    description: 'Enlarge the background to keep the frame covered while moving it.',
  },
  {
    name: 'backgroundTintOpacity',
    label: 'Tint intensity',
    min: 0,
    max: 1,
    step: 0.05,
    description:
      'Use black to darken the background, or choose a tint color. Zero removes the tint.',
  },
] as const;

export type BackgroundType = 'image' | 'video';
export const backgroundAccept =
  'image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-m4v';
export const backgroundVideoError = 'This browser cannot play that video. Try an MP4 or WebM file.';
export const isVideoFile = (file: File) =>
  file.type.startsWith('video/') || (!file.type && /\.(mp4|m4v|mov|webm)$/i.test(file.name));

// Reads the metadata of a chosen video, so an undecodable file is refused up
// front, and measures its length: null when it cannot play, NaN when the
// length stays unknown.
export function probeVideo(url: string) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement('video');
    let timer = 0;
    const finish = (duration: number | null) => {
      clearTimeout(timer);
      video.onloadedmetadata = video.ondurationchange = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(duration);
    };
    const measured = () => Number.isFinite(video.duration) && video.duration > 0;
    video.muted = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (!(video.videoWidth > 0 && video.videoHeight > 0)) return finish(null);
      if (measured()) return finish(video.duration);
      // WebM recordings can leave the length out; reading the end measures it.
      video.ondurationchange = () => measured() && finish(video.duration);
      timer = window.setTimeout(() => finish(NaN), 5000);
      video.currentTime = 1e7;
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
