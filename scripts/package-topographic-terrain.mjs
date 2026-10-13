import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Include the shared terrain engine without releasing Topographic Flow's page
// or React component. Install all modules together so their imports stay local.
const modules = [
  'topographic-terrain/topographic-terrain.tsx',
  'topographic-terrain/topographic-terrain-presets.ts',
  'topographic-terrain/topographic-terrain-renderer.ts',
  'topographic-terrain/topographic-terrain-shaders.ts',
  'topographic-terrain/topographic-terrain.css',
  'topographic-flow/topographic-field.ts',
  'topographic-flow/topographic-renderer.ts',
  'topographic-flow/topographic-surface.ts',
  'topographic-flow/topographic-grain.ts',
];

export async function packageTopographicTerrain(root) {
  return Promise.all(modules.map(async (module) => {
    const name = module.split('/').at(-1);
    const content = (await readFile(resolve(root, 'packages/components/src', module), 'utf8'))
      .replaceAll('../topographic-flow/', './');
    return {
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content,
    };
  }));
}
