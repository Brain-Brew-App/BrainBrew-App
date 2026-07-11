/**
 * RevenueCat subscriber → entitlement-state mapping — `npm run db:entitlement-map-test`.
 *
 * Compiles the pure Deno mapping module (`_shared/entitlementMap.ts`) for Node and
 * proves every provider situation maps to the intended BrainBrew state with the
 * correct active/renew flags. Deterministic (now is injected). No network.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..', '..');
const out = mkdtempSync(join(tmpdir(), 'bbmap-'));
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [
    tsc, join(ROOT, 'supabase', 'functions', '_shared', 'entitlementMap.ts'),
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
  ], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  // tsc exits non-zero for the deprecated-option notice (TS5107) while still
  // emitting. A real type error would leave no .js and the import below throws.
  const msg = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  if (msg && !/TS5107/.test(msg)) { console.error(msg); process.exit(1); }
}
const { mapSubscriber } = await import(pathToFileURL(join(out, 'entitlementMap.js')).href);

const ENT = 'brainbrew_premium';
const NOW = Date.parse('2026-07-11T00:00:00Z');
const future = new Date(NOW + 20 * 864e5).toISOString();
const past = new Date(NOW - 5 * 864e5).toISOString();
const graceFuture = new Date(NOW + 2 * 864e5).toISOString();

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// Build a subscriber with one entitlement + its subscription.
const sub = (entOverrides = {}, subOverrides = {}, present = true) => ({
  entitlements: present ? { [ENT]: { product_identifier: 'brainbrew_premium_monthly', purchase_date: past, expires_date: future, ...entOverrides } } : {},
  subscriptions: { brainbrew_premium_monthly: { store: 'play_store', period_type: 'normal', purchase_date: past, original_purchase_date: past, expires_date: future, ...subOverrides } },
});

// premium (active, auto-renew on)
{
  const m = mapSubscriber(sub(), ENT, NOW);
  ok('active subscription → premium, is_active, will_renew', m.state === 'premium' && m.fields.is_active === true && m.fields.will_renew === true);
  ok('premium carries product + store (for the private row only)', m.fields.revenuecat_product_id === 'brainbrew_premium_monthly' && m.fields.revenuecat_store === 'play_store');
}
// trial (active, period_type trial) → premium
{
  const m = mapSubscriber(sub({}, { period_type: 'trial' }), ENT, NOW);
  ok('active trial → premium with period_type trial', m.state === 'premium' && m.fields.period_type === 'trial' && m.fields.is_active === true);
}
// intro → premium
{
  const m = mapSubscriber(sub({}, { period_type: 'intro' }), ENT, NOW);
  ok('active intro → premium', m.state === 'premium' && m.fields.period_type === 'intro');
}
// cancelled but still entitled → premium, will_renew false
{
  const m = mapSubscriber(sub({}, { unsubscribe_detected_at: past }), ENT, NOW);
  ok('unsubscribed but active → premium, will_renew false', m.state === 'premium' && m.fields.is_active === true && m.fields.will_renew === false);
}
// billing issue while still entitled → billing_issue, active
{
  const m = mapSubscriber(sub({}, { billing_issues_detected_at: past }), ENT, NOW);
  ok('billing issue while entitled → billing_issue, is_active, no renew', m.state === 'billing_issue' && m.fields.is_active === true && m.fields.will_renew === false);
}
// grace period (expired but within grace) → grace_period, active
{
  const m = mapSubscriber(sub({ expires_date: past, grace_period_expires_date: graceFuture }, { expires_date: past, grace_period_expires_date: graceFuture }), ENT, NOW);
  ok('expired but in grace → grace_period, is_active', m.state === 'grace_period' && m.fields.is_active === true && m.fields.will_renew === false);
}
// expired (past, no grace) → expired, inactive
{
  const m = mapSubscriber(sub({ expires_date: past, grace_period_expires_date: null }, { expires_date: past, grace_period_expires_date: null }), ENT, NOW);
  ok('expired, no grace → expired, inactive', m.state === 'expired' && m.fields.is_active === false && m.fields.expiration_reason === 'expired');
}
// refunded/revoked → revoked, inactive (even if within period)
{
  const m = mapSubscriber(sub({}, { refunded_at: past }), ENT, NOW);
  ok('refunded → revoked, inactive, revoked_at set', m.state === 'revoked' && m.fields.is_active === false && m.fields.revoked_at === past);
}
// no entitlement present → free
{
  const m = mapSubscriber(sub({}, {}, false), ENT, NOW);
  ok('no entitlement → free, inactive, no product', m.state === 'free' && m.fields.is_active === false && m.fields.revenuecat_entitlement_id === null);
}
// null subscriber → free
{
  const m = mapSubscriber(null, ENT, NOW);
  ok('null subscriber → free', m.state === 'free' && m.fields.is_active === false);
}

rmSync(out, { recursive: true, force: true });
if (failures.length) {
  console.error(`\n${failures.length} MAPPING CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} entitlement-mapping checks passed — every provider state maps deterministically`);
