import { gsap } from 'gsap';

/** A single entrance per mount or re-enable, after the first visible GPU frame. */
export function createFluidAgentOrbEntrance(host: HTMLElement) {
  const preference = host.ownerDocument.defaultView!.matchMedia('(prefers-reduced-motion: reduce)');
  const context = gsap.context(() => {}, host);
  let intersection: IntersectionObserver | undefined;
  let changes: MutationObserver | undefined;
  let visible = typeof IntersectionObserver === 'undefined';
  let started = false;
  let disposed = false;
  delete host.dataset.orbEntered;

  const disconnect = () => {
    intersection?.disconnect();
    changes?.disconnect();
    host.ownerDocument.removeEventListener('visibilitychange', reveal);
  };
  const finish = () => {
    if (disposed) return;
    started = true;
    disconnect();
    host.dataset.orbEntered = 'true';
    context.revert();
  };
  function reveal() {
    if (
      disposed ||
      started ||
      !visible ||
      host.dataset.flowReady !== 'true' ||
      host.ownerDocument.visibilityState === 'hidden'
    )
      return;
    started = true;
    disconnect();
    context.add(() => {
      gsap.to(host, {
        '--agent-entrance-scale': 1,
        opacity: 1,
        duration: 1.2,
        delay: 0.15,
        ease: 'power4.out',
        onComplete: finish,
      });
    });
  }
  const onPreferenceChange = () => {
    if (preference.matches) finish();
  };
  if (preference.matches) {
    finish();
  } else {
    context.add(() => {
      // Compose with the voice scale instead of taking over its CSS transforms.
      gsap.set(host, { '--agent-entrance-scale': 0.08, opacity: 0 });
    });
    changes = new MutationObserver(reveal);
    changes.observe(host, { attributes: true, attributeFilter: ['data-flow-ready'] });
    if (!visible) {
      intersection = new IntersectionObserver(
        ([entry]) => {
          visible = entry?.isIntersecting ?? false;
          reveal();
        },
        { threshold: 0.15 },
      );
      intersection.observe(host);
    }
    host.ownerDocument.addEventListener('visibilitychange', reveal);
    preference.addEventListener('change', onPreferenceChange);
    reveal();
  }
  return () => {
    disposed = true;
    disconnect();
    preference.removeEventListener('change', onPreferenceChange);
    context.revert();
    delete host.dataset.orbEntered;
  };
}
