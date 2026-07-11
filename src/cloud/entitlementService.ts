/**
 * EntitlementService (Phase 7D) — the mode-aware façade the app reads.
 *
 * This is the single boundary screens/hooks use to answer "what can this player
 * do?". It hides the local/cloud split:
 *   • LOCAL mode  → the explicit `LOCAL_DEV_ENTITLEMENTS` policy. Never a network
 *     call, never Supabase (Task 16).
 *   • CLOUD mode  → the server's `get_my_entitlements` contract, fetched once per
 *     session and cached; invalidated on any identity change.
 *
 * It exposes both async (`get`/`refresh`) and sync (`peek`/`hasCapability`/
 * `practiceAccess`) reads. The sync reads fall back to the cache, then the local
 * policy, then fail-closed — they never block a render and never over-grant.
 *
 * Nothing here can affect ranked play: the entitlement never carries more than
 * one ranked attempt (clamped in the validator), and no method gates the ranked
 * flow — the server is the sole ranked authority.
 */

import { isCloudMode } from './env';
import { LOCAL_DEV_ENTITLEMENTS, hasCapability } from './entitlements';
import {
  cachedEntitlements, fetchEntitlements, invalidateMyEntitlements,
} from './entitlementData';
import { currentPracticeAccess, practiceAccessFromEntitlements, type PracticeAccessPolicy } from './practicePolicy';
import type { EntitlementCapability, ValidEntitlements } from './validate';

/** Resolve the current entitlement, fetching in cloud mode (cache-first). */
export async function getEntitlements(): Promise<ValidEntitlements> {
  if (!isCloudMode()) return LOCAL_DEV_ENTITLEMENTS;
  return cachedEntitlements() ?? fetchEntitlements();
}

/** Force a fresh read from the server (cloud only); local returns the local policy. */
export async function refreshEntitlements(): Promise<ValidEntitlements> {
  if (!isCloudMode()) return LOCAL_DEV_ENTITLEMENTS;
  invalidateMyEntitlements();
  return fetchEntitlements();
}

/**
 * The best entitlement available WITHOUT awaiting: the cloud cache if present,
 * otherwise the local policy in local mode, otherwise null (cloud, not yet
 * loaded). Callers treat null as "nothing unlocked yet".
 */
export function peekEntitlements(): ValidEntitlements | null {
  if (!isCloudMode()) return LOCAL_DEV_ENTITLEMENTS;
  return cachedEntitlements();
}

/** Fail-closed capability check against the best-known entitlement. */
export function capabilityEnabled(cap: EntitlementCapability): boolean {
  return hasCapability(peekEntitlements(), cap);
}

/**
 * The practice access policy. Cloud mode derives it from the server contract;
 * local mode uses the explicit local policy. Before the cloud entitlement has
 * loaded, falls back to the beta policy so practice affordances are never
 * wrongly hidden during the first paint (the server still authorises the start).
 */
export function practiceAccess(): PracticeAccessPolicy {
  if (!isCloudMode()) return currentPracticeAccess();
  const ent = cachedEntitlements();
  return ent ? practiceAccessFromEntitlements(ent) : currentPracticeAccess();
}

/** Reset the cached entitlement on any identity change (guest swap, sign-out, upgrade). */
export function resetEntitlementsForIdentityChange(): void {
  invalidateMyEntitlements();
}
