import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'glass-slab-logo/index.ts',
  'glass-slab-logo/glass-slab-logo.tsx',
  'glass-slab-logo/glass-slab-logo.css',
  'glass-slab-logo/glass-slab-logo-renderer.ts',
  'glass-slab-logo/glass-slab-logo-shader.ts',
  'glass-slab-logo/glass-slab-logo-slices.ts',
  'glass-slab-logo/glass-slab-logo-prepare.ts',
  'glass-slab-logo/glass-slab-logo-worker.ts',
  'liquid-glass-logo/liquid-glass-logo-video.ts',
  'soap-bubble/soap-bubble-film.ts',
];

export async function packageGlassSlabLogo(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src', name), 'utf8'),
      ),
    })),
  );
}
