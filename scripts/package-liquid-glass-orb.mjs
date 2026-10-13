import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { format } from 'prettier';

// Keep authoring modules intact; flatten their source for a two-file install.
// Dependency order matters for constants initialized at module load time.
const modules = [
  'fluid-glass-gradient/fluid-glass-gradient-shaders.ts',
  'fluid-glass-gradient/fluid-glass-gradient-renderer.ts',
  'shared/agent-orb-motion.ts',
  'fluid-agent-orb/fluid-agent-orb-search-curve.ts',
  'fluid-agent-orb/fluid-agent-orb-model.ts',
  'fluid-agent-orb/fluid-agent-orb-motion.ts',
  'fluid-agent-orb/fluid-agent-orb-patterns.ts',
  'fluid-agent-orb/fluid-agent-orb-entrance.ts',
  'fluid-glass-gradient/fluid-glass-gradient.tsx',
  'fluid-agent-orb/fluid-agent-orb.tsx',
  'liquid-glass-orb/liquid-glass-orb.tsx',
];

export async function packageLiquidGlassOrb(root, options) {
  const directory = resolve(root, 'packages/components/src');
  const approved = new Set(modules.map((path) => resolve(directory, path)));
  const imports = new Map();
  const declarations = new Set();
  const sections = [];
  const record = (name) => {
    assert.ok(!declarations.has(name), `Duplicate packaged binding: ${name}`);
    declarations.add(name);
  };
  for (const path of modules) {
    const content = await readFile(resolve(directory, path), 'utf8');
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    const body = [];
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) {
        const module = statement.moduleSpecifier.text;
        if (module.startsWith('.')) {
          if (!module.endsWith('.css')) {
            const target = resolve(directory, path, '..', module) + '.ts';
            assert.ok(
              approved.has(target) || approved.has(target + 'x'),
              `Unpackaged dependency: ${path} → ${module}`,
            );
          }
          continue;
        }
        const clause = statement.importClause;
        assert.ok(
          clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name,
          `Review external import in ${path}`,
        );
        const names = imports.get(module) ?? new Map();
        for (const specifier of clause.namedBindings.elements) {
          const name = specifier.name.text;
          const imported = specifier.propertyName?.text ?? name;
          const typeOnly = clause.isTypeOnly || specifier.isTypeOnly;
          const previous = names.get(name);
          assert.ok(!previous || previous.imported === imported, `Conflicting import: ${name}`);
          names.set(name, {
            imported,
            typeOnly: previous ? previous.typeOnly && typeOnly : typeOnly,
          });
        }
        imports.set(module, names);
        continue;
      }
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        const module = statement.moduleSpecifier.text;
        const target = resolve(directory, path, '..', module) + '.ts';
        assert.ok(
          approved.has(target) || approved.has(target + 'x'),
          `Unpackaged export: ${path} → ${module}`,
        );
        assert.ok(
          statement.exportClause && ts.isNamedExports(statement.exportClause),
          `Review wildcard export in ${path}`,
        );
        for (const specifier of statement.exportClause.elements) {
          const original = specifier.propertyName?.text ?? specifier.name.text;
          const alias = specifier.name.text;
          // Original declarations are already exported in the flattened file.
          if (original === alias) continue;
          record(alias);
          body.push(
            statement.isTypeOnly || specifier.isTypeOnly
              ? `export type ${alias} = ${original};`
              : `export const ${alias} = ${original};`,
          );
        }
        continue;
      }
      if (
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use client'
      )
        continue;
      const bindings = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations
        : ts.isFunctionDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement)
          ? [statement]
          : [];
      for (const binding of bindings)
        if (binding.name && ts.isIdentifier(binding.name)) record(binding.name.text);
      body.push(statement.getFullText(source).trim());
    }
    sections.push(`// ${path}\n${body.join('\n\n')}`);
  }
  const external = [...imports].map(
    ([module, names]) =>
      `import { ${[...names].map(([name, value]) => `${value.typeOnly ? 'type ' : ''}${value.imported}${value.imported === name ? '' : ` as ${name}`}`).join(', ')} } from ${JSON.stringify(module)};`,
  );
  const code = await format(
    `'use client';\n\n${external.join('\n')}\nimport './liquid-glass-orb.css';\n\n${sections.join('\n\n')}`,
    { ...options, parser: 'typescript' },
  );
  const css = await format(
    (
      await Promise.all(
        [
          'fluid-glass-gradient/fluid-glass-gradient.css',
          'fluid-agent-orb/fluid-agent-orb.css',
        ].map((path) => readFile(resolve(directory, path), 'utf8')),
      )
    ).join('\n'),
    { ...options, parser: 'css' },
  );
  return [
    {
      name: 'liquid-glass-orb.tsx',
      path: 'components/liquid-glass-orb.tsx',
      type: 'registry:ui',
      target: '@components/liquid-glass-orb.tsx',
      content: code,
    },
    {
      name: 'liquid-glass-orb.css',
      path: 'components/liquid-glass-orb.css',
      type: 'registry:ui',
      target: '@components/liquid-glass-orb.css',
      content: css,
    },
  ];
}
