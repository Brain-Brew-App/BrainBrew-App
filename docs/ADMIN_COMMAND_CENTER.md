# BrainBrew Admin Command Center (Phase 7F)

A separate, internal Next.js web application for operating BrainBrew — executive
KPIs, product/gameplay/revenue analytics, content operations, support, health
monitoring, and incident/maintenance controls. It is **not** accessible to
players. This phase delivers the **security spine + analytics foundation + a
working dashboard skeleton** (7F.1, the server side of 7F.2/7F.6, and Overview +
operational pages); the remaining analytics breadth is scaffolded with honest
empty states and listed as follow-up.

Read [`ADMIN_SECURITY_MODEL.md`](ADMIN_SECURITY_MODEL.md),
[`KPI_DICTIONARY.md`](KPI_DICTIONARY.md),
[`ANALYTICS_EVENT_MODEL.md`](ANALYTICS_EVENT_MODEL.md),
[`ADMIN_OPERATIONAL_RUNBOOK.md`](ADMIN_OPERATIONAL_RUNBOOK.md),
[`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md),
[`VERCEL_ADMIN_DEPLOYMENT.md`](VERCEL_ADMIN_DEPLOYMENT.md).

> **No fake metrics.** Every figure is backed by a real RPC over canonical tables.
> Metrics that need data BrainBrew doesn't have yet (store prices → MRR/ARR;
> mobile analytics events → funnels/retention) render an explicit **pending**
> state — never a fabricated number.

---

## 1. Architecture & folder structure

- **Isolated app** at [`apps/admin/`](../apps/admin) with its **own** `package.json`
  — it is NOT a workspace and does not touch the root Expo app, its lockfile, or
  its web build. The mobile app is unaffected.
- **Next.js 15 App Router**, server-first. Privileged data is read only in Server
  Components / Server Actions / Route Handlers; the browser never gets the service
  role.
- **Two Supabase clients** ([`lib/supabase.ts`](../apps/admin/lib/supabase.ts)):
  a cookie-bound *session* client (anon key) to verify identity, and a *service
  role* client used only after an admin check.
- **Deployment:** a **separate Vercel project** rooted at `apps/admin`, served at
  **`admin.brainbrew.dev`** (recommended — zero impact on the player site at the
  apex). The `/admin` path alternative is documented in
  [`VERCEL_ADMIN_DEPLOYMENT.md`](VERCEL_ADMIN_DEPLOYMENT.md).

```
apps/admin/
  app/
    layout.tsx  globals.css  robots.ts
    login/        (page + server actions; no signup)
    denied/
    (dash)/       layout (auth gate + nav + banners)
      page.tsx    Overview (real KPIs)
      health/  maintenance/  audit/  incidents/
  lib/  supabase.ts  auth.ts  audit.ts  kpi.ts
  middleware.ts  next.config.mjs  .env.example
```

## 2. Pages

Built now: **Overview**, **System Health**, **Maintenance**, **Incidents**,
**Audit Log**, **Login**, **Denied**. Scaffolded (nav shows "planned", gated by
capability, ready for their RPCs): Users, Growth & Retention, Gameplay, Categories
& Engines, Puzzles, Daily Packs, Revenue, Content Review, Reports, Admin Settings.

## 3. Data sources

Server RPCs (service-role, defined in migrations `20260722091000_admin_kpis.sql`):
`admin_kpi_overview`, `admin_active_users`, `admin_ranked_funnel`,
`admin_revenue_snapshot`, `admin_category_stats`. All UTC, all from canonical
tables. See [`KPI_DICTIONARY.md`](KPI_DICTIONARY.md) for exact formulas — the UI
tooltips use the same registry (`lib/kpi.ts`).

## 4. What is real vs pending

| Area | Status |
| --- | --- |
| Users, DAU/WAU/MAU, ranked/practice completion, avg BrewScore | **Real** (canonical data) |
| Subscription counts, webhook reconciliation | **Real** (sandbox data until launch) |
| MRR/ARR/ARPPU/LTV | **Pending** — needs store price data |
| Retention cohorts, funnels, per-engine/puzzle deep analytics | **Pending** — needs mobile analytics events (see [`ANALYTICS_EVENT_MODEL.md`](ANALYTICS_EVENT_MODEL.md)) |
| Supabase infra metrics, Vercel deploy status | **Pending** — needs Management/Vercel API tokens |

## 5. Known limitations (this phase)

- The admin app was **not built or deployed** in the implementation environment
  (no Vercel/DNS access); Founder runs the deploy per the deployment doc.
- Analytics events are **not yet instrumented in the mobile app**, so retention/
  funnel/engine-drilldown pages are scaffolds until that lands.
- Restart-project control is intentionally **not implemented as a live action**
  yet (documented procedure only) — it needs the Management token + a Founder-
  approved non-production test first.

## Phase 7G update

Analytics ingestion + rollups are live; Users, Retention, Gameplay, Categories &
Engines, Revenue, and Investor pages are now REAL (RPC-backed, verified against the
deployed project). Ranked + Practice starts are maintenance-enforced server-side.
The project-restart control exists but is disabled ("not certified"). See
[`ADMIN_DASHBOARD_PAGES.md`](ADMIN_DASHBOARD_PAGES.md) and
[`ADMIN_DEPLOYMENT_CERTIFICATION.md`](ADMIN_DEPLOYMENT_CERTIFICATION.md). Vercel
deployment to admin.brainbrew.dev is the remaining Founder-gated step.
