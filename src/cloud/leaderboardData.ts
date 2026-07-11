/**
 * Leaderboard data access — fetch + validate + a tiny in-session cache.
 *
 * The RPC responses are validated (recursive private-field guard) before any
 * screen sees them. The personal rank summary is cached in memory for the session
 * so Home/Results can paint it instantly on revisit; it is invalidated when a new
 * ranked result completes (a void recalculation or a fresh attempt) so a stale
 * score is never shown as current.
 */

import { leaderboard, LeaderboardError, type LeaderboardScope } from '../infrastructure/supabase/leaderboardClient';
import {
  PayloadError,
  validateLeaderboardPage,
  validateMyDailyRank,
  type ValidLeaderboardPage,
  type ValidMyDailyRank,
} from './validate';

export function leaderboardErrorCode(e: unknown): string {
  if (e instanceof LeaderboardError) return e.code;
  if (e instanceof PayloadError) return e.code === 'answer_leak' ? 'answer_leak' : 'invalid_response';
  return 'network_error';
}

let cachedRank: ValidMyDailyRank | null = null;

/** The last validated summary this session, or null. Safe fields only. */
export function cachedMyRank(): ValidMyDailyRank | null {
  return cachedRank;
}

/** Drop the cached summary (call after a ranked completion or recalculation). */
export function invalidateMyRank(): void {
  cachedRank = null;
}

export async function fetchMyRank(): Promise<ValidMyDailyRank> {
  const raw = await leaderboard.myDailyRank();
  const value = validateMyDailyRank(raw);
  cachedRank = value;
  return value;
}

export async function fetchLeaderboardPage(
  scope: LeaderboardScope, afterPosition = 0, limit = 50,
): Promise<ValidLeaderboardPage> {
  const raw = await leaderboard.dailyLeaderboard(scope, afterPosition, limit);
  return validateLeaderboardPage(raw);
}
