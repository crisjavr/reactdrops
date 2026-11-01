'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  createSoapBubbleRenderer,
  normalizeSoapBubble,
  type SoapBubbleLayer,
  type SoapBubbleRenderer,
  type SoapBubbleSettings,
  type SoapBubbleTuning,
} from './soap-bubble-renderer';

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
  'seeThrough',
  'seeThroughBend',
  'opacity',
  'floorLight',
  'reach',
  'refraction',
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
] as const;
const materialKeySet = new Set<string>([...materialKeys, 'backdrop']);

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

const MaterialContext = createContext<SoapBubbleMaterialProps>({});

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
  pointerTarget,
  adjust,
}: {
  host: RefObject<HTMLElement | null>;
  canvas: RefObject<HTMLCanvasElement | null>;
  defaults?: Partial<SoapBubbleSettings>;
  material: SoapBubbleMaterialProps;
  interactive?: boolean;
  /** Element that receives pointer events; the host by default. */
  pointerTarget?: RefObject<HTMLElement | null>;
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
  const key = JSON.stringify(tuning);
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
    if (!canvas.current || !host.current) return;
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
    };
  }, [canvas, host]);
  useEffect(() => {
    const explicit = host.current?.closest('[data-theme]')?.getAttribute('data-theme');
    const light =
      explicit === 'light' ||
      (explicit !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
    engine.current?.setLightTheme(light);
  }, [scheme, host]);
  useLayoutEffect(() => engine.current?.update(latest.current), [key]);
  const backdropElement = backdrop && 'current' in backdrop ? backdrop.current : (backdrop ?? null);
  useEffect(() => {
    engine.current?.setBackdrop(backdropElement);
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
    const disabled = () => (element as HTMLButtonElement).disabled === true;
    const onMove = (event: PointerEvent) => {
      const [x, y] = local(event);
      engine.current?.pointer(x, y, true);
    };
    const onLeave = (event: PointerEvent) => {
      const [x, y] = local(event);
      engine.current?.pointer(x, y, false);
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
  }, [interactive, host, pointerTarget]);

  return {
    ready,
    tuning,
    engine,
    setLayer: (layer: SoapBubbleLayer | null) => engine.current?.setLayer(layer),
  };
}
