# Admin E2E & Failure-Injection Testing (Phase 7H)

## Current automated coverage
- **RBAC parity** (`db:rbac-parity-test`) — the in-process TS matrix equals the DB
  `admin_can` across all 328 role×capability pairs (the perf optimization can't
  weaken security).
- **Admin DB security** (`db:admin-test`, 56 checks) — identity/role resolution,
  audit immutability, maintenance enforcement, KPI formulas, and **client-role
  denial on every admin + content + support RPC**.
- **Analytics** (`db:analytics-test`, 27) — ingestion/exclusion/rollups/retention/
  funnel + client denial.
- **Type + build** — root `tsc`, admin `tsc`, admin `next build` (22 routes).
- **Live smoke** — deployed RPCs OK, publishable-role denied, bundle secret scan 0.

## Role matrix (enforced server-side; verified at the DB layer)
Founder = all · Engineering = health/incidents/maintenance, no revenue · Finance =
revenue/reports, no health mutation/answers · Content = puzzles/packs/review, no
admin/revenue · Support = user lookup, no answers/payment/maintenance · Viewer =
aggregates only, no PII/mutations. Direct-URL access is denied by `requireCapability`
independent of nav hiding.

## Failure injection
Health checks are read-only synthetic probes (DB read, KPI RPC, live-pack presence,
webhook errors, operational mode). A production build never activates a failure
state via a query parameter. A test-only fixture layer (env-gated, non-production)
is the recommended next step to assert the Health page flips to FAIL + surfaces
incident guidance without touching production services.

## Deferred (recommended next)
A browser **Playwright** suite driving a preview deployment per role (hidden nav,
Server-Action denial, error/empty/loading states, tablet shell). Not yet added;
the DB-level RBAC/parity + build/type checks are the current security proof. No
production accounts are used in any automated test.

## Phase 7H.2 update

Added DB-level coverage: content-authoring review state machine
(`db:authoring-test`, 23 — validation-gates-approval, two-person control,
promote-to-reserve, security), content mutations (`db:content-mutations-test`, 13),
and canonical builder/validator reuse (`test:canonical-authoring`, 4). Full
**Playwright** per-role + auth/session + content E2E and the failure-injection
adapter remain the next milestone (Part I) — the backend they will drive is live and
DB-tested; per-role RBAC is proven at the DB layer (`db:rbac-parity-test`, 328).

## Phase 7I certification status (see ADMIN_DEPLOYMENT_CERTIFICATION.md)
Playwright now lives in `apps/admin/e2e`: `auth.spec.ts` (route-protection, runs
green **18/18 vs production**), `rbac.spec.ts` (credentialed, matrix-driven via
`e2e/roles.ts`, **skips cleanly without secrets**), and the provisioning tooling
(`admin-e2e:provision/verify/cleanup`). The failure-injection adapter
(`lib/failureInjection.ts`) is env-gated and its production-safety is proven
(`test:failure-injection`, 11, incl. a mutation test). The **credentialed browser
run is not yet executed** — it is blocked on Founder-owned prerequisites (the 8
`ADMIN_E2E_*` passwords + a protected Vercel Preview; the Vercel token was revoked).
The runbook to complete it is in ADMIN_DEPLOYMENT_CERTIFICATION.md § "Phase 7I".
