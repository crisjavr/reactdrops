import { render, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { soapBubbleContext } from '../packages/components/src/soap-bubble/soap-bubble-gl';
import {
  soapBubbleColorPresets,
  soapBubblePaletteKeys,
} from '../packages/catalog-ui/src/soap-bubble-color-presets';
import {
  SoapBubbleButton,
  SoapBubbleMaterial,
  type SoapBubbleMaterialProps,
} from '../packages/components/src/soap-bubble';

const transparent = {
  soapColor: 'transparent',
  soapShadeColor: 'transparent',
  soapHighlightColor: 'transparent',
};
const paletteKeys = [
  'soapPaletteRed',
  'soapPaletteGold',
  'soapPaletteGreen',
  'soapPaletteCyan',
  'soapPaletteBlue',
  'soapPaletteViolet',
] as const;
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

async function sample(theme: 'light' | 'dark' = 'dark') {
  const view = (palette: SoapBubbleMaterialProps = {}) => (
    <div data-theme={theme}>
      <SoapBubbleMaterial
        paused
        wobble={0}
        tilt={0}
        maxDpr={1}
        seed={7}
        glass={0.95}
        iridescence={2}
        clearCenter={0}
        oilEdge={0}
        oilEdgeFade={0}
        glintShape="none"
        windowLight={false}
        bottomShade={false}
        {...palette}
      >
        <SoapBubbleButton
          aria-label="Palette sample"
          style={{ width: 128, height: 128, padding: 0 }}
        />
      </SoapBubbleMaterial>
    </div>
  );
  const result = render(view());
  await waitFor(() => expect(result.getByRole('button')).toHaveAttribute('data-soap-bubble-ready'));
  const canvas = result.container.querySelector('canvas')!;
  const pixels = async (palette: SoapBubbleMaterialProps = {}) => {
    result.rerender(view(palette));
    await frames();
    const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    return image.data;
  };
  return { ...result, pixels };
}

function changedPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 15) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
      threshold
    )
      changed++;
  }
  return changed;
}

function hueBands(frame: Uint8ClampedArray) {
  const bands = Array<number>(12).fill(0);
  for (let i = 0; i < frame.length; i += 4) {
    const r = frame[i],
      g = frame[i + 1],
      b = frame[i + 2];
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      chroma = max - min;
    if (frame[i + 3] < 64 || chroma < 8 || max < 32) continue;
    let hue =
      max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
    hue = (hue + 6) % 6;
    bands[Math.floor(hue * 2)]++;
  }
  return bands.filter((count) => count >= 25).length;
}

for (const theme of ['light', 'dark'] as const) {
  it(`gives each colour preset its own oil spectrum independently of Tint in ${theme}`, async () => {
    const { pixels } = await sample(theme);
    const spectra = new Map<string, Uint8ClampedArray>();
    for (const [name, preset] of Object.entries(soapBubbleColorPresets)) {
      if (name === 'original') continue;
      expect(preset.soapPalette).toBe('custom');
      expect(new Set(soapBubblePaletteKeys.map((key) => preset[key])).size).toBe(6);
      // Remove every tint/filter: only the six actual oil colours may change.
      const image = await pixels({ ...preset, ...transparent, tint: 'transparent', filmScale: 6 });
      for (const [otherName, otherImage] of spectra) {
        expect(changedPixels(image, otherImage), `${name} versus ${otherName}`).toBeGreaterThan(
          100,
        );
      }
      spectra.set(name, image);
    }
    const average = (name: string, channel: number) => {
      const image = spectra.get(name)!;
      let sum = 0;
      for (let i = channel; i < image.length; i += 4) sum += image[i];
      return sum / (image.length / 4);
    };
    expect(average('rose', 0) - average('rose', 2)).toBeGreaterThan(
      average('blue', 0) - average('blue', 2),
    );
    expect(average('amber', 0) - average('amber', 2)).toBeGreaterThan(
      average('cyan', 0) - average('cyan', 2),
    );
    expect(average('mint', 1) - average('mint', 0)).toBeGreaterThan(
      average('rose', 1) - average('rose', 0),
    );
    const original = await pixels();
    expect(
      await pixels({ ...soapBubbleColorPresets.blue, ...soapBubbleColorPresets.original }),
    ).toEqual(original);
  });
  it(`keeps the green accent's oil identical to Continue and visible in ${theme}`, async () => {
    const { pixels } = await sample(theme);
    const material = {
      glass: 0.95,
      iridescence: theme === 'light' ? 0.5 : 2,
      filmScale: 4.85,
      thickness: 480,
      drainage: 0.35,
      swirl: 0.5,
      clearCenter: theme === 'light' ? 0.57 : 0.73,
    };
    const optics = () => {
      const { gl, u } = soapBubbleContext()!;
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
      return Object.fromEntries(
        [
          'uGlass',
          'uIridescence',
          'uOilOpacity',
          'uFilmScale',
          'uOilCoverage',
          'uOilFade',
          'uClearCenter',
          'uReflectivity',
          'uThickness',
          'uDrainage',
          'uSwirl',
          'uBevel',
          'uRefraction',
          'uDispersion',
          'uSoapColor',
          'uSoapShadeColor',
          'uSoapHighlightColor',
        ].map((name) => [name, gl.getUniform(program, u[name as keyof typeof u])]),
      );
    };
    await pixels(material);
    const continueOptics = optics();
    const accentMaterial = {
      ...material,
      tint: 'rgb(52 199 89 / 0.92)',
      soapColor: '#ffffff00',
      soapShadeColor: '#ffffff00',
      soapHighlightColor: '#ffffff00',
    };
    const accent = await pixels(accentMaterial);
    expect(optics()).toEqual(continueOptics);
    // The original oil remains visible; it has not been switched off.
    expect(
      changedPixels(accent, await pixels({ ...accentMaterial, oilOpacity: 0 }), 3),
    ).toBeGreaterThan(100);
    const side = Math.sqrt(accent.length / 4);
    let green = 0,
      body = 0;
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        if (Math.hypot(x - side / 2, y - side / 2) > 48) continue;
        const i = (y * side + x) * 4;
        body++;
        if (accent[i + 1] > accent[i] + 30 && accent[i + 1] > accent[i + 2] + 30) green++;
      }
    expect(green / body).toBeGreaterThan(0.9);
    // Explicitly enabling a soap palette can still add its spectral coating.
    expect(
      changedPixels(accent, await pixels({ ...material, tint: accentMaterial.tint })),
    ).toBeGreaterThan(500);
  });
  it(`uses original iridescence by default and restores it after custom colours in ${theme}`, async () => {
    const { pixels } = await sample(theme);
    const original = await pixels();
    const colours = Object.fromEntries(paletteKeys.map((key) => [key, '#ff0000']));
    // Editing a saved custom palette must never alter the default material.
    expect(await pixels(colours)).toEqual(original);
    expect(
      changedPixels(original, await pixels({ ...colours, soapPalette: 'custom' })),
    ).toBeGreaterThan(500);
    expect(await pixels({ ...colours, soapPalette: 'natural' })).toEqual(original);
  });
  it(`keeps multiple soap colours with a colour preset in ${theme}`, async () => {
    const { pixels } = await sample(theme);
    const material = {
      glass: 0.95,
      filmScale: 6,
      thickness: 480,
      drainage: 0.35,
      swirl: 0.5,
      iridescence: theme === 'light' ? 0.5 : 2,
      oilCoverage: theme === 'light' ? 0.73 : 1,
      clearCenter: theme === 'light' ? 0.57 : 0.73,
    };
    const original = hueBands(await pixels(material));
    const preset = hueBands(await pixels({ ...material, tint: '#3b82f64d' }));
    const opaque = hueBands(await pixels({ ...material, tint: '#3b82f6' }));
    expect(original).toBeGreaterThanOrEqual(8);
    expect(preset).toBeGreaterThanOrEqual(8);
    expect(opaque).toBeGreaterThanOrEqual(8);
  });
  it(`preserves the untinted film and applies Tint to the soap itself in ${theme} theme`, async () => {
    const { pixels } = await sample(theme);
    const original = await pixels();
    expect(await pixels(transparent)).toEqual(original);
    const baseOnly = await pixels({ ...transparent, tint: '#3b82f680' });
    const allSoap = await pixels({ tint: '#3b82f680' });
    // Same underlay tint; the gentle spectral filter still changes the film
    // without the old wholesale replacement by one hue.
    expect(changedPixels(baseOnly, allSoap, 3)).toBeGreaterThan(500);
    expect(await pixels()).toEqual(original);
  });

  for (const glass of [0, 0.95]) {
    it(`keeps oil bands over opaque Tint and controls their opacity in ${theme} at glass ${glass}`, async () => {
      const { pixels } = await sample(theme);
      const material = { tint: '#3b82f6', filmScale: 6, glass };
      const clear = await pixels({ ...material, oilOpacity: 0, thickness: 320 });
      // Without oil, changing the film thickness cannot reveal spectral bands.
      expect(await pixels({ ...material, oilOpacity: 0, thickness: 680 })).toEqual(clear);
      const oil = await pixels({ ...material, oilOpacity: 1, thickness: 320 });
      const otherBands = await pixels({ ...material, oilOpacity: 1, thickness: 680 });
      expect(changedPixels(oil, otherBands)).toBeGreaterThan(500);
      expect(changedPixels(clear, oil)).toBeGreaterThan(500);
      const half = await pixels({ ...material, oilOpacity: 0.5, thickness: 320 });
      expect(changedPixels(clear, half)).toBeGreaterThan(100);
      expect(changedPixels(oil, half)).toBeGreaterThan(100);
    });
  }
}

it('edits all six soap hue families separately without colouring a cleared film', async () => {
  const { pixels } = await sample();
  for (const key of paletteKeys) {
    let changes = 0;
    for (const thickness of [200, 480, 900]) {
      const settings = { soapPalette: 'custom' as const, glass: 0, thickness };
      const red = await pixels({ ...settings, [key]: '#ff0000' });
      const blue = await pixels({ ...settings, [key]: '#0000ff' });
      changes += changedPixels(red, blue);
    }
    expect(changes, key).toBeGreaterThan(100);
  }
  const clear = { soapPalette: 'custom' as const, oilOpacity: 0 };
  expect(await pixels({ ...clear, thickness: 200 })).toEqual(
    await pixels({ ...clear, thickness: 900 }),
  );
  const colours = (value: string) => Object.fromEntries(paletteKeys.map((key) => [key, value]));
  const dark = await pixels({ soapPalette: 'custom', ...colours('#1a0b0b') });
  const bright = await pixels({ soapPalette: 'custom', ...colours('#ff7777') });
  const brightness = (frame: Uint8ClampedArray) =>
    frame.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : value), 0);
  expect(brightness(bright) - brightness(dark)).toBeGreaterThan(1000);
});

it('can colour the film, shades and highlights independently of the base tint', async () => {
  const { pixels } = await sample();
  for (const key of ['soapColor', 'soapShadeColor', 'soapHighlightColor'] as const) {
    const material = {
      ...transparent,
      glass: 0,
      bottomShade: key === 'soapShadeColor',
      windowLight: key === 'soapHighlightColor',
    };
    const red = await pixels({ ...material, [key]: '#ff0000' });
    const blue = await pixels({ ...material, [key]: '#0000ff' });
    expect(changedPixels(red, blue), key).toBeGreaterThan(100);
    // Directional RGB changes ensure these are real rendered colours.
    let redChange = 0;
    let blueChange = 0;
    for (let i = 0; i < red.length; i += 4) {
      redChange += red[i] - blue[i];
      blueChange += blue[i + 2] - red[i + 2];
    }
    expect(redChange, key).toBeGreaterThan(1000);
    expect(blueChange, key).toBeGreaterThan(1000);
  }
});
