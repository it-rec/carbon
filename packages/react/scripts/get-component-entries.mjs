/**
 * Returns the list of public component directories (the ones reachable from
 * src/index.ts) and the absolute path of each one's index file.
 *
 * Used by:
 *   - scripts/generate-exports.mjs to produce package.json `exports`
 *   - tasks/build.js to register every component as a tsdown entry, so the
 *     per-component subpath files keep their full named-export surface
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const componentsDir = join(root, 'src', 'components');
const barrelPath = join(root, 'src', 'index.ts');

const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

function findIndex(dir) {
  for (const filename of INDEX_FILES) {
    try {
      statSync(join(dir, filename));
      return filename;
    } catch {
      // not present, try next
    }
  }
  return null;
}

function isReachableFromBarrel(name, barrel) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `from\\s+['"]\\./components/${escaped}(?:/[\\w./-]+)?['"]`
  );
  return re.test(barrel);
}

export function getComponentEntries() {
  const barrel = readFileSync(barrelPath, 'utf8');
  return readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => isReachableFromBarrel(name, barrel))
    .map((name) => {
      const indexFile = findIndex(join(componentsDir, name));
      if (!indexFile) {
        return null;
      }
      return {
        name,
        absPath: join(componentsDir, name, indexFile),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}
