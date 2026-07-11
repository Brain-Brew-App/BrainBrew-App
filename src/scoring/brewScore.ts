/**
 * The single source of truth for scoring. Core Spec §8.
 *
 * BrewScore is 0–100: five puzzles × 20 points max.
 * Per puzzle: up to 14 accuracy points + up to 6 speed points.
 *
 * No screen or engine may compute points on its own — they collect an `Answer`
 * and hand it here. When scoring moves server-side (§9) this file is the thing
 * that gets ported, and the call sites stay unchanged.
 */

import type { Answer, BrewScore, CategoryResult, Puzzle } from '../types/puzzle';
import { allOrNothing, clamp01, MAX_BREW_SCORE, partial } from './points';

export {
  MAX_ACCURACY_POINTS,
  MAX_SPEED_POINTS,
  MAX_POINTS_PER_PUZZLE,
  MAX_BREW_SCORE,
} from './points';

/** The correct choice id for every single-answer engine, else null. */
export function correctIdOf(puzzle: Puzzle): string | null {
  switch (puzzle.engineId) {
    case 'OBS_001':
      return puzzle.oddTileId;
    case 'PAT_003':
      // No options: the sequence is the answer space.
      return `term-${puzzle.wrongIndex}`;
    case 'OBS_003':
    case 'PAT_001':
    case 'PAT_002':
    case 'LOG_001':
    case 'LOG_002':
    case 'LNG_001':
    case 'LNG_002':
      return puzzle.correctOptionId;
    case 'OBS_004': // a set of two
    case 'LOG_003': // a full ordering
    case 'LNG_003': // a full ordering
    case 'ATT_002': // a chosen subset
    case 'ATT_001': // a sweep
    case 'ATT_003': // a classification run
      return null;
  }
}

/** Fraction of ids sitting in their correct absolute position. */
function positionalAccuracy(selected: string[], correct: string[]): number {
  if (!correct.length) return 0;
  let hits = 0;
  for (let i = 0; i < correct.length; i++) if (selected[i] === correct[i]) hits++;
  return hits / correct.length;
}

/**
 * What an ordered list of ids means, per engine. The only place in the codebase
 * that knows.
 */
function scoreSequence(puzzle: Puzzle, selectedIds: string[]): { correct: boolean; accuracy: number } {
  switch (puzzle.engineId) {
    case 'OBS_004': {
      // One answer expressed as two taps. Half a pair is not half an answer —
      // partial credit here would reward tapping two tiles at random.
      const exact =
        selectedIds.length === 2 &&
        new Set(selectedIds).size === 2 &&
        selectedIds.every((id) => puzzle.pairTileIds.includes(id));
      return { correct: exact, accuracy: exact ? 1 : 0 };
    }

    case 'LOG_003':
    case 'LNG_003': {
      // Three of four right genuinely is closer than none.
      const accuracy = positionalAccuracy(selectedIds, puzzle.correctOrder);
      return { correct: accuracy === 1, accuracy };
    }

    case 'ATT_002': {
      const targets = puzzle.targetIds;
      if (puzzle.orderMatters) {
        const accuracy = positionalAccuracy(selectedIds, targets);
        return { correct: accuracy === 1, accuracy };
      }
      // Unordered recall: a wrong tile cancels a right one, so guessing the
      // whole board scores nothing.
      const unique = [...new Set(selectedIds)];
      const hits = unique.filter((id) => targets.includes(id)).length;
      const misses = unique.length - hits;
      const accuracy = clamp01((hits - misses) / targets.length);
      return { correct: accuracy === 1, accuracy };
    }

    default:
      // A sequence answer for an engine that does not take one is a bug, not a
      // zero. Fail loudly rather than quietly award nothing.
      throw new Error(`${puzzle.engineId} cannot be answered with a sequence`);
  }
}

/** Score one puzzle. */
export function scorePuzzle(puzzle: Puzzle, answer: Answer): CategoryResult {
  let correct = false;
  let accuracyPoints = 0;
  let speedPoints = 0;

  switch (answer.kind) {
    case 'choice': {
      const expected = correctIdOf(puzzle);
      correct = expected !== null && answer.selectedId === expected;
      ({ accuracyPoints, speedPoints } = allOrNothing(correct, answer.elapsedMs, puzzle.timing));
      break;
    }

    case 'sequence': {
      const result = scoreSequence(puzzle, answer.selectedIds);
      correct = result.correct;
      // Pair Find is all-or-nothing; the ordering and recall engines award
      // partial credit per correct position.
      ({ accuracyPoints, speedPoints } =
        puzzle.engineId === 'OBS_004'
          ? allOrNothing(correct, answer.elapsedMs, puzzle.timing)
          : partial(result.accuracy, answer.elapsedMs, puzzle.timing));
      break;
    }

    case 'sweep': {
      // Attention Speed: accuracy first, completion time second (§3, §8).
      // False positives subtract, so spraying the grid cannot score.
      const accuracy =
        answer.totalTargets <= 0
          ? 0
          : clamp01((answer.hits - answer.falsePositives) / answer.totalTargets);
      correct = accuracy === 1;
      ({ accuracyPoints, speedPoints } = partial(accuracy, answer.elapsedMs, puzzle.timing));
      break;
    }

    case 'classify': {
      // Accuracy × coverage: classifying eight carefully beats rushing twelve,
      // and unattempted items earn nothing but are not punished twice.
      const accuracy = answer.attempted <= 0 ? 0 : answer.correct / answer.attempted;
      const coverage = answer.total <= 0 ? 0 : answer.attempted / answer.total;
      correct = answer.correct === answer.total;
      ({ accuracyPoints, speedPoints } = partial(
        accuracy * coverage,
        answer.elapsedMs,
        puzzle.timing,
      ));
      break;
    }
  }

  return {
    puzzleId: puzzle.id,
    engineId: puzzle.engineId,
    category: puzzle.category,
    engine: puzzle.engine,
    correct,
    accuracyPoints,
    speedPoints,
    points: accuracyPoints + speedPoints,
    elapsedMs: answer.elapsedMs,
  };
}

/** Score a whole session. Total is the BrewScore, 0–100. */
export function computeBrewScore(puzzles: Puzzle[], answers: Answer[]): BrewScore {
  const results = puzzles.map((puzzle, i) => {
    const answer = answers[i];
    if (!answer) throw new Error(`Missing answer for puzzle ${puzzle.id}`);
    return scorePuzzle(puzzle, answer);
  });

  return {
    total: results.reduce((sum, r) => sum + r.points, 0),
    results,
    totalElapsedMs: results.reduce((sum, r) => sum + r.elapsedMs, 0),
  };
}

/**
 * Copy for the results screen. Never claims a cognitive benefit (§1), and
 * never calls a score "perfect" unless it actually is — 97/100 is not perfect.
 */
export function brewScoreCaption(total: number): string {
  if (total === MAX_BREW_SCORE) return 'A perfect brew.';
  if (total >= 96) return 'Very nearly flawless.';
  if (total >= 85) return 'Excellent session.';
  if (total >= 70) return 'Strong session.';
  if (total >= 45) return 'Solid start to the day.';
  return 'Some days the brew is slow.';
}
