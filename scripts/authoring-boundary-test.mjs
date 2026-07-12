/**
 * Canonical authoring-boundary parity proof — `npm run test:authoring-boundary`.
 *
 * The Admin builds/validates candidates through a GENERATED bundle
 * (apps/admin/lib/authoring/canonical.generated.mjs) so the isolated Admin
 * Vercel project can reuse the ONE canonical builder/validator without importing
 * outside its deployment boundary. This proves that bundle is byte-identical to
 * the content pipeline:
 *
 *   1. bundle.canonicalStringify + sha256 == canonical.mjs contentHash  (all 326)
 *   2. bundle.splitBuilt(p).public == canonical.mjs splitPuzzle(p).public (all 326)
 *   3. bundle.validatePuzzle == source validatePuzzle                    (all 326)
 *   4. buildCandidate: valid seed → ok+clean; broken build → build_error;
 *      unsupported engine + invalid seed rejected; no answer leak in public.
 *
 * If the bundle drifts from src/content (stale regeneration, edited by hand, or a
 * changed canonicalStringify) any of these fail — so this is the gate that lets
 * the Admin trust the bundle equals canonical content.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { compilePureModules } from './compile.mjs';
import { contentHash, sha256, splitPuzzle, canonicalStringify as srcStringify } from './db/canonical.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await import(pathToFileURL(resolve(ROOT, 'apps/admin/lib/authoring/canonical.generated.mjs')).href);

const { load, out } = compilePureModules();
const { ALL_PUZZLES } = await load('content/library.js');
const { validatePuzzle: srcValidate } = await load('content/validators.js');
const { ENGINE_SPLIT } = await load('infrastructure/supabase/publicFields.js');
const ALWAYS_PRIVATE = ['explanation'];

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// ── 1. Hashing is byte-identical across all 326 ──────────────────────────────
let hashMismatch = 0;
let stringifyMismatch = 0;
for (const p of ALL_PUZZLES) {
  if (bundle.canonicalStringify(p) !== srcStringify(p)) stringifyMismatch++;
  if (sha256(bundle.canonicalStringify(p)) !== contentHash(p)) hashMismatch++;
}
ok(`canonicalStringify identical for all ${ALL_PUZZLES.length} puzzles`, stringifyMismatch === 0);
ok(`content_hash identical for all ${ALL_PUZZLES.length} puzzles`, hashMismatch === 0);

// ── 2. Public/private split is byte-identical (no answer leak) ────────────────
let splitMismatch = 0;
let publicLeak = 0;
for (const p of ALL_PUZZLES) {
  const mine = bundle.splitBuilt(p);
  const theirs = splitPuzzle(p, ENGINE_SPLIT, ALWAYS_PRIVATE);
  if (srcStringify(mine.public) !== srcStringify(theirs.public)) splitMismatch++;
  if (srcStringify(mine.answer) !== srcStringify(theirs.answer)) splitMismatch++;
  try {
    bundle.assertNoAnswerLeak(mine.public, p);
  } catch {
    publicLeak++;
  }
}
ok(`splitBuilt matches importer split for all ${ALL_PUZZLES.length} puzzles`, splitMismatch === 0);
ok('no public payload leaks an answer field', publicLeak === 0);

// ── 3. Bundled validator == source validator across all 326 ──────────────────
let validatorMismatch = 0;
let totalFindings = 0;
for (const p of ALL_PUZZLES) {
  const a = bundle.validatePuzzle(p);
  const b = srcValidate(p);
  totalFindings += a.length;
  if (JSON.stringify(a) !== JSON.stringify(b)) validatorMismatch++;
}
ok(`bundled validatePuzzle == source for all ${ALL_PUZZLES.length} puzzles`, validatorMismatch === 0);
ok('all 326 canonical puzzles validate clean through the bundle', totalFindings === 0);

// ── 4. buildCandidate — the one build path the Admin calls ───────────────────
// A valid Odd One Out seed → ok, clean, answer split out of the public payload.
const oddSeed = {
  id: 'boundary-obs-1',
  family: 'triangles',
  majority: 0,
  odd: 1,
  tiles: 9,
  columns: 3,
  oddIndex: 7,
  difficulty: 3,
};
const built = bundle.buildCandidate('OBS_001', oddSeed);
ok('buildCandidate(valid OddOneOut) → ok', built.ok === true);
if (built.ok) {
  ok('build has 0 validator findings', built.findings.length === 0);
  ok('public payload excludes the answer (oddTileId)', !('oddTileId' in built.publicPayload));
  ok('answer payload contains oddTileId', 'oddTileId' in built.answer);
  ok('contentString hashes to a 64-hex content hash', /^[0-9a-f]{64}$/.test(sha256(built.contentString)));
  ok('rebuild is deterministic (same content hash)', sha256(bundle.buildCandidate('OBS_001', oddSeed).contentString) === sha256(built.contentString));
}

// A builder that throws on impossible input → build_error, never a partial insert.
const badRot = bundle.buildCandidate('OBS_003', { id: 'x', grid: [1, 1], cells: 1, shape: 0, turns: 1, correctIndex: 0, difficulty: 3 });
ok('impossible seed → ok:false build_error (no throw)', badRot.ok === false && badRot.code === 'build_error');

// Unsupported engine + invalid seed are rejected cleanly.
ok('unsupported engine rejected', bundle.buildCandidate('NOPE_999', oddSeed).code === 'unsupported_engine');
ok('null seed rejected', bundle.buildCandidate('OBS_001', null).code === 'invalid_seed');
ok('string seed rejected', bundle.buildCandidate('OBS_001', 'nope').code === 'invalid_seed');

// The validator catches a corrupted build (so the Admin can never approve junk).
if (built.ok) {
  const broken = { ...built.puzzle, oddTileId: 'tile-does-not-exist' };
  ok('bundle validator flags a corrupted candidate', bundle.validatePuzzle(broken).length > 0);
}

// All 15 engines resolve to a builder.
ok('all 15 engines have a builder in the bundle', bundle.ENGINE_IDS.length === 15 && bundle.ENGINE_IDS.every((id) => typeof bundle.BUILDERS[id] === 'function'));

rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} AUTHORING-BOUNDARY CHECK(S) FAILED:`);
  for (const f of failures.slice(0, 20)) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} authoring-boundary checks passed — generated bundle byte-identical to the content pipeline (${ALL_PUZZLES.length} puzzles: hash, split, validator), buildCandidate correct, failures handled`);
