/**
 * Player progress client — the app side of the Phase 6D progress surface.
 *
 * Three read-only, authenticated-only RPCs, all server-authoritative and derived
 * from canonical ranked attempts (no client date, no user parameter):
 *   • get_my_progress_summary → streak + lifetime stats + today status
 *   • get_my_progress_detail  → category performance + completion calendar
 *   • get_my_ranked_history   → paginated ranked daily history (newest first)
 *
 * Responses are validated (recursive private-field guard) in src/cloud/validate.ts
 * before any screen sees them. Selected only in cloud mode.
 */

import { getSupabase } from './client';

export class ProgressError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ProgressError';
  }
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const call = getSupabase().rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await call(fn, args);
  if (error) throw new ProgressError('network_error');
  return data;
}

export const progress = {
  /** Streak + lifetime statistics + today status. Date is server-derived (UTC). */
  summary(): Promise<unknown> {
    return rpc('get_my_progress_summary', {});
  },
  /** Category performance + rolling completion calendar (default 35-day window). */
  detail(days = 35): Promise<unknown> {
    return rpc('get_my_progress_detail', { p_days: days });
  },
  /** One page of ranked history, newest first. `before` is the last date seen. */
  history(before: string | null = null, limit = 30): Promise<unknown> {
    return rpc('get_my_ranked_history', before ? { p_before: before, p_limit: limit } : { p_limit: limit });
  },
  /** Private Practice summary (separate from ranked stats). */
  practiceSummary(): Promise<unknown> {
    return rpc('get_my_practice_summary', {});
  },
  /** One page of Practice history, newest first (keyset on completed_at). */
  practiceHistory(before: string | null = null, limit = 20): Promise<unknown> {
    return rpc('get_my_practice_history', before ? { p_before: before, p_limit: limit } : { p_limit: limit });
  },
};
