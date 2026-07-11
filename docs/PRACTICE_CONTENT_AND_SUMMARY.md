# Practice Content Quality & Personal Practice Summary (Phase 7C)

Two things: (A) make Practice packs **genuinely reserve-only across all five
categories** by adding the missing Observation reserve, and (B) add a small,
clearly-separated **private Practice Summary**. Practice stays free and unlimited
during beta. No payments/subscriptions/paywalls.

Read [`RESERVE_BASED_PRACTICE.md`](RESERVE_BASED_PRACTICE.md),
[`CONTENT_PIPELINE.md`](CONTENT_PIPELINE.md),
[`PLAYER_PROGRESS_AND_STREAKS.md`](PLAYER_PROGRESS_AND_STREAKS.md), and
[`SHARE_CARDS_AND_PRACTICE.md`](SHARE_CARDS_AND_PRACTICE.md) first.

> **Deferred:** payments/subscriptions/paywalls/pricing/store products/entitlements,
> archives, category training, user-selected difficulty, friends, achievements,
> push, Apple Sign-In, AI generation, admin tooling, new engines.

---

## Part A — Reserve coverage

### Reserve audit (before)
`pattern 16, logic 16, language-logic 16, attention-speed 16, observation 0`
(each of the four non-Observation categories has 16 reserve; **Observation had
0** — all Observation puzzles were scheduled). Confirmed via `build-rows`.

### Reserve minimum & the fix
Target: **≥10 reserve per category** (met for four; Observation was the gap). We
authored **12 Observation reserve puzzles** through the canonical pipeline —
`OddOneOut (OBS_001)`, `RotationMatch (OBS_003)`, `PairFind (OBS_004)`, 4 each —
reusing proven glyph families / grid params so every one passes its engine's
deterministic validator. Difficulty spread: `1×d1, 2×d2, 4×d3, 4×d4, 1×d5`
(≈3 easy / 4 medium / 5 hard). Final reserve: `observation 12, others 16` (76
total).

### How the 50 daily packs stay byte-identical
The scheduler (`buildPacks`) draws from `LIBRARY` via `takeClosest`, so adding
puzzles to `LIBRARY` would shift the schedule. Instead the new puzzles live in a
**separate `RESERVE_OBSERVATION` set appended to `ALL_PUZZLES` only** — imported
and validated like any puzzle, but never drawn by the scheduler. New stable ids
(`obs1-r*`, `obs3-r*`, `obs4-r*`) never collide with scheduled ids. Result: the 50
packs and all content hashes are unchanged (parity: **✓ 50 packs match by hash, ✓
326 puzzles match by hash, ✓ reserve unscheduled on remote**). Import is
idempotent: `puzzle_validation_results ok=12 unchanged=314`.

New reserve went through the canonical path: authored in the content source →
builder → deterministic validator → approved → import → classified reserve (never
scheduled). No manual database-only puzzle creation.

### Reserve-only selection (no fallback)
Phase 7B allowed a soft fallback to broader approved content because Observation
reserve was empty. **Phase 7C makes selection reserve-only**: the eligible pool is
now a HARD `not in any daily_pack_slot` filter (still also excluding today's ranked
pack, still validator-passed/active-engine/supported-version). A category without
enough eligible reserve **fails with `practice_pool_exhausted`** and rolls the
whole start back — never a silent fall-through to scheduled/daily content. The
player sees calm copy: *"A fresh Practice Brew isn't available right now. Please try
again shortly."* Recent-exposure avoidance and engine rotation are unchanged.

### Reserve safety / lifecycle
Practice use never removes reserve status, publishes/schedules content, changes
approval/validation/content-hash, retires, or globally consumes a puzzle; a reserve
puzzle appears across many users' Practice. If reserve content is later promoted to
a ranked daily, the scheduler should avoid recently high-exposure Practice puzzles
where practical — **documented, deferred** to the AI/content-ops phase; the ranked
scheduler is not mutated now.

---

## Part B — Practice Summary

A **private, per-player** Practice summary + history, **derived on demand** from
`attempts where attempt_purpose='practice'` (no counter table) — mirroring the
ranked-progress derivation model, kept **completely separate** from ranked stats.
Available to any authenticated user (permanent **or** anonymous).

### Formulas (`get_my_practice_summary`)
- `practice_brews_completed`, `total_practice_puzzles`
- `average_score = round(avg(final_score),1)`, `best_score`, `latest_score`
- `average_solve_ms` = the average per-brew active solve time, computed **straight
  from `attempt_items`** (the ranked solve-time trigger can't join practice slots,
  so practice rows carry `total_solve_ms=0` — irrelevant here)
- `categories[]` = per category `average_points` (/20), `best_points`, `plays`
- `most_practiced_category`

No ranked field is ever included (no rank/percentile/streak/ranked-days/completion
rate), no cognitive/IQ/brain-age claims.

### History (`get_my_practice_history`)
Newest-first, **keyset-paginated on `completed_at`** (limit 20, cap 100). Rows:
`completed_at`, `score`, `total_solve_ms`, `selection_version`, and a per-category
points summary. No answers, ids, seeds, tokens, or private content.

### Privacy & security
`auth.uid()`-scoped, `authenticated`-only, `search_path` pinned, **no user
parameter** (no cross-user access/injection), no direct table writes, RLS on the
underlying tables. Recursive `PRACTICE_FORBIDDEN` client guard rejects `user_id`,
`attempt_id`, `email`, `token`, `seed`, `prompt`, `submitted_answer`,
`correct_answer`, `integrity_reason`, `provider`, `private_payload` at any depth.
Anonymous users read their own summary; unauthenticated is denied.

### Performance
Partial index `attempts_practice_completed_idx (user_id, completed_at desc) WHERE
attempt_purpose='practice' AND status='completed'` serves the summary/history
scans; category aggregation uses the existing `items_attempt_idx`. The Practice
summary loads **independently** of ranked Progress (its failure never hides ranked
data) and is cache-first in the session. No Realtime, no polling.

### UI
A clearly-separated **Practice · Unranked** section at the *bottom* of the Progress
screen (secondary to the ranked ritual): brews / avg / best / avg-time, and Practice
category performance bars. Labelled unranked, no mixing with ranked averages, no
fake comparison. Practice Results offer **View Practice Progress** (no ranked
comparison/streak/position; the BrewScore reveals first). 390/320 px, loading/empty/
error/refresh.

---

## Future entitlement boundary

`PracticeAccessPolicy` is the seam a future Premium tier plugs into. Future Premium
may include unlimited practice, archives, category training, advanced Practice
statistics, difficulty filters, bonus packs. Future Free: daily ranked Brew, limited
Practice, basic Practice Summary, leaderboards, ranked streaks, share cards. **No
limits or pricing are decided now. Extra ranked attempts are never sold.**

> **Phase 7D update.** The authoritative entitlement read
> (`get_my_entitlements`) now exists and, in cloud mode, drives
> `PracticeAccessPolicy` via `practiceAccessFromEntitlements`. Everyone is still
> on the `beta` policy (unlimited Practice); no `player_entitlements` table,
> pricing, or provider exists. See
> [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) and
> [`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md).

## Tests

- `npm run db:practice-test` — reserve-only selection (every category incl.
  Observation from reserve), lifecycle, isolation, reserve safety, exhaustion,
  mutation sentinels, EXPLAIN.
- `npm run db:practice-summary-test` — summary formulas (avg/best/latest/solve/
  category), empty player, history pagination, ranked exclusion, anonymous-own-data,
  unauthenticated-denied, no user param.
- `npm test` / `npm run db:import-check` / `npm run supabase:parity` — 326 puzzles,
  50 packs byte-identical, 76 reserve.
- `npm run cloud:practice-check` — deployed reserve-only practice + summary + history
  + isolation, isolated user.

## Practice under paywall modes (Phase 7E)

Practice access is now derived server-side from the release-policy mode ×
entitlement. In `beta_open` (production today) everyone keeps unlimited Practice.
In `sandbox_paywall` (isolated test users only) a non-Premium user is capped at
`practice_daily_allowance()` unranked brews/UTC-day (enforced in
`start_practice_pack`, client cannot override) and Premium is unlimited. Ranked is
never affected. See [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) and
[`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md).
