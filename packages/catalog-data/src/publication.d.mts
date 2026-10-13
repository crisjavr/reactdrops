import type { ComponentMetadata } from '@reactdrops/component-schema';

export function isPublishedComponent(
  component: Pick<ComponentMetadata, 'status' | 'visibility' | 'access'>,
): boolean;
export function componentPath(component: Pick<ComponentMetadata, 'family' | 'slug'>): string;
