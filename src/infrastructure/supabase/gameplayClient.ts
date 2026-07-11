/**
 * Cloud gameplay client — the app side of the server-authoritative path.
 *
 * It calls the five Edge Functions with the publishable key only. It holds the
 * opaque attempt/open TOKENS the server issues, and the RAW submissions it
 * sends, but never an answer key or a score it computed itself — scoring happens
 * on the server, and the result (with the explanation) comes back only after a
 * submission. This is the whole point of the phase: a client that cannot cheat
 * because it never holds the answer.
 *
 * Selected only when EXPO_PUBLIC_CONTENT_SOURCE=cloud (see src/cloud/mode.ts).
 * The default is local, so this code is inert unless explicitly enabled.
 */

import { getSupabase } from './client';

/** A render-safe puzzle from the cloud: enough to draw, never to score. */
export interface CloudPuzzle {
  position: number;
  category: string;
  engineId: string;
  puzzleId: string;
  difficulty: number;
  prompt: string;
  maxScore: number;
  [renderField: string]: unknown;
}

/** The raw submission shapes the server accepts (one per engine family). */
export type CloudSubmission =
  | { selectedId: string }
  | { selectedIds: string[] }
  | { tappedIds: string[] }
  | { classifications: { itemId: string; bucket: 0 | 1 }[] };

export interface DailyPackResult {
  packDate: string;
  difficultyLabel: string;
  puzzles: CloudPuzzle[];
}
export interface StartAttemptResult {
  attemptId: string;
  attemptToken: string;
  expiresAt: number;
  packDate: string;
}
export interface OpenPuzzleResult {
  openToken: string;
  expiresAt: number;
  puzzle: CloudPuzzle;
}
export interface SubmitAnswerResult {
  correct: boolean;
  verdict: 'correct' | 'partial' | 'incorrect';
  points: number;
  accuracyPoints: number;
  speedPoints: number;
  explanation: string;
  elapsedMs: number;
}
export interface CompleteAttemptResult {
  finalScore: number;
  isRanked: boolean;
  rankedDate?: string | null;
  results: { position: number; verdict: string; points: number }[];
}

/** The ranked-start response: a discriminated union the server derives itself. */
export type RankedStartResult =
  | {
      status: 'active';
      attemptId: string;
      attemptToken: string;
      expiresAt: number;
      packDate: string;
      completedPositions: number[];
      resumePosition: number;
    }
  | { status: 'completed'; rankedDate: string; lockedScore: number }
  | { status: 'ineligible'; reason: string; message: string };

/** The player's ranked standing for today (get_today_player_status RPC). */
export interface PlayerStatusResult {
  eligible: boolean;
  reason: string;
  today: string;
  ranked_status: 'none' | 'active' | 'completed' | 'expired';
  ranked_attempt_id: string | null;
  locked_score: number | null;
  practice_available: boolean;
  message: string;
}

/** A failed Edge Function call, carrying the server's stable error code. */
export class GameplayError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'GameplayError';
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(name, { body });
  if (error) {
    // functions.invoke surfaces the response body on the error context.
    let code = 'network_error';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? code;
    } catch {
      /* keep network_error */
    }
    throw new GameplayError(code);
  }
  return data as T;
}

/**
 * A session id groups a device's attempts before accounts exist. It is NOT
 * identity — the signed attempt token the server issues is. Callers should
 * persist one opaque id per install (≥16 chars) and pass it to every call.
 */
export const cloudGameplay = {
  getDailyPack(date?: string): Promise<DailyPackResult> {
    return invoke('get-daily-pack', { date });
  },
  startAttempt(sessionId: string, appVersion?: string): Promise<StartAttemptResult> {
    return invoke('start-attempt', { sessionId, appVersion });
  },
  /** Request today's ONE ranked attempt. `intent` is a request; the server
   *  verifies eligibility and derives is_ranked/date/country itself. */
  startRankedAttempt(sessionId: string, appVersion?: string): Promise<RankedStartResult> {
    return invoke('start-attempt', { intent: 'ranked', sessionId, appVersion });
  },
  /** Start (or resume) a fresh UNRANKED reserve-Practice brew. The server selects
   *  the five puzzles; the client never names any. */
  startPracticeAttempt(sessionId: string, appVersion?: string): Promise<unknown> {
    return invoke('start-practice-attempt', { sessionId, appVersion });
  },
  /** The caller's ranked standing for today, scoped to their JWT (auth.uid()). */
  async getTodayPlayerStatus(appVersion?: string): Promise<PlayerStatusResult> {
    // The generated types are regenerated after this function deploys; until then
    // call through a loosely-typed handle. The response is validated at runtime
    // (validateTodayPlayerStatus) before it reaches any screen.
    const rpc = getSupabase().rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc('get_today_player_status', { p_app_version: appVersion ?? null });
    if (error) throw new GameplayError('network_error');
    return data as PlayerStatusResult;
  },
  openPuzzle(attemptToken: string, sessionId: string, position: number): Promise<OpenPuzzleResult> {
    return invoke('open-puzzle', { attemptToken, sessionId, position });
  },
  submitAnswer(
    openToken: string, sessionId: string, position: number, submission: CloudSubmission,
  ): Promise<SubmitAnswerResult> {
    return invoke('submit-answer', { openToken, sessionId, position, submission });
  },
  completeAttempt(attemptToken: string, sessionId: string): Promise<CompleteAttemptResult> {
    return invoke('complete-attempt', { attemptToken, sessionId });
  },
};
