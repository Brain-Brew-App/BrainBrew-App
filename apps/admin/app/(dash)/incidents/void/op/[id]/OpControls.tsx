'use client';

import { useActionState } from 'react';
import { retryVoidAction } from '../../actions';

export function OpControls({ opId, status }: { opId: string; status: string }) {
  const [state, run] = useActionState(retryVoidAction, {} as { error?: string; ok?: string });
  const canContinue = ['running', 'partially_failed'].includes(status);
  const canRetry = ['partially_failed', 'failed'].includes(status);
  return (
    <div className="card">
      <div className="kpi-label" style={{ marginBottom: 6 }}>Recovery (Founder)</div>
      <form action={run} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="hidden" name="op_id" value={opId} />
        <button type="submit" name="mode" value="continue" disabled={!canContinue} style={{ minHeight: 40 }}>Continue processing</button>
        <button type="submit" name="mode" value="retry" className="danger" disabled={!canRetry} style={{ minHeight: 40 }}>Retry from start</button>
      </form>
      <p className="faint" style={{ marginTop: 6 }}>Recalculation is idempotent — continue/retry never causes score drift.</p>
      {state?.error ? <div className="banner danger">{state.error}</div> : state?.ok ? <div className="banner">{state.ok}</div> : null}
    </div>
  );
}
