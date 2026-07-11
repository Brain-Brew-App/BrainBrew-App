/**
 * Practice / attempt-purpose DB tests — `npm run db:share-practice-test`.
 *
 * Proves the Phase 7A server guarantees:
 *   • attempt_purpose is SERVER-derived (ranked / practice / guest) and a
 *     client-supplied value is overwritten;
 *   • practice attempts are excluded from EVERY ranked surface — leaderboards,
 *     progress/streaks, and the ranked_result_projection;
 *   • a practice row can never satisfy ranked uniqueness or be marked ranked by a
 *     client.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AUTH_MOCK, actAs } from './pglite-harness.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection, but it succeeded`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`); else passed++; }
}

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
await db.exec(`set time zone 'UTC';`);
await db.exec(AUTH_MOCK);
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8')); }
  catch (e) { console.error(`Migration ${file} failed: ${e.message}`); process.exit(1); }
}
passed++;

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = (r) => (r.length ? r[0] : null);
const today = (await q(`select (now() at time zone 'utc')::date::text d`))[0].d;
await db.exec(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ('pk',0,'draft','${'a'.repeat(64)}','standard');`);

const PERM = '11111111-1111-1111-1111-111111111111';
const ANON = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,true)`, [PERM, ANON]);
await db.query(`update profiles set username='Perm', username_normalized='perm', country_code='AE', display_country=true, onboarding_status='complete' where id=$1`, [PERM]);

// --- attempt_purpose derivation ---
// Ranked (permanent) → 'ranked'
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator)
  values ($1,'rankedinstall001','pk',true,$2::date,'completed',90,100000,now(),'AE','Perm',100)`, [PERM, today]);
// Practice (permanent, unranked) → 'practice'; client tries to claim 'ranked' → overwritten
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, attempt_purpose, status, final_score, completed_at)
  values ($1,'practiceinstall1','pk',false,'ranked','completed',60,now())`, [PERM]);
// Guest (anonymous, unranked) → 'guest'
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, status, final_score, completed_at)
  values ($1,'guestinstall0001','pk',false,'completed',50,now())`, [ANON]);

const purposes = Object.fromEntries((await q(`select attempt_purpose, is_ranked, user_id from attempts`)).map((r) => [`${r.user_id}:${r.is_ranked}`, r.attempt_purpose]));
ok('a ranked attempt derives attempt_purpose = ranked', purposes[`${PERM}:true`] === 'ranked');
ok('a permanent unranked attempt derives attempt_purpose = practice (client value overwritten)', purposes[`${PERM}:false`] === 'practice');
ok('an anonymous unranked attempt derives attempt_purpose = guest', purposes[`${ANON}:false`] === 'guest');
ok('attempt_purpose is NOT NULL for every row', (await q(`select bool_and(attempt_purpose is not null) b from attempts`))[0].b === true);

// --- Practice cannot satisfy ranked uniqueness (partial unique index is WHERE is_ranked) ---
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, status, final_score, completed_at) values ($1,'practiceinstall2','pk',false,'completed',70,now())`, [PERM]);
ok('a permanent user may hold many practice attempts (ranked uniqueness untouched)',
  (await q(`select count(*)::int c from attempts where user_id=$1 and attempt_purpose='practice'`, [PERM]))[0].c === 2);

// --- Practice excluded from every ranked surface ---
{
  await actAs(db, PERM, { isAnonymous: false });
  const rank = one(await q(`select get_my_progress_summary($1::date) r`, [today])).r;
  ok('progress streak counts ONLY the ranked day (practice excluded)', rank.ranked_days_completed === 1 && rank.current_streak === 1);
  const lb = one(await q(`select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  ok('leaderboard shows only the ranked result (practice excluded)', lb.total === 1 && lb.rows.every((x) => x.score === 90));
  await actAs(db, null);
  await db.exec(`reset role;`);
  const proj = await q(`select count(*)::int c from ranked_result_projection`);
  ok('ranked_result_projection excludes practice (only the ranked row)', proj[0].c === 1);
}

// --- A client cannot mark a practice attempt ranked ---
await actAs(db, PERM, { isAnonymous: false });
await expectFail('a client cannot flip a practice attempt to ranked (no write grant)',
  () => db.query(`update attempts set is_ranked=true where user_id=$1 and attempt_purpose='practice'`, [PERM]), 'permission denied');
await actAs(db, null);
await db.exec(`reset role;`);

if (failures.length) {
  console.error(`\n${failures.length} SHARE/PRACTICE DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} share/practice DB checks passed — attempt_purpose derivation + practice isolation hold`);
