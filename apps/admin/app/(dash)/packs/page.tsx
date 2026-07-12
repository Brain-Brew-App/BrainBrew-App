import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, num, StateNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PacksPage() {
  await requireCapability('view_packs');
  const to = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);   // include future scheduled
  const from = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const rows = ((await adminClient().rpc('admin_packs', { p_from: from, p_to: to })).data ?? []) as Record<string, unknown>[];
  const today = new Date().toISOString().slice(0, 10);
  const liveToday = rows.some((r) => r.pack_date === today && r.status === 'live');

  return (
    <>
      <h1>Daily Packs</h1>
      <Freshness source="daily_packs + attempts (live)" />
      {!liveToday && <div className="banner">No <b>live</b> pack for today ({today} UTC). Ranked-today metrics will read 0 until one is published.</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Status</th><th>Difficulty</th><th>Incident</th><th>Participants</th><th>Completions</th><th>Avg score</th><th>Hash</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.pack_date ?? r.hash)} style={r.pack_date === today ? { background: 'var(--surface-raised)' } : undefined}>
                <td>{String(r.pack_date ?? '—')}{r.pack_date === today ? ' · today' : ''}</td>
                <td><span className={`pill ${r.status === 'live' ? 'ok' : r.status === 'retired' ? 'danger' : 'warn'}`}>{String(r.status)}</span></td>
                <td>{String(r.difficulty_label)}</td>
                <td>{r.incident === 'none' ? '—' : <span className="pill danger">{String(r.incident)}</span>}</td>
                <td>{num(r.participants)}</td><td>{num(r.completions)}</td><td>{num(r.avg_score)}</td>
                <td className="faint">{String(r.hash)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><StateNote kind="empty">No packs in this window.</StateNote></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ marginTop: 12 }}>Read-only in this phase. Score distributions, leaderboard population, practice/share conversion, and void/recalc detail arrive with the pack-detail view. Pack operations (publish/void) remain in the certified server flow, not here.</p>
    </>
  );
}
