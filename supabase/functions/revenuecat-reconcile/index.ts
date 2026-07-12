/**
 * revenuecat-reconcile (Phase 7J.5) — an AUTHENTICATED, self-only entitlement
 * reconcile. The player triggers it after an SDK purchase/restore, a delayed
 * webhook, or a restart-during-finalization. It derives the user from the verified
 * JWT (NEVER an arbitrary body UUID), re-fetches the AUTHORITATIVE RevenueCat
 * subscriber state (never trusts the client), maps it through the canonical mapper,
 * and upserts player_entitlements transactionally via the same RPC the webhook uses.
 *
 * Returns only the safe normalized entitlement state — never a receipt, transaction
 * id, RevenueCat customer id, or provider payload. Idempotent (the sync RPC ignores
 * stale/duplicate state). Lightly rate-limited per user.
 */

import { errorResponse, json, methodGuard } from '../_shared/http.ts';
import { AppError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { fetchSubscriber, isAuthUuid, revenueCatEntitlementId } from '../_shared/revenuecat.ts';
import { mapSubscriber } from '../_shared/entitlementMap.ts';
import { serviceClient } from '../_shared/supabaseDb.ts';

// Small in-memory per-user cooldown (best-effort; the DB sync is the real guard).
const lastRun = new Map<string, number>();
const COOLDOWN_MS = 3000;

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);              // JWT-derived; no client UUID accepted
    if (!isAuthUuid(user.id)) throw new AppError('invalid_user', 400);

    const now = Date.now();
    const prev = lastRun.get(user.id) ?? 0;
    if (now - prev < COOLDOWN_MS) return json({ ok: true, throttled: true }, 200);
    lastRun.set(user.id, now);

    // Authoritative provider re-fetch (never the client's word).
    const { subscriber } = await fetchSubscriber(user.id);
    const mapped = mapSubscriber(subscriber, revenueCatEntitlementId(), now);

    const svc = serviceClient();
    const fields = { ...mapped.fields, source: 'revenuecat', source_updated_at: new Date(now).toISOString() };
    const { data, error } = await svc.rpc('sync_player_entitlement', { p_user_id: user.id, p_state: mapped.state, p_fields: fields });
    if (error) throw new AppError('db_error', 500);

    const applied = (data as { applied?: boolean } | null)?.applied === true;
    // Safe operational log — no receipt/token/customer-id/full-user-id.
    console.log('revenuecat_reconcile', JSON.stringify({ state: mapped.state, applied, user: user.id.slice(0, 8) }));

    // Only the sanitized state crosses the boundary.
    return json({ ok: true, entitlement_state: mapped.state, applied }, 200);
  } catch (err) {
    return errorResponse(err);
  }
});
