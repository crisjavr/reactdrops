import { readFileSync, readdirSync } from 'node:fs';
import { isPublishedComponent } from '../packages/catalog-data/src/publication.mjs';

export function catalogEntries() {
  const directory = new URL('../packages/catalog-data/src/components/', import.meta.url);
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      sourceSlug: file.slice(0, -5),
      metadata: JSON.parse(readFileSync(new URL(file, directory), 'utf8')),
    }));
}

export function publishedEntries() {
  return catalogEntries().filter(({ metadata }) => isPublishedComponent(metadata));
}
