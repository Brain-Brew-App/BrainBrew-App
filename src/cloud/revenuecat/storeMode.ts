/**
 * Store mode + environment-specific offering validation (Phase 7J).
 *
 * BrainBrew runs against TWO different RevenueCat stores with DIFFERENT product
 * identifiers, and the app must never confuse them:
 *
 *   development  →  RevenueCat Test Store   key `test_…`  products `monthly` / `yearly`
 *   production   →  Google Play Billing     key `goog_…`  products `brainbrew_premium_{monthly,annual}`
 *
 * What NEVER changes between them: offering `default`, packages `$rc_monthly` /
 * `$rc_annual`, entitlement `brainbrew_premium`.
 *
 * The store mode is derived from the PUBLIC SDK key's prefix — the key itself is
 * never returned, logged or stored here. An unknown prefix fails safe (`invalid`)
 * rather than being optimistically treated as a real store.
 *
 * Pure module: no react-native import, no SDK import — fully unit-tested in Node.
 */

import type { OfferingContract, PackageContract } from './types';

/** How the app is talking to a store right now. Derived from the key prefix only. */
export type StoreMode = 'test_store' | 'google_play' | 'app_store' | 'unconfigured' | 'invalid';

/** Invariants that hold in EVERY mode — these are the dashboard contract. */
export const REQUIRED_OFFERING_ID = 'default';
export const REQUIRED_PACKAGE_IDS = ['$rc_monthly', '$rc_annual'] as const;
export const REQUIRED_ENTITLEMENT_ID = 'brainbrew_premium';

/**
 * The product identifier each package MUST resolve to, per store.
 *
 * Note the Test Store trap this table exists to prevent: its products are *named*
 * "brainbrew_premium_monthly"/"brainbrew_premium_annual" in the dashboard, but
 * their real identifiers are `monthly`/`yearly`. A display name is not an id.
 */
export const EXPECTED_PRODUCT_IDS: Record<'test_store' | 'google_play' | 'app_store', Record<'monthly' | 'annual', string>> = {
  test_store: { monthly: 'monthly', annual: 'yearly' },
  google_play: { monthly: 'brainbrew_premium_monthly', annual: 'brainbrew_premium_annual' },
  app_store: { monthly: 'brainbrew_premium_monthly', annual: 'brainbrew_premium_annual' },
};

/** Detect the store mode from a public SDK key. The key is never echoed back. */
export function storeModeFor(key: string | null | undefined): StoreMode {
  if (typeof key !== 'string' || key.trim().length === 0) return 'unconfigured';
  const k = key.trim();
  if (k.startsWith('test_')) return 'test_store';
  if (k.startsWith('goog_')) return 'google_play';
  if (k.startsWith('appl_')) return 'app_store';
  return 'invalid'; // fail safe — never assume an unknown prefix is a live store
}

/** True only for modes that can actually transact. */
export function isTransactableMode(mode: StoreMode): mode is 'test_store' | 'google_play' | 'app_store' {
  return mode === 'test_store' || mode === 'google_play' || mode === 'app_store';
}

/** A Test Store key must NEVER ship in a production/Play build. */
export function isTestStoreKey(key: string | null | undefined): boolean {
  return storeModeFor(key) === 'test_store';
}

export type OfferingRejection =
  | 'unconfigured'          // no key at all
  | 'invalid_key'           // unknown key prefix — fail safe
  | 'empty_offering'        // offering exists but has no usable packages
  | 'wrong_offering'        // offering id is not `default`
  | 'missing_package'       // $rc_monthly or $rc_annual absent
  | 'unknown_package'       // a package we do not recognise is present
  | 'product_mismatch';     // package resolves to the wrong store product id

export type OfferingValidation =
  | { ok: true; mode: StoreMode; offering: OfferingContract; monthly: PackageContract; annual: PackageContract }
  | { ok: false; mode: StoreMode; reason: OfferingRejection; detail: string };

/**
 * Validate a mapped offering against the store mode's expected contract.
 *
 * Strict on purpose, and strict PER MODE — it is precisely the mapping between a
 * package and its underlying store product that determines what the user is
 * charged for, so a Play product appearing in a Test Store build (or vice versa)
 * is a hard rejection, not a warning. `detail` is a safe, id-only string: product
 * and package identifiers are public catalogue names, never secrets.
 */
export function validateOfferingForMode(offering: OfferingContract | null, mode: StoreMode): OfferingValidation {
  if (mode === 'unconfigured') return { ok: false, mode, reason: 'unconfigured', detail: 'no public SDK key configured' };
  if (mode === 'invalid') return { ok: false, mode, reason: 'invalid_key', detail: 'unrecognised SDK key prefix' };

  if (!offering || offering.packages.length === 0) {
    return { ok: false, mode, reason: 'empty_offering', detail: 'offering has no usable packages' };
  }
  if (offering.offeringId !== REQUIRED_OFFERING_ID) {
    return { ok: false, mode, reason: 'wrong_offering', detail: `expected offering "${REQUIRED_OFFERING_ID}", got "${offering.offeringId}"` };
  }

  const unknown = offering.packages.find((p) => !REQUIRED_PACKAGE_IDS.includes(p.packageId as typeof REQUIRED_PACKAGE_IDS[number]));
  if (unknown) {
    return { ok: false, mode, reason: 'unknown_package', detail: `unexpected package "${unknown.packageId}"` };
  }

  const monthly = offering.packages.find((p) => p.packageId === '$rc_monthly');
  const annual = offering.packages.find((p) => p.packageId === '$rc_annual');
  if (!monthly || !annual) {
    return { ok: false, mode, reason: 'missing_package', detail: `missing ${!monthly ? '$rc_monthly' : '$rc_annual'}` };
  }

  const expected = EXPECTED_PRODUCT_IDS[mode];
  // Compare the PRODUCT IDENTIFIER, never the display title — in the Test Store
  // the title is the Play-style name while the identifier is `monthly`/`yearly`.
  if (monthly.productId !== expected.monthly) {
    return { ok: false, mode, reason: 'product_mismatch', detail: `$rc_monthly → "${monthly.productId}", expected "${expected.monthly}" in ${mode}` };
  }
  if (annual.productId !== expected.annual) {
    return { ok: false, mode, reason: 'product_mismatch', detail: `$rc_annual → "${annual.productId}", expected "${expected.annual}" in ${mode}` };
  }

  return { ok: true, mode, offering, monthly, annual };
}

/** Map a rejection to the calm, honest unavailable reason the screen renders. */
export function unavailableFor(reason: OfferingRejection): 'missing_api_key' | 'not_configured' | 'no_packages' {
  if (reason === 'unconfigured') return 'missing_api_key';
  if (reason === 'empty_offering') return 'no_packages';
  return 'not_configured'; // misconfigured catalogue — never show a broken paywall
}
