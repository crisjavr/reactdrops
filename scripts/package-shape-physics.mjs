import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

// Every module installs next to the others so the relative imports keep working.
const modules = [
  'shape-physics/shape-physics.tsx',
  'shape-physics/shape-settings.ts',
  'shape-physics/solid-shapes.ts',
  'shape-physics/solid-world.ts',
  'shape-physics/solid-engine.ts',
  'shape-physics/shape-physics.css',
];

export async function packageShapePhysics(root) {
  return Promise.all(
    modules.map(async (module) => {
      const name = module.split('/').at(-1);
      const content = await readFile(resolve(root, 'packages/components/src', module), 'utf8');
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
