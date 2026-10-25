import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type ButtonHTMLAttributes,
} from 'react';
import { DropdownSurface } from './dropdown-surface';
import { requestComponentPreview } from './component-preview-miniature';
import './customizer-controls.css';
import { useSwitchMotion } from './use-switch-motion';
import { useNumberMotion } from './use-number-motion';
import { useNumberElasticity } from './use-number-elasticity';

type Option = { value: string; label: string };

/** Shared export action for image/video downloads throughout the catalog and lab. */
export function ExportButton({
  busy = false,
  ready = false,
  progress,
  progressLabel = 'Export progress',
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  ready?: boolean;
  progress?: number;
  progressLabel?: string;
}) {
  const fraction = Math.max(
    0,
    Math.min(1, typeof progress === 'number' && Number.isFinite(progress) ? progress : 0),
  );
  return (
    <button
      {...props}
      type={type}
      className={`reveal-action-button reveal-export-button ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {progress !== undefined && (busy || ready) && (
        <span
          className="reveal-export-progress"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          style={{ transform: `scaleX(${fraction})` }}
        />
      )}
      {busy ? (
        <span className="reveal-export-spinner" aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d={ready ? 'm4 10 4 4 8-8' : 'M10 3v9m-3-3 3 3 3-3M4 13v3h12v-3'} />
        </svg>
      )}
      <span className="reveal-export-label" role="status" aria-live="polite">
        {children}
      </span>
      {busy && progress !== undefined && (
        <span className="reveal-export-percent" aria-hidden="true">
          {Math.round(fraction * 100)}%
        </span>
      )}
    </button>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

export function SingleLineTextControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const displayValue = value.replace(/[\r\n]/g, ' ');
  return (
    <input
      aria-label={label}
      type="text"
      value={displayValue}
      onChange={(event) => {
        const next = event.target.value;
        // Preserve existing line breaks outside the edited portion of the text.
        let start = 0;
        while (
          start < displayValue.length &&
          start < next.length &&
          displayValue[start] === next[start]
        )
          start++;
        let end = 0;
        while (
          end < displayValue.length - start &&
          end < next.length - start &&
          displayValue[displayValue.length - end - 1] === next[next.length - end - 1]
        )
          end++;
        onChange(
          value.slice(0, start) +
            next.slice(start, next.length - end) +
            value.slice(value.length - end),
        );
      }}
    />
  );
}

export function SelectControl({
  label,
  value,
  options,
  onChange,
  editable = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  editable?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [navigation, setNavigation] = useState<'keyboard' | 'pointer'>('keyboard');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
    rowHeight: 32,
    ready: false,
  });
  const typeahead = useRef({ value: '', time: 0 });
  const visible =
    editable && query
      ? options.filter((option) =>
          `${option.label} ${option.value}`.toLowerCase().includes(query.toLowerCase()),
        )
      : options;
  const selected = options.find((option) => option.value === value);
  const beginOpen = () => {
    // Coordinates from the previous opening may be on the opposite side after
    // scrolling. Every entry path waits for a fresh placement before animating.
    if (!open) setPosition((previous) => ({ ...previous, ready: false }));
    setOpen(true);
  };
  const show = () => {
    setNavigation('keyboard');
    setQuery('');
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    beginOpen();
  };
  const choose = (option: Option) => {
    if (option.value !== value) requestComponentPreview(anchor.current);
    onChange(option.value);
    setOpen(false);
    (editable ? input.current : button.current)?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const field = anchor.current?.closest('.reveal-field') ?? anchor.current;
      const rect = field?.getBoundingClientRect();
      if (!rect) return;
      const rowHeight = rect.height;
      const desired = Math.min(280, Math.max(1, visible.length) * rowHeight + 2);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < desired && above > below;
      const maxHeight = Math.max(40, Math.min(desired, up ? above : below));
      const width = Math.min(rect.width, window.innerWidth - 24);
      setPosition({
        ready: true,
        width,
        maxHeight,
        rowHeight,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: up ? rect.top - maxHeight - 6 : rect.bottom + 6,
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    const observer = new ResizeObserver(positionMenu);
    const field = anchor.current?.closest('.reveal-field') ?? anchor.current;
    if (field) observer.observe(field);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      observer.disconnect();
    };
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focusOutside);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    setNavigation('keyboard');
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else
        setActive(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) %
            Math.max(1, visible.length),
        );
    } else if ((event.key === 'Enter' || (!editable && event.key === ' ')) && open) {
      event.preventDefault();
      if (visible[active]) choose(visible[active]);
      else setOpen(false);
    } else if (!editable && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      beginOpen();
      setActive(event.key === 'Home' ? 0 : visible.length - 1);
    } else if (!editable && event.key.length === 1 && event.key !== ' ') {
      const now = performance.now();
      typeahead.current = {
        value:
          (now - typeahead.current.time < 700 ? typeahead.current.value : '') +
          event.key.toLowerCase(),
        time: now,
      };
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(typeahead.current.value),
      );
      if (index >= 0) {
        setActive(index);
        beginOpen();
      }
    }
  };
  const aria = {
    'aria-label': label,
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    'aria-activedescendant': open && visible[active] ? `${id}-${active}` : undefined,
  };
  return (
    <div ref={anchor} className={`reveal-select${open ? ' is-open' : ''}`}>
      {editable ? (
        <>
          <input
            ref={input}
            role="combobox"
            aria-autocomplete="list"
            {...aria}
            value={value}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              onChange(event.target.value);
              setQuery(event.target.value);
              setNavigation('keyboard');
              setActive(0);
              beginOpen();
            }}
          />
          <button
            type="button"
            className="reveal-select-arrow"
            aria-label={`Show ${label.toLowerCase()} options`}
            aria-expanded={open}
            onClick={() => {
              input.current?.focus();
              if (open) setOpen(false);
              else show();
            }}
          >
            <Chevron />
          </button>
        </>
      ) : (
        <button
          ref={button}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          {...aria}
          onKeyDown={onKeyDown}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span>{selected?.label ?? value}</span>
          <Chevron />
        </button>
      )}
      <DropdownSurface
        open={open}
        anchor={anchor}
        menu={menu}
        id={id}
        label={`${label} options`}
        position={position}
        active={active}
        revealActive={navigation === 'keyboard'}
      >
        {visible.length ? (
          visible.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-index={index}
              className={active === index ? 'is-highlighted' : ''}
              onPointerMove={() => {
                setNavigation('pointer');
                setActive(index);
              }}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m3.5 8 3 3 6-6" />
                </svg>
              )}
            </div>
          ))
        ) : (
          <p className="reveal-select-empty">Keep typing to use a custom value.</p>
        )}
      </DropdownSurface>
    </div>
  );
}

export function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  range,
  normalizeValue,
  disabled = false,
  onChange,
  onInteractionChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  range?: [number, number];
  normalizeValue?: (value: number) => number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onInteractionChange?: (active: boolean, input: HTMLInputElement) => void;
}) {
  const activeInput = useRef<HTMLInputElement | null>(null);
  const interactionCallback = useRef(onInteractionChange);
  interactionCallback.current = onInteractionChange;
  const stopInteraction = () => {
    const input = activeInput.current;
    activeInput.current = null;
    if (input) interactionCallback.current?.(false, input);
  };
  const startInteraction = (input: HTMLInputElement) => {
    if (disabled || activeInput.current || !interactionCallback.current) return;
    activeInput.current = input;
    interactionCallback.current(true, input);
  };
  const hasInteractionCallback = !!onInteractionChange;
  useEffect(() => {
    if (!hasInteractionCallback || disabled) {
      stopInteraction();
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') stopInteraction();
    };
    window.addEventListener('blur', stopInteraction);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('blur', stopInteraction);
      window.removeEventListener('keydown', onKey);
      stopInteraction();
    };
  }, [disabled, hasInteractionCallback]);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (next: number) => {
    if (disabled) return;
    const normalized = normalizeValue?.(next) ?? next;
    const bounded = Math.max(
      min ?? -Infinity,
      Math.min(max ?? Infinity, Number(normalized.toFixed(8))),
    );
    if (bounded !== value) requestComponentPreview(numberRoot.current);
    onChange(bounded);
    setDraft(String(bounded));
  };
  const adjust = (direction: number) => commit(value + direction * step);
  const sliderMin = min ?? range?.[0] ?? 0;
  const sliderMax = max ?? range?.[1] ?? 100;
  const sliderValue = Math.max(sliderMin, Math.min(sliderMax, value));
  const progress =
    sliderMax > sliderMin ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100 : 0;
  const numberRoot = useNumberMotion(progress, disabled);
  const elasticity = useNumberElasticity(numberRoot, disabled);
  const endPointerInteraction = () => {
    elasticity.release();
    stopInteraction();
  };
  return (
    <div ref={numberRoot} className="reveal-number">
      <input
        disabled={disabled}
        className="reveal-number-slider"
        type="range"
        aria-label={`Adjust ${label}`}
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={sliderValue}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || !event.isPrimary) return;
          elasticity.begin(event);
          startInteraction(event.currentTarget);
        }}
        onPointerMove={elasticity.move}
        onPointerUp={endPointerInteraction}
        onPointerCancel={endPointerInteraction}
        onLostPointerCapture={endPointerInteraction}
        onBlur={endPointerInteraction}
        onKeyDown={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          )
            startInteraction(event.currentTarget);
        }}
        onKeyUp={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          )
            stopInteraction();
        }}
        onChange={(event) => commit(Number(event.target.value))}
      />
      <input
        disabled={disabled}
        aria-label={label}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        inputMode="decimal"
        type="text"
        value={draft}
        // Only the digits are editable: size the box to the value so the text
        // cursor does not cover the slider beside it.
        style={{ '--reveal-number-chars': Math.max(2, draft.length) } as CSSProperties}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (
            event.target.value.trim() &&
            Number.isFinite(next) &&
            next >= (min ?? -Infinity) &&
            next <= (max ?? Infinity)
          ) {
            const normalized = normalizeValue?.(next) ?? next;
            if (normalizeValue && normalized !== next) setDraft(String(normalized));
            onChange(normalized);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            adjust(event.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        onBlur={() => {
          const next = Number(draft);
          if (draft.trim() && Number.isFinite(next)) commit(next);
          else setDraft(String(value));
        }}
      />
    </div>
  );
}

export function SwitchControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { thumb, setHovered } = useSwitchMotion(checked);
  return (
    <button
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      type="button"
      className="reveal-switch-field"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={(event) => {
        requestComponentPreview(event.currentTarget);
        onChange(!checked);
      }}
    >
      <span className="reveal-switch-track" aria-hidden="true">
        <span ref={thumb} />
      </span>
    </button>
  );
}
