import { useEffect, useRef, useState } from 'react';

/** Expand the existing preview without remounting its animation or canvas. */
export function usePreviewFullscreen() {
  const preview = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const minimize = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const expanded = useRef(false);
  const pending = useRef(false);
  const request = useRef(0);
  const mode = useRef<'native' | 'popover' | 'overlay' | null>(null);

  const update = (value: boolean) => {
    expanded.current = value;
    setFullscreen(value);
  };

  const close = () => {
    const element = preview.current;
    request.current++;
    pending.current = false;
    if (element && document.fullscreenElement === element) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (element && mode.current === 'popover') {
      if (element.matches(':popover-open')) element.hidePopover();
      element.removeAttribute('popover');
    }
    mode.current = null;
    update(false);
  };

  const toggle = () => {
    if (expanded.current) {
      close();
      return;
    }
    const element = preview.current;
    if (!element || pending.current) return;
    const currentRequest = ++request.current;
    const fallback = () => {
      if (currentRequest !== request.current || !element.isConnected) return;
      // A top-layer popover also escapes the site's transformed page surfaces.
      if (typeof element.showPopover === 'function') {
        try {
          element.popover = 'manual';
          element.showPopover();
          mode.current = 'popover';
        } catch {
          element.removeAttribute('popover');
          mode.current = 'overlay';
        }
      } else mode.current = 'overlay';
      update(true);
    };
    if (document.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
      pending.current = true;
      void element
        .requestFullscreen()
        .catch(fallback)
        .finally(() => {
          if (currentRequest === request.current) pending.current = false;
        });
    } else fallback();
  };

  useEffect(() => {
    const element = preview.current;
    if (!element) return;
    const onFullscreenChange = () => {
      if (document.fullscreenElement === element) {
        mode.current = 'native';
        update(true);
      } else if (mode.current === 'native') {
        mode.current = null;
        update(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!expanded.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          element.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((item) => !item.closest('[inert]') && item.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      request.current++;
      pending.current = false;
      expanded.current = false;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown, true);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      if (mode.current === 'popover') {
        if (element.matches(':popover-open')) element.hidePopover();
        element.removeAttribute('popover');
      }
      mode.current = null;
    };
  }, []);

  useEffect(() => {
    const element = preview.current;
    if (!fullscreen || !element) return;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    const siblings: Array<{ element: HTMLElement; inert: boolean }> = [];
    let child: HTMLElement = element;
    for (let parent = child.parentElement; parent; parent = child.parentElement) {
      for (const sibling of parent.children) {
        if (sibling !== child && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      child = parent;
    }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    minimize.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
      siblings.forEach(({ element: sibling, inert }) => {
        sibling.inert = inert;
      });
      trigger.current?.focus({ preventScroll: true });
    };
  }, [fullscreen]);

  return { preview, trigger, minimize, fullscreen, toggle };
}
