import {
  soapBubbleDefaults,
  type SoapBubbleSettings,
} from '../../components/src/soap-bubble/soap-bubble-renderer';

export const soapBubblePaletteKeys = [
  'soapPaletteRed',
  'soapPaletteGold',
  'soapPaletteGreen',
  'soapPaletteCyan',
  'soapPaletteBlue',
  'soapPaletteViolet',
] as const;

type Spectrum = readonly [string, string, string, string, string, string];
type ColorPreset = Partial<Omit<SoapBubbleSettings, 'maxDpr'>>;

// The track uses the preset's solid hue, independently of the glass tint's alpha.
// Original stays blue in both page themes.
export function soapBubbleSliderColor(tint: string) {
  if (tint === soapBubbleDefaults.tint) return '#0a84ff';
  const hex = tint.match(/^#([\da-f]{6})([\da-f]{2})?$/i);
  return hex ? `#${hex[1]}` : tint;
}

const colorPreset = (tint: string, spectrum?: Spectrum): ColorPreset => ({
  tint,
  soapColor: 'auto',
  soapShadeColor: 'auto',
  soapHighlightColor: 'auto',
  soapPalette: spectrum ? 'custom' : 'natural',
  ...(spectrum && Object.fromEntries(soapBubblePaletteKeys.map((key, i) => [key, spectrum[i]]))),
});

// Each tint carries a complete related spectrum, rather than recolouring
// all wavelengths with one flat hue. Original bypasses these palettes.
export const soapBubbleColorPresets: Record<string, ColorPreset> = {
  original: colorPreset(soapBubbleDefaults.tint),
  pearl: colorPreset('#ffffff30', [
    '#ffd8e8',
    '#fff0bd',
    '#d4f6df',
    '#c9f4ff',
    '#d7d9ff',
    '#edd4ff',
  ]),
  rose: colorPreset('#fb71854d', [
    '#fb7185',
    '#ffb98c',
    '#f4a7a1',
    '#d9a6d9',
    '#b794e8',
    '#e879c1',
  ]),
  amber: colorPreset('#f59e0b4d', [
    '#ed7754',
    '#fbbf24',
    '#e8d16a',
    '#f6b96b',
    '#c87a45',
    '#df9471',
  ]),
  lime: colorPreset('#84cc164d', [
    '#d3bd59',
    '#f1e56a',
    '#a3d84e',
    '#6fd7a1',
    '#9abd70',
    '#d1c878',
  ]),
  mint: colorPreset('#34d3994d', [
    '#b9dca0',
    '#e2edb6',
    '#75dfb1',
    '#5ddbd3',
    '#91c6e8',
    '#c2bfe6',
  ]),
  cyan: colorPreset('#22d3ee4d', [
    '#c4a5e8',
    '#b9e6de',
    '#73dfca',
    '#38d4e8',
    '#639cf0',
    '#a497eb',
  ]),
  blue: colorPreset('#3b82f64d', [
    '#c6a0ef',
    '#9bc7f4',
    '#72d5cf',
    '#5ec5ef',
    '#6485f4',
    '#9b80e5',
  ]),
  violet: colorPreset('#a78bfa4d', [
    '#e494dc',
    '#e7b3d2',
    '#b9a8e6',
    '#9aafea',
    '#8c82eb',
    '#bd7ee0',
  ]),
};
