#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Regenerates the `exports` field in package.json from src/components/*.
 *
 * Each top-level component directory whose index.{ts,tsx,js,jsx} is reachable
 * from src/index.ts becomes a subpath:
 *
 *   "./Button": {
 *     "types":   "./es/components/Button/index.d.ts",
 *     "import":  "./es/components/Button/index.js",
 *     "require": "./lib/components/Button/index.js"
 *   }
 *
 * Passthrough wildcards for ./es/*, ./lib/*, ./scss/*, ./icons, ./index.scss,
 * and ./package.json keep every previously-reachable deep import working.
 *
 * Flags:
 *   --check   Exit non-zero if package.json would change. Used in CI / build.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { getComponentEntries } from './get-component-entries.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkgPath = join(root, 'package.json');

function buildExports() {
  const components = getComponentEntries().map((c) => c.name);

  const exportsMap = {
    '.': {
      types: './es/index.d.ts',
      import: './es/index.js',
      require: './lib/index.js',
    },
    './package.json': './package.json',
    './feature-flags': {
      types: './es/feature-flags.d.ts',
      import: './es/feature-flags.js',
      require: './lib/feature-flags.js',
    },
    './icons': {
      types: './icons/index.d.ts',
      import: './icons/index.esm.js',
      require: './icons/index.js',
    },
  };

  for (const name of components) {
    exportsMap[`./${name}`] = {
      types: `./es/components/${name}/index.d.ts`,
      import: `./es/components/${name}/index.js`,
      require: `./lib/components/${name}/index.js`,
    };
  }

  // Passthrough wildcards keep every previously-reachable deep import working.
  exportsMap['./index.scss'] = './index.scss';
  exportsMap['./scss/*'] = './scss/*';
  exportsMap['./scss/*.scss'] = './scss/*.scss';
  exportsMap['./es/*'] = './es/*';
  exportsMap['./es/*.js'] = './es/*.js';
  exportsMap['./lib/*'] = './lib/*';
  exportsMap['./lib/*.js'] = './lib/*.js';

  return { exportsMap, components };
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const check = argv.has('--check');

  const { exportsMap, components } = buildExports();
  const original = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(original);
  pkg.exports = exportsMap;

  const next = await prettier.format(JSON.stringify(pkg, null, 2), {
    filepath: pkgPath,
  });

  if (next === original) {
    console.log(
      `package.json exports already in sync (${components.length} components).`
    );
    return;
  }

  if (check) {
    console.error(
      'package.json exports are out of date. Run `node scripts/generate-exports.mjs` and commit the result.'
    );
    process.exit(1);
  }

  writeFileSync(pkgPath, next);
  console.log(
    `Updated package.json exports (${components.length} components).`
  );
}

await main();
