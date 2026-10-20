import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

// The button and its shared chromatic surface install side by side, so the
// surface import is rewritten to a local one.
const modules = [
  'chromatic-button/chromatic-button.tsx',
  'chromatic-button/chromatic-button.css',
  'chromatic-surface/chromatic-surface.tsx',
  'chromatic-surface/chromatic-shaders.ts',
  'chromatic-surface/chromatic-field.ts',
];

export async function packageChromaticButton(root) {
  return Promise.all(
    modules.map(async (module) => {
      const name = module.split('/').at(-1);
      const content = (
        await readFile(resolve(root, 'packages/components/src', module), 'utf8')
      ).replaceAll('../chromatic-surface/', './');
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
