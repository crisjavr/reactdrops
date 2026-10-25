import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'refracted-text.tsx',
  'refracted-renderer.ts',
  'refracted-glyph-rounding.ts',
  'refracted-text.css',
];

export async function packageRefractedText(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/refracted-text', name), 'utf8'),
      ),
    })),
  );
}
