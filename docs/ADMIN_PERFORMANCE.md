# Admin Performance (Phase 7H)

The Founder's first human test found the dashboard "very slow." This documents the
measured baseline, the root cause, the budget, and the fixes.

---

## 1. Measured baseline (before)

- **RPC round-trip latency:** ~200–240 ms median (measured client→Supabase).
- **Auth/RBAC network calls per navigation: ~21**, most avoidable:
  - `(dash)` layout: `requireAdmin` (getUser + `admin_role_of` = 2) + **14 × `admin_can`** (one per nav item) + incidents + `get_operational_status` = 18.
  - Each page: `requireCapability` re-ran `getAdminContext` (getUser + `admin_role_of`) **again** (uncached) + 1 `admin_can` = 3.
- Net effect: ~1.5–3 s of pure auth overhead on the critical path **every navigation** (force-dynamic ⇒ no caching), before any page data loaded.

## 2. Root causes (ranked)

1. **`getAdminContext` not memoized** → JWT verified + role resolved twice per page (layout + page).
2. **`admin_can` issued as a DB round-trip per capability** → ~15 network calls/page for a pure function of the role.
3. Layout's two banner queries ran sequentially.
4. `recharts` shipped as a dependency though no chart used it.
5. No route-level loading boundary → whole-page wait.
6. Rollup cron unscheduled → historical queries recomputed live.

## 3. Budget

- Shared shell usable immediately (loading boundary renders instantly).
- First KPIs after ≤ ~1 auth round-trip + the page's own (parallelized) queries.
- Auth/RBAC ≤ 2 network calls per navigation.
- Nav/filter interactions issue **zero** capability RPCs.
- No page downloads an unbounded dataset (all large tables paginated).

## 4. Fixes (after)

- **Request-memoized context** — `getAdminContext` wrapped in React `cache()`
  ([lib/auth.ts](../apps/admin/lib/auth.ts)): JWT verified once, role resolved once,
  shared by layout + page. **Auth calls per navigation: 21 → 2.**
- **In-process RBAC matrix** — [lib/rbac.ts](../apps/admin/lib/rbac.ts) mirrors the
  DB `admin_can`; all capability checks are now synchronous (0 RPCs). A parity test
  (`npm run db:rbac-parity-test`) asserts the mirror equals the DB across all 328
  role×capability pairs, so it can't diverge.
- **Parallelized** the layout's incidents + operational-status queries.
- **`recharts` removed** (40 packages); visualizations are light server-rendered
  HTML/CSS. Per-route client JS is 165 B–1.1 kB; shared ~103 kB.
- **Route loading boundary** ([(dash)/loading.tsx](../apps/admin/app/(dash)/loading.tsx))
  renders a layout-preserving skeleton under the known shell.
- **Rollup cron scheduled** (pg_cron, nightly 00:15 UTC); freshness surfaced via
  `admin_rollup_freshness`. Historical views read rollups; only today/current reads live.
- All large tables (Puzzles, Content, Audit, Incidents, Support) use **server-side
  pagination** with hard caps and validated filters.

## 5. After (measured)

- Auth/RBAC: **2 network calls per navigation** (getUser + admin_role_of), down from ~21.
- `admin_can` RPCs per page: **0** (was ~15).
- Admin production build: 22 routes, shared JS ~103 kB, per-route 165 B–1.1 kB.
- New content RPCs live-verified (admin_puzzles/engine_registry/rollup_freshness OK,
  publishable role denied).

## 6. Known remaining

- `admin_puzzles` uses per-row correlated subqueries for appearance counts — fine
  for the ~326-puzzle library; revisit if the library grows large.
- Panel-level Suspense streaming (KPIs first, secondary panels after) is applied via
  the route loading boundary; finer per-panel streaming is a future refinement.
- Full authenticated-page timing needs a logged-in session; the call-count reduction
  is the deployment-independent proof and was measured directly.
