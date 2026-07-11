# Premium Entitlement Foundation (Phase 7D)

BrainBrew's authoritative **entitlement** foundation: one server-returned answer to
"what can this player do?", the vocabulary around it, and the permanent fairness
invariant that ranked play can never be bought. **No purchasing is built or
enabled in this phase** — no store, prices, products, receipts, or providers. No
current player loses access to anything; everyone is on the **beta policy**
(unlimited Practice, all future Premium capabilities unavailable).

Read [`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md),
[`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md),
[`RESERVE_BASED_PRACTICE.md`](RESERVE_BASED_PRACTICE.md), and
[`CLOUD_CLIENT_INTEGRATION.md`](CLOUD_CLIENT_INTEGRATION.md) first.

> **Deferred (NOT built in 7D):** RevenueCat, StoreKit, Google Play Billing,
> Stripe, purchases, prices, products, offerings, trials, receipts, payment
> webhooks, subscription management, Restore Purchases, blocking paywalls, Premium
> account activation, archives, category training, difficulty filters, bonus
> packs, advanced statistics, themes, friends/teams/multiplayer/tournaments,
> Apple Sign-In, push, AI generation, admin dashboard, new engines, new content.

---

## 1. Vocabulary

- **Capability** — a single thing the product *can* do, named independently of
  who pays (`unlimited_practice`, `archives`, `category_training`, …). The full
  set is `ENTITLEMENT_CAPABILITIES` in [`src/cloud/validate.ts`](../src/cloud/validate.ts).
- **Entitlement** — the *server's decision*, for one player right now, about which
  capabilities are on. Carries an **entitlement state** and **limits**.
- **Entitlement state** — `beta` (today, everyone) · `free` · `premium` ·
  `grace_period` · `expired`. Only `beta` exists in 7D; the others are reserved
  so the contract shape never changes when they arrive.
- **Policy** — the rule that maps a state to capabilities. Today the *beta policy*
  is a constant in SQL. Later, a state comes from a persisted row and the policy
  layers Premium capabilities on top.
- **Limit** — a numeric cap. The only limit that matters for fairness,
  `ranked_attempts_per_utc_day`, is a **hard constant 1** and is never derived
  from state.

The client mirrors the three cleanly: `ValidEntitlements` (the read),
`hasCapability()` (a capability check), `practiceAccessFromEntitlements()` (a
policy projection for the Practice UI).

## 2. The one read contract

`get_my_entitlements()` — [`supabase/migrations/20260720090000_entitlements.sql`](../supabase/migrations/20260720090000_entitlements.sql).
SECURITY DEFINER, `search_path` pinned, **STABLE**, **no parameters** (scoped by
`auth.uid()`), granted to `authenticated` only (revoked from `public`/`anon`).

```jsonc
{
  "entitlement_state": "beta",
  "entitlement_version": 1,
  "capabilities": {
    "daily_ranked_brew": true, "global_leaderboard": true, "country_leaderboard": true,
    "ranked_streaks": true, "basic_progress": true, "share_cards": true,
    "practice_access": true, "unlimited_practice": true,
    "archives": false, "category_training": false, "difficulty_selection": false,
    "advanced_practice_stats": false, "advanced_ranked_stats": false,
    "bonus_packs": false, "premium_themes": false, "private_tournaments": false
  },
  "limits": { "ranked_attempts_per_utc_day": 1, "free_practice_brews_per_period": null },
  "period": null,
  "source": "beta_policy"
}
```

An unauthenticated identity returns `{ "entitlement_state": "free", "locked": true }`
(defensive — the grant already blocks `anon`).

## 3. The permanent ranked-fairness invariant

`ranked_attempts_per_utc_day` is a **constant 1** everywhere, defended in three
independent places so no single change can break it:

1. **SQL** — a literal `1` in `get_my_entitlements`, not read from any state,
   capability, or table.
2. **Client validator** — `validateEntitlements()` sets `rankedAttemptsPerUtcDay:
   1` unconditionally and **ignores the wire value**. A payload claiming `5` or a
   `premium` payload claiming `99` is clamped to `1` (tested).
3. **Ranked gameplay** — the daily attempt is enforced server-side by
   `start_daily_pack` / the ranked uniqueness constraint, entirely independent of
   entitlements (see [`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md)).

No capability maps to ranked attempts. **Premium can never unlock** extra ranked
attempts, score retries, higher leaderboard weighting, extra ranked points,
earlier answers, anti-cheat exemptions, or any competitive edge. See
[`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md) §3.

## 4. `player_entitlements` table + release policy (added in 7E)

7D shipped **no** table (everyone was `beta`; a table would have been empty). **7E
introduced it** exactly when the trigger fired: a RevenueCat webhook now persists
real per-player subscription state. The private `player_entitlements` table
(RLS-enabled, no client policies) is read inside `get_my_entitlements`, falling
back to the policy default on a missing row — additive, never altering the
contract shape or the fairness invariant. It is written only by the service-role
`sync_player_entitlement` RPC after an authenticated provider fetch.

`get_my_entitlements` now also reads `release_policy.mode` — `beta_open` (today,
everyone keeps unlimited Practice), `sandbox_paywall` (isolated test users),
`production_paywall` (defined, inactive) — server-only, changed via the
service-role `set_release_policy` RPC, never inferred from build. The RPC returns
`policy_mode` and safe `subscription` facts; provider/product/customer ids are in
`ENTITLEMENT_FORBIDDEN` and never leak. See
[`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md) and
[`SUBSCRIPTION_LIFECYCLE.md`](SUBSCRIPTION_LIFECYCLE.md).

## 5. Client layer

| Module | Role |
| --- | --- |
| [`src/cloud/validate.ts`](../src/cloud/validate.ts) | `validateEntitlements` — recursive forbidden-field guard, capability normalisation (unknown ignored, missing = false), ranked-limit clamp to 1. |
| [`src/cloud/entitlements.ts`](../src/cloud/entitlements.ts) | Pure helpers: `LOCAL_DEV_ENTITLEMENTS`, `hasCapability`, `PREMIUM_PREVIEW` catalogue, `RANKED_FAIRNESS_PROMISE`. |
| [`src/infrastructure/supabase/entitlementClient.ts`](../src/infrastructure/supabase/entitlementClient.ts) | The `get_my_entitlements` RPC wrapper (cloud only). |
| [`src/cloud/entitlementData.ts`](../src/cloud/entitlementData.ts) | Fetch + validate + in-session cache + `invalidateMyEntitlements`. |
| [`src/cloud/entitlementService.ts`](../src/cloud/entitlementService.ts) | Mode-aware façade: `getEntitlements` / `refreshEntitlements` / `peekEntitlements` / `capabilityEnabled` / `practiceAccess` / `resetEntitlementsForIdentityChange`. |
| [`src/cloud/useEntitlements.ts`](../src/cloud/useEntitlements.ts) | Cache-first, non-blocking hook for the Premium-preview surfaces. |

**Fail-closed everywhere:** a null entitlement, an unknown capability, or a
missing known capability is `false`. A Premium affordance is never shown "on" by
accident.

### Identity lifecycle
The session cache is dropped on any identity change — guest → new guest
(`continueAsGuest`) and sign-out (`signOut`) both call
`resetEntitlementsForIdentityChange()` in
[`src/cloud/useCloudIdentity.ts`](../src/cloud/useCloudIdentity.ts). An
anonymous → permanent **upgrade keeps the same UUID**, so the beta policy is
unchanged (verified live). No entitlement value is ever persisted on the client.

## 6. Practice policy integration

[`src/cloud/practicePolicy.ts`](../src/cloud/practicePolicy.ts) now has two
sources of truth, one per mode:

- **Cloud** — `practiceAccessFromEntitlements(ent)` derives the
  `PracticeAccessPolicy` from the *server's* capabilities. The client no longer
  *assumes* unlimited practice, it *reads* it.
- **Local** — `currentPracticeAccess()` is the explicit local-development policy;
  local mode never calls Supabase (`LOCAL_DEV_ENTITLEMENTS`, `source: 'local_dev'`).

This stays a **UI-affordance** mapping — the server still authorises every
practice start. Capabilities only decide what copy/affordances to show; they never
grant access to a server resource.

## 7. Premium-preview surfaces

Honest "coming later" surfaces that explain future value **without pretending
purchasing exists** — no price, product id, SKU, or Buy/Subscribe/Restore action:

- **Profile card** ([`src/screens/ProfileScreen.tsx`](../src/screens/ProfileScreen.tsx)):
  "BrainBrew Premium · Coming later", the beta note, the ranked-fairness line, and
  a "Learn what's planned" action.
- **Premium info screen** ([`src/screens/PremiumScreen.tsx`](../src/screens/PremiumScreen.tsx)):
  the planned catalogue (from `PREMIUM_PREVIEW`), an "Included in beta" marker
  driven by the live entitlement, the fairness promise, and a plain disclaimer
  that nothing is for sale. Nav is an overlay in [`App.tsx`](../App.tsx)
  (`showPremium`), loaded lazily and never on the play path.

## 8. Privacy & security

- No payment, provider, receipt, transaction, customer id, payment method, or
  card field ever exists in the contract. `ENTITLEMENT_FORBIDDEN` rejects them
  (and identity/token/answer keys) recursively at any depth — tested.
- `auth.uid()`-scoped, `authenticated`-only, no user parameter → no cross-user
  read and no injection surface.
- No entitlement is trusted for a competitive advantage; ranked stays
  server-authoritative and independent.
- Not a generic feature-flag framework — a fixed, reviewed capability set only.

## 9. Performance

`get_my_entitlements` is a constant-returning STABLE function (no table scan). The
client caches it for the session and reads it lazily only when a Premium surface
opens — never on the Home/pack/ranked fast path. No Realtime, no polling.

## 10. Tests

- `npm run db:entitlement-test` — beta for anonymous + permanent, all 16
  capabilities present with correct booleans, `ranked_attempts_per_utc_day === 1`
  invariant, no-user-parameter, `anon` denied, no leak fields.
- `npm run test:cloud` — `validateEntitlements` (parse, clamp-to-1, premium-payload
  still 1, unknown/missing capabilities, locked, forbidden fields), `hasCapability`
  fail-closed, `LOCAL_DEV_ENTITLEMENTS`, `practiceAccessFromEntitlements`, the
  preview catalogue carries no commerce fields and no ranked advantage.
- `npm run cloud:entitlement-check` — the DEPLOYED RPC with isolated users: beta
  for anon + permanent, ranked-limit-1, no leak fields, upgrade preserves policy,
  cross-user surface absent, unauthenticated denied.
