/**
 * open-puzzle — starts the server-side timer for one slot (by position) and
 * issues a slot-bound `open` token. Idempotent: re-opening never resets the
 * timer. Returns the render-safe puzzle; the answer is still withheld.
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { openPuzzle } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };
    const result = await openPuzzle(deps, {
      attemptToken: body.attemptToken,
      userId: user.id,
      sessionId: body.sessionId,
      position: body.position,
    });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
