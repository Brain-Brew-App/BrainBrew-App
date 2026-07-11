/**
 * Platform capability + public SDK keys (Phase 7E).
 *
 * Native store subscriptions run only on iOS/Android with a PUBLIC RevenueCat SDK
 * key. Web and Expo Go without the native module are an explicit, safe
 * "unsupported / coming later" state — never a broken purchase button. Only the
 * PUBLIC platform keys are ever read here; the secret REST key lives only as a
 * Supabase Function secret and never touches the client.
 *
 * Keys are read as literal `process.env.EXPO_PUBLIC_*` members so Metro inlines
 * them. This file is not part of the pure Node test build.
 */

import { Platform } from 'react-native';

import type { PlatformCapability } from './types';

/** The public SDK key for the current platform, or null. */
export function publicSdkKey(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? null;
  return null;
}

/** The configured RevenueCat entitlement id (must match the dashboard). */
export const PREMIUM_ENTITLEMENT_ID = 'brainbrew_premium';

/**
 * Whether this build can run native purchases. Web / unknown platforms are
 * unsupported; a native platform without a key is `missing_api_key` (Founder must
 * set it in the dev build). Detecting the native module itself is done lazily by
 * the native adapter loader (a missing module also resolves to unsupported).
 */
export function purchasesCapability(): PlatformCapability {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { supported: false, reason: 'unsupported_platform' };
  }
  if (!publicSdkKey()) return { supported: false, reason: 'missing_api_key' };
  return { supported: true, reason: null };
}
