import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Help = { anchor: HTMLElement; description: string; label: string };
const hoverDelay = 650;

/** One delayed tooltip shared by the controls, including their keyboard focus. */
export function ControlHelp({ children }: { children: ReactNode }) {
  const id = useId();
  const scope = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const candidate = useRef<HTMLElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [help, setHelp] = useState<Help | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    side: 'top' | 'bottom';
  } | null>(null);

  const dismiss = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
    window.clearTimeout(closeTimer.current);
    candidate.current = null;
    setHelp(null);
    setPosition(null);
  }, []);
  const findAnchor = (target: EventTarget | null) => {
    const anchor =
      target instanceof Element ? target.closest<HTMLElement>('[data-control-help]') : null;
    return anchor && scope.current?.contains(anchor) ? anchor : null;
  };
  const show = (anchor: HTMLElement) => {
    if (!anchor.isConnected || anchor.querySelector('[aria-expanded="true"]')) return;
    setPosition(null);
    setHelp({
      anchor,
      description: anchor.dataset.controlHelp ?? '',
      label: anchor.dataset.controlLabel ?? '',
    });
  };
  const schedule = (anchor: HTMLElement | null) => {
    window.clearTimeout(closeTimer.current);
    if (
      !anchor ||
      (anchor === candidate.current && (openTimer.current !== undefined || help?.anchor === anchor))
    )
      return;
    dismiss();
    candidate.current = anchor;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = undefined;
      show(anchor);
    }, hoverDelay);
  };
  const leave = () => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
    // Allow the pointer to cross the small gap into the tooltip itself.
    closeTimer.current = window.setTimeout(dismiss, 100);
  };
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!help || !bubble.current) return;
    const positionBubble = () => {
      const rect = help.anchor.getBoundingClientRect();
      const tip = bubble.current?.getBoundingClientRect();
      if (!tip) return;
      if (!help.anchor.isConnected || rect.bottom < 0 || rect.top > window.innerHeight) {
        dismiss();
        return;
      }
      const gap = 8;
      const margin = 12;
      const above = rect.top - margin;
      const below = window.innerHeight - rect.bottom - margin;
      const side = above >= tip.height + gap || above > below ? 'top' : 'bottom';
      setPosition({
        side,
        top: Math.max(
          margin,
          Math.min(
            window.innerHeight - tip.height - margin,
            side === 'top' ? rect.top - tip.height - gap : rect.bottom + gap,
          ),
        ),
        left: Math.max(
          margin,
          Math.min(
            window.innerWidth - tip.width - margin,
            rect.left + (rect.width - tip.width) / 2,
          ),
        ),
      });
    };
    positionBubble();
    const observer = new ResizeObserver(positionBubble);
    observer.observe(bubble.current);
    observer.observe(help.anchor);
    window.addEventListener('resize', positionBubble);
    window.addEventListener('scroll', positionBubble, true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    const inputs = help.anchor.matches('button')
      ? [help.anchor]
      : [...help.anchor.querySelectorAll<HTMLElement>('input, button')];
    const previous = inputs.map((input) => input.getAttribute('aria-describedby'));
    inputs.forEach((input, index) =>
      input.setAttribute('aria-describedby', [previous[index], id].filter(Boolean).join(' ')),
    );
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', positionBubble);
      window.removeEventListener('scroll', positionBubble, true);
      document.removeEventListener('keydown', onKey);
      inputs.forEach((input, index) => {
        if (previous[index]) input.setAttribute('aria-describedby', previous[index]!);
        else input.removeAttribute('aria-describedby');
      });
    };
  }, [help, id, dismiss]);

  return (
    <div
      ref={scope}
      className="reveal-help-scope"
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch' && !event.buttons) schedule(findAnchor(event.target));
      }}
      onPointerOver={(event) => {
        if (event.pointerType !== 'touch' && !event.buttons) schedule(findAnchor(event.target));
      }}
      onPointerOut={(event) => {
        if (findAnchor(event.target) !== findAnchor(event.relatedTarget)) leave();
      }}
      onFocusCapture={(event) => schedule(findAnchor(event.target))}
      onBlurCapture={(event) => {
        if (findAnchor(event.target) !== findAnchor(event.relatedTarget)) leave();
      }}
      onPointerDownCapture={dismiss}
      onKeyDownCapture={dismiss}
      onClick={(event) => {
        const anchor = findAnchor(event.target);
        if (anchor?.hasAttribute('data-control-help-trigger')) {
          dismiss();
          candidate.current = anchor;
          show(anchor);
        }
      }}
    >
      {children}
      {help &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="reveal-control-tooltip"
            data-side={position?.side}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerOver={(event) => {
              event.stopPropagation();
              window.clearTimeout(closeTimer.current);
            }}
            onPointerOut={(event) => {
              event.stopPropagation();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave();
            }}
          >
            <strong>{help.label}</strong>
            <p>{help.description}</p>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ControlHelpInfo() {
  return (
    <button
      type="button"
      className="reveal-help-info"
      aria-label="About control help"
      data-control-help-trigger
      data-control-label="Control help"
      data-control-help="Hover over any control for a moment to learn what it does. You can also focus a control with your keyboard."
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7v4M8 4.5v.5" />
      </svg>
    </button>
  );
}
