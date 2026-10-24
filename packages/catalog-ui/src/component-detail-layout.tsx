import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ControlsPanel } from './controls-panel';
import { CatalogSidebar } from './catalog-sidebar';
import {
  ComponentPreviewToolbar,
  PreviewFullscreenButton,
  type PreviewViewport,
} from './component-preview-toolbar';
import { HighlightedCode, type HighlightLanguage } from './highlighted-code';
import { usePreviewFullscreen } from './use-preview-fullscreen';
import { ComponentPreviewMiniature } from './component-preview-miniature';

const StaticCatalogSidebar = memo(CatalogSidebar);

export type ComponentViewTab = 'preview' | 'code' | 'prompt';
export type ComponentPackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export type ComponentSourceFile = {
  id: string;
  label: string;
  code: string;
  language: HighlightLanguage;
};

export type ComponentProperty = {
  name: string;
  type: string;
  defaultValue: string;
  description: string;
};

type ComponentDetailLayoutProps = {
  componentName: string;
  componentSlug: string;
  description: string;
  prompt: string;
  defaultPrompt?: string;
  installCommands: Record<ComponentPackageManager, string>;
  sourceFiles: ComponentSourceFile[];
  preview: ReactNode;
  controls?: ReactNode;
  /** Optional buttons in the Controls heading, beside the information button. */
  controlsActions?: ReactNode;
  properties?: ComponentProperty[];
  /** Optional notes following the shared Usage source panel. */
  usage?: ReactNode;
  onReplay?: () => void;
  /** Disable when the preview component owns its playback triggers. */
  replayOnPreview?: boolean;
  previewActions?: ReactNode;
  /** Disable for previews that already own their floating renderer. */
  previewMiniature?: boolean;
};

type ExpandableCodeSurfaceProps = {
  children: ReactNode;
  className?: string;
  label: string;
};

function CopyIcon() {
  return (
    <svg className="components-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function ExpandableCodeSurface({ children, className = '', label }: ExpandableCodeSurfaceProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`component-expandable-code${expanded ? ' is-expanded' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
      {!expanded && <span className="component-expandable-code-fade" aria-hidden="true" />}
      <button
        className="component-expandable-code-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? `Collapse ${label}` : `Expand ${label}`}
      </button>
    </div>
  );
}

function useCopyFeedback() {
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const copyRequest = useRef(0);

  useEffect(
    () => () => {
      copyRequest.current++;
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = (value: string, target: string) => {
    const request = ++copyRequest.current;
    void navigator.clipboard.writeText(value).then(
      () => {
        if (request !== copyRequest.current) return;
        window.clearTimeout(copyTimer.current);
        setCopied(target);
        copyTimer.current = window.setTimeout(() => setCopied(null), 1400);
      },
      () => {},
    );
  };

  return { copy, copied };
}

function ComponentSourcePanel({
  sourceFiles,
  tabLabel = 'Source files',
  usageOnly = false,
}: {
  sourceFiles: ComponentSourceFile[];
  tabLabel?: string;
  usageOnly?: boolean;
}) {
  const [sourceFileId, setSourceFileId] = useState('usage');
  const { copy, copied } = useCopyFeedback();
  const activeSourceFile = usageOnly
    ? sourceFiles.find((file) => file.id === 'usage')
    : (sourceFiles.find((file) => file.id === sourceFileId) ?? sourceFiles[0]);

  if (!activeSourceFile) return null;

  return (
    <div className="component-code-view">
      <div className="component-code-toolbar">
        {usageOnly ? (
          <span className="component-source-label">Usage</span>
        ) : (
          <div className="component-source-tabs" role="tablist" aria-label={tabLabel}>
            {sourceFiles.map((file) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeSourceFile.id === file.id}
                className={activeSourceFile.id === file.id ? 'is-active' : ''}
                onClick={() => setSourceFileId(file.id)}
                key={file.id}
              >
                {file.id === 'usage' ? 'Usage' : file.label}
              </button>
            ))}
          </div>
        )}
        <button
          className="component-panel-copy"
          type="button"
          onClick={() => copy(activeSourceFile.code, activeSourceFile.id)}
        >
          <CopyIcon /> {copied === activeSourceFile.id ? 'Copied' : 'Copy'}
        </button>
      </div>
      <ExpandableCodeSurface key={activeSourceFile.id} label="code">
        <pre className="component-source-code">
          <HighlightedCode code={activeSourceFile.code} language={activeSourceFile.language} />
        </pre>
      </ExpandableCodeSurface>
    </div>
  );
}

export function ComponentDetailLayout({
  componentName,
  componentSlug,
  description,
  prompt,
  defaultPrompt = prompt,
  installCommands,
  sourceFiles,
  preview,
  controls,
  controlsActions,
  properties,
  usage,
  onReplay,
  replayOnPreview = true,
  previewActions,
  previewMiniature = true,
}: ComponentDetailLayoutProps) {
  const [viewTab, setViewTab] = useState<ComponentViewTab>('preview');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const previewFullscreen = usePreviewFullscreen();
  const [installMethod, setInstallMethod] = useState<'command' | 'manual'>('command');
  const [packageManager, setPackageManager] = useState<ComponentPackageManager>('pnpm');
  const { copy, copied } = useCopyFeedback();
  const onReplayRef = useRef(onReplay);

  onReplayRef.current = onReplay;

  useEffect(() => {
    if (viewTab !== 'preview' || !replayOnPreview || !onReplayRef.current) return;

    const frame = window.requestAnimationFrame(() => onReplayRef.current?.());
    return () => window.cancelAnimationFrame(frame);
  }, [viewTab, replayOnPreview]);

  const propertyTable = useMemo(
    () =>
      properties && properties.length > 0 ? (
        <section
          className="components-document-section component-properties-section"
          id="properties"
        >
          <div className="component-properties-heading">
            <h2>Properties</h2>
            <span>
              {properties.length} {properties.length === 1 ? 'property' : 'properties'}
            </span>
          </div>
          <div className="component-properties-table-wrap">
            <table className="component-properties-table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col">Type</th>
                  <th scope="col">Default</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => (
                  <tr key={property.name}>
                    <td>
                      <code>{property.name}</code>
                    </td>
                    <td>
                      <code>{property.type}</code>
                    </td>
                    <td>
                      <code>{property.defaultValue}</code>
                    </td>
                    <td>{property.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null,
    [properties],
  );

  const selectPreviewViewport = (viewport: PreviewViewport) => {
    setPreviewViewport(viewport);
    setViewTab('preview');
  };

  const togglePreviewFullscreen = () => {
    setViewTab('preview');
    previewFullscreen.toggle();
  };

  return (
    <main className="components-library-page component-detail-page">
      <StaticCatalogSidebar activeComponent={componentSlug} />

      <article className="components-document" id={componentSlug}>
        <header className="component-detail-header">
          <div>
            <h1>{componentName}</h1>
            <p className="components-document-intro">{description}</p>
          </div>
        </header>

        <div className="component-view-toolbar">
          <div className="component-view-tabs" role="tablist" aria-label="Component view">
            {(['preview', 'code', 'prompt'] as const).map((tab) => (
              <button
                type="button"
                role="tab"
                id={`component-tab-${tab}`}
                aria-controls={`component-panel-${tab}`}
                aria-selected={viewTab === tab}
                className={viewTab === tab ? 'is-active' : ''}
                onClick={() => setViewTab(tab)}
                key={tab}
              >
                {tab}
              </button>
            ))}
          </div>

          <ComponentPreviewToolbar
            componentName={componentName}
            componentSlug={componentSlug}
            prompt={prompt}
            defaultPrompt={defaultPrompt}
            viewport={previewViewport}
            onViewportChange={selectPreviewViewport}
          />
        </div>

        <section
          ref={previewFullscreen.preview}
          className={`component-showcase component-showcase--${viewTab}${previewFullscreen.fullscreen ? ' is-fullscreen' : ''}`}
          id={`component-panel-${viewTab}`}
          role={previewFullscreen.fullscreen ? 'dialog' : 'tabpanel'}
          aria-modal={previewFullscreen.fullscreen || undefined}
          aria-label={previewFullscreen.fullscreen ? `${componentName} preview` : undefined}
          aria-labelledby={previewFullscreen.fullscreen ? undefined : `component-tab-${viewTab}`}
        >
          {viewTab === 'preview' && (
            <ComponentPreviewMiniature enabled={previewMiniature} onReplay={onReplay}>
              <div className={`component-preview-canvas is-${previewViewport}`}>
                <div className="component-preview-stage">
                  <div className="component-preview-actions">
                    {previewActions}
                    {onReplay && (
                      <button className="component-replay-button" type="button" onClick={onReplay}>
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M15.5 7.2A6 6 0 1 0 16 11M15.5 7.2V3.7m0 3.5H12" />
                        </svg>
                        Replay
                      </button>
                    )}
                    <PreviewFullscreenButton
                      fullscreen={previewFullscreen.fullscreen}
                      onClick={togglePreviewFullscreen}
                      buttonRef={
                        previewFullscreen.fullscreen
                          ? previewFullscreen.minimize
                          : previewFullscreen.trigger
                      }
                    />
                  </div>
                  {preview}
                </div>
              </div>
            </ComponentPreviewMiniature>
          )}

          {viewTab === 'code' && (
            <div className="component-install-view" id="installation">
              <h2>Installation</h2>

              <div
                className="component-install-methods"
                role="tablist"
                aria-label="Installation method"
              >
                {(['command', 'manual'] as const).map((method) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={installMethod === method}
                    className={installMethod === method ? 'is-active' : ''}
                    onClick={() => setInstallMethod(method)}
                    key={method}
                  >
                    {method}
                  </button>
                ))}
              </div>

              {installMethod === 'command' && (
                <div className="component-command-box">
                  <div className="component-command-toolbar">
                    <span className="component-terminal-icon" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path d="m5.5 6.5 3 3-3 3M10.5 12.5h4" />
                      </svg>
                    </span>
                    <div
                      className="component-package-tabs"
                      role="tablist"
                      aria-label="Package manager"
                    >
                      {(['pnpm', 'npm', 'yarn', 'bun'] as const).map((manager) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={packageManager === manager}
                          className={packageManager === manager ? 'is-active' : ''}
                          onClick={() => setPackageManager(manager)}
                          key={manager}
                        >
                          {manager}
                        </button>
                      ))}
                    </div>
                    <button
                      className="component-command-copy"
                      type="button"
                      aria-label="Copy installation command"
                      onClick={() => copy(installCommands[packageManager], 'install')}
                    >
                      <CopyIcon />
                      <span className="sr-only">{copied === 'install' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <HighlightedCode code={installCommands[packageManager]} language="bash" />
                </div>
              )}

              {installMethod === 'manual' && (
                <ComponentSourcePanel sourceFiles={sourceFiles} tabLabel="Source files" />
              )}
            </div>
          )}

          {viewTab === 'prompt' && (
            <div className="component-prompt-view">
              <div className="component-prompt-heading">
                <div>
                  <h2>Install {componentName}</h2>
                  <p>
                    Use this prompt to make an AI download and install the existing component
                    through its official registry command.
                  </p>
                </div>
              </div>
              <ExpandableCodeSurface className="component-prompt-code-surface" label="prompt">
                <pre className="component-prompt-code">
                  <code>{prompt}</code>
                </pre>
              </ExpandableCodeSurface>
            </div>
          )}
        </section>

        {viewTab === 'preview' && controls && (
          <ControlsPanel componentName={componentName} actions={controlsActions}>
            {controls}
          </ControlsPanel>
        )}

        {viewTab === 'preview' && properties && properties.length > 0 && propertyTable}

        <section className="components-document-section component-usage-section" id="usage">
          <h2>Usage</h2>
          <ComponentSourcePanel sourceFiles={sourceFiles} usageOnly />
          {usage}
        </section>

        <footer className="components-document-section">
          <p className="components-document-intro">
            Free for personal and commercial projects. Redistributing components, kits or templates
            requires permission. <a href="/license.txt">Read the license</a>.
          </p>
        </footer>
      </article>

      <aside className="components-right-sidebar">
        <nav aria-label="On this page">
          <p className="components-sidebar-label">On This Page</p>
          <button type="button" onClick={() => setViewTab('preview')}>
            Preview
          </button>
          <button type="button" onClick={() => setViewTab('code')}>
            Installation
          </button>
          <button type="button" onClick={() => setViewTab('prompt')}>
            Prompt
          </button>
          {viewTab === 'preview' && controls && <a href="#controls">Controls</a>}
          {viewTab === 'preview' && properties && properties.length > 0 && (
            <a href="#properties">Properties</a>
          )}
          <a href="#usage">Usage</a>
        </nav>
      </aside>
    </main>
  );
}
