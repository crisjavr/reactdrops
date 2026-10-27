import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, relative, dirname } from 'node:path';
import ts from 'typescript';
import { publishedEntries } from './catalog-manifest.mjs';
import { checkPackageFileLists, checkPackageLicenses } from './check-package-contents.mjs';
import { licenseName, licenseUrl, licenseHeader } from './registry-license.mjs';
import { secretPathPattern, secretPatterns } from './secret-patterns.mjs';

const root = resolve(import.meta.dirname, '..');
export function checkPublicFiles({ auditGit = true } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public-files.json'), 'utf8'));
  const allowed = new Set(manifest.files);
  assert.ok(Array.isArray(manifest.components) && manifest.components.length > 0);
  assert.equal(
    new Set(manifest.components).size,
    manifest.components.length,
    'Duplicate public component',
  );
  assert.equal(allowed.size, manifest.files.length, 'Duplicate public file');

  const sensitivePatterns = [
    ...secretPatterns,
    [
      'local user path',
      /(?:\/Users\/|\/home\/|\/var\/folders\/|\/private\/var\/|[A-Z]:\\Users\\)[A-Za-z0-9_.-]+[\/\\]/,
    ],
  ];

  function checkContent(bytes, file, label) {
    // Color profiles are supported; location and author metadata are excluded.
    if (file.endsWith('.webp')) {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `Invalid image: ${label}: ${file}`);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `Invalid image: ${label}: ${file}`);
      assert.equal(
        bytes.readUInt32LE(4) + 8,
        bytes.length,
        `Trailing image data: ${label}: ${file}`,
      );
      for (let offset = 12; offset < bytes.length;) {
        assert.ok(offset + 8 <= bytes.length, `Invalid image chunk: ${label}: ${file}`);
        const chunk = bytes.toString('ascii', offset, offset + 4);
        assert.ok(!['EXIF', 'XMP '].includes(chunk), `Image metadata in ${label}: ${file}`);
        assert.ok(
          ['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'].includes(chunk),
          `Unknown image payload in ${label}: ${file}`,
        );
        const length = bytes.readUInt32LE(offset + 4);
        offset += 8 + length + (length % 2);
        assert.ok(offset <= bytes.length, `Invalid image size: ${label}: ${file}`);
      }
      return;
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    function scan(value) {
      if (typeof value === 'string') {
        for (const [category, pattern] of sensitivePatterns) {
          assert.ok(!pattern.test(value), `${category} in ${label}: ${file}`);
        }
      } else if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) scan(nested);
      }
    }
    scan(content);
    if (file.endsWith('.json')) scan(JSON.parse(content));
  }

  const physicalRoot = realpathSync(root);
  for (const file of allowed) {
    assert.ok(!file.startsWith('/') && !file.split('/').includes('..'), file);
    assert.ok(!secretPathPattern.test(file), `Secret file in public allowlist: ${file}`);
    assert.ok(
      lstatSync(resolve(root, file)).isFile(),
      `Public file must be a regular file: ${file}`,
    );
    assert.equal(
      realpathSync(resolve(root, file)),
      resolve(physicalRoot, file),
      `Symlink path: ${file}`,
    );
    checkContent(readFileSync(resolve(root, file)), file, 'working tree');
  }
  checkPackageFileLists(allowed, (file) => readFileSync(resolve(root, file)));
  checkPackageLicenses((file) => readFileSync(resolve(root, file)));
  // Reject a dependency on unreviewed source before it can be committed.
  const packages = new Map(
    ['components', 'catalog-ui', 'catalog-data', 'component-schema'].map((name) => {
      const directory = `packages/${name}`;
      return [
        `@reactdrops/${name}`,
        {
          directory,
          exports: JSON.parse(readFileSync(resolve(root, directory, 'package.json'), 'utf8'))
            .exports,
        },
      ];
    }),
  );
  function publicDependency(path, importer) {
    for (const suffix of ['', '.ts', '.tsx', '.mjs', '.json', '.css', '/index.ts', '/index.tsx']) {
      const file = relative(root, path + suffix).replaceAll('\\', '/');
      if (allowed.has(file)) return;
    }
    throw new Error(`Unapproved source dependency in ${importer}: ${relative(root, path)}`);
  }
  function checkSourceImports(file, content, packageEntries = packages) {
    if (file.endsWith('.css')) {
      const assets = content
        .toString('utf8')
        .matchAll(/(?:url\(\s*|@import\s+)["']?([^\s"')]+)["']?/g);
      for (const [, id] of assets) {
        if (!/^(?:[a-z]+:|\/|#)/i.test(id)) {
          publicDependency(resolve(root, dirname(file), id.split(/[?#]/)[0]), file);
        }
      }
      return;
    }
    if (!/\.(?:ts|tsx|mjs|mts)$/.test(file)) return;
    const imports = ts.preProcessFile(content.toString('utf8'), true, true).importedFiles;
    for (const { fileName: id } of imports) {
      if (id.startsWith('.')) publicDependency(resolve(root, dirname(file), id), file);
      else if (id.startsWith('@reactdrops/')) {
        const [name, entry] =
          [...packageEntries].find(([name]) => id === name || id.startsWith(name + '/')) ?? [];
        assert.ok(entry, `Unknown workspace package ${id}`);
        const key = id === name ? '.' : '.' + id.slice(name.length);
        let target = entry.exports[key];
        if (!target) {
          const wildcard = Object.keys(entry.exports).find(
            (pattern) =>
              pattern.includes('*') &&
              key.startsWith(pattern.split('*')[0]) &&
              key.endsWith(pattern.split('*')[1]),
          );
          if (wildcard) {
            const [prefix, suffix] = wildcard.split('*');
            target = entry.exports[wildcard].replace(
              '*',
              key.slice(prefix.length, key.length - suffix.length),
            );
          }
        }
        assert.ok(target, `Unapproved public export ${id} in ${file}`);
        publicDependency(resolve(root, entry.directory, target), file);
      }
    }
  }
  for (const file of allowed) checkSourceImports(file, readFileSync(resolve(root, file)));
  function check(files, label, approved = allowed) {
    // Secret files stay rejected even if someone adds them to the allowlist.
    for (const file of files) {
      assert.ok(!secretPathPattern.test(file), `Secret file in ${label}: ${file}`);
    }
    const unexpected = files.filter((file) => file && !approved.has(file));
    assert.deepEqual(
      unexpected,
      [],
      `${label}: unapproved paths. Preserve these privately before publishing.`,
    );
  }
  // Use a temporary Git database to audit exactly what a fresh git add would include.
  if (auditGit) {
    // Hooks inherit GIT_INDEX_FILE and other repository-local variables. The
    // fresh-repository audit must use its own empty index; the real index audit
    // below intentionally keeps the hook environment (including partial commits).
    const freshGitEnvironment = { ...process.env };
    for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
      .trim()
      .split('\n')) {
      delete freshGitEnvironment[key];
    }
    const temporary = mkdtempSync(resolve(tmpdir(), 'reactdrops-git-audit-'));
    try {
      execFileSync('git', ['init', '--quiet', temporary], { env: freshGitEnvironment });
      const files = execFileSync(
        'git',
        [
          `--git-dir=${temporary}/.git`,
          `--work-tree=${root}`,
          'ls-files',
          '--others',
          '--exclude-standard',
          '-z',
        ],
        { maxBuffer: 10 * 1024 * 1024, env: freshGitEnvironment },
      )
        .toString()
        .split('\0')
        .filter(Boolean);
      check(files, 'Fresh repository');
      assert.deepEqual(
        [...files].sort(),
        [...allowed].sort(),
        'The Git selection must match the reviewed allowlist exactly',
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
    // Ignore rules do not protect files already tracked or committed. Audit both.
    let repository;
    try {
      repository = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {}
    if (repository) {
      assert.equal(repository, root, 'Git must be initialized inside the public project.');
      const git = (args) =>
        execFileSync('git', ['-C', repository, ...args], {
          maxBuffer: 20 * 1024 * 1024,
        }).toString();
      const staged = git(['ls-files', '--stage', '-z'])
        .split('\0')
        .filter(Boolean)
        .map((record) => {
          const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(record);
          assert.ok(match, 'Invalid Git index record');
          const [, mode, oid, stage, file] = match;
          assert.equal(stage, '0', `Unresolved merge in ${file}`);
          assert.ok(['100644', '100755'].includes(mode), `Non-regular staged file: ${file}`);
          return { oid, file };
        });
      check(
        staged.map(({ file }) => file),
        'Tracked/staged files',
      );

      // Renamed release files remain in Git history. Audit those paths against
      // previously reviewed manifests; the working tree and index still use
      // only the current allowlist. Secret and content checks apply to both.
      const historicalAllowed = new Set(allowed);
      const manifestCommits = git(['log', '--all', '--format=%H', '--', 'public-files.json'])
        .trim().split('\n').filter(Boolean);
      for (const commit of manifestCommits) {
        const previous = JSON.parse(git(['show', `${commit}:public-files.json`]));
        assert.ok(Array.isArray(previous.files), 'Invalid historical public manifest');
        for (const file of previous.files) {
          assert.equal(typeof file, 'string', 'Invalid historical public path');
          assert.ok(!secretPathPattern.test(file), `Secret path in historical manifest: ${file}`);
          historicalAllowed.add(file);
        }
      }

      // Read index blobs instead of trusting a newer working copy of the file.
      function readObjects(records, label, history = false) {
        const contents = new Map();
        if (!records.length) return contents;
        const output = execFileSync('git', ['-C', repository, 'cat-file', '--batch'], {
          input: records.map(({ oid }) => oid).join('\n') + '\n',
          maxBuffer: 128 * 1024 * 1024,
        });
        let offset = 0;
        for (const { oid, file } of records) {
          const end = output.indexOf(10, offset);
          const header = output.toString('ascii', offset, end).split(' ');
          assert.equal(header[0], oid, 'Unexpected Git object');
          const [, type, length] = header;
          assert.ok(/^\d+$/.test(length), 'Missing Git object');
          const size = Number(length);
          const bytes = output.subarray(end + 1, end + 1 + size);
          offset = end + 1 + size + 1;
          if (type === 'blob') {
            assert.ok(file, `Unmapped blob in ${label}`);
            check([file], label, history ? historicalAllowed : allowed);
            checkContent(bytes, file, label);
            if (!history) contents.set(file, bytes);
          } else if (history && type === 'tag') {
            checkContent(bytes, 'tag metadata', label);
          } else if (history && type === 'commit') {
            const entries = git(['ls-tree', '-r', '--full-tree', '-z', oid])
              .split('\0')
              .filter(Boolean)
              .map((record) => {
                const match = /^(\d+) (\w+) [a-f0-9]+\t([\s\S]+)$/.exec(record);
                assert.ok(match, 'Invalid Git tree record');
                const [, mode, entryType, path] = match;
                assert.ok(
                  ['100644', '100755'].includes(mode) && entryType === 'blob',
                  `Non-regular file in history: ${path}`,
                );
                return path;
              });
            check(entries, label, historicalAllowed);
            checkContent(bytes, 'commit metadata', label);
          }
        }
        return contents;
      }
      const stagedContents = readObjects(staged, 'staged content');
      if (staged.length) {
        const readStaged = (file) => {
          assert.ok(stagedContents.has(file), `Missing reviewed staged file: ${file}`);
          return stagedContents.get(file);
        };
        const stagedManifest = JSON.parse(readStaged('public-files.json').toString('utf8'));
        assert.deepEqual(
          [...stagedManifest.files].sort(),
          [...allowed].sort(),
          'Staged manifest differs from reviewed files',
        );
        assert.deepEqual(
          stagedManifest.components,
          manifest.components,
          'Staged release list differs from reviewed components',
        );
        checkPackageFileLists(allowed, readStaged);
        checkPackageLicenses(readStaged);
        const stagedPackages = new Map(
          [...packages].map(([name, entry]) => [
            name,
            {
              ...entry,
              exports: JSON.parse(readStaged(entry.directory + '/package.json').toString('utf8'))
                .exports,
            },
          ]),
        );
        for (const file of allowed) checkSourceImports(file, readStaged(file), stagedPackages);
      }
      const history = git(['rev-list', '--objects', '--all'])
        .split('\n')
        .filter(Boolean)
        .map((record) => {
          const space = record.indexOf(' ');
          return space === -1
            ? { oid: record, file: '' }
            : { oid: record.slice(0, space), file: record.slice(space + 1) };
        });
      const tagObjects = git(['for-each-ref', '--format=%(objectname) %(objecttype)', 'refs/tags'])
        .split('\n')
        .filter(Boolean)
        .filter((entry) => entry.endsWith(' tag'))
        .map((entry) => ({ oid: entry.split(' ')[0], file: '' }));
      const seen = new Set(history.map(({ oid }) => oid));
      readObjects(
        [...history, ...tagObjects.filter(({ oid }) => !seen.has(oid))],
        'reachable Git history',
        true,
      );
    }
  }
  const entries = publishedEntries();
  assert.deepEqual(
    entries.map(({ metadata }) => metadata.slug).sort(),
    [...manifest.components].sort(),
    'Published components must match the reviewed release list',
  );
  for (const { sourceSlug, metadata } of entries) {
    assert.ok(allowed.has(`packages/catalog-data/src/components/${sourceSlug}.json`));
    for (const directory of ['registry', 'apps/catalog/public-release/r']) {
      const registry = JSON.parse(
        readFileSync(resolve(root, directory, `${metadata.slug}.json`), 'utf8'),
      );
      assert.equal(registry.name, metadata.slug);
      assert.equal(registry.title, metadata.name);
      assert.equal(registry.meta.version, metadata.version);
      assert.equal(registry.meta.drop, metadata.drop);
      assert.equal(registry.meta.license, licenseName);
      assert.equal(registry.meta.licenseUrl, licenseUrl);
      for (const file of registry.files) {
        assert.ok(
          file.content.startsWith(licenseHeader),
          `Missing license: ${metadata.slug}/${file.path}`,
        );
      }
    }
  }
  for (const directory of ['registry', 'apps/catalog/public-release/r']) {
    // Only reviewed registry items may be included by Git.
    assert.deepEqual(
      manifest.files.filter((file) => file.startsWith(directory + '/')).sort(),
      manifest.components.map((slug) => `${directory}/${slug}.json`).sort(),
    );
  }
  console.log(
    auditGit
      ? `PASS: ${allowed.size} reviewed files; Git selection, staged content, reachable history and image metadata checked.`
      : `PASS: ${allowed.size} reviewed files; dependencies, credentials, package file lists and image metadata checked.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'This command does not accept arguments.');
  checkPublicFiles();
}
