/**
 * Client-safe RevenueCat contract types (Phase 7E) — pure, no SDK import.
 *
 * These are the ONLY shapes screens see. They deliberately exclude every provider
 * secret and every payment detail: no receipts, tokens, transaction ids, customer
 * ids, or app-user ids. Prices are the STORE-localized strings the SDK returns —
 * never hardcoded, never computed.
 */

/** One purchasable package, mapped from a RevenueCat package. */
export interface PackageContract {
  /** RevenueCat package identifier (e.g. "$rc_monthly"). */
  packageId: string;
  /** Our stable plan key derived from the package. */
  plan: 'monthly' | 'annual' | 'other';
  productId: string;
  title: string;
  /** Store-localized price string (e.g. "£3.99"). Never computed. */
  priceString: string;
  /** ISO-4217 currency code from the store, when provided. */
  currencyCode: string | null;
  /** Normalized billing period, when derivable ("P1M", "P1Y"). */
  period: 'month' | 'year' | 'other';
  /** True only when the store itself reports an intro/free-trial offer. */
  hasIntroOffer: boolean;
}

/** The current offering, mapped and validated for display. */
export interface OfferingContract {
  offeringId: string;
  packages: PackageContract[];
}

/** Why an offering could not be shown (drives calm, honest copy). */
export type OfferingUnavailable =
  | 'unsupported_platform'
  | 'not_configured'
  | 'no_packages'
  | 'store_unavailable'
  | 'missing_api_key';

/** The service's coarse status, safe to render. Raw SDK errors never surface. */
export type PurchaseOutcome =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'already_active' }
  | { status: 'error'; code: 'store_error' | 'network' | 'unsupported' | 'config' | 'conflict' };

export type RestoreOutcome =
  | { status: 'restored' }
  | { status: 'nothing_to_restore' }
  | { status: 'conflict' } // the store purchase belongs to a different BrainBrew account
  | { status: 'error'; code: 'store_error' | 'network' | 'unsupported' };

/** Whether this build/platform can run native purchases at all. */
export interface PlatformCapability {
  supported: boolean;
  reason: OfferingUnavailable | null;
}

/**
 * A minimal, SDK-agnostic view of RevenueCat customer info — enough to drive fast
 * UI, but NEVER the sole authority for a protected server feature (the server's
 * synchronized entitlement is authoritative).
 */
export interface CustomerState {
  /** True when the RevenueCat entitlement is currently active (fast UI hint). */
  premiumActive: boolean;
  /** The App User ID the SDK is currently logged in as (must be the Auth UUID). */
  appUserId: string | null;
}
