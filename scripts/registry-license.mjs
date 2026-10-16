import { readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const licenseName = 'ReactDrops Component License 1.0';
export const licenseUrl = 'https://reactdrops.dev/license.txt';
export const licenseText = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
export const licenseHeader = `/*!\n${licenseText.trimEnd()}\n*/\n\n`;

export function withReactDropsLicense(content) {
  return content.startsWith(licenseHeader) ? content : licenseHeader + content;
}

export async function syncLicenseFiles(root) {
  const destinations = [
    'apps/catalog/LICENSE',
    'apps/catalog/public/license.txt',
    'apps/catalog/public-release/license.txt',
    'packages/components/LICENSE',
    'packages/catalog-ui/LICENSE',
    'packages/catalog-data/LICENSE',
    'packages/component-schema/LICENSE',
  ];
  for (const file of destinations) {
    const target = resolve(root, file);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(resolve(root, 'LICENSE'), target);
  }
}
