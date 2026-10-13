import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import ComponentsPage from '@reactdrops/catalog-ui/pages/components';
import { publishedCatalogRoutes } from './generated/published-routes';
import './styles.css';

function CatalogApp() {
  return (
    <BrowserRouter>
      <div className="catalog-surface">
        <header className="catalog-navbar">
          <Link className="catalog-brand" to="/components">
            ReactDrops
          </Link>
          <nav aria-label="Catalog navigation">
            <Link to="/components">Components</Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Navigate replace to="/components" />} />
          <Route path="/components" element={<ComponentsPage />} />
          {publishedCatalogRoutes.map(({ path, Page }) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={null}>
                  <Page />
                </Suspense>
              }
            />
          ))}
          <Route
            path="/components/ai/fluid-agent-orb"
            element={<Navigate replace to="/components/ai/liquid-glass-orb" />}
          />
          <Route
            path="*"
            element={
              <main>
                <h1>Page not found</h1>
                <Link to="/components">Browse components</Link>
              </main>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CatalogApp />
  </StrictMode>,
);
