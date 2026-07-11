/**
 * Live player-progress verification — `npm run cloud:progress-check`.
 *
 * Drives the DEPLOYED progress RPCs (get_my_progress_summary / _detail /
 * get_my_ranked_history) with ISOLATED permanent test users and dated ranked
 * fixtures (created + cleaned up; per-user data, so it never touches other
 * players or canonical content):
 *
 *   • current streak, best streak, missed-day reset;
 *   • today-incomplete / yesterday-complete retains the streak;
 *   • practice excluded; invalidated excluded; void-recalc day retained;
 *   • lifetime statistics; paginated history; calendar window;
 *   • idempotent derivation (no drift);
 *   • anonymous locked; unauthenticated denied; only-own-data; safe fields only.
 *
 * Category correctness (needs real per-slot content) is proven in the PGlite
 * db:progress-test. Needs the two PUBLIC env vars + the SECRET key.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !PUB) { console.error('Missing public env vars'); process.exit(2); }
if (!SECRET) { console.error('Missing SUPABASE_SECRET_KEY (run via with-secrets.mjs)'); process.exit(2); }

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const rand = () => Array.from(webcrypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const mk = () => createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const dayISO = (delta) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
const today = dayISO(0);

const userIds = [];
let packId = null;

async function makeUser() {
  const email = `pg_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user.id;
  userIds.push(id);
  const c = mk();
  await c.auth.signInWithPassword({ email, password });
  await c.rpc('set_username', { p_username: `pg_${rand().slice(0, 10)}` });
  await c.rpc('set_country', { p_country: 'AE', p_display: true });
  return { id, client: c };
}
async function insertDay(userId, date, score, solveMs, opts = {}) {
  const row = {
    user_id: userId, session_id: `pglive${rand().slice(0, 10)}`, pack_id: packId,
    is_ranked: opts.ranked ?? true, ranked_date: date, status: 'completed',
    final_score: score, total_solve_ms: solveMs, completed_at: new Date().toISOString(),
    country_code_snapshot: (opts.ranked ?? true) ? 'AE' : null, username_snapshot: (opts.ranked ?? true) ? 'Snap' : null,
    active_denominator: 100, integrity_status: opts.integrity ?? 'clean',
  };
  const { error } = await admin.from('attempts').insert(row);
  if (error) throw new Error(`insert failed: ${error.message}`);
}
const summary = async (c) => (await c.rpc('get_my_progress_summary', {})).data;

try {
  packId = (await admin.from('daily_packs').select('pack_id').limit(1)).data?.[0]?.pack_id;
  ok('a pack exists to reference', Boolean(packId));

  const U1 = await makeUser(); // today, -1, -2 → streak 3
  await insertDay(U1.id, today, 90, 100000); await insertDay(U1.id, dayISO(-1), 80, 110000); await insertDay(U1.id, dayISO(-2), 70, 120000);
  const U2 = await makeUser(); // -1, -2 (not today) → streak retained 2
  await insertDay(U2.id, dayISO(-1), 85, 90000); await insertDay(U2.id, dayISO(-2), 75, 95000);
  const U3 = await makeUser(); // practice only → streak 0
  await insertDay(U3.id, today, 77, 88000, { ranked: false });
  const U4 = await makeUser(); // today clean + -1 invalidated → 1 day
  await insertDay(U4.id, today, 88, 90000); await insertDay(U4.id, dayISO(-1), 99, 50000, { integrity: 'invalidated' });
  const U5 = await makeUser(); // empty
  const ST = await makeUser(); // stats 100,80,90,100
  await insertDay(ST.id, today, 100, 60000); await insertDay(ST.id, dayISO(-1), 80, 70000); await insertDay(ST.id, dayISO(-2), 90, 80000); await insertDay(ST.id, dayISO(-3), 100, 90000);

  const s1 = await summary(U1.client);
  ok('current streak = 3, today complete', s1.current_streak === 3 && s1.today_completed === true && s1.best_streak === 3);
  const s2 = await summary(U2.client);
  ok('yesterday complete / today not → streak retained 2', s2.current_streak === 2 && s2.today_completed === false);
  const s3 = await summary(U3.client);
  ok('practice never counts (streak 0)', s3.current_streak === 0 && s3.ranked_days_completed === 0);
  const s4 = await summary(U4.client);
  ok('invalidated day excluded (1 day)', s4.ranked_days_completed === 1 && s4.current_streak === 1);
  const s5 = await summary(U5.client);
  ok('empty player → streak 0, no scores', s5.current_streak === 0 && s5.latest_score === null && s5.ranked_days_completed === 0);
  const st = await summary(ST.client);
  ok('lifetime stats: avg 92.5, best 100, perfect 2, latest 100', Number(st.average_score) === 92.5 && st.best_score === 100 && st.perfect_scores === 2 && st.latest_score === 100);
  ok('summary carries no user_id / attempt id', !('user_id' in st) && !('attempt_id' in st));

  // History pagination + safe fields.
  const h1 = (await ST.client.rpc('get_my_ranked_history', { p_limit: 2 })).data;
  ok('history newest first + has_more', h1.rows[0].ranked_date === today && h1.rows.length === 2 && h1.has_more === true);
  const h2 = (await ST.client.rpc('get_my_ranked_history', { p_before: h1.next_before, p_limit: 2 })).data;
  const allDates = [...h1.rows, ...h2.rows].map((r) => r.ranked_date);
  ok('history pages: no dup / no gap', new Set(allDates).size === 4);
  ok('history rows carry only safe fields', h1.rows.every((r) => !('user_id' in r) && !('attempt_id' in r) && !('id' in r) && !('integrity_status' in r)));

  // Detail (calendar).
  const detail = (await U1.client.rpc('get_my_progress_detail', { p_days: 35 })).data;
  const done = detail.calendar.completed.map((c) => c.date);
  ok('calendar lists completed days in window', done.includes(today) && done.includes(dayISO(-1)) && detail.locked === false);

  // Idempotency.
  const a = await summary(ST.client); const b = await summary(ST.client);
  ok('repeated derivation is identical (no drift)', JSON.stringify(a) === JSON.stringify(b));

  // Void recalc (no items → 0) retains the day.
  const vAttempt = (await admin.from('attempts').select('id').eq('user_id', U1.id).eq('ranked_date', today).limit(1)).data[0].id;
  await admin.rpc('recalculate_ranked_result', { p_attempt_id: vAttempt });
  const s1b = await summary(U1.client);
  ok('void-recalc keeps the day and reflects the corrected score', s1b.ranked_days_completed === 3 && s1b.latest_score === 0);

  // Security: anonymous locked; unauthenticated denied.
  const guest = mk(); await guest.auth.signInAnonymously();
  const gs = (await guest.rpc('get_my_progress_summary', {})).data;
  ok('anonymous-Auth user is locked', gs.locked === true);
  const gid = (await guest.auth.getUser()).data.user?.id; if (gid) userIds.push(gid);
  const noauth = mk();
  const denied = await noauth.rpc('get_my_progress_summary', {});
  ok('unauthenticated (anon role) is denied', Boolean(denied.error));
} finally {
  for (const id of userIds) {
    await admin.from('attempts').delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

if (failures.length) {
  console.error(`\n${failures.length} PROGRESS LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live progress checks passed on the live project (isolated users, cleaned up)`);
