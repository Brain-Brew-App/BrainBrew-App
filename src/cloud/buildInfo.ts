/**
 * Safe build diagnostics (RC1-A).
 *
 * One line, emitted once at startup, that ties a device to an exact build and an
 * exact tree during certification. Everything here is safe to print:
 *
 *   • appVersion / versionCode / commit — build identity, not secrets
 *   • environment  — development | production (derived from __DEV__)
 *   • contentSource— local | cloud
 *   • storeMode    — test_store | google_play | unconfigured | invalid
 *
 * The RevenueCat store mode is derived from the key PREFIX (see storeMode.ts); the
 * key itself is never read here, never logged, and never returned. No user id, no
 * email, no token, no receipt.
 */

import { activeMode } from './env';
import { currentStoreMode } from './revenuecat/platform';

declare const __DEV__: boolean | undefined;

/**
 * expo-constants is a NATIVE module. A dev client built before it was added does not
 * contain it, and a bare `import` would throw at module load — i.e. a diagnostics
 * line would crash the app before the first render. Diagnostics must never be able
 * to do that, so the module is loaded defensively and degrades to 'unknown'.
 */
function expoExtra(): { build?: { appVersion?: string; versionCode?: number; commit?: string }; } & { version?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-constants') as { default?: { expoConfig?: { version?: string; extra?: Record<string, unknown> } } };
    const cfg = mod?.default?.expoConfig;
    return { ...(cfg?.extra ?? {}), version: cfg?.version };
  } catch {
    return {};
  }
}

export interface BuildInfo {
  appVersion: string;
  versionCode: number | string;
  commit: string;
  environment: 'development' | 'production';
  contentSource: 'local' | 'cloud';
  storeMode: string;
}

export function buildInfo(): BuildInfo {
  const extra = expoExtra();
  return {
    appVersion: extra.build?.appVersion ?? extra.version ?? 'unknown',
    versionCode: extra.build?.versionCode ?? 'unknown',
    commit: extra.build?.commit ?? 'unknown',
    environment: typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production',
    contentSource: activeMode(),
    storeMode: currentStoreMode(),
  };
}

/** A single, greppable line. Safe in any build. */
export function buildInfoLine(): string {
  const b = buildInfo();
  return `[build] BrainBrew ${b.appVersion} (vc ${b.versionCode}) · commit ${b.commit} · env ${b.environment} · content ${b.contentSource} · store ${b.storeMode}`;
}

let announced = false;

/** Log the build line exactly once per process. */
export function announceBuild(): void {
  if (announced) return;
  announced = true;
  console.log(buildInfoLine());
}
