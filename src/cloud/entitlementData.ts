/**
 * Entitlement data access (Phase 7D) — fetch + validate + a tiny in-session cache.
 *
 * Cloud only. The mode-aware façade (`entitlementService.ts`) decides whether to
 * call this at all; local mode uses the explicit local policy and never reaches
 * here. The cache is invalidated on any identity change (guest → new guest,
 * sign-out, upgrade) so a switched player never sees a stale capability set.
 *
 * The entitlement contract is low-churn (it changes only when a player's tier
 * changes), so a session cache is safe and keeps the Premium surfaces instant.
 */

import { entitlementApi, EntitlementError } from '../infrastructure/supabase/entitlementClient';
import { PayloadError, validateEntitlements, type ValidEntitlements } from './validate';

export function entitlementErrorCode(e: unknown): string {
  if (e instanceof EntitlementError) return e.code;
  if (e instanceof PayloadError) return e.code === 'answer_leak' ? 'answer_leak' : 'invalid_response';
  return 'network_error';
}

let cached: ValidEntitlements | null = null;

/**
 * Subscribers to cache changes.
 *
 * Without this, a purchase confirmed by the Premium controller updated THIS cache
 * but not the React state of other entitlement readers, so the app kept using its
 * pre-purchase snapshot: "Open Archives" led straight to the locked Archives screen
 * until the app was restarted. Any surface that reads an entitlement must see a
 * newly-confirmed one immediately.
 */
type EntitlementListener = (value: ValidEntitlements | null) => void;
const listeners = new Set<EntitlementListener>();

/** Subscribe to entitlement changes. Returns an unsubscribe function. */
export function onEntitlementsChanged(fn: EntitlementListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(): void {
  for (const fn of [...listeners]) fn(cached);
}

export function cachedEntitlements(): ValidEntitlements | null {
  return cached;
}

/** Drop the cached entitlement (on any identity change). */
export function invalidateMyEntitlements(): void {
  cached = null;
  emit();                       // readers must drop a previous player's capabilities
}

export async function fetchEntitlements(): Promise<ValidEntitlements> {
  const value = validateEntitlements(await entitlementApi.get());
  cached = value;
  emit();                       // a newly-confirmed Premium reaches every reader
  return value;
}
