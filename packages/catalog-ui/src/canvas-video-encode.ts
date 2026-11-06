import { muxMp4, muxWebm, type MuxedChunk } from './video-file-muxer';

export type CanvasVideoOptions = {
  canvas: HTMLCanvasElement;
  /** Resolves after the requested frame is drawn into `canvas`. */
  paint: (seconds: number) => void | Promise<void>;
  width: number;
  height: number;
  fps: number;
  format: { mimeType: string; extension: 'mp4' | 'webm' };
  duration: number;
  onProgress?: (fraction: number) => void;
};

// Encodes a canvas animation frame by frame with WebCodecs. Frame i is painted
// at exactly i / fps seconds and stamped with that time, so however long a
// frame takes to render the file plays smoothly at full frame rate. Real-time
// recording drops every frame that renders slower than the frame rate.

type Codec = { codec: string; container: 'mp4' } | { codec: string; container: 'webm' };

const candidates: Record<'mp4' | 'webm', Codec[]> = {
  // Level 5.2 covers every size up to 4K at 60 fps.
  mp4: ['avc1.640034', 'avc1.4d0034', 'avc1.420034'].map((codec) => ({
    codec,
    container: 'mp4' as const,
  })),
  webm: ['vp09.00.51.08', 'vp8'].map((codec) => ({ codec, container: 'webm' as const })),
};

function config({ width, height, fps }: CanvasVideoOptions, { codec, container }: Codec) {
  return {
    codec,
    width,
    height,
    framerate: fps,
    bitrate: Math.round(width * height * fps * 0.12),
    latencyMode: 'quality',
    ...(container === 'mp4' ? { avc: { format: 'avc' } } : {}),
  } as VideoEncoderConfig;
}

/** The first codec this browser can encode at these settings, or null without WebCodecs. */
export async function canvasVideoEncoderCodec(options: CanvasVideoOptions) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  for (const candidate of candidates[options.format.extension]) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config(options, candidate));
      if (supported) return candidate;
    } catch {
      // An unknown codec string throws in some browsers; try the next.
    }
  }
  return null;
}

export async function encodeCanvasVideo(options: CanvasVideoOptions, codec: Codec) {
  const { canvas, paint, width, height, fps, duration, format, onProgress } = options;
  const chunks: MuxedChunk[] = [];
  let description: Uint8Array | undefined;
  let failure: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
      const config = metadata?.decoderConfig?.description;
      if (config && !description) {
        description = ArrayBuffer.isView(config)
          ? new Uint8Array(config.buffer, config.byteOffset, config.byteLength).slice()
          : new Uint8Array(config).slice();
      }
    },
    error: (error) => {
      failure = error instanceof Error ? error : new Error('Video encoding failed.');
    },
  });
  try {
    encoder.configure(config(options, codec));
    const frames = Math.max(1, Math.round(duration * fps));
    const frameLength = 1e6 / fps;
    // A keyframe every two seconds keeps seeking in the file quick.
    const keyEvery = Math.max(1, Math.round(fps * 2));
    for (let index = 0; index < frames; index++) {
      if (failure) throw failure;
      // Frame i covers i/fps up to the next frame, so none lands on the end
      // itself, where a looping background video would already be back at its start.
      await paint(index / fps);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(index * frameLength),
        duration: Math.round(frameLength),
        alpha: 'discard',
      });
      encoder.encode(frame, { keyFrame: index % keyEvery === 0 });
      frame.close();
      // Holds back while the encoder catches up, so memory stays flat.
      while (encoder.encodeQueueSize > 4 && !failure) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      onProgress?.(Math.min(0.95, (index + 1) / frames));
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (!chunks.length) throw new Error('The video encoder produced no frames.');
  const track = { width, height, fps, duration };
  let file: Uint8Array;
  if (codec.container === 'mp4') {
    if (!description) throw new Error('The video encoder gave no H.264 configuration.');
    file = muxMp4(chunks, description, track);
  } else {
    file = muxWebm(chunks, codec.codec === 'vp8' ? 'V_VP8' : 'V_VP9', track);
  }
  onProgress?.(1);
  const type = codec.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([file as BlobPart], { type }), extension: format.extension };
}
