# BrainBrew Premium — Product Model

The permanent product rules for what is Free, what Premium may **later** unlock,
and — most importantly — what Premium must **never** touch. This is the reference
the entitlement contract, the preview UI, and every future commerce phase must
obey. It is a product/decision document; the mechanism lives in
[`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md).

> Nothing here authorises building purchases. As of Phase 7D there is **no store,
> no price, no product, no receipt, and no provider.** Everyone is on the beta
> policy. This document exists so that when commerce is built, it cannot drift
> from these rules.

---

## 1. Free for everyone, forever

Never paywalled, never degraded to sell an upgrade:

- The **one daily ranked Brew** (five puzzles, identical worldwide, one attempt
  per UTC day).
- Global and country **leaderboards**.
- The **ranked streak** and basic ranked progress/history.
- **Basic Practice** (unranked).
- **Share cards**.

The core daily ritual is the product. It is complete on its own.

## 2. Premium may LATER unlock (all optional, all off today)

Every one of these is **additive and non-competitive** — a side activity or a
cosmetic, never an edge in the daily ranked ladder:

| Capability | What it adds |
| --- | --- |
| `unlimited_practice` | Unlimited unranked Practice Brews. *(Included for everyone during beta.)* |
| `archives` | Replay past daily packs as unranked practice. |
| `category_training` | Focused unranked drills in a single category. |
| `difficulty_selection` | Choose an easier/harder practice set. |
| `advanced_practice_stats` | Deeper unranked practice insights. |
| `advanced_ranked_stats` | Richer *views* of your own already-earned ranked history (never new points). |
| `bonus_packs` | Extra unranked puzzle packs. |
| `premium_themes` | Cosmetic visual themes only. |
| `private_tournaments` | Separate, invite-only brews — never part of the global ranked ladder. |

Pricing, tiers, trial terms, and which of these ship first are **undecided** and
deliberately out of scope here.

## 3. Premium must NEVER unlock — the fairness invariant

This list is permanent. Any future change that would grant one of these is a bug,
not a feature:

- **Additional ranked attempts** or ranked **score retries**.
- **Higher leaderboard weighting**, **extra ranked points**, or any scoring boost.
- **Earlier access to ranked answers** or the daily pack.
- **Country changes** outside the normal restrictions.
- **Anti-cheat exemptions**.
- Any **competitive advantage** in ranked play, direct or indirect.

Mechanically guaranteed by the constant `ranked_attempts_per_utc_day = 1` (SQL +
client clamp + independent server enforcement) and by the fact that **no
capability maps to a ranked lever**. See
[`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) §3 and
[`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md).

`advanced_ranked_stats` is the one Premium capability that *touches* ranked data —
it only ever presents a richer view of history the player already earned; it never
creates, alters, or reweights a ranked result.

## 4. Entitlement states (product view)

- **beta** — today. Everyone. Unlimited Practice, no Premium extras, no paywall.
- **free** — a future non-paying tier. Everything in §1; Practice may be capped
  (a `free_practice_brews_per_period` limit); no Premium extras.
- **premium** — a future paying tier. §1 plus the §2 extras. Never §3.
- **grace_period** — a lapsed payment still honoured briefly; treated as premium.
- **expired** — reverted to `free` capabilities; no data deleted.

Only `beta` exists in 7D. The others are named now so the contract and UI never
have to change shape to add them.

> **Phase 7E status.** The provider boundary below is now BUILT (RevenueCat
> integration, webhook, `player_entitlements`, real `premium` state) and verified
> in sandbox-safe tests — but **no public billing has launched**. The release
> policy stays `beta_open`: everyone keeps unlimited Practice, purchases are
> exercised only in sandbox, and `production_paywall` is defined but inactive. See
> [`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md).

## 5. Boundary to a purchase provider (RevenueCat) — built in 7E

The design below is realized in Phase 7E:

- A provider (RevenueCat/StoreKit/Play Billing) owns purchase + receipt validation
  **server-side only**. The client never validates a receipt or trusts a purchase.
- A **webhook** writes the resulting state into a private `player_entitlements`
  table; `get_my_entitlements` reads it and falls back to `beta`/`free`.
- The client contract (`ValidEntitlements`) **does not change** — new states plug
  into the existing shape.
- **Do not** populate fake provider identifiers, product ids, or prices anywhere
  before that phase. There are none in the codebase today, by design.
- Restore Purchases, subscription management, and paywalls are that phase's work,
  not 7D's.

## 6. Decision log

- **Policy-only RPC, no `player_entitlements` table (7D).** *Reason:* everyone is
  `beta` with an identical policy, so a table would be empty and add no value now.
  *Alternative considered:* create the table immediately for "future-proofing" —
  rejected as dead scaffolding. *Revisit when:* the first provider webhook needs
  to persist a real per-player state; adding the table then is additive and does
  not change the read contract. (See [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) §4.)
- **Ranked limit is a hard constant, not an entitlement value.** *Reason:*
  fairness must not be expressible as a purchasable number. *Alternative:* carry
  the limit as data keyed by state — rejected because it would make "sell an extra
  attempt" a one-line change. Defended in SQL, client clamp, and server
  enforcement independently.
- **No client-controlled `isPremium` boolean.** *Reason:* a single client flag is
  trivially spoofable and collapses the capability model. The server returns a
  structured, validated capability set instead.
- **Introduce `player_entitlements` + provider webhook in 7E (reversing 7D's
  no-table decision).** *Reason:* the trigger condition set in 7D — a provider
  webhook needing to persist per-player state — now holds. *Alternative:* keep
  policy-only — rejected because real subscriptions must survive restarts and
  devices. Additive; the read contract shape and fairness invariant are unchanged.
- **Explicit `release_policy` mode, never inferred from build type.** *Reason:*
  whether the paywall is active is a deliberate Founder decision with real user
  impact, not a side effect of a debug/release build. *Alternative:* gate on
  `__DEV__`/build flavor — rejected as accident-prone and unauditable. The mode is
  a single service-role-controlled row and doubles as the rollback kill-switch.
- **Webhook never trusts its own body; it re-fetches subscriber state.** *Reason:*
  an unauthenticated body is not proof of entitlement, and per-event logic drifts.
  *Alternative:* apply the event payload directly — rejected as spoofable and
  inconsistent. One canonical representation, mapped one way.
