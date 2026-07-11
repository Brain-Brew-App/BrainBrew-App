/**
 * Live RevenueCat-sync verification — `npm run cloud:revenuecat-check`.
 *
 * Proves the DEPLOYED entitlement pipeline WITHOUT a real store purchase, by
 * driving sync_player_entitlement with the service role (exactly what the webhook
 * does after its provider fetch) and reading get_my_entitlements as the player:
 *   • premium sync → get_my_entitlements returns premium + safe subscription facts;
 *   • ranked_attempts_per_utc_day stays 1 in premium AND after expiry (fairness);
 *   • no provider/product/store/customer id leaks through the RPC;
 *   • idempotency (duplicate event), ordering (stale event), unknown-user quarantine;
 *   • the webhook endpoint is deployed and rejects an unauthenticated call.
 *
 * Real Test Store / Android / iOS purchases are a device step — NOT performed here.
 * Isolated user cleaned up. Needs the two PUBLIC env vars + the SECRET key.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !PUB || !SECRET) { console.error('Missing env (public vars + SECRET)'); process.exit(2); }

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const rand = () => Array.from(webcrypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const mk = () => createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const FORBIDDEN = ['revenuecat_product_id', 'revenuecat_store', 'app_user_id', 'customer_id', 'receipt', 'latest_event_id'];
const deepHas = (v, keys) => Array.isArray(v) ? v.some((x) => deepHas(x, keys)) : (v && typeof v === 'object') ? Object.entries(v).some(([k, val]) => keys.includes(k) || deepHas(val, keys)) : false;

let userId = null;
try {
  const email = `rc_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  const U = mk();
  await U.auth.signInWithPassword({ email, password });

  // Baseline: no row → beta (production policy stays beta_open).
  const base = (await U.rpc('get_my_entitlements', {})).data;
  ok('baseline: beta_open → beta, unlimited practice, no subscription', base.entitlement_state === 'beta' && base.capabilities.unlimited_practice === true && base.subscription === null);
  ok('baseline: ranked limit is 1', base.limits.ranked_attempts_per_utc_day === 1);

  // Sync premium (what the webhook does after fetching subscriber state).
  const t2 = '2026-07-21T02:00:00Z';
  const synced = (await admin.rpc('sync_player_entitlement', { p_user_id: userId, p_state: 'premium', p_fields: {
    latest_event_id: 'live-e2', source_updated_at: t2, is_active: true, will_renew: true,
    revenuecat_product_id: 'brainbrew_premium_monthly', revenuecat_store: 'play_store',
    current_period_end: '2026-08-21T02:00:00Z', period_type: 'normal',
  } })).data;
  ok('premium sync applied', synced.applied === true);

  const prem = (await U.rpc('get_my_entitlements', {})).data;
  ok('player now resolves premium + safe subscription facts', prem.entitlement_state === 'premium' && prem.subscription && prem.subscription.is_active === true && prem.subscription.will_renew === true);
  ok('premium: ranked limit STILL exactly 1 (fairness)', prem.limits.ranked_attempts_per_utc_day === 1);
  ok('premium: source is generic "subscription", no id leak', prem.source === 'subscription' && !deepHas(prem, FORBIDDEN));

  // Idempotency + ordering.
  ok('duplicate event id → no-op', (await admin.rpc('sync_player_entitlement', { p_user_id: userId, p_state: 'expired', p_fields: { latest_event_id: 'live-e2', source_updated_at: '2026-07-21T05:00:00Z' } })).data.reason === 'duplicate_event');
  ok('stale event → cannot regress', (await admin.rpc('sync_player_entitlement', { p_user_id: userId, p_state: 'expired', p_fields: { latest_event_id: 'live-e1', source_updated_at: '2026-07-21T01:00:00Z' } })).data.reason === 'stale_event');
  ok('still premium after stale/duplicate', (await U.rpc('get_my_entitlements', {})).data.entitlement_state === 'premium');

  // Expiry removes Premium; ranked stays 1; beta_open keeps practice for everyone.
  await admin.rpc('sync_player_entitlement', { p_user_id: userId, p_state: 'expired', p_fields: { latest_event_id: 'live-e3', source_updated_at: '2026-07-21T09:00:00Z', is_active: false } });
  const exp = (await U.rpc('get_my_entitlements', {})).data;
  ok('expiry → entitlement_state expired', exp.entitlement_state === 'expired');
  ok('expiry: ranked limit still exactly 1', exp.limits.ranked_attempts_per_utc_day === 1);
  ok('beta_open: practice stays available after expiry (no one blocked)', exp.capabilities.unlimited_practice === true);

  // Unknown user quarantined (never attached to an arbitrary row).
  ok('unknown user quarantined', (await admin.rpc('sync_player_entitlement', { p_user_id: '99999999-9999-9999-9999-999999999999', p_state: 'premium', p_fields: { latest_event_id: 'x', source_updated_at: t2 } })).data.reason === 'unknown_user');

  // Client cannot read the private table or call the sync RPC.
  const readDenied = await U.from('player_entitlements').select('*');
  ok('client cannot read player_entitlements', Boolean(readDenied.error) || (readDenied.data ?? []).length === 0);
  const rpcDenied = await U.rpc('sync_player_entitlement', { p_user_id: userId, p_state: 'premium', p_fields: {} });
  ok('client cannot call sync_player_entitlement', Boolean(rpcDenied.error));

  // The webhook endpoint is deployed and rejects an unauthenticated call
  // (401 unauthorized, or 500 server_misconfigured if the secret is not set yet).
  const wh = await fetch(`${URL}/functions/v1/revenuecat-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUB}` },
    body: JSON.stringify({ event: { id: 'probe', type: 'TEST', app_user_id: userId } }),
  });
  ok('webhook is deployed and does NOT process an unauthenticated call', wh.status === 401 || wh.status === 500);
} finally {
  if (userId) { await admin.from('player_entitlements').delete().eq('user_id', userId); await admin.auth.admin.deleteUser(userId).catch(() => {}); }
}

if (failures.length) {
  console.error(`\n${failures.length} REVENUECAT LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live RevenueCat-sync checks passed (isolated user, cleaned up; no real purchase)`);
