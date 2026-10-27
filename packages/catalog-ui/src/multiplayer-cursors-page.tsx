import { Fragment, useState } from 'react';
import {
  defaultCursorMotion,
  type CursorEasing,
  type CursorLabelAnimation,
  type CursorMotion,
} from '@reactdrops/components/multiplayer-cursors';
import { multiplayerCursors } from '@reactdrops/catalog-data/catalog';
import { multiplayerCursorsSourceFiles } from '@reactdrops/catalog-data/sources/multiplayer-cursors';
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
import {
  MultiplayerCursorsDemo,
  type DemoCursor,
  type MultiplayerDemo,
} from './multiplayer-cursors-demos';
import './catalog.css';
import './multiplayer-cursors-page.css';

const defaults = {
  labelAnimation: 'fade' as CursorLabelAnimation,
  speed: 1,
  clickEffect: true,
  idleDrift: 1.5,
  labelLag: 0.35,
  cursorSize: 1,
  loop: true,
  trail: 0,
  trailWidth: 3,
};
const easingOptions = [
  { value: 'human', label: 'Human (minimum jerk)' },
  { value: 'ease-in-out', label: 'Ease in out' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'linear', label: 'Linear' },
];
const motionNumbers = [
  'curvature',
  'overshoot',
  'reachTime',
  'reachScale',
  'maxReach',
  'landingSpread',
  'dragPace',
] as const;
const defaultPeople: DemoCursor[] = [
  { name: 'Kubai', color: '#0d99ff' },
  { name: 'Mara', color: '#f24e9c' },
  { name: 'Theo', color: '#14ae5c' },
];
const demoOptions = [
  { value: 'together', label: 'Together' },
  { value: 'click', label: 'Hover and click' },
  { value: 'drag', label: 'Drag' },
  { value: 'select', label: 'Select' },
];
const labelOptions = [
  { value: 'roll', label: 'Wheel roll' },
  { value: 'masked-lift', label: 'Masked Lift' },
  { value: 'fade', label: 'Fade and scale' },
  { value: 'none', label: 'None' },
];
const control = (name: string) => multiplayerCursors.controls.find((item) => item.name === name)!;

function example(
  values = defaults,
  people = defaultPeople,
  motion: Required<CursorMotion> = defaultCursorMotion,
) {
  const changedMotion = Object.fromEntries(
    Object.entries(motion).filter(
      ([name, value]) => defaultCursorMotion[name as keyof CursorMotion] !== value,
    ),
  );
  const props = [
    ...Object.entries(values)
      .filter(([name, value]) => defaults[name as keyof typeof defaults] !== value)
      .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`),
    ...(Object.keys(changedMotion).length
      ? [`      motion={${JSON.stringify(changedMotion)}}`]
      : []),
  ].join('\n');
  return `import { useState } from 'react';
import { MultiplayerCursors } from './components/multiplayer-cursors';

export function Example() {
  const [published, setPublished] = useState(false);
  return (
    <MultiplayerCursors${props ? `\n${props}` : ''}
      height={420}
      onCursorPress={({ target }) => {
        if (target.closest('#publish')) setPublished(true);
      }}
      onCycle={() => setPublished(false)}
      cursors={[
        {
          id: 'one',
          name: ${JSON.stringify(people[0].name)},
          color: ${JSON.stringify(people[0].color)},
          script: [
            { action: 'hover', target: '#publish' },
            { action: 'click', target: '#publish' },
            { action: 'say', text: 'Shipped!', duration: 1600 },
            { action: 'wait', duration: 1600 },
          ],
        },
        {
          id: 'two',
          name: ${JSON.stringify(people[1].name)},
          color: ${JSON.stringify(people[1].color)},
          script: [
            { action: 'select', target: '#copy', start: 0, end: 18 },
            { action: 'wait', duration: 2000 },
          ],
        },
      ]}
    >
      <p id="copy">Design together, ship faster.</p>
      <button id="publish" type="button" onClick={() => setPublished(true)}>
        {published ? 'Published' : 'Publish'}
      </button>
    </MultiplayerCursors>
  );
}`;
}

export function multiplayerCursorsMeta() {
  return [
    { title: 'Multiplayer Cursors — ReactDrops' },
    { name: 'description', content: multiplayerCursors.description },
  ];
}

export default function MultiplayerCursorsPage() {
  const [values, setValues] = useState(defaults);
  const [motion, setMotion] = useState<Required<CursorMotion>>(defaultCursorMotion);
  const [people, setPeople] = useState(defaultPeople);
  const [demo, setDemo] = useState<MultiplayerDemo>('together');
  const [replay, setReplay] = useState(0);
  const usage = example(values, people, motion);
  const installCommands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/multiplayer-cursors.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Multiplayer Cursors" (ID: "multiplayer-cursors") using:\n\n${installCommands.npm}\n\nUse the installed source as the source of truth. Keep the pointer-transparent overlay, curved minimum-jerk movement, [data-cursor-hover], [data-cursor-press] and [data-cursor-selected] state attributes, and reduced-motion support. Scripted clicks are visual presses: use onCursorPress to update local preview state, never call .click() or dispatch click, pointerdown/up or mousedown/up events for those presses. Do not navigate, submit forms or invoke production actions from onCursorPress. Hover, drag, selection and typing retain their respective behavior. Reset preview state in onCycle. Apply this configuration:\n\n${code}`;
  const sourceFiles: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...multiplayerCursorsSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const set = <K extends keyof typeof defaults>(name: K, value: (typeof defaults)[K]) =>
    setValues((old) => ({ ...old, [name]: value }));
  const setPerson = (index: number, patch: Partial<DemoCursor>) =>
    setPeople((old) => old.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const numbers = ['speed', 'idleDrift', 'cursorSize'] as const;
  const trailNumbers = ['trail', 'trailWidth', 'labelLag'] as const;

  return (
    <ComponentDetailLayout
      componentName="Multiplayer Cursors"
      componentSlug="multiplayer-cursors"
      description={multiplayerCursors.description}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      installCommands={installCommands}
      sourceFiles={sourceFiles}
      onReplay={() => setReplay((value) => value + 1)}
      preview={
        <div className="mpc-stage">
          <MultiplayerCursorsDemo
            key={`${demo}-${replay}`}
            demo={demo}
            people={people}
            height="100%"
            {...values}
            motion={motion}
          />
        </div>
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Demo</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField label="Demo" description={control('demo').description ?? ''}>
                <SelectControl
                  label="Demo"
                  value={demo}
                  options={demoOptions}
                  onChange={(value) => setDemo(value as MultiplayerDemo)}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Loop"
                description={control('loop').description ?? ''}
              >
                <SwitchControl
                  label="Loop"
                  checked={values.loop}
                  onChange={(value) => set('loop', value)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Cursors</h3>
            </legend>
            <div className="reveal-fields">
              {people.map((item, index) => (
                <Fragment key={index}>
                  <ControlField
                    className="is-color"
                    label={`Color ${index + 1}`}
                    description={`Arrow and label color of cursor ${index + 1}. Label text switches between white and black for contrast.`}
                  >
                    <ColorControl
                      label={`Color ${index + 1}`}
                      value={item.color}
                      onChange={(color) => setPerson(index, { color })}
                    />
                  </ControlField>
                  <ControlField
                    label={`Name ${index + 1}`}
                    description={`Label of cursor ${index + 1}. Changes animate with the selected label animation.`}
                  >
                    <SingleLineTextControl
                      label={`Name ${index + 1}`}
                      value={item.name}
                      onChange={(name) => setPerson(index, { name })}
                    />
                  </ControlField>
                </Fragment>
              ))}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Label animation"
                description={control('labelAnimation').description ?? ''}
              >
                <SelectControl
                  label="Label animation"
                  value={values.labelAnimation}
                  options={labelOptions}
                  onChange={(value) => set('labelAnimation', value as CursorLabelAnimation)}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Click effect"
                description={control('clickEffect').description ?? ''}
              >
                <SwitchControl
                  label="Click effect"
                  checked={values.clickEffect}
                  onChange={(value) => set('clickEffect', value)}
                />
              </ControlField>
              {numbers.map((name) => {
                const item = control(name);
                return (
                  <ControlField
                    key={name}
                    className="is-number"
                    label={item.label}
                    description={item.description ?? ''}
                  >
                    <NumberControl
                      label={item.label}
                      value={values[name]}
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      onChange={(value) => set(name, value)}
                    />
                  </ControlField>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Movement</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField label="Easing" description={control('easing').description ?? ''}>
                <SelectControl
                  label="Easing"
                  value={motion.easing}
                  options={easingOptions}
                  onChange={(value) =>
                    setMotion((old) => ({ ...old, easing: value as CursorEasing }))
                  }
                />
              </ControlField>
              {motionNumbers.map((name) => {
                const item = control(name);
                return (
                  <ControlField
                    key={name}
                    className="is-number"
                    label={item.label}
                    description={item.description ?? ''}
                  >
                    <NumberControl
                      label={item.label}
                      value={motion[name]}
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      onChange={(value) => setMotion((old) => ({ ...old, [name]: value }))}
                    />
                  </ControlField>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Trail</h3>
            </legend>
            <div className="reveal-fields">
              {trailNumbers.map((name) => {
                const item = control(name);
                return (
                  <ControlField
                    key={name}
                    className="is-number"
                    label={item.label}
                    description={item.description ?? ''}
                  >
                    <NumberControl
                      label={item.label}
                      value={values[name]}
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      onChange={(value) => set(name, value)}
                    />
                  </ControlField>
                );
              })}
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'cursors',
          type: 'CursorConfig[]',
          defaultValue: '—',
          description:
            'Each cursor: id, name, color, optional textColor, start position and script. Scripts of different cursors run at the same time.',
        },
        {
          name: 'script steps',
          type: 'CursorStep',
          defaultValue: '—',
          description:
            'enter, leave, move, hover, click, drag (from, to), select (target, start, end), marquee (from, to, items), type (target, text), say (text, duration), wait, clear and call. Targets are selectors, elements, { target, x, y } fractions or { x, y } in px or %.',
        },
        {
          name: 'ref',
          type: 'MultiplayerCursorsHandle',
          defaultValue: '—',
          description:
            'cursor(id) returns moveTo, hover, click, drag, select, marquee, type, say, wait, enter, leave and clear, each a Promise. run(id, steps) and restart() are also available.',
        },
        ...Object.entries(defaults).map(([name, value]) => ({
          name,
          type:
            typeof value === 'string' ? "'roll' | 'masked-lift' | 'fade' | 'none'" : typeof value,
          defaultValue: String(value),
          description: control(name).description ?? '',
        })),
        {
          name: 'motion',
          type: 'CursorMotion',
          defaultValue: JSON.stringify(defaultCursorMotion),
          description:
            'Movement rules: curvature, overshoot, reachTime, reachScale, maxReach, easing, landingSpread and dragPace. Omitted rules keep the defaults, which reproduce the built-in feel.',
        },
        {
          name: 'playing',
          type: 'boolean',
          defaultValue: 'true',
          description: 'False pauses every cursor in place. Scripts also pause off-screen.',
        },
        {
          name: 'loopDelay',
          type: 'number',
          defaultValue: '1400',
          description: 'Milliseconds between loops.',
        },
        {
          name: 'showLabels',
          type: 'boolean',
          defaultValue: 'true',
          description: 'Show the name pills.',
        },
        {
          name: 'onCursorPress',
          type: '(press: CursorPress) => void',
          defaultValue: '—',
          description:
            'Receives cursorId and the target element after a simulated press. Use it to update local preview state. Scripted presses never dispatch native clicks or submit forms; this callback should not invoke production actions.',
        },
        {
          name: 'onCycle',
          type: '() => void',
          defaultValue: '—',
          description:
            'Runs before each loop, after selections and hover states clear. Reset the state your scripts changed.',
        },
        {
          name: 'height / className / style',
          type: 'number | string / string / CSSProperties',
          defaultValue: '—',
          description:
            'Style the container. The overlay never receives pointer events, so the real user can keep using the content.',
        },
      ]}
    />
  );
}
