import { requireCapability, contextCan, getAdminContext } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { FilterChips, Pager, Empty, Freshness } from '@/components/ui';
import { CreatePackButton } from './CreatePackButton';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'validation_failed', 'awaiting_review', 'changes_requested', 'approved', 'published', 'cancelled'];

/** Pack authoring dashboard — the draft/review/publish queue. */
export default async function PackDashboard({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await requireCapability('view_packs');
  const sp = await searchParams;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const limit = 25;

  const res = (await adminClient().rpc('admin_pack_queue', { p_status: status ?? null, p_limit: limit, p_offset: (page - 1) * limit })).data as
    | { total: number; rows: { id: string; status: string; intended_date: string | null; version: number; author: string | null; reviewer: string | null; filled: number; updated_at: string }[] }
    | null;
  const rows = res?.rows ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Pack authoring</h1>
        {contextCan(ctx, 'manage_content') && <CreatePackButton />}
      </div>
      <Freshness source="authoring_pack_drafts" />
      <FilterChips param="status" active={status} options={STATUSES.map((s) => ({ v: s, label: s }))} />

      {rows.length === 0 ? <Empty>No pack drafts in this view.</Empty> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}><th style={{ padding: 6 }}>Draft</th><th>Status</th><th>Date</th><th>Slots</th><th>Ver</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}><a href={`/packs/authoring/${r.id}`}>{r.id.slice(0, 8)}…</a></td>
                  <td><span className={`pill ${r.status === 'approved' || r.status === 'published' ? 'ok' : r.status === 'validation_failed' || r.status === 'cancelled' ? 'danger' : 'warn'}`}>{r.status}</span></td>
                  <td>{r.intended_date ?? '—'}</td>
                  <td>{r.filled}/5</td>
                  <td>{r.version}</td>
                  <td className="faint">{new Date(r.updated_at).toUTCString().slice(5, 22)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} total={res?.total ?? 0} limit={limit} base={status ? `status=${status}` : ''} />
        </div>
      )}
    </div>
  );
}
