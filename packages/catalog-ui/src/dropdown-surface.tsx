import {
  Children,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import './dropdown-surface.css';
import { usePopupMotion } from './use-popup-motion';

type Position = {
  ready?: boolean;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  rowHeight: number;
};

/** Shared dropdown presence with a spring entrance and continuous hover. */
export function DropdownSurface({
  open,
  anchor,
  menu,
  position,
  id,
  label,
  active,
  children,
  revealActive = true,
  unfold = 'vertical',
}: {
  open: boolean;
  anchor: RefObject<HTMLDivElement | null>;
  menu: RefObject<HTMLDivElement | null>;
  position: Position;
  id: string;
  label: string;
  active: number;
  children: ReactNode;
  unfold?: 'vertical' | 'corner' | 'center';
  revealActive?: boolean;
}) {
  const shell = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null),
    ink = useRef<HTMLSpanElement>(null);
  const wasHighlighted = useRef(false);
  const ready = (position.ready ?? true) && position.width > 0;
  const itemCount = Children.count(children);
  const present = usePopupMotion({ open, ready, anchor, shell, panel, unfold });

  useLayoutEffect(() => {
    if (!open || !present || !ready || !highlight.current || !menu.current) return;
    const marker = highlight.current;
    // Only keyboard navigation/opening reveals the active option. Hover merely
    // moves the highlight; scrolling a partial row here causes hover feedback loops.
    // Keep scrolling local to the menu so its page/ancestors never jump.
    const row = menu.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (revealActive && row) {
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < menu.current.scrollTop) menu.current.scrollTop = top;
      else if (bottom > menu.current.scrollTop + menu.current.clientHeight)
        menu.current.scrollTop = bottom - menu.current.clientHeight;
    }
    const update = () => {
      const row = menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
      if (!row) {
        marker.style.opacity = '0';
        wasHighlighted.current = false;
        return;
      }
      marker.style.transitionDuration = wasHighlighted.current ? '' : '0ms';
      marker.style.height = `${row.offsetHeight}px`;
      marker.style.transform = `translateY(${row.offsetTop}px)`;
      marker.style.opacity = '1';
      wasHighlighted.current = true;
    };
    update();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stretch =
      !preference.matches && ink.current
        ? ink.current.animate(
            [
              { transform: 'scaleY(1)' },
              { transform: 'scaleY(1.16)', offset: 0.3 },
              { transform: 'scaleY(1)' },
            ],
            { duration: 300, easing: 'cubic-bezier(.3, .9, .4, 1)' },
          )
        : null;
    const observer = new ResizeObserver(update);
    observer.observe(menu.current);
    const reduce = () => {
      if (preference.matches) stretch?.cancel();
    };
    preference.addEventListener('change', reduce);
    return () => {
      stretch?.cancel();
      observer.disconnect();
      preference.removeEventListener('change', reduce);
    };
  }, [active, itemCount, open, present, ready, menu, revealActive]);

  if (!present) return null;
  return createPortal(
    <div
      ref={shell}
      className="reveal-dropdown-shell"
      data-unfold={unfold}
      data-open={open}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      style={
        {
          top: position.top,
          left: position.left,
          width: position.width,
          '--dropdown-row-height': `${position.rowHeight}px`,
          visibility: ready ? 'visible' : 'hidden',
        } as CSSProperties
      }
    >
      <div ref={panel} className="reveal-dropdown-panel">
        <span className="reveal-dropdown-surface" data-popup-surface aria-hidden="true" />
        <div className="reveal-dropdown-content" data-popup-content>
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="reveal-select-menu"
            style={{ maxHeight: position.maxHeight }}
          >
            <div className="reveal-select-options">
              <span ref={highlight} className="reveal-select-highlight" aria-hidden="true">
                <span ref={ink} />
              </span>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
