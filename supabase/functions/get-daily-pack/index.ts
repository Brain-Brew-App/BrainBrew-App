/**
 * get-daily-pack — returns the sanitized public pack for a date (default today).
 * No attempt or token required: this is the render-safe content, answers absent.
 */

import { errorResponse, json, methodGuard, readJson } from '../_shared/http.ts';
import { getDailyPack } from '../_shared/gameplay.ts';
import { attemptSecret, serviceClient, supabaseDb } from '../_shared/supabaseDb.ts';

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const body = await readJson(req);
    const deps = { db: supabaseDb(serviceClient()), secret: attemptSecret(), now: () => Date.now() };
    const result = await getDailyPack(deps, { date: body.date as string | undefined });
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
