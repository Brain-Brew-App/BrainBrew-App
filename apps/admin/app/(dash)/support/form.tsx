'use client';

import { useActionState } from 'react';

import { setTestSubject } from './actions';

export function TestSubjectButton({ userId, excluded }: { userId: string; excluded: boolean }) {
  const [state, action, pending] = useActionState(setTestSubject, {} as { error?: string; ok?: string });
  return (
    <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="exclude" value={excluded ? 'false' : 'true'} />
      <input name="reason" placeholder="Reason (optional)" style={{ flex: 1, minWidth: 180 }} />
      <button type="submit" disabled={pending}>{excluded ? 'Unmark (count in KPIs)' : 'Mark as test subject'}</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
      {state?.ok && <span className="pill ok">{state.ok}</span>}
    </form>
  );
}
