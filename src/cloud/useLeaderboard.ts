/**
 * Leaderboard hooks (cloud only).
 *
 *  • useMyRankSummary — the compact personal summary for Results and Home. Paints
 *    the cached value instantly, refreshes in the background, and NEVER blocks the
 *    screen it lives on (the BrewScore/Home render first; this fills in after).
 *
 *  • useDailyLeaderboard — the Leaderboard screen: Global/Country tabs, keyset-free
 *    position-windowed pagination, pull-to-refresh, and per-scope state so switching
 *    tabs keeps what was already loaded.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LeaderboardScope } from '../infrastructure/supabase/leaderboardClient';
import {
  cachedMyRank, fetchLeaderboardPage, fetchMyRank, leaderboardErrorCode,
} from './leaderboardData';
import type { ValidLeaderboardRow, ValidMyDailyRank } from './validate';

const PAGE_SIZE = 50;

export type SummaryPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface MyRankSummaryView {
  phase: SummaryPhase;
  summary: ValidMyDailyRank | null;
  retry: () => void;
}

/** The personal daily rank summary — non-blocking, cache-first. */
export function useMyRankSummary(enabled: boolean): MyRankSummaryView {
  const [summary, setSummary] = useState<ValidMyDailyRank | null>(() => cachedMyRank());
  const [phase, setPhase] = useState<SummaryPhase>(cachedMyRank() ? 'ready' : 'idle');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPhase((p) => (summary ? p : 'loading'));
    try {
      const s = await fetchMyRank();
      setSummary(s);
      setPhase('ready');
    } catch {
      setPhase((p) => (summary ? p : 'error'));
    } finally {
      inFlight.current = false;
    }
  }, [enabled, summary]);

  useEffect(() => {
    if (enabled) void load();
    // Run once when enabled flips true; `load` closes over `summary` but we only
    // want the initial fetch here (retry() re-runs on demand).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { phase, summary, retry: () => void load() };
}

interface ScopeState {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  refreshing: boolean;
  loadingMore: boolean;
  rows: ValidLeaderboardRow[];
  total: number;
  nextAfter: number | null;
  hasMore: boolean;
  countryCode: string | null;
  locked: boolean;
  error: string | null;
}

const emptyScope: ScopeState = {
  phase: 'idle', refreshing: false, loadingMore: false, rows: [], total: 0,
  nextAfter: null, hasMore: false, countryCode: null, locked: false, error: null,
};

export interface DailyLeaderboardView {
  scope: LeaderboardScope;
  setScope: (s: LeaderboardScope) => void;
  current: ScopeState;
  myRank: ValidMyDailyRank | null;
  rankedDate: string | null;
  refresh: () => void;
  loadMore: () => void;
}

export function useDailyLeaderboard(enabled: boolean): DailyLeaderboardView {
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [data, setData] = useState<Record<LeaderboardScope, ScopeState>>({ global: emptyScope, country: emptyScope });
  const [myRank, setMyRank] = useState<ValidMyDailyRank | null>(() => cachedMyRank());
  const [rankedDate, setRankedDate] = useState<string | null>(null);
  const loadingScopes = useRef<Set<string>>(new Set());

  const patch = useCallback((s: LeaderboardScope, p: Partial<ScopeState>) => {
    setData((d) => ({ ...d, [s]: { ...d[s], ...p } }));
  }, []);

  const loadFirst = useCallback(async (s: LeaderboardScope, refreshing = false) => {
    if (loadingScopes.current.has(s)) return;
    loadingScopes.current.add(s);
    patch(s, refreshing ? { refreshing: true, error: null } : { phase: 'loading', error: null });
    try {
      const page = await fetchLeaderboardPage(s, 0, PAGE_SIZE);
      if (page.rankedDate) setRankedDate(page.rankedDate);
      patch(s, {
        phase: 'ready', refreshing: false, rows: page.rows, total: page.total,
        nextAfter: page.nextAfter, hasMore: page.hasMore, countryCode: page.countryCode, locked: page.locked,
      });
    } catch (e) {
      patch(s, { phase: 'error', refreshing: false, error: leaderboardErrorCode(e) });
    } finally {
      loadingScopes.current.delete(s);
    }
  }, [patch]);

  const loadMore = useCallback(() => {
    const s = scope;
    setData((d) => {
      const st = d[s];
      if (st.loadingMore || st.nextAfter == null || loadingScopes.current.has(`more:${s}`)) return d;
      loadingScopes.current.add(`more:${s}`);
      const after = st.nextAfter;
      void (async () => {
        try {
          const page = await fetchLeaderboardPage(s, after, PAGE_SIZE);
          setData((d2) => {
            const cur = d2[s];
            const seen = new Set(cur.rows.map((r) => r.position));
            const fresh = page.rows.filter((r) => !seen.has(r.position));
            return { ...d2, [s]: { ...cur, loadingMore: false, rows: [...cur.rows, ...fresh], nextAfter: page.nextAfter, hasMore: page.hasMore, total: page.total } };
          });
        } catch {
          setData((d2) => ({ ...d2, [s]: { ...d2[s], loadingMore: false } }));
        } finally {
          loadingScopes.current.delete(`more:${s}`);
        }
      })();
      return { ...d, [s]: { ...st, loadingMore: true } };
    });
  }, [scope]);

  const refresh = useCallback(() => {
    void fetchMyRank().then(setMyRank).catch(() => undefined);
    void loadFirst(scope, true);
  }, [loadFirst, scope]);

  // Lazily load a scope the first time it becomes visible; fetch my-rank once.
  useEffect(() => {
    if (!enabled) return;
    if (data[scope].phase === 'idle') void loadFirst(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scope]);

  useEffect(() => {
    if (!enabled) return;
    void fetchMyRank().then(setMyRank).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { scope, setScope, current: data[scope], myRank, rankedDate, refresh, loadMore };
}
