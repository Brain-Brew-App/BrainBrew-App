'use client';

import { useActionState } from 'react';
import { createPackDraftAction } from './actions';

/** Create a new pack draft (optionally date-targeted) and jump to its editor. */
export function CreatePackButton() {
  const [state, create] = useActionState(createPackDraftAction, {} as { error?: string });
  return (
    <form action={create} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="date" name="date" style={{ minHeight: 36 }} title="Optional intended UTC date" />
      <button type="submit" className="primary" style={{ minHeight: 36 }}>+ New pack draft</button>
      {state?.error && <span className="pill danger">{state.error}</span>}
    </form>
  );
}
