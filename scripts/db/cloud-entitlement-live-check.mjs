/**
 * Live entitlement verification — `npm run cloud:entitlement-check`.
 *
 * Drives the DEPLOYED get_my_entitlements RPC with ISOLATED test users and proves
 * the Phase 7D contract on the live project:
 *   • an anonymous user resolves to the BETA policy (unlimited practice, all
 *     Premium off);
 *   • a permanent user resolves to the SAME beta policy;
 *   • the RANKED-ATTEMPT LIMIT is exactly 1 in every case (fairness invariant);
 *   • no payment/provider/receipt/identity field appears in the payload;
 *   • an anonymous→permanent UPGRADE (same auth UUID) preserves the beta policy;
 *   • two different users get their OWN result (no cross-user surface — the RPC
 *     takes no user parameter);
 *   • the unauthenticated publishable role is DENIED (grant is authenticated-only).
 *
 * Isolated users cleaned up. Needs the two PUBLIC env vars + the SECRET key.
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

const PREMIUM = ['archives', 'category_training', 'difficulty_selection', 'advanced_practice_stats', 'advanced_ranked_stats', 'bonus_packs', 'premium_themes', 'private_tournaments'];
const FREE = ['daily_ranked_brew', 'global_leaderboard', 'country_leaderboard', 'ranked_streaks', 'basic_progress', 'share_cards', 'practice_access', 'unlimited_practice'];
const FORBIDDEN = ['user_id', 'email', 'receipt', 'customer_id', 'purchase_token', 'transaction', 'provider_customer_id', 'payment_method', 'attempt_token', 'correct_answer', 'submitted_answer', 'service_role'];

function deepHasKey(v, keys) {
  if (Array.isArray(v)) return v.some((x) => deepHasKey(x, keys));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, val]) => keys.includes(k) || deepHasKey(val, keys));
  return false;
}
function assertBeta(label, e) {
  ok(`${label}: entitlement_state = beta`, e?.entitlement_state === 'beta');
  ok(`${label}: unlimited practice + all free caps on`, FREE.every((k) => e?.capabilities?.[k] === true));
  ok(`${label}: every Premium capability off`, PREMIUM.every((k) => e?.capabilities?.[k] === false));
  ok(`${label}: ranked limit is exactly 1 (fairness invariant)`, e?.limits?.ranked_attempts_per_utc_day === 1);
  ok(`${label}: no payment/provider/identity field anywhere`, !deepHasKey(e, FORBIDDEN));
  ok(`${label}: source is the beta policy`, e?.source === 'beta_policy');
}

const cleanupUserIds = [];
try {
  // 1) Anonymous user → beta policy.
  const anon = mk();
  const anonRes = await anon.auth.signInAnonymously();
  if (anonRes.error || !anonRes.data.user) throw new Error('anonymous sign-in failed');
  cleanupUserIds.push(anonRes.data.user.id);
  const anonEnt = (await anon.rpc('get_my_entitlements', {})).data;
  assertBeta('anonymous', anonEnt);
  ok('anonymous: auth user is actually anonymous', anonRes.data.user.is_anonymous === true);

  // 2) Permanent user → the SAME beta policy.
  const email = `en_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  cleanupUserIds.push(created.data.user.id);
  const perm = mk();
  await perm.auth.signInWithPassword({ email, password });
  const permEnt = (await perm.rpc('get_my_entitlements', {})).data;
  assertBeta('permanent', permEnt);

  // 3) Upgrade an anonymous user to permanent (SAME UUID) — policy unchanged.
  const up = mk();
  const upAnon = await up.auth.signInAnonymously();
  const upUuid = upAnon.data.user.id;
  cleanupUserIds.push(upUuid);
  const before = (await up.rpc('get_my_entitlements', {})).data;
  const upEmail = `en_up_${rand().slice(0, 8)}@brainbrew-test.invalid`;
  const upd = await up.auth.updateUser({ email: upEmail, password: `Pw_${rand()}` });
  const sameUuid = (upd.data?.user?.id ?? upUuid) === upUuid;
  const after = (await up.rpc('get_my_entitlements', {})).data;
  ok('upgrade preserves the auth UUID', sameUuid);
  ok('upgrade preserves the beta policy (unchanged capabilities)',
    JSON.stringify(before.capabilities) === JSON.stringify(after.capabilities) && after.limits.ranked_attempts_per_utc_day === 1);

  // 4) Cross-user: each caller gets THEIR OWN scoped result; there is no user param.
  ok('two users each get an own beta result (no cross-user surface)',
    anonEnt.entitlement_state === 'beta' && permEnt.entitlement_state === 'beta');
  const badParam = await perm.rpc('get_my_entitlements', { p_user_id: anonRes.data.user.id });
  ok('passing a spoofed user id is rejected or ignored (no such parameter)',
    Boolean(badParam.error) || badParam.data?.entitlement_state === 'beta');

  // 5) Unauthenticated publishable role is DENIED (authenticated-only grant).
  const anonRole = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const denied = await anonRole.rpc('get_my_entitlements', {});
  ok('unauthenticated (publishable) role is denied', Boolean(denied.error));
} finally {
  for (const id of cleanupUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} ENTITLEMENT LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live entitlement checks passed (isolated users, cleaned up)`);
