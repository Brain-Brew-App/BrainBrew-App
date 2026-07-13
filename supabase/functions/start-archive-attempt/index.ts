/**
 * start-archive-attempt (Phase 7J.5) — starts (or resumes) a Premium UNRANKED
 * Archive Brew for a PAST daily pack. JWT-verified; entitlement is re-checked
 * server-side inside `start_archive_attempt` (a free/expired user is rejected).
 * Creates the archive attempt + items via the tested RPC, then issues an attempt
 * token bound to the historical pack so open/submit/complete work unchanged.
 *
 * The attempt is is_ranked=false with attempt_purpose='archive' — excluded from
 * every ranked surface. The client never names puzzle ids and never gets an answer.
 */

import { errorResponse, json, methodGuard, readJson, AppError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { serviceClient, attemptSecret } from '../_shared/supabaseDb.ts';
import { newNonce, signToken } from '../_shared/token.ts';

const ATTEMPT_TTL_SEC = 60 * 60;

Deno.serve(async (req) => {
  const guard = methodGuard(req);
  if (guard) return guard;
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const date = typeof body.date === 'string' ? body.date : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('bad_date', 400);
    if (sessionId.length < 16) throw new AppError('bad_session', 400);

    const svc = serviceClient();
    // Entitlement + historical-pack checks live in the RPC (server-authoritative).
    const { data, error } = await svc.rpc('start_archive_attempt', {
      p_user_id: user.id, p_date: date, p_session_id: sessionId,
      p_app_version: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 32) : null,
    });
    if (error) {
      // Map the RPC's stable error codes; never leak raw SQL text.
      const msg = String((error as { message?: unknown }).message ?? '');
      if (/archive_locked|42501/.test(msg)) throw new AppError('archive_locked', 403);
      if (/not_a_past_date|22023/.test(msg)) throw new AppError('not_a_past_date', 400);
      if (/unavailable|fully_voided|P0001/.test(msg)) throw new AppError('archive_unavailable', 404);
      throw new AppError('archive_error', 500);
    }
    const res = data as { attempt_id: string; ranked_date: string; resumed: boolean };

    // The token binds to the historical pack_id for this date.
    const packRow = await svc.from('daily_packs').select('pack_id').eq('pack_date', date).maybeSingle();
    const packId = (packRow.data as { pack_id?: string } | null)?.pack_id;
    if (!packId) throw new AppError('archive_unavailable', 404);

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ATTEMPT_TTL_SEC;
    const attemptToken = await signToken(attemptSecret(), {
      typ: 'attempt', aid: res.attempt_id, uid: user.id, sid: sessionId, pid: packId, iat, exp, nonce: newNonce(),
    });

    // Active (non-void) slot count — the archive brew's puzzle count + denominator base.
    const slotRes = await svc.from('daily_pack_slots').select('position').eq('pack_id', packId).eq('void_status', false);
    const positions = ((slotRes.data as { position: number }[] | null) ?? []).map((s) => s.position).sort((a, b) => a - b);

    // RESUME INFO. Without this the client always re-opened slot 1 on a resumed
    // archive attempt, so any Archive brew interrupted after the first answer could
    // never be finished: slot 1 came back `already_submitted` and the player was
    // bounced Home, for that date, forever. A paid feature, permanently broken.
    // Mirrors the ranked/practice contract (`_shared/gameplay.ts`).
    let completedPositions: number[] = [];
    if (res.resumed) {
      const done = await svc
        .from('attempt_items').select('position')
        .eq('attempt_id', res.attempt_id).eq('status', 'submitted');
      completedPositions = ((done.data as { position: number }[] | null) ?? [])
        .map((r) => r.position).sort((a, b) => a - b);
    }
    // The first slot with no answer. If every slot is answered we return
    // positions.length + 1 (past the end) so the client can tell "nothing left to
    // open — this attempt must be COMPLETED" apart from "re-open the last slot".
    const resumePosition = positions.find((p) => !completedPositions.includes(p))
      ?? positions.length + 1;

    console.log('start_archive_attempt', JSON.stringify({
      resumed: res.resumed, completed: completedPositions.length, user: user.id.slice(0, 8),
    }));
    return json({
      attemptId: res.attempt_id, attemptToken, expiresAt: exp,
      rankedDate: res.ranked_date, resumed: res.resumed,
      puzzleCount: positions.length, positions,
      completedPositions, resumePosition,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
