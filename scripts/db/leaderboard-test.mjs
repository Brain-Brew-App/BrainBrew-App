/**
 * Daily leaderboard DB tests — `npm run db:leaderboard-test`.
 *
 * Applies the real migrations into PGlite (auth-schema stand-in) and proves the
 * Phase 6C ranking surface end to end against controlled fixtures:
 *
 *   • the deterministic ranking order (score ▸ solve time ▸ completed ▸ id);
 *   • global vs country use the SAME order; country is server-derived;
 *   • positions, totals, and the percentile formula;
 *   • pagination: no duplicates, no omissions, clamped page size, safe cursor;
 *   • exclusions: practice / incomplete / invalidated / anonymous / future date;
 *   • privacy: rows carry no user_id / attempt id / integrity / email;
 *   • security: anon role denied, anonymous-Auth locked, direct table access denied;
 *   • void recalculation re-orders deterministically and flags the result.
 *
 * Mutation checks (a broken rule must change the answer) are inline where noted.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AUTH_MOCK, actAs } from './pglite-harness.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));
async function expectFail(name, fn, matcher) {
  try {
    await fn();
    failures.push(`${name} — expected rejection, but it succeeded`);
  } catch (e) {
    if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`);
    else passed++;
  }
}

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
await db.exec(`set time zone 'UTC';`);
await db.exec(AUTH_MOCK);
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8')); }
  catch (e) { console.error(`Migration ${file} failed: ${e.message}`); process.exit(1); }
}
passed++; // migrations applied with the leaderboard stack

const today = (await db.query(`select (now() at time zone 'utc')::date::text d`)).rows[0].d;
const yesterday = (await db.query(`select ((now() at time zone 'utc')::date - 1)::text d`)).rows[0].d;

// Two packs to hang attempts off (FK target only; no slots needed for direct rows).
await db.exec(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ('pk',0,'draft','${'a'.repeat(64)}','standard'),('pk2',1,'draft','${'b'.repeat(64)}','standard');`);

const U = {
  u1: '11111111-1111-1111-1111-111111111111', u2: '22222222-2222-2222-2222-222222222222',
  u3: '33333333-3333-3333-3333-333333333333', u4: '44444444-4444-4444-4444-444444444444',
  u5: '55555555-5555-5555-5555-555555555555', anon: '66666666-6666-6666-6666-666666666666',
  active: '77777777-7777-7777-7777-777777777777', invalid: '88888888-8888-8888-8888-888888888888',
  u9: '99999999-9999-9999-9999-999999999999', u10: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  viewer: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', // permanent, complete, NO ranked result today
};
// Create auth users: everyone permanent except `anon`.
for (const [k, id] of Object.entries(U)) {
  await db.query(`insert into auth.users (id, is_anonymous) values ($1, $2)`, [id, k === 'anon']);
}
// Complete permanent profiles (username + country).
async function profile(id, uname, country) {
  await db.query(`update profiles set username=$2, username_normalized=lower($2), country_code=$3, display_country=true, onboarding_status='complete' where id=$1`, [id, uname, country]);
}
await profile(U.u1, 'Ada', 'AE'); await profile(U.u2, 'Ben', 'AE');
await profile(U.u3, 'Cid', 'US'); await profile(U.u4, 'Dee', 'US'); await profile(U.u5, 'Eve', 'US');
await profile(U.active, 'Fin', 'AE'); await profile(U.invalid, 'Gus', 'US');
await profile(U.u9, 'Hal', 'GB'); await profile(U.u10, 'Ivy', 'GB');
await profile(U.viewer, 'Val', 'AE');

let seq = 0;
async function result(id, date, score, solveMs, country, opts = {}) {
  seq += 1;
  const sess = `install${String(seq).padStart(10, '0')}`;
  const status = opts.status ?? 'completed';
  const integrity = opts.integrity ?? 'clean';
  const ranked = opts.ranked ?? true;
  const completedExpr = status === 'completed' ? `now() - interval '${opts.agoSec ?? (1000 - seq)} seconds'` : 'null';
  const scoreExpr = status === 'completed' ? String(score) : 'null';
  await db.query(
    `insert into attempts (id, user_id, session_id, pack_id, is_ranked, ranked_date, status,
        final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
     values (gen_random_uuid(), $1, $2, 'pk', $3, $4::date, $5, ${scoreExpr}, $6, ${completedExpr}, $7, $8, 100, $9)`,
    [id, sess, ranked, date, status, ranked && status === 'completed' ? solveMs : null,
     ranked ? country : null, ranked ? (opts.uname ?? 'Snap') : null, integrity]);
}

// --- Today's fixture (global order by score ▸ time ▸ completed ▸ id) ---
// Ada 100/100k AE, Ben 100/120k AE, Cid 90/90k US (earlier), Dee 90/90k US (later), Eve 80/70k US
await result(U.u1, today, 100, 100000, 'AE', { uname: 'Ada', agoSec: 500 });
await result(U.u2, today, 100, 120000, 'AE', { uname: 'Ben', agoSec: 400 });
await result(U.u3, today, 90, 90000, 'US', { uname: 'Cid', agoSec: 300 }); // earlier completed
await result(U.u4, today, 90, 90000, 'US', { uname: 'Dee', agoSec: 200 }); // later completed
await result(U.u5, today, 80, 70000, 'US', { uname: 'Eve', agoSec: 100 });
// Excluded rows:
await result(U.active, today, null, null, 'AE', { status: 'active', uname: 'Fin' });   // incomplete
await result(U.invalid, today, 95, 50000, 'US', { integrity: 'invalidated', uname: 'Gus' }); // invalidated
await result(U.u1, today, 60, 60000, 'AE', { ranked: false, uname: 'Ada' });           // practice (unranked)
// Yesterday tie-break fixture: identical score+time+completed → id decides.
await db.query(
  `insert into attempts (id, user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
   values ('c0000000-0000-0000-0000-000000000001', $1, 'tiebreakinstall1', 'pk', true, $3::date, 'completed', 88, 88000, now(), 'GB', 'Hal', 100, 'clean'),
          ('c0000000-0000-0000-0000-000000000002', $2, 'tiebreakinstall2', 'pk', true, $3::date, 'completed', 88, 88000, now(), 'GB', 'Ivy', 100, 'clean')`,
  [U.u9, U.u10, yesterday]);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const call = async (id, sql, params = []) => { await actAs(db, id); const r = (await db.query(sql, params)).rows[0]; return r; };

// =============================================================================
// 1. Ranking order + positions + totals + percentile (get_my_daily_rank)
// =============================================================================
{
  const a = (await call(U.u1, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('Ada is global #1 of 5', a.global_position === 1 && a.global_total === 5);
  ok('Ada is country(AE) #1 of 2', a.country_position === 1 && a.country_total === 2 && a.country_code === 'AE');
  ok('Ada percentile is top bracket (ceil 100*1/5 = 20)', a.global_percentile === 20);
  ok('Ada summary is safe (no user_id/attempt id)', !('user_id' in a) && !('attempt_id' in a) && a.has_result === true && a.score === 100);

  const b = (await call(U.u2, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('Ben ranks below Ada on solve time (same score) → global #2', b.global_position === 2);

  const c = (await call(U.u3, `select get_my_daily_rank($1::date) r`, [today])).r;
  const d = (await call(U.u4, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('Cid before Dee on completed_at (same score+time) → #3 then #4', c.global_position === 3 && d.global_position === 4);
  ok('Cid is US #1 of 3, Dee US #2', c.country_position === 1 && c.country_total === 3 && d.country_position === 2);

  const e = (await call(U.u5, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('Eve is global last (#5) → percentile 100', e.global_position === 5 && e.global_percentile === 100);
}

// Deterministic id tie-break (identical score+time+completed).
{
  const hal = (await call(U.u9, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [yesterday])).r;
  const pos = Object.fromEntries(hal.rows.map((x) => [x.username, x.position]));
  ok('id tie-break: lower attempt id ranks first (Hal #1, Ivy #2)', pos.Hal === 1 && pos.Ivy === 2 && hal.total === 2);
}

// Percentile edge: a single-player country (none today has 1) — verify null via a viewer-only future setup is covered elsewhere; check GB single-scope:
{
  const halGb = (await call(U.u9, `select get_my_daily_rank($1::date) r`, [yesterday])).r;
  ok('GB has 2 players → percentile defined (not null)', halGb.country_total === 2 && halGb.country_percentile !== null);
}

// =============================================================================
// 2. Exclusions — practice / incomplete / invalidated / anonymous / no-result
// =============================================================================
{
  const g = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  const names = g.rows.map((x) => x.username);
  ok('leaderboard has exactly the 5 valid rows', g.total === 5 && g.rows.length === 5);
  ok('practice (unranked) attempt excluded', !names.includes('Ada') || names.filter((n) => n === 'Ada').length === 1);
  ok('incomplete attempt (Fin) excluded', !names.includes('Fin'));
  ok('invalidated attempt (Gus) excluded', !names.includes('Gus'));

  // A permanent user with no ranked result today: has_result false, not locked.
  const v = (await call(U.viewer, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('a permanent viewer with no result: has_result false, not locked', v.locked === false && v.has_result === false && v.country_code === 'AE');
  // …but they can still read the leaderboard rows.
  const vlb = (await call(U.viewer, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  ok('a permanent viewer can read leaderboard rows', vlb.locked === false && vlb.total === 5);

  // Anonymous-Auth user is LOCKED (no rows, no position).
  const anonRank = (await call(U.anon, `select get_my_daily_rank($1::date) r`, [today])).r;
  const anonLb = (await call(U.anon, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  ok('anonymous-Auth user gets a locked rank summary', anonRank.locked === true && !('global_position' in anonRank));
  ok('anonymous-Auth user gets a locked leaderboard (no rows)', anonLb.locked === true && (anonLb.rows === undefined || anonLb.rows.length === 0));

  // Future date returns empty, never rows.
  const fut = (await call(U.u1, `select get_daily_leaderboard('global', ((now() at time zone 'utc')::date + 5)::date, 0, 50) r`)).r;
  ok('a future date yields no leaderboard rows', fut.total === 0 && fut.rows.length === 0);
}

// =============================================================================
// 3. Country scope is server-derived (no client country injection)
// =============================================================================
{
  const ae = (await call(U.u1, `select get_daily_leaderboard('country', $1::date, 0, 50) r`, [today])).r;
  ok('Ada country scope = AE (her snapshot), 2 rows', ae.country_code === 'AE' && ae.total === 2 && ae.rows.every((x) => x.country_code === 'AE'));
  const us = (await call(U.u3, `select get_daily_leaderboard('country', $1::date, 0, 50) r`, [today])).r;
  ok('Cid country scope = US (his snapshot), 3 rows', us.country_code === 'US' && us.total === 3);
  ok('there is NO country parameter to inject — scope derives from the caller',
    (await q(`select count(*)::int c from information_schema.parameters where specific_name like 'get_daily_leaderboard%' and parameter_name ilike '%country%'`))[0].c === 0);
}

// =============================================================================
// 4. Pagination — no duplicates, no omissions, clamps, safe cursor
// =============================================================================
{
  const p1 = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 0, 2) r`, [today])).r;
  ok('page 1: positions 1..2, has_more, next_after=2', p1.rows.map((x) => x.position).join() === '1,2' && p1.has_more === true && p1.next_after === 2);
  const p2 = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 2, 2) r`, [today])).r;
  ok('page 2: positions 3..4', p2.rows.map((x) => x.position).join() === '3,4' && p2.has_more === true);
  const p3 = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 4, 2) r`, [today])).r;
  ok('page 3: position 5, end of list', p3.rows.map((x) => x.position).join() === '5' && p3.has_more === false && p3.next_after === null);

  const allPos = [...p1.rows, ...p2.rows, ...p3.rows].map((x) => x.position);
  ok('paging covers 1..5 with no duplicates and no omissions', allPos.join() === '1,2,3,4,5' && new Set(allPos).size === 5);

  const clamp = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 0, 500) r`, [today])).r;
  ok('page size is clamped to the 100 hard cap', clamp.page_size === 100 && clamp.rows.length === 5);
  const neg = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, -10, 2) r`, [today])).r;
  ok('a negative cursor is clamped to 0', neg.after_position === 0 && neg.rows[0].position === 1);
  const past = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 999, 2) r`, [today])).r;
  ok('a cursor past the end yields no rows (no error)', past.rows.length === 0 && past.has_more === false);
  const bad = (await call(U.u1, `select get_daily_leaderboard('sideways', $1::date, 0, 50) r`, [today])).r;
  ok('an unknown scope falls back to global', bad.scope === 'global' && bad.total === 5);
}

// =============================================================================
// 5. Public row contract — only safe fields, current-user flag
// =============================================================================
{
  const lb = (await call(U.u3, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  const row = lb.rows[0];
  const allowed = new Set(['position', 'username', 'country_code', 'score', 'solve_ms', 'is_current_user']);
  ok('a leaderboard row exposes ONLY the safe fields', Object.keys(row).every((k) => allowed.has(k)));
  ok('rows carry no user_id / attempt id / integrity / email',
    lb.rows.every((x) => !('user_id' in x) && !('attempt_id' in x) && !('id' in x) && !('integrity_status' in x) && !('email' in x)));
  ok('is_current_user marks exactly the caller\'s row', lb.rows.filter((x) => x.is_current_user).length === 1 &&
    lb.rows.find((x) => x.is_current_user).username === 'Cid');
}

// =============================================================================
// 6. Security — grants, roles, direct access
// =============================================================================
{
  await db.exec(`reset role;`);
  await db.exec(`set role anon;`);
  await expectFail('anon (publishable) cannot call get_daily_leaderboard', () => db.query(`select get_daily_leaderboard('global')`), 'permission denied');
  await expectFail('anon (publishable) cannot call get_my_daily_rank', () => db.query(`select get_my_daily_rank()`), 'permission denied');
  await db.exec(`reset role;`);

  // A permanent user cannot read the attempts table directly at all (no grant) —
  // the ONLY path to ranked data is the sanitized RPCs.
  await actAs(db, U.u1);
  await expectFail('direct attempts access is denied (no table grant)', () => db.query(`select count(*) from attempts where user_id <> $1`, [U.u2]), 'permission denied');
  await actAs(db, null);
  await db.exec(`reset role;`);

  // ranked_result_projection remains service-role only.
  await db.exec(`set role authenticated;`);
  await expectFail('authenticated cannot read ranked_result_projection', () => db.query(`select * from ranked_result_projection limit 1`), 'permission denied');
  await db.exec(`reset role;`);
}

// =============================================================================
// 7. Void recalculation re-orders deterministically + flags the result
// =============================================================================
{
  // Ben (u2) is global #2. Void-recalc his attempt (no live items → score 0),
  // which must drop him and shift the field up.
  await db.exec(`reset role;`);
  const bid = (await q(`select id from attempts where user_id=$1 and ranked_date=$2::date and is_ranked and status='completed'`, [U.u2, today]))[0].id;
  const rc = (await q(`select recalculate_ranked_result($1) r`, [bid]))[0].r;
  ok('recalc succeeds and bumps the version', rc.ok === true && rc.recalc_version === 1);

  const b = (await call(U.u2, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('after void, Ben\'s score is corrected and marked updated_after_validation', b.score === 0 && b.updated_after_validation === true);
  ok('after void, Ben drops to global last (#5)', b.global_position === 5);
  const c = (await call(U.u3, `select get_my_daily_rank($1::date) r`, [today])).r;
  ok('after void, Cid moves up to global #2', c.global_position === 2);
  const lb = (await call(U.u1, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  ok('no duplicate row appears after recalculation', new Set(lb.rows.map((x) => x.username)).size === 5 && lb.total === 5);
}

// =============================================================================
// 8. MUTATION sentinels — a broken rule MUST change the answer
// =============================================================================
{
  // The GB pair (Hal/Ivy) is identical on score+time+completed, so ONLY the id
  // tie-break separates them. Reversing that tie-break would flip the order —
  // proving the deterministic final tie-break is load-bearing.
  const gb = (await call(U.u9, `select get_daily_leaderboard('global', $1::date, 0, 50) r`, [yesterday])).r;
  await db.exec(`reset role;`); // owner, to run the raw comparison queries below
  const halPos = gb.rows.find((x) => x.username === 'Hal').position;
  const reversed = (await q(
    `select username_snapshot u, row_number() over (order by final_score desc, total_solve_ms asc, completed_at asc, id DESC) p
       from attempts where ranked_date=$1::date and is_ranked and status='completed' and integrity_status='clean' and country_code_snapshot='GB'`, [yesterday]));
  const halReversed = Number(reversed.find((x) => x.u === 'Hal')?.p);
  ok('MUTATION: reversing the id tie-break flips the GB order (final tie-break is load-bearing)',
    halPos === 1 && halReversed !== 1);

  // Dropping the validity filter would resurrect the invalidated 95-score row.
  const withInvalid = (await q(
    `select count(*)::int c from attempts where ranked_date=$1::date and is_ranked and status='completed'`, [today]))[0].c;
  const validOnly = (await q(
    `select count(*)::int c from attempts where ranked_date=$1::date and is_ranked and status='completed' and integrity_status='clean'`, [today]))[0].c;
  ok('MUTATION: dropping the integrity filter would add the invalidated row', withInvalid === validOnly + 1 && validOnly === 5);
}

// =============================================================================
// 9. Query plan at volume — the composite partial index serves the ordering
// =============================================================================
{
  await db.exec(`reset role;`);
  const perf = (await q(`select ((now() at time zone 'utc')::date - 10)::text d`))[0].d;
  // 600 valid ranked rows on one date across 600 distinct auth users.
  await db.exec(`
    with u as (
      insert into auth.users (id, is_anonymous)
        select gen_random_uuid(), false from generate_series(1, 600) returning id
    )
    insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status,
        final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
      select u.id, 'perfinstall' || lpad((row_number() over ())::text, 6, '0'), 'pk', true, '${perf}'::date, 'completed',
             (random() * 100)::int, (random() * 300000)::bigint, now() - ((random() * 1000)::int || ' seconds')::interval,
             (array['AE','US','GB'])[1 + floor(random() * 3)], 'Perf' || (row_number() over ()), 100, 'clean'
        from u;`);
  await db.exec(`analyze attempts;`);

  // Both leaderboard indexes exist (they back the global + country day filters).
  const idx = (await q(`select indexname from pg_indexes where tablename='attempts' and indexname like 'attempts_leaderboard%'`)).map((r) => r.indexname).sort();
  ok('the global + country leaderboard indexes exist', idx.join() === 'attempts_leaderboard_country_idx,attempts_leaderboard_global_idx');

  const countrySql = `explain (analyze, format text)
    select a.username_snapshot,
           row_number() over (order by a.final_score desc, a.total_solve_ms asc, a.completed_at asc, a.id asc) p
      from attempts a
     where a.ranked_date = '${perf}'::date and a.country_code_snapshot = 'US'
       and a.is_ranked and a.status = 'completed' and a.integrity_status = 'clean'`;
  const globalSql = countrySql.replace(` and a.country_code_snapshot = 'US'`, '');

  const planGlobal = (await q(globalSql)).map((r) => r['QUERY PLAN']).join('\n');
  // Prove the composite country index is ALIGNED: when a plain seq-scan is off the
  // planner satisfies the country filter + full ordering from the index alone (no
  // Sort). At real volume this is the natural choice; at 610 rows a seq-scan+sort
  // (~2ms) is optimal and correct, which is what we document below.
  await db.exec(`set enable_seqscan = off; set enable_bitmapscan = off;`);
  const planCountryIdx = (await q(countrySql)).map((r) => r['QUERY PLAN']).join('\n');
  await db.exec(`set enable_seqscan = on; set enable_bitmapscan = on;`);
  ok('attempts_leaderboard_country_idx can serve the country filter + ranking order with no Sort',
    /Index Scan using attempts_leaderboard_country_idx/.test(planCountryIdx) && !/\bSort\b/i.test(planCountryIdx));
  console.log(`\n  plan (global day read, 610 rows, default): ${planGlobal.split('\n')[0].trim()}`);
  console.log(`  plan (country, index path):                 ${planCountryIdx.split('\n').find((l) => /Index Scan/.test(l))?.trim() ?? planCountryIdx.split('\n')[0].trim()}`);
}

if (failures.length) {
  console.error(`\n${failures.length} LEADERBOARD DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} leaderboard DB checks passed — ordering, positions, percentile, pagination, exclusions, security, and void recalc all hold`);
