'use client';

import { useActionState } from 'react';

import { setMaintenance } from './actions';

export function MaintenanceForm() {
  const [state, action, pending] = useActionState(setMaintenance, {} as { error?: string; ok?: string });
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div>
        <label className="kpi-label">Mode</label><br />
        <select name="mode" defaultValue="normal">
          <option value="normal">normal</option>
          <option value="degraded">degraded</option>
          <option value="maintenance">maintenance</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label><input type="checkbox" name="ranked" defaultChecked /> ranked starts</label>
        <label><input type="checkbox" name="practice" defaultChecked /> practice starts</label>
        <label><input type="checkbox" name="purchases" defaultChecked /> purchases</label>
        <label><input type="checkbox" name="publication" defaultChecked /> content publication</label>
      </div>
      <div>
        <label className="kpi-label">Player-facing message (safe copy)</label>
        <input name="message" placeholder="We’ll be back shortly." style={{ width: '100%' }} />
      </div>
      <div>
        <label className="kpi-label">Auto-reset after (minutes, 0 = none)</label>
        <input name="expires_min" type="number" min={0} defaultValue={0} style={{ width: 120 }} />
      </div>
      <div>
        <label className="kpi-label">Reason (required, audited)</label>
        <input name="reason" required style={{ width: '100%' }} />
      </div>
      <div>
        <label className="kpi-label">Reauthenticate — your password</label>
        <input name="password" type="password" autoComplete="current-password" required style={{ width: '100%' }} />
      </div>
      <button className="danger" type="submit" disabled={pending}>{pending ? 'Applying…' : 'Apply operational change'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
      {state?.ok && <span className="pill ok">{state.ok}</span>}
    </form>
  );
}
