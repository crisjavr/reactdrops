import { useEffect, useRef, useState } from 'react';
import { homeCarouselItems } from '@reactdrops/catalog-data/home-carousel-items';
import {
  DepthField,
  type DepthFieldHandle,
  type DepthFieldOrigin,
  type DepthFieldRotationDirection,
} from '@reactdrops/components/depth-field';
import { depthField } from '@reactdrops/catalog-data/catalog';
import { depthFieldSourceFiles } from '@reactdrops/catalog-data/sources/depth-field';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { ImageUploadControl } from './image-upload-control';
import {
  NumberControl,
  SelectControl,
  SingleLineTextControl,
  SwitchControl,
} from './customizer-controls';
import { ColorControl } from './color-control';
import './catalog.css';
import './depth-field-page.css';

const defaultImages: string[] = homeCarouselItems.map((item) => item.src);
const defaults = {
  speed: 5,
  entryBurst: 70,
  entryDuration: 2.8,
  entryDelay: 0,
  scrollBoost: 50,
  rotationSpeed: 11,
  rotationDirection: 'counterclockwise' as DepthFieldRotationDirection,
  spread: 12,
  depth: 96,
  count: 36,
  imageSize: 3.8,
  imageRadius: 0,
};
const originOptions = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'center-left', label: 'Center left' },
  { value: 'center', label: 'Center' },
  { value: 'center-right', label: 'Center right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
];
const defaultContent = {
  textAlign: 'center' as 'left' | 'center' | 'right',
  title: 'Follow your\ncuriosity.',
  subtitle: '',
  buttonText: 'Explore components',
  buttonHref: '/components',
  secondaryButtonText: 'Learn more',
  secondaryButtonHref: '#controls',
  fontFamily: "'Plus Jakarta Sans', 'Inter Variable', sans-serif",
  background: '#ffffff',
  color: '#242120',
  fontSize: 'clamp(2rem, 5.5cqw, 5rem)',
};
type Values = typeof defaults;

function DepthFieldImageUpload({
  index, value, fileName, onChange, onFile, onApply,
}: {
  index: number;
  value: string;
  fileName?: string;
  onChange: (value: string) => void;
  onFile: (file: File) => void;
  onApply: () => void;
}) {
  return (
    <ImageUploadControl
      className="is-wide"
      label={`Image ${index + 1}`}
      description="Drop an image or use the upload button. You can also enter an image URL and apply images."
      preview={fileName ? value : ''}
      fileName={fileName}
      url={{ value: fileName ? '' : value, placeholder: fileName, onChange, onApply }}
      onFile={onFile}
      onClear={() => onChange('')}
    />
  );
}
function example(
  images: string[],
  values: Values,
  content = defaultContent,
  paused = false,
  showText = true,
  imageOrigin: DepthFieldOrigin = 'center',
) {
  return `import { DepthField } from './components/depth-field';\n\n// Replace these paths with images from your project.\nconst images = ${JSON.stringify(images, null, 2)};\n\nexport function Example() {\n  return <DepthField\n    images={images}\n${Object.entries(
    { ...content, ...values, paused, showText, imageOrigin },
  )
    .map(([key, value]) => `    ${key}={${JSON.stringify(value)}}`)
    .join('\n')}\n    height="100svh"\n  />;\n}`;
}
export function depthFieldMeta() {
  return [
    { title: 'Depth Field — ReactDrops' },
    { name: 'description', content: depthField.description },
  ];
}
export default function DepthFieldPage() {
  const hero = useRef<DepthFieldHandle>(null);
  const [values, setValues] = useState(defaults),
    [content, setContent] = useState(defaultContent);
  const [images, setImages] = useState(defaultImages),
    [drafts, setDrafts] = useState(defaultImages);
  const [uploads, setUploads] = useState<Record<number, { url: string; name: string }>>({});
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const used = new Set([...images, ...drafts]);
    for (const url of objectUrls.current) {
      if (!used.has(url)) {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(url);
      }
    }
  }, [images, drafts]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  }, []);
  const changeImage = (index: number, value: string, apply = false) => {
    const next = drafts.map((item, i) => i === index ? value : item);
    setDrafts(next);
    if (apply) setImages(next.map((url) => url.trim()).filter(Boolean));
  };
  const [paused, setPaused] = useState(false),
    [preset, setPreset] = useState('default');
  const [showText, setShowText] = useState(true);
  const [imageOrigin, setImageOrigin] = useState<DepthFieldOrigin>('center');
  const usage = example(images, values, content, paused, showText, imageOrigin);
  const installCommands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/depth-field.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Depth Field" (ID: "depth-field") using:\n\n${installCommands.npm}\n\nKeep its DOM renderer with fixed natural-aspect image boxes, transform/opacity-only animation writes, native CSS perspective/depth sorting and cached viewport dimensions, irregular Cartesian image cloud emerging from behind the title, continuous forward depth travel and fade-in, outward perspective movement with stronger near/far image size contrast and opaque foreground exit, circular screen-space rotation using a uniform projection scale without aspect stretching or local oscillations, immediately visible text and buttons, decoded images starting from an empty field and emerging individually from behind the title with shared forward and angular acceleration, balanced arrival intervals, positions evaluated for projected coverage and overlaps throughout the complete depth cycle and rotation, angular directions distributed independently of arrival order to prevent radial trails during entry and recycling, and source images assigned independently of spatial/depth construction order, scroll input coalesced into animation frames without layout measurements, smoothly accelerating and fading scroll impulses and reduced-motion support. Replace demo image paths with project assets and integrate this configuration:\n\n${code}`;
  const sources: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...depthFieldSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  return (
    <ComponentDetailLayout
      componentName="Depth Field"
      componentSlug="depth-field"
      description={depthField.description}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example(defaultImages, defaults))}
      installCommands={installCommands}
      sourceFiles={sources}
      onReplay={() => hero.current?.replay()}
      previewActions={
        <button
          type="button"
          className="component-replay-button depth-field-overlay-control"
          aria-label="Text overlay"
          aria-pressed={showText}
          onClick={() => setShowText((value) => !value)}
        >
          <span>Text overlay</span>
          <span className="depth-field-overlay-state">{showText ? 'On' : 'Off'}</span>
        </button>
      }
      preview={
        <div className="depth-field-demo">
          <DepthField
            ref={hero}
            images={images}
            {...values}
            {...content}
            paused={paused}
            showText={showText}
            imageOrigin={imageOrigin}
            height="100%"
          />
        </div>
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
                description="The rotating depth cloud, a calmer field, or a static composition."
              >
                <SelectControl
                  label="Preset"
                  value={preset}
                  options={[
                    { value: 'default', label: 'Depth' },
                    { value: 'calm', label: 'Calm' },
                    { value: 'static', label: 'Static' },
                  ]}
                  onChange={(value) => {
                    setPreset(value);
                    setValues(
                      value === 'calm'
                        ? {
                            ...defaults,
                            speed: 4,
                            entryBurst: 12,
                            entryDuration: 2,
                            scrollBoost: 8,
                            rotationSpeed: 4,
                          }
                        : defaults,
                    );
                    setPaused(value === 'static');
                    hero.current?.replay();
                  }}
                />
              </ControlField>
              <ControlField
                label="Image origin"
                description="Vanishing point of the image field, independent of text alignment."
              >
                <SelectControl
                  label="Image origin"
                  value={imageOrigin}
                  options={originOptions}
                  onChange={(value) => setImageOrigin(value as DepthFieldOrigin)}
                />
              </ControlField>
              {depthField.controls
                .filter((control) => !['imageSize', 'imageRadius'].includes(control.name))
                .map((control) => (
                  <ControlField
                    key={control.name}
                    className={control.type === 'select' ? '' : 'is-number'}
                    label={control.label}
                    description={control.description ?? ''}
                  >
                    {control.type === 'select' ? (
                      <SelectControl
                        label={control.label}
                        value={String(values[control.name as keyof Values])}
                        options={(control.options ?? []).map((value) => ({
                          value,
                          label: value === 'clockwise' ? 'Clockwise' : 'Counterclockwise',
                        }))}
                        onChange={(value) =>
                          setValues((old) => ({ ...old, [control.name]: value }))
                        }
                      />
                    ) : (
                      <NumberControl
                        label={control.label}
                        value={Number(values[control.name as keyof Values])}
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        onChange={(value) => {
                          setValues((old) => ({ ...old, [control.name]: value }));
                          if (
                            Number(values[control.name as keyof Values]) !== value &&
                            ['entryBurst', 'entryDuration', 'entryDelay'].includes(control.name)
                          )
                            hero.current?.replay();
                        }}
                      />
                    )}
                  </ControlField>
                ))}
              <ControlField
                className="is-boolean"
                label="Pause motion"
                description="Freeze the image field in its current position."
              >
                <SwitchControl label="Pause motion" checked={paused} onChange={setPaused} />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Appearance</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Text alignment"
                description="Align the title, subtitle and buttons together."
              >
                <SelectControl
                  label="Text alignment"
                  value={content.textAlign}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                  ]}
                  onChange={(textAlign) =>
                    setContent((old) => ({
                      ...old,
                      textAlign: textAlign as 'left' | 'center' | 'right',
                    }))
                  }
                />
              </ControlField>
              {depthField.controls
                .filter((control) => ['imageSize', 'imageRadius'].includes(control.name))
                .map((control) => (
                  <ControlField
                    key={control.name}
                    className="is-number"
                    label={control.label}
                    description={control.description ?? ''}
                  >
                    <NumberControl
                      label={control.label}
                      value={Number(values[control.name as keyof Values])}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      onChange={(value) => setValues((old) => ({ ...old, [control.name]: value }))}
                    />
                  </ControlField>
                ))}
              {(['background', 'color'] as const).map((name) => (
                <ControlField
                  key={name}
                  className="is-color"
                  label={name === 'background' ? 'Background color' : 'Text color'}
                  description="Set the colors of the hero section."
                >
                  <ColorControl
                    label={name === 'background' ? 'Background color' : 'Text color'}
                    value={content[name]}
                    onChange={(value) => setContent((old) => ({ ...old, [name]: value }))}
                  />
                </ControlField>
              ))}
              <ControlField
                className="is-wide"
                label="Font family"
                description="Heading font. Plus Jakarta Sans matches the ReactDrops home."
              >
                <SingleLineTextControl
                  label="Font family"
                  value={content.fontFamily}
                  onChange={(fontFamily) => setContent((old) => ({ ...old, fontFamily }))}
                />
              </ControlField>
              <ControlField
                className="is-wide"
                label="Font size (CSS)"
                description="Heading size. Use clamp() for responsive typography."
              >
                <SingleLineTextControl
                  label="Font size (CSS)"
                  value={content.fontSize}
                  onChange={(value) => setContent((old) => ({ ...old, fontSize: value }))}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Content</h3>
            </legend>
            <div className="reveal-fields">
              {(['title', 'subtitle'] as const).map((name) => (
                <ControlField
                  key={name}
                  className="is-wide"
                  label={name === 'title' ? 'Title' : 'Subtitle'}
                  description="Editable demo text displayed over the image field. Use \\n for a line break."
                >
                  <SingleLineTextControl
                    label={name === 'title' ? 'Title' : 'Subtitle'}
                    value={content[name].replaceAll('\n', '\\n')}
                    onChange={(value) =>
                      setContent((old) => ({ ...old, [name]: value.replaceAll('\\n', '\n') }))
                    }
                  />
                </ControlField>
              ))}
              <ControlField
                label="Primary button text"
                description="Call-to-action label. Leave empty to hide the button."
              >
                <SingleLineTextControl
                  label="Primary button text"
                  value={content.buttonText}
                  onChange={(buttonText) => setContent((old) => ({ ...old, buttonText }))}
                />
              </ControlField>
              <ControlField
                className="is-wide"
                label="Primary button link"
                description="Destination URL or section anchor for the call to action."
              >
                <SingleLineTextControl
                  label="Primary button link"
                  value={content.buttonHref}
                  onChange={(buttonHref) => setContent((old) => ({ ...old, buttonHref }))}
                />
              </ControlField>
              <ControlField
                label="Secondary button text"
                description="Second demo button label. Leave empty to hide it."
              >
                <SingleLineTextControl
                  label="Secondary button text"
                  value={content.secondaryButtonText}
                  onChange={(secondaryButtonText) =>
                    setContent((old) => ({ ...old, secondaryButtonText }))
                  }
                />
              </ControlField>
              <ControlField
                className="is-wide"
                label="Secondary button link"
                description="Destination URL or section anchor for the second button."
              >
                <SingleLineTextControl
                  label="Secondary button link"
                  value={content.secondaryButtonHref}
                  onChange={(secondaryButtonHref) =>
                    setContent((old) => ({ ...old, secondaryButtonHref }))
                  }
                />
              </ControlField>
              {drafts.map((url, index) => (
                <DepthFieldImageUpload
                  key={index}
                  index={index}
                  value={url}
                  fileName={uploads[index]?.url === url ? uploads[index].name : undefined}
                  onChange={(value) => changeImage(index, value, Boolean(uploads[index]?.url === url))}
                  onFile={(file) => {
                    const source = URL.createObjectURL(file);
                    objectUrls.current.add(source);
                    setUploads((old) => ({ ...old, [index]: { url: source, name: file.name } }));
                    changeImage(index, source, true);
                  }}
                  onApply={() => setImages(drafts.map((url) => url.trim()).filter(Boolean))}
                />
              ))}
            </div>
            <div className="depth-field-image-actions">
              <button
                type="button"
                onClick={() => setImages(drafts.map((url) => url.trim()).filter(Boolean))}
              >
                Apply images
              </button>
              <button
                type="button"
                onClick={() => {
                  setImages(defaultImages);
                  setDrafts(defaultImages);
                  setUploads({});
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
          name: 'images',
          type: 'readonly string[]',
          defaultValue: 'Required',
          description:
            'Image sources repeated through the depth field. Empty lists leave a text-only hero.',
        },
        ...depthField.controls.map((control) => ({
          name: control.name,
          type: control.type,
          defaultValue: String(control.defaultValue),
          description: control.description ?? '',
        })),
        ...Object.entries(defaultContent).map(([name, value]) => ({
          name,
          type: 'string',
          defaultValue: value || 'Empty',
          description:
            name === 'buttonText' || name === 'secondaryButtonText'
              ? 'Call-to-action label. Empty hides the button.'
              : name === 'buttonHref' || name === 'secondaryButtonHref'
                ? 'Destination URL or section anchor.'
                : name === 'fontFamily'
                  ? 'Heading font stack. Load Plus Jakarta Sans in the host project to match the demo.'
                  : 'Customize the hero text and appearance.',
        })),
        {
          name: 'imageOrigin',
          type: 'DepthFieldOrigin',
          defaultValue: 'center',
          description:
            'Nine vanishing points: center, edge midpoints and corners. Changing it preserves the current animation.',
        },
        {
          name: 'showText',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'Show or hide the title, optional subtitle and buttons without stopping the image field.',
        },
        {
          name: 'paused',
          type: 'boolean',
          defaultValue: 'false',
          description:
            'Freeze the field. Reduced-motion preferences automatically show a static composition.',
        },
        {
          name: 'height',
          type: 'number | string',
          defaultValue: '600',
          description: 'Section height in pixels or a CSS length, such as 100svh.',
        },
        {
          name: 'ref',
          type: 'DepthFieldHandle',
          defaultValue: '—',
          description:
            'replay() restarts the image entrance while the heading and buttons stay visible.',
        },
        {
          name: 'className / style',
          type: 'string / CSSProperties',
          defaultValue: '—',
          description: 'Additional root styling.',
        },
      ]}
    />
  );
}
