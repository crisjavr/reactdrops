import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'liquid-glass-logo.tsx',
  'liquid-glass-logo-renderer.ts',
  'liquid-glass-logo-shaders.ts',
  'liquid-glass-logo.css',
];

export async function packageLiquidGlassLogo(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/liquid-glass-logo', name), 'utf8'),
      ),
    })),
  );
}
