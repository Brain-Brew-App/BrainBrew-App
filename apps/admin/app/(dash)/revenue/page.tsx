import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Kpi, Freshness, num } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  await requireCapability('view_revenue');
  const r = ((await adminClient().rpc('admin_revenue_snapshot')).data ?? {}) as Record<string, unknown>;
  const byState = (r.by_state ?? {}) as Record<string, number>;

  return (
    <>
      <h1>Revenue &amp; Subscriptions</h1>
      <Freshness source="player_entitlements + revenuecat_webhook_events" at={r.generated_at as string} />
      <div className="banner">Sandbox data — no public billing has launched. Monetary totals appear only when real store price data is synchronized.</div>

      <h2>Subscription states (real)</h2>
      <div className="grid cards">
        <Kpi label="Active" value={num(r.active_subscriptions)} sub="premium + grace + billing-issue" />
        <Kpi label="Premium" value={num(byState.premium)} />
        <Kpi label="Trials" value={num(r.trials)} />
        <Kpi label="Grace period" value={num(byState.grace_period)} />
        <Kpi label="Billing issue" value={num(byState.billing_issue)} />
        <Kpi label="Expired" value={num(byState.expired)} />
        <Kpi label="Revoked" value={num(byState.revoked)} />
        <Kpi label="Will renew" value={num(r.will_renew)} />
      </div>

      <h2 style={{ marginTop: 24 }}>Provider reconciliation (real)</h2>
      <div className="grid cards">
        <Kpi label="Webhook events" value={num(r.webhook_events_total)} />
        <Kpi label="Processed" value={num(r.webhook_processed)} />
        <Kpi label="Errors" value={num(r.webhook_errors)} />
        <Kpi label="Quarantined" value={num(r.webhook_quarantined)} />
        <Kpi label="Duplicates ignored" value={num(r.webhook_duplicates)} />
      </div>

      <h2 style={{ marginTop: 24 }}>Monetary KPIs</h2>
      <div className="grid cards">
        <Kpi label="MRR" value={<span className="pending">pending</span>} sub="needs store prices" />
        <Kpi label="ARR" value={<span className="pending">pending</span>} />
        <Kpi label="ARPPU" value={<span className="pending">pending</span>} />
      </div>
      <p className="faint" style={{ marginTop: 8 }}>
        Revenue totals are never computed by multiplying counts by guessed prices. Store product
        mix and $ figures land when App Store / Play price data is synchronized.
      </p>
    </>
  );
}
