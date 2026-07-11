/**
 * The SDK adapter seam (Phase 7E) — pure interface, no react-native-purchases
 * import. `RevenueCatService` depends only on this, so the whole service is
 * unit-testable with a fake adapter, and the real native SDK is loaded only on a
 * supported platform (never in Node tests, never in the web bundle).
 */

export interface PurchasesAdapter {
  configure(apiKey: string, appUserId: string): Promise<void>;
  logIn(appUserId: string): Promise<void>;
  logOut(): Promise<void>;
  /** Raw RevenueCat PurchasesOfferings (mapped by offerings.ts). */
  getOfferings(): Promise<unknown>;
  /** Raw RevenueCat CustomerInfo. */
  getCustomerInfo(): Promise<unknown>;
  /** Purchase a raw RevenueCat package; resolves with the updated CustomerInfo. */
  purchasePackage(rawPackage: unknown): Promise<{ customerInfo: unknown; userCancelled?: boolean }>;
  restorePurchases(): Promise<unknown>;
  /** Subscribe to customer-info updates; returns an unsubscribe fn. */
  addCustomerInfoUpdateListener(cb: (info: unknown) => void): () => void;
  setLogLevelVerbose(verbose: boolean): void;
}

/** A RevenueCat error shape we defensively read (userCancelled is the key flag). */
export interface RcErrorLike {
  userCancelled?: boolean;
  code?: string | number;
  message?: string;
  underlyingErrorMessage?: string;
}
