/**
 * RC1-A device-certification state probe — `node scripts/db/rc1-state.mjs [uid8]`.
 *
 * Prints the AUTHORITATIVE server state for a player after each B-series step. The
 * device UI is not evidence; this is. Everything it asserts is a release invariant:
 *
 *   • exactly ONE ranked attempt per UTC day
 *   • no duplicate attempt rows
 *   • a completed ranked attempt has a locked score
 *   • archive attempts are never ranked
 *
 * Read-only. Prints no email, no token, no receipt — user ids are truncated.
 */

import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const short = (id) => (id ? `${id.slice(0, 8)}…` : '—');
const today = new Date().toISOString().slice(0, 10);
const want = process.argv[2] ?? null;

const { data: profiles } = await db
  .from('profiles').select('id,username,account_type').order('created_at', { ascending: false }).limit(20);

const target = want
  ? (profiles ?? []).find((p) => p.id.startsWith(want))
  : (profiles ?? []).find((p) => p.account_type === 'permanent') ?? (profiles ?? [])[0];

if (!target) { console.log('no profile found'); process.exit(0); }

console.log(`PLAYER  ${short(target.id)}  ${target.username}  [${target.account_type}]   UTC day ${today}`);

const { data: attempts } = await db
  .from('attempts')
  .select('id,is_ranked,attempt_purpose,status,final_score,pack_id,archive_date_snapshot,started_at,completed_at')
  .eq('user_id', target.id)
  .order('started_at', { ascending: false })
  .limit(8);

console.log('\nATTEMPTS (most recent first):');
for (const a of attempts ?? []) {
  const day = (a.started_at ?? '').slice(0, 10);
  console.log(
    `  ${day}  ranked=${String(a.is_ranked).padEnd(5)} purpose=${(a.attempt_purpose ?? '-').padEnd(8)} ` +
    `status=${a.status.padEnd(9)} score=${a.final_score ?? '—'}  id=${short(a.id)}`,
  );
}

// Per-slot progress of the newest attempt — this is what "resume" actually means.
const latest = (attempts ?? [])[0];
if (latest) {
  const { data: items } = await db
    .from('attempt_items').select('position,status').eq('attempt_id', latest.id).order('position');
  const submitted = (items ?? []).filter((i) => i.status === 'submitted').map((i) => i.position);
  console.log(`\nLATEST ATTEMPT ${short(latest.id)} — slots submitted: [${submitted.join(',') || 'none'}]  (${submitted.length}/5)`);
}

// ── INVARIANTS ──────────────────────────────────────────────────────────────
const rankedToday = (attempts ?? []).filter((a) => a.is_ranked && (a.started_at ?? '').slice(0, 10) === today);
const archives = (attempts ?? []).filter((a) => a.attempt_purpose === 'archive');
const completedRanked = rankedToday.filter((a) => a.status === 'completed');

const checks = [
  ['ranked attempts today ≤ 1 (no duplicate, no burned second)', rankedToday.length <= 1, `${rankedToday.length}`],
  ['no duplicate ACTIVE ranked attempt', rankedToday.filter((a) => a.status === 'active').length <= 1, ''],
  ['a completed ranked attempt has a locked score', completedRanked.every((a) => a.final_score != null), ''],
  ['archive attempts are never ranked', archives.every((a) => a.is_ranked === false), ''],
];

console.log('\nINVARIANTS:');
let bad = 0;
for (const [name, pass, extra] of checks) {
  if (!pass) bad++;
  console.log(`  ${pass ? '✓' : '✕ VIOLATED'}  ${name}${extra ? ` → ${extra}` : ''}`);
}
process.exit(bad ? 1 : 0);
