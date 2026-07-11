import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Synthetic, non-contaminating checks — reads only; never creates ranked data. */
async function checks() {
  const svc = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const out: { name: string; ok: boolean; detail: string }[] = [];

  const t0 = Date.now();
  const db = await svc.from('profiles').select('id', { count: 'exact', head: true });
  out.push({ name: 'Database read', ok: !db.error, detail: db.error ? db.error.message : `${Date.now() - t0}ms` });

  const kpi = await svc.rpc('admin_kpi_overview');
  out.push({ name: 'KPI RPC', ok: !kpi.error, detail: kpi.error ? kpi.error.message : 'ok' });

  const pack = await svc.from('daily_packs').select('pack_id').eq('status', 'live').eq('pack_date', today).limit(1);
  out.push({ name: 'Live pack today', ok: (pack.data?.length ?? 0) > 0, detail: (pack.data?.length ?? 0) > 0 ? 'present' : 'no live pack for today' });

  const ent = await svc.rpc('admin_revenue_snapshot');
  const e = (ent.data ?? {}) as Record<string, number>;
  out.push({ name: 'Webhook health', ok: (e.webhook_errors ?? 0) === 0, detail: `${e.webhook_errors ?? 0} errored / ${e.webhook_events_total ?? 0} events` });

  const op = await svc.rpc('get_operational_status');
  const mode = (op.data as { mode?: string })?.mode ?? 'unknown';
  out.push({ name: 'Operational mode', ok: mode === 'normal', detail: mode });

  return out;
}

export default async function HealthPage() {
  await requireCapability('view_health');
  const rows = await checks();
  return (
    <>
      <h1>System Health</h1>
      <p className="faint">Synthetic read-only checks · UTC · as of {new Date().toUTCString()}</p>
      <div className="card" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td><span className={`pill ${r.ok ? 'ok' : 'danger'}`}>{r.ok ? 'OK' : 'FAIL'}</span></td>
                <td className="muted">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ marginTop: 12 }}>
        Supabase infra metrics (CPU/latency/backups) and Vercel deploy status require the Supabase
        Management API + Vercel API tokens (server-only, Founder-configured) — shown here once wired.
      </p>
    </>
  );
}
