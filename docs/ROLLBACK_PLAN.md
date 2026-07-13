# Rollback Plan

The three layers roll back **independently and at very different speeds**. Work out
which layer broke before touching anything — rolling back the wrong one makes it worse.

| Layer | Speed | Mechanism |
|---|---|---|
| App (Play) | Hours–days | Halt rollout / re-promote the previous build. Users are **not** force-downgraded. |
| Edge Functions | Seconds | Re-deploy the previous source. Instantly live for every installed app. |
| Database | **Not reversible** | Forward-only. Fix with a corrective migration. |

## Decision tree

**Is the daily ranked brew broken for everyone?** Highest severity. Ranked play *is*
the product; everything else can wait.

**Did a function deploy break it?** Roll that function back first (seconds), then
diagnose:

```bash
git checkout <prev-sha> -- supabase/functions/<fn>
npm run supabase:deploy-functions
```

**Did a migration break it?** Do **not** attempt a down-migration. Write a corrective
forward migration. A half-reversed schema is worse than a known-bad one.

**Did the app build break it?** Halt the Play rollout immediately. Installed users keep
the broken build until they update — so if the failure is server-compatible, prefer a
**server-side mitigation** over waiting for an app update to propagate.

## Kill switches that need no deploy

- **`release_policy.mode` → `beta_open`** — gives everyone full access and takes the
  paywall out of the picture. Instant, reversible.
- **`operational_flags`** — the gameplay start path checks these and degrades to a calm
  `service_unavailable` rather than crashing.
- **Disable the RevenueCat webhook** — pushes stop, but reconcile (pull on
  purchase/restore) still works, and the read-time expiry clamp still prevents access
  outliving what was paid for.

## What must NEVER be rolled back casually

- **The entitlement expiry clamp** (`effective_entitlement_state`). Removing it lets a
  lapsed subscription keep Premium until a webhook happens to arrive.
- **The ranked-limit invariant** (`ranked_attempts_per_utc_day = 1`). It is a hard
  constant in the RPC, not a config value, precisely so it cannot be rolled back by
  accident.

## Data safety

Attempts, scores and entitlements are append/upsert only — rolling back code never
destroys player data. `sync_player_entitlement` rejects duplicate and out-of-order
events, so replaying webhooks during recovery cannot corrupt entitlement state.
