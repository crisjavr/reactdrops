import { useRef, useState } from 'react';
import { ControlField } from './controls-panel';
import { requestComponentPreview } from './component-preview-miniature';
import './image-upload-control.css';

type ImageUploadControlProps = {
  label: string;
  description: string;
  /** Shown in place of a file name until a file is chosen. */
  hint?: string;
  /** Value for the file input's accept attribute. */
  accept?: string;
  /** Returns an error message when a file cannot be used. */
  validate?: (file: File) => string | null;
  /** URL of the current image, shown as the thumbnail. */
  preview?: string;
  /** Name of the uploaded file. A remove button appears while it is set. */
  fileName?: string;
  /** How the thumbnail fills its square. */
  fit?: 'cover' | 'contain';
  /** Color behind the thumbnail, so a light or dark logo stays visible. */
  surface?: string;
  /** Optional URL entry beside the upload, applied with Enter. */
  url?: {
    value: string;
    placeholder?: string;
    /** Shows an inline Apply action, for a URL that differs from the image shown. */
    canApply?: boolean;
    onChange: (value: string) => void;
    onApply: () => void;
  };
  onFile: (file: File) => void;
  onClear?: () => void;
  /** Extra field classes, such as is-wide to span the whole row. */
  className?: string;
};

const imageOnly = (file: File) => (file.type.startsWith('image/') ? null : 'Use an image file.');

/**
 * Image upload row shared by every control panel that takes an image: a small
 * thumbnail square, the field label and the file name (or a URL entry). Click
 * anywhere or press the square to browse; drop a file on the row to use it.
 */
export function ImageUploadControl({
  label,
  description,
  hint = 'Drop an image or click',
  accept = 'image/*',
  validate = imageOnly,
  preview = '',
  fileName = '',
  fit = 'cover',
  surface,
  url,
  onFile,
  onClear,
  className = '',
}: ImageUploadControlProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const name = label.toLowerCase();
  const hasFile = Boolean(fileName);
  const browse = () => input.current?.click();
  const take = (file?: File) => {
    if (!file) return;
    const problem = validate(file);
    setError(problem ?? '');
    if (problem) return;
    onFile(file);
    // A new image is worth seeing: bring the preview back if it scrolled away.
    requestComponentPreview(input.current);
  };
  const apply = () => {
    if (!url) return;
    setError('');
    url.onApply();
    requestComponentPreview(input.current);
  };
  return (
    <>
      <ControlField
        className={`image-upload-control${dragging ? ' is-dragging' : ''}${hasFile ? ' has-file' : ''} ${className}`.trim()}
        label={label}
        description={description}
        onClick={(event) => {
          if (!(event.target as Element).closest('input, button')) browse();
        }}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files[0]);
        }}
      >
        <button
          className={`image-upload-control-thumb is-${fit}`}
          type="button"
          aria-label={hasFile ? `Replace ${name}` : `Upload ${name}`}
          title={hasFile ? `Replace ${name}` : `Upload ${name}`}
          style={preview && surface ? { background: surface } : undefined}
          onClick={browse}
        >
          {preview ? (
            <img src={preview} alt="" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
            </svg>
          )}
        </button>
        {url ? (
          <input
            className="image-upload-control-value"
            type="text"
            inputMode="url"
            aria-label={`${label} URL`}
            autoComplete="off"
            spellCheck={false}
            value={url.value}
            placeholder={url.placeholder ?? 'https://…'}
            title={url.value || url.placeholder}
            onChange={(event) => url.onChange(event.target.value.replace(/[\r\n]/g, ' '))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
            }}
          />
        ) : (
          <span className="image-upload-control-value" title={fileName || hint}>
            {fileName || hint}
          </span>
        )}
        <input
          ref={input}
          type="file"
          accept={accept}
          aria-label={`Choose ${name} file`}
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {url?.canApply && (
          <button
            className="reveal-action-button image-upload-control-apply"
            type="button"
            onClick={apply}
          >
            Apply
          </button>
        )}
        {hasFile && onClear && (
          <button
            className="image-upload-control-clear"
            type="button"
            aria-label={`Remove ${name}`}
            onClick={() => {
              setError('');
              onClear();
              requestComponentPreview(input.current);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </ControlField>
      {error && (
        <p className="image-upload-control-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
