'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Context,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  createSoapBubbleRenderer,
  normalizeSoapBubble,
  soapBubbleLiquidKeys,
  soapBubbleRgba,
  type SoapBubbleLayer,
  type SoapBubbleRenderer,
  type SoapBubbleSettings,
  type SoapBubbleTuning,
} from './soap-bubble-renderer';
import { attachSoapBubbleLens, soapBubbleLensSupported } from './soap-bubble-lens';

export type SoapBubbleBackdropProp = RefObject<HTMLElement | null> | HTMLElement | null;

export type SoapBubbleMaterialProps = Partial<SoapBubbleSettings> & {
  /**
   * Element behind the bubbles. Its pixels are seen through the film and
   * mirrored in the rims. Without it the live page shows through undistorted.
   */
  backdrop?: SoapBubbleBackdropProp;
};

const materialKeys = [
  'radius',
  'bevel',
  'backdropBlur',
  'thickness',
  'iridescence',
  'drainage',
  'swirl',
  'filmScale',
  'oilOpacity',
  'oilCoverage',
  'oilEdge',
  'oilEdgeFade',
  'clearCenter',
  'tint',
  'paper',
  'soapColor',
  'soapPalette',
  'soapPaletteRed',
  'soapPaletteGold',
  'soapPaletteGreen',
  'soapPaletteCyan',
  'soapPaletteBlue',
  'soapPaletteViolet',
  'soapShadeColor',
  'soapHighlightColor',
  'reflectivity',
  'mirage',
  'opacity',
  'floorLight',
  'reach',
  'refraction',
  'refractionWidth',
  'refractionClear',
  'glass',
  'dispersion',
  'environment',
  'tilt',
  'wobble',
  'speed',
  'paused',
  'windowLight',
  'keyLight',
  'windowStyle',
  'windowLength',
  'windowMargin',
  'windowBend',
  'windowSize',
  'windowWidth',
  'windowGradient',
  'topFade',
  'topTail',
  'topLength',
  'windowHead',
  'windowTail',
  'glintShape',
  'glintSize',
  'glintIntensity',
  'glintDistance',
  'glintHeight',
  'windowIntensity',
  'windowTwin',
  'windowTwinShape',
  'bottomShade',
  'bottomShadeColor',
  'seed',
  'maxDpr',
  ...soapBubbleLiquidKeys,
] as const;
const materialKeySet = new Set<string>([...materialKeys, 'backdrop']);
const liquidKeySet = new Set<string>(soapBubbleLiquidKeys);

// The live glass's body: from a thin tint to a dense one, scaled by Tint.
const thinGlass = 0.16;
const denseGlass = 0.38;
const darkGlass = [20, 20, 24];
const glassSelector = '.soap-bubble-surface:not(.soap-bubble-menu-panel), .soap-bubble-menu-clip';
// A live glass is a backdrop root: a surface inside one sees only that glass,
// so it has nothing to bend.
const glassLensRoots =
  '.soap-bubble-surface[data-soap-bubble-glass]:not(.soap-bubble-menu-panel), .soap-bubble-menu-panel[data-soap-bubble-glass] > .soap-bubble-menu-clip';

/** How the live glass looks on one surface, as CSS custom properties. */
function liquidStyle(tuning: SoapBubbleTuning, light: boolean, panel: boolean) {
  const scale = tuning.liquidTint;
  const tinted = tuning.tint.trim().toLowerCase() !== 'auto';
  const colour = tinted ? soapBubbleRgba(tuning.tint) : null;
  const own = colour ? colour.slice(0, 3) : null;
  // An explicit tint is the surface's own colour (a coloured action): the
  // glass takes it under the film on dark pages, while on light ones the film
  // paints all of it and glass beneath would only darken it. Opacity, when
  // set, is its strength; otherwise the colour's own alpha.
  const ownAlpha = colour ? (tuning.opacity < 0 ? colour[3] : tuning.opacity) : 0;
  const accent = own !== null && ownAlpha > 0;
  const base = (thinGlass + (denseGlass - thinGlass) * tuning.liquidDensity) * scale;
  const alpha = accent
    ? tuning.surface === 'bubble-liquid' && light
      ? 0
      : ownAlpha
    : base * (panel ? tuning.liquidPanelDensity : 1);
  const rgb = accent ? own : light ? [255, 255, 255] : darkGlass;
  const settle = Math.min(1, scale);
  // On white the glass lifts the page behind it rather than dimming it.
  const brightness = 1 + (tuning.liquidBrightness - (light ? 0.7 : 1)) * settle;
  const saturation = 1 + (tuning.liquidSaturation - 1) * settle;
  const edge = tuning.liquidEdgeLight;
  const shadow = tuning.liquidShadow;
  const white = (strength: number) => `rgb(255 255 255 / ${Math.min(1, strength * edge)})`;
  return {
    accent,
    properties: {
      '--soap-bubble-liquid-rgb': rgb.join(' '),
      '--soap-bubble-liquid-alpha': String(Math.min(1, alpha)),
      '--soap-bubble-liquid-filter': `blur(${tuning.liquidBlur}px) saturate(${saturation}) brightness(${brightness})`,
      '--soap-bubble-liquid-inner': String(tuning.liquidInnerLight),
      '--soap-bubble-liquid-edge': [
        `inset 1.5px 1.5px 1px -1px ${white(light ? 0.9 : 0.32)}`,
        `inset -1.5px -1.5px 1px -1px ${white(light ? 0.6 : 0.18)}`,
        `inset 0 0 0 0.5px ${white(light ? 0.5 : 0.1)}`,
        `0 0 0 0.5px rgb(0 0 0 / ${light ? 0.06 : 0.3})`,
        `0 6px 24px rgb(0 0 0 / ${Math.min(1, (light ? 0.12 : 0.3) * shadow)})`,
      ].join(', '),
    } as Record<string, string>,
  };
}

/** Splits material props from everything else a component receives. */
export function splitMaterial<T extends SoapBubbleMaterialProps>(props: T) {
  const material: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (materialKeySet.has(key)) {
      if (value !== undefined) material[key] = value;
    } else rest[key] = value;
  }
  return [
    material as SoapBubbleMaterialProps,
    rest as Omit<T, keyof SoapBubbleMaterialProps>,
  ] as const;
}

// Kept outside the module: hot reloading evaluates this file again, and a new
// context would cut the controls off from the Material already on the page, so
// they would fall back to the default material.
const materialContexts = globalThis as unknown as Record<
  symbol,
  Context<SoapBubbleMaterialProps> | undefined
>;
const materialContextKey = Symbol.for('reactdrops.soap-bubble.material');
const MaterialContext = (materialContexts[materialContextKey] ??=
  createContext<SoapBubbleMaterialProps>({}));

/** Shares one material and backdrop with every soap bubble component inside. */
export function SoapBubbleMaterial({
  children,
  ...material
}: SoapBubbleMaterialProps & { children?: ReactNode }) {
  const outer = useContext(MaterialContext);
  const [own] = splitMaterial(material);
  return (
    <MaterialContext.Provider value={{ ...outer, ...own }}>{children}</MaterialContext.Provider>
  );
}

/**
 * Light or dark, from the nearest data-theme attribute (as sites with a theme
 * switch set it) or else the system preference.
 */
function useColorScheme(host: RefObject<HTMLElement | null>) {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const theme = host.current?.closest('[data-theme]')?.getAttribute('data-theme');
      setScheme(theme === 'dark' || (theme !== 'light' && query.matches) ? 'dark' : 'light');
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-theme'],
    });
    query.addEventListener('change', read);
    return () => {
      observer.disconnect();
      query.removeEventListener('change', read);
    };
  }, [host]);
  return scheme;
}

/**
 * Runs one soap bubble: host is the bubble's box, canvas where it is drawn.
 * Component defaults sit under the shared material, own props over it.
 */
export function useSoapBubble({
  host,
  canvas,
  defaults,
  material,
  interactive = true,
  hoverOnly = false,
  pointerTarget,
  glass,
  panel = false,
  adjust,
}: {
  host: RefObject<HTMLElement | null>;
  canvas: RefObject<HTMLCanvasElement | null>;
  defaults?: Partial<SoapBubbleSettings>;
  material: SoapBubbleMaterialProps;
  interactive?: boolean;
  /** Only a slight response to the pointer passing over, for a large surface that is not pressed. */
  hoverOnly?: boolean;
  /** Element that receives pointer events; the host by default. */
  pointerTarget?: RefObject<HTMLElement | null>;
  /** Element that carries the live glass and its rim lens; the host by default. */
  glass?: RefObject<HTMLElement | null>;
  /** A panel over text (a menu's): its live glass is denser by Panel density. */
  panel?: boolean;
  /** Last word on the merged material, for parts that must stand out. */
  adjust?: (tuning: SoapBubbleTuning) => Partial<SoapBubbleTuning>;
}) {
  const shared = useContext(MaterialContext);
  const { backdrop: ownBackdrop, ...own } = material;
  const { backdrop: sharedBackdrop, ...sharedMaterial } = shared;
  const scheme = useColorScheme(host);
  const settings = { ...defaults, ...sharedMaterial, ...own };
  const merged = normalizeSoapBubble({
    ...settings,
    environment:
      settings.environment === 'auto'
        ? scheme === 'dark'
          ? 'studio'
          : 'soft'
        : settings.environment,
  });
  const tuning = adjust ? normalizeSoapBubble({ ...merged, ...adjust(merged) }) : merged;
  const backdrop = ownBackdrop !== undefined ? ownBackdrop : sharedBackdrop;
  const engine = useRef<SoapBubbleRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(tuning);
  latest.current = tuning;
  // The film redraws for what it reads; the live glass is CSS alone.
  const key = JSON.stringify(tuning, (name, value) => (liquidKeySet.has(name) ? undefined : value));
  const live = tuning.surface !== 'bubble';
  // Liquid glass on its own has no film to draw, so it needs no WebGL.
  const film = tuning.surface !== 'liquid-glass';
  const light = scheme === 'light';
  const liquid = live ? liquidStyle(tuning, light, panel) : null;
  const liquidKey = liquid ? JSON.stringify(liquid) : '';
  // Marked on the component's own root: the surface, or a control's frame.
  useLayoutEffect(() => {
    const root = (pointerTarget ?? host).current;
    if (!root) return;
    const properties: Record<string, string> = liquid?.properties ?? {};
    if (liquid) {
      root.dataset.soapBubbleGlass = tuning.surface;
      root.toggleAttribute('data-soap-bubble-glass-light', light);
      root.toggleAttribute('data-soap-bubble-accent', liquid.accent);
      for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
    }
    return () => {
      delete root.dataset.soapBubbleGlass;
      root.removeAttribute('data-soap-bubble-glass-light');
      root.removeAttribute('data-soap-bubble-accent');
      for (const name of Object.keys(properties)) root.style.removeProperty(name);
    };
    // liquidKey stands for everything liquid holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, pointerTarget, liquidKey, tuning.surface, light]);
  // The rim lens, where the browser draws one: on surfaces and a menu's clip,
  // and not on one inside another live glass, which only sees that glass.
  const lens = live && tuning.liquidLens;
  const lensSettings = {
    rimWidth: tuning.liquidRimWidth,
    bend: tuning.liquidBend,
    split: tuning.liquidSplit,
  };
  const lensRef = useRef<ReturnType<typeof attachSoapBubbleLens> | null>(null);
  useEffect(() => {
    const target = (glass ?? host).current;
    const corners = host.current;
    if (!lens || !target || !corners || !soapBubbleLensSupported()) return;
    if (!target.matches(glassSelector) || target.parentElement?.closest(glassLensRoots)) return;
    const attached = attachSoapBubbleLens(target, corners, lensSettings);
    lensRef.current = attached;
    return () => {
      attached.dispose();
      lensRef.current = null;
    };
    // The settings reach the lens below without making it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, glass, host]);
  useEffect(() => {
    lensRef.current?.update(lensSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lensSettings.rimWidth, lensSettings.bend, lensSettings.split]);
  useLayoutEffect(() => {
    host.current?.style.setProperty(
      '--soap-bubble-tint',
      tuning.tint.trim().toLowerCase() === 'auto' ? 'transparent' : tuning.tint,
    );
    for (const [key, value] of [
      ['soap-color', tuning.soapColor],
      ['soap-shade-color', tuning.soapShadeColor],
      ['soap-highlight-color', tuning.soapHighlightColor],
    ])
      host.current?.style.setProperty(
        `--soap-bubble-${key}`,
        value.trim().toLowerCase() === 'auto' ? 'transparent' : value,
      );
  }, [host, tuning.tint, tuning.soapColor, tuning.soapShadeColor, tuning.soapHighlightColor]);
  useLayoutEffect(() => {
    const colours = [
      tuning.soapPaletteRed,
      tuning.soapPaletteGold,
      tuning.soapPaletteGreen,
      tuning.soapPaletteCyan,
      tuning.soapPaletteBlue,
      tuning.soapPaletteViolet,
    ];
    const stops = [...colours, colours[0]].map(
      (colour) => `color-mix(in srgb, ${colour} ${tuning.oilOpacity * 60}%, transparent)`,
    );
    host.current?.style.setProperty(
      '--soap-bubble-custom-palette',
      tuning.soapPalette === 'custom'
        ? `conic-gradient(from 45deg, ${stops.join(', ')})`
        : 'linear-gradient(transparent, transparent)',
    );
  }, [
    host,
    tuning.soapPalette,
    tuning.oilOpacity,
    tuning.soapPaletteRed,
    tuning.soapPaletteGold,
    tuning.soapPaletteGreen,
    tuning.soapPaletteCyan,
    tuning.soapPaletteBlue,
    tuning.soapPaletteViolet,
  ]);
  // CSS motion (the press swell) follows the same jiggle as the film.
  useLayoutEffect(() => {
    host.current?.style.setProperty('--soap-bubble-wobble', String(tuning.wobble));
  }, [host, tuning.wobble]);

  useEffect(() => {
    if (!film || !canvas.current || !host.current) return;
    let renderer: SoapBubbleRenderer | null = null;
    try {
      renderer = createSoapBubbleRenderer(canvas.current, host.current, latest.current, () =>
        setReady(true),
      );
    } catch {
      renderer = null;
    }
    engine.current = renderer;
    return () => {
      renderer?.dispose();
      engine.current = null;
      setReady(false);
    };
  }, [canvas, host, film]);
  useEffect(() => {
    const explicit = host.current?.closest('[data-theme]')?.getAttribute('data-theme');
    const light =
      explicit === 'light' ||
      (explicit !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
    engine.current?.setLightTheme(light);
  }, [scheme, host]);
  useLayoutEffect(() => engine.current?.update(latest.current), [key]);
  const backdropElement = backdrop && 'current' in backdrop ? backdrop.current : (backdrop ?? null);
  // Live glass reads the page as it is: nothing captures it.
  useEffect(() => {
    engine.current?.setBackdrop(live ? null : backdropElement);
  });

  useEffect(() => {
    if (!interactive) return;
    const element = (pointerTarget ?? host).current;
    const shape = host.current;
    if (!element || !shape) return;
    // Pointer position in bubble radii, y up, measured from the centre.
    const local = (event: PointerEvent) => {
      const rect = shape.getBoundingClientRect();
      const radius = Math.max(1, Math.min(shape.clientWidth, shape.clientHeight) / 2);
      return [
        (event.clientX - rect.left - rect.width / 2) / radius,
        -(event.clientY - rect.top - rect.height / 2) / radius,
      ] as const;
    };
    const strength = hoverOnly ? 0.15 : 1;
    const disabled = () => hoverOnly || (element as HTMLButtonElement).disabled === true;
    const onMove = (event: PointerEvent) => {
      const [x, y] = local(event);
      engine.current?.pointer(x, y, true, strength);
    };
    const onLeave = (event: PointerEvent) => {
      const [x, y] = local(event);
      engine.current?.pointer(x, y, false, strength);
      engine.current?.press(false);
    };
    const onDown = () => {
      if (!disabled()) engine.current?.press(true);
    };
    const onUp = () => engine.current?.press(false);
    // Typing in a field inside the bubble is not a press.
    const typing = (event: KeyboardEvent) =>
      (event.target as Element | null)?.matches?.('input, textarea, [contenteditable]') === true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event)) return;
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !disabled())
        engine.current?.press(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (typing(event)) return;
      if (event.key === ' ' || event.key === 'Enter') engine.current?.press(false);
    };
    const onBlur = () => engine.current?.press(false);
    const listeners: [string, EventListener][] = [
      ['pointermove', onMove as EventListener],
      ['pointerenter', onMove as EventListener],
      ['pointerleave', onLeave as EventListener],
      ['pointercancel', onLeave as EventListener],
      ['pointerdown', onDown as EventListener],
      ['pointerup', onUp],
      ['keydown', onKeyDown as EventListener],
      ['keyup', onKeyUp as EventListener],
      ['blur', onBlur],
    ];
    listeners.forEach(([type, listener]) => element.addEventListener(type, listener));
    return () =>
      listeners.forEach(([type, listener]) => element.removeEventListener(type, listener));
  }, [interactive, hoverOnly, host, pointerTarget]);

  return {
    ready,
    tuning,
    engine,
    setLayer: (layer: SoapBubbleLayer | null) => engine.current?.setLayer(layer),
  };
}
