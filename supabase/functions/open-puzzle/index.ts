/**
 * open-puzzle — starts the server-side timer for one slot (by position) and
 * issues a slot-bound `open` token. Idempotent: re-opening never resets the
 * timer. Returns the render-safe puzzle; the answer is still withheld.
 *
 * Emits `x-bb-timing` (DURATIONS ONLY — no ids, tokens, answers or payloads) so the
 * perf audit can separate SERVER work from the client's network latency. This call
 * measured ~2.7x the cost of submit-answer and the reason was not guessable from
 * outside the isolate.
 */

import { errorResponse, json, methodGuard, readJson, stopwatch } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { openPuzzle } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  const sw = stopwatch();
  try {
    const user = await requireUser(req);
    sw.mark('auth');
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now(), sw };
    sw.mark('deps');
    const result = await openPuzzle(deps, {
      attemptToken: body.attemptToken,
      userId: user.id,
      sessionId: body.sessionId,
      position: body.position,
    });
    sw.mark('flow');
    return json(result, 200, sw.header());
  } catch (err) {
    return errorResponse(err);
  }
});
