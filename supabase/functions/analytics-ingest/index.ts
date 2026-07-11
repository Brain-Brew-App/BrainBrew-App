/**
 * analytics-ingest (Phase 7G) — the ONLY path client UI events reach the database.
 *
 * The player is derived from the VERIFIED JWT (never from the body). Events are
 * validated + written by the service-role `ingest_analytics_events` RPC (allowlist,
 * safe-property + size guard, dedup) — so a client cannot spoof a user id, inject
 * an answer/token/email, or write arbitrary rows. Analytics is best-effort and must
 * NEVER block gameplay: failures return a safe 200-ish response and the app moves on.
 *
 * Accepts a small batch (≤50 events, ≤32KB body). No full payload is logged.
 */

import { AppError, CORS_HEADERS, json } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { serviceClient } from '../_shared/supabaseDb.ts';

const MAX_BODY = 32 * 1024;
const MAX_BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req); // 401 if no/invalid session

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ accepted: 0, rejected: 0, error: 'payload_too_large' }, 413);
    let body: { events?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ accepted: 0, rejected: 0, error: 'bad_request' }, 400); }

    const events = Array.isArray(body?.events) ? body.events : [];
    if (events.length === 0) return json({ accepted: 0, rejected: 0 }, 200);
    if (events.length > MAX_BATCH) return json({ accepted: 0, rejected: events.length, error: 'batch_too_large' }, 413);

    const sb = serviceClient();
    const { data, error } = await sb.rpc('ingest_analytics_events', {
      p_user: user.id,
      p_is_anon: user.isAnonymous,
      p_events: events,
    });
    if (error) throw new AppError('ingest_failed', 500);

    const result = (data ?? { accepted: 0, rejected: 0 }) as { accepted: number; rejected: number };
    // Operational log only — counts, never payloads.
    console.log('analytics_ingest', JSON.stringify({ accepted: result.accepted, rejected: result.rejected }));
    return json(result, 200);
  } catch (err) {
    // Auth failures are the one case we surface (401); everything else is swallowed
    // to a 200 so a client's analytics failure can never break the app loop.
    if (err instanceof AppError && err.status === 401) return json({ error: err.code }, 401);
    return json({ accepted: 0, rejected: 0, error: 'ingest_unavailable' }, 200);
  }
});
