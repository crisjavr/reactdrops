import type { ComponentMetadata } from '@reactdrops/component-schema';
import liquidGlassLogoJson from './components/liquid-glass-logo.json';
import fluidAgentOrbJson from './components/fluid-agent-orb.json';
import topographicTerrainJson from './components/topographic-terrain.json';
import fanGalleryJson from './components/fan-gallery.json';
import shapePhysicsJson from './components/shape-physics.json';
import topographicFlowJson from './components/topographic-flow.json';
import chromaticButtonJson from './components/chromatic-button.json';
import { isPublishedComponent } from './publication.mjs';
export type { ComponentMetadata } from '@reactdrops/component-schema';
export { isPublishedComponent, componentPath } from './publication.mjs';
export const fluidAgentOrb = fluidAgentOrbJson as ComponentMetadata;
export const liquidGlassOrb = fluidAgentOrb;
export const topographicTerrain = topographicTerrainJson as ComponentMetadata;
export const fanGallery = fanGalleryJson as ComponentMetadata;
export const shapePhysics = shapePhysicsJson as ComponentMetadata;
export const topographicFlow = topographicFlowJson as ComponentMetadata;
export const chromaticButton = chromaticButtonJson as ComponentMetadata;
export const liquidGlassLogo = liquidGlassLogoJson as ComponentMetadata;
export const components = [
  liquidGlassLogo,
  fluidAgentOrb,
  topographicTerrain,
  fanGallery,
  shapePhysics,
  topographicFlow,
  chromaticButton,
].filter(isPublishedComponent);
export const publishedComponents = components;
export const visibleComponents = components;
