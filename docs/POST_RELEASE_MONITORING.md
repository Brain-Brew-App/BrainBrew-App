# Post-Release Monitoring

What to watch, what "bad" looks like, and what to do. Ordered by how much damage the
failure does.

## First hour

| Signal | Where | Bad looks like | Action |
|---|---|---|---|
| Ranked started vs completed | `attempts` (`is_ranked`, `status`) | completion ratio drops → players stuck mid-brew | check `complete-attempt` errors — this is the burned-attempt failure class |
| Edge Function errors | Supabase → Functions → Logs | sustained non-2xx on `start-attempt` / `submit-answer` / `complete-attempt` | roll that function back (seconds) |
| `no_live_pack` | function logs | any occurrence at all | publish packs immediately — every player is blocked |
| Crash-free rate | Play Console | below 99% | halt rollout |

## Billing (once Play Billing is live)

| Signal | Where | Bad looks like |
|---|---|---|
| `revenuecat_webhook_events` | Supabase | rows with `status = 'error'` or `'quarantined'` |
| purchase → entitlement latency | `received_at` → `processed_at` | a growing gap |
| `provider_auth_failed` | reconcile logs | the RevenueCat secret is wrong or expired (e.g. a v2 key) |
| Premium without payment | `player_entitlements` vs RevenueCat | any divergence — investigate immediately |

**The invariant to alert on:** a `player_entitlements` row in state `premium` whose
`current_period_end` has passed and which is not in a grace period. The read-time clamp
makes this *safe* (it reads as `expired`), but its existence means webhooks are not
arriving.

## Fairness — never let this slip quietly

- Any user with **more than one ranked attempt in a single UTC day is a P0.**
- Archive attempts must always be `is_ranked = false`.
- `get_my_entitlements().limits.ranked_attempts_per_utc_day` must always be `1`.

## Analytics quality

- Events tagged `environment = 'production'` should contain no QA accounts. If they do,
  the QA identities were never flagged in `analytics_subject_flags`.
- A sudden drop in `analytics-ingest` acceptance means a client/server contract
  mismatch.

## What NOT to page on

- Supabase advisor WARNs (SECURITY DEFINER RPCs, anonymous sign-in) — by design.
- `offering_unavailable` on the paywall while the policy is `beta_open` — expected;
  nobody is being charged.
