import { copyFile, mkdir, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogEntries, publishedEntries } from './catalog-manifest.mjs';

export async function syncRegistry(targetDirectory, { includeDrafts = false } = {}) {
  const sourceDirectory = resolve(import.meta.dirname, '../registry');
  const entries = includeDrafts ? catalogEntries() : publishedEntries();
  const registryFiles = new Set(entries.map(({ metadata }) => `${metadata.slug}.json`));
  await mkdir(targetDirectory, { recursive: true });
  // Preserve previous downloads outside public/ so old JSON cannot leak into a build.
  const staleFiles = (await readdir(targetDirectory)).filter(
    (file) => file.endsWith('.json') && !registryFiles.has(file),
  );
  if (staleFiles.length) {
    const archive = resolve(
      import.meta.dirname,
      '../.registry-archive',
      `${Date.now()}-${crypto.randomUUID()}`,
    );
    await mkdir(archive, { recursive: true });
    for (const file of staleFiles)
      await rename(resolve(targetDirectory, file), resolve(archive, file));
    console.log(`Preserved ${staleFiles.length} inactive registry files in ${archive}`);
  }
  for (const file of registryFiles)
    await copyFile(resolve(sourceDirectory, file), resolve(targetDirectory, file));
  console.log(`Synced ${registryFiles.size} registry item(s) to ${targetDirectory}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const targetArgument = process.argv[2];
  if (!targetArgument) throw new Error('Provide a registry destination directory.');
  await syncRegistry(resolve(process.cwd(), targetArgument), {
    includeDrafts: process.argv.includes('--development'),
  });
}
