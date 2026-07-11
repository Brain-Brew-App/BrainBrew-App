/**
 * The platform read of the content-mode environment.
 *
 * Kept out of `mode.ts` (which stays pure for Node tests) because Metro inlines
 * only LITERAL `process.env.EXPO_PUBLIC_*` member reads at bundle time — so those
 * reads must appear verbatim here. This file is not part of the pure test build.
 */

import { resolveContentConfig, type ContentConfig } from './mode';

// Metro defines `__DEV__`; plain Node does not. Declared locally, `typeof`-guarded.
declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;

let cached: ContentConfig | null = null;

/** The resolved content config for the running app (memoized). */
export function contentConfig(): ContentConfig {
  if (!cached) {
    cached = resolveContentConfig(
      {
        // These three MUST be literal member reads for Metro to inline them.
        EXPO_PUBLIC_CONTENT_SOURCE: process.env.EXPO_PUBLIC_CONTENT_SOURCE,
        EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
      IS_DEV,
    );
  }
  return cached;
}

/** True when the running app is in cloud mode. */
export const isCloudMode = (): boolean => contentConfig().mode === 'cloud';

/** The active mode, for consumers that only need the discriminant. */
export const activeMode = (): ContentConfig['mode'] => contentConfig().mode;
