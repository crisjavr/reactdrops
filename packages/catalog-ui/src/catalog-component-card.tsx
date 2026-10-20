import type { ComponentMetadata } from '@reactdrops/catalog-data/catalog';
import { componentPath } from '@reactdrops/catalog-data/publication';
import { Link } from 'react-router';
import liquidGlassOrbPreview from './assets/liquid-glass-orb-preview.webp';
import topographicTerrainPreview from './assets/topographic-terrain-preview.webp';
import fanGalleryPreview from './assets/fan-gallery-preview.webp';
import shapePhysicsPreview from './assets/shape-physics-preview.webp';
import topographicFlowPreview from './assets/topographic-flow-preview.webp';
import chromaticButtonPreview from './assets/chromatic-button-preview.webp';

export function CatalogComponentCard({ component }: { component: ComponentMetadata }) {
  const isOrb = component.slug === 'liquid-glass-orb';
  const preview = isOrb
    ? liquidGlassOrbPreview
    : component.slug === 'topographic-terrain'
      ? topographicTerrainPreview
      : component.slug === 'fan-gallery'
        ? fanGalleryPreview
        : component.slug === 'shape-physics'
          ? shapePhysicsPreview
          : component.slug === 'topographic-flow'
            ? topographicFlowPreview
            : component.slug === 'chromatic-button'
              ? chromaticButtonPreview
              : null;
  return (
    <Link
      className="components-catalog-card is-static-preview"
      to={componentPath(component)}
      aria-label={`View ${component.name}`}
    >
      <span className="components-card-preview">
        {preview && (
          <img
            className="components-card-preview-image"
            src={preview}
            alt=""
            width={1280}
            height={isOrb ? 689 : 720}
            decoding="async"
          />
        )}
      </span>
      <span className="components-card-footer">
        <span className="components-card-copy">
          <strong>{component.name}</strong>
          <span>
            {component.family.name} · {component.access === 'free' ? 'Free' : 'Pro'}
          </span>
        </span>
        <span className="components-card-arrow">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 14 14 6M8 6h6v6" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
