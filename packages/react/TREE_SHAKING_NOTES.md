# Tree-shaking trajectory

Measurements come from `scripts/measure-tree-shaking.mjs`, which bundles two
fixture consumers (`__tree-shaking-fixture__/named.js` and `subpath.js`) with
esbuild in production mode (`minify`, `format=esm`, `NODE_ENV=production`).
React, ReactDOM and react-is are marked external so the numbers reflect the
contribution of `@carbon/react` and its non-peer dependencies only.

Run before each phase commit and append a row.

| Phase | Named import bytes | Subpath import bytes | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | -----------------: | -------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     |             52,329 |                  n/a | Baseline. Subpath unsupported yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1     |             52,329 |               52,070 | Subpath exports added. Each component dir is now a tsdown entry, preserving its named-export surface. Most of the gap to the named import will close in Phases 2–5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2     |             52,329 |               52,070 | PURE annotations applied via Rolldown plugin (1,326 sites across `es/`). No measurable change for the Button-only consumer because Button is the import target — annotations only trigger DCE when a wrapped component is unreferenced. Sets up later phases.                                                                                                                                                                                                                                                                                                                                                                                              |
| 3     |             52,329 |               52,070 | All 122 plain `export *` re-exports replaced with explicit named re-exports via `scripts/codemods/expand-export-star.mjs`. Exported-name set in `es/index.js` is byte-identical (362 names before/after). Bundle size unchanged because esbuild already tree-shook `export *` cleanly; the win is for less-capable bundlers and tooling clarity.                                                                                                                                                                                                                                                                                                           |
| 4     |             52,347 |               52,088 | Per-component `package.json` shims written into every `es/components/X/` and `lib/components/X/` (240 files). Each shim has `sideEffects: false` plus the correct `type` for the format. Net +18 bytes is build-graph noise from the new module-resolution path; the structural win (subtree-scoped side-effect guarantee for less-capable bundlers, e.g. webpack 4) is unchanged.                                                                                                                                                                                                                                                                         |
| 5     |             52,347 |               52,088 | Side-effect audit. Fixed the Phase 2 regex to handle TS generics (`createContext<T>(...)` etc.), bringing the annotation count from 1,326 → 1,434. Cleaned up stale entry `src/index.js` → `src/index.ts` in `package.json#sideEffects`. Documented the only intentional top-level effect (the `merge()` call that registers Carbon-React's feature-flag defaults). agadoo reports the only remaining real top-level effects are that `merge()` and `import 'copy-to-clipboard'` (an upstream dep that doesn't ship `sideEffects: false`). No further byte movement on this fixture; the audit's win is correctness for the annotations and configuration. |

## Migration note for downstream consumers

Most consumers benefit from these changes automatically: bundlers see more
precise side-effect information, more PURE annotations, and clearer module
boundaries with no source changes required.

Two opt-in wins:

1. **Subpath imports** — for maximum bundle savings, replace
   `import { Button } from '@carbon/react'` with
   `import Button from '@carbon/react/Button'` (or
   `import { Button, ButtonSkeleton } from '@carbon/react/Button'`). Every
   public component now has its own subpath; deep `es/`/`lib/` paths and SCSS
   imports keep working unchanged.

2. **Feature-flag defaults under subpath imports** — a side-effect of #1. The
   root `import '@carbon/react'` runs Carbon-React's `merge()` of feature-flag
   defaults at module-load time. A pure subpath import (`@carbon/react/Button`)
   skips that step. Consumers who rely on the merged defaults can either keep
   one root import alongside their subpath imports, or import
   `@carbon/react/feature-flags` once at their entry point.
