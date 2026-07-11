/**
 * submit-answer — accepts the client's RAW submission (taps/order/choice, never
 * a derived score), computes elapsed time from the server timer, scores against
 * the private answer key, and only THEN reveals verdict, points, and
 * explanation. The answer key itself never leaves the server.
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { submitAnswer } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };
    const result = await submitAnswer(deps, {
      openToken: body.openToken,
      userId: user.id,
      sessionId: body.sessionId,
      position: body.position,
      submission: body.submission,
    });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
