// Records the Liquid Glass Logo sequence to a video file in the browser. Each frame is
// sought explicitly, so the result is the same at any resolution or frame rate;
// frames are delivered in real time because MediaRecorder timestamps them as
// they arrive.

export type LiquidGlassLogoVideoFormat = { mimeType: string; extension: 'mp4' | 'webm' };

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

type RecordOptions = {
  /** The animation's WebGL canvas, already sized to width × height pixels. */
  source: HTMLCanvasElement;
  seek: (seconds: number) => void;
  width: number;
  height: number;
  fps: number;
  format: LiquidGlassLogoVideoFormat;
  duration: number;
  background: string;
  backgroundImage?: string;
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

// Same framing as CSS `background-size: cover` centered.
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

export async function recordLiquidGlassLogoVideo({
  source,
  seek,
  width,
  height,
  fps,
  format,
  duration,
  background,
  backgroundImage,
  onProgress,
}: RecordOptions) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(format.mimeType)) {
    throw new Error(`This browser cannot record ${format.extension.toUpperCase()} video.`);
  }
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const context = frame.getContext('2d');
  if (!context) throw new Error('Could not create the video canvas.');
  const image = backgroundImage ? await loadImage(backgroundImage) : null;
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
  // The WebGL canvas does not keep its buffer, so it is copied right after each seek.
  const paint = (seconds: number) => {
    seek(seconds);
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    if (image) drawCover(context, image, width, height);
    context.drawImage(source, 0, 0, width, height);
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
