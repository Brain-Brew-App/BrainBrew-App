import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, num, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Informational flags — never auto-mutate content. */
function flags(r: Record<string, number>): string[] {
  const out: string[] = [];
  if (r.exposures < 20) out.push('insufficient sample');
  else {
    if (r.avg_points >= 18) out.push('possibly too easy');
    if (r.avg_points <= 6) out.push('possibly too hard');
    if (r.zero_rate >= 0.4) out.push('high zero rate');
  }
  return out;
}

export default async function EnginesPage() {
  await requireCapability('view_engines');
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const rows = ((await adminClient().rpc('admin_engine_stats', { p_from: from, p_to: to })).data ?? []) as Array<Record<string, number>>;

  return (
    <>
      <h1>Categories &amp; Engines</h1>
      <Freshness source="attempt_items + daily_pack_slots (ranked, 30d)" />
      <p className="faint">Flags are informational only — analytics never auto-adjust difficulty or content.</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Engine</th><th>Exposures</th><th>Players</th><th>Avg pts</th><th>Perfect</th><th>Zero</th><th>Flags</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.engine_id)}>
                <td>{String(r.engine_id)}</td>
                <td>{num(r.exposures)}</td>
                <td>{num(r.unique_players)}</td>
                <td>{num(r.avg_points)}</td>
                <td>{pct(r.perfect_rate)}</td>
                <td>{pct(r.zero_rate)}</td>
                <td>{flags(r).map((fl) => <span key={fl} className="pill warn" style={{ marginRight: 4 }}>{fl}</span>)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="pending">No ranked play in range yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ marginTop: 12 }}>Platform anomaly detection + Practice/first-vs-repeat splits populate from mobile analytics events once instrumented.</p>
    </>
  );
}
