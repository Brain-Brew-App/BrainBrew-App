/**
 * Pure pack-scheduling planner — extracted so it can be tested without a database.
 *
 * The bug this guards against: the old publisher was pack-driven. It selected the
 * first N packs by index and re-confirmed any already live. But a live pack is
 * pinned to its (possibly PAST) date and cannot move, so once the window expired the
 * script re-published yesterday forever and never covered today — while reporting
 * success. Founders saw "Today's brew isn't ready".
 *
 * The correct model is DATE-driven: for each date we want covered, if it has no live
 * pack, assign the next approved pack to it. Dates already live are left untouched.
 */

/** Consecutive UTC date strings, `n` of them, starting at `startIso` (or `todayIso`). */
export function dateSequence(startIso, n, todayIso) {
  const base = startIso ?? todayIso;
  const day0 = Date.parse(`${base}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(day0 + i * 86400000).toISOString().slice(0, 10));
}

/**
 * Decide which dates still need a pack, and which approved packs fill them.
 *
 * @param wantDates       dates we want covered (from dateSequence)
 * @param liveDates       dates that already have a live pack (immutable)
 * @param approvedPackIds approved, unscheduled pack ids in stable order
 * @returns { needDates, assignments: [{packId, date}], covered, shortfall }
 */
export function planSchedule(wantDates, liveDates, approvedPackIds) {
  const covered = new Set(liveDates);
  const needDates = wantDates.filter((d) => !covered.has(d));
  const assignments = [];
  for (let i = 0; i < needDates.length && i < approvedPackIds.length; i++) {
    assignments.push({ packId: approvedPackIds[i], date: needDates[i] });
  }
  return {
    needDates,
    assignments,
    covered: wantDates.filter((d) => covered.has(d)),
    shortfall: Math.max(0, needDates.length - approvedPackIds.length),
  };
}
