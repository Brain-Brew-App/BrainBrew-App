/**
 * start-practice-attempt — starts (or resumes) a fresh UNRANKED reserve-Practice
 * brew. The server selects five eligible reserve puzzles (one per category, never
 * today's ranked pack), creates an immutable practice pack + an unranked attempt,
 * and issues an attempt token bound to that practice pack. The client cannot name
 * puzzle ids and never receives an answer.
 *
 * Practice is never ranked: it cannot touch the daily leaderboard, streaks, ranked
 * history, ranked statistics, ranked score, or rank eligibility.
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { startPracticeAttempt } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };

    const result = await startPracticeAttempt(deps, {
      userId: user.id,
      sessionId: body.sessionId,
      appVersion: body.appVersion,
    });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
