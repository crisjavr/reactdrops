/** Start preview work when it is visible and outside a page reveal. */
export function observePreviewActivation(
  element: HTMLElement,
  activate: () => void,
  { waitForPageReveal = false }: { waitForPageReveal?: boolean } = {},
) {
  const surface = element.closest<HTMLElement>('.page-reveal-surface');
  let visible = false,
    disposed = false,
    activated = false,
    frame = 0;
  let intersection: IntersectionObserver | undefined;
  const transitions = new MutationObserver(() => schedule());
  const cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const eligible = () =>
    visible &&
    surface?.dataset.pageTransition !== 'entering' &&
    (!waitForPageReveal || !surface || surface.classList.contains('hero-revealed'));
  const schedule = () => {
    if (disposed || activated) return;
    if (!eligible()) {
      cancel();
      return;
    }
    if (frame) return;
    // Let the settled page paint before mounting a GPU thumbnail.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed || activated || !eligible()) return;
        activated = true;
        intersection?.disconnect();
        transitions.disconnect();
        activate();
      });
    });
  };
  if (surface)
    transitions.observe(surface, {
      attributes: true,
      attributeFilter: waitForPageReveal
        ? ['data-page-transition', 'class']
        : ['data-page-transition'],
    });
  if (typeof IntersectionObserver === 'undefined') {
    visible = true;
    schedule();
  } else {
    intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        schedule();
      },
      { root: surface, threshold: 0 },
    );
    intersection.observe(element);
  }
  return () => {
    disposed = true;
    cancel();
    intersection?.disconnect();
    transitions.disconnect();
  };
}
