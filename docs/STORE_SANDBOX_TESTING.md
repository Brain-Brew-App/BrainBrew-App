# Store Sandbox Testing & Dev Build (Phase 7E)

The concrete, Founder-run steps to test purchases on a device, in verification
order. Native store purchases **cannot** run in Expo Go or a normal web preview —
they need a native development build. Automated, credential-free verification of
the server pipeline already exists (`npm run cloud:revenuecat-check`); this doc
covers the parts that need a real device and store/RevenueCat credentials.

> **Status honesty:** as of this phase, the server pipeline is built, deployed, and
> verified end-to-end **without a real purchase**. RevenueCat Test Store, Android
> Google Play sandbox, and iOS sandbox purchases are **device steps not yet
> performed** (they require the Founder's RevenueCat/store credentials + a physical
> device). Nothing below has been executed by the implementer.

---

## 1. Verification order

1. **RevenueCat Test Store** — fastest, repeatable, no store console needed.
2. **Android** development build + **Google Play sandbox** (license testers).
3. **iOS** sandbox — later, when Apple Developer credentials are available
   (Founder-blocked; not required to prove the architecture).
4. **Production store launch** — a separate, later gate (NOT this phase).

## 2. Platform matrix

| Target | Native purchases? | Notes |
| --- | --- | --- |
| Web (`expo start --web`) | No | Safe "managed in the app" state; beta access intact. |
| Expo Go | No | Native billing module absent; unsupported state. |
| EAS **development** build (Android S21+) | Yes | Test Store + Play sandbox. |
| EAS development build (iOS) | Yes | Needs Apple setup (deferred). |

- Android package: `com.brainbrew.app` · iOS bundle: `com.brainbrew.app` (both in
  `app.config.js`; testing identifiers, Founder-confirmable before launch).

## 3. Founder commands — Android development build

```bash
# One-time
npm install -g eas-cli          # or: npx eas-cli@latest
eas login                       # Founder's Expo account

# Provide the PUBLIC RevenueCat keys to EAS (never the secret key):
eas env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value goog_… --environment development
eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value appl_… --environment development

# Build a dev client that includes react-native-purchases:
eas build --profile development --platform android

# Install the resulting .apk on the Galaxy S21+, then run Metro:
npx expo start --dev-client
```

Server-side secrets (set once, never printed):

```bash
supabase secrets set REVENUECAT_SECRET_API_KEY=sk_…
supabase secrets set REVENUECAT_WEBHOOK_AUTH=<random-32+chars>   # same value in the RC webhook
# optional: supabase secrets set REVENUECAT_ENTITLEMENT_ID=brainbrew_premium
```

Point RevenueCat → Integrations → Webhooks at
`https://<project>.supabase.co/functions/v1/revenuecat-webhook` with the same
`REVENUECAT_WEBHOOK_AUTH` value as the Authorization header.

## 4. Test matrix (Task 18)

Test Store first, then Play sandbox where credentials permit:

- Monthly purchase · Annual purchase
- Cancellation · Expiration · Renewal
- Grace period / billing issue (where simulable)
- Refund / revocation
- Restore purchases
- Account switch (User A → User B) — A's Premium must not appear for B
- Same-user reinstall / device recovery
- Duplicate webhook delivery (idempotent) · out-of-order events · webhook retry
- Missing customer (quarantine) · invalid webhook auth (401) · provider timeout

For each: after the store action, the app shows *Finalizing access…*, then
`get_my_entitlements` flips to `premium` (or back to `expired`/`free`), and the
ranked attempt stays exactly one per UTC day.

## 5. Production-launch checklist (NOT this phase)

Do not begin any of this without explicit Founder approval:

1. Finalize prices in App Store Connect / Google Play.
2. Complete Apple sandbox verification.
3. Legal: real Terms + Privacy URLs, auto-renew disclosure, store review notes.
4. Decide the free-tier Practice allowance and any intro offer.
5. Flip `set_release_policy('production_paywall')` — the ONLY switch that activates
   the paywall globally — after a staged `sandbox_paywall` validation.
6. Store review + phased rollout.

## 6. Rollback / kill switch

`set_release_policy('beta_open')` instantly restores full Practice access for
everyone (purchasers keep Premium status; no one is blocked). The switch is
service-role only and independent of any build.

---

## Phase 7J — Founder configuration checklist (one place, no secrets in repo)

Backend Archives + entitlement are live and tested; the store certification is
Founder-owned. Run `npm run revenuecat:config-check` any time to see code vs
external readiness. Complete these in order:

**RevenueCat dashboard**
1. Project + Android app with package **`com.brainbrew.app`**.
2. Entitlement **`brainbrew_premium`**.
3. Offering **`default`** with packages **`$rc_monthly`** + **`$rc_annual`**.
4. Products **`brainbrew_premium_monthly`** + **`brainbrew_premium_annual`**.
5. Public **Android SDK key** → set as EAS env `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
6. **Secret API key** → Supabase Edge secret `REVENUECAT_SECRET_API_KEY` (never client).
7. **Webhook** → URL = deployed `revenuecat-webhook` function; auth secret →
   Supabase Edge secret `REVENUECAT_WEBHOOK_SECRET`. Transfer behavior = **no-merge**.

**Google Play Console**
8. App + package `com.brainbrew.app`; Internal Testing track.
9. Subscription base-plans (monthly + annual); license tester added.
10. Service-account linked to RevenueCat.

**EAS / device**
11. `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` + the RC Android key in
    EAS env; `EXPO_PUBLIC_CONTENT_SOURCE=cloud`.
12. `eas build --profile development --platform android` → install AAB/APK on the S21+.

**Certification (report each with a real transaction — never mark certified otherwise)**
13. Offering loads (store-localized price, no hard-coded currency).
14. Monthly + annual sandbox purchase → webhook → `get_my_entitlements` premium → Archives unlock.
15. Cancel (neutral) · Restore · reinstall-restore · account-switch isolation (no merge).
16. Expiry/refund removes access · grace/billing behave per policy.
17. Ranked stays exactly one per UTC day in every state.

Production `production_paywall` stays **disabled** until all of 13–17 are green.

## ADB / device readiness (S21+ connected, Developer Mode + USB debugging)

No native install has occurred yet — these are the commands once an APK exists.

```
adb devices                 # the S21+ must show "device" (not "unauthorized")
adb install -r <app>.apk    # install the EAS development build
adb shell pm list packages | findstr brainbrew        # expect com.brainbrew.app
adb logcat -s ReactNativeJS:V RevenueCat:V            # app + purchase logs only

# Deep links — BOTH schemes must resolve (Auth + RevenueCat return):
adb shell am start -a android.intent.action.VIEW -d "brainbrew://auth-callback"
adb shell am start -a android.intent.action.VIEW -d "rc-2f2d62d750://"
```

`app.config.js` declares `scheme: ['brainbrew', 'rc-2f2d62d750']` — the Auth scheme is
never replaced. Verified by `npm run revenuecat:config-check`.
