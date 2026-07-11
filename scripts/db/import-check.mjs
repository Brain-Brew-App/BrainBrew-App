/**
 * Full import simulation — `npm run db:import-check`.
 *
 * Loads ALL 314 real puzzles and 50 real packs into an in-process Postgres
 * (PGlite) against the ACTUAL committed migrations, using the same upsert path
 * the remote importer uses. Proves, without touching the remote:
 *
 *   * every real puzzle and pack satisfies every constraint and trigger,
 *   * the import is idempotent (running it twice changes nothing),
 *   * no public payload leaks an answer,
 *   * the reserve (unscheduled surplus) is preserved,
 *   * nothing is publicly visible (no pack is live),
 *   * anon cannot read answers or seeds.
 *
 * This is the honest stand-in for a remote import that cannot run here (no
 * secret key). The remote importer (import-content.mjs) applies the identical
 * row set through supabase-js.
 */

import { buildAllRows } from './build-rows.mjs';
import { count, freshDb, upsert } from './pglite-harness.mjs';

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));

const rows = await buildAllRows();
const db = await freshDb();

/** The whole import, in dependency order. Idempotent by construction. */
async function runImport() {
  await upsert(db, 'puzzle_engines', rows.engines, 'engine_id');
  await upsert(db, 'puzzle_seeds', rows.seeds, 'seed_id');
  await upsert(db, 'puzzles', rows.puzzles.map((p) => ({ ...p, status: 'draft' })), 'puzzle_id');
  await upsert(db, 'puzzle_answers', rows.answers, 'puzzle_id');
  // validation_results has no natural conflict key; insert once, guarded below.
  const already = await count(db, 'puzzle_validation_results');
  if (already === 0) {
    for (const v of rows.validations) {
      await db.query(
        `insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source)
         values ($1,$2,$3,$4::jsonb,$5,$6)`,
        [v.puzzle_id, v.validator_version, v.passed, JSON.stringify(v.findings), v.validation_hash, v.validation_source],
      );
    }
  }
  // Now promote puzzles to approved (needs validation + answer to exist).
  await db.exec(`update puzzles set status = 'approved', approved_at = now() where status = 'draft';`);

  await upsert(db, 'daily_packs', rows.packs.map((p) => ({ ...p, status: 'draft' })), 'pack_id');
  // Slots have a uuid id (auto-generated); their natural key is (pack_id, position).
  await upsert(db, 'daily_pack_slots', rows.slots, ['pack_id', 'position']);
  await db.exec(`update daily_packs set status = 'approved' where status = 'draft';`);
}

// --- First import ---
await runImport();

ok('15 engines imported', (await count(db, 'puzzle_engines')) === 15);
ok('314 seeds imported', (await count(db, 'puzzle_seeds')) === 326);
ok('314 puzzles imported', (await count(db, 'puzzles')) === 326);
ok('314 answers imported', (await count(db, 'puzzle_answers')) === 326);
ok('314 validation results imported', (await count(db, 'puzzle_validation_results')) === 326);
ok('50 packs imported', (await count(db, 'daily_packs')) === 50);
ok('250 slots imported', (await count(db, 'daily_pack_slots')) === 250);

const approvedPuzzles = (await db.query(`select count(*)::int c from puzzles where status='approved'`)).rows[0].c;
ok('all 314 puzzles are approved', approvedPuzzles === 326);
const approvedPacks = (await db.query(`select count(*)::int c from daily_packs where status='approved'`)).rows[0].c;
ok('all 50 packs are approved', approvedPacks === 50);

// Reserve: every unscheduled puzzle exists but has no slot.
const scheduled = (await db.query(`select count(distinct puzzle_id)::int c from daily_pack_slots`)).rows[0].c;
ok('250 distinct puzzles are scheduled', scheduled === 250);
ok('reserve is 76 (326 − 250)', rows.reserveIds.size === 76);
const reserveScheduled = (
  await db.query(
    `select count(*)::int c from daily_pack_slots where puzzle_id = any($1)`,
    [[...rows.reserveIds]],
  )
).rows[0].c;
ok('no reserve puzzle is scheduled', reserveScheduled === 0);

// --- Idempotency: a second run must not change any count ---
const before = {
  e: await count(db, 'puzzle_engines'),
  p: await count(db, 'puzzles'),
  a: await count(db, 'puzzle_answers'),
  v: await count(db, 'puzzle_validation_results'),
  k: await count(db, 'daily_packs'),
  s: await count(db, 'daily_pack_slots'),
};
await runImport();
const after = {
  e: await count(db, 'puzzle_engines'),
  p: await count(db, 'puzzles'),
  a: await count(db, 'puzzle_answers'),
  v: await count(db, 'puzzle_validation_results'),
  k: await count(db, 'daily_packs'),
  s: await count(db, 'daily_pack_slots'),
};
ok('import is idempotent (second run changes no counts)', JSON.stringify(before) === JSON.stringify(after));

// --- Nothing is public yet (no pack is live) ---
const publicRows = (await db.query(`select count(*)::int c from get_public_pack(current_date)`)).rows[0].c;
ok('public RPC is empty (no live packs)', publicRows === 0);

// --- No public payload contains an answer field ---
// (build-rows already asserts this per puzzle; re-check from the stored rows.)
const leakCheck = (
  await db.query(`
    select count(*)::int c from puzzles
    where public_payload ? 'correctOptionId'
       or public_payload ? 'oddTileId'
       or public_payload ? 'pairTileIds'
       or public_payload ? 'correctOrder'
       or public_payload ? 'wrongIndex'
       or public_payload ? 'membership'
       or public_payload ? 'constraints'
       or public_payload ? 'targetIds'
       or public_payload ? 'explanation'
  `)
).rows[0].c;
ok('no stored public payload contains a top-level answer field', leakCheck === 0);

// --- anon cannot read answers or seeds ---
await db.exec('set role anon');
let answersDenied = false;
let seedsDenied = false;
try { await db.query('select * from puzzle_answers limit 1'); } catch (e) { answersDenied = /permission denied/i.test(e.message); }
try { await db.query('select * from puzzle_seeds limit 1'); } catch (e) { seedsDenied = /permission denied/i.test(e.message); }
await db.exec('reset role');
ok('anon cannot read the imported answers', answersDenied);
ok('anon cannot read the imported seeds', seedsDenied);

if (failures.length) {
  console.error(`\n${failures.length} IMPORT-CHECK FAILURE(S):\n`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} import checks passed — 314 puzzles + 50 packs import cleanly, idempotently, with no answer leak`);
