import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Kpi, Freshness, num, pct } from '@/components/ui';
import { refreshRollups } from './actions';

export const dynamic = 'force-dynamic';

export default async function GameplayPage() {
  await requireCapability('view_gameplay');
  const svc = adminClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const [ov, daily, funnel] = await Promise.all([
    svc.rpc('admin_kpi_overview'),
    svc.rpc('admin_gameplay_daily', { p_from: from, p_to: to }),
    svc.rpc('admin_activation_funnel', { p_from: from, p_to: to }),
  ]);
  const o = (ov.data ?? {}) as Record<string, unknown>;
  const rows = (daily.data ?? []) as Array<Record<string, number | string>>;
  const f = (funnel.data ?? {}) as Record<string, number>;
  const stages = [
    ['Users created', f.users_created], ['Profile completed', f.profile_completed],
    ['Ranked started', f.ranked_started], ['Ranked completed', f.ranked_completed],
  ] as [string, number][];
  const top = stages[0][1] || 1;

  return (
    <>
      <h1>Gameplay</h1>
      <Freshness source="attempts + analytics rollups" at={o.generated_at as string} />
      <div className="grid cards">
        <Kpi label="Ranked completed (today)" value={num(o.ranked_completed_today)} sub={`${num(o.ranked_completed_total)} all-time`} />
        <Kpi label="Practice completed (today)" value={num(o.practice_completed_today)} sub={`${num(o.practice_completed_total)} all-time`} />
        <Kpi label="Avg BrewScore" value={num(o.avg_brewscore)} sub={`median ${num(o.median_brewscore)}`} />
        <Kpi label="Ranked players today" value={num(o.ranked_players_today)} />
      </div>

      <h2 style={{ marginTop: 24 }}>Activation funnel (30d)</h2>
      <div className="card">
        {stages.map(([label, v]) => (
          <div key={label} style={{ margin: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><span className="muted">{num(v)} · {pct((v || 0) / top)}</span></div>
            <div style={{ height: 8, background: 'var(--surface-raised)', borderRadius: 4 }}>
              <div style={{ height: 8, width: `${Math.round(((v || 0) / top) * 100)}%`, background: 'var(--mint)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
        <p className="faint" style={{ marginTop: 8 }}>UI-only funnel stages (CTA viewed, offering loaded) populate from mobile analytics events once instrumentation ships.</p>
      </div>

      <h2 style={{ marginTop: 24 }}>Daily rollups (30d)
        <form action={refreshRollups} style={{ display: 'inline', marginLeft: 12 }}><button type="submit">Refresh rollups</button></form>
      </h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Day</th><th>Ranked start</th><th>Ranked done</th><th>Practice start</th><th>Practice done</th><th>Avg</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.day)}>
                <td className="muted">{String(r.day)}</td>
                <td>{num(r.ranked_starts)}</td><td>{num(r.ranked_completions)}</td>
                <td>{num(r.practice_starts)}</td><td>{num(r.practice_completions)}</td>
                <td>{num(r.avg_score)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="pending">No rollups yet — click “Refresh rollups”.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
