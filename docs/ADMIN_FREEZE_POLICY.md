# Admin Freeze Policy (post-Phase 7I)

Phase 7I delivered the complete Admin content-operations + incident platform. With
its close, the **Admin surface is frozen** until the Founder's comprehensive
post-Phase-9 QA concludes. This protects a correctness-critical, security-sensitive
system from scope creep while the player product is the priority.

## Allowed during the freeze
Only changes that fix a real, demonstrated defect:

- **Security fixes** (auth, RBAC, RLS, secret handling, headers).
- **Authentication / session defects** (login, refresh, cookie rotation, mismatch).
- **Data-integrity defects** (canonical parity, void/recalc correctness, audit gaps,
  concurrency races).
- **Incorrect KPI calculations** (a metric proven wrong against source data).
- **Blocking content-operation defects** (authoring/review/promotion/pack publish
  that fails or corrupts state).
- **Blocking incident-operation defects** (void/recalc that fails or drifts).
- **Post-Phase-9 Founder QA findings** triaged as bugs.

Every allowed change must ship with the automated verification the rest of the Admin
already carries (DB test / route-protection / secret scan / canonical parity) and an
entry in the relevant doc.

## NOT allowed during the freeze
Do **not** add, without lifting the freeze:

- New dashboards or analytics views.
- New content workflows or authoring engines.
- New operational controls or support actions.
- Cosmetic redesigns or visual reworks.
- Enterprise/workflow-customization features.
- Bulk destructive operations.
- Anything on the standing product DO-NOT list (AI generation, live puzzle mutation,
  Archives, Category Training, Friends, Apple Sign-In, push, public billing, DB
  restart, impersonation, public status page).

## Lifting the freeze
The freeze lifts only by an explicit Founder decision after post-Phase-9 QA, scoped to
a named new milestone. Until then, `apps/admin` changes are limited to the allowed set
above, and each PR/commit should state which allowed category it falls under.

## Certification status at freeze
The freeze takes effect with Phase 7I **functionally complete and automated-certified**
(see ADMIN_DEPLOYMENT_CERTIFICATION.md § "Phase 7I": failure-injection safety, incident
void/recalc, revision/diff, pack publish, authoring, parity, route-protection 18/18 —
all green). The **credentialed browser certification** (per-role RBAC + puzzle/pack/
incident lifecycle E2E) is **not yet executed** — blocked on the 8 `ADMIN_E2E_*` test
secrets + a protected Vercel Preview (token revoked). Running that suite via the
documented runbook is an allowed, in-scope activity during the freeze (it is
verification, not a new feature) and is the one step remaining for formal sign-off.

## What "frozen" covers
`apps/admin/**`, the Admin RPCs (`admin_*`), the incident-void operations, and the
authoring/pack/revision backends. The canonical content pipeline (`src/content/*`) and
its byte-identical guarantees are likewise not to be perturbed by Admin work.
