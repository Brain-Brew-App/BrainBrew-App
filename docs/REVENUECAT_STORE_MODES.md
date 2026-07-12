# RevenueCat store modes — Test Store vs Google Play

BrainBrew talks to **two different stores** with the **same** RevenueCat project. They
share an entitlement, an offering and package ids, but they do **not** share product
identifiers. Confusing them is the single easiest way to ship a build where users
"buy" Premium against a fake store, so the difference is enforced in code, not by
memory.

Code: [`src/cloud/revenuecat/storeMode.ts`](../src/cloud/revenuecat/storeMode.ts).
Release gate: [`scripts/release-key-check.mjs`](../scripts/release-key-check.mjs).
Tests: `npm run test:store-mode` (52 checks, incl. mutations).

## The two modes

|                    | Development (now)                    | Google Play (after Play verification)                |
| ------------------ | ------------------------------------ | ---------------------------------------------------- |
| Public SDK key     | `test_…`                             | `goog_…`                                             |
| Store              | RevenueCat **Test Store**            | Google Play Billing                                  |
| Monthly product id | `monthly`                            | `brainbrew_premium_monthly`                          |
| Annual product id  | `yearly`                             | `brainbrew_premium_annual`                           |
| Where the key lives| ignored local `.env`                 | EAS build environment (never in `.env`, never in git)|
| Real money         | No                                   | Yes                                                  |

**Identical in both modes — never change these:**

- Offering: `default`
- Packages: `$rc_monthly`, `$rc_annual`
- Entitlement: `brainbrew_premium`

> ⚠️ **A product's display NAME is not its identifier.** In the Test Store the two
> products are *named* `brainbrew_premium_monthly` / `brainbrew_premium_annual` (to
> match the future Play catalogue) but their real identifiers are `monthly` /
> `yearly`. Validation compares `product.identifier`, never `product.title`.

## How the mode is decided

Purely from the **key prefix** — the key value itself is never logged, stored or
rendered:

```
test_ → test_store      goog_ → google_play      appl_ → app_store
(none) → unconfigured   anything else → invalid  (fails safe; never assumed live)
```

Diagnostics print the mode NAME only (`[revenuecat] configured mode=test_store
appUserIdPrefix=ed382b9b…`). Never the key, never the full App User ID.

## Per-mode offering validation

`validateOfferingForMode()` rejects, rather than renders, a catalogue that does not
match the current mode. Because the package→product mapping determines **what the
user is actually charged for**, a cross-store mapping is a hard rejection:

- Play product ids in Test Store mode → rejected (`product_mismatch`)
- Test Store product ids in Play mode → rejected (`product_mismatch`)
- Offering that is not `default` → rejected (`wrong_offering`)
- An unexpected package (e.g. `$rc_weekly`) → rejected (`unknown_package`)
- Missing `$rc_monthly`/`$rc_annual` → `missing_package`
- No packages at all → `empty_offering`

A rejection shows the calm "plans aren't available right now" state and leaves beta
access intact. It never shows a broken or half-priced paywall.

## SDK version requirement (learned the hard way)

**The Test Store needs `react-native-purchases` ≥ 9.5.4.** BrainBrew's first dev APK
shipped 8.5.0, which has no Test Store support: given a `test_` key it silently fell
back to **Google Play Billing** and tried to fetch `monthly`/`yearly` from Play,
producing a misleading dashboard-shaped error:

```
Requesting products from the store with identifiers: monthly, yearly
Billing connected with country code: AE
WARN  Could not find ProductDetails for monthly, yearly
ERROR ConfigurationError: None of the products registered in the RevenueCat
      dashboard could be fetched from the Play Store.
```

The RevenueCat dashboard was correct the whole time. If this error reappears, check
the **SDK version first**. Current: `react-native-purchases@10.4.2`.

## The release gate

A `test_` key in a real store build would let anyone unlock Premium for free.
`npm run release:key-check` makes that a build failure, and it runs automatically on
every EAS build via the `eas-build-pre-install` npm hook.

It fails when:

1. a `test_` key is present in a `preview` or `production` build;
2. any key has an unrecognised prefix (fail safe — never assumed to be a real store);
3. a real SDK key literal appears in **tracked source** (template placeholders like
   `goog_XXXX…` are correctly ignored; a real key pasted into `.env.example` is not).

It never prints a key value, only the mode name.

## Restore behavior — OPEN pre-production decision

The RevenueCat project is currently set to **"Transfer to new App User ID"**. This is
the Founder-owned dashboard default and has **not** been changed.

**What it means:** if the same underlying store account restores purchases while
signed into a *different* BrainBrew identity, the subscription is **transferred** to
that new identity — the original BrainBrew account silently loses Premium.

**Not certified:** "Keep with original App User ID" behavior has **not** been tested
and must not be claimed. What the app *does* guarantee, and what is tested, is that
no Premium state leaks between accounts from a stale **client cache** — an identity
change resets the controller, the entitlement cache and the archive cache, and the
server entitlement (`get_my_entitlements`) is re-fetched for the new identity.

**Action before launch certification:** review RevenueCat → Project settings →
Restore Behavior and decide explicitly between:

- **Transfer to new App User ID** (current) — simplest; a shared device/store account
  can move Premium between BrainBrew accounts.
- **Keep with original App User ID** — Premium stays with the buying identity;
  restore on another identity finds nothing.

Record the decision and re-run the account-switch matrix against whichever is chosen.
