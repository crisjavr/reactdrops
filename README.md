<div align="center">

<a href="https://reactdrops.dev">
  <img src="https://reactdrops.dev/og-hero-20261013.png" alt="ReactDrops homepage hero: Components that make you stand out." width="100%" />
</a>

<h1>ReactDrops</h1>

<p><strong>Creative React components. New drops every week.</strong></p>

<p>
  WebGL materials, physics, glass refraction and motion — ready to install with the shadcn CLI,<br />
  customizable from the browser, and yours to edit once they land in your project.
</p>

<p>
  <a href="https://github.com/crisjavr/reactdrops/stargazers"><img src="https://img.shields.io/github/stars/crisjavr/reactdrops?style=flat&logo=github&label=Stars&color=111111" alt="GitHub stars" /></a>
  <a href="https://github.com/crisjavr/reactdrops/commits/main"><img src="https://img.shields.io/github/last-commit/crisjavr/reactdrops?style=flat&label=Last%20drop&color=111111" alt="Last commit" /></a>
  <a href="https://reactdrops.dev/components"><img src="https://img.shields.io/badge/components-10-111111?style=flat" alt="10 components" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-ReactDrops%20Component%201.0-111111?style=flat" alt="License" /></a>
</p>
<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/WebGL-2-990000?style=flat&logo=webgl&logoColor=white" alt="WebGL 2" />
  <a href="https://ui.shadcn.com/docs/registry"><img src="https://img.shields.io/badge/shadcn-registry-000000?style=flat&logo=shadcnui&logoColor=white" alt="shadcn registry" /></a>
</p>

<p>
  <a href="https://reactdrops.dev"><strong>Website</strong></a> ·
  <a href="https://reactdrops.dev/components"><strong>Browse components</strong></a> ·
  <a href="#components"><strong>Component list</strong></a> ·
  <a href="#quick-start"><strong>Quick start</strong></a>
</p>

</div>

---

## Why ReactDrops

- **Built to stand out.** Glass, light, physics and motion effects that you won't find in a typical UI kit.
- **Customize before you install.** Every component has a live preview and visual controls on [reactdrops.dev](https://reactdrops.dev/components). The usage snippet updates as you tweak it.
- **Source in your project, not a black box.** The shadcn CLI copies plain `.tsx` and `.css` files into your codebase. Read them, change them, own them.
- **Minimal dependencies.** Most drops need nothing beyond React. Only the orb and the pointer use GSAP.
- **Typed and accessible.** Written in TypeScript, and they respect `prefers-reduced-motion`.

## Quick start

Add any component to a React project with the [shadcn CLI](https://ui.shadcn.com/docs/cli):

```sh
npx shadcn@latest add https://reactdrops.dev/r/refracted-text.json
```

Then use it:

```tsx
import { RefractedText } from './components/refracted-text';

export function Hero() {
  return <RefractedText text="PRO" />;
}
```

> [!TIP]
> Use **reactdrops.dev** (not `.com`) for registry URLs, bookmarks and sign-in. `reactdrops.com` is a secondary domain that redirects to it.

## Components

| Component | Category | Description | Dependencies |
| --- | --- | --- | --- |
| [**Liquid Glass Orb**](https://reactdrops.dev/components/ai/liquid-glass-orb) | AI | A liquid glass orb for AI interfaces with agent states, voice response and six palettes. | `gsap` |
| [**Refracted Text**](https://reactdrops.dev/components/text-effect/refracted-text) | Text Effect | Glass letters with a character lift, a refracted light beam and spectral colors. | — |
| [**Liquid Glass Logo**](https://reactdrops.dev/components/text-reveal/liquid-glass-logo) | Text Reveal | A droplet becomes a glass tile that refracts your logo, then clears to the original. | — |
| [**Chromatic Button**](https://reactdrops.dev/components/button/chromatic-button) | Button | A native button with a living WebGL chromatic material and spherical reflections. | — |
| [**Showcase Pointer**](https://reactdrops.dev/components/cursor/showcase-pointer) | Cursor | Named, colored cursors that hover, press, drag and type over your UI, without triggering real clicks. | `gsap`, `@gsap/react` |
| [**Fan Gallery**](https://reactdrops.dev/components/gallery/fan-gallery) | Gallery | Image cards on a symmetric curve, with spring physics and hover lift. | — |
| [**Fractal Glass**](https://reactdrops.dev/components/image/fractal-glass) | Image | Striped glass refraction with blur, levels, noise and PNG export. | — |
| [**Topographic Terrain**](https://reactdrops.dev/components/background/topographic-terrain) | Background | Animated 3D topographic layers with adjustable camera, material and lighting. | — |
| [**Topographic Flow**](https://reactdrops.dev/components/background/topographic-flow) | Background | Evolving contour lines with elevation gradients and five pointer effects. | — |
| [**Shape Physics**](https://reactdrops.dev/components/background/shape-physics) | Background | 3D characters that fall, pile up, follow the cursor and can be thrown. | — |

<details>
<summary><strong>Install all components</strong></summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json
npx shadcn@latest add https://reactdrops.dev/r/refracted-text.json
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-logo.json
npx shadcn@latest add https://reactdrops.dev/r/chromatic-button.json
npx shadcn@latest add https://reactdrops.dev/r/showcase-pointer.json
npx shadcn@latest add https://reactdrops.dev/r/fan-gallery.json
npx shadcn@latest add https://reactdrops.dev/r/fractal-glass.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json
npx shadcn@latest add https://reactdrops.dev/r/topographic-flow.json
npx shadcn@latest add https://reactdrops.dev/r/shape-physics.json
```

</details>

## Usage

Each example assumes you installed the component with the command shown. Visit the component page for every prop and a live customizer.

<details>
<summary><strong>Liquid Glass Orb</strong>: AI agent states and voice</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json
```

```tsx
import { LiquidGlassOrb } from './components/liquid-glass-orb';

export function Example() {
  return <LiquidGlassOrb state="idle" />;
}
```

- States: `idle`, `listening`, `speaking`, `thinking`, `searching`, `success` and `error`.
- Pass `audioLevel` or `getAudioLevel` to supply a normalized voice level between 0 and 1.
- The default palette is Monochrome, with grain set to `0.3`.
- The orb grows from the center on its first frame (`power4.out`). Set `animateEntrance={false}` to disable this; reduced motion also skips it.
- Installs `liquid-glass-orb.tsx`, `liquid-glass-orb.css` and GSAP.

</details>

<details>
<summary><strong>Refracted Text</strong>: glass lettering with a light beam</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/refracted-text.json
```

```tsx
import { RefractedText } from './components/refracted-text';

export function Example() {
  return <RefractedText text="PRO" />;
}
```

- Customize the material and spectrum with `topColor`, `bottomColor`, `dispersion` and `colorIntensity`.
- The default PRO uses a square O, 2.25% extra bold, 80% height and 1% corner rounding. Typography controls are independent.
- Installs four files, including the original and square-O fonts and their SIL Open Font License.
- Requires WebGL 2. No runtime library beyond React.

</details>

<details>
<summary><strong>Liquid Glass Logo</strong>: a droplet that reveals your logo</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/liquid-glass-logo.json
```

```tsx
import { LiquidGlassLogo } from './components/liquid-glass-logo';

export function Example() {
  return <LiquidGlassLogo logo="/logo.svg" ending="logo" style={{ height: 480 }} />;
}
```

- Supports light and dark themes, custom SVG/PNG logos and background images.
- The catalog demo adds logo and background uploads, glass controls, aspect ratio and resolution choices, and MP4/WebM export at 60 FPS by default. The available video formats depend on the browser.
- Installs four source/style files. No runtime library beyond React.

</details>

<details>
<summary><strong>Chromatic Button</strong>: a WebGL material on a native button</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/chromatic-button.json
```

```tsx
import { ChromaticButton } from './components/chromatic-button';

export function Example() {
  return <ChromaticButton onClick={() => console.log('clicked')}>Get started</ChromaticButton>;
}
```

- A procedural color field projected onto a sphere, with fixed, two-color, three-color or full-spectrum palettes, hover effects and an entrance.
- Installs five source/style files. No runtime library beyond React.

</details>

<details>
<summary><strong>Showcase Pointer</strong>: scripted multiplayer cursors</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/showcase-pointer.json
```

- Animates named, colored cursors over an interface. Labels fade and scale by default.
- Scripted presses call `onCursorPress` for local UI responses, without dispatching real clicks, submitting forms or following links.
- Installs four source/style files and GSAP.

</details>

<details>
<summary><strong>Fan Gallery</strong>: spring-physics image fan</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/fan-gallery.json
```

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

- Cards arrive with spring physics. Hovering or focusing a card lifts it while the fan parts around it.
- Installs six source/style files. No runtime library beyond React.
- Inside this repository the same component is available as `@reactdrops/components/fan-gallery`.

</details>

<details>
<summary><strong>Fractal Glass</strong>: striped glass over any image</summary>

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

- Blur, levels, optical rendering and hover/touch presets.
- The catalog supports custom image uploads, a live miniature while editing, and PNG export.

</details>

<details>
<summary><strong>Topographic Terrain</strong>: 3D contour layers</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json
```

```tsx
import { TopographicTerrain } from './components/topographic-terrain';

export function Example() {
  return <TopographicTerrain height={540} />;
}
```

- Adjustable camera, material and lighting.
- Installs nine source/style files. No runtime library beyond React.

</details>

<details>
<summary><strong>Topographic Flow</strong>: living survey lines</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/topographic-flow.json
```

```tsx
import { TopographicFlow } from './components/topographic-flow';

export function Example() {
  return <TopographicFlow preset="survey" height="100svh" />;
}
```

- Contour lines over a slowly morphing elevation field, with optional elevation gradients and grain.
- The pointer reshapes the contours with `hoverEffect`: `rings` (default), `spread`, `swirl`, `ripple` or `drag`.
- Installs seven source/style files. No runtime library beyond React.

</details>

<details>
<summary><strong>Shape Physics</strong>: playful 3D characters</summary>

```sh
npx shadcn@latest add https://reactdrops.dev/r/shape-physics.json
```

The canvas fills its parent, so give it a height:

```tsx
import { ShapePhysics } from './components/shape-physics';

export function Example() {
  return <ShapePhysics height="100svh" />;
}
```

- Spheres, cones, cubes, clouds, drops and flowers fall in, pile up, follow the cursor and can be dragged and thrown.
- Use `depth="2d"` to keep the figures flat. A ref exposes `replay()`, `clear()`, `addShape()` and `shake()`.
- Installs six source/style files. No runtime library beyond React.

</details>

## Development

Requires Node 22.13–24 and pnpm 11.5.2.

```sh
pnpm install --frozen-lockfile
pnpm dev             # catalog at http://localhost:5173/components
pnpm build
pnpm typecheck
pnpm test
pnpm check:public
pnpm check:packages
```

Run `pnpm registry:build` to regenerate the installable registry files from the component source.

<details>
<summary><strong>Repository layout</strong></summary>

```text
apps/catalog/            Catalog app with previews and customizers
packages/components/     Component source (the source of truth)
packages/catalog-data/   Component metadata, prop schemas and generated source
packages/catalog-ui/     Catalog pages and customizer UI
packages/component-schema/  Shared prop schema types
scripts/                 Registry generation and release checks
```

`public-files.json` lists the reviewed files. The publication check audits working files, staged content and reachable Git history. Run `pnpm release:guard` in a Git clone to install local pre-commit and pre-push checks.

</details>

## Support the project

If ReactDrops helps you ship something that stands out, **[give it a star](https://github.com/crisjavr/reactdrops/stargazers)**. It helps other developers find it and keeps the weekly drops coming.

<a href="https://star-history.com/#crisjavr/reactdrops&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=crisjavr/reactdrops&type=Date&theme=dark" />
    <img src="https://api.star-history.com/svg?repos=crisjavr/reactdrops&type=Date" alt="Star history chart" width="600" />
  </picture>
</a>

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

<div align="center">
<br />
<sub>Made with care by <a href="https://github.com/crisjavr">@crisjavr</a> · <a href="https://reactdrops.dev">reactdrops.dev</a></sub>
</div>
