import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { tip } from '@/lib/kpi';

export const dynamic = 'force-dynamic';

function Kpi({ label, value, k, sub }: { label: string; value: React.ReactNode; k?: string; sub?: string }) {
  return (
    <div className="card" title={k ? tip(k) : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="faint">{sub}</div>}
    </div>
  );
}

const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-US') : v == null ? '—' : String(v));

export default async function OverviewPage() {
  await requireCapability('view_overview');
  const svc = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const from30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [ov, au, fn, rev] = await Promise.all([
    svc.rpc('admin_kpi_overview'),
    svc.rpc('admin_active_users', { p_as_of: today }),
    svc.rpc('admin_ranked_funnel', { p_from: from30, p_to: today }),
    svc.rpc('admin_revenue_snapshot'),
  ]);
  const o = (ov.data ?? {}) as Record<string, unknown>;
  const a = (au.data ?? {}) as Record<string, number>;
  const f = (fn.data ?? {}) as Record<string, unknown>;
  const r = (rev.data ?? {}) as Record<string, unknown>;
  const stickiness = a.mau ? `${Math.round((a.dau / a.mau) * 100)}%` : '—';
  const freshness = o.generated_at ? new Date(String(o.generated_at)).toUTCString() : 'now';

  return (
    <>
      <h1>Executive Overview</h1>
      <p className="faint">All figures UTC · live from canonical records · as of {freshness}</p>

      <h2 style={{ marginTop: 20 }}>Users</h2>
      <div className="grid cards">
        <Kpi label="Total users" value={n(o.total_users)} k="total_users" />
        <Kpi label="Permanent" value={n(o.permanent_users)} k="permanent_users" />
        <Kpi label="Anonymous" value={n(o.anonymous_users)} k="anonymous_users" />
        <Kpi label="New (7d)" value={n(o.new_users_7d)} k="new_users_7d" sub={`${n(o.new_users_30d)} in 30d`} />
        <Kpi label="DAU" value={n(a.dau)} k="dau" />
        <Kpi label="WAU" value={n(a.wau)} k="wau" />
        <Kpi label="MAU" value={n(a.mau)} k="mau" />
        <Kpi label="Stickiness" value={stickiness} k="stickiness" sub="DAU/MAU" />
      </div>

      <h2 style={{ marginTop: 24 }}>Gameplay</h2>
      <div className="grid cards">
        <Kpi label="Ranked players today" value={n(o.ranked_players_today)} />
        <Kpi label="Ranked completed (today)" value={n(o.ranked_completed_today)} sub={`${n(o.ranked_completed_total)} all-time`} />
        <Kpi label="Ranked completion (30d)" value={f.completion_rate == null ? '—' : `${Math.round(Number(f.completion_rate) * 100)}%`} k="ranked_completion_rate" sub={`${n(f.ranked_completed)}/${n(f.ranked_started)}`} />
        <Kpi label="Practice completed (today)" value={n(o.practice_completed_today)} sub={`${n(o.practice_completed_total)} all-time`} />
        <Kpi label="Avg BrewScore" value={n(o.avg_brewscore)} k="avg_brewscore" sub={`median ${n(o.median_brewscore)}`} />
      </div>

      <h2 style={{ marginTop: 24 }}>Revenue &amp; subscriptions</h2>
      <div className="grid cards">
        <Kpi label="Active subscriptions" value={n(r.active_subscriptions)} k="active_subscriptions" sub="sandbox until launch" />
        <Kpi label="Trials" value={n(r.trials)} />
        <Kpi label="MRR" value={<span className="pending">pending</span>} k="mrr" sub="needs store price data" />
        <Kpi label="Webhook errors" value={n(r.webhook_errors)} sub={`${n(r.webhook_events_total)} events total`} />
      </div>
      {r.revenue_data_available === false && (
        <p className="faint" style={{ marginTop: 8 }}>
          Monetary KPIs (MRR/ARR/ARPPU) are intentionally blank until real store price data is
          synchronized — no fabricated figures. Subscription counts above are real.
        </p>
      )}
    </>
  );
}
