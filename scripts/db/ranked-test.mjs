/**
 * Ranked daily-attempt DB tests — `npm run db:ranked-test`.
 *
 * Applies the real migrations into PGlite (with the auth-schema stand-in) and
 * proves the server-authoritative ranked rules that gameplay-sim can't reach
 * from the flow layer:
 *
 *   • the full check_rank_eligibility reason matrix, in precedence order;
 *   • ranked identity / score immutability at the DB (trigger) level;
 *   • the one-ranked-per-user-per-date partial unique index;
 *   • country-change cooldown + first-set-free;
 *   • void recalculation math (renormalize, all-void → 0, idempotent);
 *   • RLS/grants: ranked_result_projection and the privileged functions are NOT
 *     reachable by anon/authenticated (each denial is run and asserted).
 *
 * The eligible / in-progress / completed happy paths (which need a fully
 * published live pack) are covered end-to-end by gameplay-sim; here we drive
 * the negative reasons, all of which resolve before the live-pack check, so no
 * content pipeline is needed.
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
passed++; // migrations applied with the full ranked stack

const today = (await db.query(`select (now() at time zone 'utc')::date::text d`)).rows[0].d;
const P = '11111111-1111-1111-1111-111111111111'; // permanent, complete
const A = '22222222-2222-2222-2222-222222222222'; // anonymous
await db.query(`insert into auth.users (id, is_anonymous) values ($1, false), ($2, true)`, [P, A]);

/** Run check_rank_eligibility as service_role and return the jsonb. */
async function elig(user, appVersion = '1.0.0') {
  await db.exec(`reset role;`);
  return (await db.query(`select check_rank_eligibility($1,$2,$3::date) e`, [user, appVersion, today])).rows[0].e;
}

// =============================================================================
// 1. Eligibility reason matrix (precedence order, no live pack yet)
// =============================================================================

ok('null user → anonymous_account', (await elig(null)).reason === 'anonymous_account');
ok('anonymous account → anonymous_account', (await elig(A)).reason === 'anonymous_account');

// Permanent but no username/country yet → incomplete_profile.
ok('permanent, no username → incomplete_profile', (await elig(P)).reason === 'incomplete_profile');

// Give a username + country → onboarding completes.
await actAs(db, P);
await db.query(`select set_username('Ranked_01')`);
await db.query(`select set_country('AE', true)`);
await db.exec(`reset role;`);
ok('complete profile, no live pack → no_live_pack', (await elig(P)).reason === 'no_live_pack');

// Invalid country: deactivate AE → the completed profile now has an inactive country.
await db.exec(`update countries set active=false where code='AE';`);
ok('completed profile with a now-inactive country → invalid_country', (await elig(P)).reason === 'invalid_country');
await db.exec(`update countries set active=true where code='AE';`);

// Integrity restriction shadows everything below it.
await db.exec(`update profiles set rank_restricted_until = now() + interval '1 day' where id=$1;`.replace('$1', `'${P}'`));
ok('a live integrity restriction → integrity_restricted', (await elig(P)).reason === 'integrity_restricted');
await db.exec(`update profiles set rank_restricted_until = null where id='${P}';`);

// Unsupported app version (checked before the live-pack lookup).
ok('an old app version → unsupported_app_version', (await elig(P, '0.9.0')).reason === 'unsupported_app_version');
ok('a null app version is treated as advisory-absent (not blocked here)', (await elig(P, null)).reason === 'no_live_pack');
ok('app_version_ok accepts the minimum and rejects below it',
  (await db.query(`select app_version_ok('1.0.0') a, app_version_ok('0.9.9') b, app_version_ok('2.3.1') c`)).rows[0] &&
  (await db.query(`select app_version_ok('1.0.0') a`)).rows[0].a === true &&
  (await db.query(`select app_version_ok('0.9.9') a`)).rows[0].a === false);

// The safe shape carries no sensitive fields.
{
  const e = await elig(P);
  ok('eligibility shape is non-sensitive (no email / integrity reason / answers)',
    !('email' in e) && !('rank_restricted_until' in e) && !('final_score' in e) &&
    typeof e.message === 'string' && 'practice_available' in e);
}

// =============================================================================
// 2. Client exposure: get_today_player_status vs the raw function
// =============================================================================

await actAs(db, P);
{
  const s = (await db.query(`select get_today_player_status('1.0.0') s`)).rows[0].s;
  ok('get_today_player_status returns the caller\'s status (auth.uid scoped)', s.reason === 'no_live_pack' && s.today === today);
}
ok('is_rank_eligible delegates to the real rules (false without a pack)',
  (await db.query(`select is_rank_eligible() e`)).rows[0].e === false);
// A client must NOT be able to query another user's ranked status by id.
await expectFail('authenticated cannot call check_rank_eligibility for an arbitrary user',
  () => db.query(`select check_rank_eligibility($1)`, [A]), 'permission denied');
await actAs(db, null);
await db.exec(`reset role;`);

// =============================================================================
// 3. One ranked result per user per UTC date (partial unique index)
// =============================================================================

await db.exec(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ('pk',0,'draft','${'a'.repeat(64)}','standard');`);
await db.query(
  `insert into attempts (session_id, pack_id, user_id, is_ranked, ranked_date, country_code_snapshot, username_snapshot, active_denominator, status, final_score, completed_at)
   values ('rankedinstall0001','pk',$1,true,$2::date,'AE','Ranked_01',100,'completed',80,now())`, [P, today]);
ok('a ranked row exists for the user/date', (await db.query(`select count(*)::int c from attempts where is_ranked and user_id=$1 and ranked_date=$2::date`, [P, today])).rows[0].c === 1);
await expectFail('a second ranked row for the same user/date is rejected by the unique index',
  () => db.query(`insert into attempts (session_id, pack_id, user_id, is_ranked, ranked_date, country_code_snapshot) values ('rankedinstall0002','pk',$1,true,$2::date,'AE')`, [P, today]),
  'duplicate|unique');
// But an UNRANKED practice attempt on the same date is fine (index is partial).
await db.query(`insert into attempts (session_id, pack_id, user_id) values ('practiceinstall01','pk',$1)`, [P]);
ok('an unranked practice attempt on the same date is allowed', (await db.query(`select count(*)::int c from attempts where user_id=$1 and is_ranked=false`, [P])).rows[0].c === 1);

// =============================================================================
// 4. Ranked identity + score immutability (terminal trigger)
// =============================================================================

const rid = (await db.query(`select id from attempts where is_ranked and user_id=$1`, [P])).rows[0].id;
await expectFail('a completed ranked score cannot be edited without a recalc bump',
  () => db.query(`update attempts set final_score=95 where id=$1`, [rid]), 'is final');
await expectFail('the ranked date is immutable', () => db.query(`update attempts set ranked_date=(current_date-1) where id=$1`, [rid]), 'immutable');
await expectFail('the country snapshot is immutable', () => db.query(`update attempts set country_code_snapshot='US' where id=$1`, [rid]), 'immutable');
await expectFail('the ranked flag cannot be cleared', () => db.query(`update attempts set is_ranked=false where id=$1`, [rid]), 'immutable');
await expectFail('a completed attempt cannot be reopened', () => db.query(`update attempts set status='active' where id=$1`, [rid]), 'reopened');
// The ranked-requires-fields constraint blocks a half-formed ranked row.
await expectFail('a ranked row without a country snapshot is rejected',
  () => db.query(`insert into attempts (session_id, pack_id, user_id, is_ranked, ranked_date) values ('badrankedinstall1','pk',$1,true,$2::date)`, [A, today]), 'ranked_requires_fields|check');

// =============================================================================
// 5. Void recalculation edge behaviour (all-void → 0, idempotent, refusal)
// =============================================================================
// The survivor renormalization (real slots → a specific number) is proven with
// live content in gameplay-sim. Here we drive the DB-level guards a slotless
// fixture can reach: an all-void pack must resolve to 0 over 100 (no
// divide-by-zero), the write must be idempotent, and non-ranked attempts refused.

await db.exec(`reset role;`);
const R2 = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [R2]);
await db.exec(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ('pk2',1,'draft','${'c'.repeat(64)}','standard');`);
const a2 = (await db.query(
  `insert into attempts (session_id, pack_id, user_id, is_ranked, ranked_date, country_code_snapshot, username_snapshot, active_denominator, status, final_score, completed_at)
   values ('recalcinstall0001','pk2',$1,true,$2::date,'AE','Ranked_01',100,'completed',80,now()) returning id`, [R2, today])).rows[0].id;
// pk2 has no live slots → recalc treats it as fully void: 0 over a safe 100.
const rc = (await db.query(`select recalculate_ranked_result($1) r`, [a2])).rows[0].r;
ok('an all-void pack recalculates to 0 over 100 (no divide-by-zero)', rc.ok === true && rc.final_score === 0 && rc.active_denominator === 100);
ok('the recalc bumps recalc_version once (80 → 0)', rc.recalc_version === 1);
const rc2 = (await db.query(`select recalculate_ranked_result($1) r`, [a2])).rows[0].r;
ok('the recalc is idempotent (no second bump)', rc2.final_score === 0 && rc2.recalc_version === 1);
// Recalc refuses a non-ranked attempt.
await db.query(`insert into attempts (id, session_id, pack_id, user_id) values ('bbbbbbbb-0000-0000-0000-000000000001','unrankedinstall1','pk2',$1)`, [R2]);
const rc4 = (await db.query(`select recalculate_ranked_result('bbbbbbbb-0000-0000-0000-000000000001') r`)).rows[0].r;
ok('recalc refuses a non-ranked attempt', rc4.ok === false);

// =============================================================================
// 6. Country-change cooldown (reduces country-hopping before leaderboards)
// =============================================================================

const C = '44444444-4444-4444-4444-444444444444';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [C]);
await actAs(db, C);
await db.query(`select set_username('Hopper_01')`);
await db.query(`select set_country('AE', true)`); // first set is free
ok('first country set records country_changed_at',
  (await db.query(`select country_changed_at from profiles where id=$1`, [C])).rows[0].country_changed_at !== null);
await db.query(`select set_country('AE', true)`); // same code is a no-op, not a cooldown hit
ok('re-setting the same country is allowed (no-op)', (await db.query(`select country_code from profiles where id=$1`, [C])).rows[0].country_code === 'AE');
await expectFail('changing country within the cooldown window is rejected',
  () => db.query(`select set_country('US', true)`), 'country_cooldown');
// After the cooldown, the change goes through.
await db.exec(`reset role;`);
await db.query(`update profiles set country_changed_at = now() - interval '8 days' where id=$1`, [C]);
await actAs(db, C);
await db.query(`select set_country('US', true)`);
ok('a country change after the cooldown succeeds', (await db.query(`select country_code from profiles where id=$1`, [C])).rows[0].country_code === 'US');
await actAs(db, null);
await db.exec(`reset role;`);

// =============================================================================
// 7. RLS / grants: the ranked projection + privileged fns are server-only
// =============================================================================

await db.exec(`set role authenticated;`);
await expectFail('authenticated cannot read ranked_result_projection', () => db.query(`select * from ranked_result_projection limit 1`), 'permission denied');
await expectFail('authenticated cannot run recalculate_ranked_result', () => db.query(`select recalculate_ranked_result('${rid}')`), 'permission denied');
await db.exec(`reset role;`);
await db.exec(`set role anon;`);
await expectFail('anon cannot read ranked_result_projection', () => db.query(`select * from ranked_result_projection limit 1`), 'permission denied');
await expectFail('anon cannot call get_today_player_status', () => db.query(`select get_today_player_status()`), 'permission denied');
await db.exec(`reset role;`);
// The projection excludes answers/tokens/integrity reasons/email by construction.
{
  const cols = (await db.query(`select column_name from information_schema.columns where table_name='ranked_result_projection'`)).rows.map((r) => r.column_name);
  ok('the ranked projection exposes only safe, leaderboard-ready columns',
    cols.includes('brewscore') && cols.includes('country_code_snapshot') && cols.includes('username_snapshot') &&
    !cols.includes('answer_payload') && !cols.includes('email') && !cols.includes('invalidation_reason') && !cols.includes('integrity_reason'));
}

if (failures.length) {
  console.error(`\n${failures.length} RANKED DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} ranked DB checks passed — eligibility, immutability, recalc, cooldown, and RLS all hold`);
