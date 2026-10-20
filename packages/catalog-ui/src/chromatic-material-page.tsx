import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Download, Heart, Mic, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ChromaticButton,
  chromaticButtonDefaults,
  chromaticButtonProjectionScale,
  chromaticButtonEntrances,
  chromaticDefaults,
  chromaticColorModes,
  chromaticHoverEffects,
  type ChromaticButtonEntrance,
  type ChromaticHoverEffect,
  type ChromaticMaterialProps,
} from '@reactdrops/components/chromatic-button';
import { chromaticButton, type ComponentMetadata } from '@reactdrops/catalog-data/catalog';
import { chromaticButtonSourceFiles } from '@reactdrops/catalog-data/sources/chromatic-button';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import {
  NumberControl,
  SelectControl,
  SingleLineTextControl,
  SwitchControl,
} from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './chromatic-material-page.css';

const colorModeLabels = ['Fixed color', '2 colors', '3 colors', 'Full spectrum'];
const previewOptions = [
  { value: 'message', label: 'Message bar' },
  { value: 'button', label: 'Button' },
  { value: 'icons', label: 'Icon buttons' },
  { value: 'message-voice', label: 'Message bar with voice' },
] as const;
type ButtonPreview = (typeof previewOptions)[number]['value'];
const {
  borderRadius: defaultBorderRadius,
  hoverEffect: defaultHoverEffect,
  entrance: defaultEntrance,
  entranceSpeed,
  entranceBlur,
  entranceDistance,
  entranceScale,
  ...buttonMaterialDefaults
} = chromaticButtonDefaults;
const entranceDefaults = {
  entranceSpeed: Number(entranceSpeed),
  entranceBlur: Number(entranceBlur),
  entranceDistance: Number(entranceDistance),
  entranceScale: Number(entranceScale),
};
const hoverLabels = ['None', 'Brighten', 'Gradient flow', 'Follow pointer'];
const entranceLabels = ['Blur + rise', 'Zoom', 'None'];
const previewRadiusDefaults = {
  button: defaultBorderRadius,
  icons: 22,
  message: 50,
  'message-voice': 50,
};
const previewProjectionDefaults = {
  button: chromaticButtonDefaults.projectionScale,
  icons: chromaticButtonProjectionScale(173.9, previewRadiusDefaults.icons, true),
  message: chromaticButtonDefaults.projectionScale,
  'message-voice': chromaticButtonDefaults.projectionScale,
};

type Values = Required<ChromaticMaterialProps> & {
  columns: number;
  rows: number;
  gap: number;
  colorSpread: number;
};
const defaults: Values = {
  ...chromaticDefaults,
  columns: 4,
  rows: 3,
  gap: 12,
  colorSpread: 1,
};

function materialValues(values: Values) {
  const { columns, rows, gap, colorSpread, ...material } = values;
  return material;
}

/**
 * The grid page passes its own component, metadata and sources, so the button
 * page (which is public) never depends on the private grid.
 */
export type GridKit = {
  symbol: string;
  metadata: ComponentMetadata;
  sourceFiles: readonly { name: string; content: string }[];
  renderPreview: (values: Record<string, unknown>, replay: number) => ReactNode;
};
export default function ChromaticMaterialPage({
  kind,
  gridKit,
}: {
  kind: 'button' | 'grid';
  gridKit?: GridKit;
}) {
  const grid = kind === 'grid' && !!gridKit;
  const initialValues = grid ? defaults : { ...defaults, ...buttonMaterialDefaults };
  const metadata = grid ? gridKit!.metadata : chromaticButton;
  const [values, setValues] = useState(initialValues);
  const [label, setLabel] = useState('Get started');
  const [disabled, setDisabled] = useState(false);
  const [hoverEffect, setHoverEffect] = useState<ChromaticHoverEffect>(defaultHoverEffect);
  const [entrance, setEntrance] = useState<ChromaticButtonEntrance>(defaultEntrance);
  const [entranceSettings, setEntranceSettings] = useState(entranceDefaults);
  const [preview, setPreview] = useState<ButtonPreview>('message');
  const messagePreview = preview === 'message' || preview === 'message-voice';
  const [previewRadii, setPreviewRadii] = useState(previewRadiusDefaults);
  const [previewProjections, setPreviewProjections] = useState(previewProjectionDefaults);
  const borderRadius = previewRadii[preview];
  const [replay, setReplay] = useState(0);
  const [origin, setOrigin] = useState('http://127.0.0.1:5174');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const set = (name: string, value: string | number | boolean) => {
    if (!grid && name === 'projectionScale') {
      setPreviewProjections((old) => ({ ...old, [preview]: value as number }));
    } else {
      setValues((old) => ({ ...old, [name]: value }));
    }
  };
  const { columns, rows, gap, colorSpread, ...sharedMaterial } = values;
  const material = grid
    ? sharedMaterial
    : { ...sharedMaterial, projectionScale: previewProjections[preview] };
  const symbol = grid ? gridKit!.symbol : 'ChromaticButton';
  const options = grid
    ? values
    : { ...material, borderRadius, hoverEffect, entrance, ...entranceSettings };
  const example = (config = options, text = label, isDisabled = disabled) => {
    const settings = Object.entries(config)
      .filter(
        ([key]) =>
          key !== 'fixedColor' &&
          (key !== 'color2' || config.colorMode.startsWith('gradient-')) &&
          (key !== 'color3' || config.colorMode === 'gradient-3'),
      )
      .map(([key, value]) => `      ${key}={${JSON.stringify(value)}}`);
    if (!grid && isDisabled) settings.push('      disabled');
    return `import { ${symbol} } from './components/${metadata.slug}';\n\nexport function Example() {\n  return (\n    <${symbol}\n${settings.join('\n')}\n${grid ? '      style={{ height: 560 }}\n    />' : `    >\n      {${JSON.stringify(text)}}\n    </ChromaticButton>`}\n  );\n}`;
  };
  const usage = example();
  const installCommands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add ${origin}/r/${metadata.slug}.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Use this private ReactDrops laboratory component, ${metadata.name}. Install from the local laboratory only:\n\n${installCommands.npm}\n\nReproduce the soft rectangular silhouette, blurred gradient field, feathered spherical reflections and hue cycle. Preserve native button semantics, reduced-motion support, visibility pausing and the CSS fallback.\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...(grid ? gridKit!.sourceFiles : chromaticButtonSourceFiles).map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const controls = (names: string[]) =>
    metadata.controls
      .filter((control) => names.includes(control.name))
      .map((control) => {
        const label =
          control.name === 'color' && !grid && values.colorMode !== 'spectrum'
            ? values.colorMode === 'fixed'
              ? 'Color'
              : 'Color 1'
            : control.label;
        return (
          <ControlField
            key={control.name}
            label={label}
            description={control.description ?? ''}
            className={control.type === 'number' ? 'is-number' : ''}
          >
            {control.type === 'number' ? (
              <NumberControl
                label={label}
                value={
                  control.name === 'projectionScale' && !grid
                    ? Math.round(
                        chromaticButtonProjectionScale(material.projectionScale, borderRadius) * 10,
                      ) / 10
                    : (values[control.name as keyof Values] as number)
                }
                min={
                  control.name === 'projectionScale' && !grid
                    ? Math.ceil(chromaticButtonProjectionScale(90, borderRadius) * 10) / 10
                    : control.min
                }
                max={
                  control.name === 'projectionScale' && !grid
                    ? Math.floor(chromaticButtonProjectionScale(179.5, borderRadius) * 10) / 10
                    : control.max
                }
                step={control.step}
                onChange={(value) =>
                  set(
                    control.name,
                    control.name === 'projectionScale' && !grid
                      ? chromaticButtonProjectionScale(value, borderRadius, true)
                      : value,
                  )
                }
              />
            ) : control.type === 'select' ? (
              <SelectControl
                label={label}
                value={values[control.name as keyof Values] as string}
                options={(control.options ?? []).map((value) => ({
                  value,
                  label:
                    control.name === 'colorMode'
                      ? colorModeLabels[chromaticColorModes.indexOf(value as Values['colorMode'])]
                      : value,
                }))}
                onChange={(value) => set(control.name, value)}
              />
            ) : control.type === 'color' ? (
              <ColorControl
                label={label}
                value={values[control.name as keyof Values] as string}
                onChange={(value) => set(control.name, value)}
              />
            ) : (
              <SwitchControl
                label={label}
                checked={values[control.name as keyof Values] as boolean}
                onChange={(value) => set(control.name, value)}
              />
            )}
          </ControlField>
        );
      });
  const entranceControls = (names: string[]) =>
    metadata.controls
      .filter((control) => names.includes(control.name))
      .map((control) => {
        const name = control.name as keyof typeof entranceSettings;
        const units = name === 'entranceScale' ? 100 : 1;
        return (
          <ControlField
            key={name}
            label={control.label}
            description={control.description ?? ''}
            className="is-number"
          >
            <NumberControl
              label={control.label}
              value={entranceSettings[name] * units}
              min={(control.min ?? 0) * units}
              max={(control.max ?? 1) * units}
              step={(control.step ?? 1) * units}
              onChange={(value) =>
                setEntranceSettings((old) => ({ ...old, [name]: value / units }))
              }
            />
          </ControlField>
        );
      });

  return (
    <ComponentDetailLayout
      componentName={metadata.name}
      componentSlug={metadata.slug}
      description={metadata.description}
      prompt={prompt(usage)}
      defaultPrompt={prompt(
        example(
          grid
            ? initialValues
            : {
                ...materialValues(initialValues),
                borderRadius: previewRadiusDefaults[preview],
                projectionScale: previewProjectionDefaults[preview],
                hoverEffect: defaultHoverEffect,
                entrance: defaultEntrance,
                ...entranceDefaults,
              },
          'Get started',
          false,
        ),
      )}
      installCommands={installCommands}
      sourceFiles={files}
      onReplay={() => setReplay((old) => old + 1)}
      previewActions={
        <>
          <button
            type="button"
            className="component-replay-button"
            aria-pressed={values.paused}
            onClick={() => set('paused', !values.paused)}
          >
            {values.paused ? 'Play' : 'Pause'}
          </button>
          <button
            type="button"
            className="component-replay-button"
            onClick={() => {
              setValues(initialValues);
              setReplay((old) => old + 1);
              setLabel('Get started');
              setDisabled(false);
              setHoverEffect(defaultHoverEffect);
              setEntrance(defaultEntrance);
              setEntranceSettings(entranceDefaults);
              setPreviewRadii(previewRadiusDefaults);
              setPreviewProjections(previewProjectionDefaults);
            }}
          >
            Reset
          </button>
        </>
      }
      preview={
        grid ? (
          gridKit!.renderPreview(values, replay)
        ) : (
          <div className={`chromatic-button-demo${messagePreview ? ' is-message' : ''}`}>
            {preview === 'button' && (
              <div className="chromatic-button-demo-main">
                <ChromaticButton
                  key={replay}
                  {...material}
                  borderRadius={borderRadius}
                  hoverEffect={hoverEffect}
                  entrance={entrance}
                  {...entranceSettings}
                  disabled={disabled}
                >
                  {label || 'Get started'}
                </ChromaticButton>
              </div>
            )}
            {preview === 'icons' && (
              <div className="chromatic-demo-swatches">
                {[
                  { color: '#ff177c', phase: 0.12, Icon: Heart, label: 'Like' },
                  { color: '#5031ff', phase: 0.28, Icon: Play, label: 'Play' },
                  { color: '#b6fb30', phase: 0.44, Icon: Download, label: 'Download' },
                ].map(({ Icon, label: iconLabel, ...variant }, index) => (
                  <ChromaticButton
                    key={`${replay}-${index}`}
                    {...material}
                    borderRadius={borderRadius}
                    hoverEffect={hoverEffect}
                    entrance={entrance}
                    {...entranceSettings}
                    {...(values.colorMode === 'spectrum' ? variant : { phase: variant.phase })}
                    disabled={disabled}
                    aria-label={iconLabel}
                    className="chromatic-button-swatch"
                  >
                    <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                  </ChromaticButton>
                ))}
              </div>
            )}
            {messagePreview && (
              <div
                className="chromatic-message-preview"
                role="group"
                aria-label={
                  preview === 'message-voice'
                    ? 'Message bar with a chromatic voice button'
                    : 'Message bar with a chromatic send button'
                }
              >
                <div className="chromatic-message-bar">
                  <Mic
                    className="chromatic-message-microphone"
                    size={32}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <ChromaticButton
                    key={`message-${replay}`}
                    {...material}
                    borderRadius={borderRadius}
                    hoverEffect={hoverEffect}
                    entrance={entrance}
                    {...entranceSettings}
                    disabled={disabled}
                    className="chromatic-message-send"
                    aria-label={preview === 'message-voice' ? 'Start voice mode' : 'Send message'}
                  >
                    <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
                      <path
                        d={
                          preview === 'message-voice'
                            ? 'M4 10v4M9 4v16M14 7v10M19 10v4'
                            : 'M12 20V4m-7 7 7-7 7 7'
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </ChromaticButton>
                </div>
              </div>
            )}
          </div>
        )
      }
      controls={
        <>
          {!grid && (
            <fieldset className="reveal-control-group">
              <legend className="reveal-group-heading">
                <h3>Preview</h3>
              </legend>
              <div className="reveal-fields">
                <ControlField
                  label="Example"
                  description="Show one example at a time: message bar (default), the button, icon buttons, or message bar with voice. Your material settings are preserved when switching."
                >
                  <SelectControl
                    label="Example"
                    value={preview}
                    options={[...previewOptions]}
                    onChange={(value) => setPreview(value as ButtonPreview)}
                  />
                </ControlField>
                <ControlField
                  label="Hover effect"
                  description="Brighten raises the light and lifts the button. Follow pointer moves and stretches the whole button with an elastic return, while its reflections follow the cursor."
                >
                  <SelectControl
                    label="Hover effect"
                    value={hoverEffect}
                    options={chromaticHoverEffects.map((value, index) => ({
                      value,
                      label: hoverLabels[index],
                    }))}
                    onChange={(value) => setHoverEffect(value as ChromaticHoverEffect)}
                  />
                </ControlField>
              </div>
            </fieldset>
          )}
          {!grid && (
            <fieldset className="reveal-control-group">
              <legend className="reveal-group-heading">
                <h3>Entrance</h3>
              </legend>
              <div className="reveal-fields">
                <ControlField
                  label="Animation"
                  description="Choose the entrance, adjust its settings, and use Replay to play it again."
                >
                  <SelectControl
                    label="Animation"
                    value={entrance}
                    options={chromaticButtonEntrances.map((value, index) => ({
                      value,
                      label: entranceLabels[index],
                    }))}
                    onChange={(value) => setEntrance(value as ChromaticButtonEntrance)}
                  />
                </ControlField>
                {entrance !== 'none' && entranceControls(['entranceSpeed'])}
                {entrance === 'blur-up' && entranceControls(['entranceBlur', 'entranceDistance'])}
                {entrance === 'zoom' && entranceControls(['entranceScale'])}
              </div>
            </fieldset>
          )}
          {grid && (
            <fieldset className="reveal-control-group">
              <legend className="reveal-group-heading">
                <h3>Grid</h3>
              </legend>
              <div className="reveal-fields">
                {controls(['columns', 'rows', 'gap', 'colorSpread'])}
              </div>
            </fieldset>
          )}
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Material</h3>
            </legend>
            <div className="reveal-fields">
              {!grid && controls(['colorMode'])}
              {!grid && (
                <ControlField
                  label="Corner radius (%)"
                  className="is-number"
                  description={`Circular corners from 0% to 50% of the shorter side. This example defaults to ${previewRadiusDefaults[preview]}%. Projection and reflections follow the contour.`}
                >
                  <NumberControl
                    label="Corner radius (%)"
                    value={borderRadius}
                    min={0}
                    max={50}
                    step={1}
                    onChange={(value) => setPreviewRadii((old) => ({ ...old, [preview]: value }))}
                  />
                </ControlField>
              )}
              {controls([
                'color',
                ...(!grid && values.colorMode.startsWith('gradient-') ? ['color2'] : []),
                ...(!grid && values.colorMode === 'gradient-3' ? ['color3'] : []),
                'feather',
                'projectionScale',
                'intensity',
                'grain',
              ])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">{controls(['speed', 'phase', 'seed', 'paused'])}</div>
          </fieldset>
          {!grid && (
            <fieldset className="reveal-control-group">
              <legend className="reveal-group-heading">
                <h3>Button</h3>
              </legend>
              <div className="reveal-fields">
                <ControlField label="Label" description="Accessible button text.">
                  <SingleLineTextControl label="Label" value={label} onChange={setLabel} />
                </ControlField>
                <ControlField
                  label="Disabled"
                  description="Disable native pointer and keyboard activation."
                >
                  <SwitchControl label="Disabled" checked={disabled} onChange={setDisabled} />
                </ControlField>
              </div>
            </fieldset>
          )}
        </>
      }
      properties={[
        ...metadata.controls.map((control) => ({
          name: control.name,
          type:
            control.name === 'entrance'
              ? chromaticButtonEntrances.map((mode) => `'${mode}'`).join(' | ')
              : control.name === 'hoverEffect'
                ? chromaticHoverEffects.map((mode) => `'${mode}'`).join(' | ')
                : control.name === 'colorMode'
                  ? chromaticColorModes.map((mode) => `'${mode}'`).join(' | ')
                  : control.type === 'color'
                    ? 'string'
                    : control.type,
          defaultValue: String(control.defaultValue),
          description: control.description ?? '',
        })),
        {
          name: 'children',
          type: 'ReactNode',
          defaultValue: grid ? '—' : 'Get started',
          description: grid
            ? 'Optional foreground content, kept above the decorative canvas.'
            : 'Button label or icons. Provide an accessible name for icon-only buttons.',
        },
        {
          name: grid ? 'className / style' : 'Native button props / ref',
          type: grid ? 'string / CSSProperties' : 'ButtonHTMLAttributes / HTMLButtonElement',
          defaultValue: '—',
          description: grid
            ? 'The grid fills its parent. Set a height on the component or its container.'
            : 'Supports onClick, disabled, type, form, aria attributes, className, style and a native button ref.',
        },
      ]}
      usage={
        grid ? (
          <p className="chromatic-related">
            The same material is available as a{' '}
            <Link to="/components/button/chromatic-button">Chromatic Button</Link>.
          </p>
        ) : undefined
      }
    />
  );
}
