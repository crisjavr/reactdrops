import { useGSAP } from '@gsap/react';
import { visibleComponents } from '@reactdrops/catalog-data/catalog';
import { gsap } from 'gsap';
import { useRef } from 'react';
import { Link } from 'react-router';

gsap.registerPlugin(useGSAP);

// Route pages mount their own sidebar, but its scroll belongs to the shared
// navigation rather than to an individual component page.
let sidebarScrollTop = 0;

const sidebarComponents = visibleComponents;

const componentGroups = Object.entries(
  sidebarComponents.reduce<Record<string, typeof sidebarComponents>>((groups, component) => {
    for (const type of new Set(component.types.length ? component.types : ['other'])) {
      (groups[type] ??= []).push(component);
    }
    return groups;
  }, {}),
);

function formatCategory(value: string) {
  return value
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function CatalogSidebar({ activeComponent }: { activeComponent?: string }) {
  const sidebarRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const sidebar = sidebarRef.current;
    const indicator = sidebar?.querySelector<HTMLElement>('.components-sidebar-indicator');
    const activeLink = sidebar?.querySelector<HTMLElement>(
      '.components-sidebar-link.is-active, .components-sidebar-component-link.is-active',
    );
    const links = sidebar?.querySelectorAll<HTMLElement>(
      '.components-sidebar-link:not(.is-disabled), .components-sidebar-component-link',
    );
    if (!sidebar || !indicator || !activeLink || !links) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactLayout = window.matchMedia('(max-width: 800px)');
    let currentLink = activeLink;
    let indicatorVisible = false;

    const rememberScroll = () => {
      // Mobile hides the component list; its collapsed scroll must not replace
      // the desktop position when changing layouts or navigating from mobile.
      if (!compactLayout.matches) sidebarScrollTop = sidebar.scrollTop;
    };
    sidebar.addEventListener('scroll', rememberScroll, { passive: true });
    sidebar.addEventListener('click', rememberScroll, true);

    const moveIndicator = (link: HTMLElement, immediate = false) => {
      if (compactLayout.matches) return;
      const linkRect = link.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      gsap.killTweensOf(indicator);
      const properties = {
        x: linkRect.left - sidebarRect.left + sidebar.scrollLeft,
        y: linkRect.top - sidebarRect.top + sidebar.scrollTop,
        width: linkRect.width,
        height: linkRect.height,
        scale: 1,
      };

      if (immediate) {
        gsap.set(indicator, { ...properties, opacity: indicatorVisible ? 1 : 0 });
      } else if (reducedMotion.matches) {
        gsap.set(indicator, { ...properties, opacity: 1 });
      } else {
        if (!indicatorVisible) gsap.set(indicator, { ...properties, scale: 0.96, opacity: 0 });
        gsap.to(indicator, {
          ...properties,
          duration: indicatorVisible ? 0.32 : 0.18,
          ease: 'back.out(1)',
        });
        gsap.to(indicator, { opacity: 1, duration: 0.18, ease: 'power3.out' });
      }
      if (!immediate) indicatorVisible = true;
    };

    const hideIndicator = () => {
      if (!indicatorVisible || compactLayout.matches) return;
      gsap.killTweensOf(indicator);
      if (reducedMotion.matches) gsap.set(indicator, { opacity: 0 });
      else gsap.to(indicator, { opacity: 0, duration: 1, ease: 'power4.out' });
      indicatorVisible = false;
    };

    const syncLayout = () => {
      sidebar.classList.toggle('has-shared-indicator', !compactLayout.matches);
      if (compactLayout.matches) {
        gsap.set(indicator, { opacity: 0 });
        indicatorVisible = false;
      } else {
        // useGSAP restores before paint, so the replacement sidebar does not
        // briefly appear at the top during route navigation.
        sidebar.scrollTop = sidebarScrollTop;
        moveIndicator(currentLink, true);
      }
    };
    syncLayout();
    compactLayout.addEventListener('change', syncLayout);
    const onMotionChange = () => {
      if (reducedMotion.matches) moveIndicator(currentLink, true);
    };
    reducedMotion.addEventListener('change', onMotionChange);

    const cleanups = Array.from(links).map((link) => {
      const moveToLink = () => {
        currentLink = link;
        moveIndicator(link);
      };
      const fadeFromLink = (event: PointerEvent) => {
        const next = event.relatedTarget;
        if (
          next instanceof Element &&
          sidebar.contains(next) &&
          next.closest(
            '.components-sidebar-link:not(.is-disabled), .components-sidebar-component-link',
          )
        )
          return;
        if (!sidebar.querySelector(':focus-visible')) hideIndicator();
      };
      link.addEventListener('pointerenter', moveToLink);
      link.addEventListener('pointerleave', fadeFromLink);
      link.addEventListener('focus', moveToLink);
      return () => {
        link.removeEventListener('pointerenter', moveToLink);
        link.removeEventListener('pointerleave', fadeFromLink);
        link.removeEventListener('focus', moveToLink);
      };
    });

    const fadeOnLeave = () => {
      if (!sidebar.querySelector(':focus-visible')) hideIndicator();
    };
    sidebar.addEventListener('pointerleave', fadeOnLeave);
    const returnWhenFocusLeaves = (event: FocusEvent) => {
      if (!sidebar.contains(event.relatedTarget as Node | null) && !sidebar.matches(':hover'))
        hideIndicator();
    };
    sidebar.addEventListener('focusout', returnWhenFocusLeaves);

    const resizeObserver = new ResizeObserver(() => moveIndicator(currentLink, true));
    resizeObserver.observe(sidebar);
    resizeObserver.observe(activeLink);

    return () => {
      cleanups.forEach((cleanup) => {
        cleanup();
      });
      sidebar.removeEventListener('pointerleave', fadeOnLeave);
      sidebar.removeEventListener('focusout', returnWhenFocusLeaves);
      sidebar.removeEventListener('scroll', rememberScroll);
      sidebar.removeEventListener('click', rememberScroll, true);
      compactLayout.removeEventListener('change', syncLayout);
      reducedMotion.removeEventListener('change', onMotionChange);
      sidebar.classList.remove('has-shared-indicator');
      resizeObserver.disconnect();
      gsap.killTweensOf(indicator);
    };
  }, [activeComponent]);

  return (
    <aside ref={sidebarRef} className="components-left-sidebar">
      <span className="components-sidebar-indicator" aria-hidden="true" />
      <nav aria-label="Documentation sections">
        <p className="components-sidebar-label">Getting Started</p>
        <div className="components-sidebar-links">
          <Link
            className={`components-sidebar-link${activeComponent ? '' : ' is-active'}`}
            to="/components"
            aria-current={activeComponent ? undefined : 'page'}
          >
            <span>Components</span>
          </Link>
        </div>
      </nav>

      <div className="components-sidebar-catalog" aria-label="Published components">
        <p className="components-sidebar-label">Components</p>
        {componentGroups.map(([type, groupedComponents]) => (
          <section
            className="components-sidebar-category"
            aria-labelledby={`component-category-${type}`}
            key={type}
          >
            <p className="components-sidebar-category-label" id={`component-category-${type}`}>
              <span>{formatCategory(type)}</span>
              <span
                className="components-sidebar-category-count"
                aria-label={`${groupedComponents.length} components`}
              >
                {groupedComponents.length}
              </span>
            </p>
            {groupedComponents.map((component) => (
              <Link
                className={`components-sidebar-component-link${activeComponent === component.slug ? ' is-active' : ''}`}
                to={`/components/${component.family.slug}/${component.slug}`}
                aria-current={activeComponent === component.slug ? 'page' : undefined}
                key={component.slug}
              >
                {component.name}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
