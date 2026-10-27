import { useState } from 'react';
import { ColorControl } from './color-control';
import { refractedText } from '@reactdrops/catalog-data/catalog';
import { refractedTextSourceFiles } from '@reactdrops/catalog-data/sources/refracted-text';
import { RefractedText, type RefractedLiftEase } from '@reactdrops/components/refracted-text';
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
import './catalog.css';
import './refracted-text-page.css';

const defaults = {
  text: 'PRO',
  theme: 'dark' as 'auto' | 'light' | 'dark',
  topColor: 'auto',
  bottomColor: 'auto',
  beamColor: 'auto',
  spectrumWarmColor: 'auto',
  spectrumMiddleColor: 'auto',
  spectrumCoolColor: 'auto',
  reveal: true,
  stagger: 0.55,
  liftDuration: 1.75,
  ease: 'power4.out' as RefractedLiftEase,
  beamFollowsLift: false,
  animateBeam: true,
  openingDuration: 6.9,
  duration: 13.2,
  intensity: 1.2,
  dispersion: 1,
  colorIntensity: 1,
  beamPosition: 0.5,
  fixedBeam: false,
  paused: false,
  cursorMovesBeam: false,
  fontSize: '400px',
  fontFamily: "'ReactDrops Square Display', 'Arial Black', sans-serif",
  fontWeight: 900,
  letterSpacing: 'normal',
  extraBold: 2.25,
  fontHeight: 80,
  cornerRounding: 1,
};

type Values = typeof defaults;
type PresetSettings = Partial<
  Pick<
    Values,
    | 'fontSize'
    | 'fontFamily'
    | 'fontWeight'
    | 'letterSpacing'
    | 'extraBold'
    | 'fontHeight'
    | 'cornerRounding'
    | 'beamPosition'
    | 'fixedBeam'
    | 'cursorMovesBeam'
    | 'duration'
    | 'openingDuration'
    | 'intensity'
    | 'topColor'
    | 'bottomColor'
    | 'beamColor'
    | 'spectrumWarmColor'
    | 'spectrumMiddleColor'
    | 'spectrumCoolColor'
    | 'dispersion'
    | 'colorIntensity'
    | 'paused'
    | 'theme'
    | 'reveal'
    | 'stagger'
    | 'liftDuration'
    | 'beamFollowsLift'
    | 'animateBeam'
  >
>;
const liftEases: RefractedLiftEase[] = [
  'power4.out',
  'power3.out',
  'power2.out',
  'power1.out',
  'expo.out',
  'sine.out',
  'sine.inOut',
  'none',
];

const presets: { value: string; label: string; settings: PresetSettings }[] = [
  {
    value: 'original',
    label: 'Lift + flow',
    settings: {
      ...defaults,
      theme: 'dark',
      reveal: true,
      stagger: 0.55,
      liftDuration: 1.75,
      beamFollowsLift: false,
      animateBeam: true,
      openingDuration: 6.9,
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 13.2,
      intensity: 1.2,
    },
  },
  {
    value: 'static',
    label: 'Static flow (original)',
    settings: {
      theme: 'dark',
      reveal: false,
      stagger: 0.55,
      liftDuration: 1.35,
      beamFollowsLift: false,
      animateBeam: true,
      openingDuration: 2.1,
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'light',
    label: 'Light',
    settings: {
      theme: 'light',
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'dark',
    label: 'Dark',
    settings: {
      theme: 'dark',
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'top',
    label: 'Top beam',
    settings: {
      beamPosition: 0,
      fixedBeam: true,
      cursorMovesBeam: true,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'center',
    label: 'Centered beam',
    settings: {
      beamPosition: 0.5,
      fixedBeam: true,
      cursorMovesBeam: true,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'bottom',
    label: 'Bottom beam',
    settings: {
      beamPosition: 1,
      fixedBeam: true,
      cursorMovesBeam: true,
      duration: 10.5,
      intensity: 1,
    },
  },
  {
    value: 'soft',
    label: 'Soft glow',
    settings: {
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 14,
      intensity: 0.7,
    },
  },
  {
    value: 'vivid',
    label: 'Vivid refraction',
    settings: {
      beamPosition: 0.5,
      fixedBeam: false,
      cursorMovesBeam: false,
      duration: 6.1,
      intensity: 1.4,
    },
  },
  ...[
    {
      value: 'arctic',
      label: 'Arctic cyan',
      topColor: '#102b35',
      bottomColor: '#658d9c',
      beamColor: '#67e8f9',
      spectrumWarmColor: '#9affda',
      spectrumMiddleColor: '#67e8f9',
      spectrumCoolColor: '#8e9cff',
    },
    {
      value: 'amethyst',
      label: 'Amethyst',
      topColor: '#241b38',
      bottomColor: '#8d79aa',
      beamColor: '#c4a0ff',
      spectrumWarmColor: '#ffa8db',
      spectrumMiddleColor: '#c4a0ff',
      spectrumCoolColor: '#88cfff',
    },
    {
      value: 'rose-quartz',
      label: 'Rose quartz',
      topColor: '#341c2a',
      bottomColor: '#ac7e93',
      beamColor: '#ff9dc6',
      spectrumWarmColor: '#ffd29b',
      spectrumMiddleColor: '#ff9dc6',
      spectrumCoolColor: '#c49aff',
    },
    {
      value: 'ember',
      label: 'Ember gold',
      topColor: '#332117',
      bottomColor: '#ad8257',
      beamColor: '#ffbd70',
      spectrumWarmColor: '#ff846b',
      spectrumMiddleColor: '#ffd08a',
      spectrumCoolColor: '#8bbdff',
    },
    {
      value: 'jade',
      label: 'Jade',
      topColor: '#132c25',
      bottomColor: '#6e9c85',
      beamColor: '#79efbd',
      spectrumWarmColor: '#e0ef9b',
      spectrumMiddleColor: '#79efbd',
      spectrumCoolColor: '#76d9ef',
    },
    {
      value: 'cobalt',
      label: 'Cobalt blue',
      topColor: '#16243d',
      bottomColor: '#718ab1',
      beamColor: '#7baaff',
      spectrumWarmColor: '#d5a7ff',
      spectrumMiddleColor: '#7baaff',
      spectrumCoolColor: '#8aeee8',
    },
    {
      value: 'pearl',
      label: 'Pearl · light',
      topColor: '#202333',
      bottomColor: '#666b83',
      beamColor: '#b8b4ff',
      spectrumWarmColor: '#f2c2b1',
      spectrumMiddleColor: '#b8b4ff',
      spectrumCoolColor: '#9bd9ed',
      theme: 'light' as const,
      intensity: 1.1,
    },
  ].map(({ value, label, ...palette }) => ({
    value,
    label,
    settings: {
      theme: defaults.theme,
      reveal: defaults.reveal,
      stagger: defaults.stagger,
      liftDuration: defaults.liftDuration,
      beamFollowsLift: defaults.beamFollowsLift,
      animateBeam: defaults.animateBeam,
      openingDuration: defaults.openingDuration,
      duration: defaults.duration,
      intensity: defaults.intensity,
      dispersion: 1.2,
      colorIntensity: defaults.colorIntensity,
      beamPosition: defaults.beamPosition,
      fixedBeam: defaults.fixedBeam,
      cursorMovesBeam: defaults.cursorMovesBeam,
      paused: false,
      ...palette,
    },
  })),
];

function example(values: Values = defaults) {
  const background =
    values.theme === 'dark' ? '#050505' : values.theme === 'light' ? '#fff' : 'Canvas';
  return `import { RefractedText } from './components/refracted-text';\n\nexport function Example() {\n  return <div style={{ background: '${background}', padding: '3rem', containerType: 'inline-size' }}>\n    <RefractedText\n${Object.entries(
    values,
  )
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`)
    .join('\n')}\n    />\n  </div>;\n}`;
}

export function refractedTextMeta() {
  return [
    { title: 'Refracted Text — ReactDrops' },
    { name: 'description', content: refractedText.description },
  ];
}

export default function RefractedTextPage() {
  const [values, setValues] = useState(defaults);
  const [preset, setPreset] = useState('original');
  const [replay, setReplay] = useState(0);
  const set = <K extends keyof Values>(name: K, value: Values[K]) => {
    setValues((old) => ({ ...old, [name]: value }));
    setPreset('custom');
  };
  const usage = example(values);
  const installCommands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/refracted-text.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Refracted Text" (ID: "refracted-text") using:\n\n${installCommands.npm}\n\nUse the installed source as the source of truth. Preserve the WebGL 2.0 shader, the optional character lift with configurable total duration, stagger and easing but no opacity fade, a beam anchored in canvas space by default during lift with an option to move it with each letter, an independent animateBeam toggle that holds the beam at its settled appearance without disabling character lift or cursor interaction, left-to-right light flow inside the letters, one shared power4.out beam-flow curve across the whole word rather than separate easing on each glyph, the static-text original-flow preset with its continuous cycle, a light pass that decelerates, varies illumination across broad sections, and subtly bends the beam, per-letter glass contours that bend and break the bright crossbar, fixedBeam presets that use the same path as Cursor moves beam, white, amber and steel-blue refraction with an independent beamColor override and three customizable spectral ray colors controlled by dispersion, light contained inside the letters, a pure-white light preview, local cursor deformation with optional full beam steering, edge lighting, and reduced-motion fallback. Integrate it with this configuration:\n\n${code}`;
  const sourceFiles: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...refractedTextSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const number = (
    name:
      | 'duration'
      | 'openingDuration'
      | 'liftDuration'
      | 'intensity'
      | 'dispersion'
      | 'colorIntensity'
      | 'beamPosition'
      | 'extraBold'
      | 'fontHeight'
      | 'cornerRounding'
      | 'fontWeight'
      | 'stagger',
  ) => {
    const control = refractedText.controls.find((item) => item.name === name)!;
    const minimum =
      name === 'liftDuration'
        ? Math.max(control.min ?? 0.2, Number((values.stagger + 0.1).toFixed(2)))
        : control.min;
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
          min={minimum}
          max={control.max}
          step={control.step}
          onChange={(value) => {
            if (name === 'beamPosition') {
              setValues((old) => ({
                ...old,
                beamPosition: value,
                fixedBeam: true,
                cursorMovesBeam: true,
              }));
              setPreset('custom');
            } else if (name === 'stagger') {
              setValues((old) => ({
                ...old,
                stagger: value,
                liftDuration: Math.max(old.liftDuration, Number((value + 0.1).toFixed(2))),
              }));
              setPreset('custom');
              setReplay((old) => old + 1);
            } else {
              set(name, value);
              if (name === 'liftDuration' || name === 'openingDuration')
                setReplay((old) => old + 1);
            }
          }}
        />
      </ControlField>
    );
  };
  const text = (name: 'text' | 'fontSize' | 'fontFamily' | 'letterSpacing') => {
    const control = refractedText.controls.find((item) => item.name === name)!;
    return (
      <ControlField
        key={name}
        className={name === 'text' ? 'refracted-quick-text' : 'is-wide'}
        label={control.label}
        description={control.description ?? ''}
      >
        <SingleLineTextControl
          label={control.label}
          value={values[name]}
          onChange={(value) => set(name, value)}
        />
      </ControlField>
    );
  };

  return (
    <ComponentDetailLayout
      componentName="Refracted Text"
      componentSlug="refracted-text"
      description={refractedText.description}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      installCommands={installCommands}
      sourceFiles={sourceFiles}
      onReplay={() => setReplay((value) => value + 1)}
      preview={
        <div className="refracted-text-demo" data-appearance={values.theme}>
          <RefractedText key={replay} {...values} />
        </div>
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Colors</h3>
            </legend>
            <div className="reveal-fields refracted-color-fields">
              {(['topColor', 'bottomColor', 'beamColor'] as const).map((name) => {
                const label =
                  name === 'beamColor'
                    ? 'Beam color'
                    : name === 'topColor'
                      ? 'Top color'
                      : 'Bottom color';
                return (
                  <ControlField
                    key={name}
                    label={label}
                    description={
                      name === 'beamColor'
                        ? 'Customize the refracted beam and its bright highlights. Auto keeps the original spectral light.'
                        : 'Customize this part of the glass. Auto keeps the original theme color; the beam and edge highlights retain their lighting.'
                    }
                  >
                    <ColorControl
                      allowAuto
                      label={label}
                      value={values[name]}
                      onChange={(value) => {
                        set(name, value);
                      }}
                    />
                  </ControlField>
                );
              })}
              {text('text')}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Color separation</h3>
            </legend>
            <div className="reveal-fields refracted-color-fields">
              {(['spectrumWarmColor', 'spectrumMiddleColor', 'spectrumCoolColor'] as const).map(
                (name, index) => (
                  <ControlField
                    key={name}
                    label={`Beam color ${index + 1}`}
                    description="Choose a color for this refracted ray. Auto keeps the beam palette. Increase Color separation to spread the chosen colors."
                  >
                    <ColorControl
                      allowAuto
                      label={`Beam color ${index + 1}`}
                      value={values[name]}
                      onChange={(value) => set(name, value)}
                    />
                  </ControlField>
                ),
              )}
              {number('dispersion')}
              {number('colorIntensity')}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Light</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                className="is-preset"
                label="Preset"
                description="Choose a color palette for the glass and beam, or a light animation. Color palettes keep your text and typography. Lift + flow restores the original palette."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    ...presets.map(({ value, label }) => ({ value, label })),
                    ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : []),
                  ]}
                  onChange={(value) => {
                    const selected = presets.find((item) => item.value === value);
                    if (!selected) return;
                    setValues((old) => ({
                      ...old,
                      topColor: defaults.topColor,
                      bottomColor: defaults.bottomColor,
                      beamColor: defaults.beamColor,
                      spectrumWarmColor: defaults.spectrumWarmColor,
                      spectrumMiddleColor: defaults.spectrumMiddleColor,
                      spectrumCoolColor: defaults.spectrumCoolColor,
                      dispersion: defaults.dispersion,
                      colorIntensity: defaults.colorIntensity,
                      ...selected.settings,
                    }));
                    setPreset(value);
                    setReplay((old) => old + 1);
                  }}
                />
              </ControlField>
              <ControlField
                className="is-preset"
                label="Theme"
                description="Dark by default, independently of the page. Select Light for a white surface, or Auto to follow the page theme."
              >
                <SelectControl
                  label="Theme"
                  value={values.theme}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onChange={(value) => set('theme', value as Values['theme'])}
                />
              </ControlField>
              {number('beamPosition')}
              {number('openingDuration')}
              {number('duration')}
              {number('intensity')}
              <ControlField
                className="is-boolean"
                label="Animate beam"
                description="Off shows the settled beam immediately while character lift and cursor interaction stay active."
              >
                <SwitchControl
                  label="Animate beam"
                  checked={values.animateBeam}
                  onChange={(value) => set('animateBeam', value)}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Fixed beam"
                description="Use the chosen height as the resting cursor position for the beam."
              >
                <SwitchControl
                  label="Fixed beam"
                  checked={values.fixedBeam}
                  onChange={(value) => {
                    setValues((old) => ({
                      ...old,
                      fixedBeam: value,
                      cursorMovesBeam: value ? true : old.cursorMovesBeam,
                    }));
                    setPreset('custom');
                  }}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Pause animation"
                description="Hold the automatic cycle; the cursor can still bend the ray."
              >
                <SwitchControl
                  label="Pause animation"
                  checked={values.paused}
                  onChange={(value) => set('paused', value)}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Cursor moves beam"
                description="Off by default: the cursor bends the ray locally while it keeps traveling."
              >
                <SwitchControl
                  label="Cursor moves beam"
                  checked={values.cursorMovesBeam}
                  onChange={(value) => set('cursorMovesBeam', value)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Entrance</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                className="is-boolean"
                label="Character lift"
                description="Switch off to keep every letter stationary while the light flows through it."
              >
                <SwitchControl
                  label="Character lift"
                  checked={values.reveal}
                  onChange={(value) => {
                    set('reveal', value);
                    setReplay((old) => old + 1);
                  }}
                />
              </ControlField>
              {values.reveal && (
                <>
                  {number('liftDuration')}
                  {number('stagger')}
                  <ControlField
                    className="is-boolean"
                    label="Beam follows letters"
                    description="Off keeps the beam in place as letters rise. On restores the beam moving with each letter."
                  >
                    <SwitchControl
                      label="Beam follows letters"
                      checked={values.beamFollowsLift}
                      onChange={(value) => {
                        set('beamFollowsLift', value);
                        setReplay((old) => old + 1);
                      }}
                    />
                  </ControlField>
                  <ControlField
                    label="Easing curve"
                    description="Curve for the upward character lift. It does not change the light flow."
                  >
                    <SelectControl
                      label="Easing curve"
                      value={values.ease}
                      options={liftEases.map((value) => ({ value, label: value }))}
                      onChange={(value) => {
                        set('ease', value as RefractedLiftEase);
                        setReplay((old) => old + 1);
                      }}
                    />
                  </ControlField>
                </>
              )}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Lettering</h3>
            </legend>
            <div className="reveal-fields">
              {text('fontSize')}
              {text('fontFamily')}
              {number('fontWeight')}
              {number('extraBold')}
              {number('fontHeight')}
              {number('cornerRounding')}
              {text('letterSpacing')}
            </div>
          </fieldset>
        </>
      }
      properties={[
        ...refractedText.controls.map((control) => ({
          name: control.name,
          type:
            control.name === 'ease'
              ? (control.options?.map((option) => JSON.stringify(option)).join(' | ') ?? 'string')
              : control.type === 'color'
                ? 'string'
                : control.type,
          defaultValue: String(control.defaultValue),
          description: control.description ?? '',
        })),
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description:
            'Style the transparent outer element. The palette defaults to dark. Choose light explicitly, or auto to follow the inherited color scheme.',
        },
      ]}
    />
  );
}
