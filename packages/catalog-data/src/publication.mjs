/** Shared by the catalog, route configuration, and registry builds. */
export function isPublishedComponent(component) {
  return (
    component.status === 'published' &&
    component.visibility === 'catalog' &&
    component.access === 'free'
  );
}

export function componentPath(component) {
  return `/components/${component.family.slug}/${component.slug}`;
}
