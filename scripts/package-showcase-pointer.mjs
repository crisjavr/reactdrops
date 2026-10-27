import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'showcase-pointer.tsx',
  'showcase-pointer-motion.ts',
  'cursor-label.tsx',
  'showcase-pointer.css',
];

export const showcasePointerUsage = `import { useState } from 'react';
import { ShowcasePointer } from './components/showcase-pointer';

export function Example() {
  const [published, setPublished] = useState(false);
  return (
    <ShowcasePointer
      height={420}
      onCursorPress={({ target }) => {
        if (target.closest('#publish')) setPublished(true);
      }}
      onCycle={() => setPublished(false)}
      cursors={[{
        id: 'kubai', name: 'Kubai', color: '#0d99ff',
        script: [
          { action: 'hover', target: '#publish' },
          { action: 'click', target: '#publish' },
          { action: 'say', text: 'Shipped!', duration: 1600 },
          { action: 'wait', duration: 1600 },
        ],
      }]}
    >
      <button id="publish" type="button" onClick={() => setPublished(true)}>
        {published ? 'Published' : 'Publish'}
      </button>
    </ShowcasePointer>
  );
}`;

export async function packageShowcasePointer(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/showcase-pointer', name), 'utf8'),
      ),
    })),
  );
}
