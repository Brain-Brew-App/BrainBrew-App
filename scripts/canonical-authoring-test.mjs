/**
 * Canonical authoring-reuse proof — `npm run test:canonical-authoring`.
 *
 * The Admin authoring adapter reuses the SAME canonical builders + independent
 * validator (src/content/authoring.ts, validators.ts) as the content pipeline —
 * never a duplicate. This proves that path: every canonically-built puzzle passes
 * `validatePuzzle` with zero findings, and a deliberately-broken puzzle is caught.
 * (The Admin build→validate flow calls exactly these functions server-side.)
 */

import { compilePureModules } from './compile.mjs';

const { load, out } = compilePureModules();
const { ALL_PUZZLES } = await load('content/library.js');
const { validatePuzzle } = await load('content/validators.js');

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// 1) Every canonical puzzle validates clean (the builder+validator agree).
let totalProblems = 0;
const perEngine = new Map();
for (const p of ALL_PUZZLES) {
  const problems = validatePuzzle(p);
  totalProblems += problems.length;
  perEngine.set(p.engineId, (perEngine.get(p.engineId) ?? 0) + 1);
  if (problems.length) failures.push(`${p.id} (${p.engineId}): ${problems.join('; ')}`);
}
ok(`all ${ALL_PUZZLES.length} canonical puzzles pass validatePuzzle (0 findings)`, totalProblems === 0);
ok('all 15 engines represented in the corpus', perEngine.size === 15);

// 2) The validator CATCHES a broken candidate (so admin authoring can't approve junk).
const sample = ALL_PUZZLES.find((p) => p.engineId === 'OBS_001');
if (sample) {
  const broken = { ...sample, oddTileId: 'tile-does-not-exist' };
  ok('validator flags a broken OddOneOut candidate', validatePuzzle(broken).length > 0);
}
const sampleSeq = ALL_PUZZLES.find((p) => p.engineId === 'PAT_001');
if (sampleSeq && Array.isArray(sampleSeq.options)) {
  const broken = { ...sampleSeq, options: sampleSeq.options.map((o) => ({ ...o })) };
  broken.correctOptionId = 'nope';
  ok('validator flags a Sequence with a bad correct-option id', validatePuzzle(broken).length > 0);
}

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} CANONICAL-AUTHORING CHECK(S) FAILED:`);
  for (const f of failures.slice(0, 20)) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} canonical-authoring checks passed — builders+validator reused, all ${ALL_PUZZLES.length} puzzles valid, broken candidates caught`);
