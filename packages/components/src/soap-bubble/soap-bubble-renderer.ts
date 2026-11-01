import {
  cancelSoapBubbleFrame,
  frameRect,
  isFilmFrame,
  onSoapBubbleResolution,
  requestSoapBubbleFrame,
  soapBubbleResolution,
  backdropTexture,
  coveredTexture,
  releaseSoapBubbleOwnContext,
  soapBubbleContext,
  soapBubbleOwnContext,
  subscribeBackdrop,
  wantCoveredBackdrop,
  type SoapBubbleBackdrop,
  type SoapBubbleRect,
} from './soap-bubble-gl';

export const soapBubbleEnvironments = ['studio', 'window', 'sky', 'soft'] as const;
export type SoapBubbleEnvironment = (typeof soapBubbleEnvironments)[number];
/** Lighting choices, including auto: soft light on light pages, the studio on dark ones. */
export const soapBubbleLightings = [...soapBubbleEnvironments, 'auto'] as const;
export type SoapBubbleLighting = (typeof soapBubbleLightings)[number];
/** How the window light sits: along the edge, or as the intro's bubble window. */
export const soapBubbleWindowStyles = ['edge', 'bubble'] as const;
export type SoapBubbleWindowStyle = (typeof soapBubbleWindowStyles)[number];
/** Shapes of the glint past the window light; auto varies it per bubble. */
export const soapBubbleGlintShapes = ['auto', 'dot', 'dash', 'pair', 'none'] as const;
export type SoapBubbleGlintShape = (typeof soapBubbleGlintShapes)[number];
/** Shapes the window light's inverted twin can take. */
export const soapBubbleTwinShapes = ['arc', 'crescent', 'streak', 'dot', 'mirror'] as const;
export type SoapBubbleTwinShape = (typeof soapBubbleTwinShapes)[number];

export type SoapBubbleTuning = {
  /** Corner radius in pixels at a 16 px font; it grows with the text. Large values give fully round ends. */
  radius: number;
  /** Width of the liquid glass bevel in pixels at a 16 px font; it grows with the text. */
  bevel: number;
  /** Mean film thickness in nanometres. */
  thickness: number;
  /** Strength of the oil-like interference colours; 1 is physical. */
  iridescence: number;
  /** How much gravity has drained the cap thin and the base thick. */
  drainage: number;
  /** Marangoni swirls stirring the film. */
  swirl: number;
  /** Size of the film's colour bands; larger values give broader, calmer bands. */
  filmScale: number;
  /** Opacity of the oil colours, independent of the base tint's alpha. */
  oilOpacity: number;
  /** Share of the film showing oil colours; below 1 leaves clear film between slicks. */
  oilCoverage: number;
  /**
   * On large components (longer than about 10 em), how far in from the rim
   * the oil reaches, in pixels at a 16 px font, so their middle stays clear.
   * Small controls keep oil all over. 0 shows oil everywhere.
   */
  oilEdge: number;
  /** How strongly large components clear the oil from their middle: 0 not at all, 1 fully; above 1 the rim band narrows too (2 is half as wide). */
  oilEdgeFade: number;
  /** Clear oil and reflected haze from the centre at any size: 1 leaves a transparent middle and an oily rim. */
  clearCenter: number;
  /** Base colour; also guides the soap, shades and highlights set to auto. */
  /**
   * Colour of the body; Opacity sets how solid. Auto is the page's own,
   * white on light pages and black on dark ones.
   */
  tint: string;
  /** Gentle colour filter for the multicolour film; auto and transparent leave it unchanged. */
  soapColor: string;
  /** Natural spectral colours by default, or six editable hue families. */
  soapPalette: 'natural' | 'custom';
  soapPaletteRed: string;
  soapPaletteGold: string;
  soapPaletteGreen: string;
  soapPaletteCyan: string;
  soapPaletteBlue: string;
  soapPaletteViolet: string;
  /** Colour and strength of the darker film and bottom shade; auto leaves them unchanged. */
  soapShadeColor: string;
  /** Colour and strength of reflected light, bevel and window; auto leaves them unchanged. */
  soapHighlightColor: string;
  /** Film reflectance multiplier; 1 is soapy water. */
  reflectivity: number;
  /** Reflections of the nearby page in the rim of the bubble. */
  mirage: number;
  /**
   * How much of the bubbles behind this one show through its film, which
   * the backdrop leaves out. 0 shows the backdrop alone.
   */
  seeThrough: number;
  /** How far those bubbles bend, in multiples of the backdrop's refraction. */
  seeThroughBend: number;
  /**
   * How solid the tint fills the bubble, over the tint's own alpha: 1 is an
   * opaque body, 0 none. Below 0 (the default) the tint's alpha is used.
   */
  opacity: number;
  /** The studio's bounce light from below, a pale crescent along the lower rim; 0 removes it. */
  floorLight: number;
  /** The reflection at the top drawn as a large cartoon window and spark that follow the pointer. */
  windowLight: boolean;
  /** edge follows the shape's top-left edge; bubble is the intro's bean in its rounding, as it first was. */
  windowStyle: SoapBubbleWindowStyle;
  /** How far the window light runs; 1 as drawn. */
  windowLength: number;
  /** How far in from the edge it sits; 1 as drawn. */
  windowMargin: number;
  /** On long shapes, how closely the edge window follows the curve: 0 straight, 1 the edge. */
  windowBend: number;
  /** Thickness of the window light and its glint; 1 as drawn. */
  windowSize: number;
  /** Thickness of the window band alone; 1 as drawn. */
  windowWidth: number;
  /** How long the overhead light's highlight along a top edge fades out; 0 ends it crisply. */
  topFade: number;
  /** How that highlight's far end thins to a point (below 1) or stays blunt; 1 as drawn. */
  topTail: number;
  /** How far that highlight runs along the top edge; 1 as drawn. */
  topLength: number;
  /** How much the window fades towards its right end: 0 even, 1 out by its tip; 0.24 as drawn. */
  windowGradient: number;
  /** Thickness of the window's thick left end against the rest; 1 as drawn. */
  windowHead: number;
  /** Thickness of the window's far end: low is pointed, high is blunt; 1 as drawn. */
  windowTail: number;
  /** Shape of the glint past the window; auto varies it per bubble on the edge style. */
  glintShape: SoapBubbleGlintShape;
  /** Size of the glint; 1 as drawn. */
  glintSize: number;
  /** Brightness of the glint; 1 as drawn. */
  glintIntensity: number;
  /** How far past the window the glint sits; 0 as drawn. */
  glintDistance: number;
  /** How far in from the edge the glint sits; 0 as drawn, negative towards the rim. */
  glintHeight: number;
  /** Brightness of the window light and its twin; 1 as drawn. */
  windowIntensity: number;
  /** The window's faint inverted twin on the far wall, at the bottom right. */
  windowTwin: boolean;
  /** Shape of that twin. */
  windowTwinShape: SoapBubbleTwinShape;
  /** The room's key light (the window, the softbox or the sun) and its reflection. */
  keyLight: boolean;
  /** A soft band along the bottom inside: a shade on light pages, a glow on dark ones. */
  bottomShade: boolean;
  /** Colour of that band; auto follows the theme. Its opacity sets the strength. */
  bottomShadeColor: string;
  /** How far around the bubble the mirrored surroundings reach, in radii. */
  reach: number;
  /** Bends the light passing through; 0 is a true thin film. */
  refraction: number;
  /** Morphs the soap film into liquid glass: 0 is a bubble, 1 a glass lens. */
  glass: number;
  /** Colour split of light refracted by the glass. */
  dispersion: number;
  environment: SoapBubbleEnvironment;
  /** Pointer parallax of the reflected room. */
  tilt: number;
  /** Jiggle on hover and press. */
  wobble: number;
  speed: number;
  paused: boolean;
  seed: number;
  maxDpr: number;
};

export const soapBubbleDefaults: SoapBubbleTuning = {
  radius: 9999,
  bevel: 24,
  thickness: 520,
  iridescence: 1,
  drainage: 0.6,
  swirl: 0.65,
  filmScale: 1,
  oilOpacity: 1,
  oilCoverage: 1,
  oilEdge: 0,
  oilEdgeFade: 1,
  clearCenter: 0,
  tint: '#ffffff00',
  soapColor: 'auto',
  soapPalette: 'natural',
  soapPaletteRed: '#ff6685',
  soapPaletteGold: '#f6d365',
  soapPaletteGreen: '#83e8a9',
  soapPaletteCyan: '#60dce9',
  soapPaletteBlue: '#7799ff',
  soapPaletteViolet: '#c084fc',
  soapShadeColor: 'auto',
  soapHighlightColor: 'auto',
  reflectivity: 1.6,
  mirage: 1,
  seeThrough: 0,
  seeThroughBend: 0.3,
  opacity: -1,
  floorLight: 1,
  windowLight: false,
  windowStyle: 'edge',
  windowLength: 1,
  windowMargin: 1,
  windowBend: 0.6,
  windowSize: 1,
  windowWidth: 1,
  windowGradient: 0.24,
  topFade: 0.4,
  topTail: 1,
  topLength: 1,
  windowHead: 1,
  windowTail: 1,
  glintShape: 'auto',
  glintSize: 1,
  glintIntensity: 1,
  glintDistance: 0,
  glintHeight: 0,
  windowIntensity: 1,
  windowTwin: true,
  windowTwinShape: 'mirror',
  keyLight: true,
  bottomShade: false,
  bottomShadeColor: 'auto',
  reach: 2.6,
  refraction: 0.08,
  glass: 0,
  dispersion: 1,
  environment: 'studio',
  tilt: 1,
  wobble: 1,
  speed: 1,
  paused: false,
  seed: 7,
  maxDpr: 2,
};

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

/** Tuning as components accept it: lighting may still be auto. */
export type SoapBubbleSettings = Omit<SoapBubbleTuning, 'environment'> & {
  environment: SoapBubbleLighting;
};

const soapPaletteKeys = [
  'soapPaletteRed',
  'soapPaletteGold',
  'soapPaletteGreen',
  'soapPaletteCyan',
  'soapPaletteBlue',
  'soapPaletteViolet',
] as const;
const soapPaletteUniforms = [
  'uSoapPaletteRed',
  'uSoapPaletteGold',
  'uSoapPaletteGreen',
  'uSoapPaletteCyan',
  'uSoapPaletteBlue',
  'uSoapPaletteViolet',
] as const;

export function normalizeSoapBubble(value: Partial<SoapBubbleTuning>): SoapBubbleTuning {
  const d = soapBubbleDefaults;
  const v = { ...d, ...value };
  return {
    radius: clamp(v.radius, 0, 9999, d.radius),
    bevel: clamp(v.bevel, 2, 200, d.bevel),
    thickness: clamp(v.thickness, 0, 2400, d.thickness),
    iridescence: clamp(v.iridescence, 0, 3, d.iridescence),
    drainage: clamp(v.drainage, 0, 1, d.drainage),
    swirl: clamp(v.swirl, 0, 1, d.swirl),
    filmScale: clamp(v.filmScale, 0.2, 6, d.filmScale),
    oilOpacity: clamp(v.oilOpacity, 0, 1, d.oilOpacity),
    oilCoverage: clamp(v.oilCoverage, 0, 1, d.oilCoverage),
    oilEdge: clamp(v.oilEdge, 0, 400, d.oilEdge),
    oilEdgeFade: clamp(v.oilEdgeFade, 0, 3, d.oilEdgeFade),
    clearCenter: clamp(v.clearCenter, 0, 1, d.clearCenter),
    tint: typeof v.tint === 'string' && v.tint.trim() ? v.tint : d.tint,
    soapColor: typeof v.soapColor === 'string' && v.soapColor.trim() ? v.soapColor : d.soapColor,
    soapPalette: v.soapPalette === 'custom' ? 'custom' : 'natural',
    ...(Object.fromEntries(
      soapPaletteKeys.map((key) => [
        key,
        typeof v[key] === 'string' && v[key].trim() ? v[key] : d[key],
      ]),
    ) as Pick<SoapBubbleTuning, (typeof soapPaletteKeys)[number]>),
    soapShadeColor:
      typeof v.soapShadeColor === 'string' && v.soapShadeColor.trim()
        ? v.soapShadeColor
        : d.soapShadeColor,
    soapHighlightColor:
      typeof v.soapHighlightColor === 'string' && v.soapHighlightColor.trim()
        ? v.soapHighlightColor
        : d.soapHighlightColor,
    reflectivity: clamp(v.reflectivity, 0, 6, d.reflectivity),
    mirage: clamp(v.mirage, 0, 3, d.mirage),
    seeThrough: clamp(v.seeThrough, 0, 1, d.seeThrough),
    seeThroughBend: clamp(v.seeThroughBend, 0, 2, d.seeThroughBend),
    opacity: clamp(v.opacity, -1, 1, d.opacity),
    floorLight: clamp(v.floorLight, 0, 1, d.floorLight),
    windowLight: Boolean(v.windowLight),
    windowStyle: soapBubbleWindowStyles.includes(v.windowStyle) ? v.windowStyle : d.windowStyle,
    windowLength: clamp(v.windowLength, 0.3, 2, d.windowLength),
    windowMargin: clamp(v.windowMargin, 0.4, 2.2, d.windowMargin),
    windowBend: clamp(v.windowBend, 0, 1, d.windowBend),
    windowSize: clamp(v.windowSize, 0.4, 2, d.windowSize),
    windowWidth: clamp(v.windowWidth, 0.3, 2.5, d.windowWidth),
    windowGradient: clamp(v.windowGradient, 0, 1, d.windowGradient),
    topFade: clamp(v.topFade, 0, 1, d.topFade),
    topTail: clamp(v.topTail, 0.05, 2, d.topTail),
    topLength: clamp(v.topLength, 0.2, 2.5, d.topLength),
    windowHead: clamp(v.windowHead, 0.3, 2, d.windowHead),
    windowTail: clamp(v.windowTail, 0.05, 2.5, d.windowTail),
    glintShape: soapBubbleGlintShapes.includes(v.glintShape) ? v.glintShape : d.glintShape,
    glintSize: clamp(v.glintSize, 0, 3, d.glintSize),
    glintIntensity: clamp(v.glintIntensity, 0, 2, d.glintIntensity),
    glintDistance: clamp(v.glintDistance, -1, 2, d.glintDistance),
    glintHeight: clamp(v.glintHeight, -1.5, 1.5, d.glintHeight),
    windowIntensity: clamp(v.windowIntensity, 0, 2, d.windowIntensity),
    windowTwin: v.windowTwin !== false,
    windowTwinShape: soapBubbleTwinShapes.includes(v.windowTwinShape)
      ? v.windowTwinShape
      : d.windowTwinShape,
    keyLight: v.keyLight !== false,
    bottomShade: Boolean(v.bottomShade),
    bottomShadeColor:
      typeof v.bottomShadeColor === 'string' && v.bottomShadeColor.trim()
        ? v.bottomShadeColor
        : d.bottomShadeColor,
    reach: clamp(v.reach, 0.5, 8, d.reach),
    refraction: clamp(v.refraction, 0, 1, d.refraction),
    glass: clamp(v.glass, 0, 1, d.glass),
    dispersion: clamp(v.dispersion, 0, 3, d.dispersion),
    environment: soapBubbleEnvironments.includes(v.environment) ? v.environment : d.environment,
    tilt: clamp(v.tilt, 0, 2, d.tilt),
    wobble: clamp(v.wobble, 0, 3, d.wobble),
    speed: clamp(v.speed, 0, 4, d.speed),
    paused: Boolean(v.paused),
    seed: clamp(v.seed, 0, 9999, d.seed),
    maxDpr: clamp(v.maxDpr, 0.5, 3, d.maxDpr),
  };
}

/** Damped oscillator for one component of a shape mode. */
type Mode = { value: number; velocity: number };

/** Everything that moves in a bubble's look, apart from its box. */
export type SoapBubbleMotion = {
  time: number;
  /** Which small glint the window light shows. */
  spark: number;
  flow: number;
  modes: Mode[];
  squash: Mode;
  tilt: [number, number];
};

/**
 * A flat coloured layer drawn under the bubble, such as a switch or slider
 * track, in CSS pixels from the canvas's top left. Colours are CSS colours.
 */
export type SoapBubbleLayer = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  /** Where the fill ends, as a fraction of the width. */
  fill: number;
  track: string;
  from: string;
  to?: string;
};

export type SoapBubbleRenderer = {
  update: (tuning: SoapBubbleTuning) => void;
  setBackdrop: (element: HTMLElement | null) => void;
  setLayer: (layer: SoapBubbleLayer | null) => void;
  setLightTheme: (light: boolean) => void;
  /** Draw now, for example after the bubble moved. */
  invalidate: () => void;
  pointer: (x: number, y: number, inside: boolean) => void;
  press: (pressed: boolean) => void;
  /** Excite the same fluid modes as the pointer, without moving the element. */
  rebound: () => void;
  /**
   * Draw the bubble as this box (CSS pixels from the host's top left)
   * instead of the host's own, and draw it now. A bubble that grows or
   * shrinks this way never touches layout; null returns to the host's box.
   */
  setShape: (shape: SoapBubbleRect | null) => void;
  /** The film's clock, wobble and tilt, for another bubble to carry on. */
  motion: () => SoapBubbleMotion;
  /**
   * Take over another bubble's motion, so one bubble can stand in for
   * another (a menu panel for its trigger) without its film jumping.
   */
  adopt: (motion: SoapBubbleMotion) => void;
  dispose: () => void;
};

let colourProbe: CanvasRenderingContext2D | null = null;
const colourCache = new Map<string, [number, number, number, number]>();
// Straight RGBA in 0–1 for any CSS colour.
function cssColour(value: string): [number, number, number, number] {
  const cached = colourCache.get(value);
  if (cached) return cached;
  colourProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!colourProbe) return [0, 0, 0, 0];
  colourProbe.clearRect(0, 0, 1, 1);
  colourProbe.fillStyle = '#000';
  colourProbe.fillStyle = value;
  colourProbe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colourProbe.getImageData(0, 0, 1, 1).data;
  const result: [number, number, number, number] = [r / 255, g / 255, b / 255, a / 255];
  colourCache.set(value, result);
  return result;
}

const noColour: readonly number[] = [0, 0, 0, 0];

// A colour's hue at full strength, kept even when it is transparent: the
// canvas serialises the style it is given, whatever its alpha.
function cssHue(value: string): [number, number, number] {
  colourProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!colourProbe) return [1, 1, 1];
  colourProbe.fillStyle = '#000';
  colourProbe.fillStyle = value;
  const style = String(colourProbe.fillStyle);
  const hex = style.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (hex) return [1, 2, 3].map((i) => parseInt(hex[i], 16) / 255) as [number, number, number];
  const parts = style.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

/**
 * Draws one bubble. host is the element whose box is the bubble; canvas may
 * be larger (a margin for wobble, or a whole control with its track) and is
 * where the result lands.
 */
export function createSoapBubbleRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initial: SoapBubbleTuning,
  onReady?: () => void,
): SoapBubbleRenderer | null {
  const own = soapBubbleOwnContext(canvas);
  const context = own ?? soapBubbleContext();
  // Drawing in its own canvas, the surface has nothing handed to it.
  const target = own ? null : canvas.getContext('2d');
  if (!context || (!own && !target)) return null;
  const { gl, u, set } = context;

  let tuning = initial;
  // The tint fills the body; Opacity, when set, is its strength. The film's
  // colours keep their own settings, so a tint never recolours the oil.
  // Auto is the page's own: white on light pages, black on dark ones.
  const tintOf = (next: SoapBubbleTuning) => {
    if (next.tint.trim().toLowerCase() === 'auto')
      return [...(lightTheme ? [1, 1, 1] : [0, 0, 0]), Math.max(0, next.opacity)];
    return next.opacity < 0 ? cssColour(next.tint) : [...cssHue(next.tint), next.opacity];
  };
  const paletteColour = (value: string) =>
    value.trim().toLowerCase() === 'auto' ? noColour : cssColour(value);
  let soapColor = paletteColour(initial.soapColor);
  let soapShadeColor = paletteColour(initial.soapShadeColor);
  let soapHighlightColor = paletteColour(initial.soapHighlightColor);
  let soapPaletteColors = soapPaletteKeys.map((key) => cssColour(initial[key]));
  // Everything else the shader takes from the tuning alone, worked out when
  // the tuning changes rather than on every draw.
  const choicesOf = (next: SoapBubbleTuning) => ({
    glintShape: soapBubbleGlintShapes.indexOf(next.glintShape),
    windowStyle: soapBubbleWindowStyles.indexOf(next.windowStyle),
    twinShape: soapBubbleTwinShapes.indexOf(next.windowTwinShape),
    environment: soapBubbleEnvironments.indexOf(next.environment),
  });
  const shadeColorOf = (next: SoapBubbleTuning): readonly number[] =>
    next.bottomShadeColor.trim().toLowerCase() === 'auto'
      ? [0, 0, 0, -1]
      : cssColour(next.bottomShadeColor);
  let choices = choicesOf(initial);
  let shadeColor = shadeColorOf(initial);
  const pageTheme = host.closest('[data-theme]')?.getAttribute('data-theme');
  let lightTheme =
    pageTheme === 'light' ||
    (pageTheme !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
  let tint = tintOf(initial);
  let disposed = false;
  let frame = false;
  let dirtyFrame = true;
  let last = 0;
  let time = 0;
  let flow = 0;
  // Each bubble picks its own glint for the window light.
  let spark = Math.random();
  let visible = true;
  let painted = false;
  let dpr = 1;
  let width = 1;
  let height = 1;
  let layer: SoapBubbleLayer | null = null;
  // The bubble's size: the host's layout box, unless a shape stands in.
  let hostWidth = 1;
  let boxWidth = 1;
  let boxHeight = 1;
  let shape: SoapBubbleRect | null = null;
  // Bevel and corner sizes are in pixels at a 16 px font and grow with the
  // component's text, so a larger control looks the same, only bigger.
  let em = 1;
  let hostHeight = 1;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  // Read once and on change: the media query is asked every frame otherwise.
  let still = reduced?.matches ?? false;

  // Shape modes of a vibrating bubble: l=2 (oval) and l=3 (pear), each as two
  // orthogonal components so they can point in any direction, plus the press
  // squash. Natural frequencies follow the l(l-1)(l+2) Rayleigh–Lamb ratio.
  const modes: Mode[] = Array.from({ length: 4 }, () => ({ value: 0, velocity: 0 }));
  const squash: Mode = { value: 0, velocity: 0 };
  let pressed = false;
  const tiltTarget = [0, 0];
  const tiltValue = [0, 0];
  const pointerAt = { x: 0, y: 0, inside: false, time: 0 };

  // The bubble's box in radii of its short side.
  const extent = () => {
    const short = Math.min(hostWidth, hostHeight);
    return [hostWidth / short, hostHeight / short];
  };

  const stepPhysics = (dt: number) => {
    const omega2 = 2 * Math.PI * 2.1;
    const omega3 = omega2 * Math.sqrt(30 / 12);
    const damping = 0.09;
    modes.forEach((mode, index) => {
      const omega = index < 2 ? omega2 : omega3;
      mode.velocity += (-omega * omega * mode.value - 2 * damping * omega * mode.velocity) * dt;
      mode.value += mode.velocity * dt;
    });
    const squashOmega = 2 * Math.PI * 3.2;
    const target = pressed ? 0.075 * tuning.wobble : 0;
    squash.velocity +=
      (-squashOmega * squashOmega * (squash.value - target) -
        2 * 0.22 * squashOmega * squash.velocity) *
      dt;
    squash.value += squash.velocity * dt;
    for (let axis = 0; axis < 2; axis++) {
      tiltValue[axis] += (tiltTarget[axis] - tiltValue[axis]) * Math.min(1, dt * 4);
    }
  };

  const rotation = new Float32Array(9);
  let backdrop: SoapBubbleBackdrop | null = null;
  let backdropElement: HTMLElement | null = null;
  let releaseBackdrop = () => {};
  // The surface whose element a covered view leaves out, so that it does
  // not see itself.
  const self = canvas.closest('[data-soap-bubble]') ?? host;
  // Which view of the bubbles it covers this surface shows, if it covers
  // any: the shared one when it floats in a group (a menu's panel), else one
  // without itself. Covering nothing, it shows none and costs nothing.
  let covering: Element | null | undefined;
  const overlapsAnother = (page: HTMLElement) => {
    const own = self.getBoundingClientRect();
    for (const other of page.querySelectorAll('[data-soap-bubble]')) {
      // Only drawn bubbles count, not a burst's droplets.
      if (other === self || other.contains(self) || self.contains(other)) continue;
      if (!other.querySelector('canvas')) continue;
      const box = other.getBoundingClientRect();
      const left = Math.max(own.left, box.left);
      const right = Math.min(own.right, box.right);
      const top = Math.max(own.top, box.top);
      const bottom = Math.min(own.bottom, box.bottom);
      if (left >= right || top >= bottom) continue;
      // Only a bubble below this one is seen through it: whichever the page
      // hit-tests first in the overlap lies on top.
      const stack = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
      const mine = stack.findIndex((element) => self.contains(element));
      const theirs = stack.findIndex((element) => other.contains(element));
      if (mine >= 0 && (theirs < 0 || mine < theirs)) return true;
    }
    return false;
  };
  const showCovered = () => {
    let next: Element | null | undefined;
    // A floating surface keeps the shared view while it is hidden, so that it
    // is ready the moment the surface opens over something.
    if (backdrop && tuning.seeThrough > 0)
      if (self.closest('[data-soap-bubble-group]')) next = null;
      else if (overlapsAnother(backdrop.element)) next = self;
    if (next === covering) return;
    if (backdrop && covering !== undefined) wantCoveredBackdrop(backdrop, covering, false);
    covering = next;
    if (backdrop && covering !== undefined) wantCoveredBackdrop(backdrop, covering, true);
  };

  /**
   * filmOnly: only the film has moved since the last draw, so the bubble's
   * outline and everything around it (bleed, track, fill) are unchanged and
   * just the bubble's box is shaded again.
   */
  const draw = (filmOnly = false): boolean => {
    if (disposed) return false;
    if (!context.ready()) {
      // Asked again each frame until the driver has linked the program.
      request();
      return false;
    }
    const [ex, ey] = extent();
    const cssRadius = Math.min(hostWidth, hostHeight) / 2;
    const radius = cssRadius * dpr;
    // The bubble may move inside its canvas (a sliding thumb), so its centre
    // is measured every frame.
    const area = canvas.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    const scale = area.width ? width / area.width : 1;
    // Screen pixels per layout pixel, should the host be transformed.
    const zoomX = box.width / boxWidth;
    const zoomY = box.height / boxHeight;
    const middleX = shape ? shape.x + shape.width / 2 : boxWidth / 2;
    const middleY = shape ? shape.y + shape.height / 2 : boxHeight / 2;
    const centerX = (box.left + middleX * zoomX - area.left) * scale;
    const centerY = (box.top + middleY * zoomY - area.top) * scale;
    let part: SoapBubbleRect | null = null;
    if (filmOnly) {
      // The resting outline sits in the host's box; two pixels more for its
      // anti-aliased edge.
      const pad = 2 * dpr;
      const left = Math.max(0, Math.floor((centerX - hostWidth / 2) * dpr - pad));
      const top = Math.max(0, Math.floor((centerY - hostHeight / 2) * dpr - pad));
      const right = Math.min(canvas.width, Math.ceil((centerX + hostWidth / 2) * dpr + pad));
      const bottom = Math.min(canvas.height, Math.ceil((centerY + hostHeight / 2) * dpr + pad));
      if (right > left && bottom > top)
        part = { x: left, y: top, width: right - left, height: bottom - top };
    }
    const [offsetX, offsetY] = context.begin(canvas.width, canvas.height, part);
    set.f2(u.uCenter, offsetX + centerX * dpr, offsetY + canvas.height - centerY * dpr);
    set.f1(u.uRadius, radius);
    set.f2(u.uExtent, ex, ey);
    set.f1(u.uCorner, Math.min(1, (tuning.radius * em) / cssRadius));
    set.f1(u.uBevel, (tuning.bevel * em) / cssRadius);
    set.f1(u.uFilmScale, tuning.filmScale);
    set.f1(u.uOilOpacity, tuning.oilOpacity);
    set.f1(u.uOilCoverage, tuning.oilCoverage);
    set.f1(u.uOilEdge, tuning.oilEdge * em * dpr);
    set.f1(u.uOilFade, tuning.oilEdgeFade);
    set.f1(u.uClearCenter, tuning.clearCenter);
    set.v4(u.uTint, tint);
    set.v4(u.uSoapColor, soapColor);
    set.v4(u.uSoapShadeColor, soapShadeColor);
    set.v4(u.uSoapHighlightColor, soapHighlightColor);
    set.i1(u.uCustomSoapPalette, tuning.soapPalette === 'custom' ? 1 : 0);
    for (let index = 0; index < soapPaletteUniforms.length; index++)
      set.v4(u[soapPaletteUniforms[index]], soapPaletteColors[index]);
    set.i1(u.uLightTheme, lightTheme ? 1 : 0);
    set.i1(u.uWindowLight, tuning.windowLight ? 1 : 0);
    set.i1(u.uKeyLight, tuning.keyLight ? 1 : 0);
    set.i1(u.uWindowTwin, tuning.windowTwin ? 1 : 0);
    set.f1(u.uWindowSize, tuning.windowSize);
    set.f1(u.uWindowWidth, tuning.windowWidth);
    set.f1(u.uWindowGradient, tuning.windowGradient);
    set.f1(u.uTopFade, tuning.topFade);
    set.f1(u.uTopTail, tuning.topTail);
    set.f1(u.uTopLength, tuning.topLength);
    set.f1(u.uWindowHead, tuning.windowHead);
    set.f1(u.uWindowTail, tuning.windowTail);
    set.i1(u.uGlintShape, choices.glintShape);
    set.f1(u.uGlintSize, tuning.glintSize);
    set.f1(u.uGlintIntensity, tuning.glintIntensity);
    set.f2(u.uGlintOffset, tuning.glintDistance, tuning.glintHeight);
    set.i1(u.uWindowStyle, choices.windowStyle);
    set.f1(u.uWindowLength, tuning.windowLength);
    set.f1(u.uWindowMargin, tuning.windowMargin);
    set.f1(u.uWindowBend, tuning.windowBend);
    set.f1(u.uWindowIntensity, tuning.windowIntensity);
    set.i1(u.uTwinShape, choices.twinShape);
    set.f1(u.uSpark, spark);
    set.i1(u.uBottomShade, tuning.bottomShade ? 1 : 0);
    // A negative alpha tells the shader to take the theme's shade.
    set.v4(u.uShadeColor, shadeColor);
    // Past 8 em on its long side a surface starts to count as a panel or bar
    // (a menu or a segmented control), fully from 14 em.
    const long = Math.max(hostWidth, hostHeight) / (16 * em);
    const large = Math.min(1, Math.max(0, (long - 8) / 6));
    set.f1(u.uOilLarge, large * large * (3 - 2 * large));
    // Each pair of modes as amplitude times the cosine and sine of its
    // multiple angle: the shader then needs no trigonometry to wobble.
    const amplitude2 = Math.hypot(modes[0].value, modes[1].value);
    const amplitude3 = Math.hypot(modes[2].value, modes[3].value);
    const limit2 = amplitude2 > 0 ? Math.min(0.12, amplitude2) / amplitude2 : 0;
    const limit3 = amplitude3 > 0 ? Math.min(0.08, amplitude3) / amplitude3 : 0;
    set.f4(
      u.uModeBasis,
      modes[0].value * limit2,
      modes[1].value * limit2,
      modes[2].value * limit3,
      modes[3].value * limit3,
    );
    // Volume is roughly conserved: a vertical squash bulges sideways.
    const s = squash.value;
    set.f2(u.uSquash, 1 + s * 0.7, 1 - s);
    set.f1(u.uTime, time);
    set.f1(u.uFlow, flow);
    set.f1(u.uThickness, tuning.thickness);
    set.f1(u.uIridescence, tuning.iridescence);
    set.f1(u.uDrainage, tuning.drainage);
    set.f1(u.uSwirl, tuning.swirl);
    set.f1(u.uReflectivity, tuning.reflectivity);
    set.f1(u.uMirage, tuning.mirage);
    set.f1(u.uSeeThrough, tuning.seeThrough);
    set.f1(u.uFloorLight, tuning.floorLight);
    set.f1(u.uReach, tuning.reach);
    set.f1(u.uRefraction, tuning.refraction);
    set.f1(u.uGlass, tuning.glass);
    set.f1(u.uDispersion, tuning.dispersion);
    set.f1(u.uSeed, (tuning.seed % 97) * 0.731);
    set.i1(u.uEnvironment, choices.environment);
    // Turning the room with the pointer moves every reflection the way a real
    // bubble does when you walk around it.
    const yaw = (tiltValue[0] * 0.35 + Math.sin(time * 0.13) * 0.05) * tuning.tilt;
    const pitch = (tiltValue[1] * 0.25 + Math.cos(time * 0.11) * 0.03) * tuning.tilt;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    rotation[0] = cy;
    rotation[1] = sy * sp;
    rotation[2] = -sy * cp;
    rotation[3] = 0;
    rotation[4] = cp;
    rotation[5] = sp;
    rotation[6] = sy;
    rotation[7] = -cy * sp;
    rotation[8] = cy * cp;
    set.m3(u.uEnvRotation, rotation);
    const captured = backdrop?.size ? backdrop : null;
    set.i1(u.uHasBackdrop, captured ? 1 : 0);
    // Uploaded before the backdrop is bound, as an upload binds unit 0.
    const covered =
      captured && covering !== undefined ? coveredTexture(gl, captured, covering) : null;
    set.i1(u.uHasCovered, covered ? 1 : 0);
    if (covered) {
      set.f1(u.uCoveredBend, tuning.seeThroughBend);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, covered);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, captured ? backdropTexture(gl, captured) : context.emptyTexture);
    if (captured) {
      const page = frameRect(captured.element);
      set.f2(
        u.uBackdropOrigin,
        // From the shape's own centre: a menu growing or shrinking inside its
        // box sees what lies behind it move with it.
        (box.left + middleX * zoomX - page.left) / Math.max(1, page.width),
        (box.top + middleY * zoomY - page.top) / Math.max(1, page.height),
      );
      set.f2(u.uBackdropSize, captured.size![0], captured.size![1]);
      set.f2(
        u.uBackdropScale,
        cssRadius / Math.max(1, page.width),
        cssRadius / Math.max(1, page.height),
      );
    }
    set.i1(u.uHasLayer, layer ? 1 : 0);
    if (layer) {
      // Layer geometry in bubble radii around the bubble centre, y up.
      set.f4(
        u.uLayerRect,
        (layer.x + layer.width / 2 - centerX) / cssRadius,
        -(layer.y + layer.height / 2 - centerY) / cssRadius,
        layer.width / 2 / cssRadius,
        layer.height / 2 / cssRadius,
      );
      set.f1(u.uLayerCorner, layer.radius / cssRadius);
      set.f1(
        u.uLayerFill,
        (layer.x + layer.width * Math.min(1, Math.max(0, layer.fill)) - centerX) / cssRadius,
      );
      set.v4(u.uLayerTrack, cssColour(layer.track));
      set.v4(u.uLayerFrom, cssColour(layer.from));
      set.v4(u.uLayerTo, cssColour(layer.to ?? layer.from));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    context.present(target);
    if (!painted) {
      painted = true;
      onReady?.();
    }
    return true;
  };

  const shown = () => visible && !still && !document.hidden;
  const moving = () => !tuning.paused && shown();
  // A paused bubble still answers the pointer until its film settles.
  const jiggling = () =>
    shown() &&
    (pressed ||
      Math.abs(squash.value) + Math.abs(squash.velocity) > 1e-4 ||
      modes.some((mode) => Math.abs(mode.value) + Math.abs(mode.velocity) * 0.1 > 1e-4) ||
      tiltValue.some((value, axis) => Math.abs(value - tiltTarget[axis]) > 1e-3));
  const tick = (now: number) => {
    frame = false;
    const drifting = moving();
    const wobbling = jiggling();
    // While only the film drifts, 30 frames a second is plenty, and every
    // surface takes the same ones: the page then repaints 30 times a second,
    // not on every frame some surface happens to fall due. The skipped time
    // is caught up on the next film frame.
    if (drifting && !wobbling && !dirtyFrame && !isFilmFrame()) {
      request();
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    if (drifting) {
      time += dt * tuning.speed;
      flow += dt * tuning.speed;
    }
    // Settled modes need no stepping.
    if (wobbling) {
      const steps = Math.max(1, Math.ceil(dt * 240));
      const rate = tuning.paused ? 1 : Math.max(0.25, tuning.speed);
      for (let i = 0; i < steps; i++) stepPhysics((dt * rate) / steps);
    }
    // Settled modes leave the outline where the last whole draw put it.
    // The first draw after the program links shades the whole canvas.
    if (draw(drifting && !wobbling && !dirtyFrame)) dirtyFrame = false;
    if (drifting || jiggling()) request();
    else last = 0;
  };
  function request() {
    if (frame || disposed) return;
    frame = true;
    requestSoapBubbleFrame(tick);
  }

  const resize = () => {
    const style = getComputedStyle(canvas);
    width = Math.max(1, Number.parseFloat(style.width) || canvas.clientWidth);
    height = Math.max(1, Number.parseFloat(style.height) || canvas.clientHeight);
    boxWidth = Math.max(1, host.clientWidth);
    boxHeight = Math.max(1, host.clientHeight);
    hostWidth = shape ? shape.width : boxWidth;
    hostHeight = shape ? shape.height : boxHeight;
    em = (Number.parseFloat(getComputedStyle(host).fontSize) || 16) / 16;
    const density = Math.min(window.devicePixelRatio || 1, tuning.maxDpr);
    // Fewer pixels when the GPU cannot keep up, but never under one per CSS pixel.
    dpr = Math.max(Math.min(1, density), density * soapBubbleResolution());
    // Large surfaces are soft at their centre anyway; cap the buffer near 0.8 MP.
    dpr = Math.min(dpr, Math.sqrt(800_000 / (width * height)));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    showCovered();
    draw();
    request();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  // A thumb can change size on its own (it swells while dragged), and a
  // growing menu keeps a fixed canvas while its box grows inside it.
  resizeObserver.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    last = 0;
    if (visible) request();
  });
  visibility.observe(canvas);
  const releaseResolution = onSoapBubbleResolution(resize);
  const onMotion = () => {
    still = reduced?.matches ?? false;
    last = 0;
    request();
  };
  // Backdrop pixels are matched to its box; moving either needs a redraw.
  const onScroll = () => {
    if (backdrop?.size || layer) request();
  };
  reduced?.addEventListener?.('change', onMotion);
  document.addEventListener('visibilitychange', onMotion);
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  resize();

  const kick = (strength: number, angle: number) => {
    if (still) return;
    const amount = strength * tuning.wobble;
    modes[0].velocity += Math.cos(angle * 2) * amount;
    modes[1].velocity += Math.sin(angle * 2) * amount;
    modes[2].velocity += Math.cos(angle * 3) * amount * 0.5;
    modes[3].velocity += Math.sin(angle * 3) * amount * 0.5;
    request();
  };

  return {
    update(next) {
      tuning = next;
      showCovered();
      tint = tintOf(next);
      soapColor = paletteColour(next.soapColor);
      soapShadeColor = paletteColour(next.soapShadeColor);
      soapHighlightColor = paletteColour(next.soapHighlightColor);
      soapPaletteColors = soapPaletteKeys.map((key) => cssColour(next[key]));
      choices = choicesOf(next);
      shadeColor = shadeColorOf(next);
      last = 0;
      resize();
    },
    setBackdrop(element) {
      if (element === backdropElement) return;
      if (backdrop && covering !== undefined) wantCoveredBackdrop(backdrop, covering, false);
      covering = undefined;
      releaseBackdrop();
      backdropElement = element;
      backdrop = null;
      delete canvas.dataset.backdrop;
      releaseBackdrop = element
        ? subscribeBackdrop(element, (next) => {
            backdrop = next;
            showCovered();
            const state = next.size ? 'captured' : 'failed';
            if (canvas.dataset.backdrop !== state) canvas.dataset.backdrop = state;
            draw();
            request();
          })
        : () => {};
      draw();
      request();
    },
    setLightTheme(light) {
      if (lightTheme === light) return;
      lightTheme = light;
      tint = tintOf(tuning);
      dirtyFrame = true;
      request();
    },
    setLayer(next) {
      layer = next;
      draw();
    },
    invalidate() {
      // Batched into the shared frame: a sliding bubble carries its canvas
      // along, so only the backdrop lookup needs the new position.
      dirtyFrame = true;
      request();
    },
    pointer(x, y, inside) {
      const now = performance.now();
      if (inside) {
        const dt = Math.max(16, now - pointerAt.time) / 1000;
        const vx = pointerAt.inside ? (x - pointerAt.x) / dt : 0;
        const vy = pointerAt.inside ? (y - pointerAt.y) / dt : 0;
        if (!pointerAt.inside) kick(0.35, Math.atan2(y, x));
        else {
          const speed = Math.min(6, Math.hypot(vx, vy));
          if (speed > 0.2) kick(speed * 0.02, Math.atan2(vy, vx));
        }
        tiltTarget[0] = x;
        tiltTarget[1] = y;
      } else {
        if (pointerAt.inside) kick(0.25, Math.atan2(pointerAt.y, pointerAt.x));
        tiltTarget[0] = 0;
        tiltTarget[1] = 0;
      }
      pointerAt.x = x;
      pointerAt.y = y;
      pointerAt.inside = inside;
      pointerAt.time = now;
      request();
    },
    motion() {
      return {
        time,
        spark,
        flow,
        modes: modes.map((mode) => ({ ...mode })),
        squash: { ...squash },
        tilt: [tiltValue[0], tiltValue[1]],
      };
    },
    adopt(next) {
      time = next.time;
      spark = next.spark;
      flow = next.flow;
      next.modes.forEach((mode, index) => Object.assign(modes[index], mode));
      Object.assign(squash, next.squash);
      tiltValue[0] = next.tilt[0];
      tiltValue[1] = next.tilt[1];
      dirtyFrame = true;
      request();
    },
    setShape(next) {
      shape = next;
      hostWidth = Math.max(1, next ? next.width : boxWidth);
      hostHeight = Math.max(1, next ? next.height : boxHeight);
      draw();
      request();
    },
    rebound() {
      if (still) return;
      kick(1.4, Math.PI / 5);
      squash.velocity -= 0.7 * tuning.wobble;
      request();
    },
    press(next) {
      if (next === pressed) return;
      pressed = next;
      if (!next) kick(0.6, Math.PI / 2);
      request();
    },
    dispose() {
      disposed = true;
      if (own) releaseSoapBubbleOwnContext(canvas);
      cancelSoapBubbleFrame(tick);
      if (backdrop && covering !== undefined) wantCoveredBackdrop(backdrop, covering, false);
      releaseBackdrop();
      resizeObserver.disconnect();
      visibility.disconnect();
      releaseResolution();
      reduced?.removeEventListener?.('change', onMotion);
      document.removeEventListener('visibilitychange', onMotion);
      window.removeEventListener('scroll', onScroll, { capture: true });
    },
  };
}
