/**
 * Default RevenueCatService wiring (Phase 7E).
 *
 * Returns a configured service ONLY on a supported native platform with a public
 * SDK key; otherwise null (web / Expo Go / missing key → the screen shows the
 * safe unsupported state). The native adapter dynamic-imports the SDK, so this
 * module is safe to import from the web bundle.
 */

import { createNativeAdapter, customerHasPremium } from './nativeAdapter';
import { publicSdkKey, purchasesCapability } from './platform';
import { createRevenueCatService, type RevenueCatService } from './service';

declare const __DEV__: boolean | undefined;

let instance: RevenueCatService | null = null;

/** The shared service, or null when native purchases are unsupported here. */
export function getRevenueCatService(): RevenueCatService | null {
  const cap = purchasesCapability();
  const key = publicSdkKey();
  if (!cap.supported || !key) return null;
  if (!instance) {
    instance = createRevenueCatService({
      adapter: createNativeAdapter(),
      apiKey: key,
      hasPremium: customerHasPremium,
      isDev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    });
  }
  return instance;
}

export { purchasesCapability, PREMIUM_ENTITLEMENT_ID } from './platform';
export type { OfferingContract, PackageContract, PlatformCapability, PurchaseOutcome, RestoreOutcome } from './types';
