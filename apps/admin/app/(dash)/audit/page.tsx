import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'super_admin', 'engineering']);

export default async function AuditPage() {
  const ctx = await requireAdmin();
  if (!ALLOWED.has(ctx.role)) redirect('/denied');

  const { data } = await adminClient()
    .from('admin_audit_log')
    .select('id, admin_role, action, target_type, target_id, reason, success, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <h1>Audit Log</h1>
      <p className="faint">Append-only · newest 100 · UTC. Rows can never be edited or deleted.</p>
      <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Time</th><th>Role</th><th>Action</th><th>Target</th><th>Reason</th><th>OK</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id as number}>
                <td className="muted">{new Date(String(r.created_at)).toISOString().replace('T', ' ').slice(0, 19)}</td>
                <td>{r.admin_role as string}</td>
                <td>{r.action as string}</td>
                <td className="muted">{r.target_type as string}{r.target_id ? `:${String(r.target_id).slice(0, 8)}` : ''}</td>
                <td className="muted">{(r.reason as string) ?? '—'}</td>
                <td><span className={`pill ${r.success ? 'ok' : 'danger'}`}>{r.success ? '✓' : '✕'}</span></td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="pending">No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
