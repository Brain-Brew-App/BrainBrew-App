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

import { dateSequence as planDates, planSchedule } from './pack-schedule-plan.mjs';

const todayIso = new Date().toISOString().slice(0, 10);
/** Consecutive UTC dates starting today (or --start), one per pack. */
function dateSequence(startIso, n) {
  return planDates(startIso, n, todayIso);
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

// DATE-DRIVEN, not pack-driven. The old logic selected the first N packs by
// pack_index and re-confirmed any that were already live — but a live pack is pinned
// to its (possibly PAST) date and cannot move, so once the window expired the script
// just re-published yesterday forever and never covered today. It reported success
// while today's brew stayed unavailable.
//
// The correct question is per DATE: "does this date already have a live pack? if not,
// put the next approved pack on it." Dates already covered are left exactly as they
// are (live packs are immutable — you must never rewrite a day people played).

const wantDates = dateSequence(startArg, count);

// What is already live on the dates we care about (immutable — never moved).
const { data: liveOnDates, error: liveErr } = await db
  .from('daily_packs')
  .select('pack_date')
  .eq('status', 'live')
  .in('pack_date', wantDates);
if (liveErr) { console.error(`Could not read live packs — ${liveErr.message}`); process.exit(1); }
const liveDates = (liveOnDates ?? []).map((p) => p.pack_date);

// Approved, unscheduled inventory in stable order (fetch generously; the planner
// only consumes as many as there are open dates).
const { data: approved, error: apprErr } = await db
  .from('daily_packs')
  .select('pack_id, pack_index')
  .eq('status', 'approved')
  .order('pack_index', { ascending: true })
  .limit(count);
if (apprErr) { console.error(`Could not list approved packs — ${apprErr.message}`); process.exit(1); }

const plan = planSchedule(wantDates, liveDates, (approved ?? []).map((p) => p.pack_id));

if (plan.needDates.length === 0) {
  console.log(`All ${wantDates.length} dates already have a live pack (${wantDates[0]} … ${wantDates[wantDates.length - 1]}).`);
  process.exit(0);
}
if (plan.assignments.length === 0) {
  console.error('No approved packs available to schedule. Run `npm run supabase:import-content` first.');
  process.exit(1);
}
if (plan.shortfall > 0) {
  console.warn(`⚠ ${plan.shortfall} open date(s) have no approved pack to cover them — import more content.`);
}

let ok = 0;
let failed = 0;
for (const { packId, date } of plan.assignments) {
  const { error } = await db.rpc('publish_pack', { p_pack_id: packId, p_date: date });
  if (error) { failed++; console.error(`  ✕ ${packId} → ${date}: ${error.message}`); }
  else { ok++; console.log(`  ✓ ${packId} → ${date}`); }
}

console.log(`\n${plan.covered.length} already covered, ${ok} newly published, ${failed} failed.`);
console.log(failed ? '' : '✓ Live daily content is set. Verify with `npm run supabase:parity`.\n');
process.exit(failed ? 1 : 0);
