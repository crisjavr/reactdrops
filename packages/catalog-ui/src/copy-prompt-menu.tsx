import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import './copy-prompt-menu.css';

// Create's published motion: 60ms press, then one size spring (420/30/.5).
// Solve it once so opening the menu never requires frame-by-frame React renders.
const spread = Array.from({ length: 41 }, (_, i) => {
  const t = (i / 40) * 0.6,
    root = Math.sqrt(30 ** 2 - 4 * 0.5 * 420);
  const a = -30 + root,
    b = -30 - root;
  return i === 40 ? 1 : 1 - (-b * Math.exp(a * t) + a * Math.exp(b * t)) / (a - b);
});
type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  fromX: number;
  fromY: number;
  fromWidth: number;
  fromHeight: number;
  rowHeight: number;
  radius: number;
  restX: number;
  restY: number;
  restWidth: number;
  restHeight: number;
  theme: CSSProperties;
};

function CopyCheck({ startedAt }: { startedAt: number }) {
  // Both the closing popup and the button draw the same stroke timeline.
  // A later-mounted readout resumes that timeline instead of drawing again.
  const [elapsed] = useState(() => (startedAt ? Math.max(0, performance.now() - startedAt) : 0));
  return (
    <path
      className="prompt-copy-check"
      pathLength={1}
      d="m5 12 4 4L19 6"
      style={{ animationDelay: `-${elapsed}ms` }}
    />
  );
}

export function CopyPromptMenu({
  defaultPrompt,
  customPrompt,
}: {
  defaultPrompt: string;
  customPrompt: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const timers = useRef<{ press?: number; feedback?: number }>({});
  const alive = useRef(true),
    copying = useRef(false),
    focusOnOpen = useRef(0);
  const id = useId();
  const [pressed, setPressed] = useState(false),
    [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [copiedAt, setCopiedAt] = useState(0);
  const [copied, setCopied] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);
  const close = (restoreFocus = false) => {
    clearTimeout(timers.current.press);
    setPressed(false);
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const expand = (index = 0) => {
    if (pressed || open) return;
    clearTimeout(timers.current.press);
    setError('');
    setPressed(true);
    focusOnOpen.current = index;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The press overlaps the expansion instead of inserting a still frame.
    timers.current.press = window.setTimeout(
      () => {
        const button = trigger.current;
        if (!button) return;
        const r = button.getBoundingClientRect();
        const css = getComputedStyle(button);
        const pressScale = parseFloat(css.scale) || 1;
        const restWidth = r.width / pressScale,
          restHeight = r.height / pressScale;
        const theme: CSSProperties = {
          fontFamily: css.fontFamily,
          fontSize: getComputedStyle(button.querySelector('.components-copy-label')!).fontSize,
        };
        for (const name of [
          '--components-selection-background',
          '--theme-ink',
          '--theme-ink-muted',
          '--radius-md',
        ]) {
          (theme as Record<string, string>)[name] = css.getPropertyValue(name);
        }
        // Add room for one brief description while keeping the menu compact.
        const rowHeight = Math.max(44, button.offsetHeight + 16);
        const width = Math.min(Math.max(160, button.offsetWidth + 40), innerWidth - 24),
          height = rowHeight * 2;
        const x = Math.max(12, Math.min(r.x + (r.width - width) / 2, innerWidth - width - 12));
        const y = Math.max(12, Math.min(r.y + (r.height - height) / 2, innerHeight - height - 12));
        setPlacement({
          x,
          y,
          width,
          height,
          fromX: r.x - x,
          fromY: r.y - y,
          fromWidth: r.width,
          fromHeight: r.height,
          rowHeight,
          radius: parseFloat(css.borderRadius) || 8,
          restX: r.x - x + (r.width - restWidth) / 2,
          restY: r.y - y + (r.height - restHeight) / 2,
          restWidth,
          restHeight,
          theme,
        });
        setPressed(false);
        setOpen(true);
        setActive(index);
      },
      reduced ? 0 : 60,
    );
  };
  useLayoutEffect(() => {
    if (!placement || !surface.current) return;
    const element = surface.current,
      p = placement,
      current = getComputedStyle(element);
    const start = open
      ? { x: p.fromX, y: p.fromY, width: p.fromWidth, height: p.fromHeight }
      : {
          x: parseFloat(current.left),
          y: parseFloat(current.top),
          width: parseFloat(current.width),
          height: parseFloat(current.height),
        };
    const end = open
      ? { x: 0, y: 0, width: p.width, height: p.height }
      : { x: p.restX, y: p.restY, width: p.restWidth, height: p.restHeight };
    const animation = element.animate(
      spread.map((progress) => ({
        left: `${start.x + (end.x - start.x) * progress}px`,
        top: `${start.y + (end.y - start.y) * progress}px`,
        width: `${start.width + (end.width - start.width) * progress}px`,
        height: `${start.height + (end.height - start.height) * progress}px`,
        borderRadius: `${p.radius}px`,
      })),
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : open ? 600 : 160,
        fill: 'both',
        easing: 'linear',
      },
    );
    let cancelled = false;
    animation.finished.then(
      () => {
        if (!cancelled && !open) setPlacement(null);
      },
      () => {},
    );
    if (open)
      popup.current
        ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        [focusOnOpen.current]?.focus({ preventScroll: true });
    return () => {
      cancelled = true;
      if (element.isConnected) {
        const style = getComputedStyle(element);
        const final = {
          left: style.left,
          top: style.top,
          width: style.width,
          height: style.height,
        };
        Object.assign(element.style, final);
      }
      animation.cancel();
    };
  }, [open, placement]);
  useEffect(() => {
    if (!open && !pressed) return;
    const away = (event: Event) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        close();
    };
    // A pending scroll event from focusing the trigger must not cancel its press.
    // Dismiss only when the anchor actually moves after the popup was positioned.
    const reposition = () => {
      if (!open || !placement || !trigger.current) return;
      const r = trigger.current.getBoundingClientRect();
      if (
        Math.abs(r.x + r.width / 2 - placement.x - placement.fromX - placement.fromWidth / 2) >
          0.5 ||
        Math.abs(r.y + r.height / 2 - placement.y - placement.fromY - placement.fromHeight / 2) >
          0.5
      )
        close();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('focusin', away);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, pressed, placement]);
  const copy = async (mode: 'default' | 'custom') => {
    if (copying.current) return;
    copying.current = true;
    setBusy(true);
    setError('');
    try {
      await navigator.clipboard.writeText(mode === 'default' ? defaultPrompt : customPrompt);
      if (!alive.current) return;
      clearTimeout(timers.current.feedback);
      setCopiedAt(performance.now());
      setCopied(mode === 'default' ? 'Default prompt copied' : 'Custom prompt copied');
      close(true);
      timers.current.feedback = window.setTimeout(() => setCopied(''), 2200);
    } catch {
      if (alive.current) setError('Could not copy. Please try again.');
    } finally {
      copying.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    if (event.key === 'Tab') close(true);
    const items = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % items.length
            : event.key === 'ArrowUp'
              ? (index - 1 + items.length) % items.length
              : null;
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  };
  const readout = (
    <span className="prompt-copy-readout" data-copied={Boolean(copied) || undefined}>
      <span className="prompt-copy-state prompt-copy-normal" aria-hidden={Boolean(copied)}>
        <svg className="components-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
        <span className="components-copy-label">Copy prompt</span>
      </span>
      <span className="prompt-copy-state prompt-copy-success" aria-hidden={!copied}>
        <svg className="components-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
          <CopyCheck key={copiedAt} startedAt={copiedAt} />
        </svg>
        <span className="components-copy-label">Copied</span>
      </span>
    </span>
  );
  return (
    <div
      className="prompt-copy"
      data-pressed={pressed || undefined}
      data-present={Boolean(placement) || undefined}
    >
      <button
        ref={trigger}
        type="button"
        className={`components-copy-button component-copy-prompt-button${copied ? ' is-copied' : ''}`}
        aria-label="Copy prompt"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(true) : expand())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            expand(event.key === 'ArrowUp' ? 1 : 0);
          }
          if (event.key === 'Escape') close();
        }}
      >
        {readout}
      </button>
      <span className="prompt-copy-status" role="status">
        {copied}
      </span>
      {error && (
        <span className="prompt-copy-error" role="alert">
          {error}
        </span>
      )}
      {placement &&
        createPortal(
          <div
            ref={popup}
            className="prompt-copy-popup"
            data-open={open}
            data-copied={Boolean(copied) || undefined}
            style={
              {
                ...placement.theme,
                left: placement.x,
                top: placement.y,
                width: placement.width,
                height: placement.height,
                '--prompt-copy-row-height': `${placement.rowHeight}px`,
              } as CSSProperties
            }
            aria-hidden={!open}
            inert={!open}
            onKeyDown={keys}
          >
            <div ref={surface} className="prompt-copy-surface" aria-hidden="true" />
            {!open && (
              <div
                className="prompt-copy-return"
                aria-hidden="true"
                style={{
                  left: placement.restX,
                  top: placement.restY,
                  width: placement.restWidth,
                  height: placement.restHeight,
                }}
              >
                {readout}
              </div>
            )}
            <div
              className="prompt-copy-options"
              role="menu"
              id={id}
              aria-label="Copy prompt options"
              aria-busy={busy}
              onPointerLeave={() => setActive(null)}
            >
              <span
                className="prompt-copy-highlight"
                aria-hidden="true"
                style={{
                  opacity: active === null ? 0 : 1,
                  transform: `translateY(${(active ?? 0) * placement.rowHeight}px)`,
                }}
              />
              {(
                [
                  { mode: 'default', label: 'Default prompt', detail: 'Original settings' },
                  { mode: 'custom', label: 'Custom prompt', detail: 'Includes your edits' },
                ] as const
              ).map((option, index) => (
                <button
                  key={option.mode}
                  role="menuitem"
                  type="button"
                  aria-label={option.label}
                  aria-description={option.detail}
                  disabled={busy}
                  tabIndex={-1}
                  className="prompt-copy-option"
                  style={{ animationDelay: `${30 + index * 22}ms` }}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => void copy(option.mode)}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
