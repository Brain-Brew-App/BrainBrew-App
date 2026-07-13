/**
 * Native RevenueCat adapter (Phase 7E) — iOS/Android only.
 *
 * `react-native-purchases` is loaded LAZILY via dynamic import, so the web bundle
 * never pulls native code and Node tests never touch it. The service only ever
 * asks for this adapter after `purchasesCapability().supported` is true; if the
 * module is somehow absent, loading rejects and the caller shows the unsupported
 * state. No secret key is used here — only the platform PUBLIC SDK key.
 */

import type { PurchasesAdapter, RcErrorLike } from './adapter';
import { PREMIUM_ENTITLEMENT_ID } from './platform';

 
type PurchasesModule = any;

let cached: PurchasesModule | null = null;
async function loadPurchases(): Promise<PurchasesModule> {
  if (cached) return cached;
  // Dynamic import keeps this out of the web bundle and Node test graph.
  const mod = await import('react-native-purchases');
  cached = (mod as { default?: unknown }).default ?? mod;
  return cached;
}

/** True when the RevenueCat customer info shows our entitlement active. */
export function customerHasPremium(info: unknown): boolean {
  const active = (info as { entitlements?: { active?: Record<string, unknown> } })?.entitlements?.active;
  return Boolean(active && Object.prototype.hasOwnProperty.call(active, PREMIUM_ENTITLEMENT_ID));
}

export function createNativeAdapter(): PurchasesAdapter {
  return {
    async configure(apiKey, appUserId) {
      const P = await loadPurchases();
      await P.configure({ apiKey, appUserID: appUserId });
    },
    async logIn(appUserId) {
      const P = await loadPurchases();
      await P.logIn(appUserId);
    },
    async logOut() {
      const P = await loadPurchases();
      // logOut throws if the current user is already anonymous — tolerate that.
      try { await P.logOut(); } catch { /* already anonymous / not configured */ }
    },
    async getOfferings() {
      const P = await loadPurchases();
      return P.getOfferings();
    },
    async getCustomerInfo() {
      const P = await loadPurchases();
      return P.getCustomerInfo();
    },
    async purchasePackage(rawPackage) {
      const P = await loadPurchases();
      try {
        const res = await P.purchasePackage(rawPackage);
        return { customerInfo: res.customerInfo, userCancelled: false };
      } catch (e) {
        const err = e as RcErrorLike;
        if (err?.userCancelled) return { customerInfo: null, userCancelled: true };
        throw e;
      }
    },
    async restorePurchases() {
      const P = await loadPurchases();
      return P.restorePurchases();
    },
    addCustomerInfoUpdateListener(cb) {
      // Loaded synchronously-enough: configure() has already run before listeners.
      let remove = () => {};
      void loadPurchases().then((P) => {
        P.addCustomerInfoUpdateListener(cb);
        remove = () => P.removeCustomerInfoUpdateListener(cb);
      });
      return () => remove();
    },
    setLogLevelVerbose(verbose) {
      void loadPurchases().then((P) => {
        if (P.setLogLevel && P.LOG_LEVEL) P.setLogLevel(verbose ? P.LOG_LEVEL.VERBOSE : P.LOG_LEVEL.ERROR);
      });
    },
  };
}
