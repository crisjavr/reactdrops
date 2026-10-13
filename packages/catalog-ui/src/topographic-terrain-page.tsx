import { useEffect, useRef, useState } from 'react';
import {
  TopographicTerrain,
  topographicTerrainDefaults,
  topographicTerrainPresets,
  type TopographicTerrainHandle,
  type TopographicTerrainPreset,
} from '@reactdrops/components/topographic-terrain';
import { topographicTerrain } from '@reactdrops/catalog-data/catalog';
import { topographicTerrainSourceFiles } from '@reactdrops/catalog-data/sources/topographic-terrain';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl } from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './topographic-terrain-page.css';

const defaults = {
  ...topographicTerrainDefaults,
  ...topographicTerrainPresets.terraced,
};
type Values = typeof defaults;

function example(values = defaults) {
  return `import { TopographicTerrain } from './components/topographic-terrain';\n\nexport function Example() {\n  return (\n    <TopographicTerrain\n${Object.entries(
    values,
  )
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`)
    .join('\n')}\n    />\n  );\n}`;
}

export function topographicTerrainMeta() {
  return [
    { title: 'Topographic Terrain — ReactDrops' },
    { name: 'description', content: topographicTerrain.description },
  ];
}

export default function TopographicTerrainPage() {
  const [values, setValues] = useState<Values>(defaults);
  const ref = useRef<TopographicTerrainHandle>(null);
  const followTheme = useRef(true);
  const followShadowTheme = useRef(true);
  const [dark, setDark] = useState(false);
  const themedTerraced = {
    ...topographicTerrainPresets.terraced,
    surfaceColor: dark ? '#000000' : '#ffffff',
    shadowColor: dark ? '#9d9d9d' : '#737373',
    backgroundColor: dark ? '#000000' : '#ffffff',
    lineColor: dark ? '#ffffff' : '#000000',
    accentColor: dark ? '#ffffff' : '#000000',
  };
  const presets = {
    ...topographicTerrainPresets,
    terraced: themedTerraced,
    'terraced-top': { ...themedTerraced, cameraTilt: 0 },
  };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const root = document.documentElement;
      const isDark = root.hasAttribute('data-theme')
        ? root.dataset.theme === 'dark'
        : root.classList.contains('dark') || (!root.classList.contains('light') && media.matches);
      setDark(isDark);
      setValues((old) => ({
        ...old,
        ...(followTheme.current
          ? {
              surfaceColor: isDark ? '#000000' : '#ffffff',
              backgroundColor: isDark ? '#000000' : '#ffffff',
              lineColor: isDark ? '#ffffff' : '#000000',
              accentColor: isDark ? '#ffffff' : '#000000',
            }
          : {}),
        ...(followShadowTheme.current ? { shadowColor: isDark ? '#9d9d9d' : '#737373' } : {}),
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
    if (key === 'shadowColor') followShadowTheme.current = false;
    if (
      ['surfaceColor', 'backgroundColor', 'lineColor', 'accentColor', 'gradientColors'].includes(
        key,
      )
    )
      followTheme.current = false;
    setValues((old) => ({ ...old, [key]: value }));
  };
  const usage = example(values);
  const preset =
    Object.entries(presets).find(([, settings]) =>
      Object.entries(settings).every(([key, value]) =>
        key === 'gradientColors'
          ? JSON.stringify(values.gradientColors) === JSON.stringify(value)
          : values[key as keyof Values] === value,
      ),
    )?.[0] ?? 'custom';
  const setGradientColor = (index: number, color: string) => {
    const [first, second, ...rest] = values.gradientColors;
    if (first === undefined || second === undefined) return;
    const next: [string, string, ...string[]] = [first, second, ...rest];
    next[index] = color;
    set('gradientColors', next);
  };
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/topographic-terrain.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Topographic Terrain" (ID: "topographic-terrain") using:\n\n${commands.npm}\n\nUse the downloaded implementation as the source of truth. Do not recreate or redesign it. Preserve the animated 3D terrain, adjustable perspective, layered material, lighting, reduced motion, visibility pausing and cleanup. Integrate this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    {
      id: 'with-content',
      label: 'With content',
      code: '<TopographicTerrain preset="slate">\n  <section style={{ padding: 48, color: "white" }}>\n    <h1>A different perspective.</h1>\n  </section>\n</TopographicTerrain>',
      language: 'typescript',
    },
    ...topographicTerrainSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const numbers = (names: (keyof Values)[]) =>
    names.map((name) => {
      const control = topographicTerrain.controls.find((control) => control.name === name)!;
      return (
        <ControlField
          key={name}
          className="is-number"
          label={control.label}
          description={control.description ?? ''}
        >
          <NumberControl
            label={control.label}
            value={values[name] as number}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(value) => set(name, value)}
          />
        </ControlField>
      );
    });
  const colors = (
    names: ('surfaceColor' | 'shadowColor' | 'backgroundColor' | 'lineColor' | 'accentColor')[],
  ) =>
    names.map((name) => {
      const control = topographicTerrain.controls.find((control) => control.name === name)!;
      return (
        <ControlField key={name} label={control.label} description={control.description ?? ''}>
          <ColorControl
            label={control.label}
            value={values[name]}
            onChange={(color) => set(name, color)}
          />
        </ControlField>
      );
    });
  return (
    <ComponentDetailLayout
      componentName={topographicTerrain.name}
      componentSlug={topographicTerrain.slug}
      description={topographicTerrain.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example({ ...defaults, ...themedTerraced }))}
      sourceFiles={files}
      onReplay={() => ref.current?.reset()}
      preview={
        <div className="topographic-terrain-demo component-background-preview">
          <TopographicTerrain key={topographicTerrain.version} ref={ref} {...values} />
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
                description="All presets share the Terraced terrain and camera settings. Black variants change only the palette or shadow animation; Top View uses zero camera tilt."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    { value: 'terraced', label: 'Terraced' },
                    { value: 'slate', label: 'Slate' },
                    { value: 'terraced-top', label: 'Terraced Top View' },
                    { value: 'slate-top', label: 'Slate Top View' },
                    { value: 'slate-red', label: 'Slate Red' },
                    { value: 'slate-red-top', label: 'Slate Red Top View' },
                    { value: 'slate-blue', label: 'Slate Blue' },
                    { value: 'slate-blue-top', label: 'Slate Blue Top View' },
                    { value: 'slate-cyan', label: 'Slate Cyan' },
                    { value: 'slate-cyan-top', label: 'Slate Cyan Top View' },
                    { value: 'slate-green', label: 'Slate Green' },
                    { value: 'slate-green-top', label: 'Slate Green Top View' },
                    { value: 'slate-magenta', label: 'Slate Magenta' },
                    { value: 'slate-magenta-top', label: 'Slate Magenta Top View' },
                    { value: 'slate-yellow', label: 'Slate Yellow' },
                    { value: 'slate-yellow-top', label: 'Slate Yellow Top View' },
                    { value: 'slate-rgb', label: 'Slate RGB' },
                    { value: 'slate-rgb-top', label: 'Slate RGB Top View' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(preset) => {
                    if (preset !== 'custom') {
                      followTheme.current = preset === 'terraced' || preset === 'terraced-top';
                      followShadowTheme.current =
                        preset === 'terraced' || preset === 'terraced-top';
                      setValues((old) => ({
                        ...old,
                        ...presets[preset as TopographicTerrainPreset],
                      }));
                    }
                  }}
                />
              </ControlField>
              {numbers(['scale', 'density', 'distortion', 'seed', 'elevation', 'terraceSoftness'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Camera</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['cameraTilt', 'cameraRotation', 'cameraZoom'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Material</h3>
            </legend>
            <div className="reveal-fields">
              {colors(['surfaceColor', 'backgroundColor'])}
              {numbers(['grain'])}
              {values.gradientColors.slice(0, 8).map((color, index, palette) => {
                const label =
                  index === 0
                    ? 'Valley color'
                    : index === palette.length - 1
                      ? 'Summit color'
                      : `Elevation ${Math.round((index / (palette.length - 1)) * 100)}% color`;
                return (
                  <ControlField
                    key={index}
                    label={label}
                    description="Color at this terrain elevation. The gradient follows the same evolving height as the 3D layers."
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
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Lighting</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Shadow animation"
                description="Choose a fixed color or a smooth RGB cycle over the relief."
              >
                <SelectControl
                  label="Shadow animation"
                  value={values.shadowAnimation}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'rgb', label: 'RGB cycle' },
                  ]}
                  onChange={(value) => set('shadowAnimation', value as Values['shadowAnimation'])}
                />
              </ControlField>
              {values.shadowAnimation === 'rgb'
                ? numbers(['shadowCycleDuration'])
                : colors(['shadowColor'])}
              {numbers(['lightingBlend'])}
              {values.lightingBlend > 0 && numbers(['lightDirection', 'lightIntensity'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Contour ink</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['lineWidth', 'opacity'])}
              {colors(['lineColor', 'accentColor'])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">{numbers(['speed'])}</div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'preset',
          type: Object.keys(topographicTerrainPresets)
            .map((name) => `'${name}'`)
            .join(' | '),
          defaultValue: 'terraced',
          description:
            'Initial material, terrain and camera configuration. Explicit props override it.',
        },
        ...topographicTerrain.controls
          .filter((control) => control.name !== 'preset')
          .map((control) => ({
            name: control.name,
            type: control.type === 'color' ? 'string' : control.type,
            defaultValue: String(control.defaultValue),
            description: control.description ?? '',
          })),
        {
          name: 'backgroundImage',
          type: 'string',
          defaultValue: 'none',
          description:
            'Optional CSS background behind the terrain canvas and Canvas fallback. Use gradientColors to color the terrain by elevation.',
        },
        {
          name: 'gradientColors',
          type: 'readonly [string, string, ...string[]] | readonly []',
          defaultValue: '[]',
          description:
            'Optional two to eight colors ordered from valley to summit. Colors follow the animated elevation field; an empty array uses the surface color.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          defaultValue: '—',
          description: 'Optional foreground content, layered above the decorative canvas.',
        },
        {
          name: 'ref',
          type: 'TopographicTerrainHandle',
          defaultValue: '—',
          description: 'reset() returns the animated terrain to its initial frame.',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description:
            'Customize the background styling. Set its dimensions on the parent container.',
        },
      ]}
    />
  );
}
