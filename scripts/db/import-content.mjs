/**
 * Remote content importer — `npm run supabase:import-content`.
 *
 * Loads the local canonical content into the remote Supabase project through
 * supabase-js, idempotently. Runs OUTSIDE the app, with the SECRET key.
 *
 * Safety:
 *   * Requires SUPABASE_SECRET_KEY (sb_secret_...). Refuses the publishable key.
 *   * With no secret key it runs a DRY RUN: it builds every row, asserts no
 *     answer leaks, prints the summary, and connects to nothing.
 *   * Idempotent: upsert on stable keys. A second run changes nothing.
 *   * Never logs a full answer payload or a credential.
 *   * The database's own triggers block any attempt to mutate a published pack.
 *
 * Credentials come from the environment (e.g. an ignored `.env.db.local` sourced
 * into your shell), never from a committed file.
 *
 * Usage:
 *   SUPABASE_SECRET_KEY=sb_secret_... EXPO_PUBLIC_SUPABASE_URL=... \
 *     node scripts/db/import-content.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

import { buildAllRows } from './build-rows.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const dryRunFlag = process.argv.includes('--dry-run');

function refusePublishable(key) {
  if (key && key.startsWith('sb_publishable_')) {
    console.error('Refusing to import with the PUBLISHABLE key. Use the SECRET key (sb_secret_...).');
    process.exit(1);
  }
}
refusePublishable(SECRET);

const dryRun = dryRunFlag || !SECRET;

console.log(`\nBrainBrew content import — ${dryRun ? 'DRY RUN (no connection)' : 'LIVE'}\n`);

const rows = await buildAllRows();

const summary = {
  engines: rows.engines.length,
  seeds: rows.seeds.length,
  puzzles: rows.puzzles.length,
  answers: rows.answers.length,
  validations: rows.validations.length,
  packs: rows.packs.length,
  slots: rows.slots.length,
  reserve: rows.reserveIds.size,
};

console.log('Rows built from local content (validated, no answer leaks):');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(12)} ${v}`);

if (dryRun) {
  console.log(
    '\nDRY RUN complete. No rows written. To import for real, provide SUPABASE_SECRET_KEY\n' +
      'and EXPO_PUBLIC_SUPABASE_URL in your shell and re-run without --dry-run.\n',
  );
  process.exit(0);
}

if (!URL) {
  console.error('EXPO_PUBLIC_SUPABASE_URL is required for a live import.');
  process.exit(1);
}

const db = createClient(URL, SECRET, { auth: { persistSession: false } });

/** Upsert a batch; returns {inserted-or-updated, failed}. Never logs payloads. */
async function upsertBatch(table, batch, conflict) {
  const result = { table, ok: 0, failed: 0 };
  // Chunk to keep requests modest.
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const { error } = await db.from(table).upsert(chunk, { onConflict: conflict, ignoreDuplicates: false });
    if (error) {
      result.failed += chunk.length;
      console.error(`  ${table}: chunk ${i / 100} failed — ${error.message}`);
    } else {
      result.ok += chunk.length;
    }
  }
  return result;
}

const report = [];

// Order respects foreign keys. Puzzles go in as draft, then are approved once
// their answer and validation exist (the DB approval trigger requires both).
report.push(await upsertBatch('puzzle_engines', rows.engines, 'engine_id'));
report.push(await upsertBatch('puzzle_seeds', rows.seeds, 'seed_id'));
report.push(await upsertBatch('puzzles', rows.puzzles.map((p) => ({ ...p, status: 'draft' })), 'puzzle_id'));
report.push(await upsertBatch('puzzle_answers', rows.answers, 'puzzle_id'));

// Validation results: insert only for puzzles that don't yet have one.
{
  const { data: existing } = await db.from('puzzle_validation_results').select('puzzle_id');
  const have = new Set((existing ?? []).map((r) => r.puzzle_id));
  const fresh = rows.validations.filter((v) => !have.has(v.puzzle_id));
  const { error } = fresh.length ? await db.from('puzzle_validation_results').insert(fresh) : { error: null };
  report.push({ table: 'puzzle_validation_results', ok: fresh.length, failed: error ? fresh.length : 0, unchanged: rows.validations.length - fresh.length });
  if (error) console.error(`  validation_results failed — ${error.message}`);
}

// Approve puzzles.
{
  const { error } = await db.from('puzzles').update({ status: 'approved', approved_at: new Date().toISOString() }).in('puzzle_id', rows.puzzles.map((p) => p.puzzle_id)).eq('status', 'draft');
  if (error) console.error(`  puzzle approval failed — ${error.message}`);
}

report.push(await upsertBatch('daily_packs', rows.packs.map((p) => ({ ...p, status: 'draft' })), 'pack_id'));
report.push(await upsertBatch('daily_pack_slots', rows.slots, 'pack_id,position'));

// Approve packs.
{
  const { error } = await db.from('daily_packs').update({ status: 'approved' }).eq('status', 'draft');
  if (error) console.error(`  pack approval failed — ${error.message}`);
}

console.log('\nImport summary:');
for (const r of report) {
  console.log(`  ${r.table.padEnd(26)} ok=${r.ok} failed=${r.failed}${r.unchanged !== undefined ? ` unchanged=${r.unchanged}` : ''}`);
}

const anyFailed = report.some((r) => r.failed > 0);
console.log(anyFailed ? '\n✕ Some rows failed — see above.\n' : '\n✓ Import complete. Run `npm run supabase:parity` to verify.\n');
process.exit(anyFailed ? 1 : 0);
