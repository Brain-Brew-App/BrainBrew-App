/**
 * revenuecat-webhook (Phase 7E) — the authenticated boundary RevenueCat calls.
 *
 * NOT a player operation. It authenticates a shared secret configured in both
 * RevenueCat and Supabase Function secrets, is idempotent by RevenueCat event id,
 * and — critically — NEVER trusts the event body as proof of entitlement. On a
 * valid event it fetches the AUTHORITATIVE subscriber state from RevenueCat, maps
 * it once, and upserts the private entitlement row transactionally.
 *
 * Deploy WITHOUT --no-verify-jwt is wrong here (RevenueCat sends no Supabase JWT);
 * it is deployed with --no-verify-jwt and gated by its own Authorization secret.
 * Nothing sensitive is logged or returned.
 */

import { AppError, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabaseDb.ts';
import { fetchSubscriber, fingerprint, isAuthUuid, revenueCatEntitlementId } from '../_shared/revenuecat.ts';
import { mapSubscriber } from '../_shared/entitlementMap.ts';

const MAX_BODY_BYTES = 64 * 1024;

function webhookSecret(): string {
  const s = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!s || s.length < 16) throw new AppError('server_misconfigured', 500);
  return s;
}

/** Constant-time-ish comparison to avoid trivially leaking length/prefix. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Authenticate the caller (RevenueCat Authorization header) BEFORE any work.
  let expected: string;
  try {
    expected = webhookSecret();
  } catch {
    return json({ error: 'server_misconfigured' }, 500);
  }
  const provided = req.headers.get('Authorization') ?? '';
  if (!safeEqual(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 2) Size-limit + parse.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
  let payload: { event?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const event = payload?.event;
  if (!event || typeof event !== 'object') return json({ error: 'bad_request' }, 400);

  const eventId = String(event.id ?? '');
  const eventType = typeof event.type === 'string' ? event.type : 'unknown';
  const appUserId = event.app_user_id;
  if (!eventId) return json({ error: 'bad_request' }, 400);

  const sb = serviceClient();
  const rpc = sb.rpc.bind(sb);

  // 3) Idempotency — claim the event id; a duplicate delivery is a no-op success.
  const fp = isAuthUuid(appUserId) ? await fingerprint(appUserId) : 'invalid';
  const claim = await rpc('claim_webhook_event', { p_event_id: eventId, p_event_type: eventType, p_fingerprint: fp });
  if (claim.error) return json({ error: 'db_error' }, 500);
  if (claim.data === false) return json({ ok: true, duplicate: true }, 200);

  try {
    // 4) The App User ID MUST be a Supabase Auth UUID (the canonical identity).
    if (!isAuthUuid(appUserId)) {
      await rpc('finish_webhook_event', { p_event_id: eventId, p_status: 'quarantined', p_error: 'invalid_app_user_id' });
      return json({ ok: true, quarantined: true }, 200);
    }

    // 5) Fetch AUTHORITATIVE state (never trust the event body).
    const { subscriber } = await fetchSubscriber(appUserId);
    const mapped = mapSubscriber(subscriber, revenueCatEntitlementId(), Date.now());

    // 6) Upsert transactionally, guarded against unknown users & stale ordering.
    const fields = {
      ...mapped.fields,
      source: 'revenuecat',
      latest_event_id: eventId,
      source_updated_at: new Date(
        typeof event.event_timestamp_ms === 'number' ? event.event_timestamp_ms : Date.now(),
      ).toISOString(),
    };
    const sync = await rpc('sync_player_entitlement', { p_user_id: appUserId, p_state: mapped.state, p_fields: fields });
    if (sync.error) throw new AppError('db_error', 500);

    const applied = (sync.data as { applied?: boolean } | null)?.applied === true;
    const reason = (sync.data as { reason?: string } | null)?.reason;
    const status = applied ? 'processed' : (reason === 'unknown_user' ? 'quarantined' : 'duplicate');
    await rpc('finish_webhook_event', { p_event_id: eventId, p_status: status, p_error: applied ? null : reason ?? null });

    // Operational log only — no receipt, token, email, secret, or full user id.
    console.log('revenuecat_webhook', JSON.stringify({ eventType, state: mapped.state, applied, user: fp.slice(0, 8) }));
    return json({ ok: true, applied }, 200);
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'internal_error';
    // Mark the event 'error' so a RevenueCat retry can re-claim and reprocess it
    // (claim_webhook_event re-claims only 'error' rows). Best-effort.
    try { await rpc('finish_webhook_event', { p_event_id: eventId, p_status: 'error', p_error: code }); } catch { /* ignore */ }
    // Return 500 so RevenueCat RETRIES the delivery.
    return json({ error: code }, err instanceof AppError ? err.status : 500);
  }
});
