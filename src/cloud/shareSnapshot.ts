/**
 * Share-card data contract (Phase 7A).
 *
 * An immutable, privacy-safe snapshot of a completed brew, built at share time
 * and frozen. It is the ONLY data the Share Card renders — so if it carries no
 * answers, ids, tokens, or identity, the exported image cannot leak them. A
 * recursive forbidden-field guard enforces that on every snapshot.
 *
 * The snapshot is a point-in-time copy: if a ranked score is later recalculated
 * after a puzzle void, an already-generated card stays as-is (the app's live
 * score remains authoritative elsewhere).
 */

import { PayloadError, PROGRESS_FORBIDDEN } from './validate';
import { CATEGORY_ORDER, type BrewScore, type Category } from '../types/puzzle';

export type ShareSessionType = 'ranked' | 'practice' | 'local';
export type ShareCategoryState = 'correct' | 'partial' | 'missed';

export interface ShareCategory {
  category: Category;
  /** Points earned out of 20 — never an answer. */
  points: number;
  /** Spoiler-free outcome; paired with an icon/mark, never colour alone. */
  state: ShareCategoryState;
}

export interface ShareSnapshot {
  /** ISO timestamp frozen when the card was generated. */
  generatedAt: string;
  sessionType: ShareSessionType;
  /** UTC date the brew belongs to (ranked_date, or the practice/local play date). */
  date: string;
  brewScore: number;
  totalSolveMs: number | null;
  /** The five categories in fixed order (Observation → Attention Speed). */
  categories: ShareCategory[];
  /** Current ranked streak — ONLY for a ranked card; null otherwise. */
  streak: number | null;
  /** A restrained result caption. */
  caption: string;
  /** Ranked-only: the score was corrected by a puzzle-void recalculation. */
  updatedAfterValidation: boolean;
  /** Omitted (null) by default — shown only with an explicit user preference. */
  username: string | null;
}

/**
 * Anything answer-, identity-, token-, or prompt-revealing is forbidden in a
 * snapshot — recursively, at any depth. Extends the progress guard with the raw
 * answer/submission/prompt shapes a card must never carry.
 */
export const SHARE_FORBIDDEN = new Set<string>([
  ...PROGRESS_FORBIDDEN,
  'selectedId', 'selectedIds', 'tappedIds', 'classifications', 'answer', 'submission',
  'prompt', 'explanation', 'tiles', 'options', 'symbols', 'items', 'board',
]);

function assertNoForbidden(value: unknown, path = ''): void {
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) v.forEach((el, i) => walk(el, `${p}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (SHARE_FORBIDDEN.has(k)) throw new PayloadError('share_leak', `forbidden field in share snapshot: ${p ? `${p}.${k}` : k}`);
        walk(val, p ? `${p}.${k}` : k);
      }
    }
  };
  walk(value, path);
}

const stateOf = (correct: boolean, points: number): ShareCategoryState =>
  (correct ? 'correct' : points > 0 ? 'partial' : 'missed');

export interface BuildShareInput {
  /** ISO timestamp to freeze (caller passes new Date().toISOString()). */
  nowIso: string;
  sessionType: ShareSessionType;
  date: string;
  score: BrewScore;
  caption: string;
  /** Ranked only. */
  streak?: number | null;
  updatedAfterValidation?: boolean;
  /** Only when the player has explicitly opted to show it (default omitted). */
  username?: string | null;
}

/** Build a frozen, privacy-safe snapshot from a completed brew. */
export function buildShareSnapshot(input: BuildShareInput): ShareSnapshot {
  const byCategory = new Map(input.score.results.map((r) => [r.category, r]));
  const categories: ShareCategory[] = CATEGORY_ORDER.map((category) => {
    const r = byCategory.get(category);
    const points = r ? r.points : 0;
    return { category, points, state: r ? stateOf(r.correct, points) : 'missed' };
  });
  const ranked = input.sessionType === 'ranked';
  const snapshot: ShareSnapshot = {
    generatedAt: input.nowIso,
    sessionType: input.sessionType,
    date: input.date,
    brewScore: input.score.total,
    totalSolveMs: Number.isFinite(input.score.totalElapsedMs) ? input.score.totalElapsedMs : null,
    categories,
    streak: ranked && typeof input.streak === 'number' ? input.streak : null,
    caption: input.caption,
    updatedAfterValidation: ranked ? input.updatedAfterValidation === true : false,
    username: input.username ?? null,
  };
  return validateShareSnapshot(snapshot);
}

/** Validate a snapshot: recursive forbidden guard + shape. Throws on any leak. */
export function validateShareSnapshot(raw: unknown): ShareSnapshot {
  if (!raw || typeof raw !== 'object') throw new PayloadError('bad_share_snapshot');
  assertNoForbidden(raw);
  const s = raw as Record<string, unknown>;
  if (s.sessionType !== 'ranked' && s.sessionType !== 'practice' && s.sessionType !== 'local') throw new PayloadError('bad_share_snapshot', 'sessionType');
  if (typeof s.generatedAt !== 'string' || typeof s.date !== 'string') throw new PayloadError('bad_share_snapshot', 'meta');
  if (typeof s.brewScore !== 'number' || s.brewScore < 0 || s.brewScore > 100) throw new PayloadError('bad_share_snapshot', 'score');
  if (!Array.isArray(s.categories) || s.categories.length !== 5) throw new PayloadError('bad_share_snapshot', 'categories');
  s.categories.forEach((c, i) => {
    const cat = c as Record<string, unknown>;
    if (cat.category !== CATEGORY_ORDER[i]) throw new PayloadError('bad_share_snapshot', 'category_order');
    if (typeof cat.points !== 'number' || cat.points < 0 || cat.points > 20) throw new PayloadError('bad_share_snapshot', 'points');
    if (cat.state !== 'correct' && cat.state !== 'partial' && cat.state !== 'missed') throw new PayloadError('bad_share_snapshot', 'state');
  });
  if (s.streak != null && typeof s.streak !== 'number') throw new PayloadError('bad_share_snapshot', 'streak');
  if (typeof s.caption !== 'string') throw new PayloadError('bad_share_snapshot', 'caption');
  return raw as ShareSnapshot;
}

/** Short, answer-free share text (no leaderboard stats, no answers). */
export function shareText(snapshot: ShareSnapshot): string {
  const kind = snapshot.sessionType === 'ranked' ? 'ranked Brew' : 'Practice Brew';
  const streak = snapshot.sessionType === 'ranked' && snapshot.streak && snapshot.streak > 1 ? ` · ${snapshot.streak}-day streak` : '';
  return `My BrainBrew ${kind}: ${snapshot.brewScore}/100${streak}. Five minutes. Sharper every morning.`;
}
