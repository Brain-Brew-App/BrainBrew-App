'use client';

import { useActionState } from 'react';
import { decideReviewAction, promoteAction, assignReviewerAction } from './actions';

const Msg = ({ s }: { s: { error?: string; ok?: string } | undefined }) =>
  s?.error ? <div className="banner danger">{s.error}</div> : s?.ok ? <div className="banner">{s.ok}</div> : null;

/**
 * Reviewer + promotion controls. State-aware: review decisions show only while
 * awaiting_review; promote only when approved. Two-person control + validation
 * gates + emergency override live in the server action + RPC.
 */
export function ReviewActions({ id, status, role, isAuthor, canReview, canManage }: {
  id: string; status: string; role: string; isAuthor: boolean; canReview: boolean; canManage: boolean;
}) {
  const [decState, decide, decPending] = useActionState(decideReviewAction, {} as { error?: string; ok?: string });
  const [promState, promote, promPending] = useActionState(promoteAction, {} as { error?: string; ok?: string });
  const [asgState, assign] = useActionState(assignReviewerAction, {} as { error?: string; ok?: string });

  return (
    <div className="card">
      <div className="kpi-label" style={{ marginBottom: 8 }}>Actions</div>

      {status === 'awaiting_review' && canReview && (
        <form action={decide} style={{ marginBottom: 12 }}>
          <input type="hidden" name="id" value={id} />
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }} htmlFor="reason">Reason / notes *</label>
          <textarea id="reason" name="reason" rows={2} required style={{ width: '100%', minHeight: 44, marginTop: 4 }} placeholder="Required for every decision" />
          {role === 'founder' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, margin: '6px 0' }}>
              <input type="checkbox" name="emergency" style={{ width: 'auto', minHeight: 'auto' }} /> Founder emergency approval (single-person, audited)
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="submit" name="decision" value="approve" className="primary" disabled={decPending || isAuthor} title={isAuthor ? 'You authored this — a different reviewer must approve' : 'Approve'} style={{ minHeight: 44 }}>Approve</button>
            <button type="submit" name="decision" value="request_changes" disabled={decPending} style={{ minHeight: 44 }}>Request changes</button>
            <button type="submit" name="decision" value="reject" className="danger" disabled={decPending} style={{ minHeight: 44 }}>Reject</button>
          </div>
          {isAuthor && <p className="faint" style={{ marginTop: 6 }}>Two-person control: the author cannot approve their own draft.</p>}
        </form>
      )}
      <Msg s={decState} />

      {status === 'approved' && canManage && (
        <form action={promote} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="primary" disabled={promPending} style={{ minHeight: 44 }}>Promote to reserve</button>
          <p className="faint" style={{ marginTop: 6 }}>Creates immutable canonical content. Requires recent sign-in. Idempotent.</p>
        </form>
      )}
      <Msg s={promState} />

      {status === 'promoted' && <p className="pill ok" style={{ display: 'inline-block' }}>Promoted — canonical &amp; immutable. Further changes need a revision.</p>}
      {status === 'rejected' && <p className="pill danger" style={{ display: 'inline-block' }}>Rejected — retained in history.</p>}
      {status === 'changes_requested' && <p className="pill warn" style={{ display: 'inline-block' }}>Changes requested — the author rebuilds &amp; resubmits.</p>}

      {canReview && ['awaiting_review', 'changes_requested'].includes(status) && (
        <form action={assign} style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'end', flexWrap: 'wrap' }}>
          <input type="hidden" name="id" value={id} />
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }} htmlFor="reviewer">Assign reviewer (user id)</label>
            <input id="reviewer" name="reviewer" style={{ minHeight: 40 }} placeholder="uuid or blank to clear" />
          </div>
          <button type="submit" style={{ minHeight: 40 }}>Assign</button>
        </form>
      )}
      <Msg s={asgState} />
    </div>
  );
}
