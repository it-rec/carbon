/**
 * Copyright IBM Corp. 2016, 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { merge } from '@carbon/feature-flags';

// Intentional top-level side effect: registers Carbon's feature-flag defaults
// at module load time so any component that reads them via `enabled()` sees
// the same view. Listed in package.json#sideEffects (es/feature-flags.js,
// lib/feature-flags.js) so bundlers preserve this call even when nothing
// else from this module is imported.
merge({
  'enable-css-custom-properties': true,
  'enable-css-grid': true,
  'enable-v11-release': true,
  'enable-experimental-tile-contrast': false,
  'enable-tile-contrast': false,
  'enable-v12-tile-radio-icons': false,
  'enable-v12-structured-list-visible-icons': false,
  'enable-v12-dynamic-floating-styles': false,
});
