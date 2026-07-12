# BrainBrew

**Five minutes. Sharper every morning.**

A daily five-puzzle mental warm-up. Everyone in the world gets the same pack each day — one Observation, one Pattern, one Logic, one Language Logic, and one Attention Speed challenge — then compares a single BrewScore against friends, their country, and the world.

## Current milestone (MVP / Phase 0)

Play one complete session on a phone with no backend:

- Home screen → "Start Today's Brew"
- Five puzzle engines, simplest possible versions, hardcoded content
- BrewScore calculation
- Results screen

No accounts, no database, no AI generation, no leaderboards yet. The only question this phase answers: **would I genuinely open this again tomorrow morning?**

## Running it

> **The project root is `brainbrew-app/`, one level below the `BrainBrew App` folder.**
> Every command below must be run from there. Running npm from the folder above
> fails with a confusing `ENOENT: no such file or directory, open .../package.json`.

```bash
cd "BrainBrew App/brainbrew-app"
npm install
```

| Command | What it does |
|---|---|
| `npm run web` | Dev server + browser preview at http://localhost:8081 |
| `npm start` | Dev server + QR code for Expo Go on a phone |
| `npm run tunnel` | Same, but routed via Expo's tunnel — use when LAN fails |
| `npm run web:clear` | Web preview with the Metro cache wiped (stale-bundle fix) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Scoring, pack-selection and content checks |
| `npm run audit` | Content audit (duplicates, distractors, difficulty, rotation) |
| `npm run doctor` | `expo-doctor` dependency/config audit |
| `npm run db:test` | Runs the DB migrations in in-process Postgres and tests every constraint/trigger/RLS rule |
| `npm run db:import-check` | Simulates the full 314-puzzle / 50-pack import locally |
| `npm run secret-scan` | Scans tracked + staged files for privileged credentials |

## Supabase (Phase 4A content database · Phase 4B secure cloud gameplay)

The database foundation is documented in
[docs/DATABASE_FOUNDATION.md](docs/DATABASE_FOUNDATION.md); the
server-authoritative cloud gameplay path (Edge Functions, attempt tokens, private
scoring, the deploy runbook) is in
[docs/SERVER_AUTHORITATIVE_GAMEPLAY.md](docs/SERVER_AUTHORITATIVE_GAMEPLAY.md).

By default the **local app does not use Supabase** — gameplay stays fully local
and offline (`EXPO_PUBLIC_CONTENT_SOURCE=local`, the default). Set
`EXPO_PUBLIC_CONTENT_SOURCE=cloud` to opt a build into the server-authoritative
path, wired into the UI (see
[docs/CLOUD_CLIENT_INTEGRATION.md](docs/CLOUD_CLIENT_INTEGRATION.md)). In cloud
mode the app signs in with **Supabase Anonymous Auth** and each player has a
private profile (username + country) — see
[docs/PLAYER_IDENTITY_AND_PROFILES.md](docs/PLAYER_IDENTITY_AND_PROFILES.md).
Players can **secure their progress with an email** (same account, passwordless) —
see [docs/EMAIL_ACCOUNT_UPGRADE.md](docs/EMAIL_ACCOUNT_UPGRADE.md) — or with
**Google** (same UUID, link or recover) — see
[docs/GOOGLE_ACCOUNT_LINKING.md](docs/GOOGLE_ACCOUNT_LINKING.md). The Google
provider is live; the interactive OAuth consent round-trip is a Founder
verification step.
Migrations in `supabase/migrations/` are the source of truth. Eligible permanent
players get **one secure ranked BrewScore per UTC date** — server-authoritative,
one-per-day, immutable — see
[docs/RANKED_DAILY_ATTEMPTS.md](docs/RANKED_DAILY_ATTEMPTS.md). Those valid ranked
results feed **daily Global & Country leaderboards** (positions, percentile,
paginated lists, your-own-row) — see
[docs/DAILY_LEADERBOARDS.md](docs/DAILY_LEADERBOARDS.md) — and each player's
**personal progress**: ranked-play streaks, daily history, basic lifetime & category
statistics, and a completion calendar, all derived from canonical ranked attempts —
see [docs/PLAYER_PROGRESS_AND_STREAKS.md](docs/PLAYER_PROGRESS_AND_STREAKS.md).
Players can also generate a privacy-safe **Share Card** of a result and play fresh
**unranked Practice Brews** from approved **reserve-only** content (server-selected across all five categories, isolated from all ranked surfaces), plus a private **Practice Summary** —
see [docs/SHARE_CARDS_AND_PRACTICE.md](docs/SHARE_CARDS_AND_PRACTICE.md).
Friends/weekly/all-time boards, achievements, premium analytics, subscriptions,
and archives are deferred. Practice is unlimited during beta; **extra ranked
attempts are never sold.** Guest/practice play stays unranked, and local mode is
always unranked and offline.

A server-authoritative **Premium entitlement foundation** answers "what can this
player do?" via one validated capability read (`get_my_entitlements`) — see
[docs/ENTITLEMENT_FOUNDATION.md](docs/ENTITLEMENT_FOUNDATION.md) and
[docs/PREMIUM_PRODUCT_MODEL.md](docs/PREMIUM_PRODUCT_MODEL.md). The ranked-attempt
limit is a hard constant `1`; **Premium can never grant a ranked advantage.**

**RevenueCat subscriptions** (Phase 7E) synchronize real purchases into a private
`player_entitlements` table via an authenticated webhook that re-fetches the
authoritative subscriber state — never trusting the event body. An explicit server
`release_policy` (`beta_open` today) keeps everyone's Practice access while
purchases are tested in sandbox; **no public billing has launched**, and every
subscription state still resolves `ranked_attempts_per_utc_day = 1`. See
[docs/REVENUECAT_INTEGRATION.md](docs/REVENUECAT_INTEGRATION.md),
[docs/SUBSCRIPTION_LIFECYCLE.md](docs/SUBSCRIPTION_LIFECYCLE.md),
[docs/STORE_SANDBOX_TESTING.md](docs/STORE_SANDBOX_TESTING.md).

Credential-free client checks: `npm run test:cloud` (pure cloud logic),
`npm run cloud:live-check` (authed gameplay against the deployed functions — no
wire leak, score matches), and `npm run cloud:auth-check` (live anonymous auth,
profile, ownership, unranked). PGlite: `npm run db:auth-test`,
`npm run db:ranked-test`, `npm run db:leaderboard-test`, `npm run db:progress-test`.
Live paths (isolated test users/fixtures, created and cleaned up; need the secret
key): `npm run cloud:ranked-check`, `npm run cloud:leaderboard-check`,
`npm run cloud:progress-check`, `npm run cloud:share-practice-check`,
`npm run cloud:practice-check`, `npm run cloud:entitlement-check`. Entitlements
also have `npm run db:entitlement-test` (PGlite).

### Environment

```bash
cp .env.example .env      # then fill in the two EXPO_PUBLIC_ values
```

`.env` is git-ignored. Only the **publishable** key belongs there (it is public
by design and maps to the RLS-gated `anon` role). The **secret** key, access
token, and DB password are never committed and never loaded by the app — provide
them in your shell only when running the privileged database scripts below.

### Database commands (run by the Founder, with credentials)

| Command | What it does | Needs |
|---|---|---|
| `npm run supabase:link` | Link the CLI to the project | access token |
| `npm run supabase:push` | Apply migrations to the remote | linked + DB password |
| `npm run supabase:types` | Regenerate `database.types.ts` from the live schema | linked |
| `npm run supabase:import-content` | Import the local content (idempotent; add `-- --dry-run` to preview) | secret key |
| `npm run supabase:publish-packs` | Publish 7–14 dated packs live (idempotent; dry-runs without a key) | secret key |
| `npm run supabase:deploy-functions` | Deploy the six gameplay Edge Functions (incl. start-practice-attempt) | linked + `ATTEMPT_TOKEN_SECRET` set |
| `npm run supabase:parity` | Verify local ↔ cloud content by hash | secret key (+ publishable) |

No Docker is required — these use the remote project directly. The credential-free
checks below prove the whole path locally (PGlite; no remote needed):

| Command | Proves |
|---|---|
| `npm run db:test` | schema, constraints, triggers, RLS/grants |
| `npm run db:import-check` | all 326 puzzles + 50 packs import cleanly, no answer leak |
| `npm run db:scoring-contract` | server scoring == app scoring for all 314 puzzles |
| `npm run db:token-test` | attempt tokens reject tamper/expiry/replay/wrong-binding |
| `npm run db:gameplay-sim` | the full server-authoritative flow (incl. ranked), end to end |
| `npm run db:ranked-test` | ranked eligibility, one-per-day, immutability, void recalc, cooldown, RLS |
| `npm run db:leaderboard-test` | ranking order, positions, percentile, pagination, exclusions, security, void reorder, EXPLAIN |
| `npm run db:progress-test` | streaks, exclusions, statistics, category, history/calendar, security, idempotency, EXPLAIN |
| `npm run db:share-practice-test` | attempt_purpose derivation + practice isolation from every ranked surface |
| `npm run db:practice-test` | reserve-only Practice selection, lifecycle, isolation, reserve safety, security, EXPLAIN |
| `npm run db:practice-summary-test` | private Practice summary formulas, history pagination, ranked exclusion, security |
| `npm run db:entitlement-test` | beta policy for anon+permanent, all capabilities, ranked-limit-1 invariant, no-user-param, anon denied |
| `npm run db:admin-test` | admin RBAC matrix, audit immutability, maintenance enforcement, KPI formulas, security |
| `npm run db:authoring-test` | content authoring review state machine (validation-gates-approval, two-person control, promote-to-reserve, security) |
| `npm run test:canonical-authoring` | canonical builder+validator reuse (326 puzzles valid, broken candidates caught) |
| `npm run test:authoring-boundary` | the Admin's generated canonical bundle is byte-identical to the content pipeline (326 puzzles: hash, split, validator) + build failures handled |
| `npm run authoring:bundle:check` | the committed Admin authoring bundle is not stale vs `src/content` |
| `npm run db:content-mutations-test` | retire/delete lifecycle guards (history-safe) |
| `npm run db:analytics-test` | event ingestion (allowlist/dedup/forbidden-fields/spoofed-user), rollups (idempotent+correcting), retention, funnel, exclusion, security |
| `npm run db:entitlement-map-test` | RevenueCat subscriber → entitlement-state mapping (premium/trial/grace/billing/expired/refunded/free) |
| `npm run db:revenuecat-test` | subscription persistence, webhook idempotency/ordering, policy modes, practice gate, ranked-1 in every state, RLS/security, mutation cases |
| `npm run db:auth-test` | auth trigger, profile RPCs, ownership, RLS isolation |

`start`, `web` and `tunnel` run a **preflight** first. It refuses to launch if the
Metro port is already taken — because `expo start` otherwise prints
`Skipping dev server` and **exits 0**, so the command looks like it worked while
nothing is actually being served.

If preflight reports the port is busy, it is almost always a Metro process left
over from an earlier run:

```bash
netstat -ano | findstr :8081     # find the PID
taskkill /PID <pid> /F           # stop it
```

### On a phone (Expo Go)

1. Install **Expo Go** from the Play Store / App Store.
2. Phone and computer must be on the **same network**.
3. `cd "BrainBrew App/brainbrew-app" && npm start`
4. Scan the QR code printed in the terminal — Android: scan from inside Expo Go.
   iOS: scan with the Camera app.
5. Allow the Windows Firewall prompt for **Node.js** (Private *and* Public) the
   first time, or the phone cannot reach Metro.

If it hangs on "Downloading JavaScript bundle", LAN is blocked (guest Wi-Fi, AP
isolation, VPN, or a wired PC on a different subnet from the phone). Use
`npm run tunnel` instead — slower, but it works across networks.

## Stack

- **Frontend:** React Native + Expo (SDK 57)
- **Backend (later phases):** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Subscriptions (later):** RevenueCat
- **Analytics (later):** PostHog
- **Crash reporting (later):** Sentry

## Status

Private, pre-launch, solo project. Not accepting contributions.
