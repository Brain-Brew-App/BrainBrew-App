'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { retirePuzzle, deleteDraft, createRevisionAction } from './actions';

export function RevisionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(createRevisionAction, {} as { error?: string });
  return (
    <form action={action} style={{ display: 'grid', gap: 8, maxWidth: 460 }}>
      <input type="hidden" name="id" value={id} />
      <div className="kpi-label">Create revised version (immutable content is never edited in place)</div>
      <p className="faint" style={{ margin: 0 }}>Opens a new draft that copies the seed and links this puzzle as its parent. It must be rebuilt, revalidated and reviewed independently; this puzzle is untouched.</p>
      <button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create revised version'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
    </form>
  );
}

export function RetireForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(retirePuzzle, {} as { error?: string; ok?: string });
  return (
    <form action={action} style={{ display: 'grid', gap: 8, maxWidth: 460 }}>
      <input type="hidden" name="id" value={id} />
      <div className="kpi-label">Retire (exclude from future use; history kept)</div>
      <input name="reason" placeholder="Reason (required)" required />
      <button type="submit" disabled={pending}>{pending ? 'Retiring…' : 'Retire puzzle'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
      {state?.ok && <span className="pill ok">{state.ok}</span>}
    </form>
  );
}

export function DeleteDraftForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteDraft, {} as { error?: string; ok?: string });
  const router = useRouter();
  useEffect(() => { if (state?.ok === 'deleted') router.push('/puzzles'); }, [state, router]);
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 8, maxWidth: 460, borderColor: 'var(--danger)' }}>
      <input type="hidden" name="id" value={id} />
      <div className="kpi-label" style={{ color: 'var(--danger)' }}>Delete draft (only if never used — irreversible)</div>
      <p className="faint" style={{ margin: 0 }}>Removes the draft, its answer and validation records. Blocked automatically if the puzzle was ever approved, scheduled or used.</p>
      <input name="reason" placeholder="Reason (required)" required />
      <input name="confirm" placeholder="Type DELETE to confirm" required />
      <input name="password" type="password" autoComplete="current-password" placeholder="Reauthenticate — your password" required />
      <button className="danger" type="submit" disabled={pending}>{pending ? 'Deleting…' : 'Delete draft'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
    </form>
  );
}
