/**
 * Server-entitlement synchronization wait (Phase 7J.4) — pure, testable.
 *
 * After an SDK purchase/restore succeeds, the webhook + provider re-fetch update
 * player_entitlements asynchronously. The client polls get_my_entitlements with a
 * BOUNDED backoff until the server reports premium, then stops. A delayed webhook
 * is never treated as a purchase failure — after the max wait we surface a calm
 * "still finalizing" state with Retry Sync / Restore, not "purchase failed".
 */

/** Backoff schedule (ms) — short first, then widen. Total ≈ 30s over 8 polls. */
export const SYNC_BACKOFF_MS = [500, 1000, 2000, 3000, 4000, 5000, 6000, 8000] as const;

export const MAX_SYNC_ATTEMPTS = SYNC_BACKOFF_MS.length;

export function backoffFor(attempt: number): number {
  if (attempt < 0) return SYNC_BACKOFF_MS[0];
  return SYNC_BACKOFF_MS[Math.min(attempt, SYNC_BACKOFF_MS.length - 1)];
}

export type SyncDecision = 'confirmed' | 'continue' | 'timeout';

/**
 * Decide the next step given the latest poll result and how many polls have run.
 * `serverPremium` is the authoritative get_my_entitlements result (server truth).
 * `aborted` short-circuits (account switch / sign-out) — treated as timeout so the
 * caller stops polling for a now-stale identity.
 */
export function decideSync(serverPremium: boolean, attempt: number, aborted = false): SyncDecision {
  if (aborted) return 'timeout';
  if (serverPremium) return 'confirmed';
  if (attempt + 1 >= MAX_SYNC_ATTEMPTS) return 'timeout';
  return 'continue';
}

/** A safe, non-identifying support reference (never a provider/transaction id). */
export function makeDiagnosticRef(userIdHashPrefix: string, epochMs: number): string {
  const t = Math.floor(epochMs / 1000).toString(36);
  return `sync-${userIdHashPrefix.slice(0, 6)}-${t}`;
}
