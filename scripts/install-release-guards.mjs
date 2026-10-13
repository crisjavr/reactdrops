import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
execFileSync(process.execPath, [resolve(root, 'scripts/check-public-files.mjs')], {
  stdio: 'inherit',
});
const gitRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel']).toString().trim();
if (gitRoot !== root)
  throw new Error(
    'Initialize Git inside reactdrops-open-source so the private workspace stays separate.',
  );
const hooks = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'])
  .toString()
  .trim();
const directory = resolve(root, hooks);
mkdirSync(directory, { recursive: true });
for (const name of ['pre-commit', 'pre-push']) {
  const target = resolve(directory, name);
  const legacy = '#!/bin/sh\nnode scripts/check-public-files.mjs\n';
  const content =
    '#!/bin/sh\nset -e\nnode scripts/check-public-files.mjs\n' +
    (name === 'pre-push' ? 'node scripts/check-package-contents.mjs\n' : '');
  if (existsSync(target) && ![legacy, content].includes(readFileSync(target, 'utf8')))
    throw new Error(
      `Existing ${name} hook preserved. Add node scripts/check-public-files.mjs to it manually.`,
    );
  writeFileSync(target, content, { mode: 0o755 });
}
console.log('Installed local pre-commit and pre-push guards.');
