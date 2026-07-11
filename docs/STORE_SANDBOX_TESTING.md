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
