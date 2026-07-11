# Subscription Lifecycle & State Mapping (Phase 7E)

How a RevenueCat subscriber state becomes a BrainBrew entitlement state, what each
state grants, and the safe, honest UX for each. The one rule that never bends:
**every state resolves `ranked_attempts_per_utc_day = 1`.**

Read [`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md) and
[`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) first.

---

## 1. States

`beta` · `free` · `premium` · `grace_period` · `billing_issue` · `expired` · `revoked`.

Only `beta` (open beta, no provider row) and provider-driven states occur in 7E.

## 2. Deterministic mapping (`_shared/entitlementMap.ts`)

After a webhook, the server fetches the authoritative subscriber and maps it once
(never from the raw event). Given the `brainbrew_premium` entitlement:

| Subscriber situation | State | is_active | will_renew |
| --- | --- | --- | --- |
| Active subscription (expires in future) | `premium` | true | true |
| Active **trial / intro** period | `premium` | true | true |
| Active but **unsubscribed** (cancel scheduled) | `premium` | true | false |
| Active but **billing issue** flagged | `billing_issue` | true | false |
| Expired but within **grace** window | `grace_period` | true | false |
| Expired, no grace | `expired` | false | false |
| **Refunded / revoked** | `revoked` | false | false |
| No entitlement present | `free` | false | false |

`premium`, `grace_period`, and `billing_issue` carry the **Premium capability**
(`entitlement_has_premium`). `expired`, `revoked`, `free` do not. Determined from
the entitlement's `expires_date` / `grace_period_expires_date` and the
subscription's `billing_issues_detected_at` / `refunded_at` — proven deterministic
in `npm run db:entitlement-map-test`.

## 3. Capability behavior by release-policy mode

`get_my_entitlements` combines the release policy mode with the state:

- **beta_open (production today):** everyone keeps `unlimited_practice = true`,
  regardless of state — no one is blocked. Premium purchasers additionally resolve
  `entitlement_state = premium` and see Premium status. The future Premium
  *feature* capabilities (archives, category training, …) stay `false` because
  those features are not built yet.
- **sandbox_paywall (isolated test users):** non-Premium → `unlimited_practice =
  false` and a small `free_practice_brews_per_period`; Premium → unlimited.
- **production_paywall:** defined, **not activated**.

Ranked capabilities are identical in every mode and state: **one attempt per UTC
day, always.**

## 4. Ordering & idempotency

`sync_player_entitlement` is idempotent by `latest_event_id` and rejects a stale
event (older `source_updated_at`) — so a delayed CANCELLATION can never clobber a
newer RENEWAL. The webhook is idempotent by RevenueCat event id.

## 5. User-facing messaging (Task 16)

Never expose provider internals. Safe copy:

| State | Message |
| --- | --- |
| premium (renewing) | "Premium active." |
| premium (cancel scheduled) | "Premium active — will not renew." |
| grace_period | "Your subscription is in a grace period." |
| billing_issue | "There may be an issue with your subscription. Manage it through your app store." |
| expired | "Premium has expired. Your scores and history are safe." |
| revoked/refunded | "Your subscription was refunded. Your scores and history are safe." |
| sync pending | "We're finalizing your access…" |
| store unavailable | "Subscriptions are managed in the BrainBrew mobile app." |

**No threats of data loss.** Ranked scores, streaks, and history remain fully
available after expiration/refund — only future Premium capability is affected.

## 6. Fairness across the lifecycle (verified)

`npm run db:revenuecat-test` and `npm run cloud:revenuecat-check` assert
`ranked_attempts_per_utc_day === 1` in beta, free, premium, grace_period,
billing_issue, expired, and revoked; that expiry/revocation removes Premium
capability while leaving ranked history untouched; and that no provider/customer/
product id leaks through the RPC.
