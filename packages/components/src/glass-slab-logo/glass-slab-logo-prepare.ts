import {
  cachePreparedLogo,
  prepareLogoPixels,
  readLogoPixels,
  type LogoCutSettings,
  type LogoPixels,
} from './glass-slab-logo-slices';

function prepareInWorker(pixels: LogoPixels, settings: LogoCutSettings, signal: AbortSignal) {
  const worker = new Worker(new URL('./glass-slab-logo-worker.ts', import.meta.url), {
    type: 'module',
  });
  let abort!: () => void;
  const result = new Promise<ReturnType<typeof prepareLogoPixels>>((resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event) => resolve(event.data);
    worker.onerror = reject;
    worker.onmessageerror = reject;
    worker.postMessage({ pixels, settings }, [pixels.data.buffer]);
  });
  return result.finally(() => {
    signal.removeEventListener('abort', abort);
    worker.terminate();
  });
}

/** Prepare an uploaded logo before replacing the current preview. */
export async function prepareGlassSlabLogoUpload(
  source: string,
  settings: LogoCutSettings,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const pixels = await readLogoPixels(source);
  signal.throwIfAborted();
  if (!pixels) return null;
  let prepared: ReturnType<typeof prepareLogoPixels>;
  try {
    prepared = await prepareInWorker(pixels, settings, signal);
  } catch {
    signal.throwIfAborted();
    const retry = pixels.data.byteLength ? pixels : await readLogoPixels(source);
    signal.throwIfAborted();
    prepared = retry ? prepareLogoPixels(retry, settings) : null;
  }
  signal.throwIfAborted();
  if (!prepared) return null;
  const { coverage, options, layout } = prepared;
  cachePreparedLogo(source, coverage, options, layout);
  return options.slabs;
}
