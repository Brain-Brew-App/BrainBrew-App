import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Entry point: live/historical pack slots eligible for an incident void. */
export default async function VoidEntry() {
  await requireCapability('view_incidents');
  const svc = adminClient();
  // Live/archived packs only; the RPC re-checks this authoritatively.
  const packs = (await svc.from('daily_packs').select('pack_id,pack_date,status').in('status', ['live', 'archived']).order('pack_date', { ascending: false }).limit(30)).data as { pack_id: string; pack_date: string | null; status: string }[] | null;
  const slots = packs?.length
    ? (await svc.from('daily_pack_slots').select('id,pack_id,position,category,puzzle_id,void_status').in('pack_id', packs.map((p) => p.pack_id)).order('position')).data as { id: string; pack_id: string; position: number; category: string; puzzle_id: string; void_status: boolean }[] | null
    : [];
  const dateOf = new Map((packs ?? []).map((p) => [p.pack_id, p.pack_date]));

  return (
    <div>
      <h1>Content void — live &amp; historical slots</h1>
      <p className="faint" style={{ marginBottom: 12 }}>Founder-only. Voiding a broken slot removes it from scoring (no replacement) and recalculates every affected ranked result. Frozen share images stay historical artifacts.</p>
      {!slots?.length ? <Empty>No live or historical pack slots.</Empty> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}><th style={{ padding: 6 }}>Date</th><th>Pack</th><th>Pos</th><th>Category</th><th>Puzzle</th><th>State</th><th></th></tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{dateOf.get(s.pack_id) ?? '—'}</td>
                  <td className="faint">{s.pack_id.slice(0, 12)}</td>
                  <td>{s.position}</td>
                  <td>{s.category}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.puzzle_id}</td>
                  <td>{s.void_status ? <span className="pill danger">voided</span> : <span className="pill ok">live</span>}</td>
                  <td>{!s.void_status && <a href={`/incidents/void/${s.id}`}>Report broken →</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
