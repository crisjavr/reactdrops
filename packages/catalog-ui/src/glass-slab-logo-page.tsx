import { glassSlabLogoSourceFiles } from '@reactdrops/catalog-data/sources/glass-slab-logo';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  glassSlabLogoColorPresets,
  glassSlabLogoDefaults,
  glassSlabLogoMarks,
  prepareGlassSlabLogoUpload,
  recommendGlassSlabLogoDiscs,
  type GlassSlabLogoTuning,
  type GlassSlabLogoProps,
} from '@reactdrops/components/glass-slab-logo';
import { ComponentDetailLayout, type ComponentPackageManager } from './component-detail-layout';
import { requestComponentPreview } from './component-preview-miniature';
import { ControlField, ControlsResetButton } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import { ImageUploadControl } from './image-upload-control';
import { useGlassSlabLogoStudio } from './glass-slab-logo-studio';
import './catalog.css';
import './glass-slab-logo-page.css';

type Values = Omit<GlassSlabLogoTuning, 'logo'>;
type NumericKey = { [K in keyof Values]: Values[K] extends number ? K : never }[keyof Values];
type Mark = keyof typeof glassSlabLogoMarks;
type Theme = 'light' | 'dark';
const palettes = [
  { value: 'citrus', label: 'Citrus' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'clear', label: 'Clear Glass' },
  { value: 'oil', label: 'Oil' },
] as const;
type Palette = (typeof palettes)[number]['value'];
const paletteFields = [
  'colors',
  'backgroundColor',
  'lightColor',
  'ambient',
  'exposure',
  'clearGlass',
  'oilFinish',
] as const;
const effectFields = ['density', 'thickness', 'depth', 'ior', 'reflectivity'] as const;
const effectPresets = {
  intense: {
    label: 'Intense',
    values: { density: 1.15, thickness: 0.008, depth: 0.5, ior: 1.1, reflectivity: 1.5 },
  },
  superRefractive: {
    label: 'Super Refractive',
    values: { density: 1, thickness: 0.008, depth: 0.5, ior: 1.91, reflectivity: 1.5 },
  },
  default: { label: 'Default', values: {} },
} satisfies Record<
  string,
  { label: string; values: Partial<Pick<Values, (typeof effectFields)[number]>> }
>;
type EffectPreset = keyof typeof effectPresets;
const effectOptions = Object.entries(effectPresets).map(([value, { label }]) => ({ value, label }));

const renderModes = [
  { value: 'auto', label: 'Automatic' },
  { value: 'detailed', label: 'Detailed cutout' },
  { value: 'ellipses', label: 'Simple ellipses' },
] as const;
const renderModeHelp =
  'Detailed cutout follows interior details and fine edges. Simple ellipses prioritize speed. Automatic chooses per logo.';

const { logo: _defaultLogo, ...defaults } = glassSlabLogoDefaults;
const description =
  'Turns any logo into a stack of tinted glass discs, ray traced with refraction, reflection and absorption and seen from below like a product shot on a lit card. Every horizontal run of the logo becomes one disc; small pieces such as a leaf get their own finer stack. White and empty parts of the logo are cut out of the glass, so emblems, scripts and line art keep their gaps.';

const numbers: Record<
  NumericKey,
  { label: string; description: string; min: number; max: number; step: number }
> = {
  slabs: {
    label: 'Discs',
    description: 'Total rows of discs. Each logo gets a suggested count that you can adjust.',
    min: 3,
    max: 64,
    step: 1,
  },
  phase: {
    label: 'Cut position',
    description:
      'Where each disc samples the logo inside its band: 0 the top of the band, 1 the bottom.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  band: {
    label: 'Slice coverage',
    description:
      'How much of its slice each disc covers: 0 the width along the cut line, 1 the widest part of the slice.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  minPieceSlabs: {
    label: 'Discs per small piece',
    description: 'Detached pieces (a leaf, a dot) get at least this many discs of their own.',
    min: 1,
    max: 24,
    step: 1,
  },
  thickness: {
    label: 'Thickness',
    description:
      'Glass thickness as a share of the logo height. Thicker glass shows lighter edges.',
    min: 0.002,
    max: 0.04,
    step: 0.001,
  },
  depth: {
    label: 'Depth',
    description: 'Front-to-back size of each disc, relative to the spacing between discs.',
    min: 0.2,
    max: 3,
    step: 0.05,
  },
  ior: {
    label: 'Refractive index',
    description: 'How strongly the glass bends light. 1.5 is window glass.',
    min: 1.1,
    max: 2.2,
    step: 0.01,
  },
  reflectivity: {
    label: 'Reflections',
    description: 'Strength of the reflections on the glass.',
    min: 0,
    max: 2,
    step: 0.05,
  },
  density: {
    label: 'Color density',
    description: 'Tint strength. In Oil, this sets the opacity of the glass body.',
    min: 0,
    max: 4,
    step: 0.05,
  },
  elevation: {
    label: 'Camera angle (°)',
    description:
      'How far below the logo the camera sits. Drag up or down in the preview to adjust.',
    min: 5,
    max: 60,
    step: 1,
  },
  distance: {
    label: 'Camera distance',
    description: 'In logo heights. Closer opens the top discs and flattens the bottom ones.',
    min: 0.6,
    max: 6,
    step: 0.05,
  },
  keystone: {
    label: 'Camera tilt',
    description:
      'Tilts the sensor up with the camera. The stack is reshaped so the logo keeps its outline.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  aperture: {
    label: 'Lens blur',
    description: 'Lens opening. Softens the far edge of each disc while the near edges stay sharp.',
    min: 0,
    max: 0.2,
    step: 0.005,
  },
  focus: {
    label: 'Focus',
    description: 'Depth in focus, in disc depths: -1 the near edges, 0 the middle of the discs.',
    min: -2,
    max: 2,
    step: 0.05,
  },
  exposure: {
    label: 'Exposure',
    description:
      'Brightness of the lit card behind the glass. Above 1 the colors saturate like a backlit photo.',
    min: 0.3,
    max: 3,
    step: 0.05,
  },
  ambient: {
    label: 'Studio light',
    description:
      'Light around the card. Dark outlines the glass with dark edges; bright makes them glow.',
    min: 0,
    max: 2,
    step: 0.01,
  },
  backdropSize: {
    label: 'Card size',
    description: 'Size of the lit card relative to the view. Smaller darkens more of each edge.',
    min: 1,
    max: 4,
    step: 0.05,
  },
  backdropDistance: {
    label: 'Card distance',
    description: 'How far behind the logo the card stands, in logo heights.',
    min: 0.2,
    max: 20,
    step: 0.1,
  },
  logoScale: {
    label: 'Logo scale',
    description: 'Logo size relative to the shorter side.',
    min: 0.1,
    max: 1,
    step: 0.01,
  },
  tilt: {
    label: 'Pointer tilt (°)',
    description: 'How far the camera orbits toward the pointer. 0 keeps it still.',
    min: 0,
    max: 12,
    step: 0.5,
  },
  introDuration: {
    label: 'Intro (s)',
    description: 'Seconds for the expansion to climb from the bottom disc to the top one.',
    min: 0.2,
    max: 6,
    step: 0.1,
  },
  delay: {
    label: 'Delay (s)',
    description: 'Seconds to wait before the glass starts expanding.',
    min: 0,
    max: 30,
    step: 0.01,
  },
  speed: {
    label: 'Speed',
    description: 'Playback speed of the expansion.',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  samples: {
    label: 'Rays per pixel',
    description: 'Rays traced per pixel once the image settles. More smooths edges and lens blur.',
    min: 4,
    max: 128,
    step: 4,
  },
};

function example(values: Values, background: Partial<GlassSlabLogoProps> = {}) {
  const props = Object.entries(values)
    .filter(
      ([name, value]) => JSON.stringify(defaults[name as keyof Values]) !== JSON.stringify(value),
    )
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`);
  for (const [name, value] of Object.entries(background)) {
    if (value === undefined) continue;
    const exampleValue =
      name === 'backgroundVideo'
        ? '/background.mp4'
        : name === 'backgroundImage'
          ? '/background.jpg'
          : value;
    props.push(`      ${name}={${JSON.stringify(exampleValue)}}`);
  }
  return `import { GlassSlabLogo } from './components/glass-slab-logo';\n\nexport function Example() {\n  return (\n    <GlassSlabLogo\n      logo="/logo.svg"\n${props.join('\n')}${props.length ? '\n' : ''}      style={{ height: 520 }}\n    />\n  );\n}`;
}

export function glassSlabLogoMeta() {
  return [{ title: 'Glass Slab Logo — ReactDrops' }, { name: 'description', content: description }];
}

export default function GlassSlabLogoPage({
  initialPalette = 'sunset',
}: { initialPalette?: 'sunset' | 'ocean' } = {}) {
  const [defaultPalette] = useState(initialPalette);
  const [palette, setPalette] = useState<Palette>(initialPalette);
  const [effect, setEffect] = useState<EffectPreset>('default');
  const [theme, setTheme] = useState<Theme | 'auto'>('auto');
  const [siteTheme, setSiteTheme] = useState<Theme>('light');
  const [overrides, setOverrides] = useState<Partial<Values>>({});
  const [mark, setMark] = useState<Mark>('apple');
  const [upload, setUpload] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [pendingUpload, setPendingUpload] = useState<{ source: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const uploadRequest = useRef<AbortController | null>(null);
  const controls = useRef<HTMLFieldSetElement>(null);
  const [recommendation, setRecommendation] = useState({
    logo: glassSlabLogoDefaults.logo,
    count: defaults.slabs,
  });
  const logo = upload || glassSlabLogoMarks[mark];
  const recommendedDiscs = recommendation.logo === logo ? recommendation.count : defaults.slabs;
  const activeTheme = theme === 'auto' ? siteTheme : theme;
  const defaultPresetKey =
    siteTheme === 'dark' ? (`${defaultPalette}Dark` as const) : defaultPalette;
  const presetKey: Palette | `${Palette}Dark` = activeTheme === 'dark' ? `${palette}Dark` : palette;
  const preset: Partial<Values> = glassSlabLogoColorPresets[presetKey];
  const effectValues = effectPresets[effect].values;
  const baseValues = useMemo(
    () => ({ ...defaults, ...preset, ...effectValues, slabs: recommendedDiscs }),
    [preset, effectValues, recommendedDiscs],
  );
  const values = useMemo(() => ({ ...baseValues, ...overrides }), [baseValues, overrides]);
  const { renderMode, phase, band, minPieceSlabs } = values;
  const cut = useMemo(
    () => ({ renderMode, phase, band, minPieceSlabs }),
    [renderMode, phase, band, minPieceSlabs],
  );
  const latestCut = useRef(cut);
  latestCut.current = cut;
  useEffect(() => () => (upload ? URL.revokeObjectURL(upload) : undefined), [upload]);
  useEffect(() => () => uploadRequest.current?.abort(), []);
  useEffect(() => {
    if (recommendation.logo === logo) return;
    let current = true;
    void recommendGlassSlabLogoDiscs(logo).then((count) => {
      if (current) setRecommendation({ logo, count });
    });
    return () => {
      current = false;
    };
  }, [logo, recommendation.logo]);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      const dark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : root.classList.contains('dark') || media.matches;
      setSiteTheme(dark ? 'dark' : 'light');
    };
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    media.addEventListener('change', read);
    read();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', read);
    };
  }, []);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setOverrides((old) => ({ ...old, [key]: value }));
  const resetDiscs = () => setOverrides(({ slabs: _slabs, ...rest }) => rest);
  const cancelUpload = () => {
    uploadRequest.current?.abort();
    uploadRequest.current = null;
    setPendingUpload(null);
    setUploadError('');
  };
  const chooseLogo = async (file: File) => {
    cancelUpload();
    const request = new AbortController();
    uploadRequest.current = request;
    const source = URL.createObjectURL(file);
    setPendingUpload({ source, name: file.name });
    let committed = false;
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      let settings = latestCut.current;
      let count = await prepareGlassSlabLogoUpload(source, settings, request.signal);
      while (settings !== latestCut.current && count !== null) {
        settings = latestCut.current;
        count = await prepareGlassSlabLogoUpload(source, settings, request.signal);
      }
      if (request.signal.aborted) return;
      if (count === null) {
        setUploadError('This browser cannot open that logo.');
        return;
      }
      committed = true;
      resetDiscs();
      setRecommendation({ logo: source, count });
      setUpload(source);
      setUploadName(file.name);
      requestComponentPreview(controls.current);
    } catch {
      if (!request.signal.aborted) setUploadError('Could not prepare that logo.');
    } finally {
      if (!committed) URL.revokeObjectURL(source);
      if (uploadRequest.current === request) {
        uploadRequest.current = null;
        setPendingUpload(null);
      }
    }
  };
  const studio = useGlassSlabLogoStudio({
    values,
    logo,
    logoLoading: pendingUpload !== null,
    cameraAngle: { ...numbers.elevation, onChange: (angle) => set('elevation', angle) },
    onClipChange: (delay, speed) => setOverrides((old) => ({ ...old, delay, speed })),
  });
  const usage = example(values, studio.backgroundProps);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/glass-slab-logo.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the ReactDrops component "Glass Slab Logo" (ID: "glass-slab-logo") with:\n\n${commands.npm}\n\nKeep the ray-traced glass (refraction, Fresnel, total internal reflection and absorption), the lit card behind the stack, the progressive sampling that stops once the image settles, reduced-motion support and visibility pausing. Use this configuration:\n\n${code}`;
  const customPalette =
    paletteFields.some(
      (field) => JSON.stringify(values[field]) !== JSON.stringify(preset[field] ?? defaults[field]),
    ) ||
    (effect === 'default' &&
      (values.reflectivity !== baseValues.reflectivity ||
        (preset.ior !== undefined && values.ior !== preset.ior)));
  const customEffect = effectFields.some((field) => values[field] !== baseValues[field]);
  const numberFields = (names: readonly NumericKey[]) =>
    names.map((name) => {
      const control = numbers[name];
      return (
        <ControlField
          key={name}
          className="is-number"
          label={control.label}
          description={control.description}
        >
          <NumberControl
            label={control.label}
            value={values[name]}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(value) => set(name, value)}
          />
        </ControlField>
      );
    });
  const color = (label: string, value: string, onChange: (value: string) => void) => (
    <ControlField key={label} className="is-color" label={label} description="">
      <ColorControl label={label} value={value} onChange={onChange} />
    </ControlField>
  );

  return (
    <ComponentDetailLayout
      componentName="Glass Slab Logo"
      componentSlug="glass-slab-logo"
      description={description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(
        example({ ...defaults, ...glassSlabLogoColorPresets[defaultPresetKey] }),
      )}
      sourceFiles={[
        { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
        ...glassSlabLogoSourceFiles.map((file) => ({
          id: file.name,
          label: file.name,
          code: file.content,
          language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
        })),
      ]}
      onReplay={studio.replay}
      controlsActions={
        <ControlsResetButton
          disabled={studio.exportBusy}
          onClick={() => {
            cancelUpload();
            studio.reset();
            setOverrides({});
            setPalette(defaultPalette);
            setEffect('default');
            setTheme('auto');
            setMark('apple');
            setUpload('');
            setUploadName('');
          }}
        />
      }
      preview={studio.preview}
      controls={
        <fieldset
          ref={controls}
          className="glass-slab-logo-studio-controls"
          disabled={studio.exportBusy}
          aria-label="Glass Slab Logo settings"
        >
          <div className="reveal-control-group">
            <div className="reveal-fields">
              <ControlField
                label="Effect preset"
                description="Set the glass optics and dimensions."
              >
                <SelectControl
                  label="Effect preset"
                  value={customEffect ? 'custom' : effect}
                  options={[...effectOptions, { value: 'custom', label: 'Custom' }]}
                  onChange={(value) => {
                    if (!Object.hasOwn(effectPresets, value)) return;
                    setEffect(value as EffectPreset);
                    setOverrides((old) => {
                      const next = { ...old };
                      for (const field of effectFields) delete next[field];
                      return next;
                    });
                  }}
                />
              </ControlField>
              <ControlField
                label="Color preset"
                description="Replace the tints and lighting at once."
              >
                <SelectControl
                  label="Color preset"
                  value={customPalette ? 'custom' : palette}
                  options={[...palettes, { value: 'custom', label: 'Custom' }]}
                  onChange={(value) => {
                    const selected = palettes.find((item) => item.value === value);
                    if (!selected) return;
                    setPalette(selected.value);
                    setOverrides((old) => {
                      const next = { ...old };
                      for (const field of paletteFields) delete next[field];
                      if (effect === 'default') {
                        delete next.reflectivity;
                        if ('ior' in glassSlabLogoColorPresets[selected.value]) delete next.ior;
                      }
                      return next;
                    });
                  }}
                />
              </ControlField>
              {numberFields(['slabs'])}
            </div>
          </div>
          {studio.timeline}
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Images</h3>
            </legend>
            <div className="reveal-fields image-upload-fields">
              {studio.mediaInput}
              <ImageUploadControl
                label="Logo"
                description="Upload an SVG, PNG, WebP or JPEG. Transparent silhouettes work best."
                hint="SVG or PNG · drop or click"
                accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
                validate={(file) =>
                  /^image\/(?:svg\+xml|png|webp|jpeg)$/i.test(file.type) ||
                  (!file.type && /\.(?:svg|png|webp|jpe?g)$/i.test(file.name))
                    ? null
                    : 'Use an SVG, PNG, WebP or JPEG file.'
                }
                preview={pendingUpload?.source ?? upload}
                fit="contain"
                surface={values.backgroundColor}
                fileName={pendingUpload?.name ?? uploadName}
                status={pendingUpload ? 'Preparing logo…' : undefined}
                revealOnUpload={false}
                onFile={(file) => void chooseLogo(file)}
                onClear={() => {
                  cancelUpload();
                  if (pendingUpload) return;
                  resetDiscs();
                  setUpload('');
                  setUploadName('');
                }}
              />
              {uploadError && (
                <p className="image-upload-control-error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>
          </fieldset>
          {studio.backgroundControls}
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Logo</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Example logo"
                description="Pick a silhouette, or upload your own logo below."
              >
                <SelectControl
                  label="Example logo"
                  value={upload ? 'custom' : mark}
                  options={[
                    { value: 'apple', label: 'Apple' },
                    { value: 'reactdrops', label: 'ReactDrops' },
                    { value: 'drop', label: 'Drop' },
                    { value: 'ring', label: 'Ring' },
                    { value: 'bolt', label: 'Bolt' },
                    ...(upload ? [{ value: 'custom', label: uploadName || 'Custom' }] : []),
                  ]}
                  onChange={(value) => {
                    if (value === 'custom' || (!pendingUpload && !upload && value === mark)) return;
                    cancelUpload();
                    resetDiscs();
                    setUpload('');
                    setUploadName('');
                    setMark(value as Mark);
                  }}
                />
              </ControlField>
              <ControlField label="Render method" description={renderModeHelp}>
                <SelectControl
                  label="Render method"
                  value={values.renderMode}
                  options={[...renderModes]}
                  onChange={(value) => {
                    const mode = renderModes.find((item) => item.value === value);
                    if (mode) set('renderMode', mode.value);
                  }}
                />
              </ControlField>
              {numberFields(['logoScale', 'phase', 'band', 'minPieceSlabs'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Glass</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Theme"
                description="Follow the site theme or choose the light or dark version of the palette."
              >
                <SelectControl
                  label="Theme"
                  value={theme}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(value) => setTheme(value as Theme | 'auto')}
                />
              </ControlField>
              {values.colors.map((tint, index) =>
                color(
                  index === 0
                    ? 'Top tint'
                    : index === values.colors.length - 1
                      ? 'Bottom tint'
                      : `Tint ${index + 1}`,
                  tint,
                  (value) =>
                    set(
                      'colors',
                      values.colors.map((old, i) => (i === index ? value : old)),
                    ),
                ),
              )}
              {numberFields(effectFields)}
              {studio.colorOpacityControl}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Camera and light</h3>
            </legend>
            <div className="reveal-fields">
              {numberFields(['elevation', 'distance', 'keystone', 'aperture', 'focus'])}
              {color(
                'Background',
                values.backgroundColor === 'transparent' ? '#ffffff' : values.backgroundColor,
                (value) => set('backgroundColor', value),
              )}
              {color('Card light', values.lightColor, (value) => set('lightColor', value))}
              {numberFields(['exposure', 'ambient', 'backdropSize', 'backdropDistance'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion and quality</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                className="is-boolean"
                label="Intro"
                description="Expand the discs from the bottom up, with a soft bounce, when the logo first shows."
              >
                <SwitchControl
                  label="Intro"
                  checked={values.intro}
                  onChange={(value) => set('intro', value)}
                />
              </ControlField>
              {numberFields(['introDuration', 'delay', 'speed', 'tilt', 'samples'])}
              {studio.playbackControls}
            </div>
          </fieldset>
          {studio.exportControls}
        </fieldset>
      }
      properties={[
        {
          name: 'logo',
          type: 'string',
          defaultValue: 'built-in mark',
          description: 'Image URL of the logo (SVG, PNG, data URL).',
        },
        {
          name: 'colorPreset',
          type: Object.keys(glassSlabLogoColorPresets).join(' | '),
          defaultValue: 'citrus',
          description: 'Tints and lighting preset. Explicit props override it.',
        },
        {
          name: 'renderMode',
          type: renderModes.map(({ value }) => value).join(' | '),
          defaultValue: defaults.renderMode,
          description: renderModeHelp,
        },
        {
          name: 'colors',
          type: 'string[]',
          defaultValue: JSON.stringify(defaults.colors),
          description: 'Glass tints from top to bottom, evenly spaced (2 to 6 hex colors).',
        },
        {
          name: 'backgroundColor',
          type: 'string',
          defaultValue: defaults.backgroundColor,
          description: 'Hex color or "transparent" for an alpha background.',
        },
        {
          name: 'backgroundImage / backgroundVideo',
          type: 'string',
          defaultValue: '—',
          description:
            'Image or muted video drawn behind the glass and cropped to cover the frame.',
        },
        {
          name: 'backgroundVideoStart / backgroundVideoEnd',
          type: 'number',
          defaultValue: '0 / video end',
          description: 'The section of the background video that plays, in seconds.',
        },
        {
          name: 'backgroundX / backgroundY / backgroundScale',
          type: 'number',
          defaultValue: '0 / 0 / 1',
          description: 'Position as a percentage of the frame and zoom of the uploaded backdrop.',
        },
        {
          name: 'backgroundTint / backgroundTintOpacity',
          type: 'string / number',
          defaultValue: '#000000 / 0',
          description: 'Color and opacity of the tint between the backdrop and the glass.',
        },
        {
          name: 'lightColor',
          type: 'string',
          defaultValue: defaults.lightColor,
          description: 'Color of the lit card seen through the glass.',
        },
        ...(Object.keys(numbers) as NumericKey[]).map((name) => ({
          name,
          type: 'number',
          defaultValue: String(defaults[name]),
          description: numbers[name].description,
        })),
        {
          name: 'maxDpr',
          type: 'number | null',
          defaultValue: 'null',
          description: 'Use the device pixel ratio or set an explicit limit.',
        },
        {
          name: 'intro',
          type: 'boolean',
          defaultValue: 'true',
          description: 'Expand the discs from the bottom up when the logo first shows.',
        },
        {
          name: 'ref',
          type: 'GlassSlabLogoHandle',
          defaultValue: '—',
          description:
            'replay(), seek(seconds), pause() and play() control the glass and its video background.',
        },
      ]}
    />
  );
}
