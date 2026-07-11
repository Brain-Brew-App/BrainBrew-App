# Admin Data Privacy (Phase 7G)

What the analytics + admin surfaces collect, retain, and expose — and the hard
limits that protect players.

---

## 1. Collected (analytics events)

User UUID (internal), platform, app version, environment, country snapshot,
screen/category/engine/attempt_purpose, timestamps, and small **safe** flat
properties. That's it.

## 2. Never collected / never stored

Full IP (indefinitely), contacts, GPS coordinates, advertising IDs (IDFA/GAID),
device fingerprints, puzzle answers, emails (in analytics), provider/customer
identifiers, payment-card data, raw Auth/provider tokens. Enforced by the client
scrub **and** the server `analytics_props_safe` guard (defence in depth).

## 3. Retention

- Raw `analytics_events`: retained ~90 days for operational debugging, then rolled
  up into daily aggregates and the raw rows deleted.
- Daily rollups: retained indefinitely (aggregate, no PII).
- A user-deletion request cascades: events are keyed by UUID (`on delete set null`
  / deletable), entitlements/attempts follow the existing account-deletion workflow.
- IP is only ever a salted hash in the admin audit log (never analytics), and only
  where legally appropriate.

## 4. Exposure by role (RBAC)

- **Viewer/Investor:** aggregates only — no user list, UUIDs, emails, or actions.
- **Support:** safe per-user status (profile, account type, country, entitlement
  state, activity) — never tokens, passwords, provider ids, raw answers, or
  anti-cheat thresholds.
- **Finance:** revenue/subscription operations — no answers or security internals.
- **Content:** content/engine analytics — no infra secrets or admin management.
- **Answer keys:** only Founder / Content Admin / explicitly-authorized Engineering.
- The **service-role key + Management token** are server-only and never reach the
  browser bundle.

## 5. Audit privacy

`admin_audit_log` summaries are recursively scrubbed of secrets, tokens, payment/
provider ids, emails, and raw answers before write. Audit references users by UUID,
never email.

## 6. Exports

Aggregated exports only. They never include emails, provider identities, UUIDs (for
investor roles), tokens, answers, audit IP hashes, or integrity reasons.

## 7. No advertising / tracking

No third-party advertising SDKs, no cross-app tracking, no ad identifiers — by
policy and by the ingestion allowlist/guard. BrainBrew analytics exist solely to
operate and improve the product.
