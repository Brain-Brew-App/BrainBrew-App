/**
 * Pack publisher — `npm run supabase:publish-packs [-- --count N --start YYYY-MM-DD]`.
 *
 * Publishes a controlled set (7–14) of approved, unscheduled packs to consecutive
 * UTC dates, making them the live daily content. Runs OUTSIDE the app with the
 * SECRET key, and drives the database's own `publish_pack` function — which is
 * idempotent and refuses to move a live pack, publish a non-approved pack, or
 * claim a date another pack already owns. So this script cannot corrupt the
 * schedule even if re-run with a different count.
 *
 * Safety:
 *   * Requires SUPABASE_SECRET_KEY (sb_secret_...). Refuses the publishable key.
 *   * With no secret key it runs a DRY RUN: it prints the plan and connects to
 *     nothing.
 *   * Never logs a credential.
 *
 * Credentials come from the environment (an ignored `.env.db.local` or the
 * shell), never from a committed file.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MIN = 7;
const MAX = 14;
const count = Math.max(MIN, Math.min(MAX, Number(arg('count', '10'))));
const startArg = arg('start', null);

if (SECRET && SECRET.startsWith('sb_publishable_')) {
  console.error('Refusing to publish with the PUBLISHABLE key. Use the SECRET key (sb_secret_...).');
  process.exit(1);
}
const dryRun = !SECRET;

/** Consecutive UTC dates starting today (or --start), one per pack. */
function dateSequence(startIso, n) {
  const base = startIso ? new Date(`${startIso}T00:00:00Z`) : new Date();
  const day0 = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return Array.from({ length: n }, (_, i) => new Date(day0 + i * 86400000).toISOString().slice(0, 10));
}

console.log(`\nBrainBrew pack publish — ${dryRun ? 'DRY RUN (no connection)' : 'LIVE'}`);
console.log(`Publishing up to ${count} packs to consecutive dates${startArg ? ` from ${startArg}` : ' starting today (UTC)'}.\n`);

if (dryRun) {
  const dates = dateSequence(startArg, count);
  console.log('Plan (pack chosen live by pack_index order at run time):');
  dates.forEach((d, i) => console.log(`  slot ${String(i + 1).padStart(2)} → ${d}`));
  console.log('\nProvide SUPABASE_SECRET_KEY and EXPO_PUBLIC_SUPABASE_URL to publish for real.\n');
  process.exit(0);
}

if (!URL) {
  console.error('EXPO_PUBLIC_SUPABASE_URL is required for a live publish.');
  process.exit(1);
}

const db = createClient(URL, SECRET, { auth: { persistSession: false } });

// Choose the packs to publish: approved packs, in stable pack_index order.
// Packs already live keep their date (publish_pack is a no-op for them).
const { data: packs, error: listErr } = await db
  .from('daily_packs')
  .select('pack_id, pack_index, status, pack_date')
  .in('status', ['approved', 'live'])
  .order('pack_index', { ascending: true })
  .limit(count);
if (listErr) {
  console.error(`Could not list packs — ${listErr.message}`);
  process.exit(1);
}
if (!packs || packs.length === 0) {
  console.error('No approved packs found. Run `npm run supabase:import-content` first.');
  process.exit(1);
}

const dates = dateSequence(startArg, packs.length);
let ok = 0;
let failed = 0;

for (let i = 0; i < packs.length; i++) {
  const pack = packs[i];
  // A pack already live keeps the date it owns; otherwise take the next open date.
  const target = pack.pack_date ?? dates[i];
  const { error } = await db.rpc('publish_pack', { p_pack_id: pack.pack_id, p_date: target });
  if (error) {
    failed++;
    console.error(`  ✕ ${pack.pack_id} → ${target}: ${error.message}`);
  } else {
    ok++;
    console.log(`  ✓ ${pack.pack_id} → ${target}`);
  }
}

console.log(`\n${ok} published/confirmed, ${failed} failed.`);
console.log(failed ? '' : '✓ Live daily content is set. Verify with `npm run supabase:parity`.\n');
process.exit(failed ? 1 : 0);
