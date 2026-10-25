import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  FractalGlass,
  fractalGlassDefaults,
  fractalGlassPresets,
  fractalGlassEases,
  type FractalGlassEase,
  type FractalGlassMode,
  type FractalGlassCoverageMode,
  type FractalGlassHoverAnimation,
  type FractalGlassHoverPreset,
  type FractalGlassRecoveryDirection,
  type FractalGlassDirection,
  type FractalGlassSide,
  type FractalGlassHandle,
} from '@reactdrops/components/fractal-glass';
import { fractalGlass } from '@reactdrops/catalog-data/catalog';
import { fractalGlassSourceFiles } from '@reactdrops/catalog-data/sources/fractal-glass';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { ImageUploadControl } from './image-upload-control';
import { ExportButton, NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import './catalog.css';
import './fractal-glass-page.css';

const defaultImage = '/assets/fractal-glass/mountain.webp';
const defaults = { ...fractalGlassDefaults, height: 480, borderRadius: 0 };
type Values = typeof defaults;
const FractalNumberControl = memo(NumberControl);
const properties = [
  {
    name: 'src / alt',
    type: 'string',
    defaultValue: 'required',
    description:
      'Source image and its accessible alternative text. The image stays visible when WebGL or CORS is unavailable.',
  },
  ...fractalGlass.controls
    .filter((c) => !['height', 'borderRadius'].includes(c.name))
    .map((c) => ({
      name: c.name,
      type: c.type,
      defaultValue: String(c.defaultValue),
      description: c.description ?? '',
    })),
  {
    name: 'height / borderRadius',
    type: 'CSSProperties',
    defaultValue: 'auto / 0',
    description:
      'By default the responsive surface has a 1.5 aspect ratio. Override dimensions and cropping through style.',
  },
  {
    name: 'children',
    type: 'ReactNode',
    defaultValue: '—',
    description: 'Sharp, interactive foreground content above the refracted image.',
  },
  {
    name: 'maxDpr / maxPixels',
    type: 'number',
    defaultValue: '2 / 2000000',
    description:
      'Drawing buffer limits. The texture is also bounded by the GPU maximum texture size.',
  },
];
function example(values = defaults, src = defaultImage) {
  return `import { FractalGlass } from './components/fractal-glass';\n\nexport function Example() {\n  return <FractalGlass\n    src=${JSON.stringify(src)}\n    alt=${JSON.stringify(src === defaultImage ? 'Snow-covered Himalayan mountains' : 'Custom image')}\n${Object.entries(
    values,
  )
    .filter(([name]) => {
      const optical = ['relief', 'refraction', 'roughness', 'reflection', 'dispersion', 'caustics'];
      const defaultControls = [
        'smoothness',
        'textureScale',
        'blackPoint',
        'whitePoint',
        'gamma',
        'edgeWidth',
      ];
      return ![
        'maxDpr',
        'maxPixels',
        ...(values.mode === 'default' ? optical : defaultControls),
      ].includes(name);
    })
    .map(([name, value]) => `    ${name}={${JSON.stringify(value)}}`)
    .join('\n')}\n  />;\n}`;
}
export function fractalGlassMeta() {
  return [
    { title: 'Fractal Glass — ReactDrops' },
    { name: 'description', content: fractalGlass.description },
  ];
}
export default function FractalGlassPage() {
  const [values, setValues] = useState(defaults);
  const [src, setSrc] = useState(defaultImage),
    [draft, setDraft] = useState(defaultImage);
  const [upload, setUpload] = useState<{ url: string; name: string } | null>(null);
  const takeImage = (file: File) => {
    const url = URL.createObjectURL(file);
    setUpload({ url, name: file.name });
    setSrc(url);
    setDraft('');
  };
  const applyImage = () => {
    if (!draft.trim()) return;
    setUpload(null);
    setSrc(draft.trim());
  };

  useEffect(
    () => () => {
      if (upload) URL.revokeObjectURL(upload.url);
    },
    [upload],
  );
  const [replay, setReplay] = useState(0);
  const glass = useRef<FractalGlassHandle>(null);
  const exportPending = useRef(false);
  const [exportStatus, setExportStatus] = useState<'encoding' | 'ready' | null>(null);
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    if (exportStatus !== 'ready') return;
    const timer = window.setTimeout(() => setExportStatus(null), 1800);
    return () => clearTimeout(timer);
  }, [exportStatus]);
  const exportImage = async () => {
    if (exportPending.current) return;
    exportPending.current = true;
    setExportStatus('encoding');
    setExportError('');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (!glass.current) throw new Error('The glass image is not ready.');
      const blob = await glass.current.exportImage();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fractal-glass.png';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus('ready');
    } catch (error) {
      setExportStatus(null);
      setExportError(error instanceof Error ? error.message : 'Could not export the image.');
    } finally {
      exportPending.current = false;
    }
  };
  const [editingNumber, setEditingNumber] = useState(false);
  const [usage, setUsage] = useState(() => example());
  const numberChanges = useMemo(
    () =>
      Object.fromEntries(
        fractalGlass.controls.map(({ name }) => [
          name,
          (value: number) => setValues((old) => ({ ...old, [name]: value })),
        ]),
      ),
    [],
  );
  // Keep syntax highlighting and its large DOM replacement out of slider drags.
  // The preview and numeric readout still receive every value immediately.
  useEffect(() => {
    if (!editingNumber) setUsage(example(values, upload ? '/your-image.jpg' : src));
  }, [values, src, upload, editingNumber]);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((old) => ({ ...old, [key]: value }));
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/fractal-glass.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install ReactDrops Fractal Glass with:\n\n${commands.npm}\n\nUse the default rendering pipeline: duplicate the source, apply Gaussian blur at a 1080px reference width, refract through a repeated black-to-white gradient using the supplied distortion, smoothness and texture scale, orient each strip’s refraction using refractionBias (-1 left, 0 centered, 1 right), compensate the directional displacement in the source so the image stays aligned, clip to the rectangle using coverageMode (continuous for a free boundary, stripes to reveal entire divisions with hybrid soft left-to-right sweeps within each strip and opacity using transitionBlend and duration, preserving independent per-division progress during slider changes), add uniform monochromatic noise at the configured grain strength, keep the glass boundary free of dark strokes (edgeWidth 0), and adjust input levels. Default mode uses source colors without synthetic reflections. Preserve cached blur passes, centered cover crop, hover and touch activation only inside the covered section, procedural hoverAnimation revealing once with the same hybrid left-to-right soft sweep and opacity as By stripe coverage, holding full glass while active and fading only on exit, starting small covered sections almost together and smoothly increasing the stagger above half coverage into a lightly staggered curtain at full coverage, with every strip starting before the first finishes, smoothly blending neighboring fields with hoverDuration independently from coverage duration, use ease to shape coverage and both hover transitions with power4.out as the default, keyboard focus activation, reduced motion, image fallback and GPU cleanup. Respect hoverPreset: Reveal on hover starts fully glass-covered and reveals the original once, follows Glass side for its curtain order and local sweep direction, and uses recoveryDirection (reverse, same, left-to-right or right-to-left) for both the local restoration sweep and vertical curtain order on exit. Preserve interrupted transition progress while blending direction changes. Circular hoverAnimation shows full glass only inside a soft pointer-following circle across the whole image, independent of coverage and hoverPreset. hoverRadius and hoverFeather use CSS pixels; hoverDuration controls its fade. Keyboard focus centers it and touch taps place and toggle it. Pointer updates reuse cached blur textures. Optical mode retains the previous physical renderer. Foreground children stay sharp. Remote images require anonymous CORS. Configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...fractalGlassSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const numbers = (names: (keyof Values)[]) =>
    names.map((name) => {
      const control = fractalGlass.controls.find((control) => control.name === name)!;
      const label =
        name === 'hoverDuration' && values.hoverAnimation === 'circle'
          ? 'Circle fade (ms)'
          : control.label;
      return (
        <ControlField
          key={name}
          className="is-number"
          label={label}
          description={control.description ?? ''}
        >
          <FractalNumberControl
            label={label}
            value={values[name] as number}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={numberChanges[name]}
            onInteractionChange={setEditingNumber}
          />
        </ControlField>
      );
    });
  return (
    <ComponentDetailLayout
      componentName="Fractal Glass"
      componentSlug="fractal-glass"
      description={fractalGlass.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      sourceFiles={files}
      onReplay={() => setReplay((value) => value + 1)}
      preview={
        <div className="fractal-glass-demo">
          <FractalGlass
            ref={glass}
            key={replay}
            src={src}
            alt={
              upload?.name ??
              (src === defaultImage ? 'Snow-covered Himalayan mountains' : 'Custom image')
            }
            {...values}
          />
        </div>
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Glass</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Rendering mode"
                description="Use the default filter stack or the physical glass surface."
              >
                <SelectControl
                  label="Rendering mode"
                  value={values.mode}
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'optical', label: 'Optical glass' },
                  ]}
                  onChange={(value) => set('mode', value as FractalGlassMode)}
                />
              </ControlField>
              {numbers(['stripes', 'distortion', 'refractionBias', 'coverage'])}
              <ControlField
                label="Coverage mode"
                description="Continuous moves the glass boundary freely. By stripe combines soft left-to-right sweeps within each strip with opacity using Transition fade and Transition (ms). Each division keeps animating while you drag, respecting stripe count and texture scale. Horizontal stripes advance from top or bottom."
              >
                <SelectControl
                  label="Coverage mode"
                  value={values.coverageMode}
                  options={[
                    { value: 'continuous', label: 'Continuous' },
                    { value: 'stripes', label: 'By stripe' },
                  ]}
                  onChange={(value) => set('coverageMode', value as FractalGlassCoverageMode)}
                />
              </ControlField>
              {values.mode === 'default' && numbers(['smoothness', 'textureScale'])}
              {values.mode === 'optical' && numbers(['relief'])}
              <ControlField
                label="Glass side"
                description="Choose the covered edge and the Reveal on hover direction: Left reveals left to right; Right reveals right to left. Horizontal By stripe coverage uses top and bottom. Recovery direction controls the return separately."
              >
                <SelectControl
                  label="Glass side"
                  value={values.side}
                  options={[
                    {
                      value: 'left',
                      label:
                        values.coverageMode === 'stripes' && values.direction === 'horizontal'
                          ? 'Top'
                          : 'Left',
                    },
                    {
                      value: 'right',
                      label:
                        values.coverageMode === 'stripes' && values.direction === 'horizontal'
                          ? 'Bottom'
                          : 'Right',
                    },
                  ]}
                  onChange={(value) => set('side', value as FractalGlassSide)}
                />
              </ControlField>
              <ControlField
                label="Stripe direction"
                description="Choose vertical or horizontal glass flutes."
              >
                <SelectControl
                  label="Stripe direction"
                  value={values.direction}
                  options={[
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' },
                  ]}
                  onChange={(value) => set('direction', value as FractalGlassDirection)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>{values.mode === 'default' ? 'Blur, noise & levels' : 'Optics'}</h3>
            </legend>
            <div className="reveal-fields">
              {values.mode === 'default'
                ? numbers(['blur', 'grain', 'blackPoint', 'whitePoint', 'gamma', 'edgeWidth'])
                : numbers([
                    'refraction',
                    'reflection',
                    'roughness',
                    'dispersion',
                    'caustics',
                    'blur',
                    'grain',
                  ])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Interaction</h3>
            </legend>
            <div className="reveal-fields">
              {values.hoverAnimation !== 'circle' && (
                <ControlField
                  label="Hover preset"
                  description="Glass on hover starts clear. Reveal on hover starts with full-image glass, reveals from right to left and recovers in the reverse direction. Glass side controls the reveal; Recovery direction controls the return. Coverage and timing remain editable."
                >
                  <SelectControl
                    label="Hover preset"
                    value={values.hoverPreset}
                    options={[
                      { value: 'glass-on-hover', label: 'Glass on hover' },
                      { value: 'reveal-on-hover', label: 'Reveal on hover' },
                    ]}
                    onChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        ...fractalGlassPresets[value as FractalGlassHoverPreset],
                      }))
                    }
                  />
                </ControlField>
              )}
              <ControlField
                className="is-boolean"
                label="Hover effect"
                description="Enable the selected hover animation. Circular glass follows the pointer anywhere on the image. Keyboard focus activates it; tap to place and toggle the circle on touch devices."
              >
                <SwitchControl
                  label="Hover effect"
                  checked={values.hoverEffect}
                  onChange={(value) => set('hoverEffect', value)}
                />
              </ControlField>
              {values.hoverEffect && (
                <ControlField
                  label="Hover animation"
                  description="Choose the normal strip reveal, a global transition, or Circular glass: a soft circle that follows the pointer and shows glass distortion inside it. The circle works across the whole image."
                >
                  <SelectControl
                    label="Hover animation"
                    value={values.hoverAnimation}
                    options={[
                      { value: 'procedural', label: 'Procedural reveal' },
                      { value: 'transition', label: 'Transition' },
                      { value: 'circle', label: 'Circular glass' },
                    ]}
                    onChange={(value) => {
                      if (value === 'circle') {
                        setValues((current) => ({
                          ...current,
                          ...fractalGlassPresets['circular-glass'],
                        }));
                      } else {
                        set('hoverAnimation', value as FractalGlassHoverAnimation);
                      }
                    }}
                  />
                </ControlField>
              )}
              {values.hoverEffect &&
                values.hoverPreset === 'reveal-on-hover' &&
                values.hoverAnimation === 'procedural' && (
                  <ControlField
                    label="Recovery direction"
                    description="Choose how glass returns on exit: reverse the reveal, follow it, or set an independent left-to-right or right-to-left direction. Changes affect both each strip's sweep and the vertical curtain's order."
                  >
                    <SelectControl
                      label="Recovery direction"
                      value={values.recoveryDirection}
                      options={[
                        { value: 'reverse', label: 'Reverse reveal' },
                        { value: 'same', label: 'Same as reveal' },
                        { value: 'left-to-right', label: 'Left to right' },
                        { value: 'right-to-left', label: 'Right to left' },
                      ]}
                      onChange={(value) =>
                        set('recoveryDirection', value as FractalGlassRecoveryDirection)
                      }
                    />
                  </ControlField>
                )}
              {values.hoverEffect &&
                (values.hoverAnimation === 'procedural' || values.hoverAnimation === 'circle') &&
                numbers(['hoverDuration'])}
              {values.hoverEffect &&
                values.hoverAnimation === 'circle' &&
                numbers(['hoverRadius', 'hoverFeather'])}
              {values.hoverAnimation !== 'circle' && numbers(['transitionBlend', 'duration'])}
              <ControlField
                label="Easing curve"
                description="Timing curve for coverage and hover animations, including the circular glass fade. Power4 out starts quickly and slows smoothly into place."
              >
                <SelectControl
                  label="Easing curve"
                  value={values.ease}
                  options={fractalGlassEases.map((value) => ({
                    value,
                    label: value === 'none' ? 'Linear (none)' : value,
                  }))}
                  onChange={(value) => set('ease', value as FractalGlassEase)}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Disabled"
                description="Show the original image and stop the transition."
              >
                <SwitchControl
                  label="Disabled"
                  checked={values.disabled}
                  onChange={(value) => set('disabled', value)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Image &amp; appearance</h3>
            </legend>
            <div className="reveal-fields">
              <ImageUploadControl
                label="Image URL"
                description="Enter an image URL and apply it, or drop an image here or use the upload button."
                preview={upload?.url}
                fileName={upload?.name}
                url={{
                  value: draft,
                  placeholder: upload?.name,
                  canApply: Boolean(draft.trim()) && (Boolean(upload) || draft.trim() !== src),
                  onChange: setDraft,
                  onApply: applyImage,
                }}
                onFile={takeImage}
                onClear={() => {
                  setUpload(null);
                  setSrc(defaultImage);
                  setDraft(defaultImage);
                }}
              />
              {numbers(['height', 'borderRadius'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Export</h3>
            </legend>
            <div className="reveal-fields">
              <div className="reveal-export-action">
                <ExportButton
                  className="fractal-glass-export"
                  aria-label="Export image"
                  busy={exportStatus === 'encoding'}
                  ready={exportStatus === 'ready'}
                  onClick={exportImage}
                >
                  {exportStatus === 'encoding'
                    ? 'Exporting PNG…'
                    : exportStatus === 'ready'
                      ? 'Image ready'
                      : 'Export image'}
                </ExportButton>
              </div>
              {exportError && (
                <p className="fractal-glass-export-error" role="alert">
                  {exportError}
                </p>
              )}
            </div>
          </fieldset>
        </>
      }
      properties={properties}
    />
  );
}
