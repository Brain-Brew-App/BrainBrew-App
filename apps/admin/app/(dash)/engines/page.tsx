import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, num, pct, StateNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Informational flags only — analytics never auto-adjust content. */
function flags(r: Record<string, number>): string[] {
  const out: string[] = [];
  if (!r || r.exposures == null || r.exposures < 20) return ['insufficient sample'];
  if (r.avg_points >= 18) out.push('possibly too easy');
  if (r.avg_points <= 6) out.push('possibly too hard');
  if (r.zero_rate >= 0.4) out.push('high zero rate');
  return out;
}

export default async function EnginesPage() {
  await requireCapability('view_engines');
  const svc = adminClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [regRes, statRes] = await Promise.all([
    svc.rpc('admin_engine_registry'),
    svc.rpc('admin_engine_stats', { p_from: from, p_to: to }),
  ]);
  const registry = (regRes.data ?? []) as Record<string, unknown>[];
  const stats = new Map((((statRes.data ?? []) as Record<string, number>[])).map((s) => [String(s.engine_id), s]));

  return (
    <>
      <h1>Categories &amp; Engines</h1>
      <Freshness source="puzzle_engines registry + 30d ranked exposure" />
      <p className="faint">Flags are informational only — analytics never auto-adjust difficulty or rotation.</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Engine</th><th>Category</th><th>Active</th><th>Diff</th><th>Weight</th><th>Cap/wk</th><th>Spacing</th><th>Approved</th><th>Reserve</th><th>Avg pts (30d)</th><th>Perfect</th><th>Flags</th></tr></thead>
          <tbody>
            {registry.map((e) => {
              const s = stats.get(String(e.engine_id)) as Record<string, number> | undefined;
              return (
                <tr key={String(e.engine_id)}>
                  <td>{String(e.engine_id)}<div className="faint">{String(e.name)}</div></td>
                  <td>{String(e.category)}</td>
                  <td>{e.active ? <span className="pill ok">on</span> : <span className="pill danger">off</span>}</td>
                  <td>{num(e.min_difficulty)}–{num(e.max_difficulty)}</td>
                  <td>{num(e.rotation_weight)}</td><td>{num(e.weekly_cap)}</td><td>{num(e.min_days_between)}d</td>
                  <td>{num(e.approved_puzzles)}</td>
                  <td>{Number(e.reserve_puzzles) < 5 ? <span className="pill warn">{num(e.reserve_puzzles)}</span> : num(e.reserve_puzzles)}</td>
                  <td>{s ? num(s.avg_points) : <span className="pending">—</span>}</td>
                  <td>{s ? pct(s.perfect_rate) : '—'}</td>
                  <td>{(s ? flags(s) : ['no ranked plays']).map((fl) => <span key={fl} className="pill warn" style={{ marginRight: 4 }}>{fl}</span>)}</td>
                </tr>
              );
            })}
            {registry.length === 0 && <tr><td colSpan={12}><StateNote kind="empty">No engines registered.</StateNote></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ marginTop: 12 }}>Editing engine configuration is deferred (high-impact; requires two-person approval + audit). Platform-split and Practice/first-vs-repeat breakdowns populate from mobile analytics events once instrumented in a shipped build.</p>
    </>
  );
}
