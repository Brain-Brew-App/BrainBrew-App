import { requireCapability, can } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { managementAdapter } from '@/lib/management';
import { MaintenanceForm } from './form';

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
  const ctx = await requireCapability('set_maintenance');
  const status = (await adminClient().rpc('get_operational_status')).data as Record<string, unknown> | null;
  const canRestart = await can(ctx.role, 'request_restart');
  const restartEnabled = managementAdapter().restartEnabled();
  return (
    <>
      <h1>Maintenance &amp; Operational Controls</h1>
      <p className="faint">Server-authoritative flags. Changes require reauthentication + a reason and are audited.</p>
      <div className="card" style={{ marginTop: 12, marginBottom: 16 }}>
        <div className="kpi-label">Current status</div>
        <pre style={{ margin: 0, color: 'var(--text-muted)' }}>{JSON.stringify(status, null, 2)}</pre>
      </div>
      <MaintenanceForm />
      <p className="faint" style={{ marginTop: 16 }}>
        Setting <b>maintenance</b> mode blocks new ranked/practice starts and purchases server-side
        (existing active attempts finish per policy). Scoped toggles disable one area without full
        maintenance.
      </p>

      {canRestart && (
        <div className="card" style={{ marginTop: 24, borderColor: 'var(--danger)' }}>
          <div className="kpi-label" style={{ color: 'var(--danger)' }}>Supabase project restart</div>
          <p className="muted" style={{ marginTop: 4 }}>
            Terminates active workloads — an incident operation, not a casual control.
          </p>
          <p className="pill danger" style={{ display: 'inline-block' }}>Not certified for production use</p>
          <p className="faint" style={{ marginTop: 8 }}>
            Prerequisites before this becomes active (Founder-approved certification): admin deploy
            verified · reauthentication verified · non-production Supabase project test completed ·
            rollback/runbook tested · Management token set + <code>ADMIN_RESTART_CERTIFIED=true</code>.
            When enabled it will require reauth, a typed confirmation phrase, maintenance-first, an
            active-attempt warning, audit, and post-restart health verification.
          </p>
          <button className="danger" disabled title="Disabled until certified">Restart project (disabled)</button>
          <span className="faint" style={{ marginLeft: 8 }}>Adapter reports enabled = {String(restartEnabled)}</span>
        </div>
      )}
    </>
  );
}
