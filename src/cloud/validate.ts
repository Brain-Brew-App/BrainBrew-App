/**
 * Runtime validation of every function response.
 *
 * "It came from our own server" is not a reason to trust remote JSON: a
 * misconfigured deploy, a stale function, or a future backend change could leak
 * an answer field or a malformed pack. These validators run in BOTH development
 * and production. The forbidden-field guard is recursive — an answer-revealing
 * key anywhere in a pre-submit payload rejects the whole response.
 *
 * Pure and platform-free — unit-tested, including mutation cases.
 */

import { CATEGORY_ORDER, ENGINE_IDS, type Category, type EngineId } from '../types/puzzle';

export class PayloadError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'PayloadError';
  }
}

/**
 * Keys that must NEVER appear in a payload the client holds before it submits.
 * Combines the explicit forbidden list with every engine answer-key field.
 * `explanation` is here too: it is revealed only IN the submit response.
 */
export const PRE_SUBMIT_FORBIDDEN = new Set<string>([
  'correct_answer', 'correctAnswer', 'correct_id', 'correctId', 'answer_key', 'answerKey',
  'private_answer', 'privateAnswer', 'seed', 'seed_id', 'validator_result', 'validatorResult',
  'oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm', 'correctOrder',
  'constraints', 'membership', 'targetIds', 'isTarget', 'explanation', 'answer_payload', 'answerPayload',
]);

/** In a scored result, verdict/points/explanation are expected; answer keys are still forbidden. */
export const RESULT_FORBIDDEN = new Set<string>([
  'correct_answer', 'correctAnswer', 'correct_id', 'correctId', 'answer_key', 'answerKey',
  'private_answer', 'privateAnswer', 'seed', 'seed_id', 'validator_result', 'validatorResult',
  'oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm', 'correctOrder',
  'constraints', 'membership', 'targetIds', 'answer_payload', 'answerPayload',
]);

/**
 * A leaderboard/rank payload must never carry an identity or integrity field.
 * This is the recursive guard for the public ranking surface (Phase 6C): no
 * user_id, attempt id, email, integrity state, or answer key — anywhere.
 */
export const LEADERBOARD_FORBIDDEN = new Set<string>([
  ...RESULT_FORBIDDEN,
  'user_id', 'userId', 'attempt_id', 'attemptId', 'id',
  'integrity_status', 'integrity', 'invalidation_reason', 'invalidated_at',
  'email', 'app_version', 'appVersion', 'rank_restricted_until', 'moderation_flags',
]);

/** Recursively find any forbidden key. Returns the offending key paths (empty = clean). */
export function findForbiddenKeys(value: unknown, forbidden: Set<string>, path = ''): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) {
      v.forEach((el, i) => walk(el, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (forbidden.has(k)) hits.push(p ? `${p}.${k}` : k);
        walk(val, p ? `${p}.${k}` : k);
      }
    }
  };
  walk(value, path);
  return hits;
}

/** Throw if any forbidden key is present. */
export function assertNoForbiddenFields(value: unknown, forbidden: Set<string>): void {
  const hits = findForbiddenKeys(value, forbidden);
  if (hits.length) throw new PayloadError('answer_leak', `forbidden field(s) in payload: ${hits.join(', ')}`);
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const ENGINE_SET = new Set<string>(ENGINE_IDS);

export interface ValidPublicPuzzle {
  position: number;
  category: Category;
  engineId: EngineId;
  puzzleId: string;
  difficulty: number;
  prompt: string;
  maxScore: number;
  timing: { parMs: number; limitMs: number };
  [renderField: string]: unknown;
}

export interface ValidDailyPack {
  packDate: string;
  difficultyLabel: string;
  puzzles: ValidPublicPuzzle[];
}

/** Validate one render-safe puzzle: shape, known engine, timing, no answer leak. */
export function validatePublicPuzzle(raw: unknown, expectedPosition: number): ValidPublicPuzzle {
  if (!isObj(raw)) throw new PayloadError('bad_puzzle', 'puzzle is not an object');
  assertNoForbiddenFields(raw, PRE_SUBMIT_FORBIDDEN);

  if (raw.position !== expectedPosition) throw new PayloadError('bad_position', `expected position ${expectedPosition}`);
  const category = raw.category;
  if (category !== CATEGORY_ORDER[expectedPosition - 1]) throw new PayloadError('bad_category_order');
  if (!isStr(raw.engineId) || !ENGINE_SET.has(raw.engineId)) throw new PayloadError('unknown_engine');
  if (!isStr(raw.puzzleId)) throw new PayloadError('bad_puzzle_id');
  if (!isStr(raw.prompt)) throw new PayloadError('bad_prompt');
  if (!isNum(raw.maxScore) || raw.maxScore <= 0) throw new PayloadError('bad_max_score');
  const timing = raw.timing;
  if (!isObj(timing) || !isNum(timing.parMs) || !isNum(timing.limitMs)) throw new PayloadError('bad_timing');

  return raw as unknown as ValidPublicPuzzle;
}

/** Validate the public daily pack: exactly five slots, positions 1..5, correct category order. */
export function validateDailyPack(raw: unknown): ValidDailyPack {
  if (!isObj(raw)) throw new PayloadError('bad_pack', 'pack is not an object');
  if (!isStr(raw.packDate)) throw new PayloadError('bad_pack_date');
  if (!isStr(raw.difficultyLabel)) throw new PayloadError('bad_difficulty_label');
  if (!Array.isArray(raw.puzzles) || raw.puzzles.length !== 5) throw new PayloadError('bad_slot_count', 'expected exactly 5 slots');
  const puzzles = raw.puzzles.map((p, i) => validatePublicPuzzle(p, i + 1));
  return { packDate: raw.packDate, difficultyLabel: raw.difficultyLabel, puzzles };
}

export function validateStartAttempt(raw: unknown): { attemptId: string; attemptToken: string; expiresAt: number; packDate: string } {
  if (!isObj(raw)) throw new PayloadError('bad_start');
  assertNoForbiddenFields(raw, PRE_SUBMIT_FORBIDDEN);
  if (!isStr(raw.attemptId) || !isStr(raw.attemptToken) || !isNum(raw.expiresAt) || !isStr(raw.packDate)) {
    throw new PayloadError('bad_start', 'missing attempt fields');
  }
  return { attemptId: raw.attemptId, attemptToken: raw.attemptToken, expiresAt: raw.expiresAt, packDate: raw.packDate };
}

export function validateOpenPuzzle(raw: unknown, expectedPosition: number): { openToken: string; expiresAt: number; puzzle: ValidPublicPuzzle } {
  if (!isObj(raw)) throw new PayloadError('bad_open');
  assertNoForbiddenFields(raw, PRE_SUBMIT_FORBIDDEN);
  if (!isStr(raw.openToken) || !isNum(raw.expiresAt)) throw new PayloadError('bad_open', 'missing open token');
  const puzzle = validatePublicPuzzle(raw.puzzle, expectedPosition);
  return { openToken: raw.openToken, expiresAt: raw.expiresAt, puzzle };
}

export interface ValidSubmitResult {
  correct: boolean;
  verdict: 'correct' | 'partial' | 'incorrect';
  points: number;
  accuracyPoints: number;
  speedPoints: number;
  explanation: string;
  elapsedMs: number;
}

export function validateSubmitAnswer(raw: unknown): ValidSubmitResult {
  if (!isObj(raw)) throw new PayloadError('bad_submit');
  assertNoForbiddenFields(raw, RESULT_FORBIDDEN);
  const verdict = raw.verdict;
  if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect') throw new PayloadError('bad_verdict');
  if (typeof raw.correct !== 'boolean') throw new PayloadError('bad_correct');
  for (const k of ['points', 'accuracyPoints', 'speedPoints', 'elapsedMs'] as const) {
    if (!isNum(raw[k])) throw new PayloadError(`bad_${k}`);
  }
  if (typeof raw.explanation !== 'string') throw new PayloadError('bad_explanation');
  return raw as unknown as ValidSubmitResult;
}

export interface ValidCompleteResult {
  finalScore: number;
  isRanked: boolean;
  rankedDate: string | null;
  results: { position: number; verdict: string; points: number }[];
}

export function validateCompleteAttempt(raw: unknown): ValidCompleteResult {
  if (!isObj(raw)) throw new PayloadError('bad_complete');
  assertNoForbiddenFields(raw, RESULT_FORBIDDEN);
  if (!isNum(raw.finalScore) || raw.finalScore < 0 || raw.finalScore > 100) throw new PayloadError('bad_final_score');
  // is_ranked is server-authoritative; the client accepts either but never sets it.
  if (typeof raw.isRanked !== 'boolean') throw new PayloadError('bad_ranked_flag');
  if (raw.isRanked && !isStr(raw.rankedDate)) throw new PayloadError('bad_ranked_date', 'a ranked result must carry its UTC date');
  if (!Array.isArray(raw.results)) throw new PayloadError('bad_results');
  const results = raw.results.map((r) => {
    if (!isObj(r) || !isNum(r.position) || !isStr(r.verdict) || !isNum(r.points)) throw new PayloadError('bad_result_row');
    return { position: r.position, verdict: r.verdict, points: r.points };
  });
  return {
    finalScore: raw.finalScore,
    isRanked: raw.isRanked,
    rankedDate: raw.isRanked ? (raw.rankedDate as string) : null,
    results,
  };
}

/** The server's ranked-start response is a discriminated union on `status`. */
export type ValidRankedStart =
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

export function validateRankedStart(raw: unknown): ValidRankedStart {
  if (!isObj(raw)) throw new PayloadError('bad_ranked_start');
  assertNoForbiddenFields(raw, PRE_SUBMIT_FORBIDDEN);
  if (raw.status === 'completed') {
    if (!isStr(raw.rankedDate) || !isNum(raw.lockedScore)) throw new PayloadError('bad_ranked_start');
    return { status: 'completed', rankedDate: raw.rankedDate, lockedScore: raw.lockedScore };
  }
  if (raw.status === 'ineligible') {
    if (!isStr(raw.reason) || !isStr(raw.message)) throw new PayloadError('bad_ranked_start');
    return { status: 'ineligible', reason: raw.reason, message: raw.message };
  }
  if (raw.status === 'active') {
    if (!isStr(raw.attemptId) || !isStr(raw.attemptToken) || !isNum(raw.expiresAt) || !isStr(raw.packDate)) {
      throw new PayloadError('bad_ranked_start', 'missing attempt fields');
    }
    const completed = Array.isArray(raw.completedPositions) ? raw.completedPositions.filter(isNum) : [];
    const resumePosition = isNum(raw.resumePosition) ? raw.resumePosition : 1;
    if (resumePosition < 1 || resumePosition > 5) throw new PayloadError('bad_resume_position');
    return {
      status: 'active',
      attemptId: raw.attemptId,
      attemptToken: raw.attemptToken,
      expiresAt: raw.expiresAt,
      packDate: raw.packDate,
      completedPositions: completed,
      resumePosition,
    };
  }
  throw new PayloadError('bad_ranked_start', 'unknown status');
}

export interface ValidPracticeStart {
  attemptToken: string;
  resumed: boolean;
  resumePosition: number;
  completedPositions: number[];
  puzzles: ValidPublicPuzzle[];
}

/** Validate start-practice-attempt — five sanitized reserve puzzles, never ranked. */
export function validatePracticeStart(raw: unknown): ValidPracticeStart {
  if (!isObj(raw)) throw new PayloadError('bad_practice_start');
  assertNoForbiddenFields(raw, PRE_SUBMIT_FORBIDDEN);
  if (raw.status !== 'active') throw new PayloadError('bad_practice_start', 'status');
  if (raw.ranked === true) throw new PayloadError('practice_not_unranked', 'a practice brew must be unranked');
  if (!isStr(raw.attemptToken)) throw new PayloadError('bad_practice_start', 'token');
  if (!Array.isArray(raw.puzzles) || raw.puzzles.length !== 5) throw new PayloadError('bad_practice_start', 'expected 5 puzzles');
  const puzzles = raw.puzzles.map((p, i) => validatePublicPuzzle(p, i + 1)); // enforces fixed category order + no answer leak
  if (new Set(puzzles.map((p) => p.puzzleId)).size !== 5) throw new PayloadError('bad_practice_start', 'duplicate puzzle');
  const completed = Array.isArray(raw.completedPositions) ? raw.completedPositions.filter(isNum) : [];
  const resumePosition = isNum(raw.resumePosition) ? raw.resumePosition : 1;
  if (resumePosition < 1 || resumePosition > 5) throw new PayloadError('bad_practice_start', 'resume position');
  return { attemptToken: raw.attemptToken, resumed: raw.resumed === true, resumePosition, completedPositions: completed, puzzles };
}

export interface ValidPlayerStatus {
  eligible: boolean;
  reason: string;
  today: string;
  rankedState: 'none' | 'active' | 'completed' | 'expired';
  lockedScore: number | null;
  practiceAvailable: boolean;
  message: string;
}

/** Validate get_today_player_status (RPC) — a non-sensitive, rank-free shape. */
export function validateTodayPlayerStatus(raw: unknown): ValidPlayerStatus {
  if (!isObj(raw)) throw new PayloadError('bad_player_status');
  assertNoForbiddenFields(raw, RESULT_FORBIDDEN);
  if (typeof raw.eligible !== 'boolean') throw new PayloadError('bad_player_status');
  if (!isStr(raw.reason) || !isStr(raw.today)) throw new PayloadError('bad_player_status');
  const state = raw.ranked_status;
  if (state !== 'none' && state !== 'active' && state !== 'completed' && state !== 'expired') {
    throw new PayloadError('bad_player_status', 'unknown ranked_status');
  }
  const locked = raw.locked_score;
  return {
    eligible: raw.eligible,
    reason: raw.reason,
    today: raw.today,
    rankedState: state,
    lockedScore: isNum(locked) ? locked : null,
    practiceAvailable: raw.practice_available !== false,
    message: isStr(raw.message) ? raw.message : '',
  };
}

// ---------------------------------------------------------------------------
// Daily leaderboards (Phase 6C) — sanitized, recursively private-field-guarded.
// ---------------------------------------------------------------------------

const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

export interface ValidMyDailyRank {
  locked: boolean;
  hasResult: boolean;
  rankedDate: string | null;
  score: number | null;
  scoreLocked: boolean;
  totalSolveMs: number | null;
  resultVersion: number | null;
  updatedAfterValidation: boolean;
  countryCode: string | null;
  globalPosition: number | null;
  globalTotal: number | null;
  globalPercentile: number | null;
  countryPosition: number | null;
  countryTotal: number | null;
  countryPercentile: number | null;
}

/** Validate get_my_daily_rank — the personal summary shown on Results/Home. */
export function validateMyDailyRank(raw: unknown): ValidMyDailyRank {
  if (!isObj(raw)) throw new PayloadError('bad_my_rank');
  assertNoForbiddenFields(raw, LEADERBOARD_FORBIDDEN);
  const base: ValidMyDailyRank = {
    locked: raw.locked === true,
    hasResult: raw.has_result === true,
    rankedDate: isStr(raw.ranked_date) ? raw.ranked_date : null,
    score: numOrNull(raw.score),
    scoreLocked: raw.score_locked === true,
    totalSolveMs: numOrNull(raw.total_solve_ms),
    resultVersion: numOrNull(raw.result_version),
    updatedAfterValidation: raw.updated_after_validation === true,
    countryCode: isStr(raw.country_code) ? raw.country_code : null,
    globalPosition: numOrNull(raw.global_position),
    globalTotal: numOrNull(raw.global_total),
    globalPercentile: numOrNull(raw.global_percentile),
    countryPosition: numOrNull(raw.country_position),
    countryTotal: numOrNull(raw.country_total),
    countryPercentile: numOrNull(raw.country_percentile),
  };
  if (base.locked) return base;
  // A present result must carry a coherent position/total (defensive).
  if (base.hasResult && (base.globalPosition === null || base.globalTotal === null || base.score === null)) {
    throw new PayloadError('bad_my_rank', 'result missing position/score');
  }
  return base;
}

export interface ValidLeaderboardRow {
  position: number;
  username: string;
  countryCode: string;
  score: number;
  solveMs: number;
  isCurrentUser: boolean;
}

export interface ValidLeaderboardPage {
  locked: boolean;
  scope: 'global' | 'country';
  rankedDate: string | null;
  total: number;
  pageSize: number;
  afterPosition: number;
  nextAfter: number | null;
  hasMore: boolean;
  countryCode: string | null;
  rows: ValidLeaderboardRow[];
}

function validateLeaderboardRow(raw: unknown): ValidLeaderboardRow {
  if (!isObj(raw)) throw new PayloadError('bad_leaderboard_row');
  if (!isNum(raw.position) || raw.position < 1) throw new PayloadError('bad_leaderboard_row', 'position');
  if (!isStr(raw.username)) throw new PayloadError('bad_leaderboard_row', 'username');
  if (!isStr(raw.country_code)) throw new PayloadError('bad_leaderboard_row', 'country');
  if (!isNum(raw.score)) throw new PayloadError('bad_leaderboard_row', 'score');
  if (!isNum(raw.solve_ms)) throw new PayloadError('bad_leaderboard_row', 'solve_ms');
  return {
    position: raw.position,
    username: raw.username,
    countryCode: raw.country_code,
    score: raw.score,
    solveMs: raw.solve_ms,
    isCurrentUser: raw.is_current_user === true,
  };
}

/** Validate get_daily_leaderboard — a page of sanitized rows. */
export function validateLeaderboardPage(raw: unknown): ValidLeaderboardPage {
  if (!isObj(raw)) throw new PayloadError('bad_leaderboard');
  assertNoForbiddenFields(raw, LEADERBOARD_FORBIDDEN);
  const scope = raw.scope === 'country' ? 'country' : 'global';
  const locked = raw.locked === true;
  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rows = locked ? [] : rawRows.map(validateLeaderboardRow);
  return {
    locked,
    scope,
    rankedDate: isStr(raw.ranked_date) ? raw.ranked_date : null,
    total: isNum(raw.total) ? raw.total : 0,
    pageSize: isNum(raw.page_size) ? raw.page_size : rows.length,
    afterPosition: isNum(raw.after_position) ? raw.after_position : 0,
    nextAfter: numOrNull(raw.next_after),
    hasMore: raw.has_more === true,
    countryCode: isStr(raw.country_code) ? raw.country_code : null,
    rows,
  };
}

/** Format an active-solve-time (ms) for display, e.g. 222000 → "3m 42s". */
export function formatSolveTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/**
 * The single display definition of the "Top N%" bracket, shared by Results and
 * the Leaderboard so they never disagree. Mirrors the server percentile
 * (ceil(100·position/total), clamped 1..100); null when the player is the only
 * ranked one. Prefer the server value; fall back to computing it identically.
 */
export function topPercent(
  position: number | null, total: number | null, serverPercentile: number | null,
): number | null {
  if (serverPercentile != null) return serverPercentile;
  if (position == null || total == null || total <= 1) return null;
  return Math.min(100, Math.max(1, Math.ceil((100 * position) / total)));
}

// ---------------------------------------------------------------------------
// Player progress: streaks, statistics, history, calendar (Phase 6D).
// ---------------------------------------------------------------------------

/** Any progress payload must never carry identity, integrity, answer, or token fields. */
export const PROGRESS_FORBIDDEN = new Set<string>([
  ...LEADERBOARD_FORBIDDEN,
  'submitted_answer', 'submittedAnswer', 'integrity_reason', 'integrityReason',
  'token', 'provider', 'correct_answer',
]);

/** Milestone thresholds — a milestone is DERIVED from the streak value, not awarded. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

/** The milestone the streak has EXACTLY reached (for the subtle gold accent), or null. */
export function streakMilestone(currentStreak: number): number | null {
  return STREAK_MILESTONES.includes(currentStreak as (typeof STREAK_MILESTONES)[number]) ? currentStreak : null;
}

export interface ValidProgressSummary {
  locked: boolean;
  statisticsVersion: number;
  today: string | null;
  todayCompleted: boolean;
  currentStreak: number;
  bestStreak: number;
  lastRankedDate: string | null;
  firstRankedDate: string | null;
  rankedDaysCompleted: number;
  latestScore: number | null;
  bestScore: number | null;
  averageScore: number | null;
  averageSolveMs: number | null;
  perfectScores: number;
  lifetimeScoreSum: number;
  totalSolveMs: number;
}

export function validateProgressSummary(raw: unknown): ValidProgressSummary {
  if (!isObj(raw)) throw new PayloadError('bad_progress_summary');
  assertNoForbiddenFields(raw, PROGRESS_FORBIDDEN);
  const num0 = (v: unknown): number => (isNum(v) ? v : 0);
  return {
    locked: raw.locked === true,
    statisticsVersion: num0(raw.statistics_version),
    today: isStr(raw.today) ? raw.today : null,
    todayCompleted: raw.today_completed === true,
    currentStreak: num0(raw.current_streak),
    bestStreak: num0(raw.best_streak),
    lastRankedDate: isStr(raw.last_ranked_date) ? raw.last_ranked_date : null,
    firstRankedDate: isStr(raw.first_ranked_date) ? raw.first_ranked_date : null,
    rankedDaysCompleted: num0(raw.ranked_days_completed),
    latestScore: numOrNull(raw.latest_score),
    bestScore: numOrNull(raw.best_score),
    averageScore: numOrNull(raw.average_score),
    averageSolveMs: numOrNull(raw.average_solve_ms),
    perfectScores: num0(raw.perfect_scores),
    lifetimeScoreSum: num0(raw.lifetime_score_sum),
    totalSolveMs: num0(raw.total_solve_ms),
  };
}

export interface ValidCategoryStat {
  category: string;
  averagePoints: number;
  bestPoints: number;
  plays: number;
  perfect: number;
}

export interface ValidCalendarDay { date: string; updatedAfterValidation: boolean }

export interface ValidProgressDetail {
  locked: boolean;
  categories: ValidCategoryStat[];
  calendar: {
    today: string | null;
    fromDate: string | null;
    firstRankedDate: string | null;
    completed: ValidCalendarDay[];
  };
}

const CATEGORY_SET = new Set(['observation', 'pattern', 'logic', 'language-logic', 'attention-speed']);

export function validateProgressDetail(raw: unknown): ValidProgressDetail {
  if (!isObj(raw)) throw new PayloadError('bad_progress_detail');
  assertNoForbiddenFields(raw, PROGRESS_FORBIDDEN);
  if (raw.locked === true) return { locked: true, categories: [], calendar: { today: null, fromDate: null, firstRankedDate: null, completed: [] } };
  const rawCats = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = rawCats.map((c): ValidCategoryStat => {
    if (!isObj(c) || !isStr(c.category) || !CATEGORY_SET.has(c.category)) throw new PayloadError('bad_category_stat');
    return {
      category: c.category,
      averagePoints: isNum(c.average_points) ? c.average_points : 0,
      bestPoints: isNum(c.best_points) ? c.best_points : 0,
      plays: isNum(c.plays) ? c.plays : 0,
      perfect: isNum(c.perfect) ? c.perfect : 0,
    };
  });
  const cal = isObj(raw.calendar) ? raw.calendar : {};
  const rawDays = Array.isArray(cal.completed) ? cal.completed : [];
  const completed = rawDays.map((d): ValidCalendarDay => {
    if (!isObj(d) || !isStr(d.date)) throw new PayloadError('bad_calendar_day');
    return { date: d.date, updatedAfterValidation: d.updated_after_validation === true };
  });
  return {
    locked: false,
    categories,
    calendar: {
      today: isStr(cal.today) ? cal.today : null,
      fromDate: isStr(cal.from_date) ? cal.from_date : null,
      firstRankedDate: isStr(cal.first_ranked_date) ? cal.first_ranked_date : null,
      completed,
    },
  };
}

export interface ValidHistoryRow {
  rankedDate: string;
  score: number;
  totalSolveMs: number;
  countryCode: string | null;
  completedAt: string | null;
  updatedAfterValidation: boolean;
  resultVersion: number;
  status: string;
}

export interface ValidHistoryPage {
  locked: boolean;
  rows: ValidHistoryRow[];
  pageSize: number;
  nextBefore: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Practice summary & history (Phase 7C) — private, separate from ranked stats.
// ---------------------------------------------------------------------------

export const PRACTICE_FORBIDDEN = new Set<string>([
  ...PROGRESS_FORBIDDEN, 'seed', 'prompt', 'private_payload', 'privatePayload',
]);

export interface ValidPracticeCategory { category: string; averagePoints: number; bestPoints: number; plays: number }

export interface ValidPracticeSummary {
  locked: boolean;
  statisticsVersion: number;
  brewsCompleted: number;
  totalPuzzles: number;
  averageScore: number | null;
  bestScore: number | null;
  latestScore: number | null;
  averageSolveMs: number | null;
  categories: ValidPracticeCategory[];
  mostPracticedCategory: string | null;
}

export function validatePracticeSummary(raw: unknown): ValidPracticeSummary {
  if (!isObj(raw)) throw new PayloadError('bad_practice_summary');
  assertNoForbiddenFields(raw, PRACTICE_FORBIDDEN);
  if (raw.locked === true) {
    return { locked: true, statisticsVersion: 0, brewsCompleted: 0, totalPuzzles: 0, averageScore: null, bestScore: null, latestScore: null, averageSolveMs: null, categories: [], mostPracticedCategory: null };
  }
  const rawCats = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = rawCats.map((c): ValidPracticeCategory => {
    if (!isObj(c) || !isStr(c.category) || !CATEGORY_SET.has(c.category)) throw new PayloadError('bad_practice_category');
    return {
      category: c.category,
      averagePoints: isNum(c.average_points) ? c.average_points : 0,
      bestPoints: isNum(c.best_points) ? c.best_points : 0,
      plays: isNum(c.plays) ? c.plays : 0,
    };
  });
  const num0 = (v: unknown) => (isNum(v) ? v : 0);
  return {
    locked: false,
    statisticsVersion: num0(raw.statistics_version),
    brewsCompleted: num0(raw.practice_brews_completed),
    totalPuzzles: num0(raw.total_practice_puzzles),
    averageScore: numOrNull(raw.average_score),
    bestScore: numOrNull(raw.best_score),
    latestScore: numOrNull(raw.latest_score),
    averageSolveMs: numOrNull(raw.average_solve_ms),
    categories,
    mostPracticedCategory: isStr(raw.most_practiced_category) ? raw.most_practiced_category : null,
  };
}

export interface ValidPracticeHistoryRow {
  completedAt: string | null;
  score: number;
  totalSolveMs: number;
  selectionVersion: number | null;
  categories: { category: string; points: number }[];
}

export interface ValidPracticeHistoryPage {
  locked: boolean;
  rows: ValidPracticeHistoryRow[];
  pageSize: number;
  nextBefore: string | null;
  hasMore: boolean;
}

export function validatePracticeHistoryPage(raw: unknown): ValidPracticeHistoryPage {
  if (!isObj(raw)) throw new PayloadError('bad_practice_history');
  assertNoForbiddenFields(raw, PRACTICE_FORBIDDEN);
  const locked = raw.locked === true;
  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rows = locked ? [] : rawRows.map((r): ValidPracticeHistoryRow => {
    if (!isObj(r) || !isNum(r.score)) throw new PayloadError('bad_practice_history_row');
    const rawCats = Array.isArray(r.categories) ? r.categories : [];
    return {
      completedAt: isStr(r.completed_at) ? r.completed_at : null,
      score: r.score,
      totalSolveMs: isNum(r.total_solve_ms) ? r.total_solve_ms : 0,
      selectionVersion: numOrNull(r.selection_version),
      categories: rawCats.filter(isObj).map((c) => ({ category: isStr((c as Record<string, unknown>).category) ? (c as Record<string, string>).category : '', points: isNum((c as Record<string, unknown>).points) ? (c as Record<string, number>).points : 0 })),
    };
  });
  return {
    locked,
    rows,
    pageSize: isNum(raw.page_size) ? raw.page_size : rows.length,
    nextBefore: isStr(raw.next_before) ? raw.next_before : null,
    hasMore: raw.has_more === true,
  };
}

// ---------------------------------------------------------------------------
// Entitlements (Phase 7D) — the ONE server-authoritative capability contract.
//
// This is a READ contract only: no purchases, prices, receipts, or provider
// data. The validator is deliberately paranoid about two things:
//   1. It NEVER lets a payment/identity/answer field through (recursive guard).
//   2. The ranked-attempt limit is FORCED to the constant 1 — it is never read
//      from the payload, so no server value or capability can ever grant an extra
//      ranked attempt on the client. Ranked fairness is a client + server double
//      lock, not a trusted number on the wire.
// ---------------------------------------------------------------------------

/**
 * The fixed, known set of product capabilities. Unknown keys in a payload are
 * ignored (forward-compatible); a missing known key is treated as `false`
 * (fail-closed — a Premium capability is off unless the server explicitly says
 * it is on). Adding a capability here is the ONLY way the client gains one.
 */
export const ENTITLEMENT_CAPABILITIES = [
  // Free forever
  'daily_ranked_brew', 'global_leaderboard', 'country_leaderboard', 'ranked_streaks',
  'basic_progress', 'share_cards', 'practice_access',
  // Free during beta (a future free tier may cap this; Premium keeps it)
  'unlimited_practice',
  // Future Premium (never a ranked advantage)
  'archives', 'category_training', 'difficulty_selection', 'advanced_practice_stats',
  'advanced_ranked_stats', 'bonus_packs', 'premium_themes', 'private_tournaments',
] as const;

export type EntitlementCapability = (typeof ENTITLEMENT_CAPABILITIES)[number];

export type EntitlementState = 'beta' | 'free' | 'premium' | 'grace_period' | 'billing_issue' | 'expired' | 'revoked';
const ENTITLEMENT_STATES = new Set<string>(['beta', 'free', 'premium', 'grace_period', 'billing_issue', 'expired', 'revoked']);

/**
 * An entitlement payload must NEVER carry payment, provider, identity, token, or
 * answer fields. This is the read contract's privacy guard: the client learns
 * *what it can do*, never *who is paying or how*. Enforced recursively.
 */
export const ENTITLEMENT_FORBIDDEN = new Set<string>([
  'user_id', 'userId', 'email',
  'receipt', 'receipt_data', 'receiptData',
  'transaction', 'transaction_id', 'transactionId',
  'purchase_token', 'purchaseToken', 'order_id', 'orderId',
  'customer_id', 'customerId', 'provider_customer_id', 'providerCustomerId',
  'service_role', 'serviceRole',
  'payment_method', 'paymentMethod', 'card', 'card_number', 'cardNumber',
  'auth_token', 'authToken', 'attempt_token', 'attemptToken', 'token',
  'correct_answer', 'correctAnswer', 'submitted_answer', 'submittedAnswer',
  'private_payload', 'privatePayload',
  // Phase 7E — provider identifiers must never reach the client via the RPC.
  'revenuecat_app_user_id', 'app_user_id', 'appUserId',
  'revenuecat_product_id', 'revenuecat_store', 'revenuecat_entitlement_id',
  'latest_event_id', 'billing_issue_detected_at', 'revoked_at',
]);

export type EntitlementPolicyMode = 'beta_open' | 'sandbox_paywall' | 'production_paywall';

/** Safe, non-identifying subscription facts for lifecycle UI (no provider ids). */
export interface ValidSubscriptionFacts {
  isActive: boolean;
  willRenew: boolean;
  periodType: string | null;
  currentPeriodEnd: string | null;
  inGracePeriod: boolean;
  billingIssue: boolean;
}

export interface ValidEntitlements {
  /** True when the caller is unauthenticated — every capability is off (fail-closed). */
  locked: boolean;
  entitlementState: EntitlementState;
  entitlementVersion: number;
  capabilities: Record<EntitlementCapability, boolean>;
  /**
   * ALWAYS 1. Not read from the payload — a hard client-side constant so a
   * compromised or misconfigured server can never tell the app a player has more
   * than one ranked attempt per UTC day. (The server enforces the real limit too.)
   */
  rankedAttemptsPerUtcDay: 1;
  /** Free practice brews per period; null = unlimited (the beta policy). */
  freePracticeBrewsPerPeriod: number | null;
  /** The server release-policy mode, when provided (7E). */
  policyMode: EntitlementPolicyMode | null;
  /** Safe subscription facts when the player has a synchronized subscription (7E). */
  subscription: ValidSubscriptionFacts | null;
  /** Provenance of the decision (e.g. 'beta_policy', 'subscription', 'local_dev'). */
  source: string;
}

function allCapabilities(on: boolean): Record<EntitlementCapability, boolean> {
  const caps = {} as Record<EntitlementCapability, boolean>;
  for (const k of ENTITLEMENT_CAPABILITIES) caps[k] = on;
  return caps;
}

/**
 * Validate get_my_entitlements — the authoritative capability read. Rejects any
 * payment/identity/answer field, normalises capabilities to the known set
 * (unknown ignored, missing = false), and FORCES the ranked limit to 1.
 */
export function validateEntitlements(raw: unknown): ValidEntitlements {
  if (!isObj(raw)) throw new PayloadError('bad_entitlements', 'entitlements is not an object');
  assertNoForbiddenFields(raw, ENTITLEMENT_FORBIDDEN);

  const POLICY_MODES = new Set(['beta_open', 'sandbox_paywall', 'production_paywall']);
  const policyMode = isStr(raw.policy_mode) && POLICY_MODES.has(raw.policy_mode)
    ? (raw.policy_mode as EntitlementPolicyMode) : null;

  const locked = raw.locked === true;
  if (locked) {
    // Unauthenticated / no identity → fail closed. Nothing is unlocked.
    return {
      locked: true,
      entitlementState: 'free',
      entitlementVersion: isNum(raw.entitlement_version) ? raw.entitlement_version : 1,
      capabilities: allCapabilities(false),
      rankedAttemptsPerUtcDay: 1,
      freePracticeBrewsPerPeriod: 0,
      policyMode,
      subscription: null,
      source: isStr(raw.source) ? raw.source : 'locked',
    };
  }

  // Safe subscription facts (never provider ids — those are rejected above).
  let subscription: ValidSubscriptionFacts | null = null;
  if (isObj(raw.subscription)) {
    const s = raw.subscription;
    subscription = {
      isActive: s.is_active === true,
      willRenew: s.will_renew === true,
      periodType: isStr(s.period_type) ? s.period_type : null,
      currentPeriodEnd: isStr(s.current_period_end) ? s.current_period_end : null,
      inGracePeriod: s.in_grace_period === true,
      billingIssue: s.billing_issue === true,
    };
  }

  const state = isStr(raw.entitlement_state) && ENTITLEMENT_STATES.has(raw.entitlement_state)
    ? (raw.entitlement_state as EntitlementState)
    : 'free'; // an unknown state is treated as the most restrictive real tier
  const rawCaps = isObj(raw.capabilities) ? raw.capabilities : {};
  const capabilities = {} as Record<EntitlementCapability, boolean>;
  for (const k of ENTITLEMENT_CAPABILITIES) capabilities[k] = rawCaps[k] === true;

  const rawLimits = isObj(raw.limits) ? raw.limits : {};

  return {
    locked: false,
    entitlementState: state,
    entitlementVersion: isNum(raw.entitlement_version) ? raw.entitlement_version : 1,
    capabilities,
    // Fairness invariant — CONSTANT, never derived from the wire.
    rankedAttemptsPerUtcDay: 1,
    freePracticeBrewsPerPeriod: numOrNull(rawLimits.free_practice_brews_per_period),
    policyMode,
    subscription,
    source: isStr(raw.source) ? raw.source : 'unknown',
  };
}

export function validateHistoryPage(raw: unknown): ValidHistoryPage {
  if (!isObj(raw)) throw new PayloadError('bad_history');
  assertNoForbiddenFields(raw, PROGRESS_FORBIDDEN);
  const locked = raw.locked === true;
  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rows = locked ? [] : rawRows.map((r): ValidHistoryRow => {
    if (!isObj(r) || !isStr(r.ranked_date) || !isNum(r.score)) throw new PayloadError('bad_history_row');
    return {
      rankedDate: r.ranked_date,
      score: r.score,
      totalSolveMs: isNum(r.total_solve_ms) ? r.total_solve_ms : 0,
      countryCode: isStr(r.country_code) ? r.country_code : null,
      completedAt: isStr(r.completed_at) ? r.completed_at : null,
      updatedAfterValidation: r.updated_after_validation === true,
      resultVersion: isNum(r.result_version) ? r.result_version : 0,
      status: isStr(r.status) ? r.status : 'counted',
    };
  });
  return {
    locked,
    rows,
    pageSize: isNum(raw.page_size) ? raw.page_size : rows.length,
    nextBefore: isStr(raw.next_before) ? raw.next_before : null,
    hasMore: raw.has_more === true,
  };
}

/**
 * The `start-archive-attempt` response (Phase 7J). An Archive brew is UNRANKED by
 * construction — the server never marks it ranked and never returns a score here.
 */
export function validateArchiveStartResult(raw: unknown): {
  attemptId: string; attemptToken: string; expiresAt: number;
  rankedDate: string; resumed: boolean; puzzleCount: number;
} {
  if (!raw || typeof raw !== 'object') throw new PayloadError('bad_shape', 'archive start is not an object');
  const r = raw as Record<string, unknown>;
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!isStr(r.attemptId) || !isStr(r.attemptToken) || !isNum(r.expiresAt)) {
    throw new PayloadError('bad_shape', 'archive start missing attempt/token');
  }
  if (r.isRanked === true || r.is_ranked === true) throw new PayloadError('bad_shape', 'archive start claims ranked');
  if ('finalScore' in r || 'final_score' in r) throw new PayloadError('bad_shape', 'archive start carries a score');
  const count = isNum(r.puzzleCount) ? r.puzzleCount : 0;
  if (count < 1 || count > 5) throw new PayloadError('bad_slot_count', 'archive pack has no playable slots');
  return {
    attemptId: r.attemptId, attemptToken: r.attemptToken, expiresAt: r.expiresAt,
    rankedDate: isStr(r.rankedDate) ? r.rankedDate : '', resumed: r.resumed === true, puzzleCount: count,
  };
}
