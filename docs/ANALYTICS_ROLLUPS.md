# Analytics Rollups (Phase 7G)

Daily aggregate tables and the derivation strategy behind the historical
dashboard. **Rollups are derived from canonical tables**, idempotent, backfillable,
exclusion-aware, and UTC.

---

## 1. Strategy

- **Near-real-time** (live indexed queries): today's active users, ranked/practice
  completions, incidents, health, webhook failures, live-pack status.
- **Historical trends** (daily rollups): `analytics_user_daily`,
  `analytics_gameplay_daily`, `analytics_category_daily`.
- Every card shows a freshness label + last-updated time; a daily aggregate is
  never presented as "live".

## 2. Rollup functions

- `rebuild_analytics_day(day)` — recompute one UTC day and upsert (idempotent).
- `rebuild_analytics_rollups(from, to)` — backfill a range (≤ 400 days), idempotent.

Both are service-role only and **exclude flagged test/internal users**
(`analytics_subject_flags`). Re-running a day corrects it — verified for late-
arriving events and (by re-derivation) for ranked void/recalculation and
refund/revocation, since rollups read canonical `attempts`/`player_entitlements`
after those corrections land.

## 3. Scheduling

Run `rebuild_analytics_rollups(today-2, today)` on a schedule via **Supabase
pg_cron** or a scheduled Edge Function (server-side; never needs a browser). A
2-day trailing window absorbs late events. The admin **Gameplay** page also exposes
a Founder/Engineering "Refresh rollups" action (audited) for on-demand rebuilds.

> **Founder step:** schedule the cron once (SQL: `select cron.schedule('rollups',
> '15 0 * * *', $$select rebuild_analytics_rollups((now()::date - 2), now()::date)$$)`).
> Until then, rollups populate on demand via the admin action (verified live: a
> 31-day backfill produced 31 gameplay rows).

## 4. Tables

| Table | Grain | Source |
| --- | --- | --- |
| `analytics_user_daily` | day | auth.users + profiles + attempts |
| `analytics_gameplay_daily` | day | attempts (ranked/practice starts/completions, avg/median score) |
| `analytics_category_daily` | day × category | attempt_items + daily_pack_slots |

Only fields backed by real source data exist. **Platform split** and
**revenue $** are intentionally NOT in these tables yet (need mobile events / store
prices); the UI shows those as pending, never fabricated.

## 5. Retention & funnel

Computed live (not stored) from canonical attempts:

- `admin_retention(from, to)` — cohort = a user's **first Brew (ranked or Practice)
  start day**; D1/D3/D7/D14/D30 as retained-fraction. A horizon returns **null**
  until its window has fully elapsed (honest incompleteness).
- `admin_activation_funnel(from, to)` — users_created → profile_completed →
  ranked_started → ranked_completed (distinct users). UI-only earlier stages (CTA
  viewed) populate from events; shown as pending, never zero-as-fact.

## 6. Versioning & rebuild

Each rollup table carries `formula_version`; changing a formula bumps the version
and triggers a documented backfill. Everything is rebuildable from canonical
records — the rollups hold no independent source of truth.

## 7. Tested

`npm run db:analytics-test`: rollup correctness (exclusion-aware), idempotent
rerun, late-arrival correction, retention (elapsed value vs unelapsed null), funnel
counts. Verified live against the deployed project.
