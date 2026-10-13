import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const packageDirectories = [
  '',
  'apps/catalog',
  'packages/components',
  'packages/catalog-ui',
  'packages/catalog-data',
  'packages/component-schema',
];

export function checkPackageFileLists(allowed, read) {
  for (const directory of packageDirectories) {
    const prefix = directory ? directory + '/' : '';
    const file = prefix + 'package.json';
    const metadata = JSON.parse(read(file).toString('utf8'));
    const expected = [...allowed]
      .filter((path) => path.startsWith(prefix) && path !== file)
      .map((path) => path.slice(prefix.length))
      .sort();
    assert.deepEqual(
      [...(metadata.files ?? [])].sort(),
      expected,
      `Package file list must match the reviewed manifest: ${file}`,
    );
  }
}

export function checkPackageContents(root) {
  const allowed = new Set(
    JSON.parse(readFileSync(resolve(root, 'public-files.json'), 'utf8')).files,
  );
  checkPackageFileLists(allowed, (file) => readFileSync(resolve(root, file)));
  for (const directory of packageDirectories) {
    const result = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--loglevel=error'], {
        cwd: resolve(root, directory),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
    for (const { path } of result[0].files) {
      const file = directory ? directory + '/' + path : path;
      assert.ok(allowed.has(file), `Unapproved archive file: ${file}`);
    }
  }
  console.log(`PASS: ${packageDirectories.length} package archives contain only reviewed files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkPackageContents(resolve(import.meta.dirname, '..'));
}
