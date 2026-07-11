# Ranked Daily Attempts (Phase 6A)

One secure, server-authoritative **BrewScore per eligible permanent player per
UTC date**. This is the foundation ranked play is built on — *not* leaderboards.
There are no ranks, percentiles, streaks, friends, or comparisons in this phase.
A single, immutable, fairly-computed result, bound to a real authenticated
identity and to the canonical pack for the day, ready for a future leaderboard to
read without a schema redesign.

Read [`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md) (the
secure gameplay path this extends), [`PLAYER_IDENTITY_AND_PROFILES.md`](PLAYER_IDENTITY_AND_PROFILES.md)
(accounts and profiles), and [`CORE_SPEC.md`](CORE_SPEC.md) §8–§10 first.

> **Not in this phase:** leaderboard UI/rankings, streaks, statistics, friends,
> teams, multiplayer, Apple Sign-In, Google unlinking, subscriptions, or new
> content. Ranked play produces a result; it does not yet display standings.
>
> **Phase 6C update.** These valid ranked results now feed daily Global & Country
> leaderboards — see [`DAILY_LEADERBOARDS.md`](DAILY_LEADERBOARDS.md). 6C added a
> stored `attempts.total_solve_ms` (the ranking tie-break, maintained by a
> completion trigger and by `recalculate_ranked_result`) and two composite partial
> indexes; the ranked lifecycle, eligibility, and immutability rules here are
> unchanged.
>
> **Phase 6D update.** The same valid ranked results also drive per-player
> **streaks, daily history & basic statistics** — see
> [`PLAYER_PROGRESS_AND_STREAKS.md`](PLAYER_PROGRESS_AND_STREAKS.md). Progress is
> derived on demand from `attempts` (no counter table): a void recalculation keeps
> the streak day, an integrity invalidation removes it, and everything re-derives
> automatically. No schema change to the ranked records themselves.
>
> **Phase 7A update.** `attempts.attempt_purpose` (`ranked`/`practice`/`guest`,
> server-derived by trigger) distinguishes unranked **Practice Brews** from guest
> attempts — see [`SHARE_CARDS_AND_PRACTICE.md`](SHARE_CARDS_AND_PRACTICE.md).
> Ranked isolation still rests on `is_ranked`: practice never enters this doc's
> surfaces, never satisfies the one-per-day index, and can't be marked ranked by a
> client. **No extra ranked attempt is ever sold or granted.**

---

## 1. What "ranked" means here

A ranked BrewScore is one that:

1. **Is server-authoritative.** The client never sets `is_ranked`, the score, the
   country, the username, the date, or the eligibility. It *requests* ranked
   play; the server decides everything.
2. **Is bound to a permanent authenticated user.** Anonymous/guest sessions are
   never ranked.
3. **Is bound to the canonical live pack for that UTC date.** Not a client-chosen
   date, not yesterday's pack.
4. **Is computed from the player's first valid ranked attempt** — one per day,
   enforced by the database, not the UI.
5. **Is immutable once completed**, except a documented puzzle-void
   recalculation.
6. **Is safe for a future leaderboard** — a projection view exposes only
   non-sensitive fields.

The database — not the UI — enforces all of this.

---

## 2. Eligibility

`check_rank_eligibility(user, app_version, today)` is the single source of truth,
used by both the Home status RPC and the ranked-start flow. It returns a
non-sensitive JSON shape and one **reason code**, evaluated in this precedence:

| Reason | Meaning |
|--------|---------|
| `anonymous_account` | Not signed in, or the profile is not `permanent`. |
| `incomplete_profile` | No username / onboarding not complete. |
| `invalid_country` | Country unset or not an active country. |
| `integrity_restricted` | A live `rank_restricted_until` restriction. |
| `unsupported_app_version` | Reported app version below the server minimum. |
| `no_live_pack` | No live pack published for today (UTC). |
| `ranked_attempt_exists` | A ranked attempt is already in progress today. |
| `ranked_attempt_completed` | Today's ranked brew is already finished (locked). |
| `eligible` | Clear to start today's ranked brew. |

The reason is precedence-ordered: the *first* failing gate wins, so e.g. an
incomplete profile reports `incomplete_profile` even with no live pack.

The app version is **advisory** — there is no other way to learn the client's
version — but the *threshold* (`app_version_ok`, minimum `1.0.0`) is the server's.
A `null` version is not blocked (it is treated as unknown, not old).

**Client exposure.** Clients call `get_today_player_status(app_version)`, which is
scoped to `auth.uid()` and granted to `authenticated`. The raw
`check_rank_eligibility(uuid, …)` takes an arbitrary user id and is **service_role
only** — a client cannot read another user's ranked status.

---

## 3. The attempt lifecycle

```
                          ┌──────────────── get_today_player_status ───────────────┐
                          │  (Home reads eligibility + today's ranked state)        │
                          ▼                                                          │
   eligible ──▶ start-daily-attempt (intent:'ranked')                               │
                          │                                                          │
     ┌────────────────────┼─────────────────────────┐                               │
     ▼                    ▼                          ▼                               │
  status:'active'    status:'active'            status:'completed'                   │
  (fresh reserve)    (resume in progress)       (locked; no new attempt)            │
     │                    │                          │                               │
     ▼                    ▼                          ▼                               │
  open → submit ×5 (server-timed, server-scored)   show locked BrewScore ───────────┘
     │
     ▼
  complete-attempt → normalized ranked BrewScore (immutable)
     │
     ▼
  replay → UNRANKED practice only (restartSession)
```

- **One active attempt.** A DB partial unique index
  `attempts_one_ranked_per_day (user_id, ranked_date) WHERE is_ranked` makes the
  reservation atomic. Two concurrent starts can never create two ranked rows — the
  loser catches the unique violation (`ranked_conflict`, HTTP 409) and *resumes*
  the winner's attempt.
- **Secure resume.** `start-daily-attempt` re-issued for an in-progress attempt
  returns the *same* attempt with `resumePosition` (the next unopened slot) and
  `completedPositions` (already-scored slots). Cross-device resume returns the
  same attempt because the authority is the DB row keyed by
  `(user_id, ranked_date)`, not any client state. There is **no score-improvement
  loophole**: earlier slots are already scored server-side and can't be reopened
  (`already_submitted`), and completing is idempotent.
- **Expiry grants no retries.** An expired attempt token is rejected
  (`invalid_token:expired`); the ranked row still occupies the day's slot, so no
  second ranked attempt can be started.

---

## 4. Country snapshot

At ranked start the server snapshots the player's country into
`attempts.country_code_snapshot` (immutable via the terminal trigger). Changing
your live profile country afterwards **cannot** rewrite a completed ranked
result's country. To reduce country-hopping before leaderboards, `set_country`
enforces a **7-day cooldown** on *changing* to a different country (the first set
during onboarding is free; re-setting the same code is a no-op).

---

## 5. Scoring and normalization

Ranked scoring reuses the server-authoritative scorer. The only difference is the
denominator:

- At start, `active_denominator` = the sum of `max_score` over the pack's
  **non-void** slots (100 for a full five-slot pack).
- The final ranked BrewScore is `round(100 × Σ awarded / active_denominator)`,
  clamped to 100. Practice/guest attempts always use the full 100 base.

This means a pack that already had a void slot at start still normalizes to a
fair 100-point scale.

---

## 6. Puzzle-void recalculation

If a puzzle is voided *after* ranked results exist,
`recalculate_ranked_result(attempt_id)` (service_role only) re-derives the score:

- New denominator = Σ `max_score` over currently non-void slots.
- New sum = Σ `awarded_score` over submitted items on non-void slots.
- New score = `round(100 × sum / denom)`, clamped.
- **All slots void → 0 over a safe denominator of 100** (no divide-by-zero).
- **Idempotent:** it writes (and bumps `recalc_version`) only when the score
  actually changes. Re-running it is a no-op.

The completed-score immutability trigger permits a score change *only* when
`recalc_version` increases — so this documented path is the single way a locked
ranked score can move, and nothing else (not even service_role via a stray
UPDATE) can silently rewrite it.

The original per-slot results are preserved for audit; recalculation only changes
the normalized total and the denominator.

---

## 7. The leaderboard-ready projection

`ranked_result_projection` (service_role only) is the view a future leaderboard
builds on **without a schema redesign**. It exposes only valid, completed, clean
ranked results and only non-sensitive fields:

`attempt_id, user_id, username_snapshot, country_code_snapshot, ranked_date,
brewscore, completed_at, integrity_status, result_version, total_solve_ms`.

It carries **no** answers, tokens, integrity reasons, email, or private profile
fields, and excludes `review`/`invalidated` results.

---

## 8. Integrity / anti-abuse foundation

`attempts.integrity_status` is a `ranked_integrity` enum: `clean` (default),
`review`, `invalidated`. Profiles carry server-controlled, private
`rank_restricted_until` (a restriction window that makes a user
`integrity_restricted`). These are the hooks a later phase's abuse tooling flips;
this phase ships the states and the private reasons, not an automated detector.
Integrity reasons are never exposed to clients or in the projection.

---

## 9. What the client can NOT do

The server never trusts the client for any of these — each is derived or verified
server-side:

- client UTC date → server uses `now() at time zone 'utc'`
- client country → snapshotted from the verified profile at start
- client username → snapshotted from the verified profile at start
- client `is_ranked` → the server sets it; `intent:'ranked'` is only a *request*
- client score → computed from raw submissions on the server
- client elapsed time → measured server-side (open → submit)
- client completion state → the DB attempt row is authority
- client eligibility → `check_rank_eligibility` decides

RLS/grants: ranked rows are **not client-writable** (no update grant on
`attempts`; the terminal trigger blocks tampering). The projection and the
privileged functions (`recalculate_ranked_result`, raw `check_rank_eligibility`)
are service_role only.

---

## 10. Client flow (cloud mode)

- `getTodayPlayerStatus()` → `TodayStatus.ranked` drives Home: **Start Today's
  Ranked Brew** (eligible), **Continue Ranked Brew** (in progress), a locked
  BrewScore card (completed), or practice-only (ineligible), plus a **Play for
  practice** affordance. No ranks, percentiles, or competitors are shown.
- `startSession({ ranked: true })` → the discriminated union
  (`active` | `completed` | `ineligible`). `active` opens `resumePosition`;
  `completed` shows the locked score; `ineligible` surfaces a player-safe
  `ranked_ineligible` message.
- The session state machine's `RESUME` event seeds server-scored slots so a
  resumed attempt still reaches completion at five results; the authoritative
  per-slot results come from `complete-attempt`.
- **Replay is always unranked practice** (`restartSession`) — even after a ranked
  completion. Local mode is unchanged: offline, deterministic, never ranked.

Every server response is validated at runtime (`src/cloud/validate.ts`),
including a recursive answer-leak guard, before it reaches a screen.

---

## 11. Schema summary

`attempts` (ranked columns): `is_ranked`, `ranked_date`,
`country_code_snapshot` → `countries(code)`, `username_snapshot`,
`active_denominator`, `scoring_version`, `content_hash_snapshot`,
`integrity_status`, `recalc_version`, `invalidated_at`, `invalidation_reason`.

Constraints/indexes:
- `ranked_requires_fields` — a ranked row must carry `user_id`, `ranked_date`,
  and `country_code_snapshot`.
- `attempts_one_ranked_per_day` — the one-per-user-per-date partial unique index.
- `enforce_attempt_terminal` — ranked identity immutable; score final unless
  `recalc_version` increases; a completed attempt can't be reopened.

`profiles` (added): `rank_status`/`integrity` fields, `rank_restricted_until`,
`username_changed_at`, `country_changed_at` (all server-controlled, private).

---

## 12. Functions

| Function | Role | Purpose |
|----------|------|---------|
| `app_version_ok(text)` | authenticated, service_role | Version threshold. |
| `check_rank_eligibility(uuid, text, date)` | **service_role only** | The eligibility contract. |
| `get_today_player_status(text)` | authenticated | `auth.uid()`-scoped Home status. |
| `is_rank_eligible(uuid)` | authenticated, service_role | Boolean wrapper (delegates). |
| `recalculate_ranked_result(uuid)` | **service_role only** | Idempotent void recalc. |
| `set_country(text, bool)` / `set_username(text)` | authenticated | Snapshot-safe change tracking + cooldown. |
| `ranked_result_projection` (view) | **service_role only** | Future-leaderboard-ready results. |

Edge Function: `start-attempt` dispatches `intent:'ranked'` →
`startDailyAttempt` (in `_shared/gameplay.ts`); the unranked path is unchanged.

---

## 13. Tests

- `npm run db:ranked-test` — the eligibility reason matrix (in precedence order),
  ranked identity/score immutability (mutation-tested at the trigger level), the
  one-per-day unique index, void recalculation edges (all-void → 0, idempotent,
  refusal), the country-change cooldown, and RLS/grants on the projection and
  privileged functions.
- `npm run db:gameplay-sim` — the full ranked flow end-to-end against real
  content: eligible start → country/username/denominator snapshot → play five →
  ranked complete (normalized) → one-per-day lock → practice replay → country
  snapshot immutable → completed-score immutable → survivor renormalization on
  void.
- `npm run test:cloud` — client validation (ranked start union, player status,
  ranked complete), the `RESUME` state-machine path, and `ranked_ineligible` copy.

---

## 14. Deploy runbook

1. `npm test && npm run test:cloud && npm run db:ranked-test && npm run db:gameplay-sim && npm run db:auth-test && npm run db:test` — all green locally.
2. `npm run supabase:push` — applies the two ranked migrations.
3. `npm run supabase:deploy-functions` — redeploys `start-attempt` (ranked
   dispatch) and `complete-attempt` (ranked normalization).
4. `npm run supabase:types` — regenerate types (picks up
   `get_today_player_status`); then `npx tsc --noEmit`.
5. `npm run supabase:advisors` — **0 blocking security** findings. (One new INFO
   note: `attempts_country_code_snapshot_fkey` is uncovered — consistent with the
   repo's existing INFO-level unindexed-FK notes on tiny lookup tables; not worth
   an index on the ~200-row `countries` table.)
6. Live verification with **isolated test users** and **rollback-safe fixtures** —
   never void canonical production content for testing.

---

## Entitlements & fairness (Phase 7D)

The one-ranked-attempt-per-UTC-day rule is now also a formal **fairness invariant**
of the entitlement foundation. `get_my_entitlements` returns
`limits.ranked_attempts_per_utc_day = 1` as a hard constant (never derived from
state), the client clamps any wire value to `1`, and no capability maps to a ranked
lever — so **Premium can never buy an extra ranked attempt, retry, or advantage.**
The ranked limit here is enforced independently and remains the authority; the
entitlement value is a mirror, not a source. See
[`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) and
[`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md).

## Subscriptions never touch ranked (Phase 7E)

RevenueCat, products, entitlement states, tiers, promos, and grace periods have
**zero** effect on ranked play. `get_my_entitlements` returns
`ranked_attempts_per_utc_day = 1` for beta, free, premium, trial, grace_period,
billing_issue, expired, revoked, and refunded alike — verified in
`db:revenuecat-test`, `db:entitlement-map-test`, and `cloud:revenuecat-check`. The
daily-attempt enforcement here remains the independent authority. See
[`SUBSCRIPTION_LIFECYCLE.md`](SUBSCRIPTION_LIFECYCLE.md).
