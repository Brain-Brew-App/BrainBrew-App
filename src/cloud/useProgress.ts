/**
 * Progress hooks (cloud only).
 *
 *  • useProgressSummary — the compact streak/stats summary for Home and Results.
 *    Cache-first, non-blocking (the score/Home render first; this fills in after).
 *
 *  • useProgressScreen — the Progress screen: summary + detail (categories +
 *    calendar) + paginated history, with pull-to-refresh.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cachedPracticeSummary, cachedProgressSummary, fetchPracticeSummary, fetchProgressDetail,
  fetchProgressSummary, fetchRankedHistory, progressErrorCode,
} from './progressData';
import type { ValidHistoryRow, ValidPracticeSummary, ValidProgressDetail, ValidProgressSummary } from './validate';

export type ProgressPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ProgressSummaryView {
  phase: ProgressPhase;
  summary: ValidProgressSummary | null;
  retry: () => void;
}

/** Compact streak/stats summary — non-blocking, cache-first. */
export function useProgressSummary(enabled: boolean): ProgressSummaryView {
  const [summary, setSummary] = useState<ValidProgressSummary | null>(() => cachedProgressSummary());
  const [phase, setPhase] = useState<ProgressPhase>(cachedProgressSummary() ? 'ready' : 'idle');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPhase((p) => (summary ? p : 'loading'));
    try {
      setSummary(await fetchProgressSummary());
      setPhase('ready');
    } catch {
      setPhase((p) => (summary ? p : 'error'));
    } finally {
      inFlight.current = false;
    }
  }, [enabled, summary]);

  useEffect(() => {
    if (enabled) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { phase, summary, retry: () => void load() };
}

export interface ProgressScreenView {
  phase: ProgressPhase;
  refreshing: boolean;
  summary: ValidProgressSummary | null;
  detail: ValidProgressDetail | null;
  history: ValidHistoryRow[];
  historyHasMore: boolean;
  loadingMore: boolean;
  /** Private Practice summary — loaded independently; a failure here never hides ranked Progress. */
  practice: ValidPracticeSummary | null;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
}

export function useProgressScreen(enabled: boolean): ProgressScreenView {
  const [phase, setPhase] = useState<ProgressPhase>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<ValidProgressSummary | null>(() => cachedProgressSummary());
  const [detail, setDetail] = useState<ValidProgressDetail | null>(null);
  const [history, setHistory] = useState<ValidHistoryRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [practice, setPractice] = useState<ValidPracticeSummary | null>(() => cachedPracticeSummary());
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const loadAll = useCallback(async (isRefresh: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (isRefresh) setRefreshing(true); else setPhase((p) => (p === 'ready' ? p : 'loading'));
    setError(null);
    // The Practice summary loads INDEPENDENTLY — its failure never hides ranked Progress.
    void fetchPracticeSummary().then(setPractice).catch(() => undefined);
    try {
      const [s, d, h] = await Promise.all([fetchProgressSummary(), fetchProgressDetail(35), fetchRankedHistory(null, 30)]);
      setSummary(s); setDetail(d);
      setHistory(h.rows); setNextBefore(h.nextBefore); setHistoryHasMore(h.hasMore);
      setPhase('ready');
    } catch (e) {
      if (phase !== 'ready') setPhase('error');
      setError(progressErrorCode(e));
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [phase]);

  const loadMore = useCallback(() => {
    if (loadingMore || !historyHasMore || nextBefore == null) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const h = await fetchRankedHistory(nextBefore, 30);
        setHistory((prev) => {
          const seen = new Set(prev.map((r) => r.rankedDate));
          return [...prev, ...h.rows.filter((r) => !seen.has(r.rankedDate))];
        });
        setNextBefore(h.nextBefore);
        setHistoryHasMore(h.hasMore);
      } catch { /* keep what we have */ } finally {
        setLoadingMore(false);
      }
    })();
  }, [loadingMore, historyHasMore, nextBefore]);

  useEffect(() => {
    if (enabled) void loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    phase, refreshing, summary, detail, history, historyHasMore, loadingMore, practice, error,
    refresh: () => void loadAll(true),
    loadMore,
  };
}
