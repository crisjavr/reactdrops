import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import './color-control.css';
import { usePopupMotion } from './use-popup-motion';
import { requestComponentPreview } from './component-preview-miniature';

type Color = { h: number; s: number; v: number; a: number };
const swatches = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#16a34a',
  '#06b6d4',
  '#171717',
  '#ffffff',
];
const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
function hex({ h, s, v, a }: Color) {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(
      255 * (v / 100 - (((v / 100) * s) / 100) * Math.max(0, Math.min(k, 4 - k, 1))),
    )
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}${
    a < 1
      ? Math.round(a * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`;
}
function rgba(value: string): [number, number, number, number] | null {
  const input = value.trim();
  const hex = input.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length < 5 ? Array.from(hex[1], (n) => n + n).join('') : hex[1];
    const channels = digits.match(/../g)!.map((n) => parseInt(n, 16) / 255);
    return [channels[0], channels[1], channels[2], channels[3] ?? 1];
  }
  const rgb = input.match(/^rgba?\((.+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].trim().split(/[\s,/]+/);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channels = parts.map((part, index) => {
    const percent = part.endsWith('%');
    return clamp(
      Number(percent ? part.slice(0, -1) : part) / (percent ? 100 : index < 3 ? 255 : 1),
      1,
    );
  });
  if (channels.some((n) => !Number.isFinite(n))) return null;
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}
// Keep RGB channels at zero alpha. Native CSS resolves variables/currentColor;
// the one-pixel canvas is only needed to convert other color spaces.
function resolve(value: string, parent: HTMLElement): Color | null {
  if (!CSS.supports('color', value)) return null;
  let channels = rgba(value);
  if (!channels) {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.display = 'none';
    parent.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    channels = rgba(color);
    if (!channels) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const pixels = ctx.getImageData(0, 0, 1, 1).data;
      channels = [pixels[0] / 255, pixels[1] / 255, pixels[2] / 255, pixels[3] / 255];
    }
  }
  const [r, g, b, a] = channels;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const h = !delta
    ? 0
    : max === r
      ? ((g - b) / delta + 6) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return { h: h * 60, s: max ? (delta / max) * 100 : 0, v: max * 100, a };
}

/** Shared custom color editor; accepts arbitrary CSS without a native OS dialog. */
export function ColorControl({
  label,
  value,
  onChange,
  allowAuto = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowAuto?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null),
    popup = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value);
  const [color, setColor] = useState<Color>({ h: 220, s: 84, v: 92, a: 1 });
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, ready: false });
  const [invalid, setInvalid] = useState(false);
  const present = usePopupMotion({
    open,
    ready: position.ready,
    anchor,
    shell: popup,
    panel,
    bounce: 'soft',
    surfaceBlurAmount: 0,
    contentBlurAmount: 0,
    contentBlurDuration: 0,
  });
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    if (value !== emitted.current) {
      const resolved = resolve(
        allowAuto && value.trim().toLowerCase() === 'auto' ? '#808080' : value,
        anchor.current,
      );
      if (resolved) setColor(resolved);
    }
    emitted.current = null;
  }, [open, value, allowAuto]);
  useLayoutEffect(() => {
    if (!open || !present) return;
    const page = anchor.current?.closest<HTMLElement>('.component-detail-page');
    const preview = page?.querySelector<HTMLElement>(
      '.component-miniature-frame, .liquid-glass-logo-frame',
    );
    let frame = 0;
    const place = () => {
      frame = 0;
      if (!anchor.current || !popup.current) return;
      const field = anchor.current.closest<HTMLElement>('.reveal-field') ?? anchor.current;
      const rect = field.getBoundingClientRect();
      // The portal lives outside the catalog page's theme-token scope.
      const fieldStyle = getComputedStyle(field);
      for (const token of ['--components-selection-background', '--radius-md']) {
        const value = fieldStyle.getPropertyValue(token).trim();
        if (value) popup.current.style.setProperty(token, value);
      }
      const width = rect.width;
      popup.current.style.width = `${width}px`;
      const height = popup.current.offsetHeight;
      const margin = 12,
        gap = 12;
      const fit = (left: number, top: number) => ({
        left,
        top: Math.max(margin, Math.min(top, innerHeight - height - margin)),
      });
      // Keep the editor aligned with its field. Only its vertical placement
      // changes; avoiding the preview must never send it to another column.
      const left = fit(rect.left, margin).left;
      const ys = [rect.bottom + gap, rect.top - height - gap];
      let miniature: DOMRect | undefined;
      let gradient: { left: number; right: number; top: number; bottom: number } | undefined;
      if (
        preview &&
        (preview.classList.contains('is-pinned') ||
          preview.closest('.component-miniature-layer.is-pinned'))
      ) {
        const bounds = preview.getBoundingClientRect();
        miniature = bounds;
        const layer = preview.closest<HTMLElement>(
          '.liquid-glass-logo-preview-layer, .component-miniature-layer',
        );
        const backdrop = layer ? getComputedStyle(layer, '::backdrop') : null;
        // Keep the color editor clear of both the live frame and its gradient.
        const backdropBottom = backdrop
          ? Number.parseFloat(backdrop.top) + Number.parseFloat(backdrop.height)
          : bounds.bottom;
        const safeBottom = Math.max(
          bounds.bottom,
          Number.isFinite(backdropBottom) ? backdropBottom : bounds.bottom,
        );
        const backdropLeft = backdrop ? Number.parseFloat(backdrop.left) : NaN;
        const backdropWidth = backdrop ? Number.parseFloat(backdrop.width) : NaN;
        gradient = {
          left: Number.isFinite(backdropLeft) ? backdropLeft : bounds.left,
          right:
            Number.isFinite(backdropLeft) && Number.isFinite(backdropWidth)
              ? backdropLeft + backdropWidth
              : bounds.right,
          top: bounds.top,
          bottom: safeBottom,
        };
        ys.push(safeBottom + gap, bounds.bottom + gap, bounds.top - height - gap);
      }
      ys.push(margin, innerHeight - height - margin);
      const overlap = (
        point: { left: number; top: number },
        obstacle: { left: number; right: number; top: number; bottom: number },
      ) =>
        Math.max(
          0,
          Math.min(point.left + width, obstacle.right + gap) -
            Math.max(point.left, obstacle.left - gap),
        ) *
        Math.max(
          0,
          Math.min(point.top + height, obstacle.bottom + gap) -
            Math.max(point.top, obstacle.top - gap),
        );
      const choices = [
        ...ys.map((top) => fit(left, top)),
        // Also consider the natural anchors before scoring viewport fit and
        // separation from the opener. The large panel must stay on screen.
        { left, top: rect.bottom + gap },
        { left, top: rect.top - height - gap },
      ];
      const score = (point: { left: number; top: number }) => [
        Math.max(0, margin - point.top) + Math.max(0, point.top + height + margin - innerHeight),
        overlap(point, rect),
        miniature ? overlap(point, miniature) : 0,
        gradient ? overlap(point, gradient) : 0,
        Math.hypot(
          point.left + width / 2 - (rect.left + rect.width / 2),
          point.top + height / 2 - (rect.top + rect.height / 2),
        ),
      ];
      const target = choices.reduce((best, point) => {
        const previous = score(best),
          next = score(point);
        const difference = next.findIndex((value, index) => value !== previous[index]);
        return difference >= 0 && next[difference] < previous[difference] ? point : best;
      });
      setPosition((previous) =>
        previous.ready &&
        previous.width === width &&
        previous.left === target.left &&
        previous.top === target.top
          ? previous
          : { ready: true, width, ...target },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const themeSettled = (event: TransitionEvent) => {
      if (event.target === page && event.propertyName === '--components-selection-background')
        schedule();
    };
    place();
    const observer = new ResizeObserver(schedule);
    if (popup.current) observer.observe(popup.current);
    const field = anchor.current?.closest('.reveal-field') ?? anchor.current;
    if (field) observer.observe(field);
    if (preview) observer.observe(preview);
    const miniObserver = new MutationObserver(schedule);
    if (preview)
      miniObserver.observe(preview.closest('.component-miniature-layer') ?? preview, {
        attributes: true,
        attributeFilter: ['class'],
      });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    page?.addEventListener('transitionend', themeSettled);
    const outside = (event: Event) => {
      const target = event.target as Node;
      const ownedMenu = Array.from(popup.current?.querySelectorAll('[aria-controls]') ?? []).some(
        (control) =>
          document.getElementById(control.getAttribute('aria-controls')!)?.contains(target),
      );
      if (ownedMenu) return;
      if (!anchor.current?.contains(target) && !popup.current?.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      miniObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      page?.removeEventListener('transitionend', themeSettled);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, present]);
  useLayoutEffect(() => {
    if (open && present && position.ready)
      popup.current?.querySelector<HTMLElement>('[role="slider"]')?.focus({ preventScroll: true });
  }, [open, present, position.ready]);
  const toggle = () => {
    // A previous opening's coordinates are not valid after scrolling. Mount
    // hidden and measure again before motion chooses its edge and direction.
    if (!open) {
      setPosition((previous) => ({ ...previous, ready: false }));
      requestComponentPreview(anchor.current);
    }
    setOpen(!open);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const change = (next: Color) => {
    requestComponentPreview(anchor.current);
    setColor(next);
    const output = hex(next);
    emitted.current = output;
    setDraft(output);
    setInvalid(false);
    onChange(output);
  };
  const edit = (next: string) => {
    setDraft(next);
    const valid =
      (allowAuto && next.trim().toLowerCase() === 'auto') || CSS.supports('color', next);
    setInvalid(!valid);
    if (valid) {
      requestComponentPreview(anchor.current);
      emitted.current = null;
      onChange(next);
    }
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    change({
      ...color,
      s: clamp(((event.clientX - rect.left) / rect.width) * 100),
      v: clamp(100 - ((event.clientY - rect.top) / rect.height) * 100),
    });
  };
  const input = (inPopup = false) => (
    <input
      type="text"
      aria-label={inPopup ? `${label} CSS value` : label}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoComplete="off"
      value={draft}
      onChange={(event) => edit(event.target.value)}
      onBlur={() => {
        if (invalid) {
          setDraft(value);
          setInvalid(false);
        }
      }}
    />
  );
  return (
    <div ref={anchor} className="reveal-color">
      {input()}
      <button
        ref={trigger}
        className="reveal-color-trigger"
        type="button"
        aria-label={`Choose ${label.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <span
          style={{
            background:
              allowAuto && value.trim().toLowerCase() === 'auto'
                ? 'linear-gradient(135deg, #242424, #c9c9cc)'
                : value === 'inherit'
                  ? 'currentColor'
                  : value,
          }}
        />
      </button>
      {present &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-label={`${label} picker`}
            className="reveal-color-popup"
            data-open={open}
            aria-hidden={!open || undefined}
            inert={!open || undefined}
            style={{
              top: position.top,
              left: position.left,
              width: position.width || undefined,
              visibility: position.ready ? 'visible' : 'hidden',
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          >
            <div ref={panel} className="reveal-color-panel">
              <span className="reveal-color-surface" data-popup-surface aria-hidden="true" />
              <div className="reveal-color-content" data-popup-content>
                <div className="reveal-color-heading">
                  <strong>{label}</strong>
                  <button type="button" aria-label="Close color picker" onClick={close}>
                    ×
                  </button>
                </div>
                <div
                  className="reveal-color-plane"
                  role="slider"
                  tabIndex={0}
                  aria-label="Saturation and brightness"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(color.s)}
                  aria-valuetext={`${Math.round(color.s)}% saturation, ${Math.round(color.v)}% brightness. Use left and right for saturation, up and down for brightness.`}
                  style={{ backgroundColor: `hsl(${color.h} 100% 50%)` }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    point(event);
                  }}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event);
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 10 : 1;
                    if (
                      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      change({
                        ...color,
                        s:
                          event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? 100
                              : clamp(
                                  color.s +
                                    (event.key === 'ArrowRight'
                                      ? step
                                      : event.key === 'ArrowLeft'
                                        ? -step
                                        : 0),
                                ),
                        v: clamp(
                          color.v +
                            (event.key === 'ArrowUp'
                              ? step
                              : event.key === 'ArrowDown'
                                ? -step
                                : 0),
                        ),
                      });
                    }
                  }}
                >
                  <span
                    style={{
                      left: `${color.s}%`,
                      top: `${100 - color.v}%`,
                      background: hex({ ...color, a: 1 }),
                    }}
                  />
                </div>
                <label className="reveal-color-channel">
                  <span>Hue</span>
                  <input
                    className="reveal-color-hue"
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    aria-label="Hue"
                    value={color.h}
                    onChange={(event) => change({ ...color, h: Number(event.target.value) })}
                  />
                </label>
                <label className="reveal-color-channel">
                  <span>Opacity</span>
                  <input
                    className="reveal-color-alpha"
                    style={{
                      background: `linear-gradient(to right, transparent, ${hex({ ...color, a: 1 })}), repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 / 8px 8px`,
                    }}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    aria-label="Color opacity"
                    value={Math.round(color.a * 100)}
                    onChange={(event) => change({ ...color, a: Number(event.target.value) / 100 })}
                  />
                </label>
                <div className="reveal-color-value">{input(true)}</div>
                <div className="reveal-color-swatches">
                  {swatches.map((swatch) => (
                    <button
                      type="button"
                      key={swatch}
                      aria-label={`Use ${swatch}`}
                      aria-pressed={value.toLowerCase() === swatch}
                      style={{ background: swatch }}
                      onClick={() => edit(swatch)}
                    />
                  ))}
                </div>
                <div className={`reveal-color-keywords${allowAuto ? ' has-auto' : ''}`}>
                  {[...(allowAuto ? ['auto'] : []), 'inherit', 'currentColor', 'transparent'].map(
                    (keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        aria-pressed={value === keyword}
                        onClick={() => edit(keyword)}
                      >
                        {keyword}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
