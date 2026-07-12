# Premium — RevenueCat Test Store certification run

Device: Samsung S21+ (`RFCR10H7A3K`) · package `com.brainbrew.app` · dev client
`versionCode 2` · `react-native-purchases@10.4.2` (native SDK 10.12.0) · Metro dev
bundle · live Supabase backend.

Store separation and the release gate are documented in
[REVENUECAT_STORE_MODES.md](REVENUECAT_STORE_MODES.md).

## Status: **NOT certified — blocked on one Founder action**

Everything up to and including the store purchase works on the real device. The
server cannot yet *confirm* the purchase, so Premium correctly does **not** unlock.

## What passed on-device

| # | Check | Result |
|---|-------|--------|
| 1 | Test Store key in ignored `.env` only, absent from tracked source | ✅ |
| 2 | RevenueCat mode = `test_store` (from key prefix, key never logged) | ✅ `[revenuecat] configured mode=test_store appUserIdPrefix=ed382b9b…` |
| 3 | SDK uses the simulated store, not Play Billing | ✅ `SimulatedStoreBillingAbstract` |
| 4 | App User ID == Supabase Auth UUID | ✅ |
| 5 | Offering `default` loads | ✅ `Offerings object created with 1 offerings` |
| 6 | Packages `$rc_monthly` + `$rc_annual` | ✅ both |
| 7 | Product ids validated per mode (`monthly`/`yearly`) | ✅ `mode=test_store offering=default monthly=monthly annual=yearly` |
| 8 | Prices come from store metadata, never hardcoded | ✅ Monthly **US$9.99**, Annual **US$79.98** |
| 9 | Display name ≠ product identifier (name is `brainbrew_premium_monthly`, id is `monthly`) | ✅ validated on identifier |
| 10 | Purchase dialog opens with correct product/price/period | ✅ `monthly · US$9.99 · P1M` |
| 11 | Cancellation is neutral — no failure UI, buttons recover | ✅ |
| 12 | Test Store purchase completes | ✅ `POST /v1/receipts 200` |
| 13 | **SDK success does NOT unlock Premium** | ✅ UI stayed non-Premium |
| 14 | UI enters **Finalizing access…** and disables buttons | ✅ |
| 15 | Restore purchases runs and re-enters finalizing | ✅ |
| 16 | Sync-delayed recovery card, with "you have not been charged twice — do not buy again" + Retry sync + Restore + support reference | ✅ |
| 17 | Ranked limit stays 1 (DB invariant + entitlement clamp) | ✅ 27 archive checks, ranked-limit mutation rejected |
| 18 | Production release policy remains `beta_open`; public billing disabled | ✅ |

## What is BLOCKED (and why that is the system working)

`revenuecat-reconcile` re-fetches authoritative subscriber state from RevenueCat's
REST API ([`_shared/revenuecat.ts`](../supabase/functions/_shared/revenuecat.ts)),
which requires the server-side secret **`REVENUECAT_SECRET_API_KEY`**. That secret is
**not set** on the Supabase project (`supabase secrets list` shows no RevenueCat
entry), so:

- reconcile cannot verify the purchase with RevenueCat →
- the server entitlement never becomes `premium` →
- the app **refuses to unlock Premium**, and shows the honest sync-delayed card.

This is exactly the designed authority boundary: **an SDK "purchased" result is never
sufficient — only a server-confirmed entitlement unlocks Premium.** Nothing is
broken; the server simply has no credential with which to confirm.

Consequently these remain **uncertified** and must not be claimed:

- Server entitlement flips to Premium
- Archives unlock / historical pack opens / archive session completes / unranked results
- Restore returning a server-confirmed Premium
- Account-switch behavior against a real transferred purchase
- RevenueCat sandbox transaction reflected in BrainBrew

## Founder actions

**1 — Set the RevenueCat secret REST key as a Supabase Edge secret (blocking).**

Server-side only. It must **never** go in `.env`, the app, or git. You set it
yourself; it is not shared with anyone:

```
# RevenueCat → Project settings → API keys → SECRET key (starts with sk_)
npx supabase secrets set REVENUECAT_SECRET_API_KEY=sk_xxxxxxxx --project-ref kfcshiktovyjcoepnrfw
```

(or Supabase dashboard → Edge Functions → Secrets → Add new secret).

Optional but recommended, so RevenueCat pushes changes instead of relying on
reconcile-on-restore:

```
npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=<random-32+char-string> --project-ref kfcshiktovyjcoepnrfw
```
then in RevenueCat → Integrations → Webhooks, point the URL at the deployed
`revenuecat-webhook` function and set the same value as the `Authorization` header.

**2 — Pre-production: review Restore Behavior.** The project is on *Transfer to new
App User ID*, which can move a subscription between BrainBrew accounts on restore.
Decide explicitly before launch (see REVENUECAT_STORE_MODES.md).

**3 — After Google Play verification only:** create the Play products
`brainbrew_premium_monthly` / `brainbrew_premium_annual`, attach them to the
`default` offering's `$rc_monthly` / `$rc_annual` packages, and switch the build to
the `goog_` key. The release gate already fails any store build carrying a `test_`
key. Google Play sandbox is **not** certified and must not be claimed.

## Known issues / notes

- **The RevenueCat SDK's own verbose logging prints the API key and the full App
  User ID** in the shared-preferences migration line. That is the SDK's dev logging,
  not ours — our diagnostics print the mode name and an 8-char id prefix only. The
  SDK log level is VERBOSE only when `__DEV__` is true; release builds set it to
  ERROR, so this does not reach a production log.
- During the purchase matrix an extra `yearly` test purchase was triggered by a
  mis-targeted automation tap after the layout shifted. Both are simulated Test Store
  purchases with no revenue and no real charge; both map to the same
  `brainbrew_premium` entitlement. Worth clearing the test subscriber in RevenueCat
  before the next clean run.
- Duplicate-tap protection could not be positively demonstrated through adb (the
  second synthetic tap dismissed the native dialog rather than re-entering purchase).
  Single-flight is covered by unit tests (`test:premium-archive`).
