import { colors } from '../theme/theme';
import type { CategoryResult } from '../types/puzzle';

export interface Verdict {
  mark: string;
  label: string;
  color: string;
}

/**
 * Three states, not two. Attention Speed can score 17/20 while still missing a
 * perfect sweep — stamping that with the same ✕ as a wrong multiple-choice
 * answer reads as a bug, and contradicts the "7 of 7 found" line above it.
 *
 * Shared by the in-session reveal card and the results breakdown so the two can
 * never disagree about the same result.
 */
export function verdictOf(result: CategoryResult): Verdict {
  if (result.correct) return { mark: '✓', label: 'Correct', color: colors.correct };
  if (result.points > 0) return { mark: '◐', label: 'Partly there', color: colors.partial };
  return { mark: '✕', label: 'Not quite', color: colors.incorrect };
}
