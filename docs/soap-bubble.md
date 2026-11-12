# Bubble UI

Bubble UI is a set of interface components drawn as soap film in WebGL 2: buttons, round icon buttons, a search field, a menu, a switch and a slider. The film colors come from thin-film interference, the shell mirrors its surroundings and the film jiggles under the pointer. `glass` morphs the same material into liquid glass.

## Installation

```sh
npx shadcn@latest add https://reactdrops.dev/r/soap-bubble.json
```

Installation must match the catalog preview: **Light glass on light pages, Rainbow glass on dark pages**, following the host application's theme. Use another material or color preset only when explicitly selected. Preserve all customized Oil values instead of resetting them to a preset; **0 is intentional**. Color presets start with Oil film at 0 and Oil size at 6, and keep an editable spectrum for when Oil film is enabled.

## Components

`SoapBubbleMaterial` shares material props and the backdrop with every component inside it; each component's own props still win.

```tsx
import { useRef, useState } from 'react';
import {
  SoapBubbleButton,
  SoapBubbleIconButton,
  SoapBubbleMaterial,
  SoapBubbleMenu,
  SoapBubbleSearch,
  SoapBubbleSlider,
  SoapBubbleToggle,
} from './components/soap-bubble';

export function Example() {
  const page = useRef<HTMLDivElement>(null);
  const [wifi, setWifi] = useState(true);
  const [volume, setVolume] = useState(40);
  return (
    <div ref={page}>
      <SoapBubbleMaterial backdrop={page}>
        <header style={{ display: 'flex', gap: '0.55em' }}>
          <SoapBubbleMenu
            round
            label="•••"
            triggerLabel="More"
            items={[{ label: 'Read all', onSelect: readAll }]}
          />
          <SoapBubbleIconButton aria-label="New" tint="rgb(52 199 89 / 0.9)">
            +
          </SoapBubbleIconButton>
        </header>
        <SoapBubbleSearch placeholder="Search" />
        <SoapBubbleToggle checked={wifi} onCheckedChange={setWifi} aria-label="Wi-Fi" />
        <SoapBubbleSlider value={volume} onValueChange={setVolume} label="Volume" />
        <SoapBubbleButton>Continue</SoapBubbleButton>
      </SoapBubbleMaterial>
    </div>
  );
}
```

- `SoapBubbleSurface`: panels, bars and cards. `as` picks the element, `radius` the corners, `interactive` the wobble.
- `SoapBubbleButton`: a pill button sized by its content. Every button swells while pressed.
- `SoapBubbleIconButton`: a round button for one icon; `aria-label` is required. Give it a `tint` for a coloured action.
- `SoapBubbleSearch`: a search input in a bubble pill with a magnifier. It wobbles under the pointer, gentler than a button.
- `SoapBubbleToggle`: `role="switch"`. Its convex thumb magnifies the track beneath it, which fills with `color` as the thumb slides on a spring.
- `SoapBubbleSlider`: a native range input underneath for keyboard and assistive technology. The thumb lenses the `from`→`to` fill and swells while dragged.
- `SoapBubbleMenu`: `role="menu"` with arrow keys and Escape. `round` gives an icon trigger. The trigger swells into the panel with a springy bounce, the actions come into focus inside it, and closing draws it back into the button. The panel starts from the trigger's drawn size (swollen while pressed) and takes over its film, wobble and tilt, and hands them back on closing, so the swap does not show. The active action is shaded. `panelMaterial` overrides the floating panel's material without changing the trigger's, and the open panel answers the pointer passing over it only gently.

The system starts from `soapBubbleSystemDefaults`: the Rainbow glass preset (`glass={0.95}`, `iridescence={2}`, `filmScale={4.85}`), broad oil bands, a narrow bevel and `auto` lighting. It bends the captured page through the film (`refraction={0.55}`). The catalog keeps Light glass on a very light grey page (`#f7f7f8`) and Rainbow glass on black as its defaults. Light glass uses `iridescence={0.5}`, `oilCoverage={0.73}`, `oilEdgeFade={2.33}` and `clearCenter={0.57}`; Rainbow glass has vivid, broad oil bands and `clearCenter={0.73}`. Material preset also offers Liquid glass and Oil. Oil reconstructs the original full-film look from the renderer's baseline: `glass={0}`, `iridescence={2}`, `filmScale={1}`, `oilCoverage={1}`, `oilEdge={0}`, `oilEdgeFade={0}` and `clearCenter={0}`. Each theme remembers its material settings, and Scale sizes every control together. `auto` reads the nearest `data-theme` attribute (or, without one, `prefers-color-scheme`) and uses `soft` light on light pages and the `studio` on dark ones, switching live with the theme. Shadows and the no-WebGL fallback have dark variants too.

All components draw through one shared WebGL context and copy each result into their own canvas, so a page can hold many of them without running out of contexts. In iOS Safari and in Firefox, where that copy reads the buffer back from the GPU, each surface draws in a context of its own instead, up to twelve on a page. Surfaces over the same backdrop share one capture of it. Track colours (switch, slider) are drawn in the shader as a layer, so thumbs refract them without recapturing the page when the value changes.

## Surfaces and presets

`surface` sets what the components are made of:

- `bubble` (the default): the soap film alone. With a `backdrop` it refracts and mirrors a capture of the page.
- `bubble-liquid`: the film over live liquid glass. The glass blurs, saturates, dims and tints the page behind it as the page is, moving and scrolling, and in Chromium bends it at the rim; nothing captures the page, so `backdrop` is left out, and the film draws no body of its own unless a `tint` asks for one.
- `liquid-glass`: that glass alone, with an edge light, an inner light and a shadow of its own and no film or WebGL at all. The switch and slider draw their track, fill and thumb in CSS.

The live glass reads `liquidTint` (strength of its tint, 0–1.5), `liquidDensity` (thin 0 to dense 1), `liquidPanelDensity` (how much denser a menu's panel is, 1–2.6, so its actions stay readable over text), `liquidBlur` (px), `liquidSaturation`, `liquidBrightness` (it dims the page on dark pages and lifts it on light ones), `liquidLens`, `liquidRimWidth` (px, at most a third of the short side), `liquidBend` and `liquidSplit` (how far apart red, green and blue bend; 0 is one pass instead of three). `liquidEdgeLight`, `liquidInnerLight` and `liquidShadow` light Liquid Glass on its own. Its tint is dark on dark pages and white on light ones; a component given its own `tint`, such as a coloured action, keeps that colour, under the film on dark pages and painted by the film alone on light ones. Only Chromium draws the rim lens: it is an SVG displacement map per surface size in `backdrop-filter`, encoded while the page is idle, so a menu's lens arrives a moment after its first opening. Safari and Firefox keep the blur and tint without bending. A surface inside another live glass sees only that glass, so it gets no lens.

The catalog's Preset picks one of four:

- **Bubble Glass**: the defaults above, Light glass and Rainbow glass refracting the captured page.
- **Bubble Liquid**: `surface="bubble-liquid"` with the live glass at its defaults. On dark pages the film takes the tuned rim (`bevel={8}`, `reflectivity={2.45}`, `oilOpacity={0.83}`, `oilEdge={24}`, `oilEdgeFade={0.72}`, `clearCenter={1}`, `keyLight={false}`); on light ones it keeps Light glass, lit over the page's own colour (`paper="#f7f7f8"`), with a narrower, gentler rim lens (`liquidRimWidth={17}`, `liquidBend={0.9}`). There the slider's thumb is dark: that is on purpose.
- **Tuned Glass**: the same tuned film over a dark body (`tint="#000000"`, `opacity={0.89}`), refracting the captured page through a narrow invisible edge (`refraction={0.68}`, `refractionWidth={19}`, `backdropBlur={1}`, `dispersion={0.4}`). On light pages it is clear instead: a white tint with no body and no oil (`tint="#ffffff"`, `opacity={0}`, `oilOpacity={0}`, `clearCenter={0.07}`).
- **Liquid Glass**: `surface="liquid-glass"` with the live glass at its defaults and the page's own tint.

With Bubble Liquid the controls the rim lens replaces (Refraction, Refraction width, Clear edge, Backdrop blur, Dispersion, Mirage and Reach) are hidden; with Liquid Glass every film control is.

`tint` sets the base colour and guides the soap film, shades and highlights on every component. It accepts CSS colours with opacity, for example `tint="#7c3aed40"` for a subtle violet tint. The default `#ffffff00` is transparent and preserves the original spectrum. In the catalog, Tint opens the colour picker; its opacity slider sets the strength. Tint also works with Clear centre and without a captured backdrop, in both themes.

`soapColor`, `soapShadeColor` and `soapHighlightColor` control the interference film, darker film and inner reflection, and reflected light independently. Each defaults to `auto`, which follows Tint including its opacity. The soap uses a gentle colour filter that retains every spectral channel instead of replacing its many colours with one hue. A custom CSS colour changes that filter, and its alpha sets its strength. The film and its reflected spectrum keep their moving rainbow bands in both themes, even with an opaque Tint. Set a channel to `transparent` to retain its original colours even with a tinted base. An explicitly transparent `soapColor` also disables the additional tinted oil coating in natural palette mode, preserving base-only accents. Soap shades also colours the bottom shade when enabled; Soap highlights colours the bevel and window light. These settings also colour the no-WebGL fallback.

Color preset offers Original (transparent), Pearl, Rose, Amber, Lime, Mint, Cyan, Blue and Violet. Each coloured preset sets `tint`, resets the three soap filters to `auto` and loads its own six-colour oil spectrum. Pearl uses opalescent pastels; Rose pinks, corals and mauves; Amber golds and coppers; Lime yellow-greens; Mint greens and soft turquoises; Cyan icy cyans and blues; Blue blues, turquoises and violets; Violet lilacs, purples and pinks. Each retains multiple moving colours instead of applying a flat hue. Soap palette switches to Custom colors so all six loaded colours remain editable; editing one shows Color preset as Custom. Choosing a coloured preset also sets Oil size to 6 for broad bands. Material presets keep their original oil sizes: choosing Light glass or Rainbow glass restores 4.85, Liquid glass 2.5, and Oil 1. Original clears the palette without resetting the chosen oil size or opacity. Changing a colour manually shows Custom. New chat inherits the same oil film, oil opacity, coverage, shades and highlights as Continue. Automatic soap colours resolve from the shared material, as they do on Continue; its own green base does not add an extra oil coating. The original oil stays visible over that green base. Custom soap colours and custom palettes remain available, and a chosen Tint follows the other actions.

`oilOpacity` (Oil opacity, 0–1, default 1) controls the visibility of the oil separately from Tint opacity. At 0 the spectral oil colours disappear; at 1 the moving bands remain visible even over a fully opaque Tint. The outer coating keeps the natural multicolour spectrum and fades in smoothly when a tint is introduced, without changing the untinted material. Oil coverage, Oil edge and Clear centre still define where that coating appears; window lights remain above it.

Soap palette starts at **Original iridescence** (`soapPalette="natural"`) in both themes. It uses the original spectral soap; saved custom colours have no effect in this mode. **Custom colors** (`soapPalette="custom"`) reveals six separate pickers: Soap reds, Soap golds, Soap greens, Soap cyans, Soap blues and Soap violets. Each replaces that family of the film's natural hues, blending smoothly into its neighbours and keeping the same moving bands and optical shading. Each colour's alpha blends it back towards the original spectrum. Returning to Original iridescence restores the natural soap exactly while keeping the custom colours saved for later. Light and dark pages remember their palettes separately. The Original color preset returns Soap palette to Original iridescence; coloured presets load their own editable spectrum. Original remains the default in both themes.

```tsx
<SoapBubbleMaterial
  soapPalette="custom"
  soapPaletteRed="#ff6685"
  soapPaletteGold="#f6d365"
  soapPaletteGreen="#83e8a9"
  soapPaletteCyan="#60dce9"
  soapPaletteBlue="#7799ff"
  soapPaletteViolet="#c084fc"
>
  <SoapBubbleButton>Continue</SoapBubbleButton>
</SoapBubbleMaterial>
```

The custom palette also supplies a static colour gradient for the no-WebGL fallback. Oil opacity still removes its colours at 0; the fallback does not simulate moving spectral bands.

## Optics

The film is air–soapy water (n = 1.333)–air. For every pixel the shader evaluates the two-beam Airy reflectance for s and p polarization at 16 wavelengths between 385 and 715 nm, averaged over each sample's band so thick films wash out the way they do in white light, and integrates the spectrum against the CIE 1931 color matching functions into linear sRGB. Films near 0 nm turn black, 100–500 nm give golds, magentas and blues, and films above about 1.5 µm fade to pale pinks and greens. `iridescence` (Oil film) blends from the colorless incoherent reflectance (0) through the physical result (1) to more saturated bands (above 1).

`thickness` sets the mean film thickness. `filmScale` (Oil size) sets how large the colour bands and swirls are: raise it for broad, calm bands, lower it for fine, busy patches. `oilEdge` (Oil edge) keeps the oil of large components (panels, bars, menus) in a band that many pixels wide along the rim, and `oilEdgeFade` (Oil edge fade, 0–3) sets how strongly their middle is cleared, narrowing the rim band too above 1; `clearCenter` (Clear centre, 0–1) clears oil and reflected haze from the middle at every size, including small buttons, switches and slider thumbs. At 1 the centre is transparent and the rim keeps its oil colours; at 0 the material is unchanged. Its clear region scales with the component and also works with `oilEdge={0}`. `oilCoverage` (Oil coverage) sets how much of the film shows them: at 1 the whole film is iridescent, lower values leave clear film between oil slicks the size of the bands. `drainage` thins the cap and thickens the base the way gravity does, which also lays the bands horizontally. `swirl` adds the Marangoni eddies that drift around the vertical axis and rise as thin patches.

Each pixel sees two mirrors: the outer wall, a convex mirror with an upright image, and the inner back wall, a concave mirror with an inverted image, seen through the front film. Real bubbles are faint (about 4–8 % reflectance at normal incidence); `reflectivity` defaults to 1.6 to keep them legible.

## Backdrop and mirage

`backdrop` is the element behind the bubble (a ref or the element itself). It is rasterized with `html-to-image`, without the bubble, and again whenever its DOM or size changes. With it:

- `mirage` mirrors the objects around the bubble into its rim. Reflected rays that head into the page meet a dome of radius `reach` (in bubble radii) standing on it: a grazing reflection at the rim sees the page right behind it, and the image reaches further out towards the horizon.
- `refraction` bends the light passing through. A real film does not bend light, so 0 is physical; 1 behaves as a ball of water. Rays are traced across the shell to the back wall, so the rim bends strongly, as in a ball lens. As `glass` rises the bending becomes a local rim lens, strongest at the outer edge and nothing on the flat face.
- `refractionWidth` (px at a 16 px font) gives that rim lens a width of its own, so the edge bends with `bevel={0}` and no rim to see; 0 follows the bevel. `refractionClear` clears the tint over it, so what it bends shows through a solid body.
- `backdropBlur` (px at a 16 px font) blurs everything seen through the film.

The capture keeps the scroll offset of every scrolled element inside the backdrop and hides the bubbles' paint rather than their boxes, so nothing below them shifts. Without `backdrop` the canvas is transparent where the film transmits: the live page shows through undistorted and the bubble reflects only its lighting. `paper` (a CSS colour) is then the colour of the page under the film, so it is lit as it would be over a captured one and only what it changes is painted. A backdrop with video or running animations is captured as a still; `surface="bubble-liquid"` reads the live page instead.

`environment` chooses the reflected room: `studio` (dark with softboxes), `window` (a bright room with a large window), `sky`, `soft` (diffuse light for light interfaces, with a bright window that gives the crisp white highlights bubbles are known for: upright near the top left, inverted by the back wall near the bottom right) or `auto`, which follows the page theme. `tilt` turns that room with the pointer so reflections slide like they do around a real bubble.

Two switches add the cartoon lighting of the bubbles in the promo's intro. `windowStyle` picks how the window light sits: `edge` (the default, described here) or `bubble`, the window as it first was, the intro's bean and round glint drawn exactly as before, with the circle it is drawn on wrapped round the control's real outline so it bends with a pill's end and top. `windowSize` and `windowIntensity` set how thick and how bright it is, `windowLength` how far it runs and `windowMargin` how far in from the edge it sits (all 1 by default); `windowBend` (0.6) sets how closely the edge window follows a long control's curve, from 0 straight to 1 hugging the edge. `windowWidth` changes the band's thickness alone, `windowHead` that of its thick left end and `windowTail` that of its far end, from pointed to blunt. `windowGradient` (0.24) sets how much it fades towards its right end, from even at 0 to gone by its tip at 1. The catalog's window settings are slimmer (`windowWidth={0.8}`, `windowHead={0.7}`, `windowTail={0.35}`, `windowIntensity={0.6}`) and longer (`windowLength={1.3}`, `windowMargin={0.85}`, `windowBend={0.75}`), without glint or inner reflection; the window light starts off on both pages, and the bottom shade is off on the light page and on, with a clear colour, on the dark one. The glint past the window has its own controls: `glintShape` (`auto`, `dot`, `dash`, `pair`, `none`; auto varies it per bubble on the edge style and keeps the dot on the bubble style), `glintSize`, `glintIntensity`, and `glintDistance` and `glintHeight` to move it along and in from the edge. `windowLight` adds the window of the promo's intro bubbles: a thick band with round ends, set in from the top-left edge and following it (an arc on a round button, the end and then the top of a pill, a panel's corner), with a small spark past its end. It moves the way light does on a glossy surface: as the pointer turns the room it slides along the edge, keeping to its curve, and draws in or out a little. It also rides the wobble, and it reads as a reflection: crisp towards the rim and melting towards the middle, brightest along its core, with a faint, soft frame bar and the film's oil colours at its edges. The small glint past its end differs from bubble to bubble (a dot, a short dash, a pair of dots or none) and is handed on with the menu's motion. Its inverted twin shows small, faint and blurred on the far wall at the bottom right, seen through the film without frame or glint, which `windowTwin` (Inner reflection) can turn off and `windowTwinShape` reshapes as a `mirror` (the default: both highlights at the top, the window and the long highlight along the top edge, turned round onto the bottom right, fainter), an `arc` (the window blurred), a thin `crescent` near the rim, a short `streak` or a soft `dot`, and both add light to the film rather than covering it. `topFade` (0.4) sets how long the overhead light's highlight along a top edge fades out, from a crisp end at 0. `topLength` (1) sets how far that highlight runs and `topTail` (1) thins that highlight's far end to a point below 1 or keeps it blunt above. The catalog has three reflection presets: Glossy (`windowSize={0.95}`, `windowTail={1.1}`, `windowIntensity={1.3}`, `windowGradient={1}`, `topFade={0.8}`), Soft gradient (the default: `windowSize={0.75}`, `windowTail={0.6}`, `windowIntensity={0.85}`, `windowGradient={0.96}`) and Checkpoint (`windowSize={1}`, `windowTail={0.35}`, `windowIntensity={0.6}`, `windowGradient={0.24}`, `topFade={0}`). `keyLight` (on by default) keeps the room's own key light, the window, softbox or sun behind the original highlight; turn it off to leave only the window light. `bottomShade` adds a soft band along the bottom inside, where the far wall catches the light, measured from each shape's own rounding so it runs along the whole bottom of a pill. It follows the theme: a dark shade on light pages, a light glow on dark ones. `bottomShadeColor` (Shade colour) is `auto` for that, or any CSS colour to tint the band, whose opacity sets its strength.

## Liquid glass

The edge profile follows the analysis of Apple's liquid glass published by Kube (`kube.io/blog/liquid-glass-css-svg`): rays refract by Snell's law through a height profile, and the slope of that profile comes from a central difference. A free film is a circular arc (a sphere for a round bubble). As `glass` rises the arc turns into the squircle `y = ⁴√(1 − (1 − x)⁴)`, which meets the flat face more softly so the bevel reads thinner, and the rays are traced across the shell to the back face. On a rounded rectangle the film bulges in only as far as its corner `radius`, so panels get a pillow edge and circles stay spheres.

`glass` runs from 0 (soap film) to 1 (liquid glass). As it rises the face flattens and the curvature gathers into a bevel around the edge, the film turns into solid glass with Schlick Fresnel reflectance, light through the bevel is refracted (n up to about 1.5 plus `refraction`) and split by `dispersion`, the inverted back-wall image fades and the bevel catches a rim highlight. `iridescence` keeps working as an oily coating on the glass.

## Size

Every proportion scales with the component, so a larger control looks the same, only bigger. The film, the profile, the refraction and the reflections are computed in units of each shape's radius. `bevel` and `radius` are pixels at a 16 px font and grow with the component's text; the switch and slider set that font from `scale`. Shadows are in em for the same reason.

## Motion

The outline vibrates in its l = 2 and l = 3 modes, with frequencies in the Rayleigh–Lamb ratio. Entering, moving across and leaving the bubble excite them; pressing (pointer, Space or Enter) squashes it while conserving volume and releasing makes it rebound. `wobble` (Jiggle in the catalog) scales all of this, and also the swell of a pressed button, the bounce of the opening menu and the overshoot of the switch thumb; at 0 nothing jiggles.

Buttons use the native control's separate press spring: at the catalog's default Jiggle they swell to 1.36 times their short side, keeping the glyph's size and fading it while held. Nearby buttons sharing a backdrop join through a smooth liquid neck as their rims approach; releasing separates them and briefly undershoots the resting size. Pills grow by the same rim distance as round buttons. The menu follows a measured 500 ms opening and 340 ms closing: a brief compression, a fast vertical stretch, horizontal expansion with a small overshoot, and labels that sharpen between 65 and 240 ms. Reversing an unfinished transition carries on from its visible shape. Reduced motion opens and closes immediately and disables press deformation and liquid contact.

`speed` scales the film flow. `paused` holds it; the bubble still wobbles under the pointer. `seed` picks another film pattern.

## Performance

- The spectral integral (16 wavelengths, both polarisations) is computed once into a thickness × angle table on the GPU; each pixel reads it instead of evaluating it.
- The film's swirls read a baked, tiling 3D gradient noise texture instead of hashing gradients per pixel.
- Flat glass faces skip ray tracing, and dispersion samples the backdrop three times only where light actually bends.
- All surfaces share one WebGL context, one backdrop capture per backdrop element and one animation frame. Each frame's draws are packed into one buffer and copied straight from it into their canvases. In Firefox, which reads that buffer back for every copy, each surface draws in a context of its own; an idle page of them went from 30–70 to 120 frames a second there. Past twelve own contexts the rest share one, read back once a frame. Firefox makes at most one new context a frame, as it compiles each one for about 45 ms.
- While only the film drifts every surface redraws on the same 20 frames a second, and only the bubble's own box: the bleed and the switch and slider tracks keep their pixels. The film waits while the page scrolls. Pointer, spring and layout changes draw the whole canvas on the next frame; a pressed button redraws only the buttons close enough to join it.
- Small shapes are shaded with 2 × 2 samples per pixel while that stays cheap, and reflections are filtered over each pixel's footprint, so thin highlights do not break into dashes.
- A GPU that falls behind draws every surface with fewer pixels, never under one per CSS pixel. The shared buffer grows with a quarter to spare and shrinks once the frames of the last seconds need far less.
- A lost WebGL context (a GPU reset, the system switching graphics cards, a tab left in the background for long) leaves every surface showing what it last drew. Once the browser gives the context back the program and textures are made again and every surface is drawn whole; a shared context not given back within three seconds is replaced. Coming back to a hidden tab redraws every surface whole too.
- Surfaces see only the backdrop's one capture, with every bubble hidden in it: nothing else is rasterised for them, so a press, a toggle or a label changing inside a bubble never captures again, and neither does a list scrolling inside one. Only the page itself changing, resizing or scrolling does.
- Opening or closing the menu never touches layout: the panel takes its open size at once, the renderer draws the bubble at its in-between size (`setShape`) and the actions are clipped with compositor transforms. Menus and bursts mutate nothing the backdrop capture watches.
- Each canvas is capped near 0.8 megapixels and by `maxDpr`.

On the reference machine an 800 × 800 px bubble went from 3.4 ms to 1.6 ms of GPU time and a glass panel from 4.2 ms to 1.15 ms, both including about 0.5 ms of measurement overhead.

## Accessibility

With `prefers-reduced-motion: reduce` the film, wobble, press swell and menu morph stay still. With `prefers-reduced-transparency: reduce` or forced colours, live glass becomes a solid surface in its tint, without blur or lens. Rendering stops while a surface is off screen, the menu is closed or the tab is hidden. Without WebGL 2 the components fall back to frosted CSS surfaces and keep working.
