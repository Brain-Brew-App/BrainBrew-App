# RevenueCat Integration (Phase 7E)

BrainBrew's subscription provider integration: the purchase SDK on the client, the
canonical App User ID strategy, the authenticated webhook, the server-side
provider fetch, and the private database that becomes the single source of truth
for Premium. **No public billing launches in this phase** — the release policy
stays `beta_open`, everyone keeps unlimited Practice, and purchases are exercised
only in sandbox/Test Store.

Read [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md),
[`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md),
[`SUBSCRIPTION_LIFECYCLE.md`](SUBSCRIPTION_LIFECYCLE.md), and
[`STORE_SANDBOX_TESTING.md`](STORE_SANDBOX_TESTING.md).

> **Permanent fairness rule.** No product, entitlement, tier, promo, or grace
> period EVER changes ranked play. `ranked_attempts_per_utc_day` is a hard
> constant `1` in every state (SQL + client clamp + independent server
> enforcement). Premium never buys a ranked attempt, retry, score, weighting,
> timing, or eligibility change.

---

## 1. Project structure & identifiers

Configure these in the RevenueCat dashboard (Founder step — see §9):

| Concept | Identifier |
| --- | --- |
| Entitlement | `brainbrew_premium` |
| Offering | `default` |
| Product (monthly) | `brainbrew_premium_monthly` |
| Product (annual) | `brainbrew_premium_annual` |
| Package types | `$rc_monthly`, `$rc_annual` |

The entitlement id is also read server-side (`REVENUECAT_ENTITLEMENT_ID`, default
`brainbrew_premium`) and client-side (`PREMIUM_ENTITLEMENT_ID` in
[`platform.ts`](../src/cloud/revenuecat/platform.ts)). Final **prices are set in
App Store Connect / Google Play** and surfaced by the SDK as localized strings —
never hardcoded here. Price points are a Founder decision, deliberately not made
in this phase.

## 2. App User ID strategy (Task 4)

**RevenueCat's App User ID is the Supabase Auth UUID** — the same canonical player
identity used everywhere else (see [`PLAYER_IDENTITY_AND_PROFILES.md`](PLAYER_IDENTITY_AND_PROFILES.md)).

- `RevenueCatService.configure(userId)` / `logIn(userId)` always pass
  `currentIdentity().userId`. We never let RevenueCat mint its own anonymous id
  when a Supabase UUID exists.
- An anonymous → permanent **upgrade keeps the same UUID**, so the RevenueCat
  customer identity carries over unchanged — no merge, no lost purchase.
- A user switch (`continueAsGuest`, `signOut`) calls `logOutOrSwitch()`, clearing
  the SDK identity and offering cache so User A's state never appears for User B.
- The install id, email, and username are **never** the App User ID.
- The webhook validates that the incoming App User ID is a real Auth UUID and that
  the user exists; anything else is **quarantined**, never attached to an
  arbitrary account.

## 3. Client SDK architecture

Platform-safe by construction (Task 3). Screens never touch the SDK — they call
`RevenueCatService`.

| Module | Role |
| --- | --- |
| [`revenuecat/types.ts`](../src/cloud/revenuecat/types.ts) | Client-safe contracts (no receipts/ids/prices-computed). |
| [`revenuecat/offerings.ts`](../src/cloud/revenuecat/offerings.ts) | Pure offering/package mapping + validation; truthful savings only. |
| [`revenuecat/adapter.ts`](../src/cloud/revenuecat/adapter.ts) | The SDK seam (pure interface) — lets the service be fully unit-tested. |
| [`revenuecat/nativeAdapter.ts`](../src/cloud/revenuecat/nativeAdapter.ts) | Real adapter; **dynamic-imports** `react-native-purchases` (kept out of web/Node). |
| [`revenuecat/platform.ts`](../src/cloud/revenuecat/platform.ts) | Capability detection + PUBLIC SDK keys (iOS/Android only). |
| [`revenuecat/service.ts`](../src/cloud/revenuecat/service.ts) | `RevenueCatService`: single-init, single-flight purchase, identity continuity, error normalization. |
| [`revenuecat/index.ts`](../src/cloud/revenuecat/index.ts) | Default wiring; returns null on web / Expo Go / missing key. |
| [`revenuecat/usePremium.ts`](../src/cloud/revenuecat/usePremium.ts) | Screen controller; purchase → bounded "finalizing" server-sync poll. |

**Web / Expo Go:** `purchasesCapability()` is unsupported, `getRevenueCatService()`
returns null, and the Premium screen shows a calm "managed in the mobile app"
state — never a broken purchase button. The web bundle builds clean (the native
module is only dynamically imported, never executed).

**Authority boundary:** the SDK's customer info drives fast UI, but a protected
server feature is unlocked ONLY by the server's synchronized
`get_my_entitlements`. After a successful purchase the client shows *Finalizing
access…* and polls the server (webhook → sync) before treating the player as
Premium.

## 4. Webhook (Task 8)

[`supabase/functions/revenuecat-webhook`](../supabase/functions/revenuecat-webhook/index.ts):

1. Authenticates the RevenueCat `Authorization` header against
   `REVENUECAT_WEBHOOK_AUTH` (constant-time compare). Missing/wrong → 401.
2. Size-limits (64 KB) and validates JSON.
3. **Idempotency** by RevenueCat event id (`claim_webhook_event`); a duplicate
   delivery is a 200 no-op; a previously-errored event is re-claimable so retries
   work.
4. Requires the App User ID to be a valid Auth UUID, else quarantines.
5. **Fetches the authoritative subscriber state** from RevenueCat (never trusts
   the event body) via [`_shared/revenuecat.ts`](../supabase/functions/_shared/revenuecat.ts).
6. Maps it once ([`_shared/entitlementMap.ts`](../supabase/functions/_shared/entitlementMap.ts))
   and upserts transactionally via `sync_player_entitlement` (out-of-order-safe).
7. Records a safe event status (no payload, no personal data).

Deployed with `--no-verify-jwt` (RevenueCat sends no Supabase JWT) and gated
entirely by its own secret. Returns 500 on internal failure so RevenueCat retries.

## 5. Provider server API boundary (Task 9)

The RevenueCat **secret REST key** is used ONLY inside the Edge runtime
(`REVENUECAT_SECRET_API_KEY`), never in the client, DB, logs, git, or tests.
`fetchSubscriber()` applies an 8 s timeout, validates the response, redacts errors,
and distinguishes "customer has no entitlement" (treated as free) from "provider
call failed" (throws, so a transient outage never silently downgrades a payer). It
is mocked in every local test.

## 6. Database model

See [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) §5 and
[`DATABASE_FOUNDATION.md`](DATABASE_FOUNDATION.md). Private `player_entitlements`
(one canonical row/user, RLS-enabled no policies), `revenuecat_webhook_events`
(idempotency + audit, hashed fingerprint only), and the `release_policy` switch.
No receipts, tokens, cards, secrets, or public customer ids are ever stored.

## 7. Secrets (names only — never values)

| Secret | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | app / EAS env | PUBLIC Android SDK key |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | app / EAS env | PUBLIC iOS SDK key |
| `REVENUECAT_SECRET_API_KEY` | Supabase Function secret | REST secret for subscriber fetch |
| `REVENUECAT_WEBHOOK_AUTH` | Supabase Function secret + RC dashboard | shared webhook auth secret |
| `REVENUECAT_ENTITLEMENT_ID` | Supabase Function secret (optional) | defaults to `brainbrew_premium` |

Set the Function secrets with `supabase secrets set NAME=… ` (never printed).

## 8. Release policy & rollback

`release_policy.mode` ∈ `beta_open` (current, everyone keeps Practice) ·
`sandbox_paywall` (isolated test users only) · `production_paywall` (defined, NOT
activated). Flip only via the service-role `set_release_policy(mode)` RPC — never
inferred from build type, never client-controllable. **Rollback / kill-switch:**
set the mode back to `beta_open` to instantly restore full access for everyone;
Premium purchasers still show Premium, non-purchasers are never blocked.

## 9. Founder dashboard checklist (required, not automatable here)

1. Create the RevenueCat project; add an **Android app** (package `com.brainbrew.app`,
   Play service-account credentials) and later an **iOS app** (bundle
   `com.brainbrew.app`, App Store Connect key).
2. Create entitlement `brainbrew_premium`, offering `default`, products
   `brainbrew_premium_monthly` / `_annual`, attach to the offering as
   `$rc_monthly` / `$rc_annual`.
3. Copy the **public** SDK keys → EAS env `EXPO_PUBLIC_REVENUECAT_*`.
4. Copy the **secret** REST key → `supabase secrets set REVENUECAT_SECRET_API_KEY=…`.
5. Create a strong random webhook secret → `supabase secrets set REVENUECAT_WEBHOOK_AUTH=…`
   AND paste the same value as the Authorization header in RevenueCat →
   Integrations → Webhooks, pointing at
   `https://<project>.supabase.co/functions/v1/revenuecat-webhook`.
6. Configure the RevenueCat **transfer behavior** to "keep with original App User
   ID" so a store account cannot silently move a purchase between BrainBrew users.
7. Verify with `npm run cloud:revenuecat-check`, then the device flow in
   [`STORE_SANDBOX_TESTING.md`](STORE_SANDBOX_TESTING.md).
