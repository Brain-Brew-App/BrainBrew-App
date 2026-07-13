# Production Deployment

The order matters. Backend first, app last — an app that expects a contract the server
does not yet serve is a broken app; a server that serves a contract no app uses yet is
harmless.

## 0. Preconditions

- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) fully green.
- Google Play verification complete (otherwise **stop** — Play Billing is blocked).
- A rollback path confirmed: [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md).

## 1. Database

```bash
npm run supabase:push              # migrations (forward-only)
npm run supabase:verify-schema     # remote matches expectation
npm run supabase:advisors          # expect 0 ERROR
```

Migrations are forward-only. There is **no down-migration**. A bad migration is rolled
forward with a corrective migration, never reversed.

## 2. Edge Functions

```bash
npm run supabase:deploy-functions
```

Deploys: `get-daily-pack`, `start-attempt`, `start-practice-attempt`,
`start-archive-attempt`, `open-puzzle`, `submit-answer`, `complete-attempt`,
`revenuecat-webhook`, `revenuecat-reconcile`, `analytics-ingest`.

Functions are versionless from the client's perspective — **a deploy is instantly live
for every installed app**. Only deploy a function whose response is backward-compatible
with the app versions already in the wild.

## 3. Secrets (set once; never in the repo)

| Secret | Where | Notes |
|---|---|---|
| `REVENUECAT_SECRET_API_KEY` | Supabase Edge secret | **v1** secret key. A v2 key cannot authenticate `/v1/subscribers` — reconcile returns `provider_auth_failed`. |
| `REVENUECAT_WEBHOOK_AUTH` | Supabase Edge secret + RevenueCat webhook header | The **raw** secret, no `Bearer` prefix. Min 16 chars. |
| `ATTEMPT_TOKEN_SECRET` | Supabase Edge secret | HMAC for attempt tokens. |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | **EAS build env** for store builds | `goog_…`. Never a `test_` key — `release:key-check` fails the build. |

## 4. Content

```bash
npm run supabase:publish-packs
```

Packs expire. An empty window means every player sees `no_live_pack`. Confirm the
window covers the launch date and several days beyond.

## 5. App build

```bash
# bump android.versionCode in app.config.js FIRST — Play rejects a duplicate
npx eas build --platform android --profile production
```

`eas-build-pre-install` runs `release:key-check` on the build server and fails the
build if a Test Store key is present.

## 6. Post-deploy verification (before promoting)

- Install the artifact; cold start renders today's pack.
- Complete one ranked brew; the score locks and cannot be repeated.
- Buy / restore / cancel / expire in the Play sandbox.
- Manifest requests **INTERNET only**.
- Watch [POST_RELEASE_MONITORING.md](POST_RELEASE_MONITORING.md) for the first hour.

## Flags that remain OFF at launch

Production release policy stays **`beta_open`**; public billing is disabled and
everyone keeps unlimited Practice. Turning the paywall on is a **deliberate, separate
decision** — it is not part of shipping RC1.
