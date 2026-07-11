# Incident Response (Phase 7F)

The incident workflow built into the Admin Command Center. The dashboard header
shows active incidents; there is **no public status page** in this phase.

---

## 1. Severity

- **SEV-1** — players broadly cannot play ranked / data-integrity risk / security.
- **SEV-2** — significant degradation (one platform, purchases, leaderboards).
- **SEV-3** — minor/limited impact, workaround exists.
- **Info** — noteworthy, no player impact.

## 2. Lifecycle

`Incidents` page (view: any ops role; open: `open_incident`; resolve:
`resolve_incident`).

1. **Open** — severity, title, description, affected systems; owner defaults to
   the opener. Audited (`open_incident`).
2. **Investigate** — add timeline notes (`admin_incident_events`). Link a
   maintenance-mode change if you take one.
3. **Monitor** — set status `monitoring` once mitigated.
4. **Resolve** — status `resolved`, `resolved_at` stamped, note recorded, audited
   (`resolve_incident`). Add a postmortem URL for SEV-1/2.

## 3. Standard playbooks

- **Bad live pack / answer leak suspicion** → open SEV-1, enable maintenance
  (ranked off), void the affected slot via content ops, trigger ranked
  recalculation, verify with Health, resolve with postmortem.
- **Purchase/entitlement outage** → open SEV-2, check `admin_revenue_snapshot`
  webhook errors, re-run entitlement sync for affected users, confirm RevenueCat
  reachability, resolve.
- **Elevated Edge errors / provider timeout** → open SEV-2/3, check Health, throttle
  via scoped maintenance if needed, monitor, resolve.
- **Suspected DB incident** → open SEV-1, maintenance first, follow the restart
  procedure in [`ADMIN_OPERATIONAL_RUNBOOK.md`](ADMIN_OPERATIONAL_RUNBOOK.md) §5.

## 4. Records

Incidents and their events are private (RLS, service-role only), and every open/
resolve is mirrored in the immutable `admin_audit_log`. Postmortems live as linked
docs (not stored inline).
