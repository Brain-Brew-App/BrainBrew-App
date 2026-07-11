# Admin Security Model (Phase 7F)

How the Admin Command Center authenticates operators, enforces role permissions
server-side, audits every action, and keeps privileged credentials off the
browser. The guiding rule: **hiding a button is never the security boundary** —
every privileged read/action is verified server-side against the database.

---

## 1. Identity

- **Supabase Auth, permanent accounts only.** No anonymous admin, no signup page.
- An operator is an admin **iff** they have an `admin_users` row with
  `status='active'`. The role is read from the DB (`admin_role_of`), never from a
  client claim, a JWT custom claim, or an email domain.
- Roles (`admin_role` enum): `founder`, `super_admin`, `product_admin`,
  `content_admin`, `finance`, `support`, `engineering`, `viewer`.
- Founder/super_admin are granted ONLY via the privileged CLI
  (`scripts/db/set-admin-role.mjs`, service-role, audited) — never through the UI.
- Disable/suspend by setting `status` — `admin_role_of` returns null immediately,
  locking the account out on the next request.

## 2. Request flow (defence in depth)

1. **Middleware** ([`middleware.ts`](../apps/admin/middleware.ts)) refreshes the
   session cookie and redirects unauthenticated requests to `/login`.
2. **Every page/action** calls `requireAdmin()` / `requireCapability(cap)`
   ([`lib/auth.ts`](../apps/admin/lib/auth.ts)) — the authoritative gate. It
   resolves the verified user (`auth.getUser()`), looks up the active role via the
   service role, and checks the capability against the DB matrix.
3. **The permission matrix is the DB function `admin_can(role, capability)`** — the
   single source of truth, shared by server enforcement and UI visibility, so they
   can never diverge.

## 3. RBAC matrix (summary)

| Capability (examples) | founder | super_admin | product | content | finance | support | engineering | viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| view_overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| view_revenue | ✓ | ✓ | – | – | ✓ | – | – | – |
| lookup_user / moderate_user | ✓ | ✓ | – | – | – | ✓ | – | – |
| manage_content / publish_pack | ✓ | ✓ | – | ✓ | – | – | – | – |
| set_maintenance / request_restart | ✓ | ✓ | – | – | – | – | ✓ | – |
| manage_admins | ✓ | ✓ | – | – | – | – | – | – |
| view_investor (aggregate only) | ✓ | ✓ | – | – | – | – | – | ✓ |

Full matrix: `admin_can` in `20260722090000_admin_foundation.sql`. Finance cannot
restart the DB; support cannot see revenue; content cannot manage admins; viewer
cannot mutate anything — all enforced and tested (`npm run db:admin-test`).

## 4. Audit log

- `admin_audit_log` is **append-only**: a trigger blocks UPDATE/DELETE and grants
  are revoked, so ordinary admins can never rewrite history.
- Every mutation writes an entry via `writeAudit` → `admin_log`: who, role, action,
  target, safe summary, reason, request id, IP hash, success, approval ref.
- Summaries are recursively **scrubbed** ([`lib/audit.ts`](../apps/admin/lib/audit.ts))
  of secrets, tokens, passwords, payment/provider ids, and raw answers — audit rows
  can never accumulate sensitive data. Emails are never logged (UUID only).
- Audited: role changes, maintenance changes, incidents, entitlement resync, result
  invalidation, pack publication, restart requests, exports.
- Audit viewing is restricted to founder/super_admin/engineering.

## 5. Secrets & the browser boundary

- The **service-role key** and **Management token** are read ONLY in server code
  and are never `NEXT_PUBLIC_*` — they never enter the client bundle.
- The browser never calls Supabase directly (CSP `connect-src 'self'`); it talks
  only to the admin's own server routes, which hold the privileged clients.
- Security headers ([`next.config.mjs`](../apps/admin/next.config.mjs)): strict CSP,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `no-referrer`,
  `noindex`, HSTS in production. `robots.ts` disallows all crawling.

## 6. Destructive-action guardrails

- **Maintenance changes** require capability + **reauthentication** (re-enter
  password) + a mandatory reason, and are audited.
- **Project restart** (documented, not yet a live action) additionally requires
  founder/engineering + a typed confirmation phrase + maintenance-first + the
  server-only Management token + post-restart health verification. See
  [`ADMIN_OPERATIONAL_RUNBOOK.md`](ADMIN_OPERATIONAL_RUNBOOK.md).
- There is **no** arbitrary SQL, raw DB editor, DB reset/delete, connection-string
  exposure, password/token viewing, or one-click destructive stop anywhere.

## 7. Tests

`npm run db:admin-test` proves: role resolution (active only), the full permission
matrix (finance≠restart, support≠revenue, content≠manage-admins, viewer≠mutate),
audit append + immutability, maintenance server-enforcement, KPI formula
correctness, and that no client role (anon/authenticated) can read admin tables or
call admin RPCs. Mutation cases (trust client role, skip audit, expose secrets)
fail by construction — the service role is server-only and the matrix is in the DB.
