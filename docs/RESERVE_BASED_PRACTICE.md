# Reserve-Based Practice Packs (Phase 7B)

Fresh, unranked **Practice Brews** built from approved **reserve** content, replacing
the "replay today's pack" practice of Phase 7A. A Practice Brew is five puzzles in
the fixed BrainBrew rhythm, server-selected and server-scored, never today's ranked
puzzles, and fully isolated from every ranked surface. No payments or paywalls are
built in this phase.

Read [`SHARE_CARDS_AND_PRACTICE.md`](SHARE_CARDS_AND_PRACTICE.md),
[`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md),
[`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md), and
[`CONTENT_PIPELINE.md`](CONTENT_PIPELINE.md) first.

> **Deferred (not built):** subscriptions/payments/paywalls/entitlements-for-money,
> archives, category training, user-selectable difficulty, friends, achievements,
> push, Apple Sign-In, AI generation, admin tooling, new engines, large content.

---

## 1. Policy (V1, beta)

- **Unlimited** unranked Practice Brews during beta (a documented temporary
  benefit — `PracticeAccessPolicy` is the presentation-only seam a future Premium
  tier plugs into; the **server** authorizes every practice start).
- Each Practice Brew = five puzzles, one per fixed category (Observation → Pattern
  → Logic → Language Logic → Attention Speed).
- The **server** selects the pack; the client never names puzzle ids.
- Practice is always unranked and never sells or grants an extra ranked attempt.

Free forever: daily ranked Brew, leaderboards, streaks, share cards, (beta)
practice. Future Premium: unlimited practice enforcement, archives, category
training, advanced statistics, bonus packs, themes. **Never** sold: ranked
attempts.

---

## 2. Data model

Practice packs are their **own** private, immutable snapshots — **not** `daily_packs`
rows (daily slots carry a GLOBAL `unique(puzzle_id)`; reserve puzzles must be
reusable across many practice packs and users).

- **`practice_packs`** — `id, user_id, created_at, selection_version, selection_seed,
  exclusion_date`.
- **`practice_pack_slots`** — `id, practice_pack_id, position (1..5), category,
  puzzle_id, engine_id, max_score`; unique `(pack,position)` and `(pack,puzzle)`;
  the fixed position↔category check; **immutable** (an update/delete trigger
  rejects changes once written).
- **`attempts.practice_pack_id`** (nullable FK) binds an unranked practice attempt
  to its pack; `pack_id` is now nullable (a practice attempt has no daily pack).
  `attempt_items.slot_id`'s daily-only FK is relaxed so an item can reference a
  daily **or** a practice slot — integrity holds because only the
  server-authoritative flow (service_role, no client write grant) inserts items.
- A partial unique index `attempts_one_active_practice (user_id) WHERE
  attempt_purpose='practice' AND status='active'` enforces one active practice at a
  time.

Both practice tables have **RLS enabled with no policies** → anon/authenticated
cannot read or write them; access is only through the SECURITY DEFINER functions.

---

## 3. Eligible pool & selection

`start_practice_pack(p_user_id, p_session_id, p_app_version)` (SECURITY DEFINER,
service_role only, called by the Edge Function which has verified the JWT):

**Hard constraints** — approved, validator-passed, active engine, supported
`min_app_version`, category-correct, **RESERVE (never scheduled into any daily
pack)**, and never today's ranked pack.

> **Phase 7C update.** Selection is now **reserve-only** for every category —
> Phase 7C added 12 approved Observation reserve puzzles (Observation reserve was
> 0), so the soft fallback to broader approved content is removed. An insufficient
> category now fails with `practice_pool_exhausted` (never scheduled content). It
> also added a private **Practice Summary**. See
> [`PRACTICE_CONTENT_AND_SUMMARY.md`](PRACTICE_CONTENT_AND_SUMMARY.md).

**Soft ordering** (deterministic, no `ORDER BY random()`): reserve first → not
recently shown to this user → engine rotation → a seeded hash tie-break
(`md5(puzzle_id||selection_seed)`). One puzzle per category via `DISTINCT ON`. The
selection runs as a single `INSERT … SELECT` (no temporary table — unsafe under
connection pooling); an insufficient pool for any category raises
`practice_pool_exhausted` and rolls the whole start back (never a short/invalid
pack). `selection_seed` + the immutable slots make each selection auditable.

**Recent-exposure window:** the puzzles/engines from the user's **last 5 practice
packs** (server-derived; no client history; rebuildable from canonical records; no
impact on ranked history). Repetition is allowed only when the eligible pool is too
small — we do not promise zero repetition forever.

---

## 4. Lifecycle & resume

- **One active practice at a time.** `start_practice_pack` returns the active
  attempt (with its five puzzles) if one is in progress, else selects a new pack.
- A refresh/resume returns the **same** pack (no new pack merely because the app
  refreshed); completed slots stay completed; the next slot is server-derived.
- After completion, a fresh start builds a **new** pack.
- Two rapid starts collapse (the resume check + the partial unique index).

## 5. Answer flow (reused, not forked)

Practice reuses the existing `open-puzzle` / `submit-answer` / `complete-attempt`
flow. The one change is **polymorphic slot resolution**: `resolveSlot` /
`resolveSlotPublic` read `practice_pack_slots` when the attempt has a
`practice_pack_id`, else `daily_pack_slots`. Same 15 engines, same scoring/timing
contracts, same explanation-after-submit, same answer secrecy. The attempt token
binds to the practice pack (`pid = practice_pack_id`) — a **ranked token can never
open a practice slot, or vice versa** (the pack refs differ). Practice completes
`is_ranked = false`, `attempt_purpose = 'practice'`.

## 6. Server functions

- Edge Function **`start-practice-attempt`** — verifies the user, calls
  `startPracticeAttempt` (→ `start_practice_pack`), issues the attempt token,
  returns the five sanitized puzzles (+ resume info). Never returns an answer.
- RPCs (service_role): `start_practice_pack`, `practice_pack_public` (the same
  render-safe row shape `get_public_pack` serves, re-sanitized at the edge via
  `toPublicPuzzle`).

---

## 7. Ranked isolation (verified)

Practice is `is_ranked = false`, so it is excluded from the global/country
leaderboard, `ranked_result_projection`, ranked daily uniqueness, streak/best-streak
/ranked-days, average ranked score, ranked history/calendar, ranked category stats,
the ranked score lock, and rank eligibility. Verified in `db:practice-test`,
`db:gameplay-sim`, and live (`cloud:practice-check`): after a Practice Brew the
ranked score, streak, and leaderboard total are unchanged, and the practice attempt
is absent from the projection.

## 8. Reserve-content safety (verified)

Practice never schedules, publishes, retires, re-approves, re-validates, or content-
hashes a puzzle; it never writes to `daily_pack_slots` or publishes a pack; the
daily scheduler output and remote content **parity** are unchanged. Reserve puzzles
used in practice stay reserve. Verified locally and by `npm run supabase:parity`.

## 9. Guest & local mode

Anonymous-Auth users may play Practice (always unranked; exposure tracked by their
Auth UUID; no ranked streak/history). Local mode is unchanged and offline: "practice"
there is just the local pack (no cloud/reserve, no Supabase, no fake ranked data).
The dev pack switcher is untouched.

## 10. Client & UX

- `CloudGameplayService.startPractice()` calls `start-practice-attempt`, validates
  the response (`validatePracticeStart`: five sanitized puzzles, fixed category
  order, no duplicate, no ranked flag, recursive answer-field guard), and plays via
  the shared open/submit/complete.
- Home (cloud) practice buttons and Results **"Play another Practice Brew"** start a
  fresh reserve pack. Copy is fresh-practice, not "replay": *"Practice Brews are
  fresh, unranked, and never affect your ranked score."*
- Practice Results show `PRACTICE BREW · UNRANKED`, the BrewScore, categories, solve
  time, Share, and Play-another — **no** rank/percentile/streak. The share card is
  labelled Practice Brew (unchanged from 7A).
- Failure (`practice_pool_exhausted`) shows a calm message and never affects the
  ranked result.

## 11. Future entitlement boundary

`PracticeAccessPolicy` is the product boundary a future Premium tier plugs into.
The **server** authorizes every practice start; the client decides nothing about
entitlement. No subscription tables, premium flags, or payment providers exist.

> **Phase 7D update.** In cloud mode `PracticeAccessPolicy` is now *derived from
> the server's entitlement contract* (`get_my_entitlements` →
> `practiceAccessFromEntitlements`), not a hard-coded presentation assumption;
> local mode uses the explicit `LOCAL_DEV_ENTITLEMENTS` policy. It remains a
> UI-affordance mapping — the server still authorizes the start. See
> [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md). The
> `start_practice_pack` contract can still later carry `allowed / reason /
> remaining_free_count / …` without a client change; no paywall exists.

## 12. Performance / indexes

`attempts_one_active_practice` (partial) serves the active-practice lookup — proven
by `EXPLAIN` in `db:practice-test` (Index Scan, no seqscan). `practice_slots_pack_idx`
and `practice_packs_user_idx` serve slot-by-pack and recent-exposure scans. Selection
uses stable, seeded ordering (no `ORDER BY random()` over a large table). No
Realtime, no polling. (INFO advisories: RLS-enabled-no-policy on the two practice
tables is by design; two unindexed reserve-slot FKs are accepted, consistent with
the repo's posture.)

## 13. Tests

- `npm run db:practice-test` — selection (five categories/order/no-dup, reserve
  preference, never today's ranked), resume + new-after-completion, recent-exposure
  avoidance, ranked isolation, reserve-content safety, security (service-role-only,
  immutable slots), pool exhaustion, mutation sentinels, EXPLAIN.
- `npm run db:gameplay-sim` — full secure practice play end-to-end (open/submit/
  complete via polymorphic slots), unranked, ranked-token cross-binding denied.
- `npm run cloud:practice-check` — the same against the **deployed** functions with
  an isolated user (score/streak/leaderboard unchanged, no answer leak, cross-user
  denied).
