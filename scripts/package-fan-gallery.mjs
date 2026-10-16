import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

// Bundle the fan component and its shared viewport playback with local imports.
const modules = [
  'fan-gallery/fan-gallery.tsx',
  'fan-gallery/fan-playback.ts',
  'fan-gallery/fan-motion.ts',
  'fan-gallery/fan-layout.ts',
  'fan-gallery/fan-gallery.css',
  'shared/viewport-playback.ts',
];

export async function packageFanGallery(root) {
  return Promise.all(
    modules.map(async (module) => {
      const name = module.split('/').at(-1);
      const content = (
        await readFile(resolve(root, 'packages/components/src', module), 'utf8')
      ).replaceAll('../shared/', './');
      return {
        name,
        path: `components/${name}`,
        target: `@components/${name}`,
        type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
        content: withReactDropsLicense(content),
      };
    }),
  );
}
