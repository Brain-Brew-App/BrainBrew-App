import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Kpi, Freshness, num } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Read-only, aggregate-only. No PII, no user list, no operational actions. */
export default async function InvestorPage() {
  await requireCapability('view_investor');
  const svc = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [ov, au, rev] = await Promise.all([
    svc.rpc('admin_kpi_overview'),
    svc.rpc('admin_active_users', { p_as_of: today }),
    svc.rpc('admin_revenue_snapshot'),
  ]);
  const o = (ov.data ?? {}) as Record<string, unknown>;
  const a = (au.data ?? {}) as Record<string, number>;
  const r = (rev.data ?? {}) as Record<string, unknown>;

  return (
    <>
      <h1>Investor Summary</h1>
      <Freshness source="aggregated KPIs (no personal data)" at={o.generated_at as string} />
      <div className="grid cards">
        <Kpi label="Total users" value={num(o.total_users)} />
        <Kpi label="DAU" value={num(a.dau)} />
        <Kpi label="WAU" value={num(a.wau)} />
        <Kpi label="MAU" value={num(a.mau)} />
        <Kpi label="Stickiness" value={a.mau ? `${Math.round((a.dau / a.mau) * 100)}%` : '—'} sub="DAU/MAU" />
        <Kpi label="Ranked Brews (all-time)" value={num(o.ranked_completed_total)} />
        <Kpi label="Practice Brews (all-time)" value={num(o.practice_completed_total)} />
        <Kpi label="Active subscriptions" value={num(r.active_subscriptions)} sub="sandbox" />
        <Kpi label="MRR" value={<span className="pending">pending</span>} sub="pre-launch" />
      </div>
      <p className="faint" style={{ marginTop: 16 }}>
        This page contains only aggregated figures — no user list, emails, UUIDs, or operational
        controls. Revenue currency figures appear only after real store data is synchronized.
        Platform/geographic split and retention curves populate as mobile analytics data accrues.
      </p>
    </>
  );
}
