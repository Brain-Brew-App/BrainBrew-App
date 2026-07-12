/**
 * Store-mode + offering validation + release-gate tests — `npm run test:store-mode`.
 *
 * Proves (pure, no device, no store):
 *   1. key prefix → store mode, with a safe failure for anything unknown;
 *   2. the SAME offering/packages validate against DIFFERENT product ids per store,
 *      and a cross-store product mapping is REJECTED (this is the check that stops
 *      a Play product being sold through the Test Store, or vice versa);
 *   3. a Test Store product display NAME is never mistaken for its identifier;
 *   4. the release gate blocks a `test_` key in a preview/production build —
 *      including mutation tests that each break one rule and must be caught.
 */

import { compilePureModules } from './compile.mjs';
import { assessRelease, isPlaceholderKey, modeOf } from './release-key-check.mjs';

const { load } = compilePureModules();
const S = await load('cloud/revenuecat/storeMode.js');
const O = await load('cloud/revenuecat/offerings.js');

let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// ── 1. Store-mode detection ──────────────────────────────────────────────────
{
  ok('test_ → test_store', S.storeModeFor('test_EJVzvOQabcdefghijklmnop') === 'test_store');
  ok('goog_ → google_play', S.storeModeFor('goog_abcdefghijklmnopqrstuv') === 'google_play');
  ok('appl_ → app_store', S.storeModeFor('appl_abcdefghijklmnopqrstuv') === 'app_store');
  ok('null → unconfigured', S.storeModeFor(null) === 'unconfigured');
  ok('undefined → unconfigured', S.storeModeFor(undefined) === 'unconfigured');
  ok('empty string → unconfigured', S.storeModeFor('   ') === 'unconfigured');
  // FAIL SAFE: an unknown prefix is never optimistically treated as a live store.
  ok('unknown prefix → invalid (fail safe)', S.storeModeFor('sk_live_supersecret') === 'invalid');
  ok('a RevenueCat SECRET key is NOT a store mode', S.storeModeFor('sk_abcdefghijklmnop') === 'invalid');
  ok('mode name leaks no key material', !JSON.stringify(S.storeModeFor('test_EJVzvOQabcdefg')).includes('EJVz'));
  ok('isTransactableMode(invalid) === false', S.isTransactableMode('invalid') === false);
  ok('isTransactableMode(unconfigured) === false', S.isTransactableMode('unconfigured') === false);
  ok('isTestStoreKey(goog_) === false', S.isTestStoreKey('goog_abcdefghijklmnop') === false);
  ok('isTestStoreKey(test_) === true', S.isTestStoreKey('test_abcdefghijklmnop') === true);
}

// ── 2. Offering validation, per store ────────────────────────────────────────
// Raw RevenueCat shapes, exactly as the SDK returns them. Note the Test Store trap:
// the product TITLE is the Play-style name, but the IDENTIFIER is `monthly`/`yearly`.
const pkg = (packageId, productId, title, priceString, period) => ({
  identifier: packageId,
  packageType: packageId === '$rc_monthly' ? 'MONTHLY' : 'ANNUAL',
  product: { identifier: productId, title, priceString, currencyCode: 'USD', subscriptionPeriod: period },
});
const offering = (id, packages) => ({ current: { identifier: id, availablePackages: packages } });

const TEST_STORE_OFFERING = offering('default', [
  pkg('$rc_monthly', 'monthly', 'brainbrew_premium_monthly', '$4.99', 'P1M'),
  pkg('$rc_annual', 'yearly', 'brainbrew_premium_annual', '$39.99', 'P1Y'),
]);
const PLAY_OFFERING = offering('default', [
  pkg('$rc_monthly', 'brainbrew_premium_monthly', 'BrainBrew Premium Monthly', '$4.99', 'P1M'),
  pkg('$rc_annual', 'brainbrew_premium_annual', 'BrainBrew Premium Annual', '$39.99', 'P1Y'),
]);

const check = (raw, mode) => S.validateOfferingForMode(O.mapCurrentOffering(raw), mode);

{
  const t = check(TEST_STORE_OFFERING, 'test_store');
  ok('Test Store: correct offering ACCEPTED', t.ok === true);
  ok('Test Store: $rc_monthly → product "monthly"', t.ok && t.monthly.productId === 'monthly');
  ok('Test Store: $rc_annual → product "yearly"', t.ok && t.annual.productId === 'yearly');
  ok('Test Store: plan derived monthly/annual from PACKAGE not product', t.ok && t.monthly.plan === 'monthly' && t.annual.plan === 'annual');
  ok('Test Store: display NAME is not treated as the identifier', t.ok && t.monthly.title === 'brainbrew_premium_monthly' && t.monthly.productId === 'monthly');
  ok('Test Store: price comes from the store string, never hardcoded', t.ok && t.monthly.priceString === '$4.99' && t.annual.priceString === '$39.99');
  ok('Test Store: period mapped from store metadata', t.ok && t.monthly.period === 'month' && t.annual.period === 'year');

  const g = check(PLAY_OFFERING, 'google_play');
  ok('Google Play: correct offering ACCEPTED', g.ok === true);
  ok('Google Play: $rc_monthly → brainbrew_premium_monthly', g.ok && g.monthly.productId === 'brainbrew_premium_monthly');
  ok('Google Play: $rc_annual → brainbrew_premium_annual', g.ok && g.annual.productId === 'brainbrew_premium_annual');

  // CROSS-STORE REJECTION — the core of Task 2.
  const crossA = check(PLAY_OFFERING, 'test_store');
  ok('Play product ids REJECTED in Test Store mode', crossA.ok === false && crossA.reason === 'product_mismatch');
  const crossB = check(TEST_STORE_OFFERING, 'google_play');
  ok('Test Store product ids REJECTED in Google Play mode', crossB.ok === false && crossB.reason === 'product_mismatch');
  ok('rejection detail names ids only (no secrets)', crossB.ok === false && /monthly/.test(crossB.detail) && !/test_|goog_/.test(crossB.detail));

  // Validation is NOT weakened globally: entitlement + package + offering invariant.
  ok('entitlement id stays brainbrew_premium', S.REQUIRED_ENTITLEMENT_ID === 'brainbrew_premium');
  ok('offering id stays default', S.REQUIRED_OFFERING_ID === 'default');
  ok('packages stay $rc_monthly/$rc_annual', S.REQUIRED_PACKAGE_IDS.join(',') === '$rc_monthly,$rc_annual');

  // Wrong / missing / empty — each handled honestly, never as a broken paywall.
  const wrongOffering = check(offering('paywall_v2', TEST_STORE_OFFERING.current.availablePackages), 'test_store');
  ok('wrong offering id REJECTED', wrongOffering.ok === false && wrongOffering.reason === 'wrong_offering');

  const wrongPackage = check(offering('default', [
    pkg('$rc_weekly', 'monthly', 'x', '$1.99', 'P1W'),
    pkg('$rc_annual', 'yearly', 'y', '$39.99', 'P1Y'),
  ]), 'test_store');
  ok('unknown package REJECTED', wrongPackage.ok === false && wrongPackage.reason === 'unknown_package');

  const missing = check(offering('default', [pkg('$rc_monthly', 'monthly', 'x', '$4.99', 'P1M')]), 'test_store');
  ok('missing $rc_annual handled honestly', missing.ok === false && missing.reason === 'missing_package' && /\$rc_annual/.test(missing.detail));

  const empty = check(offering('default', []), 'test_store');
  ok('empty offering handled honestly', empty.ok === false && empty.reason === 'empty_offering');
  ok('empty offering → calm "no_packages" copy', S.unavailableFor('empty_offering') === 'no_packages');
  ok('no offering at all handled honestly', S.validateOfferingForMode(null, 'test_store').reason === 'empty_offering');

  // A priceless package can never render (no fabricated prices).
  const noPrice = check(offering('default', [
    { identifier: '$rc_monthly', product: { identifier: 'monthly', title: 'x' } },
    pkg('$rc_annual', 'yearly', 'y', '$39.99', 'P1Y'),
  ]), 'test_store');
  ok('package without a store price is dropped (no fabricated price)', noPrice.ok === false && noPrice.reason === 'missing_package');

  ok('unconfigured mode → missing_api_key copy', S.validateOfferingForMode(O.mapCurrentOffering(TEST_STORE_OFFERING), 'unconfigured').reason === 'unconfigured');
  ok('invalid key mode rejects even a perfect offering', S.validateOfferingForMode(O.mapCurrentOffering(TEST_STORE_OFFERING), 'invalid').ok === false);
}

// ── 3. Release gate + MUTATIONS ──────────────────────────────────────────────
{
  const GOOG = 'goog_aaaaaaaaaaaaaaaaaaaaaaaa';
  const TEST = 'test_aaaaaaaaaaaaaaaaaaaaaaaa';

  ok('gate: dev build + test_ key → allowed', assessRelease({ profile: 'development', androidKey: TEST }).ok === true);
  ok('gate: production + goog_ key → allowed', assessRelease({ profile: 'production', androidKey: GOOG }).ok === true);
  ok('gate: production + no key → allowed (EAS env supplies it)', assessRelease({ profile: 'production' }).ok === true);

  // MUTATION 1 — a Test Store key sneaks into production. MUST fail.
  const m1 = assessRelease({ profile: 'production', androidKey: TEST });
  ok('MUTATION: test_ key in production build → BLOCKED', m1.ok === false && /test_store/.test(m1.failures[0]));
  ok('MUTATION: failure message prints no key value', m1.failures.every((f) => !f.includes('aaaaaaaa')));

  // MUTATION 2 — a Test Store key in a preview (internal-distribution) build.
  ok('MUTATION: test_ key in preview build → BLOCKED', assessRelease({ profile: 'preview', androidKey: TEST }).ok === false);

  // MUTATION 3 — Test Store key on the iOS side of a store build.
  ok('MUTATION: test_ iOS key in production → BLOCKED', assessRelease({ profile: 'production', androidKey: GOOG, iosKey: TEST }).ok === false);

  // MUTATION 4 — an unknown/garbage key prefix must never be assumed safe.
  ok('MUTATION: invalid key prefix → BLOCKED', assessRelease({ profile: 'production', androidKey: 'sk_secret_key_leak' }).ok === false);

  // MUTATION 5 — a key hardcoded into tracked source is fatal in ANY profile.
  const m5 = assessRelease({ profile: 'development', androidKey: TEST, hardcodedKeyFiles: ['src/cloud/revenuecat/platform.ts'] });
  ok('MUTATION: key hardcoded in tracked source → BLOCKED even in dev', m5.ok === false && /hardcoded/.test(m5.failures[0]));

  ok('modeOf mirrors the app detector', modeOf(TEST) === S.storeModeFor(TEST) && modeOf(GOOG) === S.storeModeFor(GOOG));

  // The hardcoded-key scanner must tell a TEMPLATE PLACEHOLDER apart from a real
  // key — otherwise it either cries wolf on .env.example or (far worse) is
  // loosened until it stops catching a genuinely leaked key.
  // NB: the strings below are deliberately FAKE key-shaped values. The real keys
  // live only in the ignored .env — never in a tracked file, not even a test.
  ok('placeholder goog_XXXX… is not a leak', isPlaceholderKey('goog_XXXXXXXXXXXXXXXXXXXXXXXX') === true);
  ok('placeholder test_XXXX… is not a leak', isPlaceholderKey('test_XXXXXXXXXXXXXXXXXXXXXXXX') === true);
  ok('a real-SHAPED test_ key IS a leak', isPlaceholderKey('test_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz') === false);
  ok('a real-SHAPED goog_ key IS a leak', isPlaceholderKey('goog_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz') === false);
}

// ── Report ───────────────────────────────────────────────────────────────────
for (const f of failures) console.error(`  ✕ ${f}`);
if (failures.length) { console.error(`\n✕ store-mode: ${failures.length} failed, ${passed} passed.`); process.exit(1); }
console.log(`✓ store-mode: ${passed} checks passed (mode detection, per-store offering validation, release gate + 5 mutations).`);
