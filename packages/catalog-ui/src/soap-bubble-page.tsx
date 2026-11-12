import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  SoapBubbleButton,
  SoapBubbleIconButton,
  SoapBubbleMaterial,
  SoapBubbleMenu,
  SoapBubbleSearch,
  SoapBubbleSlider,
  SoapBubbleToggle,
  soapBubbleDefaults,
  soapBubbleLightings,
  soapBubbleTwinShapes,
  soapBubbleGlintShapes,
  soapBubbleSystemDefaults,
  type SoapBubbleSettings,
} from '../../components/src/soap-bubble';
import { soapBubble } from '@reactdrops/catalog-data/catalog';
import { soapBubbleSourceFiles } from '@reactdrops/catalog-data/sources/soap-bubble';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import './catalog.css';
import './soap-bubble-page.css';
import { ColorControl } from './color-control';
import {
  soapBubbleColorPresets as colorPresets,
  soapBubbleSliderColor,
} from './soap-bubble-color-presets';

type Values = Omit<SoapBubbleSettings, 'maxDpr'>;
type NumericKey = {
  [K in keyof Values]: Values[K] extends number ? K : never;
}[keyof Values];
type Theme = 'light' | 'dark';
const previewOptions = [
  { value: 'showcase', label: 'Showcase' },
  { value: 'menu', label: 'Menu' },
  { value: 'camera', label: 'Camera' },
  { value: 'new', label: 'New chat' },
  { value: 'search', label: 'Search' },
  { value: 'toggle', label: 'Switch' },
  { value: 'add', label: 'Add' },
  { value: 'close', label: 'Close' },
  { value: 'button', label: 'Continue' },
  { value: 'slider', label: 'Slider' },
] as const;
type Preview = (typeof previewOptions)[number]['value'];
const previewThumbnails = import.meta.glob<string>('./assets/soap-bubble/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
});
const { maxDpr: _maxDpr, ...bubbleDefaults } = soapBubbleDefaults;
// The tint is the page's own and starts transparent.
const systemDefaults = {
  ...bubbleDefaults,
  ...soapBubbleSystemDefaults,
  tint: 'auto',
  opacity: 0,
} as Values;

// A colour's alpha, 0 to 1, to set Opacity from a picked Tint. Read from the
// text alone, so it also runs where the page is rendered on the server.
function colorAlpha(value: string) {
  const colour = value.trim().toLowerCase();
  if (colour === 'transparent') return 0;
  const hex = colour.match(/^#([\da-f]{3,8})$/)?.[1];
  if (hex?.length === 4) return parseInt(hex[3] + hex[3], 16) / 255;
  if (hex?.length === 8) return parseInt(hex.slice(6), 16) / 255;
  // rgb(r g b / a), rgba(r, g, b, a) and the like.
  const alpha = colour.match(/^[a-z]+\((?:[^,/]+,){3}\s*([\d.]+%?)\s*\)$|\/\s*([\d.]+%?)\s*\)$/);
  const text = alpha?.[1] ?? alpha?.[2];
  if (!text) return 1;
  const number = parseFloat(text) / (text.endsWith('%') ? 100 : 1);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 1;
}
const lightMaterial = {
  glass: 0.95,
  iridescence: 0.5,
  filmScale: 4.85,
  oilOpacity: 1,
  oilCoverage: 0.73,
  oilEdge: 18,
  oilEdgeFade: 2.33,
  clearCenter: 0.57,
  thickness: 480,
  drainage: 0.35,
  swirl: 0.5,
  reflectivity: 1.3,
  refraction: 0.15,
  dispersion: 1,
  bevel: 14,
} satisfies Partial<Values>;
// Reflection presets. Soft gradient is the latest tuning: a smaller window
// that fades almost out towards its right end. Checkpoint is the earlier
// approved look: the original gradient and a crisp top highlight.
const sharedReflections = {
  windowStyle: 'edge',
  windowWidth: 0.8,
  windowHead: 0.7,
  windowLength: 1.3,
  windowMargin: 0.85,
  windowBend: 0.75,
  glintShape: 'auto',
  glintSize: 1.65,
  glintIntensity: 0,
  glintDistance: -0.45,
  glintHeight: 0.65,
  windowTwin: false,
  windowTwinShape: 'mirror',
  keyLight: true,
} satisfies Partial<Values>;
const reflectionPresets: Record<string, Partial<Values>> = {
  'soft gradient': {
    ...sharedReflections,
    windowSize: 0.75,
    windowTail: 0.6,
    windowIntensity: 0.85,
    windowGradient: 0.96,
    topFade: 0.4,
    topTail: 1,
    topLength: 1,
  },
  glossy: {
    ...sharedReflections,
    windowSize: 0.95,
    windowTail: 1.1,
    windowIntensity: 1.3,
    windowGradient: 1,
    topFade: 0.8,
    topTail: 1,
    topLength: 1,
  },
  checkpoint: {
    ...sharedReflections,
    windowSize: 1,
    windowTail: 0.35,
    windowIntensity: 0.6,
    windowGradient: 0.24,
    topFade: 0,
    topTail: 1,
    topLength: 1,
  },
};
const reflectionDefaults = reflectionPresets['soft gradient'];
const materialPresets: Record<string, Partial<Values>> = {
  'light glass': lightMaterial,
  // Nearly solid glass carrying broad, vivid oil bands.
  'rainbow glass': {
    glass: 0.95,
    iridescence: 2,
    filmScale: 4.85,
    oilOpacity: 1,
    oilCoverage: 1,
    oilEdge: 18,
    oilEdgeFade: 1,
    clearCenter: 0.73,
    thickness: 480,
    drainage: 0.35,
    swirl: 0.5,
    reflectivity: 1.3,
    refraction: 0.15,
    dispersion: 1,
    bevel: 14,
  },
  'liquid glass': {
    ...lightMaterial,
    glass: 1,
    iridescence: 0.25,
    refraction: 0.2,
    filmScale: 2.5,
  },
  // Reconstruct the original full-film look from the renderer's baseline,
  // before the glass presets narrowed the oil to a clear-centred rim.
  oil: {
    glass: bubbleDefaults.glass,
    iridescence: 2,
    filmScale: bubbleDefaults.filmScale,
    oilOpacity: 1,
    oilCoverage: 1,
    oilEdge: 0,
    oilEdgeFade: 0,
    clearCenter: 0,
    thickness: bubbleDefaults.thickness,
    drainage: bubbleDefaults.drainage,
    swirl: bubbleDefaults.swirl,
    reflectivity: bubbleDefaults.reflectivity,
    refraction: bubbleDefaults.refraction,
    dispersion: bubbleDefaults.dispersion,
    bevel: bubbleDefaults.bevel,
  },
};
const themeDefaults: Record<Theme, Values> = {
  // The window light and the bottom shade start off on the light page; each
  // theme sets its own, and the reflection presets leave them alone.
  light: {
    ...systemDefaults,
    ...lightMaterial,
    ...reflectionDefaults,
    windowLight: false,
    bottomShade: false,
    bottomShadeColor: '#ffffff',
  } as Values,
  // The dark page starts from rainbow glass, the soft gradient reflections
  // with the window light off, and a bottom shade with a clear colour.
  dark: {
    ...systemDefaults,
    ...lightMaterial,
    ...materialPresets['rainbow glass'],
    ...reflectionDefaults,
    windowLight: false,
    bottomShade: true,
    bottomShadeColor: '#ffffff00',
  } as Values,
};

// The live glass Bubble Liquid and Liquid Glass start from.
const liveGlass = {
  liquidTint: bubbleDefaults.liquidTint,
  liquidDensity: bubbleDefaults.liquidDensity,
  liquidPanelDensity: bubbleDefaults.liquidPanelDensity,
  liquidBlur: bubbleDefaults.liquidBlur,
  liquidSaturation: bubbleDefaults.liquidSaturation,
  liquidBrightness: bubbleDefaults.liquidBrightness,
  liquidLens: bubbleDefaults.liquidLens,
  liquidRimWidth: bubbleDefaults.liquidRimWidth,
  liquidBend: bubbleDefaults.liquidBend,
  liquidSplit: bubbleDefaults.liquidSplit,
  liquidEdgeLight: bubbleDefaults.liquidEdgeLight,
  liquidInnerLight: bubbleDefaults.liquidInnerLight,
  liquidShadow: bubbleDefaults.liquidShadow,
} satisfies Partial<Values>;
// Tuned by hand on a dark phone screen: the full rainbow film with a narrow
// bevel, strong reflections and no key light, refracting the captured page
// through a dark body.
const tunedFilm = {
  bevel: 8,
  backdropBlur: 1,
  oilOpacity: 0.83,
  oilEdge: 24,
  oilEdgeFade: 0.72,
  clearCenter: 1,
  reflectivity: 2.45,
  keyLight: false,
  refraction: 0.68,
  dispersion: 0.4,
  seeThroughBend: 1.12,
} satisfies Partial<Values>;
const tunedGlass = {
  ...themeDefaults.dark,
  ...tunedFilm,
  surface: 'bubble',
  seeThrough: 0.3,
  refractionWidth: 19,
  refractionClear: 0,
  tint: '#000000',
  opacity: 0.89,
} as Values;
// The film and its motion over live glass, which blurs and bends the page as
// it is: nothing captures it, and the film draws no body of its own. On a light
// page it keeps the light glass film, lit over the page's own colour.
const bubbleLiquid: Record<Theme, Values> = {
  dark: {
    ...themeDefaults.dark,
    ...tunedFilm,
    ...liveGlass,
    surface: 'bubble-liquid',
    seeThrough: 0,
  } as Values,
  light: {
    ...themeDefaults.light,
    ...liveGlass,
    surface: 'bubble-liquid',
    seeThrough: 0,
    paper: '#f7f7f8',
    liquidRimWidth: 17,
    liquidBend: 0.9,
  } as Values,
};
// Glass with no film on it: no bevel to see, no key reflection and no oil,
// only the bending at the edge a bevel would cause. It goes over the current
// material.
const clearLens = {
  surface: 'bubble',
  glass: 1,
  iridescence: 0,
  oilOpacity: 0,
  oilCoverage: 0,
  oilEdge: 0,
  bevel: 0,
  refraction: 0.88,
  refractionWidth: 24,
  refractionClear: 1,
  seeThrough: 1,
  seeThroughBend: 1.96,
  dispersion: 1,
  keyLight: false,
} satisfies Partial<Values>;
const surfacePresets = [
  { value: 'bubble-glass', label: 'Bubble Glass' },
  { value: 'bubble-liquid', label: 'Bubble Liquid' },
  { value: 'tuned-glass', label: 'Tuned Glass' },
  { value: 'clear-lens', label: 'Clear Lens' },
  { value: 'liquid-glass', label: 'Liquid Glass' },
] as const;
type SurfacePreset = (typeof surfacePresets)[number]['value'];
const matches = (values: Values, preset: Partial<Values>) =>
  Object.entries(preset).every(([key, value]) => values[key as keyof Values] === value);
function surfacePresetOf(values: Values): SurfacePreset {
  if (values.surface === 'liquid-glass') return 'liquid-glass';
  if (values.surface === 'bubble-liquid') return 'bubble-liquid';
  if (matches(values, clearLens)) return 'clear-lens';
  if (matches(values, tunedGlass)) return 'tuned-glass';
  return 'bubble-glass';
}
function applySurfacePreset(preset: SurfacePreset, values: Values, theme: Theme): Values {
  if (preset === 'bubble-liquid') return { ...bubbleLiquid[theme] };
  if (preset === 'tuned-glass') return { ...tunedGlass };
  if (preset === 'clear-lens') return { ...values, ...clearLens };
  // The glass on its own takes the page's tint; a colour picked afterwards
  // tints it.
  if (preset === 'liquid-glass')
    return { ...values, ...liveGlass, surface: 'liquid-glass', tint: 'auto', opacity: 0 };
  return { ...themeDefaults[theme] };
}
// What the live glass's rim lens does instead, so these would do nothing.
const replacedByLiveGlass = new Set<keyof Values>([
  'seeThrough',
  'seeThroughBend',
  'refraction',
  'refractionWidth',
  'refractionClear',
  'backdropBlur',
  'dispersion',
  'mirage',
  'reach',
]);

// Corners belong to each component; the system shares only material.
const componentOnly: (keyof Values)[] = ['radius'];

const changedProps = (values: Values, base: Values, skip: (keyof Values)[] = []) =>
  Object.entries(values)
    .filter(
      ([name, value]) =>
        !skip.includes(name as keyof Values) && base[name as keyof Values] !== value,
    )
    .map(([name, value]) =>
      typeof value === 'string' ? `${name}="${value}"` : `${name}={${JSON.stringify(value)}}`,
    );

// Every control is sized from one font size; the switch and slider take the
// matching scale so they stay as tall as the buttons.
const baseFont = 28;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

// Resolve Auto from the shared material, exactly as Continue does. Only the
// base tint is green; every oil and lighting setting stays shared.
function newChatMaterial(values: Values) {
  // Left at the page's own tint, + is the green accent; any other tint (and
  // its opacity) it shares with the rest. Its film keeps the shared colours.
  // Tuned Glass's black body counts as the dark page's own.
  return values.tint === 'auto' || values.tint === bubbleDefaults.tint || values.tint === '#000000'
    ? { tint: 'rgb(52 199 89)', opacity: 0.92 }
    : {};
}

function systemExample(values: Values = themeDefaults.light, theme: Theme = 'light', scale = 1) {
  // Opacity is written only where it differs from the tint's own alpha.
  const props = changedProps(values, systemDefaults, [
    ...componentOnly,
    ...(values.opacity === colorAlpha(values.tint) && values.tint !== 'auto'
      ? (['opacity'] as const)
      : []),
  ]);
  const newChatProps = Object.entries(newChatMaterial(values))
    .map(([name, value]) =>
      typeof value === 'string' ? `${name}="${value}"` : `${name}={${value}}`,
    )
    .join(' ');
  const font = round3(baseFont * scale);
  // Live glass reads the page as it is, so it has no backdrop to capture.
  const captured = values.surface === 'bubble';
  return `import { ${captured ? 'useRef, ' : ''}useState } from 'react';\nimport {\n  SoapBubbleButton,\n  SoapBubbleIconButton,\n  SoapBubbleMaterial,\n  SoapBubbleMenu,\n  SoapBubbleSearch,\n  SoapBubbleSlider,\n  SoapBubbleToggle,\n} from './components/soap-bubble';\n\nexport function Example() {\n${captured ? '  const page = useRef<HTMLDivElement>(null);\n' : ''}  const [wifi, setWifi] = useState(true);\n  const [volume, setVolume] = useState(40);\n  return (\n    <div ${captured ? 'ref={page} ' : ''}className="page" data-theme="${theme}" style={{ background: '${theme === 'light' ? '#f7f7f8' : '#000'}', color: '${theme === 'light' ? '#1b1d22' : '#f2f3f7'}' }}>\n      <SoapBubbleMaterial${captured ? ' backdrop={page}' : ''}${props.length ? `\n        ${props.join('\n        ')}\n      ` : ''}>\n        <div style={{ display: 'grid', gap: '1em', fontSize: ${font} }}>\n        <header style={{ display: 'flex', gap: '0.55em' }}>\n          <SoapBubbleMenu\n            round\n            label="•••"\n            triggerLabel="More"\n            items={[{ label: 'Select chats' }, { label: 'Read all' }]}\n          />\n          <SoapBubbleIconButton aria-label="Camera" style={{ marginLeft: 'auto' }}>📷</SoapBubbleIconButton>\n          <SoapBubbleIconButton aria-label="New" ${newChatProps}>+</SoapBubbleIconButton>\n        </header>\n        <SoapBubbleSearch placeholder="Search" />\n        <SoapBubbleToggle checked={wifi} onCheckedChange={setWifi} aria-label="Wi-Fi" scale={${round3(2.75 * scale)}} />\n        <SoapBubbleSlider value={volume} onValueChange={setVolume} label="Volume" from="${soapBubbleSliderColor(values.tint)}" scale={${round3(3 * scale)}} />\n        <SoapBubbleButton>Continue</SoapBubbleButton>\n        </div>\n      </SoapBubbleMaterial>\n    </div>\n  );\n}`;
}

export function soapBubbleMeta() {
  return [
    { title: 'Bubble UI — ReactDrops' },
    { name: 'description', content: soapBubble.description },
  ];
}

// A film ruptures at one point and its rim retracts both ways round the
// outline, shedding beads as it passes, so they leave in sequence from the
// puncture onwards. The two rims meet opposite the puncture and throw the
// fastest jet. Most beads are tiny, a few are large; freshly thrown ones are
// streaks that round up as they slow. A pop is computed once per click;
// playback is transforms and opacity only.
const popRadius = 1.375;
const popRetract = 60;

function popSpray(puncture: number) {
  const random = Math.random;
  return Array.from({ length: 30 }, (_, index) => {
    // Beads gather where the rims collide, opposite the puncture.
    const jet = index < 9;
    const offset = jet ? (random() - 0.5) * 0.9 : (random() * 2 - 1) * Math.PI;
    const angle = puncture + Math.PI + offset;
    const side = Math.sign(offset) || 1;
    // Many tiny beads, a few large ones.
    const size = 0.015 + Math.pow(random(), 3) * 0.05;
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    // The rim travels away from the puncture: along the tangent towards the
    // collision, and outwards.
    const tangent = { x: normal.y * side, y: -normal.x * side };
    const along = jet ? 0.25 : 0.65;
    const speed = (jet ? 7 : 4) * (0.6 + random() * 0.8) * (1 - size * 3);
    const vx = (normal.x + tangent.x * along) * speed;
    const vy = (normal.y + tangent.y * along) * speed;
    const drag = 5 + random() * 3;
    const gravity = 6;
    const life = 0.16 + random() * 0.14 + size * 1.5;
    const pose = (progress: number) => {
      const t = life * progress;
      const decay = Math.exp(-drag * t);
      const travel = (1 - decay) / drag;
      const x = vx * travel;
      const y = vy * travel + (gravity / drag) * (t - travel);
      const ux = vx * decay;
      const uy = vy * decay + gravity * travel;
      // Stretched along the flight while fast, round once slow.
      const stretch = 1 + Math.min(2, Math.hypot(ux, uy) * 0.12);
      return `translate(-50%, -50%) translate(${x.toFixed(3)}em, ${y.toFixed(3)}em) rotate(${Math.atan2(uy, ux).toFixed(3)}rad) scale(${stretch.toFixed(2)}, ${(1 / Math.sqrt(stretch)).toFixed(2)})`;
    };
    // The rim reaches this point after a time set by the arc it has crossed.
    const crossed = Math.PI - Math.abs(offset);
    return {
      '--drop-x': `${(normal.x * popRadius).toFixed(3)}em`,
      '--drop-y': `${(normal.y * popRadius).toFixed(3)}em`,
      '--drop-a': pose(0),
      '--drop-b': pose(0.2),
      '--drop-c': pose(0.5),
      '--drop-d': pose(1),
      '--drop-size': `${size.toFixed(3)}em`,
      '--drop-alpha': (0.55 + size * 3).toFixed(2),
      '--drop-duration': `${Math.round(life * 1000)}ms`,
      '--drop-delay': `${Math.round((crossed / Math.PI) * popRetract)}ms`,
    } as CSSProperties;
  });
}

// Small bubbles left behind where the film was: a few pinch off as the rim
// tears, rise on the warm air of the burst, sway as they climb and pop in
// turn. Computed once per click; playback is transforms and opacity only.
function popBubbles() {
  const random = Math.random;
  return Array.from({ length: 9 }, () => {
    // Most are small, one or two nearly a quarter of the button.
    const size = 0.2 + Math.pow(random(), 2.2) * 0.5;
    // They pinch off all over the film, so they leave in every direction.
    const angle = random() * Math.PI * 2;
    const from = Math.sqrt(random()) * 0.55;
    const start = { x: Math.cos(angle) * from, y: Math.sin(angle) * from };
    // The burst throws them out hard; drag soon stops that, then buoyancy
    // takes over and they rise. Small ones are thrown further and sway more.
    const kick = (3.4 + random() * 2.6) * (1.15 - size);
    const vx = Math.cos(angle) * kick;
    const vy = Math.sin(angle) * kick;
    const drag = 4.5 + random() * 1.5;
    const lift = 1.8 + size * 2.4;
    const sway = (0.1 + random() * 0.16) * (1 - size);
    const phase = random() * Math.PI * 2;
    const life = 0.95 + random() * 0.7;
    // Buoyancy only wins once the outward rush has slowed.
    const settle = 0.14;
    const pose = (progress: number, grow: number) => {
      const t = life * progress;
      const travel = (1 - Math.exp(-drag * t)) / drag;
      const rising = Math.max(0, t - settle);
      const x =
        start.x + vx * travel + Math.sin(phase + rising * 9) * sway * Math.min(1, rising * 4);
      const y = start.y + vy * travel - lift * rising * rising * 0.9;
      return `translate(-50%, -50%) translate(${x.toFixed(3)}em, ${y.toFixed(3)}em) scale(${grow.toFixed(2)})`;
    };
    return {
      '--mini-size': `${size.toFixed(3)}em`,
      // Dense poses early, where the burst throws them out fast.
      '--mini-a': pose(0, 0.3),
      '--mini-b': pose(0.04, 0.9),
      '--mini-c': pose(0.1, 1),
      '--mini-d': pose(0.2, 1),
      '--mini-e': pose(0.4, 1),
      '--mini-f': pose(0.7, 1.02),
      // It pops: a quick swell as the film lets go.
      '--mini-g': pose(1, 1.3),
      '--mini-duration': `${Math.round(life * 1000)}ms`,
      '--mini-delay': `${Math.round(random() * 90)}ms`,
    } as CSSProperties;
  });
}

type PopEffect = 'spray' | 'bubbles' | 'both';

/** A close button that bursts like a soap bubble and blows back a moment later. */
function PopButton({ effect }: { effect: PopEffect }) {
  const [generation, setGeneration] = useState(0);
  const [rebound, setRebound] = useState(0);
  const [popping, setPopping] = useState(false);
  const [popped, setPopped] = useState(false);
  const [spray, setSpray] = useState<CSSProperties[]>([]);
  const [bubbles, setBubbles] = useState<CSSProperties[]>([]);
  useEffect(() => {
    if (!popped) return;
    // Wait for the small bubbles to pop before blowing a new button there.
    const timer = window.setTimeout(
      () => {
        setGeneration((value) => value + 1);
        setPopping(false);
        setPopped(false);
      },
      effect === 'spray' ? 1000 : 1900,
    );
    return () => window.clearTimeout(timer);
  }, [popped, effect]);
  const pop = (event: MouseEvent<HTMLButtonElement>) => {
    if (popping || popped) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setPopped(true);
    // The film breaks where it was touched; a key press breaks it at random.
    const rect = event.currentTarget.getBoundingClientRect();
    const puncture =
      event.detail > 0
        ? Math.atan2(
            event.clientY - rect.top - rect.height / 2,
            event.clientX - rect.left - rect.width / 2,
          )
        : Math.random() * Math.PI * 2;
    setSpray(effect === 'bubbles' ? [] : popSpray(puncture));
    setBubbles(effect === 'spray' ? [] : popBubbles());
    setPopping(true);
  };
  return (
    <span
      className="soap-bubble-system-pop"
      // Bursting only restyles bubbles: no new backdrop capture.
      data-soap-bubble-group=""
      data-state={popped ? 'gone' : popping ? 'bursting' : undefined}
    >
      <SoapBubbleButton
        reboundKey={rebound}
        aria-label="Close"
        className="soap-bubble-system-add soap-bubble-system-close"
        data-reborn={(generation > 0 && !popping && !popped) || undefined}
        disabled={popping || popped}
        onClick={pop}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName === 'soap-bubble-system-burst') setPopped(true);
          // Inflate first, then release the fluid into its hover-like rebound.
          else if (event.animationName === 'soap-bubble-system-blow')
            setRebound((value) => value + 1);
        }}
      >
        <span className="soap-bubble-system-add-glyph" aria-hidden="true">
          ×
        </span>
      </SoapBubbleButton>
      <span className="soap-bubble-system-burst" data-soap-bubble="" aria-hidden="true">
        {spray.map((style, index) => (
          <span key={index} className="soap-bubble-system-drop" style={style} />
        ))}
        {bubbles.map((style, index) => (
          <span key={`b${index}`} className="soap-bubble-system-mini" style={style} />
        ))}
      </span>
    </span>
  );
}

/** Switch, add, close and Continue buttons, all as tall as Continue. */
function ControlRow({
  wifi,
  setWifi,
  scale,
  popEffect,
  preview,
}: {
  wifi: boolean;
  setWifi: (value: boolean) => void;
  scale: number;
  popEffect: PopEffect;
  preview: Preview;
}) {
  // The 28 px switch track grows to the buttons' 2.75em height.
  return (
    <div className="soap-bubble-system-row">
      {(preview === 'showcase' || preview === 'toggle') && (
        <SoapBubbleToggle
          checked={wifi}
          onCheckedChange={setWifi}
          aria-label="Wi-Fi"
          scale={(2.75 * baseFont * scale) / 28}
        />
      )}
      {(preview === 'showcase' || preview === 'add') && (
        <SoapBubbleButton aria-label="Add" className="soap-bubble-system-add">
          <span className="soap-bubble-system-add-glyph" aria-hidden="true">
            +
          </span>
        </SoapBubbleButton>
      )}
      {(preview === 'showcase' || preview === 'close') && <PopButton effect={popEffect} />}
      {(preview === 'showcase' || preview === 'button') && (
        <SoapBubbleButton className="soap-bubble-system-continue">Continue</SoapBubbleButton>
      )}
    </div>
  );
}

const icons = {
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M9.2 4.5h5.6l1.5 2H19a2.5 2.5 0 0 1 2.5 2.5v8.5A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V9A2.5 2.5 0 0 1 5 6.5h2.7zM12 9.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 1 0 0-7.6z"
      />
      <circle cx="12" cy="13" r="2.4" />
    </svg>
  ),
  plus: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  select: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7L16 9.6" />
    </svg>
  ),
  read: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="m8.5 10.6 2.4 2.4 4.6-4.6" />
    </svg>
  ),
};

function SystemPreview({
  values,
  theme,
  scale: chosen,
  popEffect,
  preview,
}: {
  values: Values;
  theme: Theme;
  scale: number;
  popEffect: PopEffect;
  preview: Preview;
}) {
  const page = useRef<HTMLDivElement>(null);
  // A narrow frame shrinks the set so its 21.75em fit in 90% of the width.
  const [width, setWidth] = useState(Infinity);
  useEffect(() => {
    const element = page.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(chosen, (0.9 * width) / (21.75 * baseFont));
  const [wifi, setWifi] = useState(true);
  const [volume, setVolume] = useState(42);
  const shared = Object.fromEntries(
    Object.entries(values).filter(
      ([name, value]) =>
        !componentOnly.includes(name as keyof Values) &&
        // Tint and Opacity always go along: the library's own tint is not the
        // page's.
        (name === 'tint' || name === 'opacity' || systemDefaults[name as keyof Values] !== value),
    ),
  );
  return (
    <div
      ref={page}
      className="soap-bubble-system-demo component-background-preview"
      data-theme={theme}
      data-preview={preview}
      style={{ '--soap-bubble-preview-font-size': `${baseFont * scale}px` } as CSSProperties}
    >
      <SoapBubbleMaterial backdrop={page} {...shared}>
        <div
          className="soap-bubble-system-controls"
          data-preview={preview}
          style={{ fontSize: baseFont * scale }}
        >
          {['showcase', 'menu', 'camera', 'new', 'search'].includes(preview) && (
            <div className="soap-bubble-system-top">
              {preview !== 'search' && (
                <div className="soap-bubble-system-bar">
                  {(preview === 'showcase' || preview === 'menu') && (
                    <SoapBubbleMenu
                      round
                      label={icons.more}
                      triggerLabel="More"
                      items={[
                        { label: 'Select chats', icon: icons.select },
                        { label: 'Read all', icon: icons.read },
                      ]}
                    />
                  )}
                  {(preview === 'showcase' || preview === 'camera') && (
                    <SoapBubbleIconButton aria-label="Camera" className="soap-bubble-system-camera">
                      {icons.camera}
                    </SoapBubbleIconButton>
                  )}
                  {(preview === 'showcase' || preview === 'new') && (
                    <SoapBubbleIconButton
                      aria-label="New chat"
                      {...newChatMaterial(values)}
                      className="soap-bubble-system-new"
                    >
                      {icons.plus}
                    </SoapBubbleIconButton>
                  )}
                </div>
              )}
              {(preview === 'showcase' || preview === 'search') && (
                <SoapBubbleSearch placeholder="Search" />
              )}
            </div>
          )}
          {['showcase', 'toggle', 'add', 'close', 'button'].includes(preview) && (
            <ControlRow
              wifi={wifi}
              setWifi={setWifi}
              scale={scale}
              popEffect={popEffect}
              preview={preview}
            />
          )}
          {(preview === 'showcase' || preview === 'slider') && (
            <SoapBubbleSlider
              value={volume}
              onValueChange={setVolume}
              label="Volume"
              from={soapBubbleSliderColor(values.tint)}
              scale={3 * scale}
            />
          )}
        </div>
      </SoapBubbleMaterial>
    </div>
  );
}

export default function SoapBubblePage() {
  const panelId = useId();
  const [panelTab, setPanelTab] = useState<'components' | 'controls'>('components');
  const [preview, setPreview] = useState<Preview>('showcase');
  const [theme, setTheme] = useState<Theme>('light');
  const [scale, setScale] = useState(1);
  const [popEffect, setPopEffect] = useState<PopEffect>('spray');
  const [savedValues, setValues] = useState<Values>(themeDefaults.light);
  // Fast Refresh can preserve a settings object created before new controls
  // existed. Fill missing fields from this theme before deriving accents.
  const values: Values = { ...themeDefaults[theme], ...savedValues };
  const themeValues = useRef<Record<Theme, Values>>({ ...themeDefaults });
  const currentTheme = useRef({ theme, values });
  currentTheme.current = { theme, values };
  const changeTheme = useCallback((next: Theme) => {
    const current = currentTheme.current;
    if (next === current.theme) return;
    themeValues.current[current.theme] = current.values;
    setValues(themeValues.current[next]);
    setTheme(next);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    let previous: Theme | undefined;
    const sync = () => {
      const next: Theme = root.hasAttribute('data-theme')
        ? root.dataset.theme === 'dark'
          ? 'dark'
          : 'light'
        : root.classList.contains('dark') || media.matches
          ? 'dark'
          : 'light';
      // A manual preview selection lasts until the site's theme changes.
      if (next === previous) return;
      previous = next;
      changeTheme(next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    media.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, [changeTheme]);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((old) => ({ ...old, [key]: value }));
  const usage = systemExample(values, theme, scale);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/soap-bubble.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Bubble UI" (ID: "soap-bubble") with:\n\n${commands.npm}\n\nUse the installed files as the source of truth. Preserve the spectral thin-film interference, gravity drainage and Marangoni swirls, the upright outer and inverted inner reflections, the mirrored surroundings in the rims, the liquid glass blend, the shared WebGL context and backdrop capture, the thumbs that refract their tracks, the pointer wobble and press squash, keyboard support, reduced-motion support and the CSS fallbacks. Installation defaults must match the catalog preview: use Light glass on light pages and Rainbow glass on dark pages, following the host application's theme. Use another material or color preset only when the user has explicitly selected one. The Bubble Liquid and Liquid Glass presets set surface to "bubble-liquid" or "liquid-glass": live glass that blurs and bends the page as it is, so no backdrop is captured; keep their liquid settings exactly as configured.\n\nApproved default material settings:\n${JSON.stringify({ light: lightMaterial, dark: materialPresets['rainbow glass'] }, null, 2)}\n\nThe React configuration below is authoritative for the selected theme, preset and all user edits. If the user modified any Oil control (Oil film, size, opacity, coverage, edges, clear centre, thickness, drainage or swirl), preserve its exact configured value instead of resetting it to a default preset. A value of 0 is intentional, including Oil film set to 0 by a color preset. Apply the theme defaults only where the user has not supplied an override. Preserve the shown lighting and reflection settings too.\n\nIntegrate the downloaded components with this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...soapBubbleSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const selectedPreset = (presets: Record<string, Partial<Values>>) =>
    Object.entries(presets).find(([, settings]) =>
      Object.entries(settings).every(([key, value]) => values[key as keyof Values] === value),
    )?.[0] ?? 'custom';
  const presetControl = (
    title: string,
    description: string,
    presets: Record<string, Partial<Values>>,
  ) => (
    <ControlField label={title} description={description}>
      <SelectControl
        label={title}
        value={selectedPreset(presets)}
        options={[
          ...Object.keys(presets).map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          })),
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(value) => {
          if (value !== 'custom' && presets[value])
            setValues((old) => ({
              ...old,
              ...presets[value],
              ...(presets === colorPresets && value !== 'original'
                ? { filmScale: 6, iridescence: 0 }
                : {}),
              ...(presets[value].tint !== undefined
                ? {
                    opacity: presets[value].tint === 'auto' ? 0 : colorAlpha(presets[value].tint!),
                  }
                : {}),
            }));
        }}
      />
    </ControlField>
  );
  const control = (name: keyof Values) => soapBubble.controls.find((item) => item.name === name)!;
  const live = values.surface !== 'bubble';
  const film = values.surface !== 'liquid-glass';
  const numbers = (names: NumericKey[]) =>
    names
      .filter((name) => !(live && replacedByLiveGlass.has(name)))
      .map((name) => {
        const control = soapBubble.controls.find((item) => item.name === name)!;
        return (
          <ControlField
            key={name}
            className="is-number"
            label={control.label}
            description={control.description ?? ''}
          >
            <NumberControl
              label={control.label}
              value={values[name]}
              min={control.min}
              max={control.max}
              step={control.step}
              normalizeValue={name === 'seed' ? Math.round : undefined}
              onChange={(value) => set(name, value)}
            />
          </ControlField>
        );
      });
  const group = (title: string, children: ReactNode) => (
    <fieldset className="reveal-control-group">
      <legend className="reveal-group-heading">
        <h3>{title}</h3>
      </legend>
      <div className="reveal-fields">{children}</div>
    </fieldset>
  );

  return (
    <ComponentDetailLayout
      componentName="Bubble UI"
      componentSlug="soap-bubble"
      description={soapBubble.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(systemExample(themeDefaults[theme], theme))}
      sourceFiles={files}
      controlsHeading={
        <div
          className="component-view-tabs soap-bubble-panel-tabs"
          role="tablist"
          aria-label="Bubble UI options"
        >
          {(['components', 'controls'] as const).map((tab) => (
            <button
              key={tab}
              id={`${panelId}-${tab}-tab`}
              type="button"
              role="tab"
              aria-selected={panelTab === tab}
              className={panelTab === tab ? 'is-active' : ''}
              aria-controls={`${panelId}-${tab}-panel`}
              tabIndex={panelTab === tab ? 0 : -1}
              onClick={() => setPanelTab(tab)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'components'
                    : event.key === 'End'
                      ? 'controls'
                      : tab === 'components'
                        ? 'controls'
                        : 'components';
                setPanelTab(next);
                document.getElementById(`${panelId}-${next}-tab`)?.focus();
              }}
            >
              {tab === 'components' ? 'Elements' : 'Controls'}
            </button>
          ))}
        </div>
      }
      preview={
        <SystemPreview
          values={values}
          theme={theme}
          scale={scale}
          popEffect={popEffect}
          preview={preview}
        />
      }
      previewActions={
        <button
          type="button"
          className="component-replay-button"
          aria-pressed={values.paused}
          onClick={() => set('paused', !values.paused)}
        >
          {values.paused ? 'Play' : 'Pause'}
        </button>
      }
      controls={
        <>
          <div
            id={`${panelId}-components-panel`}
            role="tabpanel"
            aria-labelledby={`${panelId}-components-tab`}
            className="soap-bubble-control-panel"
            hidden={panelTab !== 'components'}
          >
            <div className="soap-bubble-component-grid">
              {previewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="soap-bubble-component-card"
                  aria-pressed={preview === option.value}
                  onClick={() => {
                    setPreview(option.value);
                    setPanelTab('controls');
                    document.getElementById(`${panelId}-controls-tab`)?.focus();
                  }}
                >
                  <img
                    src={
                      previewThumbnails[
                        `./assets/soap-bubble/${option.value}${theme === 'light' ? '-light' : ''}.webp`
                      ]
                    }
                    alt=""
                    width={280}
                    height={160}
                  />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div
            id={`${panelId}-controls-panel`}
            role="tabpanel"
            aria-labelledby={`${panelId}-controls-tab`}
            className="soap-bubble-control-panel"
            hidden={panelTab !== 'controls'}
          >
            {group(
              'Preset',
              <>
                <ControlField
                  label="Preset"
                  description="Bubble Glass is the soap film refracting the captured page. Bubble Liquid lays the film over live liquid glass that blurs and bends the page as it is, so nothing is captured; Liquid Glass is that glass alone. Tuned Glass is a dark-bodied film tuned on a phone screen, and Clear Lens turns the current material into clear glass that bends only at its edge."
                >
                  <SelectControl
                    label="Preset"
                    value={surfacePresetOf(values)}
                    options={surfacePresets.map(({ value, label }) => ({ value, label }))}
                    onChange={(value) =>
                      setValues(applySurfacePreset(value as SurfacePreset, values, theme))
                    }
                  />
                </ControlField>
                {live && numbers(['liquidSplit'])}
              </>,
            )}
            {live && group('Tint', numbers(['liquidTint', 'liquidDensity', 'liquidPanelDensity']))}
            {live &&
              group('Backdrop', numbers(['liquidBlur', 'liquidSaturation', 'liquidBrightness']))}
            {live &&
              group(
                'Rim lens',
                <>
                  <ControlField
                    className="is-boolean"
                    label={control('liquidLens').label}
                    description={control('liquidLens').description ?? ''}
                  >
                    <SwitchControl
                      label={control('liquidLens').label}
                      checked={values.liquidLens}
                      onChange={(value) => set('liquidLens', value)}
                    />
                  </ControlField>
                  {numbers(['liquidRimWidth', 'liquidBend'])}
                </>,
              )}
            {!film &&
              group('Light', numbers(['liquidEdgeLight', 'liquidInnerLight', 'liquidShadow']))}
            {film &&
              group(
                'Motion',
                <>
                  {numbers(['wobble', 'speed', 'seed'])}
                  <ControlField
                    className="is-boolean"
                    label="Paused"
                    description="Hold the film. Bubbles still wobble under the pointer."
                  >
                    <SwitchControl
                      label="Paused"
                      checked={values.paused}
                      onChange={(value) => set('paused', value)}
                    />
                  </ControlField>
                </>,
              )}
            {film &&
              group(
                'Transparency',
                <>
                  {numbers([
                    'seeThrough',
                    'seeThroughBend',
                    'refraction',
                    'refractionWidth',
                    'refractionClear',
                    'backdropBlur',
                    'opacity',
                    'oilOpacity',
                  ])}
                  <ControlField
                    className="is-color"
                    label="Tint"
                    description="Color of the bubble's body; Opacity sets how solid it is. Auto is the page's own, white on light pages and black on dark ones. The film's oil keeps its own colors."
                  >
                    <ColorControl
                      label="Tint"
                      allowAuto
                      value={values.tint}
                      onChange={(value) =>
                        setValues((old) => ({
                          ...old,
                          tint: value,
                          opacity: value === 'auto' ? old.opacity : colorAlpha(value),
                        }))
                      }
                    />
                  </ControlField>
                </>,
              )}
            {group(
              'Theme',
              <ControlField
                label="Page"
                description="Follows the site's theme; you can also switch the preview here. Each theme remembers its material settings."
              >
                <SelectControl
                  label="Page"
                  value={theme}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(value) => changeTheme(value as Theme)}
                />
              </ControlField>,
            )}
            {group(
              'Size',
              <ControlField
                className="is-number"
                label="Scale"
                description="One size for every control. The switch and slider follow the buttons, so the whole set stays in proportion; 1 is the approved close-up."
              >
                <NumberControl
                  label="Scale"
                  value={scale}
                  min={0.25}
                  max={3}
                  step={0.05}
                  onChange={setScale}
                />
              </ControlField>,
            )}
            {group(
              'Pop',
              <ControlField
                label="Pop effect"
                description="What the close button leaves when it bursts: a spray of droplets thrown off the rim, small bubbles that rise from where it was and pop in turn, or both."
              >
                <SelectControl
                  label="Pop effect"
                  value={popEffect}
                  options={[
                    { value: 'spray', label: 'Droplets' },
                    { value: 'bubbles', label: 'Small bubbles' },
                    { value: 'both', label: 'Both' },
                  ]}
                  onChange={(value) => setPopEffect(value as PopEffect)}
                />
              </ControlField>,
            )}
            {film &&
              group(
                'Material',
                <>
                  {presetControl(
                    'Material preset',
                    'Installation defaults match this preview: Light glass for light pages and Rainbow glass for dark pages. A selected preset or edited Oil setting takes precedence. Color presets are kept when switching material.',
                    materialPresets,
                  )}
                  {presetControl(
                    'Color preset',
                    'Color presets set Oil film to 0 and Oil size to 6. Each keeps its own editable six-color spectrum if you turn Oil film back on. The base, shades and highlights follow the preset too; Original restores the natural palette.',
                    colorPresets,
                  )}
                  {(['soapColor', 'soapShadeColor', 'soapHighlightColor'] as const).map((name) => (
                    <ControlField
                      key={name}
                      className="is-color"
                      label={control(name).label}
                      description={control(name).description ?? ''}
                    >
                      <ColorControl
                        label={control(name).label}
                        value={values[name]}
                        allowAuto
                        onChange={(value) => set(name, value)}
                      />
                    </ControlField>
                  ))}
                  <ControlField
                    label="Soap palette"
                    description={control('soapPalette').description ?? ''}
                  >
                    <SelectControl
                      label="Soap palette"
                      value={values.soapPalette}
                      options={[
                        { value: 'natural', label: 'Original iridescence' },
                        { value: 'custom', label: 'Custom colors' },
                      ]}
                      onChange={(value) => set('soapPalette', value as Values['soapPalette'])}
                    />
                  </ControlField>
                  {values.soapPalette === 'custom' &&
                    (
                      [
                        'soapPaletteRed',
                        'soapPaletteGold',
                        'soapPaletteGreen',
                        'soapPaletteCyan',
                        'soapPaletteBlue',
                        'soapPaletteViolet',
                      ] as const
                    ).map((name) => (
                      <ControlField
                        key={name}
                        className="is-color"
                        label={control(name).label}
                        description={control(name).description ?? ''}
                      >
                        <ColorControl
                          label={control(name).label}
                          value={values[name]}
                          onChange={(value) => set(name, value)}
                        />
                      </ControlField>
                    ))}
                  {numbers([
                    'glass',
                    'iridescence',
                    'filmScale',
                    'oilCoverage',
                    'oilEdge',
                    'oilEdgeFade',
                    'clearCenter',
                    'thickness',
                    'drainage',
                    'swirl',
                    'reflectivity',
                    'dispersion',
                    'bevel',
                  ])}
                </>,
              )}
            {film &&
              group(
                'Reflections',
                <>
                  <ControlField
                    label="Lighting"
                    description={
                      soapBubble.controls.find((item) => item.name === 'environment')
                        ?.description ?? ''
                    }
                  >
                    <SelectControl
                      label="Lighting"
                      value={values.environment}
                      options={soapBubbleLightings.map((value) => ({
                        value,
                        label: value[0].toUpperCase() + value.slice(1),
                      }))}
                      onChange={(value) => set('environment', value as Values['environment'])}
                    />
                  </ControlField>
                  <ControlField
                    className="is-boolean"
                    label={control('bottomShade').label}
                    description={control('bottomShade').description ?? ''}
                  >
                    <SwitchControl
                      label={control('bottomShade').label}
                      checked={values.bottomShade}
                      onChange={(value) => set('bottomShade', value)}
                    />
                  </ControlField>
                  <ControlField
                    className="is-color"
                    label={control('bottomShadeColor').label}
                    description={control('bottomShadeColor').description ?? ''}
                  >
                    <ColorControl
                      label={control('bottomShadeColor').label}
                      value={values.bottomShadeColor}
                      allowAuto
                      onChange={(value) => set('bottomShadeColor', value)}
                    />
                  </ControlField>
                  {numbers(['mirage', 'reach', 'tilt'])}
                  {presetControl(
                    'Reflection preset',
                    'Soft gradient is a smaller window that fades almost out towards its right end; Glossy a brighter, blunt window with a long top highlight; Checkpoint the earlier look, with the original gradient and a crisp top highlight.',
                    reflectionPresets,
                  )}
                  <ControlField
                    className="is-boolean"
                    label={control('windowLight').label}
                    description={control('windowLight').description ?? ''}
                  >
                    <SwitchControl
                      label={control('windowLight').label}
                      checked={values.windowLight}
                      onChange={(value) => set('windowLight', value)}
                    />
                  </ControlField>
                  <ControlField
                    label={control('windowStyle').label}
                    description={control('windowStyle').description ?? ''}
                  >
                    <SelectControl
                      label={control('windowStyle').label}
                      value={values.windowStyle}
                      options={[
                        { value: 'edge', label: 'Edge' },
                        { value: 'bubble', label: 'Bubble (original)' },
                      ]}
                      onChange={(value) => set('windowStyle', value as Values['windowStyle'])}
                    />
                  </ControlField>
                  {numbers([
                    'windowSize',
                    'windowWidth',
                    'windowHead',
                    'windowTail',
                    'windowIntensity',
                    'windowGradient',
                    'windowLength',
                    'windowMargin',
                    'windowBend',
                  ])}
                  <ControlField
                    label={control('glintShape').label}
                    description={control('glintShape').description ?? ''}
                  >
                    <SelectControl
                      label={control('glintShape').label}
                      value={values.glintShape}
                      options={soapBubbleGlintShapes.map((value) => ({
                        value,
                        label: value[0].toUpperCase() + value.slice(1),
                      }))}
                      onChange={(value) => set('glintShape', value as Values['glintShape'])}
                    />
                  </ControlField>
                  {numbers(['glintSize', 'glintIntensity', 'glintDistance', 'glintHeight'])}
                  <ControlField
                    className="is-boolean"
                    label={control('windowTwin').label}
                    description={control('windowTwin').description ?? ''}
                  >
                    <SwitchControl
                      label={control('windowTwin').label}
                      checked={values.windowTwin}
                      onChange={(value) => set('windowTwin', value)}
                    />
                  </ControlField>
                  <ControlField
                    label={control('windowTwinShape').label}
                    description={control('windowTwinShape').description ?? ''}
                  >
                    <SelectControl
                      label={control('windowTwinShape').label}
                      value={values.windowTwinShape}
                      options={soapBubbleTwinShapes.map((value) => ({
                        value,
                        label: value[0].toUpperCase() + value.slice(1),
                      }))}
                      onChange={(value) =>
                        set('windowTwinShape', value as Values['windowTwinShape'])
                      }
                    />
                  </ControlField>
                  <ControlField
                    className="is-boolean"
                    label={control('keyLight').label}
                    description={control('keyLight').description ?? ''}
                  >
                    <SwitchControl
                      label={control('keyLight').label}
                      checked={values.keyLight}
                      onChange={(value) => set('keyLight', value)}
                    />
                  </ControlField>
                  {numbers(['topLength', 'topFade', 'topTail'])}
                </>,
              )}
          </div>
        </>
      }
      properties={[
        {
          name: 'SoapBubbleMaterial',
          type: 'component',
          defaultValue: '—',
          description:
            'Shares material props and the backdrop with every soap bubble component inside it. Components still take their own props, which win.',
        },
        {
          name: 'SoapBubbleSurface',
          type: 'component',
          defaultValue: '—',
          description:
            'Panels, bars and cards. as picks the element (div, nav, section, header, footer, aside, button); radius sets the corners; interactive turns on the wobble.',
        },
        {
          name: 'SoapBubbleButton',
          type: 'component',
          defaultValue: '—',
          description: 'A pill button sized by its content. It swells while pressed.',
        },
        {
          name: 'SoapBubbleIconButton',
          type: 'component',
          defaultValue: '—',
          description:
            'A round button for one icon; aria-label is required. It swells while pressed. Give it a tint for a coloured action.',
        },
        {
          name: 'SoapBubbleSearch',
          type: 'component',
          defaultValue: '—',
          description:
            'A search input in a bubble pill with a magnifier that wobbles gently under the pointer. Takes every input prop; placeholder doubles as its accessible name.',
        },
        {
          name: 'SoapBubbleToggle',
          type: 'component',
          defaultValue: '—',
          description:
            'role="switch". checked, defaultChecked, onCheckedChange, color (track when on) and scale. A pill-shaped bubble lens magnifies the track at rest and swells over it while pressed or moving.',
        },
        {
          name: 'SoapBubbleSlider',
          type: 'component',
          defaultValue: '—',
          description:
            'A native range input underneath. value, defaultValue, min, max, step, onValueChange, from and to (fill gradient), label and scale. The thumb swells while dragged.',
        },
        {
          name: 'SoapBubbleMenu',
          type: 'component',
          defaultValue: '—',
          description:
            'role="menu" with arrow keys and Escape. label, triggerLabel, round, items ({ label, onSelect, icon, disabled }) and align. The trigger swells into the panel with a springy bounce, the actions come into focus inside it, and closing draws it back into the button. The active item is shaded inside the panel.',
        },
        ...soapBubble.controls.map((control) => ({
          name: control.name,
          type:
            control.type === 'color'
              ? 'string'
              : control.type === 'select'
                ? (control.options ?? []).map((option) => `"${option}"`).join(' | ')
                : control.type,
          defaultValue: String(
            bubbleDefaults[control.name as keyof Values] ?? control.defaultValue,
          ),
          description: control.description ?? '',
        })),
        {
          name: 'backdrop',
          type: 'RefObject<HTMLElement> | HTMLElement | null',
          defaultValue: '—',
          description:
            'Element behind the bubbles. It is rasterized once for all of them (again whenever it changes) so the film can refract it and mirror nearby objects. Without it the live page shows through undistorted.',
        },
        {
          name: 'maxDpr',
          type: 'number',
          defaultValue: String(soapBubbleDefaults.maxDpr),
          description: 'Upper limit for the device pixel ratio of each canvas.',
        },
      ]}
    />
  );
}
