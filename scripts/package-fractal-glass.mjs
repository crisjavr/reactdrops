import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'fractal-glass.tsx',
  'fractal-glass-model.ts',
  'fractal-glass-renderer.ts',
  'fractal-glass-shaders.ts',
  'fractal-glass.css',
];

export async function packageFractalGlass(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/fractal-glass', name), 'utf8'),
      ),
    })),
  );
}
