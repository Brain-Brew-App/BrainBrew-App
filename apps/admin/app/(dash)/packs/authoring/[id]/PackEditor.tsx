'use client';

import { useActionState } from 'react';
import { setSlotAction, suggestPackAction, validatePackAction, submitPackAction, decidePackAction, publishPackAction, cancelPackAction } from '../actions';

const CAT_LABEL: Record<string, string> = { observation: 'Observation', pattern: 'Pattern', logic: 'Logic', 'language-logic': 'Language Logic', 'attention-speed': 'Attention Speed' };
const Msg = ({ s }: { s: { error?: string; ok?: string } }) => s?.error ? <div className="banner danger">{s.error}</div> : s?.ok ? <div className="banner">{s.ok}</div> : null;

export interface Slot { position: number; category: string; puzzle_id: string | null; eligible: { puzzle_id: string; engine_id: string; difficulty: number }[] }
export interface PackEditorProps {
  id: string; status: string; version: number; intendedDate: string | null; role: string;
  slots: Slot[]; report: { passed?: boolean; blocking?: string[]; warnings?: string[] };
  difficulty: Record<string, unknown>; rotation: Record<string, unknown>;
  canManage: boolean; canReview: boolean; canPublish: boolean;
}

export function PackEditor(p: PackEditorProps) {
  const [slotState, setSlot] = useActionState(setSlotAction, {} as { error?: string; ok?: string });
  const [sugState, suggest] = useActionState(suggestPackAction, {} as { error?: string; ok?: string });
  const [valState, validate] = useActionState(validatePackAction, {} as { error?: string; ok?: string });
  const [subState, submit] = useActionState(submitPackAction, {} as { error?: string; ok?: string });
  const [decState, decide] = useActionState(decidePackAction, {} as { error?: string; ok?: string });
  const [pubState, publish] = useActionState(publishPackAction, {} as { error?: string; ok?: string });
  const [canState, cancel] = useActionState(cancelPackAction, {} as { error?: string; ok?: string });

  const editable = ['draft', 'validation_failed', 'changes_requested'].includes(p.status);
  const complete = p.slots.every((s) => s.puzzle_id);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Five fixed slots */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div className="kpi-label">Five slots (fixed category order)</div>
          {editable && p.canManage && (
            <form action={suggest} style={{ marginLeft: 'auto' }}><input type="hidden" name="id" value={p.id} /><button type="submit" style={{ minHeight: 36 }}>Auto-suggest</button></form>
          )}
        </div>
        <Msg s={sugState} /><Msg s={slotState} />
        {p.slots.sort((a, b) => a.position - b.position).map((s) => (
          <div key={s.position} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span className="pill" style={{ background: 'var(--surface-raised)', color: 'var(--violet)', minWidth: 130 }}>{s.position}. {CAT_LABEL[s.category]}</span>
            {editable && p.canManage ? (
              <form action={setSlot} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="position" value={s.position} /><input type="hidden" name="version" value={p.version} />
                <select name="puzzle" defaultValue={s.puzzle_id ?? ''} style={{ minHeight: 40, minWidth: 220 }}>
                  <option value="">— empty —</option>
                  {s.puzzle_id && !s.eligible.some((e) => e.puzzle_id === s.puzzle_id) && <option value={s.puzzle_id}>{s.puzzle_id} (current)</option>}
                  {s.eligible.map((e) => <option key={e.puzzle_id} value={e.puzzle_id}>{e.puzzle_id} · {e.engine_id} · d{e.difficulty}</option>)}
                </select>
                <button type="submit" style={{ minHeight: 40 }}>Set</button>
              </form>
            ) : (
              <span style={{ fontFamily: 'monospace' }}>{s.puzzle_id ?? '— empty —'}</span>
            )}
          </div>
        ))}
        <p className="faint" style={{ marginTop: 6 }}>Selectors are server-paginated (approved/reserve, correct category, not retired, not already scheduled). The full library is never sent to the browser.</p>
      </div>

      {/* Constraint report */}
      <div className="card" style={{ borderColor: p.report.passed ? 'var(--ok)' : p.report.blocking?.length ? 'var(--danger)' : 'var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="kpi-label">Constraints</div>
          {editable && p.canManage && <form action={validate} style={{ marginLeft: 'auto' }}><input type="hidden" name="id" value={p.id} /><button type="submit" style={{ minHeight: 36 }}>Validate</button></form>}
        </div>
        <Msg s={valState} />
        {(p.report.blocking ?? []).length > 0 && <><div className="kpi-label" style={{ marginTop: 6 }}>Blocking</div><ul>{p.report.blocking!.map((b, i) => <li key={i} style={{ color: 'var(--danger)' }}>{b}</li>)}</ul></>}
        {(p.report.warnings ?? []).length > 0 && <><div className="kpi-label" style={{ marginTop: 6 }}>Warnings</div><ul>{p.report.warnings!.map((w, i) => <li key={i} style={{ color: 'var(--warn)' }}>{w}</li>)}</ul></>}
        <p className="faint" style={{ marginTop: 6 }}>Difficulty {JSON.stringify(p.difficulty)} · engines {JSON.stringify(p.rotation)}</p>
      </div>

      {/* Submit for review */}
      {editable && p.canManage && complete && (
        <form action={submit} className="card">
          <input type="hidden" name="id" value={p.id} />
          <div className="kpi-label" style={{ marginBottom: 6 }}>Submit for review</div>
          <textarea name="notes" rows={2} required placeholder="Author notes (required)" style={{ width: '100%', minHeight: 44 }} />
          <button type="submit" style={{ minHeight: 44, marginTop: 8 }}>Submit</button>
          <Msg s={subState} />
        </form>
      )}

      {/* Review decision */}
      {p.status === 'awaiting_review' && p.canReview && (
        <form action={decide} className="card">
          <input type="hidden" name="id" value={p.id} />
          <div className="kpi-label" style={{ marginBottom: 6 }}>Review decision (two-person control)</div>
          <textarea name="reason" rows={2} required placeholder="Reason (required)" style={{ width: '100%', minHeight: 44 }} />
          {p.role === 'founder' && <label style={{ display: 'flex', gap: 6, fontSize: 12, margin: '6px 0' }}><input type="checkbox" name="emergency" style={{ width: 'auto', minHeight: 'auto' }} /> Founder emergency approval</label>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="submit" name="decision" value="approve" className="primary" style={{ minHeight: 44 }}>Approve</button>
            <button type="submit" name="decision" value="request_changes" style={{ minHeight: 44 }}>Request changes</button>
            <button type="submit" name="decision" value="reject" className="danger" style={{ minHeight: 44 }}>Reject</button>
          </div>
          <Msg s={decState} />
        </form>
      )}

      {/* Publish */}
      {p.status === 'approved' && p.canPublish && (
        <form action={publish} className="card" style={{ borderColor: 'var(--border-hi)' }}>
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="version" value={p.version} />
          <div className="kpi-label" style={{ marginBottom: 6 }}>Publish to a future UTC date</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <div><label className="faint">UTC date</label><input type="date" name="date" defaultValue={p.intendedDate ?? ''} required style={{ minHeight: 40 }} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><label className="faint">Reason</label><input name="reason" required style={{ minHeight: 40, width: '100%' }} /></div>
            <div><label className="faint">Type PUBLISH</label><input name="confirm" required style={{ minHeight: 40 }} placeholder="PUBLISH" /></div>
            <button type="submit" className="primary" style={{ minHeight: 40 }}>Publish</button>
          </div>
          <p className="faint" style={{ marginTop: 6 }}>Requires recent sign-in + typed confirmation. Atomic + idempotent. Once live the pack is immutable.</p>
          <Msg s={pubState} />
        </form>
      )}

      {p.status === 'published' && <div className="card"><span className="pill ok">Published — canonical &amp; live. Correction is cancel-and-republish only.</span></div>}

      {/* Cancel (unpublished) */}
      {['draft', 'validation_failed', 'changes_requested', 'awaiting_review', 'approved'].includes(p.status) && p.canManage && (
        <form action={cancel} className="card">
          <input type="hidden" name="id" value={p.id} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <div style={{ flex: 1 }}><label className="faint">Cancel this draft (reason)</label><input name="reason" style={{ minHeight: 40, width: '100%' }} /></div>
            <button type="submit" className="danger" style={{ minHeight: 40 }}>Cancel draft</button>
          </div>
          <Msg s={canState} />
        </form>
      )}
    </div>
  );
}
