import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { FilterChips, Pager, Freshness, Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'built', 'validation_failed', 'awaiting_review', 'changes_requested', 'approved', 'promoted', 'rejected'];

/** Paginated authoring review queue. No answer fields in the list payload. */
export default async function AuthoringQueue({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireCapability('view_content');
  const sp = await searchParams;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const limit = 25;

  const res = (await adminClient().rpc('admin_authoring_queue', { p_status: status ?? null, p_limit: limit, p_offset: (page - 1) * limit })).data as
    | { total: number; rows: { id: string; engine_id: string; category: string; difficulty: number; status: string; draft_version: number; validated: boolean; author: string | null; reviewer: string | null; updated_at: string }[] }
    | null;
  const rows = res?.rows ?? [];
  const total = res?.total ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Review queue</h1>
        <a href="/content/authoring" className="pill" style={{ textDecoration: 'none', background: 'var(--surface-raised)', color: 'var(--violet)' }}>+ New puzzle</a>
      </div>
      <Freshness source="authoring_drafts" />
      <FilterChips param="status" active={status} options={STATUSES.map((s) => ({ v: s, label: s }))} />

      {rows.length === 0 ? (
        <Empty>No drafts in this view.</Empty>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: 6 }}>Draft</th><th>Engine</th><th>Cat</th><th>Diff</th><th>Status</th><th>Ver</th><th>Valid</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}><a href={`/content/authoring/draft/${r.id}`}>{r.id.slice(0, 8)}…</a></td>
                  <td>{r.engine_id}</td>
                  <td>{r.category}</td>
                  <td>{r.difficulty}</td>
                  <td><span className={`pill ${r.status === 'approved' || r.status === 'promoted' ? 'ok' : r.status === 'validation_failed' || r.status === 'rejected' ? 'danger' : 'warn'}`}>{r.status}</span></td>
                  <td>{r.draft_version}</td>
                  <td>{r.validated ? '✓' : '—'}</td>
                  <td className="faint">{new Date(r.updated_at).toUTCString().slice(5, 22)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} total={total} limit={limit} base={status ? `status=${status}` : ''} />
        </div>
      )}
    </div>
  );
}
