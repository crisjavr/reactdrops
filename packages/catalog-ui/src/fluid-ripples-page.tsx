import { useEffect, useRef, useState } from 'react';
import {
  FluidTyping,
  fluidTypingDefaults,
  fluidTypingPresets,
  fluidRipplesDefaults,
  fluidRipplesPresets,
  resolveFluidRipplesPalette,
  type FluidRipplesHandle,
  type FluidRipplesTuning,
  type FluidTypingMode,
} from '@reactdrops/components/fluid-ripples';
import { fluidRipples } from '@reactdrops/catalog-data/catalog';
import { fluidRipplesSourceFiles } from '@reactdrops/catalog-data/sources/fluid-ripples';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './fluid-ripples-page.css';

type Values = FluidRipplesTuning & {
  borderRadius: number;
  text: string;
  typeSpeed: number;
  deleteSpeed: number;
  holdDuration: number;
  loop: boolean;
  cursor: boolean;
  autoType: boolean;
  staticText: string;
  typingMode: FluidTypingMode;
  defaultValue: string;
  placeholder: string;
  inputLabel: string;
  introWave: boolean;
  introPause: number;
  naturalRhythm: boolean;
};
type NumericKey = {
  [K in keyof Values]: Values[K] extends number ? K : never;
}[keyof Values];
type BooleanKey = {
  [K in keyof Values]: Values[K] extends boolean ? K : never;
}[keyof Values];
const defaults: Values = {
  ...fluidRipplesDefaults,
  ...fluidTypingDefaults,
  text: fluidTypingDefaults.text.join('\n'),
  borderRadius: 0,
};
const colorNames = ['backgroundColor', 'blueColor', 'lavenderColor', 'highlightColor'] as const;
type ColorName = (typeof colorNames)[number];
const effectPresetKeys = Object.keys(fluidTypingPresets['rose-lagoon']) as (keyof Values)[];
// Every palette keeps the Rose Lagoon refraction, ripple shape and click interaction in light colors.
const effectPresets = (
  [
    'rose-lagoon',
    ...Object.keys(fluidRipplesPresets).filter((name) => name !== 'rose-lagoon'),
  ] as (keyof typeof fluidRipplesPresets)[]
).map((palette) => ({
  value: palette,
  label: fluidRipplesPresets[palette].label,
  settings: { ...fluidTypingPresets['rose-lagoon'], palette } as Partial<Values>,
}));
const paletteColors = (palette: Values['palette'], theme: 'light' | 'dark') =>
  Object.fromEntries(
    colorNames.map((name, index) => [name, resolveFluidRipplesPalette(palette, theme)[index]]),
  ) as Record<ColorName, string>;

function example(values = defaults) {
  const changed = Object.entries(values).filter(
    ([name, value]) => value !== defaults[name as keyof Values],
  );
  const props = changed
    .filter(([name]) => name !== 'text' && name !== 'typing')
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`);
  return `import { FluidTyping } from './components/fluid-typing';\n\nexport function Example() {\n  return (\n    <FluidTyping\n      text={${JSON.stringify(values.text.split('\n'))}}\n${props.length ? `${props.join('\n')}\n` : ''}    />\n  );\n}`;
}

function controlFor(name: string) {
  const control = fluidRipples.controls.find((item) => item.name === name);
  if (!control) throw new Error(`Missing Fluid Ripples control: ${name}`);
  return control;
}

export function fluidRipplesMeta() {
  return [
    { title: 'Fluid Typing — ReactDrops' },
    { name: 'description', content: fluidRipples.description },
  ];
}

export default function FluidRipplesPage() {
  const ref = useRef<FluidRipplesHandle>(null);
  const [storedValues, setValues] = useState<Values>(defaults);
  const values = { ...defaults, ...storedValues };
  const [replay, setReplay] = useState(0);
  const [autoDark, setAutoDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      setAutoDark(
        root.dataset.theme === 'dark' ||
          (!root.dataset.theme && (root.classList.contains('dark') || media.matches)),
      );
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    media.addEventListener('change', sync);
    sync();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, []);
  const activeTheme =
    values.theme === 'dark' || (values.theme === 'auto' && autoDark) ? 'dark' : 'light';
  const colors = paletteColors(values.palette, activeTheme);
  const selectedEffectPreset =
    effectPresets.find(({ settings }) =>
      effectPresetKeys.every((name) => values[name] === (settings as Partial<Values>)[name]),
    )?.value ?? 'custom';
  const set = <K extends keyof Values>(name: K, value: Values[K]) => {
    setValues((old) => ({ ...old, [name]: value }));
  };
  const usage = example(values);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/fluid-ripples.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Fluid Typing" (ID: "fluid-ripples") with:\n\n${commands.npm}\n\nUse FluidTyping from the installed files. Preserve the fixed text prefix, automatic/manual/static typing modes, native manual editing with value/onValueChange support, real DOM text and caret, the lone cursor's opening wave and pause, a natural typing rhythm, a ripple emitted from the caret for each typed character and sized by its typing speed, click and tap ripples, the blurred fluid surface, named palettes with light and dark variations, responsive sizing, reduced-motion support, visibility pausing, and static fallback. Integrate the downloaded component with this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...fluidRipplesSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const numbers = (names: NumericKey[]) =>
    names.map((name) => {
      const control = controlFor(name);
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
            normalizeValue={
              name === 'phase'
                ? (value) => ((value % 1) + 1) % 1
                : ['rippleCount', 'seed', 'maxFps', 'maxPixels'].includes(name)
                  ? Math.round
                  : undefined
            }
            onChange={(value) => {
              set(name, value);
            }}
          />
        </ControlField>
      );
    });
  const switches = (names: BooleanKey[]) =>
    names.map((name) => {
      const control = controlFor(name);
      return (
        <ControlField
          key={name}
          className="is-boolean"
          label={control.label}
          description={control.description ?? ''}
        >
          <SwitchControl
            label={control.label}
            checked={values[name]}
            onChange={(value) => {
              set(name, value);
            }}
          />
        </ControlField>
      );
    });

  return (
    <ComponentDetailLayout
      componentName="Fluid Typing"
      componentSlug="fluid-ripples"
      description={fluidRipples.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      sourceFiles={files}
      onReplay={() => {
        setReplay((value) => value + 1);
      }}
      preview={
        <div className="fluid-ripples-demo component-background-preview">
          <FluidTyping
            key={`${String(replay)}:${values.defaultValue}`}
            ref={ref}
            {...values}
            aria-label="Typing with liquid ripples"
          />
        </div>
      }
      previewActions={
        <button
          type="button"
          className="component-replay-button"
          aria-pressed={values.paused}
          onClick={() => {
            set('paused', !values.paused);
          }}
        >
          {values.paused ? 'Play' : 'Pause'}
        </button>
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Preset</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Effect preset"
                description="Choose the colors. Every preset keeps the Rose Lagoon refraction, ripple shape and click interaction in light colors on any page theme. Text, typing and playback stay editable."
              >
                <SelectControl
                  label="Effect preset"
                  value={selectedEffectPreset}
                  options={[
                    ...effectPresets.map(({ value, label }) => ({ value, label })),
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(value) => {
                    const preset = effectPresets.find((item) => item.value === value);
                    if (preset) setValues((old) => ({ ...old, ...preset.settings }));
                  }}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Typing</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Static text"
                description="A fixed prefix alongside the animated or editable text."
              >
                <textarea
                  aria-label="Static text"
                  className="fluid-typing-text-control"
                  rows={2}
                  value={values.staticText}
                  onChange={(event) => {
                    set('staticText', event.target.value);
                  }}
                />
              </ControlField>
              <ControlField
                label="Typing mode"
                description="Animate the text automatically, let the visitor type, or display the complete text."
              >
                <SelectControl
                  label="Typing mode"
                  value={values.typingMode}
                  options={[
                    { value: 'auto', label: 'Automatic' },
                    { value: 'manual', label: 'Manual' },
                    { value: 'static', label: 'Static' },
                  ]}
                  onChange={(mode) => {
                    setValues((old) => ({
                      ...old,
                      typingMode: mode as FluidTypingMode,
                      autoType: mode === 'auto',
                    }));
                  }}
                />
              </ControlField>
              {values.typingMode === 'manual' ? (
                <>
                  {(['defaultValue', 'placeholder', 'inputLabel'] as const).map((name) => {
                    const control = controlFor(name);
                    return (
                      <ControlField
                        key={name}
                        label={control.label}
                        description={control.description ?? ''}
                      >
                        <textarea
                          aria-label={control.label}
                          className="fluid-typing-text-control"
                          rows={2}
                          value={values[name]}
                          onChange={(event) => {
                            set(name, event.target.value);
                          }}
                        />
                      </ControlField>
                    );
                  })}
                </>
              ) : (
                <>
                  <ControlField
                    label="Text"
                    description="Type consecutive lines. Each character emits a ripple from the caret."
                  >
                    <textarea
                      aria-label="Text"
                      className="fluid-typing-text-control"
                      rows={3}
                      value={values.text}
                      onChange={(event) => {
                        set('text', event.target.value);
                      }}
                    />
                  </ControlField>
                  {values.typingMode === 'auto' && (
                    <>
                      {numbers(['typeSpeed', 'deleteSpeed', 'holdDuration'])}
                      {switches(['loop', 'introWave'])}
                      {values.introWave && numbers(['introPause'])}
                    </>
                  )}
                </>
              )}
              {switches(['naturalRhythm'])}
              <ControlField
                label="Cursor"
                className="is-boolean"
                description="Show the same blinking text caret in automatic and manual typing."
              >
                <SwitchControl
                  label="Cursor"
                  checked={values.cursor}
                  onChange={(cursor) => {
                    set('cursor', cursor);
                  }}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Ripples</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['rippleCount', 'rippleWidth', 'seed', 'borderRadius'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Refraction</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['blur', 'distortion', 'turbulenceScale', 'refraction'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Interaction</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                className="is-boolean"
                label="Click interaction"
                description="Click or tap the surface to create a wave at that position."
              >
                <SwitchControl
                  label="Click interaction"
                  checked={values.interactive}
                  onChange={(value) => {
                    set('interactive', value);
                  }}
                />
              </ControlField>
              {numbers(['interactionStrength'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Colors</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Theme"
                description="Light keeps the preset colors on any page theme. Automatic follows the page theme, and Dark uses the palette's dark variation."
              >
                <SelectControl
                  label="Theme"
                  value={values.theme}
                  options={[
                    { value: 'auto', label: 'Automatic' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(value) => {
                    set('theme', value as Values['theme']);
                  }}
                />
              </ControlField>
              {colorNames.map((name) => {
                const control = controlFor(name);
                return (
                  <ControlField
                    key={name}
                    className="is-color"
                    label={control.label}
                    description={control.description ?? ''}
                  >
                    <ColorControl
                      label={control.label}
                      value={values[name] || colors[name]}
                      onChange={(value) => {
                        set(name, value);
                      }}
                    />
                  </ControlField>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Playback</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['speed'])}
              <ControlField
                className="is-boolean"
                label="Paused"
                description="Hold the current frame. Turn off to resume from the same position."
              >
                <SwitchControl
                  label="Paused"
                  checked={values.paused}
                  onChange={(value) => {
                    set('paused', value);
                  }}
                />
              </ControlField>
              {numbers(['maxFps', 'resolutionScale', 'maxDpr', 'maxPixels'])}
            </div>
          </fieldset>
        </>
      }
      properties={[
        ...fluidRipples.controls
          .filter(
            (control) =>
              !['rippleSpacing', 'centerX', 'centerY', 'travel', 'phase'].includes(control.name),
          )
          .map((control) => ({
            name: control.name,
            type:
              control.name === 'text'
                ? 'string | string[]'
                : control.name === 'theme'
                  ? 'auto | light | dark'
                  : control.name === 'typingMode'
                    ? 'auto | manual | static'
                    : control.name === 'palette'
                      ? ['auto', ...Object.keys(fluidRipplesPresets)].join(' | ')
                      : control.type === 'color'
                        ? 'string'
                        : control.type,
            defaultValue: colorNames.includes(control.name as (typeof colorNames)[number])
              ? 'automatic'
              : String(defaults[control.name as keyof Values]),
            description: control.description ?? '',
          })),
        {
          name: 'value / onValueChange',
          type: 'string / (value: string) => void',
          defaultValue: 'uncontrolled',
          description:
            'Control manual input from React state, or omit value to use defaultValue and internal state. The callback receives committed text, including pasted text and composition input.',
        },
        {
          name: 'ref',
          type: 'FluidRipplesHandle',
          defaultValue: '—',
          description:
            'pause() and play() control typing and waves together. reset() and seek(seconds) change only the waves. rippleAt(x, y, strength?, size?) emits a wave at normalized coordinates; size 1 matches a keystroke and larger drops spread broader, faster waves.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          defaultValue: '—',
          description: 'Content layered above the fluid surface.',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description: 'Customize the outer container and responsive size.',
        },
        {
          name: 'aria-label',
          type: 'string',
          defaultValue: '—',
          description: 'Optional image description. Omit for a decorative background.',
        },
      ]}
    />
  );
}
