'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';

import { signIn, resetSession } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {} as { error?: string });
  const sp = useSearchParams();
  const notice = sp.get('signedout') ? 'You have been signed out.'
    : sp.get('reset') ? 'Session reset. Please sign in again.'
    : sp.get('expired') ? 'Your session expired. Please sign in again.'
    : null;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={action} className="card" style={{ width: 360 }}>
        <h1>BrainBrew Admin</h1>
        <p className="faint" style={{ marginTop: 0 }}>Authorized personnel only.</p>
        {notice && <p className="pill ok" style={{ display: 'inline-block', marginBottom: 8 }}>{notice}</p>}
        <label className="kpi-label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" style={{ width: '100%', margin: '4px 0 12px' }} />
        <label className="kpi-label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" style={{ width: '100%', margin: '4px 0 16px' }} />
        <button className="primary" type="submit" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {state?.error && <p className="pill danger" style={{ marginTop: 12 }}>{state.error}</p>}
      </form>
      <form action={resetSession} style={{ marginTop: 12 }}>
        <button type="submit" style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}>
          Trouble signing in? Reset session
        </button>
      </form>
    </div>
  );
}
