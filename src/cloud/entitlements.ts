/**
 * Entitlement helpers (Phase 7D) — pure, platform-free, unit-tested.
 *
 * The runtime fetch/cache lives in `entitlementData.ts` (cloud only). This module
 * holds the parts that must be provable in a plain-Node test:
 *   • the EXPLICIT local-development entitlement (local mode never calls Supabase);
 *   • fail-closed capability checks;
 *   • the Premium product catalogue used by the preview UI (copy only — no prices,
 *     products, or purchase affordances).
 *
 * The ranked-fairness invariant is enforced in `validateEntitlements`
 * (`rankedAttemptsPerUtcDay` is a hard constant 1); nothing here can raise it.
 */

import {
  ENTITLEMENT_CAPABILITIES,
  type EntitlementCapability,
  type ValidEntitlements,
} from './validate';

/**
 * The entitlement local mode uses. It is an EXPLICIT local-development policy —
 * never fetched, never a network call — and it mirrors the beta policy so a local
 * build behaves like the server's beta (unlimited practice, no Premium unlocked).
 * `source: 'local_dev'` makes its provenance unmistakable in any log or test.
 */
export const LOCAL_DEV_ENTITLEMENTS: ValidEntitlements = {
  locked: false,
  entitlementState: 'beta',
  entitlementVersion: 1,
  capabilities: {
    daily_ranked_brew: true,
    global_leaderboard: true,
    country_leaderboard: true,
    ranked_streaks: true,
    basic_progress: true,
    share_cards: true,
    practice_access: true,
    unlimited_practice: true,
    archives: false,
    category_training: false,
    difficulty_selection: false,
    advanced_practice_stats: false,
    advanced_ranked_stats: false,
    bonus_packs: false,
    premium_themes: false,
    private_tournaments: false,
  },
  rankedAttemptsPerUtcDay: 1,
  freePracticeBrewsPerPeriod: null,
  policyMode: 'beta_open',
  subscription: null,
  source: 'local_dev',
};

/**
 * Fail-closed capability check. A null entitlement (not loaded yet) or an unknown
 * capability is `false` — a Premium affordance is never shown "on" by accident.
 */
export function hasCapability(ent: ValidEntitlements | null, cap: EntitlementCapability): boolean {
  return ent?.capabilities[cap] === true;
}

/** Capabilities that are unavailable now and only ever unlock LATER as Premium. */
export const PREMIUM_CAPABILITIES: readonly EntitlementCapability[] = [
  'archives', 'category_training', 'difficulty_selection', 'advanced_practice_stats',
  'advanced_ranked_stats', 'bonus_packs', 'premium_themes', 'private_tournaments',
] as const;

// A compile-time guarantee that the Premium set and the free set together cover
// every known capability, so a newly-added capability can't be silently dropped
// from both the invariant docs and the preview UI.
const FREE_CAPABILITIES: readonly EntitlementCapability[] = [
  'daily_ranked_brew', 'global_leaderboard', 'country_leaderboard', 'ranked_streaks',
  'basic_progress', 'share_cards', 'practice_access', 'unlimited_practice',
] as const;
const _coverage: Record<EntitlementCapability, true> = Object.fromEntries(
  [...FREE_CAPABILITIES, ...PREMIUM_CAPABILITIES].map((k) => [k, true]),
) as Record<EntitlementCapability, true>;
// Referenced so the exhaustiveness object is not tree-shaken away in dev builds.
export const ENTITLEMENT_CAPABILITY_COUNT = Object.keys(_coverage).length === ENTITLEMENT_CAPABILITIES.length
  ? ENTITLEMENT_CAPABILITIES.length
  : (() => { throw new Error('capability coverage mismatch'); })();

/**
 * The Premium PREVIEW catalogue — copy for the "coming later" surfaces. This is
 * marketing/education only: it explains planned value. It carries NO price,
 * product id, store identifier, or purchase action, and it never lists anything
 * that could touch ranked fairness.
 */
export interface PremiumBenefitPreview {
  capability: EntitlementCapability;
  title: string;
  blurb: string;
  /** True when this benefit is already available to everyone during beta. */
  includedInBeta: boolean;
}

export const PREMIUM_PREVIEW: readonly PremiumBenefitPreview[] = [
  {
    capability: 'unlimited_practice',
    title: 'Unlimited Practice',
    blurb: 'Play as many fresh, unranked Practice Brews as you like. Included for everyone during beta.',
    includedInBeta: true,
  },
  {
    capability: 'archives',
    title: 'Brew Archive',
    blurb: 'Revisit and replay past daily packs as unranked practice.',
    includedInBeta: false,
  },
  {
    capability: 'category_training',
    title: 'Category Training',
    blurb: 'Focused, unranked drills in a single category — Observation, Logic, and the rest.',
    includedInBeta: false,
  },
  {
    capability: 'difficulty_selection',
    title: 'Choose Your Difficulty',
    blurb: 'Pick an easier or harder practice set to match how you feel today.',
    includedInBeta: false,
  },
  {
    capability: 'advanced_practice_stats',
    title: 'Deeper Practice Insights',
    blurb: 'Richer breakdowns of your unranked practice trends over time.',
    includedInBeta: false,
  },
  {
    capability: 'bonus_packs',
    title: 'Bonus Brews',
    blurb: 'Extra unranked puzzle packs beyond the daily ritual.',
    includedInBeta: false,
  },
  {
    capability: 'premium_themes',
    title: 'Cosmetic Themes',
    blurb: 'Optional visual themes. Purely cosmetic — never a gameplay edge.',
    includedInBeta: false,
  },
  {
    capability: 'private_tournaments',
    title: 'Private Tournaments',
    blurb: 'Run your own separate, invite-only brews. Never part of the global ranked ladder.',
    includedInBeta: false,
  },
] as const;

/**
 * The permanent ranked-fairness promise, stated for the UI. Kept here (next to
 * the catalogue) so the preview surface and the docs cannot drift apart. Premium
 * NEVER buys any of these.
 */
export const RANKED_FAIRNESS_PROMISE =
  'Premium will never provide extra ranked attempts, retries, score multipliers, ' +
  'higher leaderboard placement, or any competitive advantage. The daily ranked ' +
  'Brew is one attempt per day for everyone, forever.';
