import { visibleComponents as components } from '@reactdrops/catalog-data/catalog';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { CatalogSidebar } from './catalog-sidebar';
import { CatalogComponentCard } from './catalog-component-card';
import { createSharedHoverIndicator } from './shared-hover-indicator';
import './catalog.css';

const categoryLabel = (value: string) => {
  if (value === 'ai') return 'AI';
  if (value === '3d') return '3D';
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
const categories = [...new Set(components.flatMap((component) => component.types))];

export function meta() {
  return [
    { title: 'Components — ReactDrops' },
    {
      name: 'description',
      content:
        'Explore the ReactDrops catalog of creative React components, animations, and visual effects.',
    },
  ];
}

export default function ComponentsPage() {
  const [category, setCategory] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const filterToolbar = useRef<HTMLDivElement>(null);
  const filterBar = useRef<HTMLDivElement>(null);
  const searchSurface = useRef<HTMLDivElement>(null);
  const searchBody = useRef<HTMLDivElement>(null);
  const searchIcon = useRef<SVGSVGElement>(null);
  const closeIcon = useRef<SVGSVGElement>(null);
  const search = query.trim().toLocaleLowerCase();
  const filteredComponents = components.filter(
    (component) =>
      (category === 'all' || component.types.includes(category)) &&
      [
        component.name,
        component.description,
        component.family.name,
        ...component.types,
        ...component.styles,
      ].some((value) => value.toLocaleLowerCase().includes(search)),
  );
  const featuredComponents = filteredComponents.filter((component) => component.featured);
  const showLatest = components.length > 1 && featuredComponents.length > 0;
  const heading = search
    ? 'Search Results'
    : category === 'all'
      ? 'All Components'
      : `${categoryLabel(category)} Components`;

  useEffect(() => {
    if (!filterBar.current) return;
    return createSharedHoverIndicator(filterBar.current, {
      itemSelector: '.components-filter-button',
      activeSelector: '.components-filter-button[aria-pressed="true"]',
      matchBorderRadius: true,
    });
  }, []);

  useEffect(() => {
    const toolbar = filterToolbar.current;
    const surface = searchSurface.current;
    const body = searchBody.current;
    const magnifier = searchIcon.current;
    const close = closeIcon.current;
    const toggle = searchToggle.current;
    if (!toolbar || !surface || !body || !magnifier || !close || !toggle) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: gsap.core.Timeline | undefined;
    let previousWidth = toolbar.clientWidth;
    const targetWidth = () =>
      searchOpen
        ? Math.min(
            300,
            Math.max(
              toggle.offsetWidth,
              toolbar.clientWidth - 76 - parseFloat(getComputedStyle(toolbar).columnGap),
            ),
          )
        : toggle.offsetWidth;
    const focusSearch = () => {
      if (searchOpen) searchInput.current?.focus({ preventScroll: true });
    };
    const animate = () => {
      animation?.kill();
      gsap.killTweensOf(surface);
      const bodyMotion = { autoAlpha: searchOpen ? 1 : 0, x: searchOpen ? 0 : 12 };
      const magnifierMotion = {
        autoAlpha: searchOpen ? 0 : 1,
        scale: searchOpen ? 0.65 : 1,
        rotation: searchOpen ? -45 : 0,
      };
      const closeMotion = {
        autoAlpha: searchOpen ? 1 : 0,
        scale: searchOpen ? 1 : 0.65,
        rotation: searchOpen ? 0 : 45,
      };
      gsap.set([magnifier, close], { transformOrigin: '50% 50%' });
      if (preference.matches) {
        gsap.set(surface, { width: targetWidth() });
        gsap.set(body, bodyMotion);
        gsap.set(magnifier, magnifierMotion);
        gsap.set(close, closeMotion);
        focusSearch();
        return;
      }
      // Width moves the anchored right edge left and leaves the filter rail
      // free to shrink. New requests continue from the current animation.
      animation = gsap
        .timeline({ defaults: { ease: 'power4.out' }, onComplete: focusSearch })
        .to(surface, { width: targetWidth(), duration: 0.65 }, 0)
        .to(body, { ...bodyMotion, duration: searchOpen ? 0.4 : 0.18 }, searchOpen ? 0.06 : 0)
        .to(magnifier, { ...magnifierMotion, duration: 0.45 }, 0)
        .to(close, { ...closeMotion, duration: 0.45 }, 0);
    };
    animate();
    const resize = new ResizeObserver(() => {
      if (toolbar.clientWidth === previousWidth) return;
      previousWidth = toolbar.clientWidth;
      if (!searchOpen) return;
      if (preference.matches) gsap.set(surface, { width: targetWidth() });
      else
        gsap.to(surface, {
          width: targetWidth(),
          duration: 0.35,
          ease: 'power4.out',
          overwrite: 'auto',
        });
    });
    resize.observe(toolbar);
    preference.addEventListener('change', animate);
    return () => {
      resize.disconnect();
      preference.removeEventListener('change', animate);
      animation?.kill();
      gsap.killTweensOf([surface, body, magnifier, close]);
    };
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    searchToggle.current?.focus({ preventScroll: true });
  };

  return (
    <main className="components-library-page">
      <CatalogSidebar />

      <article className="components-document" id="components">
        <header className="components-document-header" id="introduction">
          <div>
            <p className="components-document-kicker">ReactDrops Library</p>
            <h1>Components</h1>
            <p className="components-document-intro">
              Here you’ll find every component available in the library. Each drop includes a live
              preview, controls, source, and installation.
            </p>
          </div>
        </header>

        <div className="components-catalog-filters">
          <div ref={filterToolbar} className="components-filter-toolbar">
            <div
              ref={filterBar}
              className="components-filter-bar"
              role="group"
              aria-label="Filter components by category"
            >
              <span
                className="components-filter-hover-indicator"
                data-shared-hover-indicator
                aria-hidden="true"
              />
              {['all', ...categories].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="components-filter-button"
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                >
                  {value === 'all' ? 'All' : categoryLabel(value)}
                </button>
              ))}
            </div>
            <div ref={searchSurface} className="components-catalog-search">
              <div
                ref={searchBody}
                className="components-filter-search-body"
                id="components-catalog-search"
                aria-hidden={!searchOpen}
                inert={!searchOpen}
              >
                <input
                  ref={searchInput}
                  type="search"
                  aria-label="Search components"
                  placeholder="Search components…"
                  disabled={!searchOpen}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closeSearch();
                  }}
                />
              </div>
              <button
                ref={searchToggle}
                type="button"
                className="components-filter-search-toggle"
                aria-label={searchOpen ? 'Close search' : 'Search components'}
                aria-expanded={searchOpen}
                aria-controls="components-catalog-search"
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              >
                <svg ref={searchIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.5 15.5 4.5 4.5" />
                </svg>
                <svg
                  ref={closeIcon}
                  className="components-filter-close-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
          <span className="sr-only" role="status">
            {filteredComponents.length}{' '}
            {filteredComponents.length === 1 ? 'component' : 'components'} found
          </span>
        </div>

        {showLatest && (
          <section className="components-document-section" id="latest-drops">
            <h2>Latest Drops</h2>
            <div className="components-card-grid">
              {featuredComponents.map((component) => (
                <CatalogComponentCard component={component} key={component.slug} />
              ))}
            </div>
          </section>
        )}

        <section className="components-document-section" id="all-components">
          <h2>{heading}</h2>
          <div className="components-card-grid" aria-label="Published components">
            {filteredComponents.map((component) => (
              <CatalogComponentCard component={component} key={component.slug} />
            ))}
          </div>
          {filteredComponents.length === 0 && (
            <div className="components-empty-state">
              <p>No components found. Try another search or category.</p>
            </div>
          )}
        </section>
      </article>

      <aside className="components-right-sidebar">
        <nav aria-label="On this page">
          <p className="components-sidebar-label">On This Page</p>
          {showLatest && <a href="#latest-drops">Latest Drops</a>}
          <a href="#all-components">{heading}</a>
        </nav>
      </aside>
    </main>
  );
}
