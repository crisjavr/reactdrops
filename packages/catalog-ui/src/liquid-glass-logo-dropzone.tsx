import { useId, useRef, useState, type DragEvent } from 'react';

type DropZoneProps = {
  title: string;
  hint: string;
  /** Value for the file input's accept attribute. */
  accept: string;
  /** Returns an error message when a file cannot be used. */
  validate?: (file: File) => string | null;
  /** Object URL of the current file, if one is set. */
  preview: string;
  /** How the preview thumbnail fills its frame. */
  fit: 'cover' | 'contain';
  /** Color behind the thumbnail, so a light or dark logo stays visible. */
  surface?: string;
  fileName: string;
  onFile: (file: File) => void;
  onClear: () => void;
};

/** Drag-and-drop file box. Click or press Enter to browse; drop a file to use it. */
export function LiquidGlassLogoDropZone({
  title,
  hint,
  accept,
  validate,
  preview,
  fit,
  surface,
  fileName,
  onFile,
  onClear,
}: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = validate?.(file) ?? null;
    setError(problem ?? '');
    if (!problem) onFile(file);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files[0]);
  };
  return (
    <div className="liquid-glass-logo-drop-wrap">
      <div
        className={`liquid-glass-logo-drop${dragging ? ' is-dragging' : ''}${preview ? ' has-file' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${title}: drop a file or press Enter to browse`}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={drop}
      >
        <div
          className={`liquid-glass-logo-drop-thumb is-${fit}`}
          aria-hidden="true"
          style={preview && surface ? { background: surface } : undefined}
        >
          {preview ? (
            <img src={preview} alt="" />
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
            </svg>
          )}
        </div>
        <div className="liquid-glass-logo-drop-text">
          <strong>{title}</strong>
          <span id={hintId}>{preview ? fileName : hint}</span>
        </div>
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {preview && (
        <button
          className="liquid-glass-logo-drop-clear"
          type="button"
          aria-label={`Remove ${title.toLowerCase()}`}
          onClick={() => {
            setError('');
            onClear();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
      {error && (
        <p className="liquid-glass-logo-drop-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
