/**
 * Server-authoritative scoring.
 *
 * The key difference from the app's scorer: the client submits its RAW input
 * (which tiles it tapped, which order it placed), never derived aggregates —
 * because in cloud mode it never learns which tiles are targets. The SERVER,
 * holding the private answer key, derives accuracy and awards points.
 *
 * The point arithmetic is the shared `points.ts`. `scripts/db/scoring-contract.mjs`
 * proves that for every one of the 314 puzzles, this scorer and the app's scorer
 * award identical points for the same underlying play and the same server-set
 * elapsed time.
 */

import { allOrNothing, clamp01, partial, verdictOf, type Timing } from './points.ts';

/** The private answer key, as stored in `puzzle_answers.answer_payload`. */
export interface AnswerKey {
  oddTileId?: string;
  correctOptionId?: string;
  pairTileIds?: [string, string];
  wrongIndex?: number;
  correctTerm?: string;
  correctOrder?: string[];
  targetIds?: string[];
  orderMatters?: boolean;
  symbols?: { id: string; isTarget: boolean }[]; // ATT_001
  items?: { id: string; bucket: 0 | 1 }[]; // ATT_003
}

/**
 * A raw client submission. Only ONE of these shapes is valid per engine; the
 * scorer validates and rejects a mismatched shape.
 */
export interface Submission {
  /** Single-choice engines: the chosen option/tile id (or term-N for repair). */
  selectedId?: string;
  /** Pair / ordering / memory engines: the chosen ids, in order where it matters. */
  selectedIds?: string[];
  /** Symbol Sweep: the tile ids the player tapped. */
  tappedIds?: string[];
  /** Rapid Classification: each item's chosen bucket. */
  classifications?: { itemId: string; bucket: 0 | 1 }[];
}

export interface ScoreResult {
  correct: boolean;
  accuracyPoints: number;
  speedPoints: number;
  points: number;
  verdict: 'correct' | 'partial' | 'incorrect';
}

const SINGLE_CHOICE = new Set([
  'OBS_003', 'PAT_001', 'PAT_002', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002',
]);

function positionalAccuracy(selected: string[], correct: string[]): number {
  if (!correct.length) return 0;
  let hits = 0;
  for (let i = 0; i < correct.length; i++) if (selected[i] === correct[i]) hits++;
  return hits / correct.length;
}

/**
 * Score one submission. `serverElapsedMs` is measured by the server (open →
 * submit), never trusted from the client.
 */
export function scoreSubmission(
  engineId: string,
  key: AnswerKey,
  sub: Submission,
  timing: Timing,
  serverElapsedMs: number,
): ScoreResult {
  let correct = false;
  let pts = { accuracyPoints: 0, speedPoints: 0 };

  const finish = () => {
    const points = pts.accuracyPoints + pts.speedPoints;
    return { correct, ...pts, points, verdict: verdictOf(correct, points) };
  };

  // --- single-choice engines --------------------------------------------------
  if (engineId === 'OBS_001') {
    correct = sub.selectedId != null && sub.selectedId === key.oddTileId;
    pts = allOrNothing(correct, serverElapsedMs, timing);
    return finish();
  }
  if (engineId === 'PAT_003') {
    correct = sub.selectedId != null && sub.selectedId === `term-${key.wrongIndex}`;
    pts = allOrNothing(correct, serverElapsedMs, timing);
    return finish();
  }
  if (SINGLE_CHOICE.has(engineId)) {
    correct = sub.selectedId != null && sub.selectedId === key.correctOptionId;
    pts = allOrNothing(correct, serverElapsedMs, timing);
    return finish();
  }

  // --- Pair Find: a set of two, all-or-nothing --------------------------------
  if (engineId === 'OBS_004') {
    const ids = sub.selectedIds ?? [];
    const pair: string[] = key.pairTileIds ?? [];
    correct = ids.length === 2 && new Set(ids).size === 2 && ids.every((id) => pair.includes(id));
    pts = allOrNothing(correct, serverElapsedMs, timing);
    return finish();
  }

  // --- ordering engines: partial credit per position --------------------------
  if (engineId === 'LOG_003' || engineId === 'LNG_003') {
    const accuracy = positionalAccuracy(sub.selectedIds ?? [], key.correctOrder ?? []);
    correct = accuracy === 1;
    pts = partial(accuracy, serverElapsedMs, timing);
    return finish();
  }

  // --- Memory Flash: recall (ordered at difficulty 5) -------------------------
  if (engineId === 'ATT_002') {
    const targets = key.targetIds ?? [];
    const ids = sub.selectedIds ?? [];
    let accuracy: number;
    if (key.orderMatters) {
      accuracy = positionalAccuracy(ids, targets);
    } else {
      const unique = [...new Set(ids)];
      const hits = unique.filter((id) => targets.includes(id)).length;
      accuracy = clamp01((hits - (unique.length - hits)) / (targets.length || 1));
    }
    correct = accuracy === 1;
    pts = partial(accuracy, serverElapsedMs, timing);
    return finish();
  }

  // --- Symbol Sweep: server derives hits/false-positives from raw taps --------
  if (engineId === 'ATT_001') {
    const targetIds = new Set((key.symbols ?? []).filter((s) => s.isTarget).map((s) => s.id));
    const totalTargets = targetIds.size;
    const tapped = [...new Set(sub.tappedIds ?? [])];
    const hits = tapped.filter((id) => targetIds.has(id)).length;
    const falsePositives = tapped.length - hits;
    const accuracy = totalTargets <= 0 ? 0 : clamp01((hits - falsePositives) / totalTargets);
    correct = accuracy === 1;
    pts = partial(accuracy, serverElapsedMs, timing);
    return finish();
  }

  // --- Rapid Classification: accuracy × coverage ------------------------------
  if (engineId === 'ATT_003') {
    const truth = new Map((key.items ?? []).map((i) => [i.id, i.bucket]));
    const total = truth.size;
    const submitted = sub.classifications ?? [];
    const attempted = submitted.length;
    const correctCount = submitted.filter((c) => truth.get(c.itemId) === c.bucket).length;
    const accuracy = attempted <= 0 ? 0 : correctCount / attempted;
    const coverage = total <= 0 ? 0 : attempted / total;
    correct = correctCount === total;
    pts = partial(accuracy * coverage, serverElapsedMs, timing);
    return finish();
  }

  throw new Error(`unknown engine for scoring: ${engineId}`);
}
