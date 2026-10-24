import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import './component-preview-miniature.css';

const RETURN_FADE_MS = 320;

/** Also reaches the page when a control's editor is portalled to document.body. */
export function requestComponentPreview(control: HTMLElement | null) {
  control?.dispatchEvent(new CustomEvent('reactdrops:preview-interaction', { bubbles: true }));
}

type Dock = {
  sourceWidth: number;
  sourceHeight: number;
  renderHeight: number;
  mobile: boolean;
  width: number;
  height: number;
  centerX: number;
  top: number;
  backdropTop: number;
  backdropHeight: number;
  backdropLeft: number;
  backdropWidth: number;
  clip: string;
  backdropClip: string;
  exiting: boolean;
  returning: boolean;
};

type Bounds = { left: number; top: number; right: number; bottom: number };

/** Keep an ongoing control gesture usable until it ends beneath the top layer. */
function clipAroundControl(outer: Bounds, control: Bounds | null) {
  const { left, top, right, bottom } = outer;
  const outline = `${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px`;
  if (!control) return `polygon(${outline})`;
  const x1 = Math.max(left, control.left - 3);
  const y1 = Math.max(top, control.top - 3);
  const x2 = Math.min(right, control.right + 3);
  const y2 = Math.min(bottom, control.bottom + 3);
  return `polygon(evenodd, ${outline}, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px, ${left}px ${top}px)`;
}

/** Move the existing preview into the top layer; never mount a second component. */
export function ComponentPreviewMiniature({
  children,
  enabled = true,
  onReplay,
}: {
  children: ReactNode;
  enabled?: boolean;
  onReplay?: () => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const [dock, setDock] = useState<Dock | null>(null);
  const current = useRef(dock);
  current.current = dock;
  const motion = useRef<Animation | null>(null);
  const phase = useRef('inline');
  const exitLayer = useRef<HTMLDivElement>(null);
  const exitMotion = useRef<Animation | null>(null);
  const clearSnapshot = () => {
    exitMotion.current?.cancel();
    exitMotion.current = null;
    const element = exitLayer.current;
    if (!element) return;
    if (element.matches(':popover-open')) element.hidePopover();
    element.removeAttribute('popover');
    element.replaceChildren();
    element.className = 'component-miniature-exit-layer';
    element.removeAttribute('style');
    element.removeAttribute('data-wide');
  };
  const captureSnapshot = () => {
    const source = frame.current;
    const sourceLayer = layer.current;
    const target = exitLayer.current;
    if (!source || !sourceLayer || !target || typeof target.showPopover !== 'function')
      return false;
    const copy = source.cloneNode(true) as HTMLDivElement;
    const elements = [source, ...source.querySelectorAll<HTMLElement>('*')];
    const clonedElements = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
    for (let index = 0; index < elements.length; index++) {
      if (!elements[index].getAnimations().some((animation) => animation.playState !== 'finished'))
        continue;
      const appearance = getComputedStyle(elements[index]);
      for (const property of ['transform', 'opacity', 'filter', 'clip-path']) {
        clonedElements[index].style.setProperty(property, appearance.getPropertyValue(property));
      }
    }
    const originals = source.querySelectorAll<HTMLCanvasElement | HTMLVideoElement>(
      'canvas, video',
    );
    const copies = copy.querySelectorAll('canvas, video');
    // Some idle WebGL renderers clear their drawing buffer after compositing.
    // In that case retain the live miniature for its exit instead of showing
    // a blank copy. Animated renderers are captured in this scroll RAF after
    // their current draw; no second renderer or persistent capture loop runs.
    try {
      for (let index = 0; index < originals.length; index++) {
        const original = originals[index];
        const bitmap = document.createElement('canvas');
        bitmap.width = original instanceof HTMLVideoElement ? original.videoWidth : original.width;
        bitmap.height =
          original instanceof HTMLVideoElement ? original.videoHeight : original.height;
        if (!bitmap.width || !bitmap.height) return false;
        bitmap.style.cssText = (copies[index] as HTMLElement).style.cssText;
        bitmap.className = copies[index].className;
        bitmap.dataset.miniatureSnapshot = '';
        const context = bitmap.getContext('2d');
        if (!context) return false;
        context.drawImage(original, 0, 0);
        const sample = document.createElement('canvas');
        sample.width = sample.height = 8;
        const pixels = sample.getContext('2d', { willReadFrequently: true })!;
        pixels.drawImage(bitmap, 0, 0, 8, 8);
        if (
          !pixels
            .getImageData(0, 0, 8, 8)
            .data.some((value, channel) => channel % 4 === 3 && value > 0)
        )
          return false;
        copies[index].replaceWith(bitmap);
      }
    } catch {
      return false;
    }
    clearSnapshot();
    const bounds = source.getBoundingClientRect();
    Object.assign(copy.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      transform: 'none',
      opacity: getComputedStyle(source).opacity,
    });
    for (const item of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
      item.removeAttribute('id');
      item.removeAttribute('aria-controls');
    }
    copy.querySelectorAll('style, link, script').forEach((element) => element.remove());
    target.className =
      'component-miniature-layer component-miniature-exit-layer is-pinned is-leaving is-returning';
    target.style.cssText = sourceLayer.style.cssText;
    const backdrop = getComputedStyle(sourceLayer, '::backdrop');
    target.style.setProperty('--miniature-return-duration', `${RETURN_FADE_MS}ms`);
    target.style.setProperty('--miniature-exit-opacity', backdrop.opacity);
    target.style.setProperty('--miniature-exit-transform', backdrop.transform);
    if (sourceLayer.hasAttribute('data-wide')) target.setAttribute('data-wide', '');
    target.append(copy);
    target.popover = 'manual';
    target.showPopover();
    const animation = copy.animate(
      [
        { opacity: copy.style.opacity },
        { opacity: 0 },
      ],
      { duration: RETURN_FADE_MS, easing: 'ease-in-out', fill: 'forwards' },
    );
    exitMotion.current = animation;
    animation.finished.then(
      () => {
        if (exitMotion.current === animation) clearSnapshot();
      },
      () => {},
    );
    return true;
  };

  useLayoutEffect(() => {
    const element = slot.current;
    const page = element?.closest<HTMLElement>('.component-detail-page');
    if (!enabled || !element || !page) {
      requested.current = false;
      setDock(null);
      return;
    }
    let pending = 0;
    let previousScroll = scrollY;
    let activeControl: HTMLElement | null = null;
    const update = (interaction = false) => {
      if (page.closest('.page-reveal-surface[inert]')) return;
      if (!interaction && !requested.current && !current.current) return;
      const bounds = element.getBoundingClientRect();
      const scrollingUp = scrollY < previousScroll;
      previousScroll = scrollY;
      const navbar = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5;
      const controls = page.querySelector('#controls')?.getBoundingClientRect();
      const visible = Math.max(
        0,
        Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, navbar),
      );
      // Begin returning as soon as the main preview peeks back into view.
      // Editing near the activation threshold must not trigger a return.
      const returned =
        bounds.top >= navbar ||
        visible / bounds.height > 0.22 ||
        (!!current.current && scrollingUp && visible / bounds.height > 0.02);
      const available =
        !returned &&
        !element.closest('.component-showcase.is-fullscreen') &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.top < navbar &&
        visible / bounds.height <= (current.current ? 0.22 : 0.2) &&
        !!controls &&
        controls.bottom > navbar;
      if (interaction) requested.current = available;
      if (!requested.current || !available) {
        requested.current = false;
        if (
          current.current &&
          !current.current.exiting &&
          returned &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches &&
          captureSnapshot()
        ) {
          setDock(null);
        } else
          setDock((old) =>
            old && !old.exiting ? { ...old, exiting: true, returning: returned } : old,
          );
        return;
      }
      const mobile = innerWidth <= 640;
      const ratio = mobile ? 16 / 9 : bounds.width / bounds.height;
      let width = Math.min(
        mobile ? innerWidth - 32 : 336,
        innerWidth - 32,
        innerHeight * 0.28 * ratio,
      );
      const frameStyle = getComputedStyle(frame.current!);
      const rightInset = Number.parseFloat(frameStyle.right) || 16;
      const bottomInset = Number.parseFloat(frameStyle.bottom) || 16;
      const columnRight = Math.max(bounds.right, controls?.right ?? bounds.right);
      const railWidth = innerWidth - rightInset - columnRight - 32;
      // Use the empty desktop rail, keeping a gap beside the controls.
      // Narrow layouts retain the wide mobile preview above the page.
      if (!mobile && railWidth >= 160) width = Math.min(width, railWidth);
      const centerX = innerWidth - rightInset - width / 2;
      const height = width / ratio;
      const miniatureTop = innerHeight - bottomInset - height;
      const backdropLeft = Math.max(0, centerX - width / 2 - 24);
      const backdropRight = innerWidth;
      const backdropTop = Math.max(navbar, miniatureTop - 32);
      const control =
        activeControl?.isConnected && activeControl.querySelector('input[type="range"]')
          ? activeControl.getBoundingClientRect()
          : null;
      const overlaps =
        control &&
        control.left < centerX + width / 2 &&
        control.right > centerX - width / 2 &&
        control.top < miniatureTop + height &&
        control.bottom > miniatureTop;
      const cutout = overlaps ? control : null;
      const backdropHeight = innerHeight - backdropTop;
      const next: Dock = {
        sourceWidth: bounds.width,
        sourceHeight: bounds.height,
        renderHeight: mobile ? bounds.width / ratio : bounds.height,
        mobile,
        width,
        height,
        centerX,
        top: miniatureTop,
        backdropTop,
        backdropHeight,
        backdropLeft,
        backdropWidth: Math.max(0, backdropRight - backdropLeft),
        clip: clipAroundControl(
          { left: 0, top: navbar, right: innerWidth, bottom: innerHeight },
          cutout,
        ),
        backdropClip: clipAroundControl(
          { left: 0, top: 0, right: backdropRight - backdropLeft, bottom: backdropHeight },
          cutout
            ? {
                left: cutout.left - backdropLeft,
                top: cutout.top - backdropTop,
                right: cutout.right - backdropLeft,
                bottom: cutout.bottom - backdropTop,
              }
            : null,
        ),
        exiting: false,
        returning: false,
      };
      setDock((old) =>
        old && Object.keys(next).every((key) => old[key as keyof Dock] === next[key as keyof Dock])
          ? old
          : next,
      );
    };
    const schedule = () => {
      if (!pending)
        pending = requestAnimationFrame(() => {
          pending = 0;
          update();
        });
    };
    const interaction = (event: Event) => {
      if (
        event.type !== 'reactdrops:preview-interaction' &&
        !(event.target instanceof Element && event.target.closest('#controls .reveal-field'))
      )
        return;
      update(true);
    };
    const beginControlGesture = (event: Event) => {
      const field =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('#controls .reveal-field')
          : null;
      activeControl = field?.querySelector('input[type="range"]') ? field : null;
      if (current.current) update();
    };
    const endControlGesture = () => {
      if (!activeControl) return;
      activeControl = null;
      update();
    };
    const leaveControl = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !activeControl?.contains(event.relatedTarget))
        endControlGesture();
    };
    page.addEventListener('pointerdown', beginControlGesture, true);
    page.addEventListener('keydown', beginControlGesture, true);
    page.addEventListener('focusout', leaveControl);
    window.addEventListener('pointerup', endControlGesture, true);
    window.addEventListener('pointercancel', endControlGesture, true);
    window.addEventListener('lostpointercapture', endControlGesture, true);
    window.addEventListener('keyup', endControlGesture, true);
    window.addEventListener('blur', endControlGesture);
    page.addEventListener('input', interaction);
    page.addEventListener('change', interaction);
    page.addEventListener('reactdrops:preview-interaction', interaction);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const mode = new MutationObserver(schedule);
    const showcase = element.closest('.component-showcase');
    if (showcase) mode.observe(showcase, { attributes: true, attributeFilter: ['class'] });
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    return () => {
      cancelAnimationFrame(pending);
      resize.disconnect();
      mode.disconnect();
      page.removeEventListener('pointerdown', beginControlGesture, true);
      page.removeEventListener('keydown', beginControlGesture, true);
      page.removeEventListener('focusout', leaveControl);
      window.removeEventListener('pointerup', endControlGesture, true);
      window.removeEventListener('pointercancel', endControlGesture, true);
      window.removeEventListener('lostpointercapture', endControlGesture, true);
      window.removeEventListener('keyup', endControlGesture, true);
      window.removeEventListener('blur', endControlGesture);
      page.removeEventListener('input', interaction);
      page.removeEventListener('change', interaction);
      page.removeEventListener('reactdrops:preview-interaction', interaction);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled]);

  const pinned = !!dock;
  useLayoutEffect(() => {
    const element = layer.current;
    if (!pinned || !element || typeof element.showPopover !== 'function') return;
    element.popover = 'manual';
    element.showPopover();
    return () => {
      if (element.matches(':popover-open')) element.hidePopover();
      element.removeAttribute('popover');
    };
  }, [pinned]);

  useLayoutEffect(() => {
    const element = frame.current;
    const nextPhase = !dock ? 'inline' : dock.exiting ? 'exiting' : 'pinned';
    if (!element || phase.current === nextPhase) return;
    const previousPhase = phase.current;
    phase.current = nextPhase;
    const interrupted =
      motion.current && previousPhase !== 'inline' ? getComputedStyle(element) : null;
    const from = {
      transform: interrupted?.transform ?? 'translate3d(0, 6px, 0)',
      opacity: interrupted?.opacity ?? '0',
    };
    motion.current?.cancel();
    motion.current = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!dock) {
      element.style.removeProperty('transform');
      element.style.removeProperty('opacity');
      if (!reduce)
        motion.current = element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: RETURN_FADE_MS,
          easing: 'ease-in-out',
        });
      return;
    }
    const to = {
      transform: dock.returning
        ? from.transform
        : `translate3d(0, ${dock.exiting ? '6px' : '0px'}, 0)`,
      opacity: dock.exiting ? '0' : '1',
    };
    if (!dock.exiting) clearSnapshot();
    Object.assign(element.style, to);
    if (!reduce)
      motion.current = element.animate([from, to], {
        duration: dock.exiting ? 180 : 220,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
      });
  }, [dock]);

  const exiting = dock?.exiting ?? false;
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(
      () => setDock((old) => (old?.exiting ? null : old)),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
    );
    return () => clearTimeout(timer);
  }, [exiting]);
  useEffect(
    () => () => {
      motion.current?.cancel();
      clearSnapshot();
    },
    [],
  );

  if (!enabled) return children;
  return (
    <div
      ref={slot}
      className="component-miniature-slot"
      style={dock ? { height: dock.sourceHeight } : undefined}
    >
      <div
        ref={layer}
        data-popup-priority="preview"
        data-wide={dock?.mobile || undefined}
        className={`component-miniature-layer${dock ? ' is-pinned' : ''}${exiting ? ' is-leaving' : ''}${dock?.returning ? ' is-returning' : ''}`}
        style={
          dock
            ? ({
                '--miniature-center': `${dock.centerX}px`,
                '--miniature-top': `${dock.top}px`,
                '--miniature-backdrop-top': `${dock.backdropTop}px`,
                '--miniature-gradient-height': `${dock.backdropHeight}px`,
                '--miniature-height': `${dock.height}px`,
                '--miniature-backdrop-left': `${dock.backdropLeft}px`,
                '--miniature-backdrop-width': `${dock.backdropWidth}px`,
                '--miniature-clip': dock.clip,
                '--miniature-backdrop-clip': dock.backdropClip,
              } as CSSProperties)
            : undefined
        }
      >
        <div
          ref={frame}
          className="component-miniature-frame"
          style={dock ? { width: dock.width, height: dock.height } : undefined}
        >
          <div
            className="component-miniature-source"
            style={
              dock
                ? {
                    width: dock.sourceWidth,
                    height: dock.renderHeight,
                    transform: `scale(${dock.width / dock.sourceWidth})`,
                  }
                : undefined
            }
          >
            {children}
          </div>
          {dock && (
            <div className="component-miniature-actions">
              {onReplay && (
                <button type="button" onClick={onReplay}>
                  Replay
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  slot.current?.scrollIntoView({
                    block: 'center',
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'instant'
                      : 'smooth',
                  });
                }}
              >
                Back to demo
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={exitLayer}
        className="component-miniature-exit-layer"
        data-popup-priority="preview"
        aria-hidden="true"
        inert
      />
    </div>
  );
}
