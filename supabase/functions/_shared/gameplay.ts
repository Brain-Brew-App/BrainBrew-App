/**
 * Server-authoritative gameplay flow — the logic behind the five Edge Functions,
 * written against a small `Db` port instead of a concrete client so the exact
 * same code runs in production (Supabase service-role client) and under the
 * simulation test (PGlite). Nothing here trusts client-reported timing, and
 * nothing returns an answer key before an answer is submitted.
 *
 * The five operations map 1:1 to the Edge Functions:
 *   getDailyPack   → the sanitized public pack (no attempt required)
 *   startAttempt   → create an attempt, issue an attempt token
 *   openPuzzle     → start the server timer for one slot, issue an open token
 *   submitAnswer   → score against the private key, reveal result + explanation
 *   completeAttempt→ finalize the BrewScore (still UNRANKED this phase)
 */

import { AppError } from './http.ts';
import { toPublicPuzzle, validateSubmission, type PublicPuzzle, type PublicSlotRow } from './publicShape.ts';
import { scoreSubmission, type AnswerKey } from './scoring.ts';
import type { Timing } from './points.ts';
import { newNonce, signToken, verifyToken } from './token.ts';

// --- The database port ------------------------------------------------------
// Every method is async and returns plain rows. The production adapter wraps
// supabase-js; the test adapter wraps PGlite. Neither leaks its client here.

export interface PackRow {
  pack_id: string;
  pack_date: string;
  difficulty_label: string;
  status: string;
  incident_status: string;
  content_hash?: string;
}

/** Bumped whenever the point arithmetic changes; recorded on each ranked result. */
export const SCORING_VERSION = '1.0.0';
export interface SlotRow {
  id: string;
  pack_id: string;
  position: number;
  puzzle_id: string;
  engine_id: string;
  max_score: number;
  void_status: boolean;
}
export interface AttemptRow {
  id: string;
  session_id: string;
  /** Null for a reserve-Practice attempt (which uses practice_pack_id instead). */
  pack_id: string | null;
  status: string;
  /** The authenticated owner (Phase 5B). Null only for pre-Auth historical rows. */
  user_id: string | null;
  /** Ranked fields (Phase 6A). is_ranked false for practice/guest attempts. */
  is_ranked?: boolean;
  ranked_date?: string | null;
  active_denominator?: number | null;
  /** Set for a reserve-Practice attempt (Phase 7B) — its slots live in practice_pack_slots. */
  practice_pack_id?: string | null;
}

/** The pack a token binds to: the daily pack_id, or the practice_pack_id. */
export function packRefOf(attempt: AttemptRow): string {
  const ref = attempt.practice_pack_id ?? attempt.pack_id;
  if (!ref) throw new AppError('attempt_has_no_pack', 500);
  return ref;
}

/** The immutable practice pack + its sanitized public rows, from start_practice_pack. */
export interface PracticeStartRow {
  resumed: boolean;
  attempt_id: string;
  practice_pack_id: string;
  slots: PublicSlotRow[];
}

/** The eligibility contract from `check_rank_eligibility`. */
export interface RankEligibility {
  eligible: boolean;
  reason: string;
  today: string;
  ranked_status: 'none' | 'active' | 'completed' | 'expired';
  ranked_attempt_id: string | null;
  locked_score: number | null;
  message: string;
}
export interface ItemRow {
  id: string;
  attempt_id: string;
  slot_id: string;
  position: number;
  opened_at: string;
  status: string;
}
export interface PuzzlePrivate {
  answer_payload: AnswerKey;
  explanation: string;
}

export interface Db {
  getPublicPack(date: string): Promise<PublicSlotRow[]>;
  getLivePack(date: string): Promise<PackRow | null>;
  getPackById(packId: string): Promise<PackRow | null>;
  getSlot(packId: string, position: number): Promise<SlotRow | null>;
  /** Resolve the slot for an attempt (daily pack OR practice pack) at a position. */
  resolveSlot(attempt: AttemptRow, position: number): Promise<SlotRow | null>;
  /** Resolve the render-safe public row for an attempt's slot (daily OR practice). */
  resolveSlotPublic(attempt: AttemptRow, position: number): Promise<PublicSlotRow | null>;
  /** Reserve-Practice start (Phase 7B): select 5 reserve puzzles, create pack + attempt. */
  startPracticePack(input: { userId: string; sessionId: string; appVersion: string | null }): Promise<PracticeStartRow>;
  getPuzzlePublicPayload(puzzleId: string): Promise<Record<string, unknown> | null>;
  getPuzzlePrivate(puzzleId: string): Promise<PuzzlePrivate | null>;
  createAttempt(input: { userId: string; sessionId: string; packId: string; appVersion: string | null }): Promise<AttemptRow>;
  getAttempt(attemptId: string): Promise<AttemptRow | null>;
  // --- Ranked (Phase 6A) ---
  /** Server-authoritative eligibility for the user, app version, and UTC date. */
  rankEligibility(userId: string, appVersion: string | null, today: string): Promise<RankEligibility>;
  /** The username + valid country to snapshot onto a ranked attempt. */
  profileSnapshot(userId: string): Promise<{ username: string; country_code: string } | null>;
  /** Sum of non-void slot max_scores for a pack — the ranked normalization base. */
  activeDenominator(packId: string): Promise<number>;
  /** Atomically reserve the ranked slot; throws 'ranked_conflict' on the unique index. */
  createRankedAttempt(input: {
    userId: string; sessionId: string; packId: string; appVersion: string | null;
    rankedDate: string; countryCode: string; username: string; denominator: number;
    contentHash: string; scoringVersion: string;
  }): Promise<AttemptRow>;
  /** The user's active ranked attempt for a date (for resume). */
  activeRankedAttempt(userId: string, rankedDate: string): Promise<AttemptRow | null>;
  /** Positions already submitted for an attempt (for resume). */
  submittedPositions(attemptId: string): Promise<number[]>;
  getItem(attemptId: string, slotId: string): Promise<ItemRow | null>;
  openItem(input: { attemptId: string; slotId: string; position: number }): Promise<ItemRow>;
  submitItem(input: {
    attemptId: string; slotId: string; answerPayload: unknown;
    awardedScore: number; verdict: string; resultPayload: unknown;
  }): Promise<void>;
  submittedItems(attemptId: string): Promise<{ position: number; awarded_score: number; verdict: string }[]>;
  completeAttempt(input: { attemptId: string; finalScore: number }): Promise<void>;
}

export interface FlowDeps {
  db: Db;
  secret: string;
  /** Server clock in ms. Injected so the timer and token expiry are testable. */
  now: () => number;
  attemptTtlSec?: number; // default 2h
  openTtlSec?: number; // default 10m
}

const DEFAULT_ATTEMPT_TTL = 2 * 60 * 60;
const DEFAULT_OPEN_TTL = 10 * 60;

const nowSec = (deps: FlowDeps) => Math.floor(deps.now() / 1000);

/** The private `timing` lives in the (otherwise render-safe) public payload. */
function timingOf(payload: Record<string, unknown> | null): Timing {
  const t = payload?.timing as Timing | undefined;
  if (!t || typeof t.parMs !== 'number' || typeof t.limitMs !== 'number') {
    throw new AppError('puzzle_missing_timing', 500);
  }
  return t;
}

// ---------------------------------------------------------------------------
// 1. get-daily-pack
// ---------------------------------------------------------------------------

export async function getDailyPack(deps: FlowDeps, input: { date?: string }): Promise<{
  packDate: string;
  difficultyLabel: string;
  puzzles: PublicPuzzle[];
}> {
  const date = normalizeDate(input.date, deps);
  const rows = await deps.db.getPublicPack(date);
  if (!rows.length) throw new AppError('no_live_pack', 404);
  return {
    packDate: rows[0].pack_date,
    difficultyLabel: rows[0].pack_difficulty,
    puzzles: rows.map(toPublicPuzzle),
  };
}

// ---------------------------------------------------------------------------
// 2. start-attempt
// ---------------------------------------------------------------------------

export async function startAttempt(deps: FlowDeps, input: {
  date?: string; userId: string; sessionId: unknown; appVersion?: unknown;
}): Promise<{ attemptId: string; attemptToken: string; expiresAt: number; packDate: string }> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const date = normalizeDate(input.date, deps);
  const pack = await deps.db.getLivePack(date);
  if (!pack) throw new AppError('no_live_pack', 404);

  const attempt = await deps.db.createAttempt({
    userId,
    sessionId,
    packId: pack.pack_id,
    appVersion: typeof input.appVersion === 'string' ? input.appVersion.slice(0, 32) : null,
  });

  const iat = nowSec(deps);
  const exp = iat + (deps.attemptTtlSec ?? DEFAULT_ATTEMPT_TTL);
  const attemptToken = await signToken(deps.secret, {
    typ: 'attempt', aid: attempt.id, uid: userId, sid: sessionId, pid: pack.pack_id, iat, exp, nonce: newNonce(),
  });
  return { attemptId: attempt.id, attemptToken, expiresAt: exp, packDate: pack.pack_date };
}

// ---------------------------------------------------------------------------
// 2b. start-daily-attempt — the RANKED path (Phase 6A)
// ---------------------------------------------------------------------------

export type RankedStartResult =
  | {
      status: 'active';
      ranked: true;
      attemptId: string;
      attemptToken: string;
      expiresAt: number;
      packDate: string;
      /** Slots already scored (resume skips these). */
      completedPositions: number[];
      /** The slot the client should open next (1..5). */
      resumePosition: number;
    }
  | { status: 'completed'; ranked: true; rankedDate: string; lockedScore: number }
  | { status: 'ineligible'; ranked: true; reason: string; message: string };

function firstOpenPosition(completed: number[]): number {
  for (let p = 1; p <= 5; p++) if (!completed.includes(p)) return p;
  return 5;
}

async function resumeRanked(
  deps: FlowDeps, att: AttemptRow, userId: string, sessionId: string, today: string,
): Promise<RankedStartResult> {
  const iat = nowSec(deps);
  const exp = iat + (deps.attemptTtlSec ?? DEFAULT_ATTEMPT_TTL);
  const attemptToken = await signToken(deps.secret, {
    typ: 'attempt', aid: att.id, uid: userId, sid: sessionId, pid: packRefOf(att), iat, exp, nonce: newNonce(),
  });
  const completed = await deps.db.submittedPositions(att.id);
  return {
    status: 'active', ranked: true, attemptId: att.id, attemptToken, expiresAt: exp,
    packDate: today, completedPositions: completed, resumePosition: firstOpenPosition(completed),
  };
}

/**
 * Start (or securely resume) the ONE ranked attempt for this user + UTC date.
 * Eligibility, the country snapshot, and the ranked date are all derived
 * server-side; the client cannot request `is_ranked=true` as authority. The
 * unique index makes reservation atomic — a concurrent second start resolves to
 * the SAME attempt, never a second ranked row.
 */
export async function startDailyAttempt(deps: FlowDeps, input: {
  userId: string; sessionId: unknown; appVersion?: unknown;
}): Promise<RankedStartResult> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 32) : null;
  const today = normalizeDate(undefined, deps);

  const elig = await deps.db.rankEligibility(userId, appVersion, today);

  if (elig.reason === 'ranked_attempt_completed') {
    return { status: 'completed', ranked: true, rankedDate: today, lockedScore: elig.locked_score ?? 0 };
  }
  if (elig.reason === 'ranked_attempt_exists') {
    const att = await deps.db.activeRankedAttempt(userId, today);
    if (!att) throw new AppError('ranked_attempt_missing', 500);
    return resumeRanked(deps, att, userId, sessionId, today);
  }
  if (!elig.eligible) {
    return { status: 'ineligible', ranked: true, reason: elig.reason, message: elig.message };
  }

  const pack = await deps.db.getLivePack(today);
  if (!pack) return { status: 'ineligible', ranked: true, reason: 'no_live_pack', message: elig.message };
  const snap = await deps.db.profileSnapshot(userId);
  if (!snap) return { status: 'ineligible', ranked: true, reason: 'incomplete_profile', message: elig.message };
  const denom = await deps.db.activeDenominator(pack.pack_id);

  try {
    const att = await deps.db.createRankedAttempt({
      userId, sessionId, packId: pack.pack_id, appVersion,
      rankedDate: today, countryCode: snap.country_code, username: snap.username, denominator: denom,
      contentHash: pack.content_hash ?? '', scoringVersion: SCORING_VERSION,
    });
    return resumeRanked(deps, att, userId, sessionId, today);
  } catch (e) {
    // Lost the reservation race → the winner's attempt is now active; resume it.
    if ((e as { code?: string })?.code === 'ranked_conflict') {
      const existing = await deps.db.activeRankedAttempt(userId, today);
      if (existing) return resumeRanked(deps, existing, userId, sessionId, today);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 2b. start-practice-attempt — a fresh UNRANKED brew from reserve content (7B)
// ---------------------------------------------------------------------------

export interface PracticeStartResult {
  status: 'active';
  attemptId: string;
  attemptToken: string;
  expiresAt: number;
  /** True when an in-progress practice attempt was resumed rather than created. */
  resumed: boolean;
  ranked: false;
  /** Slots already scored on a resumed practice attempt. */
  completedPositions: number[];
  /** The slot to open next (1..5). */
  resumePosition: number;
  puzzles: PublicPuzzle[];
}

/**
 * Start (or resume) the ONE active reserve-Practice attempt. The server selects
 * five eligible reserve puzzles (one per category, never today's ranked), creates
 * an immutable practice pack + an UNRANKED attempt, and issues an attempt token
 * bound to the practice pack. Selection is server-authoritative; the client never
 * names puzzle ids. Answers are never returned.
 */
export async function startPracticeAttempt(deps: FlowDeps, input: {
  userId: string; sessionId: unknown; appVersion?: unknown;
}): Promise<PracticeStartResult> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 32) : null;

  const res = await deps.db.startPracticePack({ userId, sessionId, appVersion });
  const iat = nowSec(deps);
  const exp = iat + (deps.attemptTtlSec ?? DEFAULT_ATTEMPT_TTL);
  const attemptToken = await signToken(deps.secret, {
    typ: 'attempt', aid: res.attempt_id, uid: userId, sid: sessionId, pid: res.practice_pack_id, iat, exp, nonce: newNonce(),
  });
  // Defensive: re-sanitize every slot at the edge (the same guard get-daily-pack uses).
  const puzzles = res.slots.map(toPublicPuzzle);
  const completed = res.resumed ? await deps.db.submittedPositions(res.attempt_id) : [];
  return {
    status: 'active', attemptId: res.attempt_id, attemptToken, expiresAt: exp, resumed: res.resumed,
    ranked: false, completedPositions: completed, resumePosition: firstOpenPosition(completed), puzzles,
  };
}

// ---------------------------------------------------------------------------
// 3. open-puzzle — starts the server timer, issues a slot-bound token
// ---------------------------------------------------------------------------

export async function openPuzzle(deps: FlowDeps, input: {
  attemptToken: unknown; userId: string; sessionId: unknown; position: unknown;
}): Promise<{ openToken: string; expiresAt: number; puzzle: PublicPuzzle }> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const position = requirePosition(input.position);
  const { attempt, slot } = await authorizeSlot(deps, input.attemptToken, userId, sessionId, position, 'attempt');

  const existing = await deps.db.getItem(attempt.id, slot.id);
  if (existing?.status === 'submitted') throw new AppError('already_submitted', 409);
  // Idempotent: re-opening keeps the ORIGINAL opened_at, so the timer can't be
  // reset by re-calling open.
  if (!existing) await deps.db.openItem({ attemptId: attempt.id, slotId: slot.id, position });

  // Return the same sanitized shape get-daily-pack serves, for the one slot —
  // resolved from the daily pack OR the practice pack, whichever this attempt uses.
  const row = await deps.db.resolveSlotPublic(attempt, position);
  if (!row) throw new AppError('slot_not_found', 404);

  const iat = nowSec(deps);
  const exp = iat + (deps.openTtlSec ?? DEFAULT_OPEN_TTL);
  const openToken = await signToken(deps.secret, {
    typ: 'open', aid: attempt.id, uid: userId, sid: sessionId, pid: packRefOf(attempt), slot: slot.id, iat, exp, nonce: newNonce(),
  });
  return { openToken, expiresAt: exp, puzzle: toPublicPuzzle(row) };
}

// ---------------------------------------------------------------------------
// 4. submit-answer — scores against the private key, reveals the result
// ---------------------------------------------------------------------------

export async function submitAnswer(deps: FlowDeps, input: {
  openToken: unknown; userId: string; sessionId: unknown; position: unknown; submission: unknown;
}): Promise<{
  correct: boolean; verdict: string; points: number; accuracyPoints: number; speedPoints: number;
  explanation: string; elapsedMs: number;
}> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const position = requirePosition(input.position);
  const { attempt, slot } = await authorizeSlot(deps, input.openToken, userId, sessionId, position, 'open');

  const item = await deps.db.getItem(attempt.id, slot.id);
  if (!item) throw new AppError('item_not_open', 409);
  if (item.status === 'submitted') throw new AppError('already_submitted', 409);

  const valid = validateSubmission(slot.engine_id, input.submission);
  if (!valid.ok) throw new AppError(`invalid_submission:${valid.error}`, 422);

  const priv = await deps.db.getPuzzlePrivate(slot.puzzle_id);
  if (!priv) throw new AppError('answer_unavailable', 500);
  const timing = timingOf(await deps.db.getPuzzlePublicPayload(slot.puzzle_id));

  // The single source of truth for elapsed time: server open → server submit.
  const elapsedMs = Math.max(0, deps.now() - Date.parse(item.opened_at));
  const result = scoreSubmission(slot.engine_id, priv.answer_payload, valid.submission, timing, elapsedMs);

  const resultPayload = {
    verdict: result.verdict,
    points: result.points,
    accuracyPoints: result.accuracyPoints,
    speedPoints: result.speedPoints,
    correct: result.correct,
    explanation: priv.explanation,
  };
  await deps.db.submitItem({
    attemptId: attempt.id,
    slotId: slot.id,
    answerPayload: valid.submission,
    awardedScore: result.points,
    verdict: result.verdict,
    resultPayload,
  });

  return { ...result, explanation: priv.explanation, elapsedMs };
}

// ---------------------------------------------------------------------------
// 5. complete-attempt — finalize the BrewScore (UNRANKED)
// ---------------------------------------------------------------------------

export async function completeAttempt(deps: FlowDeps, input: {
  attemptToken: unknown; userId: string; sessionId: unknown;
}): Promise<{
  finalScore: number; isRanked: boolean; rankedDate?: string | null; countryCode?: string | null;
  results: { position: number; verdict: string; points: number }[];
}> {
  const userId = requireUserId(input.userId);
  const sessionId = requireSession(input.sessionId);
  const { attempt } = await authorizeAttempt(deps, input.attemptToken, userId, sessionId, 'attempt');

  const items = await deps.db.submittedItems(attempt.id);
  const sum = items.reduce((s, i) => s + i.awarded_score, 0);
  // Ranked attempts normalize over their active denominator (the sum of non-void
  // slot maxes at start, 100 unless a slot was already void). Practice/guest use
  // the full 100 base. Either way the raw sum can't exceed the base.
  const denom = attempt.is_ranked && attempt.active_denominator ? attempt.active_denominator : 100;
  const finalScore = Math.min(100, Math.round((100 * sum) / denom));

  if (attempt.status === 'active') {
    await deps.db.completeAttempt({ attemptId: attempt.id, finalScore });
  }
  // Idempotent: completing an already-completed attempt returns the same score.

  return {
    finalScore,
    isRanked: attempt.is_ranked === true,
    rankedDate: attempt.is_ranked ? attempt.ranked_date ?? null : null,
    results: items
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ position: i.position, verdict: i.verdict, points: i.awarded_score })),
  };
}

// ---------------------------------------------------------------------------
// shared authorization + validation helpers
// ---------------------------------------------------------------------------

async function authorizeAttempt(
  deps: FlowDeps, token: unknown, userId: string, sessionId: string, typ: 'attempt' | 'open',
): Promise<{ attempt: AttemptRow }> {
  if (typeof token !== 'string' || !token) throw new AppError('missing_token', 401);
  // The token must be for THIS authenticated user (bound at issue time).
  const verified = await verifyToken(deps.secret, token, { now: nowSec(deps), typ, uid: userId, sid: sessionId });
  if (!verified.ok) throw new AppError(`invalid_token:${verified.code}`, 401);

  const attempt = await deps.db.getAttempt(verified.payload.aid);
  if (!attempt) throw new AppError('attempt_not_found', 404);
  // Independent DB-side ownership check: the attempt row must belong to the user.
  if (attempt.user_id !== userId) throw new AppError('invalid_token:wrong_user', 403);
  if (attempt.session_id !== sessionId) throw new AppError('invalid_token:wrong_session', 401);
  // The token's pack ref is the daily pack_id OR the practice_pack_id — a ranked
  // token can never open a practice pack, or vice versa (the ids differ).
  if (packRefOf(attempt) !== verified.payload.pid) throw new AppError('invalid_token:wrong_pack', 401);
  return { attempt };
}

/** authorizeAttempt + resolve the slot at `position` (and reject a void slot). */
async function authorizeSlot(
  deps: FlowDeps, token: unknown, userId: string, sessionId: string, position: number, typ: 'attempt' | 'open',
): Promise<{ attempt: AttemptRow; slot: SlotRow }> {
  const { attempt } = await authorizeAttempt(deps, token, userId, sessionId, typ);
  if (attempt.status !== 'active') throw new AppError('attempt_not_active', 409);

  const slot = await deps.db.resolveSlot(attempt, position);
  if (!slot) throw new AppError('slot_not_found', 404);
  if (slot.void_status) throw new AppError('slot_voided', 409);

  // For open tokens, the token is bound to a specific slot; it must match.
  if (typ === 'open') {
    const verified = await verifyToken(deps.secret, token as string, { now: nowSec(deps), typ, uid: userId, sid: sessionId, slot: slot.id });
    if (!verified.ok) throw new AppError(`invalid_token:${verified.code}`, 401);
  }
  return { attempt, slot };
}

async function packDateOf(deps: FlowDeps, packId: string): Promise<string> {
  const pack = await deps.db.getPackById(packId);
  if (!pack) throw new AppError('no_live_pack', 404);
  return pack.pack_date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireUserId(v: unknown): string {
  // Derived server-side from the verified Auth JWT — never from the request body.
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new AppError('auth_required', 401);
  return v;
}
function requireSession(v: unknown): string {
  if (typeof v !== 'string' || v.length < 16 || v.length > 128) throw new AppError('bad_session', 400);
  return v;
}
function requirePosition(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) throw new AppError('bad_position', 400);
  return v;
}
function normalizeDate(v: unknown, deps: FlowDeps): string {
  if (v == null) return new Date(deps.now()).toISOString().slice(0, 10);
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AppError('bad_date', 400);
  return v;
}
