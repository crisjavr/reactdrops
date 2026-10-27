import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'multiplayer-cursors.tsx',
  'multiplayer-cursors-motion.ts',
  'cursor-label.tsx',
  'multiplayer-cursors.css',
];

export const multiplayerCursorsUsage = `import { useState } from 'react';
import { MultiplayerCursors } from './components/multiplayer-cursors';

export function Example() {
  const [published, setPublished] = useState(false);
  return (
    <MultiplayerCursors
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
    </MultiplayerCursors>
  );
}`;

export async function packageMultiplayerCursors(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/${name}`,
      target: `@components/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/multiplayer-cursors', name), 'utf8'),
      ),
    })),
  );
}
