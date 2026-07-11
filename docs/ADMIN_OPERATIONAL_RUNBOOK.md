# Admin Operational Runbook (Phase 7F)

Safe operating procedures for the Admin Command Center. Every operation is
server-authoritative, permission-gated, and audited.

---

## 1. Maintenance mode

`Maintenance` page (founder/engineering). Set `mode` (normal/degraded/maintenance)
and/or scoped toggles (ranked starts, practice starts, purchases, content
publication) with a player-facing message and optional auto-reset.

- **Server-enforced:** `start_practice_pack` refuses new brews when practice is
  disabled or mode=maintenance (tested). Ranked start and purchase edge functions
  read `get_operational_status()` / `operational_allows(area)` to enforce the same
  — wire these checks into `start-attempt` and the purchase flow as the immediate
  follow-up (the RPCs exist and are public-safe to read).
- Active attempts already in progress are allowed to finish (resume path bypasses
  the guard) — never strand a player mid-brew.
- Requires reauthentication + reason; audited as `set_maintenance`.
- **Rollback:** set `mode=normal` (or let the auto-reset expire).

## 2. Health checks

`System Health` page runs synthetic **read-only** checks (DB read, KPI RPC, live
pack present, webhook error count, operational mode). They never create ranked
data or contaminate analytics. Supabase infra metrics (CPU/latency/backups/PITR)
and Vercel deploy status appear once the Management/Vercel API tokens are wired
(server-only).

## 3. Entitlement resync

For a support case where an entitlement looks stale: re-run the RevenueCat sync
for that user (server calls the provider fetch → `sync_player_entitlement`). This
is idempotent and audited. (Support UI action — part of the User Support build-out;
the server RPC path already exists from Phase 7E.)

## 4. Content parity / advisors

Trigger `npm run supabase:parity` and `npm run supabase:advisors` from the
privileged shell (or wire a server action that shells the equivalent Management
queries later). Results are read-only and safe to surface.

## 5. Supabase project RESTART (documented — NOT yet a live action)

Restart terminates active workloads; treat it as an **incident operation**, not a
casual control. It is intentionally **not implemented as a one-click action** in
this phase. When implemented, it MUST:

1. Be founder/engineering only, behind `request_restart` capability.
2. Require **reauthentication** + a **typed confirmation phrase** + a mandatory
   reason.
3. Put the app in **maintenance mode first** and show an active-user/attempt
   warning.
4. Call the Supabase **Management API** from a server-only Route Handler using
   `SUPABASE_MANAGEMENT_ACCESS_TOKEN` (stored ONLY in Vercel server env — never in
   the browser, DB, logs, or git).
5. Poll operation state and run **post-restart health verification**.
6. Write an audit row (`request_restart` / `restart_completed`).

Until then, the runbook is: put the app in maintenance mode from the dashboard,
then restart via the **Supabase Dashboard** directly, then verify with the Health
page. **Never** expose Pause/Delete/Reset — use the Supabase Dashboard for those,
under a separate approval.

## 6. Prohibited operations

No arbitrary SQL, no raw DB editor, no DB reset/delete/pause from the app, no
connection-string exposure, no browser-side service-role key, no destructive
one-click stop. These are absent by design.

## 7. Admin role management

Grant/disable roles ONLY via `node scripts/db/with-secrets.mjs node
scripts/db/set-admin-role.mjs <email|uuid> <role> [--disable]` from a privileged
shell. Audited. The person must have signed in once (so an `auth.users` row
exists). Founder/super_admin are never grantable from the UI.
