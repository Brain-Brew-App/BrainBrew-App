/**
 * The point arithmetic of BrewScore — the part that is identical everywhere it
 * runs (the app, and the server-authoritative Edge Function).
 *
 * Core Spec §8: 20 points per puzzle = up to 14 accuracy + up to 6 speed.
 *
 * This is the canonical formula. `src/scoring/brewScore.ts` imports it, and
 * `supabase/functions/_shared/points.ts` is a Deno mirror of it. A contract test
 * (`scripts/db/scoring-contract.mjs`) proves the two produce byte-identical
 * results across a grid of inputs, so they cannot silently diverge.
 */

import type { Timing } from '../types/puzzle';

export const MAX_ACCURACY_POINTS = 14;
export const MAX_SPEED_POINTS = 6;
export const MAX_POINTS_PER_PUZZLE = MAX_ACCURACY_POINTS + MAX_SPEED_POINTS; // 20
export const MAX_BREW_SCORE = 100;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * 1.0 at or under `parMs`, 0.0 at or over `limitMs`, linear between.
 * Deliberately coarse: a several-second window, so device/network jitter is a
 * negligible fraction of the signal (§3, §9).
 */
export function speedFactor(elapsedMs: number, timing: Timing): number {
  const { parMs, limitMs } = timing;
  if (limitMs <= parMs) return elapsedMs <= parMs ? 1 : 0;
  return clamp01((limitMs - elapsedMs) / (limitMs - parMs));
}

/**
 * Awards points from an accuracy fraction in [0,1].
 * Speed is *multiplied by accuracy* on every partial-credit engine, so a fast
 * sloppy answer can never beat a slower clean one (Catalog §2.3).
 */
export function partial(accuracy: number, elapsedMs: number, timing: Timing) {
  const a = clamp01(accuracy);
  return {
    accuracyPoints: Math.round(MAX_ACCURACY_POINTS * a),
    speedPoints: Math.round(MAX_SPEED_POINTS * speedFactor(elapsedMs, timing) * a),
  };
}

/** Full marks for a correct single answer, nothing for a wrong one (§8). */
export function allOrNothing(correct: boolean, elapsedMs: number, timing: Timing) {
  if (!correct) return { accuracyPoints: 0, speedPoints: 0 };
  return {
    accuracyPoints: MAX_ACCURACY_POINTS,
    speedPoints: Math.round(MAX_SPEED_POINTS * speedFactor(elapsedMs, timing)),
  };
}

/** Verdict from a scored result. Matches the app's `verdictOf`. */
export function verdictOf(correct: boolean, points: number): 'correct' | 'partial' | 'incorrect' {
  if (correct) return 'correct';
  return points > 0 ? 'partial' : 'incorrect';
}
