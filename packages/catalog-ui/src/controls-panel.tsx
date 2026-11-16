import type { HTMLAttributes, ReactNode } from 'react';
import { ControlHelp, ControlHelpInfo } from './control-help';
import './customizer-controls.css';

/** Shared page section: owns delayed help and the information button. */
export function ControlsPanel({
  componentName,
  actions,
  heading,
  children,
}: {
  componentName: string;
  /** Optional buttons shown beside the information button. */
  actions?: ReactNode;
  heading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="components-document-section component-controls-section" id="controls">
      <ControlHelp>
        <div className="component-controls-heading">
          {heading ?? <h2>Controls</h2>}
          {actions ? (
            <div className="component-controls-actions">
              {actions}
              <ControlHelpInfo />
            </div>
          ) : (
            <ControlHelpInfo />
          )}
        </div>
        <div className="component-controls" aria-label={`${componentName} controls`}>
          {children}
        </div>
      </ControlHelp>
    </section>
  );
}

export function ControlsResetButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="component-controls-reset"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v4.5h4.5" />
      </svg>
      Reset
    </button>
  );
}

/** Use for every customizer field. The surrounding layout provides its tooltip. */
export function ControlField({
  label,
  description,
  children,
  disabled = false,
  className = '',
  ...props
}: {
  label: string;
  description: string;
  children: ReactNode;
  disabled?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-disabled={disabled || undefined}
      className={`reveal-field ${className}`.trim()}
      data-control-label={label}
      data-control-help={description}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}
