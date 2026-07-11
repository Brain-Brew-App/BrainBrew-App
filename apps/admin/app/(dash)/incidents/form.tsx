'use client';

import { useActionState } from 'react';

import { openIncident } from './actions';

export function IncidentForm() {
  const [state, action, pending] = useActionState(openIncident, {} as { error?: string; ok?: string });
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 10, maxWidth: 520, marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <select name="severity" defaultValue="sev3">
          <option value="sev1">SEV-1</option>
          <option value="sev2">SEV-2</option>
          <option value="sev3">SEV-3</option>
          <option value="info">Info</option>
        </select>
        <input name="title" placeholder="Incident title" required style={{ flex: 1 }} />
      </div>
      <textarea name="description" placeholder="What's happening / affected systems" rows={3} />
      <button className="primary" type="submit" disabled={pending}>{pending ? 'Opening…' : 'Open incident'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
      {state?.ok && <span className="pill ok">{state.ok}</span>}
    </form>
  );
}
