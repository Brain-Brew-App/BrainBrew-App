/**
 * Production `Db` adapter — backs the gameplay flow with the service-role
 * Supabase client inside the Edge runtime. This code runs only under Deno; the
 * simulation test uses a PGlite adapter instead, so this file is never imported
 * by Node. It is the ONLY place the service role touches the database.
 *
 * The service role bypasses RLS, which is exactly why every read here is scoped
 * to the minimum the flow needs, and why the client never gets this key.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { AppError } from './http.ts';
import type {
  AttemptRow, Db, ItemRow, PackRow, PuzzlePrivate, RankEligibility, SlotRow,
} from './gameplay.ts';
import type { PublicSlotRow } from './publicShape.ts';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new AppError('server_misconfigured', 500);
  return createClient(url, key, { auth: { persistSession: false } });
}

export function attemptSecret(): string {
  const s = Deno.env.get('ATTEMPT_TOKEN_SECRET');
  if (!s || s.length < 32) throw new AppError('server_misconfigured', 500);
  return s;
}

export function supabaseDb(sb: SupabaseClient): Db {
  const one = <T>(data: T[] | null): T | null => (data && data.length ? data[0] : null);

  return {
    async getPublicPack(date) {
      const { data, error } = await sb.rpc('get_public_pack', { p_date: date });
      if (error) throw new AppError('db_error', 500, error.message);
      return (data ?? []) as PublicSlotRow[];
    },

    async getLivePack(date) {
      const { data, error } = await sb
        .from('daily_packs')
        .select('pack_id, pack_date, difficulty_label, status, incident_status, content_hash')
        .eq('status', 'live').eq('pack_date', date).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as PackRow[]);
    },

    async getPackById(packId) {
      const { data, error } = await sb
        .from('daily_packs')
        .select('pack_id, pack_date, difficulty_label, status, incident_status, content_hash')
        .eq('pack_id', packId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as PackRow[]);
    },

    async getSlot(packId, position) {
      const { data, error } = await sb
        .from('daily_pack_slots')
        .select('id, pack_id, position, puzzle_id, engine_id, max_score, void_status')
        .eq('pack_id', packId).eq('position', position).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as SlotRow[]);
    },

    async resolveSlot(attempt, position) {
      // Practice attempt → its slot lives in practice_pack_slots (never void).
      if (attempt.practice_pack_id) {
        const { data, error } = await sb
          .from('practice_pack_slots')
          .select('id, practice_pack_id, position, puzzle_id, engine_id, max_score')
          .eq('practice_pack_id', attempt.practice_pack_id).eq('position', position).limit(1);
        if (error) throw new AppError('db_error', 500, error.message);
        const r = one(data as { id: string; practice_pack_id: string; position: number; puzzle_id: string; engine_id: string; max_score: number }[]);
        if (!r) return null;
        return { id: r.id, pack_id: r.practice_pack_id, position: r.position, puzzle_id: r.puzzle_id, engine_id: r.engine_id, max_score: r.max_score, void_status: false };
      }
      const { data, error } = await sb
        .from('daily_pack_slots')
        .select('id, pack_id, position, puzzle_id, engine_id, max_score, void_status')
        .eq('pack_id', attempt.pack_id).eq('position', position).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as SlotRow[]);
    },

    async resolveSlotPublic(attempt, position) {
      if (attempt.practice_pack_id) {
        const { data, error } = await sb.rpc('practice_pack_public', { p_pack: attempt.practice_pack_id });
        if (error) throw new AppError('db_error', 500, error.message);
        const rows = (data ?? []) as PublicSlotRow[];
        return rows.find((r) => r.position === position) ?? null;
      }
      // Daily: the render-safe row for this slot, resolved via the public pack.
      const packRes = await sb.from('daily_packs').select('pack_date').eq('pack_id', attempt.pack_id as string).limit(1);
      if (packRes.error) throw new AppError('db_error', 500, packRes.error.message);
      const packRow = one(packRes.data as { pack_date: string }[]);
      if (!packRow) throw new AppError('no_live_pack', 404);
      const publicRows = await this.getPublicPack(packRow.pack_date);
      const slot = await this.resolveSlot(attempt, position);
      return slot ? publicRows.find((r) => r.puzzle_id === slot.puzzle_id) ?? null : null;
    },

    async startPracticePack({ userId, sessionId, appVersion }) {
      const { data, error } = await sb.rpc('start_practice_pack', {
        p_user_id: userId, p_session_id: sessionId, p_app_version: appVersion,
      });
      if (error) {
        if (/practice_pool_exhausted/.test(error.message)) throw new AppError('practice_pool_exhausted', 503);
        throw new AppError('db_error', 500, error.message);
      }
      const r = data as { resumed: boolean; attempt_id: string; practice_pack_id: string; slots: PublicSlotRow[] };
      return { resumed: r.resumed, attempt_id: r.attempt_id, practice_pack_id: r.practice_pack_id, slots: r.slots ?? [] };
    },

    async getPuzzlePublicPayload(puzzleId) {
      const { data, error } = await sb
        .from('puzzles').select('public_payload').eq('puzzle_id', puzzleId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      const row = one(data as { public_payload: Record<string, unknown> }[]);
      return row?.public_payload ?? null;
    },

    async getPuzzlePrivate(puzzleId) {
      const { data, error } = await sb
        .from('puzzle_answers').select('answer_payload, explanation').eq('puzzle_id', puzzleId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as PuzzlePrivate[]);
    },

    async createAttempt({ userId, sessionId, packId, appVersion }) {
      const { data, error } = await sb
        .from('attempts')
        .insert({ user_id: userId, session_id: sessionId, pack_id: packId, app_version: appVersion })
        .select('id, session_id, pack_id, status, user_id, is_ranked, ranked_date, active_denominator').limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      const row = one(data as AttemptRow[]);
      if (!row) throw new AppError('db_error', 500);
      return row;
    },

    /**
     * The whole of open-puzzle's database work in ONE round trip.
     *
     * Measured: the multi-call path spent 400–600 ms of SERVER time per Continue tap,
     * almost all of it in ~6 separate HTTPS requests to PostgREST (~100 ms each) — not
     * in Postgres. The RPC performs the identical checks, atomically, and returns the
     * identical sanitized payload.
     *
     * The errors are mapped back to the EXACT AppErrors the old path raised, so every
     * client-visible failure code is unchanged.
     */
    async openSlotOneShot({ userId, attemptId, sessionId, packRef, position }) {
      const { data, error } = await sb.rpc('open_slot_for_attempt', {
        p_user: userId, p_attempt: attemptId, p_session: sessionId,
        p_pack_ref: packRef, p_position: position,
      });
      if (error) {
        const m = error.message ?? '';
        if (m.includes('attempt_not_found')) throw new AppError('attempt_not_found', 404);
        if (m.includes('wrong_user')) throw new AppError('invalid_token:wrong_user', 403);
        if (m.includes('wrong_session')) throw new AppError('invalid_token:wrong_session', 401);
        if (m.includes('wrong_pack')) throw new AppError('invalid_token:wrong_pack', 401);
        if (m.includes('attempt_not_active')) throw new AppError('attempt_not_active', 409);
        if (m.includes('already_submitted')) throw new AppError('already_submitted', 409);
        if (m.includes('slot_voided')) throw new AppError('slot_voided', 409);
        if (m.includes('slot_not_found')) throw new AppError('slot_not_found', 404);
        throw new AppError('db_error', 500, m);
      }
      const r = data as {
        attempt: AttemptRow; slot: SlotRow; public: PublicSlotRow;
      } | null;
      if (!r) throw new AppError('slot_not_found', 404);
      return { attempt: r.attempt, slot: r.slot, public: r.public };
    },

    async getAttempt(attemptId) {
      const { data, error } = await sb
        .from('attempts').select('id, session_id, pack_id, status, user_id, is_ranked, ranked_date, active_denominator, practice_pack_id').eq('id', attemptId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as AttemptRow[]);
    },

    async getItem(attemptId, slotId) {
      const { data, error } = await sb
        .from('attempt_items')
        .select('id, attempt_id, slot_id, position, opened_at, status')
        .eq('attempt_id', attemptId).eq('slot_id', slotId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as ItemRow[]);
    },

    async openItem({ attemptId, slotId, position }) {
      const { data, error } = await sb
        .from('attempt_items')
        .insert({ attempt_id: attemptId, slot_id: slotId, position })
        .select('id, attempt_id, slot_id, position, opened_at, status').limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      const row = one(data as ItemRow[]);
      if (!row) throw new AppError('db_error', 500);
      return row;
    },

    async submitItem({ attemptId, slotId, answerPayload, awardedScore, verdict, resultPayload }) {
      const { error } = await sb
        .from('attempt_items')
        .update({
          answer_payload: answerPayload,
          awarded_score: awardedScore,
          verdict,
          result_payload: resultPayload,
          submitted_at: new Date().toISOString(),
          status: 'submitted',
        })
        .eq('attempt_id', attemptId).eq('slot_id', slotId).eq('status', 'opened');
      if (error) throw new AppError('db_error', 500, error.message);
    },

    async submittedItems(attemptId) {
      const { data, error } = await sb
        .from('attempt_items')
        .select('position, awarded_score, verdict')
        .eq('attempt_id', attemptId).eq('status', 'submitted');
      if (error) throw new AppError('db_error', 500, error.message);
      return (data ?? []) as { position: number; awarded_score: number; verdict: string }[];
    },

    async completeAttempt({ attemptId, finalScore }) {
      const { error } = await sb
        .from('attempts')
        .update({ status: 'completed', final_score: finalScore, completed_at: new Date().toISOString() })
        .eq('id', attemptId).eq('status', 'active');
      if (error) throw new AppError('db_error', 500, error.message);
    },

    // --- Ranked (Phase 6A) ---

    async rankEligibility(userId, appVersion, today) {
      const { data, error } = await sb.rpc('check_rank_eligibility', {
        p_user: userId, p_app_version: appVersion, p_today: today,
      });
      if (error) throw new AppError('db_error', 500, error.message);
      return data as RankEligibility;
    },

    async profileSnapshot(userId) {
      const { data, error } = await sb
        .from('profiles').select('username, country_code').eq('id', userId).limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      const row = one(data as { username: string | null; country_code: string | null }[]);
      if (!row || !row.username || !row.country_code) return null;
      return { username: row.username, country_code: row.country_code };
    },

    async activeDenominator(packId) {
      const { data, error } = await sb
        .from('daily_pack_slots').select('max_score').eq('pack_id', packId).eq('void_status', false);
      if (error) throw new AppError('db_error', 500, error.message);
      return (data ?? []).reduce((sum: number, r: { max_score: number }) => sum + r.max_score, 0);
    },

    async createRankedAttempt(input) {
      const { data, error } = await sb
        .from('attempts')
        .insert({
          user_id: input.userId, session_id: input.sessionId, pack_id: input.packId, app_version: input.appVersion,
          is_ranked: true, ranked_date: input.rankedDate, country_code_snapshot: input.countryCode,
          username_snapshot: input.username, active_denominator: input.denominator,
          content_hash_snapshot: input.contentHash, scoring_version: input.scoringVersion,
        })
        .select('id, session_id, pack_id, status, user_id, is_ranked, ranked_date, active_denominator').limit(1);
      if (error) {
        if (error.code === '23505') throw new AppError('ranked_conflict', 409);
        throw new AppError('db_error', 500, error.message);
      }
      const row = one(data as AttemptRow[]);
      if (!row) throw new AppError('db_error', 500);
      return row;
    },

    async activeRankedAttempt(userId, rankedDate) {
      const { data, error } = await sb
        .from('attempts')
        .select('id, session_id, pack_id, status, user_id, is_ranked, ranked_date, active_denominator')
        .eq('user_id', userId).eq('ranked_date', rankedDate).eq('is_ranked', true).eq('status', 'active').limit(1);
      if (error) throw new AppError('db_error', 500, error.message);
      return one(data as AttemptRow[]);
    },

    async submittedPositions(attemptId) {
      const { data, error } = await sb
        .from('attempt_items').select('position').eq('attempt_id', attemptId).eq('status', 'submitted');
      if (error) throw new AppError('db_error', 500, error.message);
      return (data ?? []).map((r: { position: number }) => r.position);
    },
  };
}
