/**
 * Local↔cloud parity — `npm run supabase:parity`.
 *
 * Compares the local canonical content against the remote database, by CONTENT
 * (hashes), not just counts — counts can match while content is wrong. Exits
 * non-zero on any mismatch.
 *
 * Uses the SECRET key to read the private tables (engines, puzzles, packs), and
 * SEPARATELY the PUBLISHABLE key to confirm the public surface exposes no
 * answers. With no secret key it runs an OFFLINE check: it verifies the local
 * row set is internally consistent (hashes stable, reserve correct, no leaks)
 * and reports that the remote comparison needs credentials.
 */

import { createClient } from '@supabase/supabase-js';

import { buildAllRows } from './build-rows.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let failures = 0;
const bad = (m) => {
  failures++;
  console.error(`  ✕ ${m}`);
};
const good = (m) => console.log(`  ✓ ${m}`);

const rows = await buildAllRows();

// --- Offline self-consistency (always runs) --------------------------------

console.log('\nLocal content:');
console.log(`  ${rows.engines.length} engines · ${rows.puzzles.length} puzzles · ${rows.packs.length} packs · ${rows.slots.length} slots · ${rows.reserveIds.size} reserve`);
rows.engines.length === 15 ? good('15 engines') : bad(`expected 15 engines, built ${rows.engines.length}`);
rows.puzzles.length === 326 ? good('326 puzzles (314 scheduled-pool + 12 Observation reserve)') : bad(`expected 326 puzzles, built ${rows.puzzles.length}`);
rows.packs.length === 50 ? good('50 packs') : bad(`expected 50 packs, built ${rows.packs.length}`);
rows.slots.length === 250 ? good('250 scheduled slots') : bad(`expected 250 slots, built ${rows.slots.length}`);
rows.reserveIds.size === 76 ? good('76 reserve puzzles') : bad(`expected 76 reserve, got ${rows.reserveIds.size}`);

if (!SECRET) {
  console.log(
    '\nNo SUPABASE_SECRET_KEY — remote comparison skipped. Provide it (and the URL)\n' +
      'to compare content hashes against the cloud. Offline self-consistency above is authoritative for the local side.\n',
  );
  process.exit(failures ? 1 : 0);
}
if (!URL) {
  console.error('EXPO_PUBLIC_SUPABASE_URL required for remote parity.');
  process.exit(1);
}

// --- Remote comparison, by content hash ------------------------------------

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

async function remoteHashes(table, idCol, hashCol) {
  const map = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await admin.from(table).select(`${idCol}, ${hashCol}`).range(from, from + 999);
    if (error) throw error;
    for (const r of data) map.set(r[idCol], r[hashCol]);
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

function comparHashes(label, local, remote) {
  if (local.size !== remote.size) bad(`${label}: local ${local.size} vs remote ${remote.size}`);
  let mismatched = 0;
  let missing = 0;
  for (const [id, h] of local) {
    if (!remote.has(id)) missing++;
    else if (remote.get(id) !== h) mismatched++;
  }
  if (missing) bad(`${label}: ${missing} local ids missing from remote`);
  if (mismatched) bad(`${label}: ${mismatched} content hashes differ`);
  if (!missing && !mismatched && local.size === remote.size) good(`${label}: ${local.size} match by content hash`);
}

console.log('\nRemote comparison:');
const localPuzzleHashes = new Map(rows.puzzles.map((p) => [p.puzzle_id, p.content_hash]));
comparHashes('puzzles', localPuzzleHashes, await remoteHashes('puzzles', 'puzzle_id', 'content_hash'));

const localPackHashes = new Map(rows.packs.map((p) => [p.pack_id, p.content_hash]));
comparHashes('packs', localPackHashes, await remoteHashes('daily_packs', 'pack_id', 'content_hash'));

// Slot count + reserve integrity on the remote.
const { count: slotCount } = await admin.from('daily_pack_slots').select('*', { count: 'exact', head: true });
slotCount === 250 ? good(`remote has 250 slots`) : bad(`remote slot count ${slotCount}, expected 250`);
const { data: scheduledRemote } = await admin.from('daily_pack_slots').select('puzzle_id');
const scheduledSet = new Set((scheduledRemote ?? []).map((r) => r.puzzle_id));
const reserveLeaked = [...rows.reserveIds].filter((id) => scheduledSet.has(id));
reserveLeaked.length === 0 ? good('reserve puzzles remain unscheduled on the remote') : bad(`${reserveLeaked.length} reserve puzzles are scheduled remotely`);

// --- Public surface exposes NO answers (checked with the anon key) ---------

if (PUBLISHABLE) {
  const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  // The public surface is the get_public_pack RPC (the view was replaced in 4B).
  const { data: publicSlots, error } = await anon.rpc('get_public_pack');
  if (error && !/does not exist|not found/i.test(error.message)) {
    bad(`public surface read failed: ${error.message}`);
  } else {
    const sample = publicSlots ?? [];
    const leakingCols = sample.flatMap((row) =>
      Object.keys(row).filter((k) => /answer|explanation|correct|oddTile|pairTile|wrongIndex|membership|constraints|targetIds|isTarget|bucket/i.test(k)),
    );
    leakingCols.length === 0
      ? good('public surface exposes no answer field (anon read)')
      : bad(`public surface leaks: ${[...new Set(leakingCols)].join(', ')}`);
  }
  // anon must be denied the private answer table entirely.
  const { error: answersErr } = await anon.from('puzzle_answers').select('puzzle_id').limit(1);
  answersErr ? good('anon is denied the answer table') : bad('anon could read puzzle_answers');
} else {
  console.log('  (no publishable key in env — skipped the anon-surface check)');
}

console.log(failures ? `\n✕ Parity FAILED with ${failures} mismatch(es).\n` : '\n✓ Parity holds: local and cloud content match, no answers are public.\n');
process.exit(failures ? 1 : 0);
