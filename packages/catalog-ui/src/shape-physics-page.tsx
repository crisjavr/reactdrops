import { useRef, useState } from 'react';
import {
  ShapePhysics,
  shapeDefaults,
  type ShapePhysicsHandle,
  type ShapeSettings,
} from '@reactdrops/components/shape-physics';
import { shapePhysics } from '@reactdrops/catalog-data/catalog';
import { shapePhysicsSourceFiles } from '@reactdrops/catalog-data/sources/shape-physics';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './shape-physics-page.css';

// Only changed settings are copied; the height keeps the canvas visible in any parent.
function example(values: ShapeSettings = shapeDefaults) {
  const props = [
    '      height="100svh"',
    ...Object.entries(values)
      .filter(
        ([key, value]) =>
          key !== 'variant' &&
          JSON.stringify(value) !== JSON.stringify(shapeDefaults[key as keyof ShapeSettings]),
      )
      .map(([key, value]) => `      ${key}={${JSON.stringify(value)}}`),
  ].join('\n');
  return `import { ShapePhysics } from './components/shape-physics';\n\nexport function Example() {\n  return (\n    <ShapePhysics\n${props}\n    />\n  );\n}`;
}
export function shapePhysicsMeta() {
  return [
    { title: 'Shape Physics — ReactDrops' },
    { name: 'description', content: shapePhysics.description },
  ];
}

export default function ShapePhysicsPage() {
  const ref = useRef<ShapePhysicsHandle>(null);
  const [values, setValues] = useState<ShapeSettings>({ ...shapeDefaults });
  const [preset, setPreset] = useState('solids');
  const [sizeLimit, setSizeLimit] = useState(80);
  const [full, setFull] = useState(false);
  const set = <K extends keyof ShapeSettings>(key: K, value: ShapeSettings[K]) => {
    setPreset('custom');
    setValues((old) => ({ ...old, [key]: value }));
  };
  const usage = example(values);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/shape-physics.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Shape Physics" (ID: "shape-physics") using:\n\n${commands.npm}\n\nUse its installed source. Preserve the theme-aware Canvas2D surface with six characters in flat colors with white capsule eyes: a sphere, a cone with a round apex and circular base, a rounded cube, a cloud of five balls, a drop of revolution and a thick single-color flower prism, in the default palette (blue or brown spheres, pink or orange cones, amber cubes, teal, green or amber clouds, purple drops, red flowers). Each figure is a 3D volume built from convex pieces (points and balls swept by a sphere) whose orthographic projection gives the exact rounded silhouette used for both painting and collision. depth='3d' (default) lets bodies tumble in 3D while falling and on impacts, and a damped spring returns supported bodies to their resting pose; depth='2d' keeps the same figures flat, rotating only in the screen plane. Eyes are decals on the volume that turn with it and hide when facing away; curved bodies map every outline vertex onto an ellipsoid cap toward the cursor, while cube and flower eyes stay inside their flat front face. followCursor enables eye tracking for a stable subset of figures; cursorFollowRatio selects the share (0.4 by default). The engine uses sweep-and-prune broadphase, rounded-polygon SAT contacts, a soft-step solver with warm starting, island sleeping, cached sprites at rest, dirty-region repainting and an idle loop that only repaints blinking eyes. Figures fall in through the lane with the most room until an area budget or the lanes say the container is full, then emission stops; a resize that leaves too little room fades out the topmost figures. Dragging is drag and drop with a stiff spring at the grabbed point; release throws. Characters right themselves in the air and lean back toward upright at rest. The background follows the page by default. No external artwork, physics package or WebGL is needed. Props update live; seed replays the arrangement. Pause freezes simulation and emission; reduced motion produces a settled still field with direct cursor response. Replace colors or dynamics using this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...shapePhysicsSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const fields = (names: string[]) =>
    shapePhysics.controls
      .filter((c) => names.includes(c.name))
      .map((c) => (
        <ControlField
          key={c.name}
          className="is-number"
          label={c.label}
          description={
            c.name === 'size'
              ? `Maximum ${sizeLimit}px for the current figures and container.`
              : (c.description ?? '')
          }
        >
          <NumberControl
            label={c.label}
            value={values[c.name as keyof ShapeSettings] as number}
            min={c.name === 'size' ? Math.min(c.min ?? 8, sizeLimit) : c.min}
            max={c.name === 'size' ? sizeLimit : c.max}
            step={c.step}
            onChange={(v) => set(c.name as keyof ShapeSettings, v)}
          />
        </ControlField>
      ));
  return (
    <ComponentDetailLayout
      componentName={shapePhysics.name}
      componentSlug={shapePhysics.slug}
      description={shapePhysics.description}
      installCommands={commands}
      sourceFiles={files}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      onReplay={() => ref.current?.replay()}
      replayOnPreview={false}
      preview={
        <div className="shape-physics-demo component-background-preview">
          <ShapePhysics
            ref={ref}
            {...values}
            onSizeLimitChange={setSizeLimit}
            onFullChange={setFull}
          />
        </div>
      }
      previewActions={
        <div className="shape-physics-actions">
          <button
            type="button"
            className="component-replay-button"
            aria-pressed={values.paused}
            onClick={() => setValues((old) => ({ ...old, paused: !old.paused }))}
          >
            {values.paused ? 'Play' : 'Pause'}
          </button>
          <button
            type="button"
            className="component-replay-button"
            onClick={() => ref.current?.addShape()}
            disabled={full}
            title={full ? 'No more figures fit at the selected size' : undefined}
          >
            Add shape
          </button>
          <button
            type="button"
            className="component-replay-button"
            onClick={() => ref.current?.shake()}
          >
            Shake
          </button>
          <button
            type="button"
            className="component-replay-button"
            onClick={() => ref.current?.clear()}
          >
            Clear
          </button>
        </div>
      }
      controls={
        <>
          <p className="shape-physics-help">
            Click to create a shape. Drag and release to throw. Enter adds one; R starts again.
          </p>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Shapes</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Preset"
                description="A starting setup; every setting remains editable."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    { value: 'solids', label: 'Projected solids' },
                    { value: 'flat-solids', label: 'Flat solids (2D)' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                  onChange={(p) => {
                    if (p === 'custom') {
                      setPreset(p);
                      return;
                    }
                    setValues({ ...shapeDefaults, depth: p === 'flat-solids' ? '2d' : '3d' });
                    setPreset(p);
                    requestAnimationFrame(() => ref.current?.replay());
                  }}
                />
              </ControlField>
              <ControlField
                label="Depth"
                description="3D volumes tumble and show their sides; 2D keeps the same figures flat."
              >
                <SelectControl
                  label="Depth"
                  value={values.depth}
                  options={[
                    { value: '3d', label: '3D volumes' },
                    { value: '2d', label: 'Flat (2D)' },
                  ]}
                  onChange={(v) => set('depth', v as ShapeSettings['depth'])}
                />
              </ControlField>
              <ControlField
                label="Shape"
                description="Mix figures or give every figure the same shape."
              >
                <SelectControl
                  label="Shape"
                  value={values.shape}
                  options={[
                    { value: 'mixed', label: 'Mixed figures' },
                    { value: 'circle', label: 'Spheres' },
                    { value: 'triangle', label: 'Cones' },
                    { value: 'square', label: 'Cubes' },
                    { value: 'cloud', label: 'Clouds' },
                    { value: 'teardrop', label: 'Drops' },
                    { value: 'puff', label: 'Flowers' },
                  ]}
                  onChange={(v) => set('shape', v as ShapeSettings['shape'])}
                />
              </ControlField>
              <ControlField label="Faces" description="Toggle the eyes.">
                <SwitchControl
                  label="Faces"
                  checked={values.faces}
                  onChange={(v) => set('faces', v)}
                />
              </ControlField>
              <ControlField
                label="Follow cursor"
                description="Some figures look toward your mouse or pen, even when the physics is paused."
              >
                <SwitchControl
                  label="Follow cursor"
                  checked={values.followCursor}
                  onChange={(v) => set('followCursor', v)}
                />
              </ControlField>
              <ControlField
                label="Cursor followers (%)"
                description="Choose how many figures follow the pointer. The others keep their independent gaze."
              >
                <NumberControl
                  label="Cursor followers (%)"
                  value={(values.cursorFollowRatio ?? shapeDefaults.cursorFollowRatio) * 100}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => set('cursorFollowRatio', v / 100)}
                />
              </ControlField>
              {fields([
                'count',
                'size',
                'sizeVariation',
                'spawnRate',
                'appearanceDuration',
                'seed',
              ])}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Physics</h3>
            </legend>
            <div className="reveal-fields">
              {fields(['gravity', 'wind', 'restitution', 'friction', 'damping', 'spin'])}
              <ControlField
                label="Pointer interaction"
                description="Create objects and drag or throw existing ones. Keyboard creation is also available."
              >
                <SwitchControl
                  label="Pointer interaction"
                  checked={values.interactive}
                  onChange={(v) => set('interactive', v)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Palette</h3>
            </legend>
            <div className="reveal-fields">
              {values.colors.map((color, i) => (
                <ControlField
                  key={i}
                  label={`Shape color ${i + 1}`}
                  description="Updates the figures already on the canvas."
                >
                  <ColorControl
                    label={`Shape color ${i + 1}`}
                    value={color}
                    onChange={(v) =>
                      set(
                        'colors',
                        values.colors.map((c, index) => (index === i ? v : c)),
                      )
                    }
                  />
                </ControlField>
              ))}
              <ControlField label="Face color" description="Color of the eyes.">
                <ColorControl
                  label="Face color"
                  value={values.faceColor}
                  onChange={(v) => set('faceColor', v)}
                />
              </ControlField>
              <ControlField
                label="Canvas background"
                description="Follows the page's light/dark theme by default. Enter a custom color to override it."
              >
                <ColorControl
                  label="Canvas background"
                  value={values.background}
                  onChange={(v) => set('background', v)}
                />
              </ControlField>
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'height',
          type: 'number | string',
          defaultValue: '100%',
          description:
            'Height of the canvas. Without it the component fills its parent, which needs a defined height.',
        },
        ...shapePhysics.controls.map((c) => ({
          name: c.name,
          type:
            c.type === 'select'
              ? (c.options ?? []).map((option) => JSON.stringify(option)).join(' | ')
              : c.type,
          defaultValue: String(c.defaultValue),
          description: c.description ?? '',
        })),
        {
          name: 'faceColor',
          type: 'string',
          defaultValue: '#ffffff',
          description: 'Color of the eyes. Accepts CSS colors and variables.',
        },
        {
          name: 'colors / background',
          type: 'readonly string[] / string',
          defaultValue: 'Default palette / page background',
          description:
            'CSS colors, variables or system colors. The background follows the page theme by default; explicit colors remain unchanged across theme switches.',
        },
        {
          name: 'paused / interactive',
          type: 'boolean',
          defaultValue: 'false / true',
          description: 'Pause generation and physics; enable creation and dragging.',
        },
        {
          name: 'onFullChange',
          type: '(full: boolean) => void',
          defaultValue: '—',
          description: 'Reports when another figure no longer fits at the selected fixed radius.',
        },
        {
          name: 'onSizeLimitChange',
          type: '(maximum: number) => void',
          defaultValue: '—',
          description:
            'Receives the maximum radius that fits the current figure count and container.',
        },
        {
          name: 'ref',
          type: 'ShapePhysicsHandle',
          defaultValue: '—',
          description:
            'replay(), clear(), addShape(), shake(). Clear stays empty until creation or replay.',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description: 'Host styling. The canvas fills the width and height of its parent.',
        },
      ]}
    />
  );
}
