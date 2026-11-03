import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withReactDropsLicense } from './registry-license.mjs';

const modules = [
  'index.ts',
  'soap-bubble-system.tsx',
  'use-soap-bubble.tsx',
  'soap-bubble-renderer.ts',
  'soap-bubble-motion.ts',
  'soap-bubble-gl.ts',
  'soap-bubble-shaders.ts',
  'soap-bubble.css',
];

// The host application supplies its theme. Explicit edits to material override
// these catalog defaults, including Oil film (iridescence) set to zero.
export const soapBubbleUsage = `import { useRef } from 'react';
import { SoapBubbleButton, SoapBubbleMaterial } from './components/soap-bubble';

export function Example({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const page = useRef<HTMLDivElement>(null);
  const material = theme === 'dark'
    ? { iridescence: 2, oilCoverage: 1, oilEdgeFade: 1, clearCenter: 0.73,
        bottomShade: true, bottomShadeColor: '#ffffff00' }
    : { iridescence: 0.5, oilCoverage: 0.73, oilEdgeFade: 2.33, clearCenter: 0.57,
        bottomShade: false, bottomShadeColor: '#ffffff' };
  return (
    <div ref={page} data-theme={theme} style={{ display: 'grid', placeItems: 'center',
      minHeight: 420, background: theme === 'dark' ? '#000' : '#f7f7f8',
      color: theme === 'dark' ? '#f2f3f7' : '#1b1d22' }}>
      <SoapBubbleMaterial backdrop={page}
        glass={0.95} filmScale={4.85} oilOpacity={1} oilEdge={18}
        thickness={480} drainage={0.35} swirl={0.5} reflectivity={1.3}
        refraction={0.15} dispersion={1} bevel={14} environment="auto"
        windowLight={false} windowStyle="edge" windowWidth={0.8} windowHead={0.7}
        windowLength={1.3} windowMargin={0.85} windowBend={0.75}
        windowSize={0.75} windowTail={0.6} windowIntensity={0.85} windowGradient={0.96}
        glintShape="auto" glintSize={1.65} glintIntensity={0} glintDistance={-0.45}
        glintHeight={0.65} windowTwin={false} windowTwinShape="mirror" keyLight
        topFade={0.4} topTail={1} topLength={1} {...material}>
        <SoapBubbleButton>Continue</SoapBubbleButton>
      </SoapBubbleMaterial>
    </div>
  );
}`;

export async function packageSoapBubble(root) {
  return Promise.all(
    modules.map(async (name) => ({
      name,
      path: `components/soap-bubble/${name}`,
      target: `@components/soap-bubble/${name}`,
      type: name.endsWith('.ts') ? 'registry:lib' : 'registry:ui',
      content: withReactDropsLicense(
        await readFile(resolve(root, 'packages/components/src/soap-bubble', name), 'utf8'),
      ),
    })),
  );
}
