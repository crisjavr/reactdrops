# ReactDrops — Creative React components

Liquid Glass Orb, Topographic Terrain, Topographic Flow, Fan Gallery, Shape Physics, Chromatic Button, Liquid Glass Logo, Fractal Glass and Refracted Text, with source, catalog previews, customizers and a shadcn registry.

[Website](https://reactdrops.dev) · [Browse components](https://reactdrops.dev/components) · [GitHub](https://github.com/crisjavr/reactdrops)

The primary website and authentication domain is **reactdrops.dev**;
`reactdrops.com` is a secondary domain. Use `.dev` for bookmarks, sign-in and
registry installation URLs.

## Install

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json
npx shadcn@latest add https://reactdrops.dev/r/fan-gallery.json
npx shadcn@latest add https://reactdrops.dev/r/shape-physics.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-flow.json
npx shadcn@latest add https://reactdrops.dev/r/chromatic-button.json
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-logo.json
npx shadcn@latest add https://reactdrops.dev/r/refracted-text.json
npx shadcn@latest add https://reactdrops.dev/r/multiplayer-cursors.json
```

Multiplayer Cursors animates named, colored cursors over an interface. Labels use
fade and scale by default. Scripted presses call `onCursorPress` for local UI
responses without dispatching real clicks, submitting forms or following links.
Its installer includes four source/style files and GSAP.

Refracted Text renders glass lettering with a character lift and a refracted light
beam. Set `topColor`, `bottomColor`, `dispersion` and `colorIntensity` to customize
the material and spectrum. The default PRO uses a square O, 2.25% extra bold,
80% height and 1% corner rounding, with independent typography controls. Its four
installation files include the original and square-O fonts and their
SIL Open Font License; it requires React and WebGL 2, with no extra runtime library.

```tsx
import { RefractedText } from './components/refracted-text';

export function Example() {
  return <RefractedText text="PRO" />;
}
```

The Liquid Glass Orb installer adds `liquid-glass-orb.tsx`, `liquid-glass-orb.css` and GSAP.

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

Liquid Glass Logo turns a droplet into a glass tile that refracts a logo through
its chromatic bevel before clearing to the original image. It supports light and
dark themes, custom SVG/PNG logos and background images. Its installer adds four
source/style files and requires no runtime dependencies beyond React.

```tsx
import { LiquidGlassLogo } from './components/liquid-glass-logo';

export function Example() {
  return <LiquidGlassLogo logo="/logo.svg" ending="logo" style={{ height: 480 }} />;
}
```

The catalog demo includes logo and background uploads, glass controls, aspect
ratio and resolution choices, and MP4/WebM video export at 60 FPS by default.
Available video formats depend on the browser.

Fractal Glass refracts an image through striped glass, with blur, levels,
optical rendering and hover/touch presets. Its catalog supports custom image
uploads, a live miniature while editing, and PNG export of the current image.

```sh
npx shadcn@latest add https://reactdrops.dev/r/fractal-glass.json
```

```tsx
import { useRef } from 'react';
import { FractalGlass, type FractalGlassHandle } from './components/fractal-glass';

export function Example() {
  const glass = useRef<FractalGlassHandle>(null);
  // Call await glass.current?.exportImage() to obtain a PNG Blob of the current frame.
  return <FractalGlass ref={glass} src="/your-image.jpg" alt="Your image" height={480} />;
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
