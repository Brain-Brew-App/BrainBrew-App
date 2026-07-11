/**
 * complete-attempt — finalizes the BrewScore by summing the server-awarded
 * per-slot scores. Idempotent. The result is UNRANKED and will stay so until
 * authentication, profiles, and leaderboard integrity exist (Core Spec §9).
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { completeAttempt } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };
    const result = await completeAttempt(deps, {
      attemptToken: body.attemptToken,
      userId: user.id,
      sessionId: body.sessionId,
    });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
