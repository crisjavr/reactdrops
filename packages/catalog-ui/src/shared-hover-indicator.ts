import { gsap } from 'gsap';

/** Use the home navigation's moving highlight in shared navigation and controls. */
export function createSharedHoverIndicator(
  container: HTMLElement,
  {
    itemSelector,
    activeSelector,
    matchBorderRadius = false,
    padding = 0,
  }: {
    itemSelector: string;
    activeSelector?: string;
    matchBorderRadius?: boolean;
    padding?: number;
  },
) {
  const indicator = container.querySelector<HTMLElement>('[data-shared-hover-indicator]');
  if (!indicator) return () => {};
  const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentItem: HTMLElement | null = null;
  let visible = false;
  let pointerInside = false;
  let disposed = false;

  const positionFor = (item: HTMLElement) => {
    const itemRect = item.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: itemRect.left - containerRect.left - container.clientLeft + container.scrollLeft - padding,
      y: itemRect.top - containerRect.top - container.clientTop + container.scrollTop - padding,
      width: itemRect.width + padding * 2,
      height: itemRect.height + padding * 2,
      ...(matchBorderRadius ? { borderRadius: getComputedStyle(item).borderRadius } : {}),
    };
  };

  const moveTo = (item: HTMLElement, immediate = false) => {
    if (disposed) return;
    const position = positionFor(item);
    gsap.killTweensOf(indicator);
    if (immediate || preference.matches) gsap.set(indicator, { ...position, opacity: 1 });
    else if (!visible) {
      gsap.set(indicator, { ...position, opacity: 0 });
      gsap.to(indicator, { opacity: 1, duration: 0.7, ease: 'power4.out' });
    } else gsap.to(indicator, { ...position, opacity: 1, duration: 0.7, ease: 'power4.out' });
    currentItem = item;
    visible = true;
  };

  const restore = (immediate = false) => {
    if (disposed) return;
    const item =
      items.find((item) => item.matches(':focus-visible')) ??
      (activeSelector ? container.querySelector<HTMLElement>(activeSelector) : null);
    if (item) moveTo(item, immediate);
    else {
      gsap.killTweensOf(indicator);
      if (immediate || preference.matches) gsap.set(indicator, { opacity: 0 });
      else gsap.to(indicator, { opacity: 0, duration: 0.7, ease: 'power4.out' });
      currentItem = null;
      visible = false;
    }
  };

  const cleanups = items.map((item) => {
    const onEnter = () => moveTo(item);
    const onFocus = () => {
      // Mouse focus restored during navigation must not create a stuck hover.
      if (item.matches(':focus-visible')) moveTo(item);
    };
    item.addEventListener('pointerenter', onEnter);
    item.addEventListener('focus', onFocus);
    return () => {
      item.removeEventListener('pointerenter', onEnter);
      item.removeEventListener('focus', onFocus);
    };
  });
  const onPointerEnter = () => {
    pointerInside = true;
  };
  const onPointerLeave = () => {
    pointerInside = false;
    restore();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!container.contains(event.relatedTarget as Node | null) && !pointerInside) restore();
  };
  const onMotionChange = () => {
    if (currentItem) moveTo(currentItem, true);
    else restore(true);
  };
  container.addEventListener('pointerenter', onPointerEnter);
  container.addEventListener('pointerleave', onPointerLeave);
  container.addEventListener('focusout', onFocusOut);
  preference.addEventListener('change', onMotionChange);

  const resizeObserver = new ResizeObserver(() => {
    if (currentItem) moveTo(currentItem, true);
  });
  resizeObserver.observe(container);
  items.forEach((item) => resizeObserver.observe(item));
  const selectionObserver = activeSelector
    ? new MutationObserver(() => {
        if (!pointerInside && !items.some((item) => item.matches(':focus-visible'))) restore();
      })
    : null;
  items.forEach((item) =>
    selectionObserver?.observe(item, {
      attributes: true,
      attributeFilter: ['aria-pressed', 'aria-selected'],
    }),
  );
  container.classList.add('has-shared-indicator');
  restore(true);

  return () => {
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
    container.removeEventListener('pointerenter', onPointerEnter);
    container.removeEventListener('pointerleave', onPointerLeave);
    container.removeEventListener('focusout', onFocusOut);
    preference.removeEventListener('change', onMotionChange);
    container.classList.remove('has-shared-indicator');
    resizeObserver.disconnect();
    selectionObserver?.disconnect();
    gsap.killTweensOf(indicator);
    // A retained page can return without a pointerleave event. Cancel the
    // animation and clear its painted state before the nav becomes inactive.
    gsap.set(indicator, { opacity: 0 });
    currentItem = null;
    visible = pointerInside = false;
  };
}
