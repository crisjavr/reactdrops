import { useEffect, useState } from 'react';

export type CanvasImageFormat = 'png' | 'jpeg' | 'webp';
export const canvasImageFormatLabels = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' } as const;

/** Canvas silently substitutes PNG for unsupported encoders, including WebP in WebKit. */
export async function canvasImageFormats(): Promise<CanvasImageFormat[]> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const supported = await Promise.all(
    (['jpeg', 'webp'] as const).map(
      (format) =>
        new Promise<CanvasImageFormat | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 1000);
          try {
            canvas.toBlob((blob) => {
              clearTimeout(timeout);
              resolve(blob?.type === `image/${format}` ? format : null);
            }, `image/${format}`);
          } catch {
            clearTimeout(timeout);
            resolve(null);
          }
        }),
    ),
  );
  return ['png', ...supported.filter((format): format is 'jpeg' | 'webp' => format !== null)];
}

/** Start with the mandatory PNG encoder so SSR and the first client render agree. */
export function useImageExportFormats() {
  const [formats, setFormats] = useState<CanvasImageFormat[]>(['png']);
  useEffect(() => {
    let active = true;
    void canvasImageFormats().then((supported) => {
      if (active) setFormats(supported);
    });
    return () => {
      active = false;
    };
  }, []);
  return formats;
}
