# Vercel Admin Deployment (Phase 7F) — Founder Runbook

How to deploy the isolated admin app at [`apps/admin`](../apps/admin). **This was
not deployed by the implementer** (no Vercel/DNS access); these are the exact
Founder steps. The existing player web deployment at the apex is **untouched** —
the admin app is a *separate* project.

---

## 1. Routing decision (recommended: subdomain)

- **Recommended:** a **separate Vercel project** rooted at `apps/admin`, domain
  **`admin.brainbrew.dev`**. This fully isolates the admin app from the player
  site currently served at `brainbrew.dev` (the Expo web build) — no risk of
  clobbering it, independent build settings, independent env.
- **Alternative:** serve the admin at `brainbrew.dev/admin` via a rewrite from the
  existing project. Only do this if you want one project; it couples the two builds
  and needs a monorepo-aware config. The subdomain is cleaner.

Do **not** make the admin login the public homepage. The apex keeps serving the
player app (or a "Coming Soon" page if you later choose one — not added here to
avoid disturbing the live apex).

## 2. Create the Vercel project

1. Vercel → Add New → Project → import the existing GitHub repo
   (`Brain-Brew-App/BrainBrew-App`).
2. **Root Directory:** `apps/admin`.
3. **Framework Preset:** Next.js. **Node:** 20.x. Build/Output: defaults.
4. **Domains:** add `admin.brainbrew.dev`; create the DNS `CNAME` Vercel shows.

## 3. Environment variables (Project → Settings → Environment Variables)

Set for **Production** and **Preview** (values from your Supabase/RevenueCat
dashboards — never commit them). All are **server-only** (no `NEXT_PUBLIC_`):

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | project URL |
| `SUPABASE_ANON_KEY` | admin's own login session (publishable/anon) |
| `SUPABASE_SECRET_KEY` | service role — privileged reads (server only) |
| `SUPABASE_PROJECT_REF` | project ref |
| `SUPABASE_MANAGEMENT_ACCESS_TOKEN` | *(optional)* enables the restart procedure; omit to disable |

Never reuse `EXPO_PUBLIC_*` names here. The `.env.example` in `apps/admin` lists
these.

## 4. Deployment protection

- **App-level RBAC is mandatory** (built in) — an active `admin_users` row is
  required regardless of any Vercel setting.
- Enable **Vercel Deployment Protection** on **Preview** deployments (Standard
  Protection / password) so preview URLs aren't publicly reachable.
- Do **not** rely on an obscure URL as security.
- Security headers (CSP, HSTS, `X-Frame-Options: DENY`, `noindex`) ship from
  `next.config.mjs`; `robots.ts` disallows crawling.

## 5. First admin

After the first deploy, the Founder must sign in once with a Supabase email/
password account, then grant themselves the role from a privileged shell:

```bash
node scripts/db/with-secrets.mjs node scripts/db/set-admin-role.mjs you@brainbrew.dev founder
```

Then log in to `admin.brainbrew.dev` — the Overview loads real KPIs.

## 6. Build & verify locally (optional, before Vercel)

```bash
cd apps/admin
npm install
cp .env.example .env.local   # fill in real server values (git-ignored)
npm run build && npm run start
```

## 7. Preview vs Production

- Preview builds run on PRs; keep them behind Vercel Protection.
- Production tracks the default branch. Every deploy is immutable and rollback is a
  one-click "Promote previous deployment" in Vercel.
- `productionBrowserSourceMaps` is off so server-adjacent maps aren't shipped.

## 8. Not yet done (Founder-gated)

Vercel project creation, DNS, env values, and the first deploy are **your** steps.
The Management-token restart control stays disabled until you set the token and run
a Founder-approved non-production test.
