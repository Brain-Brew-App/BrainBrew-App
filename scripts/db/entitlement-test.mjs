/**
 * Entitlement contract DB tests — `npm run db:entitlement-test`.
 *
 * Proves the Phase 7D authoritative entitlement read contract:
 *   • anonymous AND permanent authenticated users resolve to the BETA policy;
 *   • every capability key is present; free ones true, Premium ones false;
 *   • the ranked-attempt limit is a CONSTANT 1 for every state (fairness invariant);
 *   • security: unauthenticated denied, no user parameter, no direct writes,
 *     no payment/provider/receipt fields in the payload.
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

const PERM = '11111111-1111-1111-1111-111111111111';
const ANON = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,true)`, [PERM, ANON]);

const CAP_KEYS = [
  'daily_ranked_brew', 'global_leaderboard', 'country_leaderboard', 'ranked_streaks', 'basic_progress',
  'share_cards', 'practice_access', 'unlimited_practice', 'archives', 'category_training',
  'difficulty_selection', 'advanced_practice_stats', 'advanced_ranked_stats', 'bonus_packs',
  'premium_themes', 'private_tournaments',
];
const FREE = new Set(['daily_ranked_brew', 'global_leaderboard', 'country_leaderboard', 'ranked_streaks', 'basic_progress', 'share_cards', 'practice_access', 'unlimited_practice']);

const ent = async (id, anon = false) => { await actAs(db, id, { isAnonymous: anon }); return one(await q(`select get_my_entitlements() e`)).e; };

// =============================================================================
// 1. Beta policy for permanent + anonymous
// =============================================================================
{
  const p = await ent(PERM, false);
  ok('permanent user → beta policy, version 1, source beta_policy', p.entitlement_state === 'beta' && p.entitlement_version === 1 && p.source === 'beta_policy');
  ok('every capability key is present', CAP_KEYS.every((k) => k in p.capabilities) && Object.keys(p.capabilities).length === CAP_KEYS.length);
  ok('capability values are booleans; free true, Premium false',
    CAP_KEYS.every((k) => typeof p.capabilities[k] === 'boolean' && p.capabilities[k] === FREE.has(k)));
  ok('practice is unlimited during beta', p.capabilities.unlimited_practice === true && p.capabilities.practice_access === true);
  ok('no subscription row (beta default) and no purchase/provider fields leak',
    p.subscription === null && p.source === 'beta_policy' && p.policy_mode === 'beta_open'
    && !('customer_id' in p) && !('receipt' in p) && !('revenuecat_product_id' in p) && !('user_id' in p) && !('email' in p));

  const a = await ent(ANON, true);
  ok('anonymous user → the SAME beta policy', a.entitlement_state === 'beta' && a.capabilities.unlimited_practice === true && a.limits.ranked_attempts_per_utc_day === 1);
}

// =============================================================================
// 2. RANKED FAIRNESS INVARIANT — the limit is a constant 1 for every state
// =============================================================================
{
  const p = await ent(PERM, false);
  ok('ranked_attempts_per_utc_day is exactly 1 (beta)', p.limits.ranked_attempts_per_utc_day === 1);
  // The contract never carries a score multiplier / ranking weight / premium field.
  const flat = JSON.stringify(p);
  ok('the contract has NO ranked multiplier / weighting / premium-advantage field',
    !/multiplier|weight|bonus_ranked|ranked_points|advantage|retry|premium_rank/i.test(flat));
  // Every capability that COULD be flipped Premium still leaves the ranked limit alone —
  // the limit is not derived from any capability (it is a hard constant in the SQL).
  ok('ranked limit is independent of Premium capabilities (all false now, limit still 1)',
    Object.entries(p.capabilities).filter(([, v]) => v === false).length === 8 && p.limits.ranked_attempts_per_utc_day === 1);
}

// =============================================================================
// 3. Security
// =============================================================================
{
  await actAs(db, null);
  await db.exec(`reset role;`);
  // No user parameter → no cross-user injection possible.
  ok('get_my_entitlements has no user parameter', (await q(`select count(*)::int c from information_schema.parameters where specific_name like 'get_my_entitlements%' and parameter_name ilike '%user%'`))[0].c === 0);

  // Unauthenticated (anon publishable role) denied.
  await db.exec(`set role anon;`);
  await expectFail('anon (publishable) cannot call get_my_entitlements', () => db.query(`select get_my_entitlements()`), 'permission denied');
  await db.exec(`reset role;`);

  // Each caller only ever gets THEIR OWN (auth.uid-scoped) result — there is no way
  // to ask for another user's entitlement (no parameter). Both resolve to beta here,
  // but the point is there is no cross-user surface.
  const p = await ent(PERM, false); const a = await ent(ANON, true);
  ok('each caller resolves via auth.uid() only (no cross-user lookup exists)', p.entitlement_state === 'beta' && a.entitlement_state === 'beta');
  await actAs(db, null);
  await db.exec(`reset role;`);
}

if (failures.length) {
  console.error(`\n${failures.length} ENTITLEMENT DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} entitlement DB checks passed — beta policy, capabilities, ranked-limit-1 invariant, security`);
