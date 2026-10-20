# ReactDrops — Creative React components

Liquid Glass Orb, Topographic Terrain, Topographic Flow, Fan Gallery, Shape Physics and Chromatic Button, with source, catalog previews, customizers and a shadcn registry.

[Website](https://reactdrops.dev) · [Browse components](https://reactdrops.dev/components) · [GitHub](https://github.com/crisjavr/reactdrops)

## Install

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json
npx shadcn@latest add https://reactdrops.dev/r/fan-gallery.json
npx shadcn@latest add https://reactdrops.dev/r/shape-physics.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-flow.json
npx shadcn@latest add https://reactdrops.dev/r/chromatic-button.json
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

Fan Gallery lays image cards on a symmetric curve. Cards arrive with spring
physics, and hovering or focusing a card lifts it while the fan parts around it.
Its installer adds six source/style files and requires no runtime dependencies
beyond React.

```tsx
import { FanGallery } from './components/fan-gallery';

export function Example() {
  return (
    <FanGallery
      items={[
        { src: '/images/one.webp', alt: 'First project' },
        { src: '/images/two.webp', alt: 'Second project', href: '/work/two' },
        { src: '/images/three.webp', alt: 'Third project' },
      ]}
    />
  );
}
```

In this workspace the same component is available as
`import { FanGallery } from '@reactdrops/components/fan-gallery'`.

Topographic Flow draws animated contour lines over a slowly morphing
elevation field, with optional elevation gradients and grain. The pointer
reshapes the contours with one of five effects (`hoverEffect`: rings by
default, spread, swirl, ripple or drag). Its installer adds seven
source/style files and requires no runtime dependencies beyond React.

```tsx
import { TopographicFlow } from './components/topographic-flow';

export function Example() {
  return <TopographicFlow preset="survey" height="100svh" />;
}
```

Chromatic Button is a native button with a living WebGL chromatic material:
a procedural color field projected onto a sphere, with fixed, two-color,
three-color or full-spectrum palettes, hover effects and an entrance. Its
installer adds five source/style files and requires no runtime dependencies
beyond React.

```tsx
import { ChromaticButton } from './components/chromatic-button';

export function Example() {
  return <ChromaticButton onClick={() => console.log('clicked')}>Get started</ChromaticButton>;
}
```

Shape Physics fills a Canvas 2D surface with playful 3D characters (spheres,
cones, cubes, clouds, drops and flowers) that fall in, pile up, follow the cursor
and can be dragged and thrown. Its installer adds six source/style files and
requires no runtime dependencies beyond React. The canvas fills its parent, so
give it a height:

```tsx
import { ShapePhysics } from './components/shape-physics';

export function Example() {
  return <ShapePhysics height="100svh" />;
}
```

Use `depth="2d"` to keep the figures flat. A ref exposes `replay()`, `clear()`,
`addShape()` and `shake()`.

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

## License

ReactDrops source code is available under the [ReactDrops Component License 1.0](LICENSE).
It permits personal and commercial websites, apps, services, and client projects.
It does not permit redistributing the components as a library, UI kit, reusable
template, starter, registry, or code bundle, whether free or paid, without
separate written permission. Modifications remain subject to these conditions.
No visible credit is required in your product's interface.

This is source-available software under a custom license, not an OSI-approved
open-source license. Third-party dependencies and separately identified code
retain their own licenses and required notices. The registry embeds the full
ReactDrops license in each installed source/style file.

The catalog's Fan Gallery demo uses photographs by Mavis Hopper and Julien Moreau
from Unsplash (`apps/catalog/public-release/assets/orbit-tunnel/`) and ReactDrops
artwork (`apps/catalog/public-release/assets/hero-artwork/`). These images are
demo content and are not covered by the ReactDrops software license; replace them with your own
images when you use the component.
