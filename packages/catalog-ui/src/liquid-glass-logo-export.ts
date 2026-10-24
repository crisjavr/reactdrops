// Exports the Liquid Glass Logo as a still image or a video. Both use the same
// background composition and explicitly seek the animation before copying it.
// Video frames are delivered in real time for MediaRecorder's timestamps.

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
  seek: (seconds: number) => void;
  width: number;
  height: number;
  background: string;
  backgroundImage?: string;
  backgroundX?: number;
  backgroundY?: number;
  backgroundScale?: number;
  backgroundTint?: string;
  backgroundTintOpacity?: number;
};
type RecordOptions = FrameOptions & {
  fps: number;
  format: LiquidGlassLogoVideoFormat;
  duration: number;
  onProgress?: (fraction: number) => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function loadImage(src: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  return image;
}

// Same cover framing, zoom and frame-relative translation as the preview.
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  x: number,
  y: number,
  zoom: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
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
    backgroundX = 0,
    backgroundY = 0,
    backgroundScale = 1,
    backgroundTint = '#000000',
    backgroundTintOpacity = 0,
  }: FrameOptions,
  transparent = false,
) {
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const context = frame.getContext('2d');
  if (!context) throw new Error('Could not create the export canvas.');
  const image = !transparent && backgroundImage ? await loadImage(backgroundImage) : null;
  // The WebGL canvas does not keep its buffer, so it is copied right after each seek.
  const paint = (seconds: number) => {
    seek(seconds);
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
    context.drawImage(source, 0, 0, width, height);
  };
  return { frame, paint };
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
  const { frame, paint } = await createFramePainter(
    options,
    options.format === 'png' && options.transparent,
  );
  options.onProgress?.(0.4, 'rendering');
  // Let the progress update paint before composing a potentially large frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  paint(options.seconds);
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

export async function recordLiquidGlassLogoVideo(options: RecordOptions) {
  const { width, height, fps, format, duration, onProgress } = options;
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(format.mimeType)) {
    throw new Error(`This browser cannot record ${format.extension.toUpperCase()} video.`);
  }
  const { frame, paint: paintFrame } = await createFramePainter(options);
  const stream = frame.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: Math.round(width * height * fps * 0.12),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  const paint = (seconds: number) => {
    paintFrame(seconds);
    track.requestFrame();
  };
  paint(0);
  recorder.start();
  const frames = Math.max(1, Math.round(duration * fps));
  const start = performance.now();
  for (let index = 0; index <= frames; index++) {
    await wait(start + (index * 1000) / fps - performance.now());
    paint(index / fps);
    onProgress?.(index / frames);
  }
  await wait(1000 / fps);
  recorder.stop();
  await stopped;
  track.stop();
  return { blob: new Blob(chunks, { type: format.mimeType }), extension: format.extension };
}
