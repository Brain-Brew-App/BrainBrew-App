/**
 * Which primary action Home offers for today's ranked brew — pure, and tested.
 *
 * This exists because the rule was previously implicit in JSX, and it got it wrong in
 * the one case that mattered: when the ranked eligibility CHECK failed, the status
 * came back `undefined`, which the UI read as "no ranked brew available" and answered
 * with a generic "Start Today's Brew" button that quietly began an UNRANKED attempt.
 * The player spent their daily ritual on a brew that never counted, and was told
 * nothing.
 *
 * The rule that must hold: **an unknown ranked state is never treated as a known one.**
 * Not eligible, not ineligible, not "just play practice" — unknown, with a retry.
 */

export interface RankedStatusLike {
  /** The ranked check itself failed. We do not know the player's ranked state. */
  unknown?: boolean;
  eligible: boolean;
  state: 'none' | 'active' | 'completed' | 'expired';
}

export type RankedCta =
  | 'ranked_continue'   // an attempt is in progress — resume it
  | 'ranked_start'      // eligible — start today's ONE ranked brew
  | 'practice_only'     // ranked already completed today
  | 'retry_unknown'     // the check FAILED — offer a retry, never a silent unranked brew
  | 'plain_start';      // local mode / no ranked concept at all

export function rankedCta(ranked?: RankedStatusLike): RankedCta {
  if (!ranked) return 'plain_start';          // local mode — ranked does not exist here
  if (ranked.unknown) return 'retry_unknown'; // MUST come before every other branch
  if (ranked.state === 'active') return 'ranked_continue';
  if (ranked.state === 'completed') return 'practice_only';
  if (ranked.eligible) return 'ranked_start';
  return 'plain_start';                       // a KNOWN ineligibility (e.g. guest account)
}

/** True only when this CTA starts an attempt the player believes is ranked. */
export function ctaStartsRanked(cta: RankedCta): boolean {
  return cta === 'ranked_start' || cta === 'ranked_continue';
}
