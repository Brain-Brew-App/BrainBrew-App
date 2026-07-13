# Premium — RevenueCat Test Store certification run

Device: Samsung S21+ (`RFCR10H7A3K`) · package `com.brainbrew.app` · dev client
`versionCode 2` · `react-native-purchases@10.4.2` (native SDK 10.12.0) · Metro dev
bundle · live Supabase backend. Store separation + release gate:
[REVENUECAT_STORE_MODES.md](REVENUECAT_STORE_MODES.md).

## Status: **Test Store certification CLOSED** ✅

The full chain is certified end-to-end on the real device, with no manual injection:

```
Test Store purchase → SDK success (does NOT unlock) → Finalizing access…
  → revenuecat-reconcile → authoritative RevenueCat subscriber state
  → player_entitlements → get_my_entitlements → Premium → Archives unlock
  → subscription lapses → "Premium has expired" → Archives re-locks
```

Ranked fairness held throughout: **0 ranked attempts consumed**, limit is a hard 1/day.

The earlier blocker was a **V1 vs V2 key-version mismatch** — our server calls
RevenueCat's v1 `/subscribers` endpoint, which a V2 key cannot authenticate
(`provider_auth_failed`). Resolved by setting a V1 secret key. See
[REVENUECAT_STORE_MODES.md](REVENUECAT_STORE_MODES.md) for why v1 is the deliberate
choice.

**Google Play sandbox remains uncertified** (Play verification pending) and must not
be claimed.

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

## Reconcile — certified

With a **V1** secret key set, `revenuecat-reconcile` authenticates and writes
authoritative RevenueCat state. The row it produced was unmistakably its own work
(not an injection): `source=revenuecat`, `entitlement=brainbrew_premium`,
`product=monthly`, `store=test_store`, `purchased_at` matching the purchase to the
second.

| Step | Evidence |
|------|----------|
| Reconcile authenticates | `{"ok":true,"entitlement_state":"free","applied":true}` (probe user, no purchases) |
| Purchase → server Premium | `POST /v1/receipts 200` → `state=premium is_active=true will_renew=true` |
| UI unlock | "You're Premium" · "Premium active." · **Open Archives** |
| Archives (no restart) | Calendar with the historical `2026-07-12` pack |
| Expiry | Subscription lapsed → **"Premium has expired. Your scores and history are safe."** → Archives re-locked |
| Ranked fairness | **0** ranked attempts consumed; limit is a hard 1/day |

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

- **Restore returning server-confirmed Premium** — the Test Store *cannot* restore
  (`Restoring purchases not available in test store`). Only certifiable on Google Play.
- **Account switch against a genuinely transferred purchase** — cache isolation is
  certified (a new identity sees no Premium and no Archives); an actual RevenueCat
  transfer is not.
- **Cancellation and refund** — *expiry* is now certified; a user-initiated cancel and
  a refund/revoke still need Play sandbox.
- **Google Play sandbox** — Play verification still pending.

## Pre-production action items

1. Set `REVENUECAT_WEBHOOK_AUTH` and point the RevenueCat webhook at the deployed
   `revenuecat-webhook`. Reconcile is a *pull* that runs on purchase/restore; the
   webhook is the *push* that keeps a cancellation/refund/renewal current without the
   player opening the app. **The read-time expiry clamp means a lapse is now handled
   safely even without the webhook**, but a refund still needs the push to be prompt.
2. **Review RevenueCat Restore Behavior** — currently *Transfer to new App User ID*,
   which can move a subscription between BrainBrew accounts. Decide explicitly before
   launch; "Keep with original App User ID" is **not** certified.
3. After Play verification: create Play products, switch to the `goog_` key. The
   release gate already fails any store build carrying a `test_` key.
4. **Watch item (not a task):** RevenueCat states the v1 `/subscribers` endpoint is not
   deprecated and has no removal plan. If they ever announce a sunset, migrating the
   reconcile/webhook fetch boundary to v2 becomes a planned post-launch job.

## Bugs found by this certification (all fixed)

1. **Test Store needs `react-native-purchases` ≥ 9.5.4.** 8.5.0 silently fell back to
   Play Billing and produced a misleading "products not registered in the dashboard"
   error. Upgraded to 10.4.2.
2. **App-wide Supabase RPC breakage.** `rpc`/`functions.invoke` were called unbound →
   `Cannot read property 'rest' of undefined` → reported as a bogus "network_error".
   Broke entitlements, player status, leaderboards, progress and analytics.
3. **A purchase could charge with no UI.** `PURCHASE_START` was accepted only from
   `ready_*`, so tapping a plan from `nothing_to_restore`/`cancelled`/`conflict` ran the
   real SDK purchase — charging the user — while the UI never entered `finalizing`.
4. **Premium outlived the paid period.** The entitlement read and the archive gate used
   the stored state verbatim, so a lapsed subscription kept Premium until a webhook or
   reconcile corrected it. Now clamped at read time (fail closed).
5. **Archives read a stale entitlement.** A confirmed purchase did not reach the
   app-level entitlement reader, so "Open Archives" led to the locked screen until an
   app restart.
