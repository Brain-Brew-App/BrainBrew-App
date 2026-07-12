'use client';

import { useActionState } from 'react';
import { startVoidAction, createIncidentAction } from '../actions';

const Msg = ({ s }: { s: { error?: string; ok?: string } }) => s?.error ? <div className="banner danger">{s.error}</div> : s?.ok ? <div className="banner">{s.ok}</div> : null;

export function VoidControls({ slotId, incidents, isFounder }: { slotId: string; incidents: { id: number; title: string }[]; isFounder: boolean }) {
  const [incState, openIncident] = useActionState(createIncidentAction, {} as { error?: string; ok?: string });
  const [voidState, doVoid] = useActionState(startVoidAction, {} as { error?: string; ok?: string });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form action={openIncident} className="card">
        <input type="hidden" name="slot_id" value={slotId} />
        <div className="kpi-label" style={{ marginBottom: 6 }}>1 · Open an incident</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select name="severity" defaultValue="sev2" style={{ minHeight: 40 }}>
            <option value="sev1">sev1</option><option value="sev2">sev2</option><option value="sev3">sev3</option><option value="info">info</option>
          </select>
          <input name="title" placeholder="Title (required)" required style={{ minHeight: 40, flex: 1, minWidth: 160 }} />
        </div>
        <textarea name="description" rows={2} placeholder="Reason / evidence" style={{ width: '100%', minHeight: 44, marginTop: 8 }} />
        <button type="submit" style={{ minHeight: 40, marginTop: 8 }}>Open incident</button>
        <Msg s={incState} />
      </form>

      <form action={doVoid} className="card" style={{ borderColor: 'var(--danger)' }}>
        <input type="hidden" name="slot_id" value={slotId} />
        <div className="kpi-label" style={{ marginBottom: 6 }}>2 · Void this slot (irreversible, no replacement)</div>
        {!isFounder && <p className="pill danger" style={{ display: 'inline-block' }}>Founder-only action.</p>}
        <label className="faint">Link to open incident</label>
        <select name="incident_id" required style={{ minHeight: 40, width: '100%' }} disabled={!isFounder}>
          <option value="">— select an open incident —</option>
          {incidents.map((i) => <option key={i.id} value={i.id}>#{i.id} · {i.title}</option>)}
        </select>
        <textarea name="reason" rows={2} required placeholder="Void reason (required)" style={{ width: '100%', minHeight: 44, marginTop: 8 }} disabled={!isFounder} />
        <label className="faint" style={{ marginTop: 8, display: 'block' }}>Type <b>VOID SLOT</b> to confirm</label>
        <input name="confirm" placeholder="VOID SLOT" required style={{ minHeight: 40 }} disabled={!isFounder} />
        <div>
          <button type="submit" className="danger" style={{ minHeight: 44, marginTop: 10 }} disabled={!isFounder}>Void slot &amp; recalculate</button>
        </div>
        <p className="faint" style={{ marginTop: 6 }}>Requires recent sign-in. Scores normalize to the reduced denominator; existing share images remain frozen.</p>
        <Msg s={voidState} />
      </form>
    </div>
  );
}
