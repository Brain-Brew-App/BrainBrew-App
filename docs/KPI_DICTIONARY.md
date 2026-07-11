# KPI Dictionary (Phase 7F)

The version-controlled source of truth for every dashboard metric. The admin UI
tooltips read the SAME definitions from [`apps/admin/lib/kpi.ts`](../apps/admin/lib/kpi.ts);
the SQL lives in `supabase/migrations/20260722091000_admin_kpis.sql`. If a formula
changes, change it in the migration **and** the registry together. **All dates are
UTC.** Version: 1.

| KPI | Formula | Numerator / Denominator | Source | Freshness | Caveats |
| --- | --- | --- | --- | --- | --- |
| Total users | `count(profiles)` | — | `profiles` | live | Includes anonymous. |
| Anonymous users | `count(profiles where account_type='anonymous')` | — | `profiles` | live | |
| Permanent users | `count(profiles where account_type='permanent')` | — | `profiles` | live | |
| New users (today/7d/30d) | `count(auth.users where created_at in window)` | — | `auth.users` | live | Auth creation, not profile completion. |
| DAU | distinct `user_id` with an attempt on the UTC day | — | `attempts` | live | Activity = started/completed a Brew, **not** a page open. |
| WAU | distinct `user_id` with an attempt in trailing 7 UTC days | — | `attempts` | live | |
| MAU | distinct `user_id` with an attempt in trailing 30 UTC days | — | `attempts` | live | |
| Stickiness | `DAU / MAU` | DAU / MAU | `attempts` | live | Ratio, shown as %. |
| Ranked players today | distinct `user_id` of ranked attempts created today | — | `attempts` | live | |
| Ranked Brews completed | `count(attempts where is_ranked and status='completed')` | — | `attempts` | live | Excludes practice by definition. |
| Ranked completion rate | completed / started ranked attempts in UTC range (by `created_at`) | completed / started | `attempts` | live | |
| Practice Brews completed | `count(attempts where attempt_purpose='practice' and status='completed')` | — | `attempts` | live | Never counted as ranked. |
| Average BrewScore | `avg(final_score)` over completed ranked attempts | Σscore / count | `attempts` | live | Ranked only. |
| Median BrewScore | `percentile_cont(0.5)` of `final_score`, completed ranked | — | `attempts` | live | |
| Active subscriptions | `count(player_entitlements where state ∈ {premium,grace_period,billing_issue})` | — | `player_entitlements` | live | Sandbox until public launch. |
| Trials | `count(player_entitlements where period_type='trial' and state='premium')` | — | `player_entitlements` | live | |
| Webhook errors | `count(revenuecat_webhook_events where status='error')` | — | `revenuecat_webhook_events` | live | Reconciliation health. |
| Category avg points | `avg(awarded_score)` per category over submitted items, completed attempts | — | `attempt_items`+`daily_pack_slots` | live | Ranked packs. |
| Category perfect rate | `count(awarded_score = slot.max_score) / count` per category | — | same | live | |
| **MRR / ARR / ARPPU / LTV** | subscription price rollups | — | RevenueCat + **store prices** | daily | **PENDING** — store price data not yet available; rendered as "pending", never faked. |

## Excluded from all metrics
Test users (a documented test-cohort exclusion should be added when a test flag
exists), invalidated ranked results (`status`/integrity), and duplicate RevenueCat
events (idempotency in `revenuecat_webhook_events`). Practice is always excluded
from ranked metrics. Voided-slot recalculations are reflected because metrics read
canonical `attempts`/`attempt_items` after recalculation.

## Retention / funnels / per-engine deep metrics
Defined in [`ANALYTICS_EVENT_MODEL.md`](ANALYTICS_EVENT_MODEL.md). They are
**pending** until the mobile app emits the server-side analytics events (or the
equivalent facts are derivable) — the dashboard shows an honest empty state rather
than a fabricated cohort.

## Phase 7G additions (now real)

- **Retention D1/D3/D7/D14/D30** — cohort = a user's first Brew (ranked or Practice)
  start day; value = distinct cohort users active on day cohort+N ÷ cohort size;
  null until the horizon elapses. Source `attempts` (UTC), exclusion-aware.
- **Activation funnel** — users_created → profile_completed → ranked_started →
  ranked_completed (distinct users). UI-only earlier stages pending mobile events.
- **Daily rollups** (`analytics_gameplay_daily` / `_user_daily` / `_category_daily`)
  — idempotent, backfillable, test-user-excluded derivations of the above.
- **Test-user exclusion** — all business KPIs exclude `analytics_subject_flags`
  where `exclude_from_business_kpis`.
