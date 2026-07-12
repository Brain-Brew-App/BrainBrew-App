/**
 * Generates the canonical authoring bundle the Admin imports — `npm run authoring:bundle`.
 *
 * The Admin Vercel project is rooted at `apps/admin` and cannot import
 * `../../src/content/*` at build time. Rather than DUPLICATE the builders and
 * validator into the Admin (forbidden), we esbuild the single-source pure entry
 * `src/content/authoringBoundary.ts` into one self-contained ESM module inside
 * `apps/admin`. It is a mechanical build artifact of ONE source — like a compiled
 * output — not a second implementation. Regenerate it whenever `src/content`
 * changes; `--check` fails if the committed file is stale (wired into the gate),
 * and `scripts/authoring-boundary-test.mjs` proves it is byte-identical to the
 * content pipeline across all 326 puzzles.
 *
 * Usage:
 *   node scripts/build-authoring-bundle.mjs           # write the bundle
 *   node scripts/build-authoring-bundle.mjs --check    # exit 1 if stale
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENTRY = resolve(ROOT, 'src/content/authoringBoundary.ts');
const OUT = resolve(ROOT, 'apps/admin/lib/authoring/canonical.generated.mjs');

const BANNER = `/* eslint-disable */
// @ts-nocheck
/**
 * GENERATED — DO NOT EDIT.
 * Source: src/content/authoringBoundary.ts (the single canonical builder/validator boundary).
 * Regenerate: npm run authoring:bundle   ·   Verify: npm run authoring:bundle:check
 * Byte-identity to the content pipeline is proven by npm run test:authoring-boundary.
 */`;

async function generate() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    legalComments: 'none',
    banner: { js: BANNER },
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

const isCheck = process.argv.includes('--check');
const next = await generate();

if (isCheck) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== next) {
    console.error('✕ canonical authoring bundle is STALE. Run: npm run authoring:bundle');
    process.exit(1);
  }
  console.log('✓ canonical authoring bundle is up to date with src/content');
} else {
  writeFileSync(OUT, next);
  console.log(`✓ wrote ${OUT.replace(ROOT + '\\', '').replace(/\\/g, '/')} (${next.length} bytes)`);
}
