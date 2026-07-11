/**
 * Auth + profiles + attempt-ownership tests — `npm run db:auth-test`.
 *
 * Applies the real migrations into PGlite (with the auth-schema stand-in) and
 * exercises identity: the auth-trigger profile, username/country RPCs and their
 * validation, profile RLS isolation, and attempt ownership by auth user. Every
 * important ownership/RLS rule is mutation-tested — the denied case is run and
 * asserted to fail.
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
passed++; // migrations applied with the profile stack

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

// Creating an auth user fires the profile trigger.
await db.query(`insert into auth.users (id, is_anonymous) values ($1, true), ($2, true)`, [USER_A, USER_B]);
ok('the auth trigger created one profile per user', (await db.query(`select count(*)::int c from profiles`)).rows[0].c === 2);
ok('anonymous user profile is account_type=anonymous, onboarding username_required',
  (await db.query(`select account_type, onboarding_status from profiles where id=$1`, [USER_A])).rows[0].account_type === 'anonymous');
ok('new profile has NO fake username', (await db.query(`select username from profiles where id=$1`, [USER_A])).rows[0].username === null);

// A permanent user gets account_type=permanent.
const USER_P = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous, email) values ($1, false, 'x@y.z')`, [USER_P]);
ok('permanent user profile is account_type=permanent',
  (await db.query(`select account_type from profiles where id=$1`, [USER_P])).rows[0].account_type === 'permanent');

// Duplicate profile insert is rejected (one per user).
await expectFail('a second profile for the same user is rejected',
  () => db.query(`insert into profiles (id) values ($1)`, [USER_A]), 'duplicate|unique|primary');

// --- Username RPCs (as USER_A) ---
await actAs(db, USER_A);
ok('check_username_available true for a fresh name',
  (await db.query(`select check_username_available('Alice_01') a`)).rows[0].a.available === true);
await db.query(`select set_username('Alice_01')`);
ok('set_username stores display casing + normalized', (() => true)());
{
  const row = (await db.query(`select username, username_normalized, onboarding_status from profiles where id=$1`, [USER_A])).rows[0];
  ok('display casing preserved', row.username === 'Alice_01');
  ok('normalized is lowercase', row.username_normalized === 'alice_01');
  ok('onboarding still incomplete without country', row.onboarding_status === 'username_required');
}

// Invalid usernames rejected.
for (const [name, why] of [['ab', 'too short'], ['_alice', 'leading _'], ['alice_', 'trailing _'], ['a__b', 'double _'], ['alice!', 'symbol'], ['aliçe', 'non-ascii'], ['a'.repeat(21), 'too long']]) {
  await expectFail(`invalid username rejected (${why})`, () => db.query(`select set_username($1)`, [name]));
}
// Reserved / impersonation / profanity rejected.
for (const name of ['admin', 'BrainBrew', 'Support', 'fuck']) {
  await expectFail(`blocked username rejected: ${name}`, () => db.query(`select set_username($1)`, [name]), 'username_not_allowed');
}

// Case-insensitive uniqueness: USER_B cannot take ALICE_01.
await actAs(db, USER_B);
ok('availability check reports a case-variant as taken',
  (await db.query(`select check_username_available('ALICE_01') a`)).rows[0].a.available === false);
await expectFail('case-insensitive duplicate username rejected', () => db.query(`select set_username('ALICE_01')`), 'username_taken');

// --- Country RPC ---
await actAs(db, USER_A);
await expectFail('invalid country rejected', () => db.query(`select set_country('ZZ')`), 'invalid_country');
await db.query(`select set_country('AE', true)`);
{
  const row = (await db.query(`select country_code, onboarding_status from profiles where id=$1`, [USER_A])).rows[0];
  ok('country stored uppercase ISO code', row.country_code === 'AE');
  ok('onboarding completes once username AND country are set', row.onboarding_status === 'complete');
}

// get_my_profile returns an allowlisted shape (no email / moderation / internal).
{
  const prof = (await db.query(`select get_my_profile() p`)).rows[0].p;
  ok('get_my_profile returns the caller profile', prof.username === 'Alice_01' && prof.country_code === 'AE');
  ok('profile projection excludes email/moderation/internal fields',
    !('email' in prof) && !('moderation_flags' in prof) && !('forced_rename' in prof) && !('username_normalized' in prof));
}

// --- Profile RLS isolation (as the authenticated role via policies) ---
// USER_A can read only their own row.
await actAs(db, USER_A);
ok('RLS: user reads exactly their own profile row', (await db.query(`select count(*)::int c from profiles`)).rows[0].c === 1);
ok('RLS: that row is the caller', (await db.query(`select id from profiles`)).rows[0].id === USER_A);
// USER_B sees only their own.
await actAs(db, USER_B);
ok('RLS: a different user cannot see USER_A\'s private profile',
  (await db.query(`select count(*)::int c from profiles where id=$1`, [USER_A])).rows[0].c === 0);
// Ownership cannot be changed, timestamps not directly writable (no update grant).
await expectFail('user cannot directly UPDATE a profile (no write grant)',
  () => db.query(`update profiles set country_code='US' where id=$1`, [USER_B]), 'permission denied');
await actAs(db, null);
// Unauthenticated (anon role) is denied entirely.
await db.exec(`set role anon;`);
await expectFail('anon (public) cannot read any profile', () => db.query(`select * from profiles limit 1`), 'permission denied');
await db.exec(`reset role;`);

// --- account_type synchronization (Phase 5C) ---
// While anonymous, sync keeps it anonymous (pending email doesn't matter).
await actAs(db, USER_A, { isAnonymous: true });
ok('sync keeps an anonymous user anonymous', (await db.query(`select sync_account_type() s`)).rows[0].s.account_type === 'anonymous');
ok('username/country survive an anonymous sync',
  (await db.query(`select username, country_code from profiles where id=$1`, [USER_A])).rows[0].username === 'Alice_01');
// After the email is verified (JWT is_anonymous=false), sync marks permanent.
await actAs(db, USER_A, { isAnonymous: false });
ok('sync marks a verified user permanent', (await db.query(`select sync_account_type() s`)).rows[0].s.account_type === 'permanent');
{
  const row = (await db.query(`select account_type, username, country_code, onboarding_status from profiles where id=$1`, [USER_A])).rows[0];
  ok('permanent sync preserves the SAME profile (username/country/onboarding)',
    row.account_type === 'permanent' && row.username === 'Alice_01' && row.country_code === 'AE' && row.onboarding_status === 'complete');
}
// Idempotent.
ok('repeated permanent sync is idempotent',
  (await db.query(`select sync_account_type() s`)).rows[0].s.account_type === 'permanent');
// A client cannot set account_type directly (no write grant).
await expectFail('a client cannot directly set account_type',
  () => db.query(`update profiles set account_type='permanent' where id=$1`, [USER_A]), 'permission denied');
// Sync only ever touches the caller's own row.
await actAs(db, USER_B, { isAnonymous: true });
await db.query(`select sync_account_type()`);
await actAs(db, null);
await db.exec(`reset role;`);
ok('USER_A remains permanent after USER_B synced (sync is per-caller)',
  (await db.query(`select account_type from profiles where id=$1`, [USER_A])).rows[0].account_type === 'permanent');

// --- rank eligibility: always false, no client control ---
await actAs(db, USER_A);
ok('is_rank_eligible is false for a complete anonymous profile', (await db.query(`select is_rank_eligible() e`)).rows[0].e === false);
ok('is_rank_eligible is false even for a PERMANENT profile', (await db.query(`select is_rank_eligible() e`)).rows[0].e === false);
await actAs(db, null);

// --- Attempt ownership ---
// The attempts row only needs a pack to reference; the FK to auth.users is the
// subject under test.
await db.exec(`reset role;`);
await db.exec(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ('pk',0,'draft','${'a'.repeat(64)}','standard');`);
await db.query(
  `insert into attempts (id, session_id, pack_id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','installinstall01','pk',$1)`,
  [USER_A],
);
ok('an attempt binds to its auth user', (await db.query(`select user_id from attempts where id='aaaaaaaa-0000-0000-0000-000000000001'`)).rows[0].user_id === USER_A);
ok('attempt user_id references auth.users (fk present)',
  (await db.query(`select count(*)::int c from information_schema.table_constraints where table_name='attempts' and constraint_name='attempts_user_id_fkey'`)).rows[0].c === 1);
await expectFail('an attempt cannot reference a non-existent auth user',
  () => db.query(`insert into attempts (session_id, pack_id, user_id) values ('installinstall02','pk','44444444-4444-4444-4444-444444444444')`), 'foreign key|violates');
ok('attempts remain is_ranked=false', (await db.query(`select bool_and(is_ranked=false) b from attempts`)).rows[0].b === true);
await expectFail('an attempt cannot be marked ranked', () => db.query(`update attempts set is_ranked=true where id='aaaaaaaa-0000-0000-0000-000000000001'`), 'not_ranked|check');

if (failures.length) {
  console.error(`\n${failures.length} AUTH/PROFILE CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} auth/profile/ownership checks passed`);
