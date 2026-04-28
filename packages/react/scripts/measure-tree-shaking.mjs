#!/usr/bin/env node
/**
 * Bundles the Button-only consumer fixture in production mode with esbuild
 * and prints the minified byte count. Used to track the tree-shaking
 * trajectory; the latest numbers live in TREE_SHAKING_NOTES.md.
 */

/* eslint-disable no-console */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '..', '__tree-shaking-fixture__');

const targets = [
  {
    label: 'named  (import { Button } from "@carbon/react")',
    entry: 'named.js',
  },
  {
    label: 'subpath(import Button from "@carbon/react/Button")',
    entry: 'subpath.js',
  },
];

for (const { label, entry } of targets) {
  let bytes = null;
  let error = null;
  try {
    const result = await build({
      entryPoints: [resolve(fixtureDir, entry)],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
      external: ['react', 'react-dom', 'react-is'],
      conditions: ['import', 'module', 'browser', 'default'],
    });
    bytes = result.outputFiles.reduce(
      (sum, f) => sum + f.contents.byteLength,
      0
    );
  } catch (e) {
    error = e.message?.split('\n')[0] ?? String(e);
  }

  if (bytes != null) {
    console.log(
      `${label.padEnd(54)} ${bytes.toLocaleString().padStart(10)} bytes`
    );
  } else {
    console.log(`${label.padEnd(54)} FAILED: ${error}`);
  }
}
