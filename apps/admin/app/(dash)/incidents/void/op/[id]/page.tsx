import { notFound } from 'next/navigation';

import { requireCapability, getAdminContext } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { OpControls } from './OpControls';

export const dynamic = 'force-dynamic';

const STATUS_PILL: Record<string, string> = { completed: 'ok', running: 'warn', pending: 'warn', partially_failed: 'danger', failed: 'danger' };

/** Void operation progress + recovery. */
export default async function VoidOpPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCapability('view_incidents');
  const { id } = await params;
  const op = (await adminClient().rpc('admin_void_operation', { p_op_id: id })).data as Record<string, any> | null;
  if (!op) notFound();

  const row = (k: string, v: React.ReactNode) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span className="faint">{k}</span><span style={{ fontFamily: 'monospace' }}>{v}</span></div>;

  return (
    <div>
      <p className="faint" style={{ marginBottom: 12 }}><a href="/incidents/void">← Void entry</a> · <a href="/audit">Audit log</a></p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Void operation</h1>
        <span className={`pill ${STATUS_PILL[op.status] ?? 'warn'}`}>{op.status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1fr) minmax(280px,1fr)', gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="kpi-label" style={{ marginBottom: 6 }}>Operation</div>
          {row('operation id', String(op.id).slice(0, 8))}
          {row('incident', `#${op.incident_id}`)}
          {row('pack / date', `${String(op.pack_id).slice(0, 12)} · ${op.ranked_date ?? '—'}`)}
          {row('puzzle', op.puzzle_id)}
          {row('affected attempts', op.affected_attempt_count)}
          {row('processed', op.processed_attempt_count)}
          {row('failed', op.failed_attempt_count)}
          {row('retries', op.retry_count)}
          {row('denominator', `${op.original_denominator} → ${op.new_denominator}`)}
          {op.diagnostic_reference && row('diagnostic ref', op.diagnostic_reference)}
          {row('started', op.started_at ? new Date(op.started_at).toUTCString() : '—')}
          {row('completed', op.completed_at ? new Date(op.completed_at).toUTCString() : '—')}
        </div>

        {ctx.role === 'founder' ? <OpControls opId={String(op.id)} status={op.status} /> : (
          <div className="card"><p className="faint">Recovery controls are Founder-only.</p></div>
        )}
      </div>
    </div>
  );
}
