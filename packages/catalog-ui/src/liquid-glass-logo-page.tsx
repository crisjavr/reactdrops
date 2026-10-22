import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import {
  LiquidGlassLogo,
  liquidGlassLogoDefaults,
  liquidGlassLogoNoteLogo,
  liquidGlassLogoReferenceMark,
  liquidGlassLogoThemes,
  type LiquidGlassLogoHandle,
  type LiquidGlassLogoTuning,
} from '../../components/src/liquid-glass-logo';
import { liquidGlassLogo } from '@reactdrops/catalog-data/catalog';
import { liquidGlassLogoSourceFiles } from '@reactdrops/catalog-data/sources/liquid-glass-logo';
import {
  ComponentDetailLayout,
  type ComponentPackageManager,
  type ComponentSourceFile,
} from './component-detail-layout';
import { ControlField } from './controls-panel';
import { NumberControl, SelectControl, SwitchControl } from './customizer-controls';
import { ColorControl } from './color-control';
import {
  liquidGlassLogoVideoFormats,
  recordLiquidGlassLogoVideo,
  type LiquidGlassLogoVideoFormat,
} from './liquid-glass-logo-export';
import { LiquidGlassLogoDropZone } from './liquid-glass-logo-dropzone';
import './catalog.css';
import './liquid-glass-logo-page.css';

// Exact favicon outlines, in their final navbar orientation (its SVG and CSS
// rotations cancel). Keep the two straight right edges and the 8-unit gutters.
const dropsLogo = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 208" fill="#fff">
    <path d="M.5 0 C.6667 0 .8333 0 1 0 C1 .1667 1 .3333 1 .5 C1 .6667 1 .8333 1 1 C.8333 1 .6667 1 .5 1 C.362 1 .232 .945 .146 .854 C.055 .768 0 .638 0 .5 C0 .362 .055 .232 .146 .146 C.232 .055 .362 0 .5 0 Z" transform="translate(0 108) scale(100)" />
    <path d="M.5 0 C.6667 0 .8333 0 1 0 C1 .1667 1 .3333 1 .5 C1 .6667 1 .8333 1 1 C.8333 1 .6667 1 .5 1 C.362 1 .232 .945 .146 .854 C.055 .768 0 .638 0 .5 C0 .362 .055 .232 .146 .146 C.232 .055 .362 0 .5 0 Z" transform="scale(100)" />
    <path d="M.5 0 C.6067 .1033 .7133 .2067 .82 .31 C.91 .4 .955 .5025 .955 .605 C.955 .7075 .91 .81 .82 .9 C.735 .9675 .6175 1.00125 .5 1.00125 C.3825 1.00125 .265 .9675 .18 .9 C.09 .81 .045 .7075 .045 .605 C.045 .5025 .09 .4 .18 .31 C.2867 .2067 .3933 .1033 .5 0 Z" transform="translate(108 108) scale(100)" />
    <path d="M.5 0 C.5333 0 .5667 0 .6 0 C.821 0 1 .179 1 .4 C1 .6 1 .8 1 1 C.8333 1 .6667 1 .5 1 C.3333 1 .1667 1 0 1 C0 .8333 0 .6667 0 .5 C0 .3333 0 .1667 0 0 C.1667 0 .3333 0 .5 0 Z" transform="translate(108 0) scale(100)" />
  </svg>
`)}`;
// Nike Swoosh, cropped to its bounds so it fills the plate. Demo only.
const nikeLogo = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 7.6 24 8.8" fill="#fff">
    <path d="M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z" />
  </svg>
`)}`;
// X wordmark. Demo only.
const xLogo = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 1.15 24 21.7" fill="#fff">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
`)}`;
// Further brand marks for trying different silhouettes. Demo only.
const brandLogo = (viewBox: string, path: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#fff"><path d="${path}" /></svg>`,
  )}`;
// Note silhouette matched to the supplied app-icon reference.
const noteLogo = brandLogo(
  '0 0 190 252',
  'M58 48C58 45 60 43 63 42L173 5C181 2 184 5 184 12V166C184 185 172 201 153 207C134 213 116 205 114 190C111 174 122 157 140 150C149 146 158 145 166 146C168 146 169 144 169 141V75C169 70 167 68 162 70L79 99C75 100 74 102 74 106V203C74 223 62 239 43 245C23 251 7 243 4 228C1 211 12 195 30 188C39 184 48 183 55 184C57 184 58 182 58 180V48Z',
);
const appleLogo = liquidGlassLogoReferenceMark;
const spotifyLogo = brandLogo(
  '0 0 24 24',
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
);
const githubLogo = brandLogo(
  '0 0 24 24',
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
);
const logos = {
  nike: nikeLogo,
  x: xLogo,
  apple: appleLogo,
  spotify: spotifyLogo,
  github: githubLogo,
  note: noteLogo,
  drops: dropsLogo,
} as const;
const logoNames: Record<keyof typeof logos, string> = {
  nike: 'Nike',
  x: 'X',
  apple: 'Apple',
  spotify: 'Spotify',
  github: 'GitHub',
  note: 'Music note',
  drops: 'ReactDrops',
};
type LogoChoice = keyof typeof logos | 'upload';

const logoControls = [
  'theme',
  'logoSize',
  'logoScale',
  'finalLogoScale',
  'tile',
  'logoColor',
  'logoRelief',
  'tileColor',
  'background',
  'depth',
  'dispersion',
  'relief',
  'caustics',
  'highlights',
  'bloom',
  'dropStrength',
  'decay',
  'echoTint',
  'innerWallFocus',
  'speed',
  'loop',
  'loopDelay',
  'paused',
] as const;
const controlNames = new Set<string>(logoControls);
type Values = Pick<LiquidGlassLogoTuning, (typeof logoControls)[number]>;
type NumericKey = { [K in keyof Values]: Values[K] extends number ? K : never }[keyof Values];
type ColorKey = 'logoColor' | 'tileColor' | 'background';
const defaults = Object.fromEntries(
  logoControls.map((name) => [name, liquidGlassLogoDefaults[name]]),
) as Values;

const noteGlass = {
  depth: 1.1,
  dispersion: 2.5,
  relief: 0.4,
  caustics: 0.3,
  highlights: 1.95,
  echoTint: 0.5,
  innerWallFocus: 0,
  bloom: 1.15,
} satisfies Partial<Values>;

const logoGlass = (choice: LogoChoice) =>
  choice === 'note'
    ? noteGlass
    : {
        depth: choice === 'nike' ? 2.9 : defaults.depth,
        dispersion: defaults.dispersion,
        relief: defaults.relief,
        caustics: defaults.caustics,
        highlights: defaults.highlights,
        echoTint: defaults.echoTint,
        innerWallFocus: defaults.innerWallFocus,
        bloom: defaults.bloom,
      };

// Video export: the short side of each resolution, the aspect ratios offered,
// and how long the logo sequence runs before it settles (with a short hold).
const exportResolutions = [720, 1080, 1440, 2160] as const;
const exportAspects = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '4:3': [4, 3],
} as const;
type ExportAspect = keyof typeof exportAspects;
const exportDuration = 2.4;
type ExportJob = {
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  logoSize: number;
  fps: number;
};
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const backgroundDefaults = {
  backgroundX: 0,
  backgroundY: 0,
  backgroundScale: 1,
  backgroundTint: '#000000',
  backgroundTintOpacity: 0,
};
type BackgroundValues = typeof backgroundDefaults;
const backgroundNumbers = [
  {
    name: 'backgroundX',
    label: 'Position X',
    min: -100,
    max: 100,
    step: 1,
    description: 'Move the image left or right, as a percentage of the frame width.',
  },
  {
    name: 'backgroundY',
    label: 'Position Y',
    min: -100,
    max: 100,
    step: 1,
    description: 'Move the image up or down, as a percentage of the frame height.',
  },
  {
    name: 'backgroundScale',
    label: 'Zoom',
    min: 1,
    max: 3,
    step: 0.05,
    description: 'Enlarge the image to keep the frame covered while moving it.',
  },
  {
    name: 'backgroundTintOpacity',
    label: 'Tint intensity',
    min: 0,
    max: 1,
    step: 0.05,
    description:
      'Use black to darken the background, or choose a tint color. Zero removes the tint.',
  },
] as const;

function example(values: Values, logo: LogoChoice, background?: BackgroundValues) {
  // Colors that match the chosen theme are implied by it and stay out of the code.
  const base: Values = { ...defaults, ...liquidGlassLogoThemes[values.theme], theme: 'dark' };
  const props = Object.entries(values)
    .filter(([name, value]) => controlNames.has(name) && base[name as keyof Values] !== value)
    .map(([name, value]) =>
      typeof value === 'string'
        ? `      ${name}={${JSON.stringify(value)}}`
        : `      ${name}={${String(value)}}`,
    );
  if (background) {
    props.push('      backgroundImage="/your-background.jpg"');
    for (const [name, value] of Object.entries(background)) {
      if (value !== backgroundDefaults[name as keyof BackgroundValues]) {
        props.push(`      ${name}={${JSON.stringify(value)}}`);
      }
    }
  }
  return `import { LiquidGlassLogo } from './components/liquid-glass-logo';\n\nexport function Example() {\n  return (\n    <LiquidGlassLogo\n      logo="${logo === 'upload' ? '/your-logo.svg' : '/logo.svg'}"\n      ending="logo"\n${props.join('\n')}${props.length ? '\n' : ''}      style={{ height: 480 }}\n    />\n  );\n}`;
}

export function liquidGlassLogoMeta() {
  return [
    { title: 'Liquid Glass Logo — ReactDrops' },
    { name: 'description', content: liquidGlassLogo.description },
  ];
}

export default function LiquidGlassLogoPage() {
  const ref = useRef<LiquidGlassLogoHandle>(null);
  const [values, setValues] = useState<Values>({ ...defaults, ...logoGlass('nike') });
  const chooseLogo = (choice: LogoChoice) => {
    setLogo(choice);
    setValues((old) => ({ ...old, ...logoGlass(choice) }));
  };
  const [logo, setLogo] = useState<LogoChoice>('nike');
  const [upload, setUpload] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [backgroundName, setBackgroundName] = useState('');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [backgroundValues, setBackgroundValues] = useState(backgroundDefaults);
  const setBackground = <K extends keyof BackgroundValues>(key: K, value: BackgroundValues[K]) =>
    setBackgroundValues((old) => ({ ...old, [key]: value }));
  const [exportAspect, setExportAspect] = useState<ExportAspect>('16:9');
  const [exportResolution, setExportResolution] =
    useState<(typeof exportResolutions)[number]>(1080);
  const [exportFps, setExportFps] = useState(60);
  const [exportFormat, setExportFormat] = useState<LiquidGlassLogoVideoFormat['extension']>('mp4');
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState('');
  const [videoFormats, setVideoFormats] = useState<LiquidGlassLogoVideoFormat[]>([]);
  const videoFormat = videoFormats.find((format) => format.extension === exportFormat) ?? null;
  const demo = useRef<HTMLDivElement>(null);
  const exportHost = useRef<HTMLDivElement>(null);
  const exportRef = useRef<LiquidGlassLogoHandle>(null);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((old) => ({ ...old, [key]: value }));
  useEffect(() => () => (upload ? URL.revokeObjectURL(upload) : undefined), [upload]);
  useEffect(
    () => () => (backgroundImage ? URL.revokeObjectURL(backgroundImage) : undefined),
    [backgroundImage],
  );
  useEffect(() => {
    const supported = liquidGlassLogoVideoFormats();
    setVideoFormats(supported);
    if (supported[0]) setExportFormat(supported[0].extension);
  }, []);
  // The demo follows the site's light or dark theme, now and whenever it changes.
  const pageTheme = useRef<Values['theme'] | null>(null);
  const applyTheme = (theme: Values['theme']) => {
    const { logoColor, tileColor, background } = liquidGlassLogoThemes[theme];
    setValues((old) => ({
      ...old,
      theme,
      logoColor: old.logoColor === 'original' ? 'original' : logoColor,
      tileColor,
      background,
    }));
  };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const root = document.documentElement;
      const isDark = root.hasAttribute('data-theme')
        ? root.dataset.theme === 'dark'
        : root.classList.contains('dark') || media.matches;
      const theme = isDark ? 'dark' : 'light';
      if (theme === pageTheme.current) return;
      pageTheme.current = theme;
      applyTheme(theme);
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
    // Only the page theme drives this; a manual pick stays until the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reset = () => {
    const theme = pageTheme.current ?? 'dark';
    setValues({ ...defaults, theme, ...liquidGlassLogoThemes[theme], ...logoGlass('nike') });
    setLogo('nike');
    setUpload('');
    setUploadName('');
    setBackgroundImage('');
    setBackgroundName('');
    setBackgroundValues(backgroundDefaults);
    ref.current?.replay();
  };
  // Renders the sequence off screen at the exact output size, framed like the
  // preview frame: the tile keeps its size relative to the frame's short side.
  const exportVideo = async () => {
    if (!videoFormat || exportJob) return;
    const [across, down] = exportAspects[exportAspect];
    const width = even(across >= down ? (exportResolution * across) / down : exportResolution);
    const height = even(across >= down ? exportResolution : (exportResolution * down) / across);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 4);
    const cssWidth = width / pixelRatio;
    const cssHeight = height / pixelRatio;
    const preview = demo.current?.getBoundingClientRect();
    const previewShort = Math.min(preview?.width || 480, preview?.height || 480);
    const logoSize = Math.min(
      1024,
      Math.max(24, (values.logoSize * Math.min(cssWidth, cssHeight)) / previewShort),
    );
    setExportError('');
    setExportProgress(0);
    flushSync(() =>
      setExportJob({ width, height, cssWidth, cssHeight, pixelRatio, logoSize, fps: exportFps }),
    );
    try {
      const host = exportHost.current;
      if (!host) throw new Error('The export view did not open.');
      const started = performance.now();
      while (!host.querySelector('[data-liquid-glass-ready]')) {
        if (performance.now() - started > 15000) throw new Error('The logo did not load in time.');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const source = host.querySelector('canvas');
      if (!source) throw new Error('The export view has no canvas.');
      const { blob, extension } = await recordLiquidGlassLogoVideo({
        source,
        seek: (seconds) => exportRef.current?.seek(seconds),
        width,
        height,
        fps: exportFps,
        format: videoFormat,
        duration: exportDuration,
        background: values.background,
        backgroundImage: backgroundImage || undefined,
        ...backgroundValues,
        onProgress: setExportProgress,
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `liquid-glass-logo-${exportAspect.replace(':', 'x')}-${width}x${height}-${exportFps}fps.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExportJob(null);
    }
  };
  const logoSource = logo === 'upload' ? upload || liquidGlassLogoNoteLogo : logos[logo];
  const usage = example(values, logo, backgroundImage ? backgroundValues : undefined);
  const commands = Object.fromEntries(
    Object.entries({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'yarn dlx', bun: 'bunx --bun' }).map(
      ([manager, runner]) => [
        manager,
        `${runner} shadcn@latest add https://reactdrops.dev/r/liquid-glass-logo.json`,
      ],
    ),
  ) as Record<ComponentPackageManager, string>;
  const prompt = (code: string) =>
    `Install the existing ReactDrops component "Liquid Glass Logo" (ID: "liquid-glass-logo") with:\n\n${commands.npm}\n\nUse the installed files as the source of truth. Preserve the sphere-to-tile glass entrance, wavelength-based bevel refraction, chromatic edge streaks, measured responsive fitting, reduced-motion support and the image fallback. Finish on the original logo alone at its normal size, on a black background, without a second text reveal. Replace the logo URL with the project's own logo and integrate it with this configuration:\n\n${code}`;
  const files: ComponentSourceFile[] = [
    { id: 'usage', label: 'usage', code: usage, language: 'typescript' },
    ...liquidGlassLogoSourceFiles.map((file) => ({
      id: file.name,
      label: file.name,
      code: file.content,
      language: file.name.endsWith('.css') ? ('css' as const) : ('typescript' as const),
    })),
  ];
  const control = (name: string) => liquidGlassLogo.controls.find((item) => item.name === name)!;
  const numbers = (names: NumericKey[]) =>
    names.map((name) => (
      <ControlField
        key={name}
        className="is-number"
        label={control(name).label}
        description={control(name).description ?? ''}
      >
        <NumberControl
          label={control(name).label}
          value={values[name]}
          min={control(name).min}
          max={control(name).max}
          step={control(name).step}
          onChange={(value) => set(name, value)}
        />
      </ControlField>
    ));
  const colors = (names: ColorKey[]) =>
    names.map((name) => (
      <ControlField
        key={name}
        className="is-color"
        label={control(name).label}
        description={control(name).description ?? ''}
      >
        <ColorControl
          label={control(name).label}
          value={values[name] === 'original' ? '#ffffff' : values[name]}
          onChange={(value) => set(name, value)}
        />
      </ControlField>
    ));

  return (
    <ComponentDetailLayout
      componentName="Liquid Glass Logo"
      componentSlug="liquid-glass-logo"
      description={liquidGlassLogo.description}
      installCommands={commands}
      prompt={prompt(usage)}
      defaultPrompt={prompt(example(defaults, 'note'))}
      sourceFiles={files}
      onReplay={() => ref.current?.replay()}
      controlsActions={
        <button className="liquid-glass-logo-reset-action" type="button" onClick={reset}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v4.5h4.5" />
          </svg>
          Reset
        </button>
      }
      preview={
        <div className="liquid-glass-logo-demo component-background-preview">
          {/* The preview keeps its size and shows the export frame inside it. */}
          <div
            ref={demo}
            className={`liquid-glass-logo-frame${exportAspect === '16:9' ? ' is-fill' : ''}`}
            style={
              {
                '--frame-ratio': exportAspects[exportAspect][0] / exportAspects[exportAspect][1],
              } as CSSProperties
            }
          >
            <LiquidGlassLogo
              ref={ref}
              {...values}
              ending="logo"
              text=""
              mark=""
              aria-label={logo === 'upload' ? 'Logo' : logoNames[logo]}
              logo={logoSource}
              backgroundImage={backgroundImage || undefined}
              {...backgroundValues}
              style={{ height: '100%', minHeight: 0 }}
            />
          </div>
          {exportJob && (
            <div
              ref={exportHost}
              className="liquid-glass-logo-export-stage"
              aria-hidden="true"
              style={{ width: exportJob.cssWidth, height: exportJob.cssHeight }}
            >
              <LiquidGlassLogo
                ref={exportRef}
                {...values}
                paused
                loop={false}
                ending="logo"
                text=""
                mark=""
                logo={logoSource}
                logoSize={exportJob.logoSize}
                maxDpr={exportJob.pixelRatio}
                backgroundImage={backgroundImage || undefined}
                {...backgroundValues}
                style={{ height: '100%', minHeight: 0 }}
              />
            </div>
          )}
        </div>
      }
      controls={
        <>
          <div className="liquid-glass-logo-drops">
            <LiquidGlassLogoDropZone
              title="Background"
              hint="Drop an image or click"
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml"
              validate={(file) => (file.type.startsWith('image/') ? null : 'Use an image file.')}
              preview={backgroundImage}
              fit="cover"
              fileName={backgroundName}
              onFile={(file) => {
                setBackgroundImage(URL.createObjectURL(file));
                setBackgroundName(file.name);
                setBackgroundValues(backgroundDefaults);
              }}
              onClear={() => {
                setBackgroundImage('');
                setBackgroundName('');
                setBackgroundValues(backgroundDefaults);
              }}
            />
            <LiquidGlassLogoDropZone
              title="Logo"
              hint="SVG or PNG · drop or click"
              accept=".svg,.png,image/svg+xml,image/png"
              validate={(file) => {
                // Other formats can fail to rasterize cleanly, so only SVG and PNG are taken.
                const name = file.name.toLowerCase();
                const supported =
                  file.type === 'image/svg+xml' ||
                  file.type === 'image/png' ||
                  name.endsWith('.svg') ||
                  name.endsWith('.png');
                return supported ? null : 'Use an SVG or PNG file.';
              }}
              preview={upload}
              fit="contain"
              surface={values.background}
              fileName={uploadName}
              onFile={(file) => {
                setUpload(URL.createObjectURL(file));
                setUploadName(file.name);
                chooseLogo('upload');
                ref.current?.replay();
              }}
              onClear={() => {
                setUpload('');
                setUploadName('');
                chooseLogo('nike');
                ref.current?.replay();
              }}
            />
          </div>
          {backgroundImage && (
            <fieldset className="reveal-control-group">
              <legend className="reveal-group-heading">
                <h3>Background</h3>
              </legend>
              <div className="reveal-fields">
                {backgroundNumbers.map(({ name, label, description, min, max, step }) => (
                  <ControlField
                    key={name}
                    className="is-number"
                    label={label}
                    description={description}
                  >
                    <NumberControl
                      label={label}
                      value={backgroundValues[name]}
                      min={min}
                      max={max}
                      step={step}
                      onChange={(value) => setBackground(name, value)}
                    />
                  </ControlField>
                ))}
                <ControlField
                  className="is-color"
                  label="Tint color"
                  description="Color layered over the background image, behind the glass and logo."
                >
                  <ColorControl
                    label="Tint color"
                    value={backgroundValues.backgroundTint}
                    onChange={(value) => setBackground('backgroundTint', value)}
                  />
                </ControlField>
              </div>
            </fieldset>
          )}
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Logo</h3>
            </legend>
            <div className="reveal-fields">
              <ControlField
                label="Theme"
                description="Light or dark page, plate and logo colors. Follows the site theme; pick one here to override it."
              >
                <SelectControl
                  label="Theme"
                  value={values.theme}
                  options={[
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                  ]}
                  onChange={(value) => {
                    applyTheme(value as Values['theme']);
                    ref.current?.replay();
                  }}
                />
              </ControlField>
              <ControlField
                label="Logo"
                description="Pick a sample logo, or drop your own SVG or PNG in the Logo box above."
              >
                <SelectControl
                  label="Logo"
                  value={logo}
                  options={[
                    { value: 'nike', label: 'Nike' },
                    { value: 'x', label: 'X' },
                    { value: 'apple', label: 'Apple' },
                    { value: 'spotify', label: 'Spotify' },
                    { value: 'github', label: 'GitHub' },
                    { value: 'note', label: 'Note' },
                    { value: 'drops', label: 'ReactDrops' },
                    ...(upload ? [{ value: 'upload', label: 'Your logo' }] : []),
                  ]}
                  onChange={(value) => {
                    chooseLogo(value as LogoChoice);
                    ref.current?.replay();
                  }}
                />
              </ControlField>
              <ControlField
                className="is-boolean"
                label="Original colors"
                description="Keep the image colors instead of recoloring the logo silhouette."
              >
                <SwitchControl
                  label="Original colors"
                  checked={values.logoColor === 'original'}
                  onChange={(value) => set('logoColor', value ? 'original' : '#ffffff')}
                />
              </ControlField>
              {numbers(
                values.logoColor === 'original'
                  ? ['logoSize', 'logoScale', 'finalLogoScale']
                  : ['logoSize', 'logoScale', 'finalLogoScale', 'logoRelief'],
              )}
              <ControlField
                className="is-boolean"
                label="Icon plate"
                description={
                  backgroundImage
                    ? 'Off while a background image is set: the glass stays see-through.'
                    : 'Show the dark glass plate behind the logo.'
                }
              >
                <SwitchControl
                  label="Icon plate"
                  checked={values.tile && !backgroundImage}
                  onChange={(value) => set('tile', value)}
                />
              </ControlField>
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Glass</h3>
            </legend>
            <div className="reveal-fields">
              {numbers([
                'depth',
                'dispersion',
                'relief',
                'caustics',
                'highlights',
                'echoTint',
                'innerWallFocus',
                'bloom',
              ])}
              {colors(
                values.logoColor === 'original'
                  ? ['tileColor', 'background']
                  : ['logoColor', 'tileColor', 'background'],
              )}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Motion</h3>
            </legend>
            <div className="reveal-fields">
              {numbers(['dropStrength', 'decay', 'speed', 'loopDelay'])}
              {(['loop', 'paused'] as const).map((name) => (
                <ControlField
                  key={name}
                  className="is-boolean"
                  label={control(name).label}
                  description={control(name).description ?? ''}
                >
                  <SwitchControl
                    label={control(name).label}
                    checked={values[name]}
                    onChange={(value) => set(name, value)}
                  />
                </ControlField>
              ))}
            </div>
          </fieldset>
          <fieldset className="reveal-control-group">
            <legend className="reveal-group-heading">
              <h3>Export video</h3>
            </legend>
            <div className="reveal-fields">
              {videoFormats.length > 0 && (
                <ControlField
                  label="Format"
                  description="Video file format. Available formats depend on your browser."
                >
                  <SelectControl
                    label="Format"
                    value={exportFormat}
                    options={videoFormats.map(({ extension }) => ({
                      value: extension,
                      label: extension === 'mp4' ? 'MP4' : 'WebM',
                    }))}
                    onChange={(value) =>
                      setExportFormat(value as LiquidGlassLogoVideoFormat['extension'])
                    }
                  />
                </ControlField>
              )}
              <ControlField label="Aspect ratio" description="Frame shape of the exported video.">
                <SelectControl
                  label="Aspect ratio"
                  value={exportAspect}
                  options={Object.keys(exportAspects).map((value) => ({ value, label: value }))}
                  onChange={(value) => setExportAspect(value as ExportAspect)}
                />
              </ControlField>
              <ControlField label="Resolution" description="Size of the short side, in pixels.">
                <SelectControl
                  label="Resolution"
                  value={String(exportResolution)}
                  options={exportResolutions.map((value) => ({
                    value: String(value),
                    label: value === 2160 ? '4K (2160p)' : `${value}p`,
                  }))}
                  onChange={(value) =>
                    setExportResolution(Number(value) as (typeof exportResolutions)[number])
                  }
                />
              </ControlField>
              <ControlField label="Frame rate" description="Frames per second.">
                <SelectControl
                  label="Frame rate"
                  value={String(exportFps)}
                  options={[
                    { value: '30', label: '30 fps' },
                    { value: '60', label: '60 fps' },
                  ]}
                  onChange={(value) => setExportFps(Number(value))}
                />
              </ControlField>
              <ControlField
                className="is-wide"
                label="Download"
                description={
                  videoFormat
                    ? `Records the ${exportDuration}-second sequence as ${videoFormat.extension.toUpperCase()} with the current settings, background and logo. Keep this tab open while it records.`
                    : 'This browser cannot record video.'
                }
              >
                <button
                  className="liquid-glass-logo-reset liquid-glass-logo-export"
                  type="button"
                  disabled={!videoFormat || !!exportJob}
                  onClick={exportVideo}
                >
                  {exportJob ? `Exporting… ${Math.round(exportProgress * 100)}%` : 'Export video'}
                </button>
                {exportError && (
                  <p className="liquid-glass-logo-export-error" role="alert">
                    {exportError}
                  </p>
                )}
              </ControlField>
            </div>
          </fieldset>
        </>
      }
      properties={[
        {
          name: 'logo',
          type: 'string',
          defaultValue: 'note SVG',
          description: 'Image URL for the tile logo: SVG, PNG, WebP or a data URL.',
        },
        ...liquidGlassLogo.controls
          .filter((item) => controlNames.has(item.name))
          .map((item) => ({
            name: item.name,
            type: item.type === 'color' ? 'string' : item.type,
            defaultValue: String(item.defaultValue),
            description: item.description ?? '',
          })),
        {
          name: 'backgroundImage',
          type: 'string',
          defaultValue: '—',
          description:
            'Image URL drawn behind the animation, covering the container. The plate turns see-through so the image shows through the glass.',
        },
        {
          name: 'backgroundX / backgroundY',
          type: 'number',
          defaultValue: '0',
          description: 'Image offsets from the center, from -100 to 100 percent of the frame size.',
        },
        {
          name: 'backgroundScale',
          type: 'number',
          defaultValue: '1',
          description: 'Zoom of the cover image, from 1 to 3.',
        },
        {
          name: 'backgroundTint',
          type: 'string',
          defaultValue: '#000000',
          description:
            'Overlay color between the background image and the logo. Black darkens the image.',
        },
        {
          name: 'backgroundTintOpacity',
          type: 'number',
          defaultValue: '0',
          description: 'Opacity of the background tint, from 0 (off) to 1 (opaque).',
        },
        {
          name: 'maxDpr',
          type: 'number',
          defaultValue: '2',
          description: 'Upper bound for the canvas pixel ratio.',
        },
        {
          name: 'ref',
          type: 'LiquidGlassLogoHandle',
          defaultValue: '—',
          description: 'replay(), seek(seconds), pause() and play() control the sequence.',
        },
        {
          name: 'height / className / style',
          type: 'number | string / string / CSSProperties',
          defaultValue: '—',
          description: 'Size the container; the animation fits inside it.',
        },
        {
          name: 'aria-label',
          type: 'string',
          defaultValue: 'Logo',
          description: 'Accessible name for the logo.',
        },
      ]}
    />
  );
}
