import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, Pager, StateNote, num, pct } from '@/components/ui';
import { parsePage, pick } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const CATS = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];
const STATUSES = ['draft', 'approved', 'retired'];
const RESERVE = ['reserve', 'scheduled'];

export default async function PuzzlesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCapability('view_puzzles');
  const sp = await searchParams;
  const category = pick(sp, 'category', CATS);
  const status = pick(sp, 'status', STATUSES);
  const reserve = pick(sp, 'reserve', RESERVE);
  const { limit, offset, page } = parsePage(sp, 25);

  const res = await adminClient().rpc('admin_puzzles', {
    p_category: category ?? null, p_engine: null, p_status: status ?? null, p_reserve: reserve ?? null,
    p_limit: limit, p_offset: offset,
  });
  const data = (res.data ?? { rows: [], total: 0 }) as { rows: Record<string, unknown>[]; total: number };
  const qs = new URLSearchParams(Object.entries({ category, status, reserve }).filter(([, v]) => v) as [string, string][]).toString();

  const chip = (k: string, v: string, label: string) => {
    const params = new URLSearchParams(qs); params.delete('page');
    const on = sp[k] === v; if (on) params.delete(k); else params.set(k, v);
    return <a key={`${k}-${v}`} href={`?${params}`} className={`pill ${on ? 'ok' : ''}`} style={{ textDecoration: 'none', border: '1px solid var(--border)' }}>{label}</a>;
  };

  return (
    <>
      <h1>Puzzles</h1>
      <Freshness source="puzzles + validation + exposure (live)" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CATS.map((c) => chip('category', c, c))}
        <span style={{ width: 8 }} />
        {STATUSES.map((s) => chip('status', s, s))}
        <span style={{ width: 8 }} />
        {RESERVE.map((r) => chip('reserve', r, r))}
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>ID</th><th>Category</th><th>Engine</th><th>Diff</th><th>Status</th><th>Reserve</th><th>Valid</th><th>Ranked</th><th>Practice</th><th>Hash</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={String(r.puzzle_id)}>
                <td><a href={`/puzzles/${r.puzzle_id}`}>{String(r.puzzle_id)}</a></td>
                <td>{String(r.cat)}</td><td>{String(r.engine_id)}</td><td>{num(r.difficulty)}</td>
                <td><span className={`pill ${r.status === 'approved' ? 'ok' : r.status === 'retired' ? 'danger' : 'warn'}`}>{String(r.status)}</span></td>
                <td>{r.is_reserve ? 'reserve' : 'scheduled'}</td>
                <td>{r.validated ? '✓' : <span className="pill danger">no</span>}</td>
                <td>{num(r.ranked_appearances)}</td><td>{num(r.practice_appearances)}</td>
                <td className="faint">{String(r.hash)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={10}><StateNote kind="empty">No puzzles match these filters.</StateNote></td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} limit={limit} base={qs} />
    </>
  );
}
