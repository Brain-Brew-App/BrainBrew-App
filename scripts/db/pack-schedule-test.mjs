/**
 * Pack-scheduling planner tests — `npm run db:pack-schedule-test`.
 *
 * Regression cover for the "Today's brew isn't ready" incident: the publisher was
 * pack-driven and kept re-confirming expired live packs at their old (immutable)
 * dates, so today never got covered while the script reported success. The planner
 * is now date-driven; these pin that behaviour.
 */

import { dateSequence, planSchedule } from './pack-schedule-plan.mjs';

let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

const TODAY = '2026-07-23';

// ── dateSequence ─────────────────────────────────────────────────────────────
{
  const s = dateSequence(null, 3, TODAY);
  ok('dateSequence defaults to today', s[0] === '2026-07-23' && s[1] === '2026-07-24' && s[2] === '2026-07-25');
  ok('dateSequence honours --start', dateSequence('2026-08-01', 2, TODAY)[0] === '2026-08-01');
  ok('dateSequence crosses a month boundary', dateSequence('2026-07-31', 2, TODAY)[1] === '2026-08-01');
  ok('dateSequence length matches n', dateSequence(null, 10, TODAY).length === 10);
}

// ── THE INCIDENT: expired live window, today uncovered ───────────────────────
{
  const want = dateSequence(null, 10, TODAY);                       // 07-23 … 08-01
  const expiredLive = ['2026-07-12','2026-07-13','2026-07-14','2026-07-15','2026-07-16',
                       '2026-07-17','2026-07-18','2026-07-19','2026-07-20','2026-07-21'];
  const approved = Array.from({ length: 40 }, (_, i) => `pack-${i + 11}`);
  const plan = planSchedule(want, expiredLive, approved);

  ok('expired-live dates do NOT count as covered', plan.covered.length === 0);
  ok('every wanted date is scheduled', plan.assignments.length === 10);
  ok('TODAY is the first date scheduled', plan.assignments[0].date === TODAY);
  ok('a fresh approved pack is used, not an expired live one', plan.assignments[0].packId === 'pack-11');
  ok('no expired live date is reused', !plan.assignments.some((a) => expiredLive.includes(a.date)));
}

// ── Idempotency: today already covered → nothing to do ───────────────────────
{
  const want = dateSequence(null, 5, TODAY);
  const plan = planSchedule(want, want, ['pack-99']);              // all 5 already live
  ok('fully-covered window schedules nothing', plan.assignments.length === 0 && plan.needDates.length === 0);
  ok('fully-covered window reports all covered', plan.covered.length === 5);
}

// ── Partial coverage: fill only the gaps, keep live ones ─────────────────────
{
  const want = dateSequence(null, 5, TODAY);                        // 23,24,25,26,27
  const live = ['2026-07-23', '2026-07-25'];                        // two already live
  const plan = planSchedule(want, live, ['a', 'b', 'c']);
  ok('partial coverage fills only the 3 gaps', plan.assignments.length === 3);
  ok('gaps are exactly the uncovered dates', plan.assignments.map((x) => x.date).join(',') === '2026-07-24,2026-07-26,2026-07-27');
  ok('already-live dates are never reassigned', !plan.assignments.some((a) => live.includes(a.date)));
}

// ── Shortfall: fewer approved packs than open dates ──────────────────────────
{
  const want = dateSequence(null, 5, TODAY);
  const plan = planSchedule(want, [], ['only-one']);
  ok('shortfall reported when inventory is short', plan.shortfall === 4);
  ok('shortfall still covers today first', plan.assignments.length === 1 && plan.assignments[0].date === TODAY);
}

for (const f of failures) console.error(`  ✕ ${f}`);
if (failures.length) { console.error(`\n✕ pack-schedule: ${failures.length} failed, ${passed} passed.`); process.exit(1); }
console.log(`✓ pack-schedule: ${passed} checks passed — date-driven planner, expired-window regression, idempotency, partial coverage, shortfall.`);
