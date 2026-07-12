import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, Pager, num, StateNote } from '@/components/ui';
import { parsePage, pick } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'approved', 'retired'];

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCapability('view_content');
  const sp = await searchParams;
  const status = pick(sp, 'status', STATUSES);
  const { limit, offset, page } = parsePage(sp, 25);
  const data = ((await adminClient().rpc('admin_content_queue', { p_status: status ?? null, p_limit: limit, p_offset: offset })).data
    ?? { rows: [], total: 0, by_status: {} }) as { rows: Record<string, unknown>[]; total: number; by_status: Record<string, number> };

  return (
    <>
      <h1>Content Review</h1>
      <Freshness source="puzzles + latest validation (live)" />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <a href="?" className={`pill ${!status ? 'ok' : ''}`} style={{ textDecoration: 'none' }}>All ({num(data.total)})</a>
        {STATUSES.map((s) => <a key={s} href={`?status=${s}`} className={`pill ${status === s ? 'ok' : ''}`} style={{ textDecoration: 'none', border: '1px solid var(--border)' }}>{s} ({num(data.by_status?.[s] ?? 0)})</a>)}
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Puzzle</th><th>Category</th><th>Engine</th><th>Diff</th><th>Status</th><th>Validation</th><th>Findings</th><th>Updated</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={String(r.puzzle_id)}>
                <td><a href={`/puzzles/${r.puzzle_id}`}>{String(r.puzzle_id)}</a></td>
                <td>{String(r.cat)}</td><td>{String(r.engine_id)}</td><td>{num(r.difficulty)}</td>
                <td><span className={`pill ${r.status === 'approved' ? 'ok' : r.status === 'retired' ? 'danger' : 'warn'}`}>{String(r.status)}</span></td>
                <td>{r.validated === true ? <span className="pill ok">passed</span> : r.validated === false ? <span className="pill danger">failed</span> : <span className="pending">none</span>}</td>
                <td className="faint">{Array.isArray(r.findings) && r.findings.length > 0 ? `${(r.findings as unknown[]).length} finding(s)` : '—'}</td>
                <td className="faint">{r.updated_at ? new Date(String(r.updated_at)).toISOString().slice(0, 10) : '—'}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={8}><StateNote kind="empty">No content in this status.</StateNote></td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} limit={limit} base={status ? `status=${status}` : ''} />
      <p className="faint" style={{ marginTop: 12 }}>
        Read-only queue. Confidence components and similarity findings appear where the pipeline stores them (not fabricated when absent). Approval/reject actions are deliberately not exposed until workflow permissions + audit tests are certified — content still flows through the deterministic validators.
      </p>
    </>
  );
}
