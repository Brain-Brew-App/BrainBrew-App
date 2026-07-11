/**
 * Offering mapping + validation (Phase 7E) — pure, SDK-agnostic, unit-tested.
 *
 * Converts the RevenueCat `PurchasesOffering` shape into our client-safe
 * `OfferingContract`. Rules the spec pins: never hardcode a price, never compute
 * currency conversions, never fabricate a discount or a "best value" label unless
 * it is mathematically true from actual localized store prices. This module only
 * *maps* — it derives plan/period from stable identifiers and surfaces the store's
 * own strings verbatim.
 */

import type { OfferingContract, PackageContract } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Derive our plan key from the RevenueCat package identifier / type. */
function planOf(packageId: string, packageType: string | null): PackageContract['plan'] {
  const id = `${packageId} ${packageType ?? ''}`.toLowerCase();
  if (/monthly|\$rc_monthly|month/.test(id)) return 'monthly';
  if (/annual|yearly|\$rc_annual|year/.test(id)) return 'annual';
  return 'other';
}

/** Normalize an ISO-8601 subscription period ("P1M"/"P1Y") to a coarse unit. */
function periodOf(iso: string | null): PackageContract['period'] {
  if (!iso) return 'other';
  if (/^P\d*M$/i.test(iso) || /month/i.test(iso)) return 'month';
  if (/^P\d*Y$/i.test(iso) || /year/i.test(iso)) return 'year';
  return 'other';
}

/** Map a single RevenueCat package (validates required store fields). */
export function mapPackage(raw: unknown): PackageContract | null {
  if (!isObj(raw)) return null;
  const packageId = str(raw.identifier);
  const product = isObj(raw.product) ? raw.product : null;
  if (!packageId || !product) return null;

  const productId = str(product.identifier);
  const priceString = str(product.priceString); // the STORE-localized string
  const title = str(product.title) ?? 'BrainBrew Premium';
  if (!productId || !priceString) return null; // no fabricated prices — must come from the store

  const subPeriod = isObj(product.subscriptionPeriod)
    ? str((product.subscriptionPeriod as Record<string, unknown>).unit ?? null)
    : str(product.subscriptionPeriod ?? null);

  // The store reports an intro/trial only via a real introductory-price object.
  const hasIntroOffer = Boolean(product.introPrice) || Boolean(product.introductoryPrice);

  return {
    packageId,
    plan: planOf(packageId, str(raw.packageType)),
    productId,
    title,
    priceString,
    currencyCode: str(product.currencyCode),
    period: periodOf(subPeriod ?? str(product.subscriptionPeriod)),
    hasIntroOffer,
  };
}

/**
 * Map a RevenueCat "current" offering to our contract. Returns null when there is
 * no offering or it has no usable packages (the caller shows a calm unavailable
 * state rather than a broken paywall).
 */
export function mapOffering(rawOffering: unknown): OfferingContract | null {
  if (!isObj(rawOffering)) return null;
  const offeringId = str(rawOffering.identifier);
  const list = Array.isArray(rawOffering.availablePackages) ? rawOffering.availablePackages : [];
  if (!offeringId) return null;
  const packages = list.map(mapPackage).filter((p): p is PackageContract => p !== null);
  if (packages.length === 0) return null;
  return { offeringId, packages };
}

/** Pick the current offering out of the SDK's `PurchasesOfferings` container. */
export function mapCurrentOffering(rawOfferings: unknown): OfferingContract | null {
  if (!isObj(rawOfferings)) return null;
  return mapOffering(rawOfferings.current);
}

/**
 * A truthful "save X%" only when BOTH prices are known numerically AND the annual
 * plan is genuinely cheaper per month. Returns null otherwise (no fabricated
 * discounts). Prices come as numbers the SDK exposes alongside the localized
 * string; if absent, we simply do not claim a saving.
 */
export function annualSavingPercent(
  monthlyPrice: number | null, annualPrice: number | null,
): number | null {
  if (monthlyPrice == null || annualPrice == null || monthlyPrice <= 0 || annualPrice <= 0) return null;
  const annualMonthly = annualPrice / 12;
  if (annualMonthly >= monthlyPrice) return null; // no real saving → claim nothing
  return Math.round((1 - annualMonthly / monthlyPrice) * 100);
}
