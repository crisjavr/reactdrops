import { useEffect, useRef, useState } from 'react';
import {
  TopographicFlow,
  topographicDefaults,
  topographicPresets,
  type TopographicFlowHandle,
  type TopographicPreset,
  type TopographicLineStyle,
} from '@reactdrops/components/topographic-flow';
import { topographicFlow } from '@reactdrops/catalog-data/catalog';
import { topographicFlowSourceFiles } from '@reactdrops/catalog-data/sources/topographic-flow';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './topographic-flow-page.css';

const defaults = { ...topographicDefaults, ...topographicPresets.paper };
const darkPaper = {
  ...topographicPresets.paper,
  backgroundColor: '#000000',
  lineColor: '#ffffff',
  accentColor: '#ffffff',
};
type Values = typeof defaults;
function example(values = defaults) {
  return `import { TopographicFlow } from './components/topographic-flow';\n\nexport function Example() {\n  return (\n    <TopographicFlow\n${Object.entries(
    values,
  )
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`)
    .join('\n')}\n    />\n  );\n}`;
}
export function topographicFlowMeta() {
  return [
    { title: 'Topographic Flow — ReactDrops' },
    { name: 'description', content: topographicFlow.description },
  ];
}
export default function TopographicFlowPage() {
  const [values, setValues] = useState<Values>(defaults);
  // Strength restored when the mouse effect is switched back on.
  const hoverMemory = useRef(defaults.hover || 0.5);
  const ref = useRef<TopographicFlowHandle>(null);
  const followPaperTheme = useRef(true);
  const [dark, setDark] = useState(false);
  const presets = { ...topographicPresets, paper: dark ? darkPaper : topographicPresets.paper };
  const themeDefaults = { ...defaults, ...presets.paper };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const root = document.documentElement;
      const isDark = root.hasAttribute('data-theme')
        ? root.dataset.theme === 'dark'
        : root.classList.contains('dark') || media.matches;
      setDark(isDark);
      if (followPaperTheme.current)
        setValues((old) => ({
          ...old,
          backgroundColor: isDark ? '#000000' : '#ffffff',
          lineColor: isDark ? '#ffffff' : '#000000',
          accentColor: isDark ? '#ffffff' : '#000000',
        }));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    media.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', sync);
    };
  }, []);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    if (
      [
        'backgroundColor',
        'backgroundImage',
        'gradientColors',
        'gradientDiffusion',
        'grain',
        'lineColor',
        'accentColor',
      ].includes(key)
    )
      followPaperTheme.current = false;
    setValues((old) => ({ ...old, [key]: value }));
  };
  const usage = example(values);
  const setGradientColor = (index: number, color: string) => {
    const [first, second, ...rest] = values.gradientColors;
    if (first === undefined || second === undefined) return;
    const next: [string, string, ...string[]] = [first, second, ...rest];
    next[index] = color;
    set('gradientColors', next);
  };
  const preset =
    Object.entries(presets).find(([, settings]) =>
      Object.entries(settings).every(([key, value]) =>
        key === 'gradientColors'
          ? JSON.stringify(values.gradientColors) === JSON.stringify(value)
          : values[key as keyof Values] === value,
      ),
    )?.[0] ?? 'custom';
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/topographic-flow.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Topographic Flow" (ID: "topographic-flow") using:\n\n${commands.npm}\n\nUse the downloaded implementation as the source of truth. Do not recreate or redesign it. Preserve the smoothly evolving elevation field, connected contour paths, mixed dashed survey lines, reduced motion, visibility pausing and cleanup. Adjust imports and integrate this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    {
      id: 'with-content',
      label: 'With content',
      code: '<TopographicFlow preset="survey">\n  <section style={{ padding: 48, color: "white" }}>\n    <h1>Find your own path.</h1>\n  </section>\n</TopographicFlow>',
      language: 'typescript',
    },
    ...topographicFlowSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const numbers = (names: (keyof Values)[]) =>
    names.map((name) => {
      const control = topographicFlow.controls.find((control) => control.name === name)!;
      const label = control.label;
      return (
        <ControlField
          key={name}
          className="is-number"
          label={label}
          description={control.description ?? ''}
        >
          <NumberControl
            label={label}
            value={values[name] as number}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(value) => set(name, value)}
          />
        </ControlField>
      );
    });
  return (
    <ComponentDetailLayout
      componentName={topographicFlow.name}
      componentSlug={topographicFlow.slug}
      description={topographicFlow.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example(themeDefaults))}
      sourceFiles={files}
      onReplay={() => ref.current?.reset()}
      preview={
        <div className="topographic-flow-demo component-background-preview">
          <TopographicFlow key={topographicFlow.version} ref={ref} {...values} />
        </div>
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
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Terrain</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Preset"
                description="Choose continuous contours, broken survey lines or an animated elevation gradient."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    { value: 'paper', label: 'Paper' },
                    { value: 'ocean', label: 'Ocean · gradient' },
                    { value: 'terrain', label: 'Terrain' },
                    { value: 'survey', label: 'Survey · broken lines' },
                    { value: 'aurora', label: 'Aurora · gradient' },
                    { value: 'dune', label: 'Dune' },
                    { value: 'moss', label: 'Moss · broken lines' },
                    { value: 'ember', label: 'Ember · gradient' },
                    { value: 'relief', label: 'Relief · depth map' },
                    { value: 'midnight', label: 'Midnight · swirl' },
                    { value: 'blueprint', label: 'Blueprint · drag' },
                    { value: 'neon', label: 'Neon · ripple' },
                    { value: 'sunset', label: 'Sunset · rings' },
                    { value: 'sage', label: 'Sage' },
                    { value: 'graphite', label: 'Graphite · rings' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(preset) => {
                    if (preset !== 'custom') {
                      followPaperTheme.current = preset === 'paper';
                      setValues((old) => ({
                        ...old,
                        ...presets[preset as TopographicPreset],
                      }));
                    }
                  }}
                />
              </ControlField>
              {numbers(['scale', 'density', 'distortion', 'seed'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Contours</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Line style"
                description="Mixed breaks every fourth elevation contour; the remaining curves stay continuous."
              >
                <SelectControl
                  label="Line style"
                  value={values.lineStyle}
                  options={[
                    { value: 'solid', label: 'Continuous' },
                    { value: 'mixed', label: 'Mixed · survey' },
                    { value: 'dashed', label: 'All dashed' },
                  ]}
                  onChange={(value) => set('lineStyle', value as TopographicLineStyle)}
                />
              </ControlField>
              {numbers(['lineWidth', 'opacity'])}
              {values.lineStyle !== 'solid' && numbers(['dashLength', 'dashGap'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Palette</h3>
            </legend>
            <div className="reveal-fields">
              {(['backgroundColor', 'lineColor', 'accentColor'] as const).map((name) => {
                const control = topographicFlow.controls.find((control) => control.name === name)!;
                return (
                  <ControlField
                    key={name}
                    label={control.label}
                    description={control.description ?? ''}
                  >
                    <ColorControl
                      label={control.label}
                      value={values[name]}
                      onChange={(color) => set(name, color)}
                    />
                  </ControlField>
                );
              })}
              {values.gradientColors.slice(0, 8).map((color, index, colors) => {
                const label =
                  index === 0
                    ? 'Valley color'
                    : index === colors.length - 1
                      ? 'Summit color'
                      : colors.length === 3
                        ? 'Mid-elevation color'
                        : `Elevation ${Math.round((index / (colors.length - 1)) * 100)}% color`;
                return (
                  <ControlField
                    key={index}
                    label={label}
                    description="Color at this terrain elevation. The gradient follows the same evolving height as the contours."
                  >
                    <ColorControl
                      label={label}
                      value={color}
                      onChange={(color) => setGradientColor(index, color)}
                    />
                  </ControlField>
                );
              })}
              {values.gradientColors.length >= 2 && numbers(['gradientDiffusion'])}
              {(values.gradientColors.length >= 2 || values.backgroundImage !== 'none') &&
                numbers(['grain'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                className="is-boolean"
                label="Animate entrance"
                description="Fade in the first complete frame. Turn off for an immediate entrance. Reduced motion skips the fade."
              >
                <SwitchControl
                  label="Animate entrance"
                  checked={values.animateEntrance}
                  onChange={(value) => set('animateEntrance', value)}
                />
              </ControlField>
              {numbers(['speed'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Mouse</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Mouse effect"
                description="Push the contours aside as the pointer moves over the component."
              >
                <SwitchControl
                  label="Mouse effect"
                  checked={values.hover !== 0}
                  onChange={(on) => {
                    if (!on) hoverMemory.current = values.hover;
                    set('hover', on ? hoverMemory.current : 0);
                  }}
                />
              </ControlField>
              {values.hover !== 0 && (
                <>
                  <ControlField label="Effect" description="How the pointer reshapes the contours.">
                    <SelectControl
                      label="Effect"
                      value={values.hoverEffect}
                      options={[
                        { value: 'spread', label: 'Spread · push aside' },
                        { value: 'swirl', label: 'Swirl · twist' },
                        { value: 'ripple', label: 'Ripple · waves' },
                        { value: 'rings', label: 'Rings · hill' },
                        { value: 'drag', label: 'Drag · follow motion' },
                      ]}
                      onChange={(effect) => set('hoverEffect', effect as Values['hoverEffect'])}
                    />
                  </ControlField>
                  <ControlField
                    label="Direction"
                    description="Push the terrain away from the pointer or pull it in."
                  >
                    <SelectControl
                      label="Direction"
                      value={values.hover > 0 ? 'raise' : 'sink'}
                      options={[
                        { value: 'raise', label: 'Push · away' },
                        { value: 'sink', label: 'Pull · in' },
                      ]}
                      onChange={(direction) =>
                        set('hover', Math.abs(values.hover) * (direction === 'sink' ? -1 : 1))
                      }
                    />
                  </ControlField>
                  <ControlField
                    className="is-number"
                    label="Strength"
                    description="How far the contours move aside under the pointer."
                  >
                    <NumberControl
                      label="Strength"
                      value={Math.abs(values.hover)}
                      min={0.05}
                      max={0.9}
                      step={0.05}
                      onChange={(height) => set('hover', height * Math.sign(values.hover))}
                    />
                  </ControlField>
                  {numbers(['hoverRadius', 'hoverFollow', 'hoverFade'])}
                </>
              )}
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'preset',
          type: Object.keys(topographicPresets)
            .map((name) => `'${name}'`)
            .join(' | '),
          defaultValue: 'paper',
          description:
            'Initial palette and contour configuration. Explicit props override the preset.',
        },
        ...topographicFlow.controls
          .filter((control) => control.name !== 'preset')
          .map((control) => ({
            name: control.name,
            type:
              control.name === 'lineStyle'
                ? "'solid' | 'mixed' | 'dashed'"
                : control.type === 'color'
                  ? 'string'
                  : control.type,
            defaultValue: String(control.defaultValue),
            description: control.description ?? '',
          })),
        {
          name: 'backgroundImage',
          type: 'string',
          defaultValue: 'none',
          description:
            'Optional CSS background. Presets include a static fallback; gradientColors creates the animated elevation gradient. Passing none disables the preset gradient.',
        },
        {
          name: 'gradientColors',
          type: 'readonly [string, string, ...string[]] | readonly []',
          defaultValue: '[]',
          description:
            'Two to eight colors ordered from valley to summit, with smooth blends between elevation levels. Relief uses six colors from blue to red. An empty array disables this gradient.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          defaultValue: '—',
          description: 'Optional foreground content, layered above the decorative canvas.',
        },
        {
          name: 'ref',
          type: 'TopographicFlowHandle',
          defaultValue: '—',
          description: 'reset() returns the animated relief to its initial frame.',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description:
            'Customize the background styling. Set its dimensions on the parent container.',
        },
      ]}
      usage={
        <>
          <p>
            Aurora and Ember use vibrant elevation colors in nearby hues over compact terrain. Ocean
            keeps its deep blue palette. Relief uses the full blue-to-red height palette with more
            contours. Gradient diffusion widens the blend between elevation colors. Colors follow
            the same evolving terrain height as the lines. Speed 0 freezes the relief. You can layer
            headings, cards or other content inside the component.
          </p>
        </>
      }
    />
  );
}
