// @refresh reset
import { useEffect, useRef, useState } from 'react';
import {
  LiquidGlassOrb,
  fluidAgentOrbDefaults,
  fluidAgentOrbPresets,
  fluidAgentOrbStates,
  fluidAgentOrbThinkingAnimations,
  fluidAgentOrbThinkingAnimationLabels,
  fluidAgentOrbSearchingAnimations,
  fluidAgentOrbSearchingAnimationLabels,
  type FluidAgentOrbHandle as LiquidGlassOrbHandle,
  type FluidAgentOrbState,
  type FluidAgentOrbThinkingAnimation,
  type FluidAgentOrbSearchingAnimation,
} from '@reactdrops/components/fluid-agent-orb';
import { fluidAgentOrb } from '@reactdrops/catalog-data/catalog';
import { fluidAgentOrbSourceFiles } from '@reactdrops/catalog-data/sources/fluid-agent-orb';
import { ComponentDetailLayout, type ComponentPackageManager } from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import { createSimulatedSpeech } from './fluid-agent-orb-speech';
import './catalog.css';
import './fluid-agent-orb-page.css';

// Keep the circular orb customizer focused on controls that are useful here.
const {
  shape: _shape,
  aspectRatio: _aspectRatio,
  borderRadius: _borderRadius,
  reliefFade: _reliefFade,
  reliefFadeSide: _reliefFadeSide,
  reliefFadeAmount: _reliefFadeAmount,
  reliefFadeWidth: _reliefFadeWidth,
  animatedGrain: _animatedGrain,
  interactive: _interactive,
  ...orbDefaults
} = fluidAgentOrbDefaults;
const defaults = { ...orbDefaults, audioLevel: 0.55 };
type Values = typeof defaults;
const isVoiceState = (state: FluidAgentOrbState) => state === 'listening' || state === 'speaking';
const title = (state: string) => state.charAt(0).toUpperCase() + state.slice(1);
function example(values = defaults) {
  return `import { LiquidGlassOrb } from './components/liquid-glass-orb';\n\nexport function Example() {\n  // Drive state from your agent; audioLevel is a normalized 0–1 voice envelope.\n  return <LiquidGlassOrb\n${Object.entries(
    values,
  )
    .filter(([key]) => key !== 'intensity' || isVoiceState(values.state))
    .map(([key, value]) => `    ${key}={${JSON.stringify(value)}}`)
    .join('\n')}\n  />;\n}`;
}
export function fluidAgentOrbMeta() {
  return [
    { title: 'Liquid Glass Orb — ReactDrops' },
    { name: 'description', content: fluidAgentOrb.description },
  ];
}
export default function FluidAgentOrbPage() {
  const [values, setValues] = useState(defaults);
  const [simulateAudio, setSimulateAudio] = useState(true);
  const [editing, setEditing] = useState(false);
  const [usage, setUsage] = useState(() => example());
  const orb = useRef<LiquidGlassOrbHandle>(null);
  const speech = useRef<ReturnType<typeof createSimulatedSpeech> | null>(null);
  speech.current ??= createSimulatedSpeech();
  const speechStart = useRef<number | null>(null);
  const latest = useRef({ values, simulateAudio });
  latest.current = { values, simulateAudio };
  useEffect(() => {
    speech.current!.reset();
    speechStart.current = null;
  }, [values.state, simulateAudio]);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    if (!editing) setUsage(example(values));
  }, [values, editing]);
  const selectState = (state: FluidAgentOrbState) => {
    set('state', state);
  };
  const sampleAudio = () => {
    const { values: current, simulateAudio: simulate } = latest.current;
    if (!simulate) return current.audioLevel;
    const now = performance.now() / 1000;
    speechStart.current ??= now;
    return (
      current.audioLevel *
      speech.current!.sample(now - speechStart.current) *
      (current.state === 'listening' ? 0.65 : 1)
    );
  };
  const voiceActive = isVoiceState(values.state);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/liquid-glass-orb.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = `Install ReactDrops Liquid Glass Orb using:\n\n${commands.npm}\n\nIntegrate Liquid Glass Orb into the existing application, following its layout, styles and architecture. Keep the surrounding application intact and place the orb where it belongs in the current interface. Connect state and audio inputs to the application's existing lifecycle. Add buttons, state selectors, sliders, control panels or other demo UI only when the user explicitly requests them.\n\nUse the included Fluid Glass Gradient component, renderer, shaders and defaults as the source of truth. Keep its circular shape and native glass geometry and material controls. Enable preserveWhites by default to keep white palette regions and studio highlights neutral. Set preserveWhites to false to restore the previous color treatment. Idle uses the original organic glass distortion. The preview simulates words with irregular syllables, varied emphasis and breathing pauses instead of a repeating beat. Speaking adds at most 10% speed to those native folds with the smoothed voice envelope and gently renews local organic wrinkles, while the circle moves and scales. Blend stationary wrinkle fields with continuous height, normals and temporal velocity. Keep the configured material and base Relief; apply the modest voice height response consistently to the glass normals, and integrate the extra fold travel so the current phase continues smoothly in Idle. Choose thinkingAnimation: ripples (the default concentric waves), spiral (two-arm spiral), or scan (curved scanning folds). These Thinking patterns cover the whole orb with broad, curved relief and slow motion. Animation choices blend smoothly inside the original render loop. Searching offers searchingAnimation: lens (the original size following 2.83-second elliptical laps tilted 45 degrees at default Speed, using cubic-bezier(0.167, 0.723, 0.448, 0.924) with the slowest pass at 1:30 on the clock. The overlapping curve keeps at least 40% of the average lap speed and matches velocity across the seam) or small-lens (a smaller lens that glides continuously between spots with gentle changes in pace). Other states use recognizable glass-surface patterns, and Error holds a stationary cross. Preserve the configured Relief and the original background, colors and glass material. Keep the 250 px size and fixed orientation. Connect state to the agent lifecycle and audioLevel (0–1) to incoming or outgoing voice. Use getAudioLevel or ref.setAudioLevel for live audio without rendering React per sample. The component owns its default 1.2-second power4.out entrance from 8% to full size, after its first frame is ready and visible. Set animateEntrance to false to disable it. Keep it empty while loading and respect reduced motion.\n\n${usage}`;
  const preset =
    Object.entries(fluidAgentOrbPresets).find(([, palette]) =>
      Object.entries(palette).every(([key, value]) => values[key as keyof Values] === value),
    )?.[0] ?? 'custom';
  const numbers = (keys: (keyof Values)[]) =>
    keys.map((key) => {
      const control = fluidAgentOrb.controls.find((c) => c.name === key)!;
      return (
        <ControlField
          key={key}
          label={control.label}
          description={control.description ?? ''}
          className="is-number"
        >
          <NumberControl
            label={control.label}
            value={values[key] as number}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(value) => set(key, value)}
            onInteractionChange={setEditing}
          />
        </ControlField>
      );
    });
  return (
    <ComponentDetailLayout
      componentName={fluidAgentOrb.name}
      componentSlug={fluidAgentOrb.slug}
      description={fluidAgentOrb.description}
      installCommands={commands}
      prompt={prompt}
      defaultPrompt={prompt.replace(usage, example())}
      sourceFiles={[
        { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
        ...fluidAgentOrbSourceFiles.map((file) => ({
          id: file.name,
          label: file.name,
          code: file.content,
          language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
        })),
      ]}
      onReplay={() => orb.current?.reset()}
      preview={
        <div className="fluid-agent-orb-demo">
          <div className="fluid-agent-orb-demo-stage">
            <LiquidGlassOrb
              ref={orb}
              {...values}
              getAudioLevel={voiceActive && simulateAudio ? sampleAudio : undefined}
            />
          </div>
          <div className="fluid-agent-orb-state-tabs" aria-label="Agent states">
            {fluidAgentOrbStates.map((state) => (
              <button
                key={state}
                type="button"
                aria-pressed={state === values.state}
                onClick={() => selectState(state)}
              >
                {title(state)}
              </button>
            ))}
          </div>
        </div>
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Agent</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField label="State" description="Controlled state from your agent lifecycle.">
                <SelectControl
                  label="State"
                  value={values.state}
                  options={fluidAgentOrbStates.map((value) => ({ value, label: title(value) }))}
                  onChange={(value) => selectState(value as FluidAgentOrbState)}
                />
              </ControlField>
              {values.state === 'thinking' && (
                <ControlField
                  label="Thinking animation"
                  description="Choose the glass pattern used while the agent is thinking."
                >
                  <SelectControl
                    label="Thinking animation"
                    value={values.thinkingAnimation}
                    options={fluidAgentOrbThinkingAnimations.map((value) => ({
                      value,
                      label: fluidAgentOrbThinkingAnimationLabels[value],
                    }))}
                    onChange={(value) =>
                      set('thinkingAnimation', value as FluidAgentOrbThinkingAnimation)
                    }
                  />
                </ControlField>
              )}
              {values.state === 'searching' && (
                <ControlField
                  label="Searching animation"
                  description="Choose a lens on an oval orbit tilted 45 degrees that uses the saved custom Bezier curve and picks up speed again at 1:30 on the clock, or a smaller lens that glides along a rounded path."
                >
                  <SelectControl
                    label="Searching animation"
                    value={values.searchingAnimation}
                    options={fluidAgentOrbSearchingAnimations.map((value) => ({
                      value,
                      label: fluidAgentOrbSearchingAnimationLabels[value],
                    }))}
                    onChange={(value) =>
                      set('searchingAnimation', value as FluidAgentOrbSearchingAnimation)
                    }
                  />
                </ControlField>
              )}
              {voiceActive && numbers(['intensity'])}
              {voiceActive && numbers(['audioLevel'])}
              {voiceActive && (
                <ControlField
                  label="Simulated voice"
                  description="Preview phrases with irregular syllables, word emphasis and breathing pauses."
                >
                  <SwitchControl
                    label="Simulated voice"
                    checked={simulateAudio}
                    onChange={setSimulateAudio}
                  />
                </ControlField>
              )}
              <ControlField label="Paused" description="Hold the current frame.">
                <SwitchControl
                  label="Paused"
                  checked={values.paused}
                  onChange={(value) => set('paused', value)}
                />
              </ControlField>
              <ControlField
                label="Entrance animation"
                description="Grow from the center with power4.out when the orb appears. Turn off to show it at full size immediately."
              >
                <SwitchControl
                  label="Entrance animation"
                  checked={values.animateEntrance}
                  onChange={(value) => set('animateEntrance', value)}
                />
              </ControlField>
            </div>
          </fieldset>

          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Colors</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Preset"
                description="Presets apply their colors and default cluster count: 7.2 for Tide and Monochrome, 3 for the others. Azure, Indigo, Mint, Coral, Scarlet and Fuchsia preserve the current seed and keep the animation running. Original presets also select their seed and starting frame."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    ...Object.keys(fluidAgentOrbPresets).map((value) => ({
                      value,
                      label: value
                        .split('-')
                        .map((word) => word[0].toUpperCase() + word.slice(1))
                        .join(' '),
                    })),
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(value) => {
                    if (value !== 'custom') {
                      const palette =
                        fluidAgentOrbPresets[value as keyof typeof fluidAgentOrbPresets];
                      setValues((old) => ({
                        ...old,
                        ...palette,
                      }));
                      if ('seed' in palette) orb.current?.reset();
                    }
                  }}
                />
              </ControlField>
              {numbers(['colorDistribution'])}
              <ControlField
                label="Preserve whites"
                description="Keep white palette areas bright and neutral. Turn off to restore the previous color treatment."
              >
                <SwitchControl
                  label="Preserve whites"
                  checked={values.preserveWhites}
                  onChange={(value) => set('preserveWhites', value)}
                />
              </ControlField>
              {(['baseColor', 'colorA', 'colorB', 'colorC'] as const).map((name) => {
                const control = fluidAgentOrb.controls.find((c) => c.name === name)!;
                return (
                  <ControlField
                    key={name}
                    className="is-color"
                    label={control.label}
                    description={control.description ?? ''}
                  >
                    <ColorControl
                      label={control.label}
                      value={values[name]}
                      onChange={(value) => set(name, value)}
                    />
                  </ControlField>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Flow type"
                description="Choose drifting pools, a circulating vortex, or rolling waves."
              >
                <SelectControl
                  label="Flow type"
                  value={values.flowType}
                  options={['drift', 'vortex', 'wave'].map((value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                  }))}
                  onChange={(value) => set('flowType', value as Values['flowType'])}
                />
              </ControlField>
              {numbers(['speed', 'distortion'])}
              <ControlField
                className="is-boolean"
                label="Animated distortion"
                description="Keep the distortion points moving. Turn off to fix them at their current positions while colors continue flowing."
              >
                <SwitchControl
                  label="Animated distortion"
                  checked={values.animateDistortion}
                  onChange={(value) => set('animateDistortion', value)}
                />
              </ControlField>
              {numbers([
                'clusterCount',
                'clusterIntensity',
                'clusterSize',
                'scale',
                'spotSize',
                'rotation',
                'seed',
              ])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Appearance</h3>
            </legend>
            <div className="reveal-fields">{numbers(['size', 'softness'])}</div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Glass</h3>
            </legend>
            <div className="reveal-fields">
              {numbers([
                'relief',
                'refraction',
                'roughness',
                'reflection',
                'caustics',
                'dispersion',
              ])}
            </div>
          </fieldset>

          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Grain</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Grain style"
                description="Choose fine motes, larger flecks, rough texture, or monochrome noise."
              >
                <SelectControl
                  label="Grain style"
                  value={values.grainMode}
                  options={['fine', 'coarse', 'rough', 'monochrome'].map((value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                  }))}
                  onChange={(value) => set('grainMode', value as Values['grainMode'])}
                />
              </ControlField>
              {numbers(['grain', 'grainSize'])}
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'preset',
          type: 'LiquidGlassOrbPreset',
          defaultValue: 'monochrome',
          description:
            'Presets apply their colors and default cluster count: 7.2 for Tide and Monochrome, 3 for the others. Azure, Indigo, Mint, Coral, Scarlet and Fuchsia preserve the current seed and playback position. Explicit props override preset values.',
        },
        {
          name: 'state',
          type: 'LiquidGlassOrbState',
          defaultValue: fluidAgentOrbDefaults.state,
          description:
            'idle, listening, thinking, searching, speaking, success or error. Idle uses the original fluid glass distortion; Speaking adds a subtle voice speed boost, renews local organic wrinkles and pulses the circle. Thinking offers a two-arm spiral, concentric ripples or curved scanning folds across the entire orb, selected with thinkingAnimation. Searching offers a lens on a 45-degree tilted oval that accelerates again before each lap ends with the saved custom Bezier motion, or a small lens that moves continuously through searchingAnimation. The lens keeps moving and joins each lap with continuous velocity. Error holds a stationary cross. Other states use recognizable glass patterns with fixed material settings.',
        },
        {
          name: 'audioLevel',
          type: 'number',
          defaultValue: '0.55',
          description:
            'Normalized microphone or assistant output envelope, 0–1. Active during listening and speaking.',
        },
        {
          name: 'getAudioLevel',
          type: '() => number',
          defaultValue: '—',
          description:
            'Sampled once per visible frame. Feed live audio without rendering React for each audio sample.',
        },
        {
          name: 'ref',
          type: 'LiquidGlassOrbHandle',
          defaultValue: '—',
          description:
            'setAudioLevel(level) updates the voice envelope; reset() restarts the animation.',
        },
        ...fluidAgentOrb.controls
          .filter((c) => !['preset', 'state', 'audioLevel'].includes(c.name))
          .map((c) => ({
            name: c.name,
            type: c.type,
            defaultValue: String(c.defaultValue),
            description: c.description ?? '',
          })),
      ]}
    />
  );
}
