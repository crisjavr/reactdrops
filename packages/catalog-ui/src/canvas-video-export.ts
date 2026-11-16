// Shared canvas recording for synchronous WebGL captures and prepared film frames.
export type CanvasVideoFormat = { mimeType: string; extension: 'mp4' | 'webm' };
export type CanvasVideoOptions = {
  canvas: HTMLCanvasElement;
  /** Resolves after the requested frame is copied into the capture canvas. */
  paint: (seconds: number) => void | Promise<void>;
  width: number;
  height: number;
  fps: number;
  format: CanvasVideoFormat;
  duration: number;
  onProgress?: (fraction: number) => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// H.264 level 5.1 supports 983,040 macroblocks/second; 4K at 60fps needs 5.2.
export function videoRecordingMimeType({
  width,
  height,
  fps,
  format,
}: Pick<CanvasVideoOptions, 'width' | 'height' | 'fps' | 'format'>) {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16) * fps;
  const mimeType =
    format.extension === 'mp4' && macroblocks > 983040
      ? 'video/mp4;codecs=avc1.640034'
      : format.mimeType;
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error(
      `This browser cannot record these ${format.extension.toUpperCase()} settings. Try 30 fps or a lower resolution.`,
    );
  }
  return mimeType;
}

async function verifyVideo(blob: Blob, expectedDuration: number) {
  if (!blob.size) throw new Error('The video recorder produced an empty file.');
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The exported video could not be read.'));
      timeout = setTimeout(
        () => reject(new Error('The exported video could not be verified.')),
        10000,
      );
      video.preload = 'metadata';
      video.src = url;
    });
    // MediaRecorder WebM files may omit duration metadata (Infinity).
    if (Number.isFinite(video.duration) && video.duration < expectedDuration - 0.15) {
      throw new Error('The video recording was cut short. Try 30 fps or a lower resolution.');
    }
  } finally {
    clearTimeout(timeout);
    video.onloadedmetadata = video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function recordCanvasVideo(options: CanvasVideoOptions) {
  const { canvas: frame, paint, fps, format, duration, onProgress } = options;
  const mimeType = videoRecordingMimeType(options);
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let startupTimeout: ReturnType<typeof setTimeout> | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await paint(0);
    stream = frame.captureStream(0);
    let track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (typeof track?.requestFrame !== 'function') {
      // Firefox supports timed canvas capture without the manual requestFrame API.
      stream.getTracks().forEach((item) => item.stop());
      stream = frame.captureStream(fps);
      track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    }
    if (!track) throw new Error('Could not capture the video canvas.');
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.round(options.width * options.height * fps * 0.12),
    });
    const chunks: Blob[] = [];
    let failure: Error | undefined;
    let stopping = false;
    let startReady!: () => void;
    let stopReady!: () => void;
    const started = new Promise<void>((resolve) => {
      startReady = resolve;
    });
    const stopped = new Promise<void>((resolve) => {
      stopReady = resolve;
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstart = () => startReady();
    recorder.onerror = (event) => {
      failure =
        (event as Event & { error?: DOMException }).error ?? new Error('Video recording failed.');
      startReady();
      stopReady();
    };
    recorder.onstop = () => {
      if (!stopping && !failure) failure = new Error('The video recorder stopped unexpectedly.');
      startReady();
      stopReady();
    };
    const check = () => {
      if (failure) throw failure;
    };
    const capture = async (seconds: number) => {
      check();
      await paint(seconds);
      check();
      track.requestFrame?.();
    };
    startupTimeout = setTimeout(() => {
      failure = new Error('The video recorder did not start. Try a lower resolution.');
      startReady();
    }, 15000);
    recorder.start();
    await capture(0);
    // At 4K encoder initialization can take time. Keep the opening frame until
    // the recorder is gathering data, then start the animation clock.
    await started;
    clearTimeout(startupTimeout);
    check();
    const start = performance.now();
    const interval = 1000 / fps;
    let index = 0;
    while (true) {
      const seconds = Math.min(duration, (performance.now() - start) / 1000);
      await capture(seconds);
      onProgress?.(Math.min(0.99, seconds / duration));
      if (seconds >= duration) break;
      index = Math.max(index + 1, Math.floor((performance.now() - start) / interval) + 1);
      await wait(start + index * interval - performance.now());
    }
    // Let the final painted canvas reach the capture/encoder pipeline.
    await wait(Math.max(100, interval * 2));
    check();
    stopping = true;
    recorder.stop();
    await Promise.race([
      stopped,
      new Promise<never>((_, reject) => {
        stopTimeout = setTimeout(
          () => reject(new Error('The video recorder did not finish.')),
          15000,
        );
      }),
    ]);
    check();
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    await verifyVideo(blob, duration);
    onProgress?.(1);
    return { blob, extension: format.extension };
  } finally {
    clearTimeout(startupTimeout);
    clearTimeout(stopTimeout);
    try {
      if (recorder) {
        recorder.onstart = recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }
}
