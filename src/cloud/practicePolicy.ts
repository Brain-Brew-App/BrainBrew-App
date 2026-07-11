/**
 * Practice access policy (Phase 7A) — a PRESENTATION-ONLY entitlement boundary.
 *
 * There are NO payments, subscriptions, paywalls, or entitlement tables in this
 * phase. This is the seam a future Premium system plugs into; today it returns the
 * approved beta policy: **unlimited unranked Practice for everyone.** The server
 * remains the sole authority for any future *limited cloud* access — these client
 * values are for UI copy/affordances only and must never be trusted for access.
 *
 * The ranked daily Brew is always free and one-per-UTC-day. No user may ever buy
 * or receive an extra ranked attempt — Practice is always unranked.
 *
 * Future Premium (NOT built here): unlimited practice enforcement, archives,
 * category training, advanced statistics, bonus packs, themes, private tournaments.
 * Free forever: the daily ranked Brew, leaderboards, streaks, and the Share Card.
 */

import type { ValidEntitlements } from './validate';

export interface PracticeAccessPolicy {
  /** Can start a Practice Brew of today's pack right now. */
  canPlayTodayPractice: boolean;
  /** Can play unlimited practice (beta: true; a future free tier may cap this). */
  canPlayUnlimitedPractice: boolean;
  /** Deferred to Premium. */
  canAccessArchives: boolean;
  /** Deferred to Premium. */
  canPlayCategoryTraining: boolean;
  /** Remaining free practices; null = unlimited (beta). */
  remainingFreePracticeCount: number | null;
  /** True while unlimited practice is a temporary beta benefit. */
  betaUnlimited: boolean;
}

/**
 * The current, approved policy. Beta: unlimited unranked practice; Premium-only
 * capabilities are off. Screens read this for copy/affordances — never to grant
 * access to a limited cloud resource (the server would authorize that).
 */
export function currentPracticeAccess(): PracticeAccessPolicy {
  return {
    canPlayTodayPractice: true,
    canPlayUnlimitedPractice: true,
    canAccessArchives: false,
    canPlayCategoryTraining: false,
    remainingFreePracticeCount: null,
    betaUnlimited: true,
  };
}

/**
 * Phase 7D — derive the practice policy from the SERVER'S entitlement contract
 * (cloud mode). This replaces the presentation-only assumption in
 * `currentPracticeAccess()` with real, server-returned capabilities: the client
 * no longer *assumes* unlimited practice, it *reads* it. Local mode keeps using
 * `currentPracticeAccess()` (an explicit local policy, never a network call).
 *
 * Note this remains a UI-affordance mapping — the server still authorises every
 * practice start. Capabilities only decide what copy/affordances to show.
 */
export function practiceAccessFromEntitlements(ent: ValidEntitlements): PracticeAccessPolicy {
  if (ent.locked) {
    // No identity yet → show nothing as unlocked. The app authenticates
    // (anonymous) before play, so this is a transient, defensive state.
    return {
      canPlayTodayPractice: false,
      canPlayUnlimitedPractice: false,
      canAccessArchives: false,
      canPlayCategoryTraining: false,
      remainingFreePracticeCount: 0,
      betaUnlimited: false,
    };
  }
  const cap = ent.capabilities;
  return {
    canPlayTodayPractice: cap.practice_access,
    canPlayUnlimitedPractice: cap.unlimited_practice,
    canAccessArchives: cap.archives,
    canPlayCategoryTraining: cap.category_training,
    // Unlimited practice → null; otherwise whatever the server allocates.
    remainingFreePracticeCount: cap.unlimited_practice ? null : ent.freePracticeBrewsPerPeriod,
    betaUnlimited: ent.entitlementState === 'beta' && cap.unlimited_practice,
  };
}
