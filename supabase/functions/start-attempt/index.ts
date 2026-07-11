/**
 * start-attempt — creates an attempt for today's live pack and issues a signed,
 * short-lived attempt token bound to (attempt, session, pack). The publishable
 * key proves "a BrainBrew app is calling"; this token proves "this session owns
 * this attempt", which is what open/submit/complete require.
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { startAttempt, startDailyAttempt } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };

    // `intent: 'ranked'` is a REQUEST, not authority — the server verifies
    // eligibility and derives is_ranked/date/country itself. Anything else is an
    // unranked practice/guest attempt.
    if (body.intent === 'ranked') {
      // Maintenance enforcement (Phase 7G): refuse new ranked starts when the
      // operational flag disables them (server-authoritative; client cannot override).
      // Existing active ranked attempts are unaffected — only NEW starts are gated.
      const sb = serviceClient();
      const { data: allowed } = await sb.rpc('operational_allows', { p_area: 'ranked' });
      if (allowed === false) return json({ error: 'service_unavailable' }, 503);

      const result = await startDailyAttempt(deps, {
        userId: user.id,
        sessionId: body.sessionId,
        appVersion: body.appVersion,
      });
      return json(result);
    }

    const result = await startAttempt(deps, {
      date: body.date as string | undefined,
      userId: user.id,
      sessionId: body.sessionId,
      appVersion: body.appVersion,
    });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
