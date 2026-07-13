# Premium — RevenueCat Test Store certification run

Device: Samsung S21+ (`RFCR10H7A3K`) · package `com.brainbrew.app` · dev client
`versionCode 2` · `react-native-purchases@10.4.2` (native SDK 10.12.0) · Metro dev
bundle · live Supabase backend. Store separation + release gate:
[REVENUECAT_STORE_MODES.md](REVENUECAT_STORE_MODES.md).

## Status: **Test Store certification INCOMPLETE — one hop still blocked**

Everything works except the RevenueCat→server reconcile, which is blocked by an API
**key-version mismatch** (below). Everything downstream of it has been certified
against the real server.

## Certified on-device

| # | Check | Result |
|---|-------|--------|
| 1 | Test Store key only in ignored `.env`; absent from tracked source | ✅ |
| 2 | Store mode = `test_store`, key never logged | ✅ `[revenuecat] configured mode=test_store appUserIdPrefix=…` |
| 3 | Simulated store used, not Play Billing | ✅ `SimulatedStoreBillingAbstract` |
| 4 | App User ID == Supabase Auth UUID | ✅ |
| 5 | Offering `default` + `$rc_monthly` + `$rc_annual` | ✅ |
| 6 | Per-mode product validation | ✅ `mode=test_store offering=default monthly=monthly annual=yearly` |
| 7 | Store-provided prices (never hardcoded) | ✅ Monthly **US$9.99**, Annual **US$79.98** |
| 8 | Test Store purchase completes | ✅ `POST /v1/receipts 200` |
| 9 | **SDK success never unlocks Premium** | ✅ |
| 10 | UI enters **Finalizing access…**, buttons disabled | ✅ |
| 11 | Cancellation neutral; buttons recover | ✅ |
| 12 | Sync-delayed card ("not charged twice — do not buy again" + Retry Sync + Restore + support ref) | ✅ |
| 13 | **Server-confirmed Premium → "You're Premium"**, plan list replaced by Archives | ✅ |
| 14 | **Archives unlock**, historical `2026-07-12` pack listed | ✅ |
| 15 | Archive pack detail shows `ARCHIVE BREW · UNRANKED` | ✅ |
| 16 | Full 5-puzzle archive session, server-scored | ✅ `start-archive-attempt` → 5×`open-puzzle`/`submit-answer` → `complete-attempt` all 200 |
| 17 | Archive results unranked: no global rank, no country rank, no percentile | ✅ BrewScore 56/100 + "Archive Brews never affect your ranked score, streak or the leaderboards." |
| 18 | Archive attempt is `is_ranked=false`, `attempt_purpose=archive`, `archive_date_snapshot=2026-07-12` | ✅ (verified in DB) |
| 19 | **Ranked limit stays 1/day** — 0 ranked attempts consumed by the archive session | ✅ (verified in DB; leaderboards/streaks derive from `is_ranked=true` attempts only) |
| 20 | **Account isolation** — new identity sees no Premium, no Archives, no cached leak | ✅ App User ID switched; User B shows "Coming later" + plans |
| 21 | Production stays `beta_open`; public billing disabled | ✅ |
| 22 | No key in tracked source; secret scan clean | ✅ |

> ⚠️ #13–#19 were certified with the entitlement written **server-side via
> `sync_player_entitlement`** — the exact row `revenuecat-reconcile` writes — because
> reconcile itself is blocked. The purchase was real; the *reconcile hop* is what
> remains unproven. The injected row was removed afterwards; the server is back to
> free.

## BLOCKED: reconcile rejects the V2 key

`revenuecat-reconcile` returns:

```
{"error":"provider_auth_failed"}
```

The Edge Function re-fetches authoritative state from RevenueCat's **v1** endpoint
(`GET /v1/subscribers/{app_user_id}`,
[`_shared/revenuecat.ts`](../supabase/functions/_shared/revenuecat.ts)). RevenueCat's
**V2 API keys are version-scoped and do not authenticate v1 endpoints.** The secret
that was set is a V2 key, so every reconcile call fails auth.

**Founder action (blocking):** create a **V1 secret key** in RevenueCat
(Project settings → API keys → *secret* key for the **v1** API) and set it as the
same Edge secret. You set it yourself; it is never shared:

```
npx supabase secrets set REVENUECAT_SECRET_API_KEY=<v1 secret key> --project-ref kfcshiktovyjcoepnrfw
```

(Alternative, larger change: port the server to the v2 customer endpoints, which also
needs a `REVENUECAT_PROJECT_ID`. Not recommended now — v1 `/subscribers` returns
exactly the canonical subscriber state the mapper consumes.)

## Bugs found and fixed during this run

1. **Purchase could charge with no UI.** `PURCHASE_START` was accepted only from
   `ready_*`, so tapping a plan from `nothing_to_restore` (or `cancelled`, `conflict`,
   a transient error) ran the real SDK purchase — **charging the user** — while the
   machine ignored the event and the UI never entered `finalizing`. Fixed: purchase is
   startable from every settled state the user can be looking at, and blocked from
   `sync_delayed` (already paid — never double-charge). The controller now also
   refuses to call the SDK when the machine would ignore it. Regression-tested.
2. **App-wide Supabase RPC breakage** (previous commit): `rpc`/`functions.invoke`
   were called unbound → `Cannot read property 'rest' of undefined` → reported as a
   bogus "network_error".
3. **Test Store needs `react-native-purchases` ≥ 9.5.4**; 8.5.0 silently fell back to
   Play Billing.

## Test Store limitations observed

- **Restore is a no-op.** `Restoring purchases not available in test store. Returning
  current CustomerInfo.` A restore therefore reports "no previous purchase" rather
  than re-granting. Restore-to-Premium can only be certified on Google Play.
- **Test subscriptions expire quickly.** The purchase made at 02:17 was inactive by
  18:48 the same day, which is why a second purchase was needed. Plan re-tests to run
  within one sitting.

## Still uncertified (must not be claimed)

- `revenuecat-reconcile` → `player_entitlements` (blocked on the v1 key)
- Restore returning server-confirmed Premium (Test Store cannot restore)
- Account-switch against a genuinely transferred purchase
- Cancellation / expiry / refund reflected from RevenueCat
- Google Play sandbox (Play verification still pending)

## Pre-production action items

1. Set a **V1** `REVENUECAT_SECRET_API_KEY` (blocking, above).
2. Optionally set `REVENUECAT_WEBHOOK_AUTH` + point the RevenueCat webhook at the
   deployed `revenuecat-webhook`, so entitlement changes are pushed, not only pulled.
3. **Review RevenueCat Restore Behavior** — currently *Transfer to new App User ID*,
   which can move a subscription between BrainBrew accounts. Decide explicitly before
   launch; "Keep with original App User ID" is **not** certified.
4. After Play verification: create Play products, switch to the `goog_` key. The
   release gate already fails any store build carrying a `test_` key.
