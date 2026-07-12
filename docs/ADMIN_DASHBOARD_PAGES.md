# Admin Dashboard Pages (Phase 7G)

The route inventory, the data each page reads, and its build status. Nav items are
**hidden** for roles that lack the capability; the server re-enforces on direct URL
entry.

---

| Page | Route | Capability | Status | Data source |
| --- | --- | --- | --- | --- |
| Overview | `/` | view_overview | **Real** | admin_kpi_overview / active_users / funnel / revenue_snapshot |
| Users | `/users` | view_users | **Real** | admin_kpi_overview + profiles (country) |
| Retention | `/retention` | view_growth | **Real** | admin_retention (cohorts, D1–D30) |
| Gameplay | `/gameplay` | view_gameplay | **Real** | admin_gameplay_daily + activation_funnel (+ Refresh rollups) |
| Categories & Engines | `/engines` | view_engines | **Real** | admin_engine_stats (informational flags) |
| Revenue | `/revenue` | view_revenue | **Real** | admin_revenue_snapshot (subscription states + reconciliation) |
| Investor | `/investor` | view_investor | **Real** | aggregated KPIs, no PII |
| System Health | `/health` | view_health | **Real** | synthetic read-only checks |
| Maintenance | `/maintenance` | set_maintenance | **Real** | operational_flags + disabled restart control |
| Incidents | `/incidents` | view_incidents | **Real** | admin_incidents |
| Audit Log | `/audit` | (founder/super/eng) | **Real** | admin_audit_log |
| Puzzles | `/puzzles` | view_puzzles | Planned stub | — |
| Daily Packs | `/packs` | view_packs | Planned stub | — |
| Content Review | `/content` | view_content | Planned stub | — |

## Notes

- **No fake data.** Metrics needing mobile events (platform split, UI-only funnel
  stages) or store prices (MRR/ARR/ARPPU) render an explicit **pending** state.
- **Real KPIs are live-verified** against the deployed project (31-day rollup
  backfill, retention cohorts, subscription counts, ingest E2E).
- Planned stubs show an honest "planned" message and are gated by capability — they
  never display placeholder charts as real information.
- Filters: a reusable, server-validated `parseRange` contract
  ([`apps/admin/lib/filters.ts`](../apps/admin/lib/filters.ts)) with bounded date
  windows; wired into the shared date bar. Full cross-page platform/country filters
  arrive with the event-derived dimensions.
- Reusable components: `Kpi`, `Freshness`, `Pending`, `Empty`, `DateRangeBar`
  ([`apps/admin/components/ui.tsx`](../apps/admin/components/ui.tsx)) — honest axes,
  empty/pending states, color + labels.

## Exports

CSV exports for safe aggregated datasets (executive KPI, daily users/gameplay,
retention, subscription-state) are specified; the export buttons + server handlers
land in the reporting build-out. Exports will never include emails, provider ids,
UUIDs (for investor role), tokens, answers, audit IP hashes, or integrity reasons.

## Phase 7H update — pages completed + performance

Real (RPC-backed): **Puzzles** (+ detail with gated answer key), **Daily Packs**,
**Content Review**, **Categories & Engines** (registry + exposure), **User Support**,
**Reports & Exports**. Nav is grouped (Analytics/Content/Business/People/Operations)
with active-state + role/env indicators. All large tables are server-paginated.
Auth/RBAC was cut from ~21 network calls/navigation to 2 (request-cached context +
in-process RBAC matrix). See [`ADMIN_PERFORMANCE.md`](ADMIN_PERFORMANCE.md),
[`ADMIN_CONTENT_OPERATIONS.md`](ADMIN_CONTENT_OPERATIONS.md),
[`ADMIN_USER_SUPPORT.md`](ADMIN_USER_SUPPORT.md), [`ADMIN_EXPORTS.md`](ADMIN_EXPORTS.md).
