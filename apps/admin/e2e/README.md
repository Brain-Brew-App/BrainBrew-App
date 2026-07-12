# Admin E2E (Playwright) — Phase 7I.2D

Isolated to `apps/admin`. Never targets the player Vercel project.

## Runnable now (no credentials)
`auth.spec.ts` — route-protection + security-header certification against
production or a preview. Every sensitive route must redirect an unauthenticated
request to `/login` with `noindex` + HSTS + `X-Frame-Options: DENY`.

```
npx playwright install chromium      # once
ADMIN_E2E_BASE_URL=https://admin.brainbrew.dev npm run e2e -- auth.spec.ts
```

## Credentialed suite (CI / protected preview)
`rbac.spec.ts`, `puzzle.spec.ts`, `pack.spec.ts`, `incident.spec.ts` drive the
full lifecycles with per-role **non-production** test users. Requirements:

- Test users provisioned with roles: founder, content_admin, engineering,
  finance, support, viewer, ordinary-player, disabled-admin.
- Test subjects flagged `exclude_from_business_kpis`.
- Credentials in ignored CI/Vercel secrets `ADMIN_E2E_{ROLE}_EMAIL/PASSWORD`
  (never committed; never printed in traces — `trace: retain-on-failure` only).
- Target a **protected preview** with isolated fixtures + a test-only failure-
  injection adapter (`?inject=` gated to preview/local; impossible in production).
- Deterministic setup/teardown that never touches real player daily content.

Status: `auth.spec.ts` is implemented and runnable. The credentialed specs are
scaffolded here as the remaining certification work (they need the test-user
secrets + a preview target to execute) — tracked in
`docs/FOUNDER_POST_PHASE9_QA.md`.
