import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { publishedEntries } from './catalog-manifest.mjs';
import { syncRegistry } from './sync-registry.mjs';
import { packageLiquidGlassOrb } from './package-liquid-glass-orb.mjs';
import { packageTopographicTerrain } from './package-topographic-terrain.mjs';
import { packageFanGallery } from './package-fan-gallery.mjs';
import { packageShapePhysics } from './package-shape-physics.mjs';
import { packageTopographicFlow } from './package-topographic-flow.mjs';
import { packageLiquidGlassLogo } from './package-liquid-glass-logo.mjs';
import { packageChromaticButton } from './package-chromatic-button.mjs';
import { packageFractalGlass } from './package-fractal-glass.mjs';
import { packageRefractedText } from './package-refracted-text.mjs';
import {
  packageMultiplayerCursors,
  multiplayerCursorsUsage,
} from './package-multiplayer-cursors.mjs';
import { licenseName, licenseUrl, syncLicenseFiles } from './registry-license.mjs';
import { componentPath } from '../packages/catalog-data/src/publication.mjs';

const root = resolve(import.meta.dirname, '..');
await syncLicenseFiles(root);
const entries = publishedEntries();
const manifest = JSON.parse(readFileSync(resolve(root, 'public-files.json'), 'utf8'));
assert.deepEqual(
  entries.map(({ metadata }) => metadata.slug).sort(),
  [...manifest.components].sort(),
  'Review the public file allowlist before publishing another component.',
);
const options = await resolveConfig(resolve(root, 'package.json'));
const releases = {
  'multiplayer-cursors': {
    sourceSlug: 'multiplayer-cursors',
    symbol: 'MultiplayerCursors',
    prefix: 'multiplayerCursors',
    package: () => packageMultiplayerCursors(root),
    usage: multiplayerCursorsUsage,
  },
  'refracted-text': {
    sourceSlug: 'refracted-text',
    symbol: 'RefractedText',
    prefix: 'refractedText',
    package: () => packageRefractedText(root),
    element: '<RefractedText text="PRO" />',
  },
  'fractal-glass': {
    sourceSlug: 'fractal-glass',
    symbol: 'FractalGlass',
    prefix: 'fractalGlass',
    package: () => packageFractalGlass(root),
    element: '<FractalGlass src="/your-image.jpg" alt="Your image" height={480} />',
  },
  'liquid-glass-logo': {
    sourceSlug: 'liquid-glass-logo',
    symbol: 'LiquidGlassLogo',
    prefix: 'liquidGlassLogo',
    package: () => packageLiquidGlassLogo(root),
    element: '<LiquidGlassLogo logo="/logo.svg" ending="logo" style={{ height: 480 }} />',
  },
  'liquid-glass-orb': {
    sourceSlug: 'fluid-agent-orb',
    symbol: 'LiquidGlassOrb',
    prefix: 'fluidAgentOrb',
    package: () => packageLiquidGlassOrb(root, options),
  },
  'topographic-terrain': {
    sourceSlug: 'topographic-terrain',
    symbol: 'TopographicTerrain',
    prefix: 'topographicTerrain',
    package: () => packageTopographicTerrain(root),
  },
  'fan-gallery': {
    sourceSlug: 'fan-gallery',
    symbol: 'FanGallery',
    prefix: 'fanGallery',
    package: () => packageFanGallery(root),
  },
  'shape-physics': {
    sourceSlug: 'shape-physics',
    symbol: 'ShapePhysics',
    prefix: 'shapePhysics',
    package: () => packageShapePhysics(root),
    // The canvas fills its parent, so the example gives it a height.
    element: '<ShapePhysics height="100svh" />',
  },
  'topographic-flow': {
    sourceSlug: 'topographic-flow',
    symbol: 'TopographicFlow',
    prefix: 'topographicFlow',
    package: () => packageTopographicFlow(root),
    // The canvas fills its parent, so the example gives it a height.
    element: '<TopographicFlow height="100svh" />',
  },
  'chromatic-button': {
    sourceSlug: 'chromatic-button',
    symbol: 'ChromaticButton',
    prefix: 'chromaticButton',
    package: () => packageChromaticButton(root),
    element: '<ChromaticButton>Get started</ChromaticButton>',
  },
};
for (const { metadata, sourceSlug } of entries) {
  const release = releases[metadata.slug];
  assert.ok(release, `No reviewed package builder for ${metadata.slug}`);
  assert.equal(sourceSlug, release.sourceSlug);
  const files = await release.package();
  const usage =
    release.usage ??
    `import { ${release.symbol} } from './components/${metadata.slug}';\n\nexport function Example() {\n  return ${release.element ?? `<${release.symbol} />`};\n}`;
  const registry = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: metadata.slug,
    title: metadata.name,
    description: metadata.description,
    type: 'registry:ui',
    dependencies: metadata.dependencies,
    files: files.map(({ name, ...file }) => file),
    meta: {
      license: licenseName,
      licenseUrl,
      version: metadata.version,
      access: metadata.access,
      drop: metadata.drop,
      family: metadata.family,
    },
  };
  const outputs = [
    [`registry/${metadata.slug}.json`, JSON.stringify(registry, null, 2) + '\n'],
    [
      `packages/catalog-data/src/generated/${sourceSlug}-source.ts`,
      await format(
        `// Generated by scripts/generate-registry.mjs.\nexport const ${release.prefix}SourceFiles = ${JSON.stringify(files)} as const;\nexport const ${release.prefix}Usage = ${JSON.stringify(usage)};\n`,
        { ...options, parser: 'typescript' },
      ),
    ],
  ];
  for (const [path, content] of outputs) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  console.log(`Generated ${metadata.name}: ${files.length} required implementation files.`);
}
const outputs = [
  [
    'packages/catalog-data/src/generated/published-catalog.ts',
    await format(
      `// Generated by scripts/generate-registry.mjs.\nimport type { ComponentMetadata } from '@reactdrops/component-schema';\nexport const publishedCatalog: ComponentMetadata[] = ${JSON.stringify(entries.map((e) => e.metadata))};\n`,
      { ...options, parser: 'typescript' },
    ),
  ],
  [
    'apps/catalog/src/generated/published-routes.ts',
    await format(
      `// Generated by scripts/generate-registry.mjs.\nimport { lazy } from 'react';\nexport const publishedCatalogRoutes = [${entries.map(({ sourceSlug, metadata }) => `{ path: ${JSON.stringify(componentPath(metadata))}, Page: lazy(() => import('@reactdrops/catalog-ui/pages/${sourceSlug}')) }`).join(',')}];\n`,
      { ...options, parser: 'typescript' },
    ),
  ],
];
for (const [path, content] of outputs) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
await syncRegistry(resolve(root, 'apps/catalog/public/r'));
await syncRegistry(resolve(root, 'apps/catalog/public-release/r'));
