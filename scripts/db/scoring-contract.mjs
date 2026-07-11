/**
 * Scoring contract — `npm run db:scoring-contract`.
 *
 * Proves the server-authoritative scorer (`supabase/functions/_shared/scoring.ts`)
 * and the app scorer (`src/scoring/brewScore.ts`) award IDENTICAL points for the
 * same underlying play and the same server-set elapsed time, across:
 *
 *   1. a grid of point-math inputs (the two `points.ts` files must agree), and
 *   2. every one of the 314 real puzzles, for a perfect and an imperfect play.
 *
 * This is what lets the two implementations exist (Deno cannot import the app's
 * coupled scorer cleanly) without silently diverging.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compilePureModules } from '../compile.mjs';
import { keyFor, playsFor } from './plays.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));

// --- Compile the app side (points + scorer + content) -----------------------
const { load, out } = compilePureModules();
const app = await load('scoring/brewScore.js');
const appPoints = await load('scoring/points.js');
const { ALL_PUZZLES } = await load('content/library.js');

// --- Compile the server side (Deno .ts imports rewritten for Node) ----------
const serverOut = mkdtempSync(join(tmpdir(), 'bb-server-'));
const shared = join(ROOT, 'supabase', 'functions', '_shared');
copyFileSync(join(shared, 'points.ts'), join(serverOut, 'points.ts'));
writeFileSync(
  join(serverOut, 'scoring.ts'),
  readFileSync(join(shared, 'scoring.ts'), 'utf8').replace(/from '(\.\/[^']+)\.ts'/g, "from '$1'"),
);
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [
    tsc, join(serverOut, 'points.ts'), join(serverOut, 'scoring.ts'),
    '--ignoreConfig', '--outDir', serverOut, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
  ], { stdio: 'pipe' });
} catch (e) {
  const output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  const real = output.split('\n').filter((l) => /error TS\d+/.test(l) && !l.includes('TS5107'));
  if (real.length) { console.error('server scoring failed to compile:\n', real.join('\n')); process.exit(1); }
}
const server = await import(pathToFileURL(join(serverOut, 'scoring.js')).href);
const serverPoints = await import(pathToFileURL(join(serverOut, 'points.js')).href);

// =============================================================================
// 1. Point-math parity between the two points.ts files
// =============================================================================

const timings = [
  { parMs: 6000, limitMs: 20000 },
  { parMs: 12000, limitMs: 35000 },
  { parMs: 7000, limitMs: 12000 },
];
let gridMismatch = 0;
for (const t of timings) {
  for (const elapsed of [0, t.parMs, (t.parMs + t.limitMs) / 2, t.limitMs, 999999]) {
    if (appPoints.speedFactor(elapsed, t) !== serverPoints.speedFactor(elapsed, t)) gridMismatch++;
    for (const acc of [0, 0.25, 0.5, 0.75, 1]) {
      const a = appPoints.partial(acc, elapsed, t);
      const s = serverPoints.partial(acc, elapsed, t);
      if (a.accuracyPoints !== s.accuracyPoints || a.speedPoints !== s.speedPoints) gridMismatch++;
    }
    for (const correct of [true, false]) {
      const a = appPoints.allOrNothing(correct, elapsed, t);
      const s = serverPoints.allOrNothing(correct, elapsed, t);
      if (a.accuracyPoints !== s.accuracyPoints || a.speedPoints !== s.speedPoints) gridMismatch++;
    }
  }
}
ok('the two points.ts files agree across the input grid', gridMismatch === 0);

// =============================================================================
// 2. Per-puzzle parity: server scoreSubmission == app scorePuzzle
// =============================================================================

let mismatches = 0;
for (const p of ALL_PUZZLES) {
  const key = keyFor(p);
  for (const elapsedMs of [0, p.timing.parMs, p.timing.limitMs]) {
    for (const play of playsFor(p, elapsedMs)) {
      const local = app.scorePuzzle(p, play.answer);
      const srv = server.scoreSubmission(p.engineId, key, play.raw, p.timing, elapsedMs);
      if (
        local.points !== srv.points ||
        local.accuracyPoints !== srv.accuracyPoints ||
        local.speedPoints !== srv.speedPoints ||
        local.correct !== srv.correct
      ) {
        mismatches++;
        if (mismatches <= 8) {
          failures.push(`${p.id} @${elapsedMs}ms: local ${local.points}(${local.accuracyPoints}/${local.speedPoints}) vs server ${srv.points}(${srv.accuracyPoints}/${srv.speedPoints})`);
        }
      }
    }
  }
}
ok(`server and app score identically for all ${ALL_PUZZLES.length} puzzles`, mismatches === 0);

// =============================================================================

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });
rmSync(serverOut, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} SCORING CONTRACT FAILURE(S):\n`);
  for (const f of failures.slice(0, 12)) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} scoring-contract checks passed — server scoring matches the app across all 314 puzzles`);
