# ReactDrops — Creative React components

Liquid Glass Orb and Topographic Terrain, with source, catalog previews, customizers and a shadcn registry.

[Website](https://reactdrops.dev) · [Browse components](https://reactdrops.dev/components) · [GitHub](https://github.com/crisjavr/reactdrops)

## Install

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json
```

The installer adds `liquid-glass-orb.tsx`, `liquid-glass-orb.css` and GSAP.

```tsx
import { LiquidGlassOrb } from './components/liquid-glass-orb';

export function Example() {
  return <LiquidGlassOrb state="idle" />;
}
```

The default palette is Monochrome, with grain set to `0.3`. Agent states include idle, listening, speaking, thinking, searching, success and error. Use `audioLevel` or `getAudioLevel` to supply a normalized voice level between 0 and 1.

The orb stays empty until its first rendered frame, then grows from the center with `power4.out`. Set `animateEntrance={false}` to disable the entrance. Reduced motion also skips it.

Topographic Terrain renders animated 3D topographic layers with adjustable camera,
material and lighting. Its installer adds nine source/style files and requires no
additional runtime dependencies beyond React.

```tsx
import { TopographicTerrain } from './components/topographic-terrain';

export function Example() {
  return <TopographicTerrain height={540} />;
}
```

## Development

Use Node 22.13–24 and pnpm 11.5.2:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm check:public
pnpm check:packages
```

The catalog is available at `/components`. Run `pnpm registry:build` to regenerate the installable files from the component source.

`public-files.json` lists the reviewed files. The publication check audits working files, staged content and reachable Git history. Run `pnpm release:guard` in a Git clone to install local pre-commit and pre-push checks.
