# Analytics Event Model (Phase 7F)

The trustworthy, privacy-preserving analytics foundation the dashboard's
retention/funnel/engine metrics depend on. **Principle: derive from canonical
records wherever possible; only emit an event for UI behaviour the database
cannot otherwise know.** Authoritative business outcomes (ranked completion,
revenue, entitlement changes) are NEVER trusted from the client — they are read
from `attempts`, `player_entitlements`, and the RevenueCat sync.

> **Status:** the model is specified here; the **mobile app does not yet emit
> these events**. Until it does, funnels/retention/engine-drilldowns show a
> pending state. This doc is the contract for that instrumentation.

---

## 1. Derived-first

| Fact | Derived from (no event needed) |
| --- | --- |
| Ranked started / completed | `attempts` (is_ranked, status, created_at, completed_at) |
| Practice started / completed | `attempts` (attempt_purpose='practice') |
| Puzzle-level outcomes | `attempt_items` (awarded_score, verdict) |
| New / anonymous / permanent user | `auth.users`, `profiles.account_type` |
| Entitlement / subscription changes | `player_entitlements`, `revenuecat_webhook_events` |
| DAU/WAU/MAU, completion rates, category stats | the KPI RPCs |

These require **no** client events and are already real in the dashboard.

## 2. Events worth emitting (client UI behaviour only)

An append-only `analytics_events` table (private, RLS, service-role writes via a
dedicated ingest RPC/Edge Function) for things the DB can't infer:

- App lifecycle: `app_opened`, `app_backgrounded`, `app_version_seen`, `platform_seen`
- Funnel UI: `home_viewed`, `results_viewed`, `leaderboard_viewed`, `share_requested`
- Premium UI: `premium_screen_viewed`, `offering_loaded`, `purchase_started`,
  `purchase_cancelled`, `restore_started` (the *outcome* — purchase_completed /
  entitlement_changed — is taken from the server sync, not the client)
- Operational: `edge_function_error`, `payload_validation_failed` (already partly
  server-side)

## 3. Dimensions (Task 6)

Every event/fact supports filtering by: platform (android/ios/web/all), app
version, country snapshot, date range (UTC), new-vs-returning, anonymous-vs-
permanent, and entitlement state. **iOS/Android metrics come only from real mobile
events — never inferred from Vercel web traffic.**

## 4. Privacy & retention (Task 5)

Collected: user UUID (internal), platform, app version, country snapshot,
engine/category, timestamp, duration, safe dimensions. **Never collected:** full
IP (indefinitely), contacts, GPS coordinates, advertising IDs, puzzle answers,
emails, provider tokens, payment-card data, raw Auth tokens.

Retention policy: raw events retained 90 days for operational debugging, then
rolled up into daily aggregates (`analytics_*_daily`) and the raw rows deleted.
A user-deletion request cascades (events keyed by UUID → deletable). IP is only
ever stored as a salted hash and only where legally appropriate, with a short TTL.

## 5. Aggregation strategy (Task 30)

- Current operational values → direct indexed queries / the KPI RPCs (live).
- Historical KPIs → daily rollup tables (`analytics_daily`,
  `analytics_category_daily`, `analytics_engine_daily`, `analytics_revenue_daily`,
  `analytics_platform_daily`) populated by an idempotent, rebuildable, backfillable
  scheduled job (pg_cron / Edge scheduled function). Late-arriving events and
  void/refund corrections re-run the affected day.
- Every card shows a freshness label (live / hourly / daily) + last-updated time.

These rollup tables are **specified, not yet created** — they are added in the
analytics build-out sub-phase once events flow.

---

## Phase 7G — implemented

The model above is now BUILT: `analytics_events` (append-only, allowlisted),
`ingest_analytics_events` RPC, the `analytics-ingest` Edge Function (user derived
from JWT), the client `AnalyticsService`, daily rollups, and retention/funnel RPCs.
Core flows are instrumented; the remaining event call-sites are added
incrementally. Authoritative outcomes stay derived from canonical tables. See
[`MOBILE_ANALYTICS_IMPLEMENTATION.md`](MOBILE_ANALYTICS_IMPLEMENTATION.md),
[`ANALYTICS_INGESTION_SECURITY.md`](ANALYTICS_INGESTION_SECURITY.md),
[`ANALYTICS_ROLLUPS.md`](ANALYTICS_ROLLUPS.md).
