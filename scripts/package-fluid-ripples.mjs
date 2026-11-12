import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

// FluidTyping installs with the FluidRipples surface, renderer and shaders it draws on.
const modules = [
  'fluid-ripples.tsx',
  'fluid-ripples-renderer.ts',
  'fluid-ripples-shaders.ts',
  'fluid-ripples.css',
  'fluid-ripples-field.ts',
  'fluid-typing.tsx',
  'fluid-typing.css',
];

export const fluidRipplesUsage = `import { FluidTyping } from './components/fluid-typing';

export function Example() {
  return <FluidTyping text={['Text over a fluid background.', 'Animated with React Drops.']} />;
}`;

export async function packageFluidRipples(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/fluid-ripples', name), 'utf8'),
      ),
    })),
  );
}
