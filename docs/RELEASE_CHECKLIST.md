# RC1 Release Checklist

Every box must be **verified**, not assumed. Where a step has a command, run the
command — a green memory is not evidence.

Status legend: ✅ done & verified · ⛔ blocked · ⬜ pending

---

## 1. Code gates (run locally, all must pass)

```bash
npm run typecheck        # ✅
npm run lint             # ✅ 0 errors (68 documented warnings — see KNOWN_LIMITATIONS)
npm test                 # ✅ 102
npm run test:cloud       # ✅ 330
npm run test:premium-archive       # ✅ 70
npm run test:premium-archive-flow  # ✅ 18
npm run test:failure-injection     # ✅ 11
npm run test:store-mode            # ✅ 52
npm run test:supabase-binding      # ✅ 9
npm run test:canonical-authoring   # ✅ 4
npm run test:authoring-boundary    # ✅ 18
npm run test:authoring-forms       # ✅ 323
npm run audit                      # ✅
npm run authoring:bundle:check     # ✅
npm run secret-scan                # ✅
npm run release:key-check          # ✅
```

Database (PGlite, hermetic):
```bash
npm run db:test db:token-test db:gameplay-sim db:auth-test db:ranked-test \
        db:leaderboard-test db:progress-test db:practice-test db:entitlement-test \
        db:revenuecat-test db:archives-test db:admin-test db:analytics-test    # ✅ all
```

## 2. Security (Part H)

- ✅ `secret-scan` clean across tracked files.
- ✅ **Git history**: no real key in any commit tree. Verified with
  `git log --all -S"<key>"` and a per-commit `git grep` over every reachable tree.
- ✅ `release:key-check` fails any preview/production build carrying a `test_` key.
- ✅ RevenueCat: public SDK key in ignored `.env` only; secret REST key and webhook
  secret are Supabase Edge secrets, never in the app.
- ✅ Supabase advisors: **0 ERROR**. WARNs are by design (SECURITY DEFINER RPCs with
  pinned `search_path`; anonymous sign-in is the guest-play model).
- ✅ 8/10 Edge Functions derive the user from a verified JWT. `get-daily-pack` is
  intentionally public (contains no answers). `revenuecat-webhook` uses its own
  shared secret.
- ✅ No receipts, purchase tokens, transaction ids, provider customer ids or emails
  reach the client (recursive forbidden-field validator + tests).

## 3. Release configuration (Part F)

- ✅ `android.package` = `com.brainbrew.app`
- ✅ App display name = **BrainBrew** (was `brainbrew-app` — the slug was showing on
  the launcher)
- ✅ `versionCode` = 2 · `version` = 1.0.0 — **bump versionCode for every upload**
- ✅ Adaptive icon, splash, portrait lock, dark UI style
- ✅ Deep-link schemes: `brainbrew` (auth callback) + `rc-2f2d62d750` (RevenueCat)
- ✅ `SYSTEM_ALERT_WINDOW` / `CHANGE_WIFI_MULTICAST_STATE` seen on the dev APK come
  from `expo-dev-launcher`'s **debug-only** manifest and will not ship in a release
  build. Verified in `node_modules/expo-dev-launcher/android/src/debug/`.
- ⬜ **Re-verify the merged manifest on the first `preview`/`production` build** —
  `npx eas build -p android --profile preview`, then
  `adb shell dumpsys package com.brainbrew.app | grep -A5 "requested permissions"`.
  Expect **INTERNET only**.

## 4. Backend

- ✅ All migrations pushed (latest: `20260801090000_entitlement_expiry_clamp`).
- ✅ Edge Functions deployed (latest: `start-archive-attempt` with resume info).
- ✅ Production release policy remains `beta_open`; public billing disabled.
- ⬜ Publish a fresh daily-pack window before RC1 (`npm run supabase:publish-packs`).
  Packs expire — an empty window shows `no_live_pack`.

## 5. Analytics / KPI integrity

- ✅ Events now carry `environment: development|production` (was hard-coded
  `production`, so all QA play was indistinguishable from real players).
- ⬜ **Flag the QA accounts** so they are excluded from business KPIs. The rollups
  exclude by `analytics_subject_flags.exclude_from_business_kpis`, NOT by
  environment. The test identities used during 7J/7K certification are still
  counted. Do this before RC1 or the launch KPIs are wrong.

## 6. Google Play (BLOCKED until verification completes — do not start)

- ⛔ Play Console verification pending.
- ⬜ Create Play subscription products `brainbrew_premium_monthly` /
  `brainbrew_premium_annual`; attach to the `default` offering's `$rc_monthly` /
  `$rc_annual` packages.
- ⬜ Switch `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` to the `goog_` key **in EAS build
  env only** (never in `.env`). The release gate enforces this.
- ⬜ Upload the Internal Testing build.
- ⬜ Run the Play sandbox matrix in [RC1_TEST_PLAN.md](RC1_TEST_PLAN.md).
- ⬜ **Decide RevenueCat Restore Behavior** — currently *Transfer to new App User ID*.
  "Keep with original" is NOT certified.

## 7. Ship gate — do not release unless ALL are true

- [ ] Every code gate above is green.
- [ ] Play sandbox certification passed (purchase, restore, cancel, refund, expiry).
- [ ] Manifest requests INTERNET only.
- [ ] Ranked fairness re-verified on the release build: **1 attempt/UTC day**, and
      Premium grants no ranked advantage.
- [ ] Rollback plan reviewed: [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md).
- [ ] Monitoring in place: [POST_RELEASE_MONITORING.md](POST_RELEASE_MONITORING.md).
