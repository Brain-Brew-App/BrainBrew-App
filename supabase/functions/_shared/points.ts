/**
 * Deno mirror of `src/scoring/points.ts` — the canonical point arithmetic.
 *
 * Self-contained (no imports) so it bundles into an Edge Function without
 * reaching outside `supabase/functions/`. `scripts/db/scoring-contract.mjs`
 * proves it produces byte-identical results to the app's `points.ts` across a
 * grid of inputs, so the two cannot silently diverge. If you change one, change
 * both and re-run the contract test.
 *
 * Core Spec §8: 20 points per puzzle = up to 14 accuracy + up to 6 speed.
 */

export interface Timing {
  parMs: number;
  limitMs: number;
}

export const MAX_ACCURACY_POINTS = 14;
export const MAX_SPEED_POINTS = 6;
export const MAX_POINTS_PER_PUZZLE = MAX_ACCURACY_POINTS + MAX_SPEED_POINTS;
export const MAX_BREW_SCORE = 100;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function speedFactor(elapsedMs: number, timing: Timing): number {
  const { parMs, limitMs } = timing;
  if (limitMs <= parMs) return elapsedMs <= parMs ? 1 : 0;
  return clamp01((limitMs - elapsedMs) / (limitMs - parMs));
}

export function partial(accuracy: number, elapsedMs: number, timing: Timing) {
  const a = clamp01(accuracy);
  return {
    accuracyPoints: Math.round(MAX_ACCURACY_POINTS * a),
    speedPoints: Math.round(MAX_SPEED_POINTS * speedFactor(elapsedMs, timing) * a),
  };
}

export function allOrNothing(correct: boolean, elapsedMs: number, timing: Timing) {
  if (!correct) return { accuracyPoints: 0, speedPoints: 0 };
  return {
    accuracyPoints: MAX_ACCURACY_POINTS,
    speedPoints: Math.round(MAX_SPEED_POINTS * speedFactor(elapsedMs, timing)),
  };
}

export function verdictOf(correct: boolean, points: number): 'correct' | 'partial' | 'incorrect' {
  if (correct) return 'correct';
  return points > 0 ? 'partial' : 'incorrect';
}
