/**
 * The session orchestrator — one hook driving BOTH modes through the
 * GameplayService and the pure session state machine.
 *
 * The screens read `phase`, `puzzle`, `outcome`, `status`, `score`, and `error`
 * and call the actions; they never touch the network, the machine, or the mode.
 * The machine rejects illegal transitions (duplicate Start/Submit, skipping), and
 * an in-flight guard collapses duplicate taps into a single request.
 *
 * Local mode runs the same flow with an in-memory service, so its UX is instant
 * and unchanged; cloud mode performs the server-authoritative calls.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { CloudFlowError, errorCopy, type ErrorCopy } from '../cloud/errors';
import {
  initialSession,
  transition,
  InvalidTransition,
  type SessionEvent,
  type SessionState,
} from '../cloud/sessionMachine';
import { analytics } from '../cloud/analytics';
import { invalidateMyRank } from '../cloud/leaderboardData';
import { invalidateMyPractice, invalidateMyProgress } from '../cloud/progressData';
import { CATEGORY_ORDER, type Answer, type CategoryResult, type Puzzle } from '../types/puzzle';
import { createGameplayService } from './getGameplayService';
import type { FinalOutcome, GameplayService, StartResult, TodayStatus } from './gameplayService';

export interface SessionView {
  mode: 'local' | 'cloud';
  phase: SessionState['phase'];
  position: number;
  status: TodayStatus | null;
  puzzle: Puzzle | null;
  /** The reveal for the current slot (result + explanation), once submitted. */
  outcome: { result: CategoryResult; explanation: string } | null;
  score: FinalOutcome['score'] | null;
  results: SessionState['results'];
  /** Whether the CURRENT attempt is ranked (drives the ranked labels). */
  ranked: boolean;
  /** The completed ranked BrewScore for today, when the day's ranked brew is locked. */
  rankedLockedScore: number | null;
  error: (ErrorCopy & { code: string }) | null;
  /** True while a network/step is in flight (disables buttons, prevents double taps). */
  busy: boolean;
  actions: {
    loadHome(): void;
    /** Start today's brew (local pack, or a plain unranked cloud attempt). */
    start(): void;
    /** Start (or securely resume) today's ONE ranked brew. */
    startRanked(): void;
    /** Start (or resume) a fresh unranked Practice Brew (reserve content in cloud). */
    startPractice(): void;
    submit(answer: Answer): void;
    proceed(): void;
    restart(): void;
    retry(): void;
    home(): void;
  };
}

/** A placeholder for a slot the SERVER already scored on resume — never rendered
 *  (the Results screen uses the authoritative complete-attempt results). */
const resumedSlot = (position: number): SessionState['results'][number] => ({
  position,
  engineId: 'OBS_001',
  category: CATEGORY_ORDER[position - 1],
  verdict: 'correct',
  correct: true,
  points: 0,
  accuracyPoints: 0,
  speedPoints: 0,
  explanation: '',
  elapsedMs: 0,
});

function reducer(state: SessionState, event: SessionEvent): SessionState {
  try {
    return transition(state, event);
  } catch (e) {
    // An illegal transition means a duplicate/stale action (e.g. a double tap):
    // ignore it and keep the current state rather than crash.
    if (e instanceof InvalidTransition) return state;
    throw e;
  }
}

/**
 * @param devOverrideIndex local-only dev pack override; recreates the local
 *   service when it changes. Ignored in cloud.
 */
export function useGameplaySession(devOverrideIndex: number | null = null): SessionView {
  const service = useMemo<GameplayService>(
    () => createGameplayService({ devOverrideIndex }),
    [devOverrideIndex],
  );

  const [state, dispatch] = useReducer(reducer, initialSession);
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [outcome, setOutcome] = useState<{ result: CategoryResult; explanation: string } | null>(null);
  const [score, setScore] = useState<FinalOutcome['score'] | null>(null);
  const [ranked, setRanked] = useState(false);
  const inFlight = useRef(false);
  /** Remembers the last start intent, so a retry re-issues the same one. */
  const lastStartOpts = useRef<{ ranked?: boolean; practice?: boolean }>({});

  /** Run an async step once, guarding against overlapping/duplicate invocations. */
  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);

  const codeOf = (e: unknown): string => (e instanceof CloudFlowError ? e.code : 'network_error');

  const openAt = useCallback(
    async (position: number) => {
      try {
        const { puzzle: p } = await service.openPuzzle(position);
        setPuzzle(p);
        setOutcome(null);
        dispatch({ type: 'PUZZLE_OPENED' });
      } catch (e) {
        dispatch({ type: 'OPEN_FAILED', code: codeOf(e), retryable: !(e instanceof CloudFlowError) || e.copy.retryable });
      }
    },
    [service],
  );

  const complete = useCallback(async () => {
    try {
      const final = await service.completeSession();
      setScore(final.score);
      // A new ranked result changes today's standings AND the streak/stats: drop
      // the cached summaries so Results/Home fetch fresh values, not stale ones.
      if (final.ranked) { invalidateMyRank(); invalidateMyProgress(); }
      else invalidateMyPractice(); // a completed Practice brew changes the Practice summary
      dispatch({ type: 'COMPLETED', finalScore: final.score.total });
    } catch (e) {
      dispatch({ type: 'COMPLETE_FAILED', code: codeOf(e), retryable: !(e instanceof CloudFlowError) || e.copy.retryable });
    }
  }, [service]);

  const loadHome = useCallback(() => {
    void guard(async () => {
      dispatch({ type: 'LOAD_PACK' });
      try {
        const s = await service.getTodayStatus();
        setStatus(s);
        if (s.available) dispatch({ type: 'PACK_LOADED' });
        else dispatch({ type: 'PACK_FAILED', code: 'no_live_pack', retryable: true });
      } catch (e) {
        dispatch({ type: 'PACK_FAILED', code: codeOf(e), retryable: !(e instanceof CloudFlowError) || e.copy.retryable });
      }
    });
  }, [guard, service]);

  const beginAttempt = useCallback(async (opts?: { ranked?: boolean; practice?: boolean }) => {
    lastStartOpts.current = opts ?? {};
    dispatch({ type: 'START' });
    try {
      const res: StartResult = opts?.practice ? await service.startPractice() : await service.startSession(opts);
      // Today's ranked brew is already locked: no new attempt was started. Reflect
      // the completed state on Home rather than entering gameplay.
      if (res.alreadyCompleted) {
        setRanked(false);
        dispatch({ type: 'RESET' });
        const s = await service.getTodayStatus();
        setStatus(s);
        if (s.available) dispatch({ type: 'PACK_LOADED' });
        else dispatch({ type: 'PACK_FAILED', code: 'no_live_pack', retryable: true });
        return;
      }
      setRanked(res.ranked);
      const completed = res.completedPositions ?? [];
      const resumePosition = res.resumePosition ?? 1;
      if (completed.length > 0 && resumePosition > 1) {
        // Securely resume: the server already scored `completed`; open the next slot.
        dispatch({ type: 'RESUME', position: resumePosition, completed: completed.map(resumedSlot) });
        await openAt(resumePosition);
      } else {
        dispatch({ type: 'ATTEMPT_STARTED' });
        await openAt(1);
      }
    } catch (e) {
      dispatch({ type: 'START_FAILED', code: codeOf(e), retryable: !(e instanceof CloudFlowError) || e.copy.retryable });
    }
  }, [service, openAt]);

  const start = useCallback(() => {
    void guard(() => beginAttempt());
  }, [guard, beginAttempt]);

  const startRanked = useCallback(() => {
    analytics.track('ranked_start_requested');
    void guard(() => beginAttempt({ ranked: true }));
  }, [guard, beginAttempt]);

  const startPractice = useCallback(() => {
    analytics.track('practice_started');
    void guard(() => beginAttempt({ practice: true }));
  }, [guard, beginAttempt]);

  const submit = useCallback(
    (answer: Answer) => {
      void guard(async () => {
        dispatch({ type: 'SUBMIT' });
        try {
          const o = await service.submitAnswer(state.position, answer);
          setOutcome(o);
          dispatch({
            type: 'SUBMITTED',
            result: {
              position: state.position,
              engineId: o.result.engineId,
              category: o.result.category,
              verdict: o.result.correct ? 'correct' : o.result.points > 0 ? 'partial' : 'incorrect',
              correct: o.result.correct,
              points: o.result.points,
              accuracyPoints: o.result.accuracyPoints,
              speedPoints: o.result.speedPoints,
              explanation: o.explanation,
              elapsedMs: o.result.elapsedMs,
            },
          });
        } catch (e) {
          dispatch({ type: 'SUBMIT_FAILED', code: codeOf(e), retryable: !(e instanceof CloudFlowError) || e.copy.retryable });
        }
      });
    },
    [guard, service, state.position],
  );

  const proceed = useCallback(() => {
    void guard(async () => {
      // Peek the next phase to know whether to open the next slot or complete.
      let next: SessionState;
      try {
        next = transition(state, { type: 'CONTINUE' });
      } catch {
        return; // not in revealing — ignore stray taps
      }
      dispatch({ type: 'CONTINUE' });
      if (next.phase === 'completing') await complete();
      else await openAt(next.position);
    });
  }, [guard, state, complete, openAt]);

  const restart = useCallback(() => {
    void guard(async () => {
      // A fresh UNRANKED practice attempt on the SAME pack we just played. The
      // pack/status are already loaded, so we don't re-fetch them (no round trip,
      // no Home flash): these dispatches batch into a single render straight into
      // the new attempt, and the service reuses its cached pack.
      dispatch({ type: 'RESET' });
      setPuzzle(null);
      setOutcome(null);
      setScore(null);
      dispatch({ type: 'LOAD_PACK' });
      dispatch({ type: 'PACK_LOADED' });
      await beginAttempt({ practice: true });
    });
  }, [guard, beginAttempt]);

  const retry = useCallback(() => {
    const retryTo = state.error?.retryTo;
    void guard(async () => {
      let resumed: SessionState;
      try {
        resumed = transition(state, { type: 'RETRY' });
      } catch {
        return;
      }
      dispatch({ type: 'RETRY' });
      switch (retryTo) {
        case 'loading_pack':
          dispatch({ type: 'LOAD_PACK' });
          try {
            const s = await service.getTodayStatus();
            setStatus(s);
            if (s.available) dispatch({ type: 'PACK_LOADED' });
            else dispatch({ type: 'PACK_FAILED', code: 'no_live_pack', retryable: true });
          } catch (e) {
            dispatch({ type: 'PACK_FAILED', code: codeOf(e), retryable: true });
          }
          break;
        case 'starting_attempt':
          await beginAttempt(lastStartOpts.current);
          break;
        case 'opening_puzzle':
          await openAt(resumed.position);
          break;
        case 'completing':
          await complete();
          break;
        default:
          break; // 'playing' — the engine is live again; nothing to re-issue
      }
    });
  }, [guard, state, service, beginAttempt, openAt, complete]);

  // A new service instance (first mount, or a dev pack switch in local mode)
  // resets the session and loads that pack.
  useEffect(() => {
    dispatch({ type: 'RESET' });
    loadHome();
  }, [loadHome]);

  const home = useCallback(() => {
    void guard(async () => {
      dispatch({ type: 'RESET' });
      setPuzzle(null);
      setOutcome(null);
      setScore(null);
      dispatch({ type: 'LOAD_PACK' });
      try {
        const s = await service.getTodayStatus();
        setStatus(s);
        if (s.available) dispatch({ type: 'PACK_LOADED' });
        else dispatch({ type: 'PACK_FAILED', code: 'no_live_pack', retryable: true });
      } catch (e) {
        dispatch({ type: 'PACK_FAILED', code: codeOf(e), retryable: true });
      }
    });
  }, [guard, service]);

  const error = useMemo(
    () => (state.error ? { ...errorCopy(state.error.code), code: state.error.code } : null),
    [state.error],
  );

  const rankedLockedScore = useMemo(
    () => (status?.ranked?.state === 'completed' ? status.ranked.lockedScore : null),
    [status],
  );

  return {
    mode: service.mode,
    phase: state.phase,
    position: state.position,
    status,
    puzzle,
    outcome,
    score,
    results: state.results,
    ranked,
    rankedLockedScore,
    error,
    busy: state.phase === 'submitting' || state.phase === 'completing' || state.phase === 'starting_attempt' || state.phase === 'opening_puzzle',
    actions: { loadHome, start, startRanked, startPractice, submit, proceed, restart, retry, home },
  };
}
