/**
 * RevenueCat subscription-sync DB tests — `npm run db:revenuecat-test`.
 *
 * Proves the Phase 7E server spine in PGlite:
 *   • player_entitlements is private (no client read/write; service-role only);
 *   • claim_webhook_event idempotency (new → true, duplicate → false, errored →
 *     re-claimable), finish_webhook_event status;
 *   • sync_player_entitlement: unknown user quarantined, bad state rejected,
 *     out-of-order stale rejected, duplicate event rejected, newer applied;
 *   • get_my_entitlements maps (policy_mode × state) correctly AND returns
 *     ranked_attempts_per_utc_day = 1 in EVERY state (fairness invariant);
 *   • policy modes: beta_open unlimited-for-all; sandbox_paywall free-limited /
 *     premium-unlimited; set_release_policy service-role only;
 *   • start_practice_pack enforces the paywall cap server-side (free capped,
 *     premium bypasses), beta_open never caps;
 *   • no provider/customer/product/store field leaks through get_my_entitlements.
 *
 * Includes the mutation cases the spec calls for.
 */

import { freshDb, actAs } from './pglite-harness.mjs';

const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
// Server context = the PGlite superuser (owns the tables). SECURITY DEFINER RPCs
// run as their owner regardless; direct table inspection needs owner rights, and
// PGlite's `service_role` has BYPASSRLS but no table GRANTs. The service-role
// EXECUTE grant is proven separately (see the positive check below).
const svc = async () => { await actAs(db, null); };
const asUser = (id, anon = false) => actAs(db, id, { isAnonymous: anon });

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`); else passed++; }
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const UNKNOWN = '99999999-9999-9999-9999-999999999999';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false)`, [A, B]);

const entOf = async (uid, anon = false) => { await asUser(uid, anon); const e = one(await q(`select get_my_entitlements() e`)).e; await svc(); return e; };
const setMode = async (m) => { await svc(); await q(`select set_release_policy($1)`, [m]); };
const sync = async (uid, state, fields) => { await svc(); return one(await q(`select sync_player_entitlement($1,$2,$3::jsonb) r`, [uid, state, JSON.stringify(fields)])).r; };

// =============================================================================
// 1. Default policy is beta_open; a user with no row resolves to beta.
// =============================================================================
await svc();
ok('default release policy is beta_open', one(await q(`select current_release_policy() m`)).m === 'beta_open');
{
  const e = await entOf(A);
  ok('no row + beta_open → beta, unlimited practice, source beta_policy', e.entitlement_state === 'beta' && e.capabilities.unlimited_practice === true && e.source === 'beta_policy' && e.subscription === null);
  ok('ranked limit is 1 (beta)', e.limits.ranked_attempts_per_utc_day === 1);
}

// =============================================================================
// 2. claim / finish idempotency
// =============================================================================
await svc();
ok('claim new event → true', one(await q(`select claim_webhook_event('evt_1','INITIAL_PURCHASE','fp1') c`)).c === true);
ok('claim duplicate event → false', one(await q(`select claim_webhook_event('evt_1','INITIAL_PURCHASE','fp1') c`)).c === false);
await q(`select finish_webhook_event('evt_1','error','provider_unavailable')`);
ok('claim re-claims an errored event → true', one(await q(`select claim_webhook_event('evt_1','INITIAL_PURCHASE','fp1') c`)).c === true);
await q(`select finish_webhook_event('evt_1','processed',null)`);
ok('a processed event cannot be re-claimed', one(await q(`select claim_webhook_event('evt_1','INITIAL_PURCHASE','fp1') c`)).c === false);
await expectFail('claim rejects an empty event id', () => q(`select claim_webhook_event('','X','fp')`), 'bad_event');

// =============================================================================
// 3. sync_player_entitlement — quarantine, ordering, idempotency
// =============================================================================
{
  ok('unknown user is quarantined (not written)', (await sync(UNKNOWN, 'premium', { latest_event_id: 'x', source_updated_at: '2026-07-11T00:00:00Z' })).reason === 'unknown_user');
  await svc();
  ok('no row created for the unknown user', one(await q(`select count(*)::int c from player_entitlements where user_id=$1`, [UNKNOWN])).c === 0);

  ok('bad state rejected', (await sync(A, 'super_premium', { latest_event_id: 'e', source_updated_at: '2026-07-11T00:00:00Z' })).reason === 'bad_state');

  const t2 = '2026-07-11T02:00:00Z', t1 = '2026-07-11T01:00:00Z', t3 = '2026-07-11T03:00:00Z';
  ok('apply premium (event e2 @ t2)', (await sync(A, 'premium', { latest_event_id: 'e2', source_updated_at: t2, is_active: true, will_renew: true, revenuecat_product_id: 'brainbrew_premium_monthly', revenuecat_store: 'play_store', current_period_end: t3 })).applied === true);
  ok('duplicate event id is a no-op', (await sync(A, 'expired', { latest_event_id: 'e2', source_updated_at: t3 })).reason === 'duplicate_event');
  ok('stale (older) event cannot regress newer state', (await sync(A, 'expired', { latest_event_id: 'e1', source_updated_at: t1 })).reason === 'stale_event');
  await svc();
  ok('state still premium after stale/duplicate attempts', one(await q(`select entitlement_state s from player_entitlements where user_id=$1`, [A])).s === 'premium');
  ok('newer event applies (expired @ t3)', (await sync(A, 'expired', { latest_event_id: 'e3', source_updated_at: t3 })).applied === true);
  await svc();
  ok('state now expired', one(await q(`select entitlement_state s from player_entitlements where user_id=$1`, [A])).s === 'expired');
}

// =============================================================================
// 4. get_my_entitlements: ranked=1 in EVERY state; unlimited flag per policy
// =============================================================================
const STATES = ['beta','free','premium','grace_period','billing_issue','expired','revoked'];
const PREMIUMISH = new Set(['premium','grace_period','billing_issue']);
let evt = 100;
for (const st of STATES) {
  // 'beta' is only reachable via no-row default; force it by clearing the row.
  await svc();
  if (st === 'beta') {
    await q(`delete from player_entitlements where user_id=$1`, [A]);
  } else {
    await sync(A, st, { latest_event_id: `set${evt++}`, source_updated_at: `2026-07-1${(evt % 9) + 1}T00:00:00Z`, is_active: PREMIUMISH.has(st) });
  }
  const e = await entOf(A);
  ok(`[beta_open] state ${st}: ranked limit is exactly 1`, e.limits.ranked_attempts_per_utc_day === 1);
  ok(`[beta_open] state ${st}: unlimited practice stays true for everyone`, e.capabilities.unlimited_practice === true);
  ok(`[beta_open] state ${st}: no premium FEATURE unlocked (archives off)`, e.capabilities.archives === false);
}

// =============================================================================
// 5. sandbox_paywall: free-limited, premium-unlimited (ranked still 1)
// =============================================================================
await setMode('sandbox_paywall');
{
  await svc(); await q(`delete from player_entitlements where user_id=$1`, [A]);
  const free = await entOf(A);
  ok('[sandbox] no row → free, unlimited_practice FALSE, free-count set', free.entitlement_state === 'free' && free.capabilities.unlimited_practice === false && free.limits.free_practice_brews_per_period === 1);
  ok('[sandbox] free: ranked limit still exactly 1', free.limits.ranked_attempts_per_utc_day === 1);

  await sync(A, 'premium', { latest_event_id: 'prem-sb', source_updated_at: '2026-07-20T00:00:00Z', is_active: true, will_renew: true });
  const prem = await entOf(A);
  ok('[sandbox] premium → unlimited_practice TRUE, subscription facts present', prem.capabilities.unlimited_practice === true && prem.subscription && prem.subscription.is_active === true);
  ok('[sandbox] premium: ranked limit still exactly 1', prem.limits.ranked_attempts_per_utc_day === 1);
  ok('[sandbox] premium source is generic "subscription"', prem.source === 'subscription');
}
await setMode('beta_open');

// =============================================================================
// 6. Practice-gate enforcement (server-side, no content needed to hit the gate)
// =============================================================================
// Seed a completed practice attempt for A today (needs a practice_pack).
await svc();
await q(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('aaaaaaaa-0000-0000-0000-000000000001',$1,'seed',current_date)`, [A]);
await q(`insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator, final_score, completed_at)
         values ($1,'practicegate0001','aaaaaaaa-0000-0000-0000-000000000001',false,'completed',100, 50, now())`, [A]);

// beta_open: over-limit free user is NOT capped → passes gate → fails on content (pool_exhausted).
await setMode('beta_open');
await expectFail('[beta_open] practice never capped (reaches content, pool_exhausted)',
  () => q(`select start_practice_pack($1,'newsession000001','1.0.0')`, [A]), 'practice_pool_exhausted');

// sandbox_paywall + free user already used allowance today → gate blocks BEFORE content.
await setMode('sandbox_paywall');
await svc(); await q(`delete from player_entitlements where user_id=$1`, [A]);
await expectFail('[sandbox] free over allowance → practice_limit_reached (server gate)',
  () => q(`select start_practice_pack($1,'newsession000002','1.0.0')`, [A]), 'practice_limit_reached');

// sandbox_paywall + premium user → bypasses cap → passes gate → pool_exhausted.
await sync(A, 'premium', { latest_event_id: 'prem-gate', source_updated_at: '2026-07-21T00:00:00Z', is_active: true });
await expectFail('[sandbox] premium bypasses cap (reaches content, pool_exhausted)',
  () => q(`select start_practice_pack($1,'newsession000003','1.0.0')`, [A]), 'practice_pool_exhausted');
await setMode('beta_open');

// =============================================================================
// 7. Security — RLS, grants, no leak
// =============================================================================
// Client roles cannot read player_entitlements or the audit table.
await asUser(A);
await expectFail('authenticated cannot select player_entitlements', () => q(`select * from player_entitlements`), 'permission denied');
await expectFail('authenticated cannot select revenuecat_webhook_events', () => q(`select * from revenuecat_webhook_events`), 'permission denied');
await expectFail('authenticated cannot write player_entitlements', () => q(`update player_entitlements set entitlement_state='premium' where user_id=$1`, [A]), 'permission denied');
await expectFail('authenticated cannot call sync_player_entitlement', () => q(`select sync_player_entitlement($1,'premium','{}'::jsonb)`, [A]), 'permission denied');
await expectFail('authenticated cannot call set_release_policy', () => q(`select set_release_policy('production_paywall')`), 'permission denied');
await expectFail('authenticated cannot call claim_webhook_event', () => q(`select claim_webhook_event('e','t','f')`), 'permission denied');

// service_role CAN execute the sync RPC (positive: the grant works).
await db.exec('reset role; set role service_role;');
ok('service_role may execute sync_player_entitlement (grant works)',
  (await q(`select sync_player_entitlement($1,'premium','{"latest_event_id":"svc-pos","source_updated_at":"2026-07-25T00:00:00Z","is_active":true}'::jsonb) r`, [B]))[0].r.applied === true);
await db.exec('reset role;');

// anon (publishable) fully denied on get_my_entitlements.
await db.exec('reset role; set role anon;');
await expectFail('anon denied get_my_entitlements', () => q(`select get_my_entitlements()`), 'permission denied');
await db.exec('reset role;');

// No provider/customer/product/store field leaks through the RPC.
await svc();
await sync(A, 'premium', { latest_event_id: 'leakcheck', source_updated_at: '2026-07-22T00:00:00Z', is_active: true, revenuecat_product_id: 'brainbrew_premium_monthly', revenuecat_store: 'play_store' });
{
  const e = await entOf(A);
  const flat = JSON.stringify(e);
  ok('RPC never exposes product/store/customer/app-user/receipt/event ids',
    !/brainbrew_premium_monthly|play_store|revenuecat_product_id|revenuecat_store|app_user_id|customer_id|receipt|latest_event_id/i.test(flat));
  ok('RPC exposes only safe subscription facts', e.subscription && 'will_renew' in e.subscription && 'current_period_end' in e.subscription && !('revenuecat_product_id' in e.subscription));
}

if (failures.length) {
  console.error(`\n${failures.length} REVENUECAT-SYNC CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} RevenueCat-sync DB checks passed — persistence, idempotency, ordering, policy modes, practice gate, ranked-1 invariant, security`);
