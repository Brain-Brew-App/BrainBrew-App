import { requireCapability, contextCan } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { IncidentForm } from './form';

export const dynamic = 'force-dynamic';

export default async function IncidentsPage() {
  const ctx = await requireCapability('view_incidents');
  const canOpen = await contextCan(ctx, 'open_incident');
  const { data } = await adminClient()
    .from('admin_incidents')
    .select('id, severity, title, status, started_at, resolved_at')
    .order('started_at', { ascending: false })
    .limit(50);

  return (
    <>
      <h1>Incident Center</h1>
      <p className="faint">SEV-1 → SEV-3 + informational. Opening/resolving is audited.</p>
      {canOpen && <IncidentForm />}
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>#</th><th>Sev</th><th>Title</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>
            {(data ?? []).map((i) => (
              <tr key={i.id as number}>
                <td>{i.id as number}</td>
                <td><span className={`pill ${i.severity === 'sev1' ? 'danger' : i.severity === 'info' ? 'ok' : 'warn'}`}>{String(i.severity).toUpperCase()}</span></td>
                <td>{i.title as string}</td>
                <td>{i.status as string}</td>
                <td className="muted">{new Date(String(i.started_at)).toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="pending">No incidents. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
