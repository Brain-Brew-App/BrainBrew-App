# Player Progress: Streaks, Daily History & Basic Statistics (Phase 6D)

BrainBrew's personal habit + progress foundation. A permanent player sees their
ranked-play streak, recent ranked history, basic lifetime statistics, per-category
performance, and a completion calendar — **derived entirely from canonical ranked
attempts** (Phase 6A). This milestone is personal progress only.

Read [`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md) and
[`DAILY_LEADERBOARDS.md`](DAILY_LEADERBOARDS.md) first.

> **Deferred (not built):** friends/friends-leaderboards, teams, multiplayer,
> tournaments, weekly/monthly/all-time competitive boards, achievements/badges,
> XP/levels, premium subscriptions/payments/paywalls, unlimited practice, puzzle
> archives/replay, push notifications, Apple Sign-In, provider unlinking. No
> cognitive-benefit / "brain age" / medical claims anywhere.

---

## 1. Data model — pure derivation (Approach A)

Progress is **derived on demand from `attempts` via read-only RPCs. There is NO
duplicated mutable counter table.** This is the simplest reliable model at current
scale and is:

- **idempotent / rebuildable by construction** — recomputing yields identical
  results; there is nothing to "rebuild";
- **always canonical** after any event — a void recalculation or an integrity
  invalidation changes the attempt row, and every statistic re-derives
  automatically on the next read;
- **impossible to drift** — no cached counter can fall out of sync.

`statistics_version` (currently `1`) versions the formulas. **Migration
threshold** to a derived `player_statistics` table: only if per-request derivation
over a single user's ranked history becomes too slow (very large per-user
history) — the client contract can stay identical.

Because everything derives from the attempt row, Task 11's "rebuild/recalculation
mechanism" is inherent: `recalculate_ranked_result` (Phase 6A/6C) fixes the
attempt after a void, and the next progress read reflects it — with no separate
rebuild step and no way to double-count.

---

## 2. Streak rules (all UTC)

A day counts toward the streak **iff** the user has a VALID ranked result for that
canonical UTC date: `is_ranked`, `status='completed'`, `integrity_status='clean'`
(one-per-day already enforced). The server — not the client — calculates streaks.

- **Practice never counts.** **Anonymous users get no streak.** A ranked
  completion counts once regardless of replays.
- **A content-side void (score recalculation) STILL counts** — the day stays; only
  the score changes.
- **An integrity invalidation removes the day** — `integrity_status <> 'clean'` is
  excluded everywhere.
- **Current streak** = the length of the consecutive-UTC-day run ending at the last
  valid day, **but only while that last day is today OR yesterday**. It breaks
  (→ 0) only once a full UTC day is missed (`last_ranked_date < today − 1`).
- **Best streak** = the longest consecutive-day run ever (gaps-and-islands).

Computed with the gaps-and-islands technique (`ranked_date − row_number()` groups
consecutive dates), so it is correct after app restart, a different-device sign-in,
late leaderboard calc, void recalculation, or a country/username change — none of
which touch the canonical `ranked_date` set.

### Today-incomplete semantics (Task 15)
If the player completed **yesterday** but **not yet today**, the current streak
**still shows yesterday's streak** — it does **not** drop to 0 at 00:00 UTC merely
because today isn't done. `today_completed` is a separate boolean. The date is
always **server-derived UTC** (the client omits `p_today`); BrainBrew has one
global UTC daily reset (documented trade-off — no device-local midnight authority).

Examples: completed Jul 10 + Jul 11 UTC → streak 2; missed Jul 12 → next completion
starts streak 1; practice on Jul 12 → no effect; void-recalc → day still counts;
invalidated → day removed; sign-in from another timezone → same UTC streak.

---

## 3. Statistics (formulas)

From the user's valid ranked days:

| Field | Definition |
|---|---|
| `current_streak` / `best_streak` | §2 |
| `ranked_days_completed` | count of valid ranked days |
| `latest_score` | score of the most recent valid ranked day |
| `best_score` | max BrewScore |
| `average_score` | `round(avg(final_score), 1)` |
| `average_solve_ms` | `round(avg(total_solve_ms))` |
| `perfect_scores` | count of `final_score = 100` |
| `lifetime_score_sum` / `total_solve_ms` | sums |

**No completion rate** is exposed — the platform cannot reliably know which days a
player *intended* to play, so a rate would be misleading. (If ever added, it will
be defined strictly as `completions / days-since-first-completion` and clearly
labeled.)

### Category statistics (V1)
Per category, from stored per-slot ranked results (`attempt_items` joined to
`daily_pack_slots.category`, submitted + non-void):
`average_points` (out of 20), `best_points`, `plays`, `perfect` (awarded = slot
max). No fabricated cross-engine precision, no accuracy blended across incompatible
engines, no "IQ"/"brain age"/cognitive claims.

---

## 4. History & calendar

- **`get_my_ranked_history(before, limit)`** — newest first, **keyset-paginated on
  `ranked_date`** (unique per user, so pages never dup/skip and no attempt id is
  exposed). Limit default 30, hard cap 100. Rows: `ranked_date`, `score`,
  `total_solve_ms`, `country_code`, `completed_at` (display-safe ISO),
  `updated_after_validation`, `result_version`, `status` (`'counted'`).
  **Invalidated days are EXCLUDED** (documented rule; they simply don't count).
- **Calendar** (inside `get_my_progress_detail`) — the completed UTC dates in a
  rolling window (default 35 days) plus `today`, `from_date`, and
  `first_ranked_date`. The client renders each day as **completed / updated /
  today-incomplete / missed / neutral** (days before `first_ranked_date` are
  neutral, not "missed"). Color-safe (a `✓`/`↻` mark, not colour alone),
  accessible labels, 390/320 px. No infinite calendar, no archive replay.

---

## 5. API contracts (RPCs)

Three read-only `SECURITY DEFINER` functions, `search_path=public,pg_temp`,
**`authenticated`-only**, gating anonymous callers to `{ locked: true }`
internally. The server derives the user (`auth.uid()`) and the UTC date; the
client sends **no user id** and **no date**.

- `get_my_progress_summary(p_today default utc-today) → jsonb` — the compact
  summary (Home / Results / Progress header).
- `get_my_progress_detail(p_days default 35, p_today default utc-today) → jsonb` —
  `{ categories[], calendar }`.
- `get_my_ranked_history(p_before default null, p_limit default 30) → jsonb` —
  `{ rows[], page_size, next_before, has_more }`.

Every response is validated client-side with a **recursive** forbidden-field guard
(`PROGRESS_FORBIDDEN`) before it reaches a screen — rejecting `user_id`,
`attempt_id`, `email`, `integrity_reason`, `token`, `provider`, `submitted_answer`,
`correct_answer`, etc.

---

## 6. Privacy & security

Personal progress is **private**:

- authenticated **permanent** user reads **only their own** data (`auth.uid()`);
- **anonymous**-Auth users get a locked/empty response; **unauthenticated** (anon
  publishable role) is **denied** (grants revoked);
- **no user-id parameter** anywhere → no cross-user access, no enumeration;
- no direct table access (`attempts` has no `authenticated` grant) and no direct
  writes; no emails/provider data, integrity reasons, answers, tokens, or
  anti-cheat signals in any payload;
- the public leaderboard projection is **not** reused for private history.

Advisor: **0 blocking findings.** The `authenticated_security_definer_function_executable`
WARNs are expected/reviewed (the RPCs must be DEFINER to read the RLS-protected
`attempts` table and are gated internally).

---

## 7. Indexes & query plans

One partial composite index, matching the real per-user filter + order:

```
attempts_user_valid_ranked_idx (user_id, ranked_date desc)
  WHERE is_ranked and status='completed' and integrity_status='clean'
```

`EXPLAIN` over a realistic fixture (2000 other users + one user with 300 ranked
days, `scripts/db/progress-test.mjs`): the newest-first history/streak query runs
as an **`Index Scan using attempts_user_valid_ranked_idx` with no Sort node**.
Category aggregation uses the existing `items_attempt_idx`. No speculative indexes.

---

## 8. UI

- **Progress screen** (cloud/permanent only) — current + best streak (gold accent
  only at a genuine milestone), today status, lifetime totals, category
  performance bars (avg /20), a completion calendar, recent BrewScores (paginated),
  and a link to Leaderboards. Loading skeleton, empty (first-time), error/retry,
  pull-to-refresh, 48 dp controls, 390/320 px.
- **Home** — a compact streak summary loads **after** the core Home/pack/ranked
  path (non-blocking, cache-first; Phase 6B fast first paint preserved), shown only
  when a streak exists. **View Progress**.
- **Results** — the BrewScore reveals first; the streak update and the leaderboard
  comparison load **independently** (either can fail without hiding the score).
  Copy is honest ("3-day ranked streak"), never "your brain is getting smarter".
  Practice Results never show or advance a streak.
- **Milestones** (3/7/14/30/50/100) — **derived from the streak value**, not
  separately awarded; a restrained gold accent/message only. No badges DB, no
  confetti, no blocking modal, no re-celebration on re-render (it's a static
  function of the value).
- **Local mode** — offline, unranked; the Progress affordance is not shown (no
  fabricated local streaks, no second local statistics system).

---

## 9. Tests

- `npm run db:progress-test` — streak semantics (first→1, consecutive, missed
  reset, best>current, today-incomplete/yesterday-complete retain, leap-year
  boundary), exclusions (practice/anonymous/invalidated), void-recalc retention,
  lifetime + category statistics, history/calendar, security (grants/roles/no
  cross-user/direct-access), idempotency, mutation sentinels, and an `EXPLAIN`.
- `npm run cloud:progress-check` — the same guarantees against the **deployed**
  RPCs with isolated permanent users (created + cleaned up).
- `npm run test:cloud` — the client contracts (summary/detail/history validators,
  recursive private-field rejection, `streakMilestone`).
