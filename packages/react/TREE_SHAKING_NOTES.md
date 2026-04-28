# Tree-shaking trajectory

Measurements come from `scripts/measure-tree-shaking.mjs`, which bundles two
fixture consumers (`__tree-shaking-fixture__/named.js` and `subpath.js`) with
esbuild in production mode (`minify`, `format=esm`, `NODE_ENV=production`).
React, ReactDOM and react-is are marked external so the numbers reflect the
contribution of `@carbon/react` and its non-peer dependencies only.

Run before each phase commit and append a row.

| Phase | Named import bytes | Subpath import bytes | Notes                                                                                                                                                               |
| ----- | -----------------: | -------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     |             52,329 |                  n/a | Baseline. Subpath unsupported yet.                                                                                                                                  |
| 1     |             52,329 |               52,070 | Subpath exports added. Each component dir is now a tsdown entry, preserving its named-export surface. Most of the gap to the named import will close in Phases 2–5. |
