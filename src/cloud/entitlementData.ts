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

export function cachedEntitlements(): ValidEntitlements | null {
  return cached;
}

/** Drop the cached entitlement (on any identity change). */
export function invalidateMyEntitlements(): void {
  cached = null;
}

export async function fetchEntitlements(): Promise<ValidEntitlements> {
  const value = validateEntitlements(await entitlementApi.get());
  cached = value;
  return value;
}
