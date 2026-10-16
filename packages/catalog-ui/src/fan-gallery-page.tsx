import { useRef, useState } from 'react';
import {
  FanGallery,
  fanDefaults,
  fanMotionDefaults,
  type FanEntrance,
  type FanGalleryHandle,
  type FanGalleryItem,
  type FanGalleryProps,
  type FanLayoutInfo,
} from '@reactdrops/components/fan-gallery';
import { fanGallery } from '@reactdrops/catalog-data/catalog';
import { fanGallerySourceFiles } from '@reactdrops/catalog-data/sources/fan-gallery';
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
import { ViewportEntryControls } from './viewport-entry-controls';
import './catalog.css';
import './fan-gallery-page.css';
const defaultItems: FanGalleryItem[] = [
  {
    src: '/assets/orbit-tunnel/mavis-hopper-6mhc2gBMAyM-unsplash.webp',
    alt: 'Glass cube on a dark pedestal',
  },
  { src: '/assets/hero-artwork/02.webp', alt: 'Blue grain gradient' },
  { src: '/assets/hero-artwork/04.webp', alt: 'Liquid glass orb' },
  { src: '/assets/hero-artwork/05.webp', alt: 'Reflective orbit tunnel' },
  {
    src: '/assets/orbit-tunnel/julien-moreau-688Fna1pwOQ-unsplash.webp',
    alt: 'White geometric architecture against a pale blue sky',
  },
];
function resizeItems(items: FanGalleryItem[], count: number) {
  const center = Math.floor(items.length / 2);
  return Array.from({ length: count }, (_, index) => {
    const offset = index - Math.floor(count / 2);
    return { ...(items[center + offset] ?? defaultItems[index % defaultItems.length]) };
  });
}
const defaults = {
  ...fanDefaults,
  speed: fanMotionDefaults.speed,
  stagger: fanMotionDefaults.stagger,
  bounce: fanMotionDefaults.bounce,
  hoverSpeed: fanMotionDefaults.hoverSpeed,
  radius: fanMotionDefaults.radius,
};
type Values = typeof defaults;
type Playback = Required<Pick<FanGalleryProps, 'trigger' | 'viewportStart' | 'once'>> &
  Pick<FanGalleryProps, 'viewportStartUp'>;
const defaultPlayback: Playback = { trigger: 'scroll', viewportStart: 75, once: true };
const playbackLabels: Record<string, string> = {
  auto: 'On mount',
  scroll: 'In viewport',
  manual: 'Manual',
  hover: 'Hover / focus',
};
const presets: { value: string; label: string; values: Values }[] = [
  { value: 'fan', label: 'Classic fan', values: defaults },
  {
    value: 'tight',
    label: 'Tight stack',
    values: { ...defaults, spacing: 0.36, curve: 0.1, tilt: 12, lift: 48, spread: 0.08 },
  },
  {
    value: 'wide',
    label: 'Wide arc',
    values: { ...defaults, spacing: 1.8, curve: 0.3, tilt: 26, lift: 30, spread: 0.12 },
  },
  {
    value: 'flat',
    label: 'Flat row',
    values: { ...defaults, spacing: 0.72, curve: 0, tilt: 0, lift: 36, spread: 0.05 },
  },
  {
    value: 'prints',
    label: 'Square prints',
    values: { ...defaults, aspectRatio: 1, radius: 10 },
  },
  {
    value: 'springy',
    label: 'Springy',
    values: { ...defaults, bounce: 0.75, speed: 0.9, stagger: 0.07, lift: 52 },
  },
];
const defaultValues = presets[0].values;
const appearanceNames = ['cardWidth', 'aspectRatio', 'radius'] as const;
function example(
  items = defaultItems,
  values: Values = defaultValues,
  playback = defaultPlayback,
  entrance: FanEntrance = 'stack',
) {
  const manual = playback.trigger === 'manual';
  const instance = `    <FanGallery${manual ? '\n      ref={gallery}' : ''}\n      items={items}\n${Object.entries(
    { ...values, entrance, ...playback, showTitle: false },
  )
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `      ${name}={${JSON.stringify(value)}}`)
    .join('\n')}\n    />`;
  return `${manual ? "import {useRef} from 'react';\n" : ''}import {FanGallery${manual ? ', type FanGalleryHandle' : ''}} from './components/fan-gallery';\n\n// Replace the demo paths with your own images; href is optional.\nconst items = ${JSON.stringify(items, null, 2)};\n\nexport function Example() {\n${manual ? '  const gallery = useRef<FanGalleryHandle>(null);\n' : ''}  return (\n${manual ? '    <>\n' : ''}${instance}${manual ? '\n      <button onClick={() => gallery.current?.play()}>Play</button>\n    </>' : ''}\n  );\n}`;
}
export function fanGalleryMeta() {
  return [
    { title: 'Fan Gallery — ReactDrops' },
    { name: 'description', content: fanGallery.description },
  ];
}
export default function FanGalleryPage() {
  const ref = useRef<FanGalleryHandle>(null);
  const [values, setValues] = useState<Values>(defaultValues);
  const [playback, setPlayback] = useState(defaultPlayback);
  const [entrance, setEntrance] = useState<FanEntrance>('stack');
  const [fitted, setFitted] = useState<FanLayoutInfo | null>(null);
  const [viewportPreview, setViewportPreview] = useState<{ start: number; up?: number } | null>(
    null,
  );
  const [viewportSession, setViewportSession] = useState(0);
  const editingViewport = useRef(false);
  const previewViewport = (value: { start: number; up?: number } | null) => {
    // A fresh editing session re-arms even a preview that has already played once.
    if (value && !editingViewport.current) setViewportSession((session) => session + 1);
    editingViewport.current = value !== null;
    setViewportPreview(value);
  };
  const preset =
    presets.find((p) =>
      Object.entries(p.values).every(
        ([key, value]) =>
          // Only the card width is yours to keep; everything else defines the preset.
          key === 'cardWidth' || values[key as keyof Values] === value,
      ),
    )?.value ?? 'custom';
  const [items, setItems] = useState(defaultItems),
    [draft, setDraft] = useState(defaultItems);
  const usage = example(items, values, playback, entrance);
  const installCommands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/fan-gallery.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the ReactDrops component "Fan Gallery" (ID: "fan-gallery") using:\n\n${installCommands.npm}\n\nEqual-size cards sit on a symmetric curve: spacing sets the distance between card centers as a fraction of the card width, curve how far the outer cards drop and tilt how far they lean outward; one side lies in front at rest (stackFrom). Cards arrive with spring physics (speed, bounce, stagger): stack (default) opens a closed stack like a swatch book, deal throws cards from a deck beside the stage along an arc, rise lifts them from below, flip turns them from edge-on to face, circular sweeps them one by one along an arc and deck carries a closed deck that unfolds on arrival. Hovering a card's horizontal slot (or focusing it) lifts it by lift, straightens it and brings it forward; each side of the fan slides away as one piece exactly far enough that the hovered card overlaps no other card, keeping a clear margin of spread card widths. Every card moves on its own spring (hoverSpeed). Keep the playback trigger, responsive fitting, keyboard controls and reduced-motion behavior. Replace the demo paths with project images. Apply this configuration:\n\n${code}`;
  const sourceFiles: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...fanGallerySourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const staggerDescription: Record<FanEntrance, string> = {
    stack: 'Delay between cards as the stack opens, from the front side.',
    deal: 'Delay between cards thrown from the deck, front side first.',
    rise: 'Delay between cards rising from below, front side first.',
    flip: 'Delay between cards turning to face, front side first.',
    circular: 'Delay between cards launched along the arc, front side first.',
    deck: 'The deck travels as one; this is the delay between cards unfolding once it arrives.',
  };
  const describe = (name: string, fallback: string) => {
    if (name === 'stagger') return staggerDescription[entrance];
    if (name === 'spacing' && fitted && fitted.spacing < fitted.requestedSpacing - 1e-3)
      return `${fallback} This preview is narrow: spacing is fitted to ${fitted.spacing.toFixed(2)}.`;
    return fallback;
  };
  const numbers = (appearance: boolean) =>
    fanGallery.controls
      .filter(
        (c) =>
          c.type === 'number' &&
          c.name in defaults &&
          appearanceNames.some((name) => name === c.name) === appearance,
      )
      .map((c) => (
        <ControlField
          key={c.name}
          className="is-number"
          label={c.label}
          description={describe(c.name, c.description ?? '')}
        >
          <NumberControl
            label={c.label}
            value={values[c.name as keyof Values] as number}
            min={c.min}
            max={c.max}
            step={c.step}
            onChange={(value) => setValues((old) => ({ ...old, [c.name]: value }))}
          />
        </ControlField>
      ));
  return (
    <ComponentDetailLayout
      componentName="Fan Gallery"
      componentSlug="fan-gallery"
      description={fanGallery.description}
      installCommands={installCommands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example())}
      sourceFiles={sourceFiles}
      onReplay={() => ref.current?.replay()}
      replayOnPreview={false}
      preview={
        <FanGallery
          key={viewportSession}
          onLayout={setFitted}
          ref={ref}
          items={items}
          {...values}
          {...playback}
          entrance={entrance}
          viewportStart={viewportPreview?.start ?? playback.viewportStart}
          viewportStartUp={viewportPreview ? viewportPreview.up : playback.viewportStartUp}
          showTitle={false}
        />
      }
      controls={
        <>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Preset"
                description="Starting points for the fan and its motion; your card width is preserved. Combine them with any entrance."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    ...presets.map(({ value, label }) => ({ value, label })),
                    ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : []),
                  ]}
                  onChange={(value) => {
                    const selected = presets.find((p) => p.value === value);
                    if (selected)
                      setValues((old) => ({
                        ...selected.values,
                        cardWidth: old.cardWidth,
                      }));
                    requestAnimationFrame(() => ref.current?.replay());
                  }}
                />
              </ControlField>
              <ControlField
                label="Card count"
                description="Choose 1–15 cards, including even counts. New slots reuse demo images; edit their URLs under Content."
              >
                <SelectControl
                  label="Card count"
                  value={String(items.length)}
                  options={Array.from({ length: 15 }, (_, index) => {
                    const count = index + 1;
                    return { value: String(count), label: String(count) };
                  })}
                  onChange={(value) => {
                    const count = Number(value);
                    setItems((old) => resizeItems(old, count));
                    setDraft((old) => resizeItems(old, count));
                  }}
                />
              </ControlField>
              <ControlField
                label="Entrance"
                description="Stack spread opens a closed stack like a swatch book. Deal throws cards from a deck beside the stage. Rise lifts them into place from below. Flip turns them from edge-on to face. Circular sweep and Deck unfold travel along an arc."
              >
                <SelectControl
                  label="Entrance"
                  value={entrance}
                  options={[
                    { value: 'stack', label: 'Stack spread' },
                    { value: 'deal', label: 'Deal' },
                    { value: 'rise', label: 'Rise' },
                    { value: 'flip', label: 'Flip' },
                    { value: 'circular', label: 'Circular sweep' },
                    { value: 'deck', label: 'Deck unfold' },
                  ]}
                  onChange={(value) => {
                    setEntrance(value as FanEntrance);
                    requestAnimationFrame(() => ref.current?.replay());
                  }}
                />
              </ControlField>
              <ControlField
                label="Front cards"
                description="Which side of the fan lies in front at rest. Deal, Circular sweep and Deck unfold also enter from that side."
              >
                <SelectControl
                  label="Front cards"
                  value={values.stackFrom}
                  options={[
                    { value: 'left', label: 'Left in front' },
                    { value: 'right', label: 'Right in front' },
                  ]}
                  onChange={(value) =>
                    setValues((old) => ({ ...old, stackFrom: value as Values['stackFrom'] }))
                  }
                />
              </ControlField>
              {numbers(false)}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Playback</h3>
            </legend>
            <div className="reveal-fields">
              {fanGallery.controls
                .filter(
                  (c) =>
                    c.name in defaultPlayback &&
                    (c.name === 'trigger' || playback.trigger === 'scroll'),
                )
                .map((c) =>
                  c.name === 'viewportStart' ? (
                    <ViewportEntryControls
                      key={c.name}
                      start={playback.viewportStart}
                      up={playback.viewportStartUp}
                      onPreviewChange={previewViewport}
                      onStartChange={(viewportStart) =>
                        setPlayback((old) => ({ ...old, viewportStart }))
                      }
                      onUpChange={(viewportStartUp) =>
                        setPlayback((old) => ({ ...old, viewportStartUp }))
                      }
                    />
                  ) : (
                    <ControlField
                      key={c.name}
                      className={`is-${c.type}`}
                      label={c.label}
                      description={c.description ?? ''}
                    >
                      {c.type === 'select' ? (
                        <SelectControl
                          label={c.label}
                          value={playback.trigger}
                          options={(c.options ?? []).map((value) => ({
                            value,
                            label: playbackLabels[value] ?? value,
                          }))}
                          onChange={(value) =>
                            setPlayback((old) => ({
                              ...old,
                              trigger: value as Playback['trigger'],
                            }))
                          }
                        />
                      ) : (
                        <SwitchControl
                          label={c.label}
                          checked={playback.once}
                          onChange={(once) => setPlayback((old) => ({ ...old, once }))}
                        />
                      )}
                    </ControlField>
                  ),
                )}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Appearance</h3>
            </legend>
            <div className="reveal-fields">{numbers(true)}</div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Content</h3>
            </legend>
            <div className="reveal-fields">
              {draft.map((item, i) => (
                <ControlField
                  key={i}
                  className="is-wide"
                  label={`Image ${i + 1}`}
                  description="Image URL or project asset path."
                >
                  <SingleLineTextControl
                    label={`Image ${i + 1}`}
                    value={item.src}
                    onChange={(src) =>
                      setDraft((old) => old.map((p, index) => (index === i ? { ...p, src } : p)))
                    }
                  />
                </ControlField>
              ))}
            </div>
            <div className="fan-gallery-actions">
              <button
                type="button"
                onClick={() => setItems(draft.map((item) => ({ ...item, src: item.src.trim() })))}
              >
                Apply images
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(defaultItems);
                  setItems(defaultItems);
                }}
              >
                Reset images
              </button>
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'items',
          type: 'FanGalleryItem[]',
          defaultValue: 'Required',
          description:
            'Images with src, alt and an optional href. The demo starts with five images; its count selector accepts every count from 1 to 15, including even counts.',
        },
        ...fanGallery.controls.map((c) => ({
          name: c.name,
          type:
            c.type === 'select'
              ? (c.options ?? []).map((value) => JSON.stringify(value)).join(' | ')
              : c.type,
          defaultValue:
            c.name === 'viewportStartUp' ? '100 - viewportStart' : String(c.defaultValue),
          description: c.description ?? '',
        })),
        {
          name: 'title / subtitle',
          type: 'string',
          defaultValue: 'Empty',
          description: 'Optional heading and description with inherited fonts; they fade in with the cards.',
        },
        {
          name: 'showTitle',
          type: 'boolean',
          defaultValue: 'false',
          description: 'Show or hide the heading.',
        },
        {
          name: 'ref',
          type: 'FanGalleryHandle',
          defaultValue: '—',
          description:
            'play() starts or replays the entrance; reset() restores its starting pose; finish() shows the fan immediately. replay() remains an alias for play().',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description: 'Style the outer section; colors and font inherit from the page.',
        },
      ]}
    />
  );
}
