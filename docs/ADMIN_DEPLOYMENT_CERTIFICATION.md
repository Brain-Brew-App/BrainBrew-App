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
