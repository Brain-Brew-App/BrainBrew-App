/**
 * Daily leaderboard client — the app side of the Phase 6C ranking surface.
 *
 * Two read-only RPCs, authenticated-only, server-authoritative:
 *   • get_my_daily_rank         → the caller's personal summary (Results/Home/header)
 *   • get_daily_leaderboard     → one paginated page of sanitized rows
 *
 * The server derives the user, their snapshotted country, the UTC date, and every
 * validity filter. This client never sends a date or a country and never trusts a
 * position as a cursor — it passes only a server-clamped integer page cursor. The
 * raw responses are validated (recursive private-field guard) in src/cloud/validate.ts
 * before they reach any screen. Selected only in cloud mode.
 */

import { getSupabase } from './client';

export type LeaderboardScope = 'global' | 'country';

/** A failed leaderboard RPC. Carries a stable, player-safe code. */
export class LeaderboardError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'LeaderboardError';
  }
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  // The generated types are regenerated after these functions deploy; call
  // through a loosely-typed handle until then. Responses are validated at runtime.
  const call = getSupabase().rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await call(fn, args);
  if (error) throw new LeaderboardError('network_error');
  return data;
}

export const leaderboard = {
  /** The caller's daily rank summary. Date is always server-derived (UTC today). */
  myDailyRank(): Promise<unknown> {
    return rpc('get_my_daily_rank', {});
  },
  /**
   * One page of the daily leaderboard for a scope. `afterPosition` is the last
   * position already seen (0 for the first page); the server clamps it and the
   * page size. Date is server-derived; country scope is server-derived.
   */
  dailyLeaderboard(scope: LeaderboardScope, afterPosition = 0, limit = 50): Promise<unknown> {
    return rpc('get_daily_leaderboard', {
      p_scope: scope,
      p_after_position: afterPosition,
      p_limit: limit,
    });
  },
};
