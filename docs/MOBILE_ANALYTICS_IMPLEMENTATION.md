# Mobile Analytics Implementation (Phase 7G)

How BrainBrew emits privacy-preserving client-behaviour events from the Expo app,
and the strict line between **client events** (UI behaviour) and **server
authoritative facts** (business outcomes).

Read [`ANALYTICS_EVENT_MODEL.md`](ANALYTICS_EVENT_MODEL.md) and
[`ANALYTICS_INGESTION_SECURITY.md`](ANALYTICS_INGESTION_SECURITY.md) first.

---

## 1. Authority boundary (non-negotiable)

Client events describe **UI behaviour only**. Authoritative outcomes are ALWAYS
derived from canonical tables, never from a client event:

| Never from events | Derived from |
| --- | --- |
| Ranked started/completed, scores, solve times | `attempts`, `attempt_items` |
| Leaderboard positions | ranked projection |
| Practice completed | `attempts` |
| Subscription active / revenue / refunds / entitlement | `player_entitlements`, RevenueCat sync |

The dashboard labels each number as **client behavioural event**, **server fact**,
or **aggregated KPI**.

## 2. Client service

[`src/cloud/analytics/analytics.ts`](../src/cloud/analytics/analytics.ts) — a pure,
unit-tested core; [`index.ts`](../src/cloud/analytics/index.ts) wires the transport.

- `AnalyticsService`: `track(event, opts)`, `trackScreen`, `setSessionContext`,
  `clearIdentityContext`, `flush`.
- In-memory queue, batch (10) auto-flush, bounded retry then drop, `maxQueue` cap
  (oldest dropped). **Analytics never blocks or throws into gameplay** — every
  method swallows errors.
- Event names are a typed allowlist; unknown names dropped client-side too.
  Forbidden property keys (answers/tokens/emails/geo/ad-ids) and nested objects are
  scrubbed before they leave the device.
- Dedup keys (`session:counter`) make a retry idempotent (the server dedups).
- **Local mode** uses a no-op transport (never networks). **User switch** calls
  `clearIdentityContext()` (queue + session reset).

## 3. Instrumented flows (this phase)

Wired now (fire-and-forget, single lines): `app_opened` + session context on
identity ready; `ranked_start_requested` / `practice_started` in the session
actions; `premium_preview_viewed` + `purchase_requested` in the premium hook.
Identity-change points clear analytics context.

The full taxonomy (screen views, funnel/share/offering steps) is defined and
allowlisted; remaining call sites are added incrementally — instrument meaningful
interactions only, never every button, and never double-count authoritative
completions.

## 4. Transport

Cloud mode posts small batches to the `analytics-ingest` Edge Function, which
derives the user from the verified JWT. Verified live: a valid `app_opened` is
accepted and a bogus event rejected, with exactly one row written for the
auth-derived user.

## 5. Context / dimensions

Each event carries platform (ios/android/web), app version, environment, and
optional screen/category/engine/attempt_purpose. **iOS/Android metrics come only
from these real device events — never inferred from web traffic.** App version is a
constant (`APP_VERSION`) kept in sync with `app.config.js`; wire it to
`expo-constants` when convenient.

## 6. Tests

`npm run test:cloud` covers the pure core: auto-flush at batch size, unknown-event
drop, forbidden/nested prop scrub, identity-reset clears queue, transport-failure
bounded-retry-then-drop, `track` never throws, `maxQueue` cap. See also
`npm run db:analytics-test` for the server ingest contract.
