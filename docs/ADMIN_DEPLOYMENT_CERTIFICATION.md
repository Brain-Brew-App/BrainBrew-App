# Admin Deployment & Restart Certification (Phase 7G)

Two gated procedures: deploying the admin app to Vercel, and the (still-disabled)
Supabase project-restart control.

---

## 1. Vercel deployment (see also VERCEL_ADMIN_DEPLOYMENT.md)

Separate Vercel project rooted at `apps/admin`, domain `admin.brainbrew.dev`
(brainbrew.dev DNS is Vercel-managed, so the subdomain + TLS is one API call).
Server-only env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_PROJECT_REF`. Preview Deployment Protection ON. Security headers + noindex
verified in the build.

**Certification checklist (deploy):**
- [ ] Project created (root `apps/admin`, Next.js preset, Node 20).
- [ ] Env set for Production + Preview (no `NEXT_PUBLIC_` secret).
- [ ] `admin.brainbrew.dev` attached, valid TLS.
- [ ] Preview protection enabled.
- [ ] Founder role granted (`set-admin-role.mjs`), login verified on the live URL.
- [ ] Player apex + web player unaffected.

## 2. Project RESTART — DISABLED, not certified

The restart control is present in the UI but **disabled** and labelled *"Not
certified for production use"*. The Management adapter
([`apps/admin/lib/management.ts`](../apps/admin/lib/management.ts)) reports
`restartEnabled = false` unless BOTH `ADMIN_RESTART_CERTIFIED=true` and a
`SUPABASE_MANAGEMENT_ACCESS_TOKEN` are set — and even then only after this
certification. **No Management token is required for Phase 7G completion.**

**Certification prerequisites (all required before enabling):**
1. Admin deployment verified (§1).
2. Reauthentication flow verified in production.
3. A restart tested on a **non-production** Supabase project.
4. Rollback/runbook tested.
5. Management token stored ONLY in Vercel server env (never browser/DB/git/logs).

**When enabled, the live control MUST:** be founder/engineering only · require
reauth + a typed confirmation phrase · enable maintenance mode first · show an
active-user/attempt warning · call the Management API from a server-only Route
Handler · poll operation state · run post-restart health verification · audit
`request_restart` / `restart_completed`.

Restart terminates active workloads — treat it as an **incident** operation. Until
certified, the runbook is: maintenance mode from the dashboard → restart via the
**Supabase Dashboard** → verify via the Health page. Pause/Delete/Reset are never
exposed in the app.

## 3. Tests

The disabled control + mock adapter are exercised without any real Management call.
The live restart is deliberately never executed by automated tests (a mocked
adapter is used); a real run happens only in the separate, Founder-approved gate.

---

# Phase 7I certification run

Target: BrainBrew `brainbrew-admin`, production `admin.brainbrew.dev`. Commit
certified: **`8f590e0`** (Phase 7I.2D), deployed. Player project untouched.

## Executed and PASSED (no credentials required)
| Check | Result |
|---|---|
| Failure-injection production-safety proof + Task-29 mutation (`test:failure-injection`) | **11 pass** — production can never activate injection |
| Incident void/recalc/retry (`db:incident-void-test`) | **29 pass** |
| Revision + structured diff (`db:revisions-test`) | **18 pass** |
| Pack draft→publish (`db:pack-drafts-test`) | **42 pass** |
| Authoring review machine (`db:authoring-test`) | **23 pass** |
| 15 engine forms (`test:authoring-forms`) | **323 pass** |
| Root/pure (`test`) | **102 pass** |
| Canonical parity 326/50 (`db:import-check`) | **unchanged** |
| Secret scan + git-history scan | clean (only `xxxx…` placeholders) |
| Admin TypeScript · Admin production build · mobile TypeScript | clean · ✓ · clean |
| Route-protection Playwright vs production (`auth.spec`) | **18/18 pass** (direct-URL denial + CSP/HSTS/noindex/X-Frame) |
| Credentialed suite without secrets (`rbac.spec`) | **9 skipped cleanly** — cannot false-pass |

## BLOCKED: credentialed browser run (Founder/CI step)
Written + matrix-driven + verified-to-skip, but **not executed here** — blocked on
two Founder-owned prerequisites:
1. **No `ADMIN_E2E_*` credentials** configured anywhere → cannot provision or log in.
2. **No Vercel access** — `.env.vercel.local` deleted + token revoked (Phase 7G
   directive) → cannot deploy/configure a protected Preview.
3. **No isolated/preview Supabase** — destructive lifecycle E2E against production is
   forbidden, so it must target a protected Preview + safe fixtures (absent here).

Running it anyway would fabricate a pass or run destructive tests against production —
both prohibited — so it was **not run**.

## Runbook to complete formal sign-off
1. Set `ADMIN_E2E_<ROLE>_EMAIL/PASSWORD` (8 roles) + `SUPABASE_URL`/`SUPABASE_SECRET_KEY`
   in ignored CI/Vercel secrets. `npm run admin-e2e:provision` → `admin-e2e:verify`.
2. Deploy a **protected** Preview of `8f590e0`+ with those secrets and
   `ADMIN_FAILURE_INJECTION=1` (Preview only). Prove production has the flag OFF.
3. `ADMIN_E2E_BASE_URL=<preview> npm run e2e` (auth/RBAC/puzzle/pack/incident). Traces
   on failure only, no secrets.
4. `npm run admin-e2e:cleanup`. Confirm parity + Supabase Advisor + production never
   subjected to injection/destructive tests.

## Verdict
Automated, security, data-integrity, parity and route-protection certification:
**PASSED**. Credentialed browser certification: **NOT YET EXECUTED** (blocked above).
**Phase 7I is functionally complete + automated-certified, but not formally signed
off** — sign-off requires the credentialed run.
