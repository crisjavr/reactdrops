import type { HTMLAttributes, ReactNode } from 'react';
import { ControlHelp, ControlHelpInfo } from './control-help';
import './customizer-controls.css';

/** Shared page section: owns delayed help and the information button. */
export function ControlsPanel({
  componentName,
  children,
}: {
  componentName: string;
  children: ReactNode;
}) {
  return (
    <section className="components-document-section component-controls-section" id="controls">
      <ControlHelp>
        <div className="component-controls-heading">
          <h2>Controls</h2>
          <ControlHelpInfo />
        </div>
        <div className="component-controls" aria-label={`${componentName} controls`}>
          {children}
        </div>
      </ControlHelp>
    </section>
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
