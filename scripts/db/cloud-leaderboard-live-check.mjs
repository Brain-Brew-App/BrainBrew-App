/**
 * Live daily-leaderboard verification — `npm run cloud:leaderboard-check`.
 *
 * Drives the DEPLOYED RPCs (get_daily_leaderboard, get_my_daily_rank) against the
 * live project with ISOLATED fixtures on a dedicated PAST date, so it never
 * touches "today", canonical content, or real players:
 *
 *   • global ordering (score ▸ time ▸ completed ▸ id) is correct;
 *   • country filtering is server-derived and correct;
 *   • positions / totals / percentile are correct;
 *   • pagination is stable (no dup / no gap, clamped);
 *   • practice / incomplete / invalidated / anonymous excluded;
 *   • rows expose only safe fields (no user_id / attempt id / integrity / email);
 *   • unauthenticated + anonymous access denied/locked;
 *   • void recalculation re-orders and flags the result.
 *
 * Fixtures are inserted with the service role and DELETED afterwards. Needs the
 * two PUBLIC env vars AND the SECRET key. Run via `node scripts/db/with-secrets.mjs`.
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

// A dedicated past date isolates this run from any real "today" data.
const D = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 3); return d.toISOString().slice(0, 10); })();

const userIds = [];
let packId = null;

async function makeUser(country) {
  const email = `lb_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user.id;
  userIds.push(id);
  const c = mk();
  await c.auth.signInWithPassword({ email, password });
  await c.rpc('set_username', { p_username: `lb_${rand().slice(0, 10)}` });
  await c.rpc('set_country', { p_country: country, p_display: true });
  return { id, client: c };
}

async function insertResult(userId, score, solveMs, country, opts = {}) {
  const row = {
    user_id: userId, session_id: `lbinstall${rand().slice(0, 8)}`, pack_id: packId,
    is_ranked: opts.ranked ?? true, ranked_date: D, status: opts.status ?? 'completed',
    final_score: opts.status === 'active' ? null : score,
    total_solve_ms: opts.status === 'active' ? null : solveMs,
    completed_at: opts.status === 'active' ? null : (opts.completedAt ?? new Date().toISOString()),
    country_code_snapshot: (opts.ranked ?? true) ? country : null,
    username_snapshot: (opts.ranked ?? true) ? (opts.uname ?? 'Snap') : null,
    active_denominator: 100, integrity_status: opts.integrity ?? 'clean',
  };
  const { error } = await admin.from('attempts').insert(row);
  if (error) throw new Error(`insert result failed: ${error.message}`);
}

try {
  // A pack to hang fixtures off (any existing pack id; fixtures reference it only by FK).
  const { data: packs } = await admin.from('daily_packs').select('pack_id').limit(1);
  packId = packs?.[0]?.pack_id;
  ok('a pack exists to reference', Boolean(packId));

  // Five permanent players + one invalidated + one incomplete + one anonymous.
  const A = await makeUser('AE'); const B = await makeUser('AE');
  const C = await makeUser('US'); const Dd = await makeUser('US'); const E = await makeUser('US');
  const inv = await makeUser('US'); const act = await makeUser('AE');
  const t0 = Date.now();
  await insertResult(A.id, 100, 100000, 'AE', { uname: 'Ada', completedAt: new Date(t0 - 5000).toISOString() });
  await insertResult(B.id, 100, 120000, 'AE', { uname: 'Ben', completedAt: new Date(t0 - 4000).toISOString() });
  await insertResult(C.id, 90, 90000, 'US', { uname: 'Cid', completedAt: new Date(t0 - 3000).toISOString() });
  await insertResult(Dd.id, 90, 90000, 'US', { uname: 'Dee', completedAt: new Date(t0 - 2000).toISOString() });
  await insertResult(E.id, 80, 70000, 'US', { uname: 'Eve', completedAt: new Date(t0 - 1000).toISOString() });
  await insertResult(inv.id, 95, 50000, 'US', { uname: 'Gus', integrity: 'invalidated' });
  await insertResult(act.id, null, null, 'AE', { uname: 'Fin', status: 'active' });

  const lbGlobal = async (client, after = 0, limit = 50) =>
    (await client.rpc('get_daily_leaderboard', { p_scope: 'global', p_date: D, p_after_position: after, p_limit: limit })).data;
  const lbCountry = async (client, after = 0, limit = 50) =>
    (await client.rpc('get_daily_leaderboard', { p_scope: 'country', p_date: D, p_after_position: after, p_limit: limit })).data;
  const myRank = async (client) => (await client.rpc('get_my_daily_rank', { p_date: D })).data;

  // Global ordering + totals.
  const g = await lbGlobal(A.client);
  ok('global ordering is Ada, Ben, Cid, Dee, Eve', g.rows.map((r) => r.username).join() === 'Ada,Ben,Cid,Dee,Eve' && g.total === 5);
  ok('invalidated (Gus) and incomplete (Fin) excluded', !g.rows.some((r) => ['Gus', 'Fin'].includes(r.username)));

  // Privacy — rows carry only safe fields.
  const keys = new Set(Object.keys(g.rows[0]));
  const allowed = ['position', 'username', 'country_code', 'score', 'solve_ms', 'is_current_user'];
  ok('rows expose only safe fields (no user_id / attempt id / integrity / email)',
    [...keys].every((k) => allowed.includes(k)) && !keys.has('user_id') && !keys.has('id'));

  // Personal rank / percentile / country.
  const ra = await myRank(A.client);
  ok('Ada: global #1 of 5, AE #1 of 2, has_result', ra.global_position === 1 && ra.global_total === 5 && ra.country_position === 1 && ra.country_total === 2 && ra.has_result === true);
  ok('Ada percentile is the top bracket (20)', ra.global_percentile === 20);
  const re = await myRank(E.client);
  ok('Eve: global #5, percentile 100', re.global_position === 5 && re.global_percentile === 100);
  ok('personal summary carries no user_id/attempt id', !('user_id' in ra) && !('attempt_id' in ra));

  // Country scope is server-derived.
  const ae = await lbCountry(A.client);
  const us = await lbCountry(C.client);
  ok('Ada country scope = AE (2 rows)', ae.country_code === 'AE' && ae.total === 2 && ae.rows.every((r) => r.country_code === 'AE'));
  ok('Cid country scope = US (3 rows)', us.country_code === 'US' && us.total === 3);
  ok('current-user flag marks exactly Ada in the AE list', ae.rows.filter((r) => r.is_current_user).length === 1 && ae.rows.find((r) => r.is_current_user).username === 'Ada');

  // Pagination stability.
  const pg1 = await lbGlobal(A.client, 0, 2);
  const pg2 = await lbGlobal(A.client, 2, 2);
  const pg3 = await lbGlobal(A.client, 4, 2);
  const all = [...pg1.rows, ...pg2.rows, ...pg3.rows].map((r) => r.position);
  ok('pagination covers 1..5 with no dup / no gap', all.join() === '1,2,3,4,5' && new Set(all).size === 5);
  ok('page size clamps to 100', (await lbGlobal(A.client, 0, 500)).page_size === 100);

  // Anonymous auth → locked; unauthenticated → denied.
  const guest = mk(); await guest.auth.signInAnonymously();
  const gLb = (await guest.rpc('get_daily_leaderboard', { p_scope: 'global', p_date: D })).data;
  const gRank = (await guest.rpc('get_my_daily_rank', { p_date: D })).data;
  ok('anonymous-Auth user is locked out of rows', gLb.locked === true && (!gLb.rows || gLb.rows.length === 0));
  ok('anonymous-Auth user gets a locked rank summary', gRank.locked === true);
  const noauth = mk();
  const denied = await noauth.rpc('get_daily_leaderboard', { p_scope: 'global', p_date: D });
  ok('unauthenticated (anon role) call is denied', Boolean(denied.error));

  // Void recalculation re-orders + flags.
  const bAttempt = (await admin.from('attempts').select('id').eq('user_id', B.id).eq('ranked_date', D).limit(1)).data[0].id;
  await admin.rpc('recalculate_ranked_result', { p_attempt_id: bAttempt });
  const rb = await myRank(B.client);
  ok('after void, Ben drops to #5 and is flagged updated_after_validation', rb.global_position === 5 && rb.updated_after_validation === true);
  const g2 = await lbGlobal(A.client);
  ok('no duplicate rows after recalculation', new Set(g2.rows.map((r) => r.username)).size === 5 && g2.total === 5);

  await guest.auth.getUser().then((u) => u.data.user && userIds.push(u.data.user.id));
} finally {
  // Teardown — delete fixture attempts + users; never touches real data.
  for (const id of userIds) {
    await admin.from('attempts').delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

if (failures.length) {
  console.error(`\n${failures.length} LEADERBOARD LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live leaderboard checks passed on the live project (isolated fixtures on ${D}, cleaned up)`);
