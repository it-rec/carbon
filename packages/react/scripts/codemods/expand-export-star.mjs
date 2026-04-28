#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Codemod: replace `export * from './X'` with `export { Foo, Bar, type Baz }
 * from './X'` so each barrel file has a known, finite list of re-exports.
 *
 * Why: under tree-shaking, `export *` requires bundlers to resolve the wildcard
 * to determine what's exported. Most modern bundlers handle this, but explicit
 * re-export lists are simpler to analyze, harder to break with future
 * refactors, and give downstream tools (e.g. linting, dependency-cruiser, IDEs)
 * a stable surface to read.
 *
 * Skipped:
 *   - `export * as ns from './X'` (namespace re-exports — fundamentally
 *     different shape; we leave them alone)
 *   - default exports (not picked up by `export *`, never re-exported here)
 *
 * Usage:
 *   node scripts/codemods/expand-export-star.mjs <file...>          # write
 *   node scripts/codemods/expand-export-star.mjs --check <file...>  # dry run
 *
 * Run via `yarn codemod:expand-export-star` to target every barrel under src/.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'];

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function hasExportModifier(node) {
  return node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function getExportedNames(file, seen = new Set()) {
  if (seen.has(file)) return { values: new Set(), types: new Set() };
  seen.add(file);

  const code = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') || file.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  const values = new Set();
  const types = new Set();

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      const isTypeOnly = !!stmt.isTypeOnly;

      if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
        const name = stmt.exportClause.name.text;
        (isTypeOnly ? types : values).add(name);
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const elem of stmt.exportClause.elements) {
          const name = elem.name.text;
          if (name === 'default') continue;
          const elemTypeOnly = !!elem.isTypeOnly;
          (isTypeOnly || elemTypeOnly ? types : values).add(name);
        }
      } else if (
        stmt.moduleSpecifier &&
        ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        // `export * from '...'` — recurse
        const target = resolveSpecifier(file, stmt.moduleSpecifier.text);
        if (target) {
          const sub = getExportedNames(target, seen);
          for (const n of sub.values) values.add(n);
          for (const n of sub.types) types.add(n);
        }
      }
      continue;
    }

    if (!hasExportModifier(stmt)) continue;

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) values.add(decl.name.text);
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      values.add(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      values.add(stmt.name.text);
    } else if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
      types.add(stmt.name.text);
    } else if (ts.isTypeAliasDeclaration(stmt) && stmt.name) {
      types.add(stmt.name.text);
    } else if (ts.isEnumDeclaration(stmt) && stmt.name) {
      // enum is both a value and a type
      values.add(stmt.name.text);
      types.add(stmt.name.text);
    } else if (
      ts.isModuleDeclaration(stmt) &&
      stmt.name &&
      ts.isIdentifier(stmt.name)
    ) {
      values.add(stmt.name.text);
    }
  }

  return { values, types };
}

function collectAlreadyExported(sourceFile) {
  const seenValues = new Set();
  const seenTypes = new Set();
  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (!stmt.exportClause) continue; // `export * from` — handled by expansion
      if (ts.isNamespaceExport(stmt.exportClause)) {
        const set = stmt.isTypeOnly ? seenTypes : seenValues;
        set.add(stmt.exportClause.name.text);
        continue;
      }
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const elem of stmt.exportClause.elements) {
          const name = elem.name.text;
          if (name === 'default') continue;
          const set =
            stmt.isTypeOnly || elem.isTypeOnly ? seenTypes : seenValues;
          set.add(name);
        }
      }
      continue;
    }
    if (!hasExportModifier(stmt)) continue;
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) seenValues.add(decl.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name
    ) {
      seenValues.add(stmt.name.text);
    } else if (
      (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) &&
      stmt.name
    ) {
      seenTypes.add(stmt.name.text);
    } else if (ts.isEnumDeclaration(stmt) && stmt.name) {
      seenValues.add(stmt.name.text);
      seenTypes.add(stmt.name.text);
    }
  }
  return { seenValues, seenTypes };
}

function transformFile(file, { check } = {}) {
  const code = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') || file.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  );

  // Track names already exported in this file by non-`export *` declarations,
  // and names contributed by previous `export *` expansions in this same
  // codemod pass. Both rule out duplicates that TypeScript would reject.
  const { seenValues, seenTypes } = collectAlreadyExported(sourceFile);

  const replacements = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier))
      continue;
    if (stmt.exportClause) continue; // `export * as ns` or `export { ... }`

    const specifier = stmt.moduleSpecifier.text;
    const target = resolveSpecifier(file, specifier);
    if (!target) {
      console.warn(`  ! could not resolve ${specifier} (in ${file})`);
      continue;
    }

    const { values, types } = getExportedNames(target);

    const valueList = [...values].filter((v) => !seenValues.has(v)).sort();
    const typeList = [...types]
      .filter((t) => !values.has(t))
      .filter((t) => !seenTypes.has(t) && !seenValues.has(t))
      .sort();

    for (const v of valueList) seenValues.add(v);
    for (const t of typeList) seenTypes.add(t);

    if (valueList.length === 0 && typeList.length === 0) {
      // Nothing left after dedup — drop the wildcard since every name it
      // would have re-exported is already reachable from an earlier export.
      replacements.push({
        start: stmt.getStart(sourceFile),
        end: stmt.getEnd(),
        replacement: '',
      });
      continue;
    }

    const items = [...valueList, ...typeList.map((t) => `type ${t}`)];
    const replacement = `export { ${items.join(', ')} } from '${specifier}';`;

    replacements.push({
      start: stmt.getStart(sourceFile),
      end: stmt.getEnd(),
      replacement,
    });
  }

  if (replacements.length === 0) return false;

  replacements.sort((a, b) => b.start - a.start);
  let next = code;
  for (const r of replacements) {
    next = next.slice(0, r.start) + r.replacement + next.slice(r.end);
  }

  if (check) {
    if (next !== code) {
      console.error(`Would change: ${file}`);
      return true;
    }
    return false;
  }

  writeFileSync(file, next);
  return true;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));

if (files.length === 0) {
  console.error(
    'Usage: node scripts/codemods/expand-export-star.mjs [--check] <file...>'
  );
  process.exit(1);
}

let dirty = 0;
for (const file of files) {
  if (transformFile(file, { check })) {
    if (!check) console.log(`updated: ${file}`);
    dirty++;
  }
}

if (check && dirty > 0) {
  console.error(
    `${dirty} file(s) need updating. Run without --check to apply.`
  );
  process.exit(1);
}
