'use client';

import { useActionState } from 'react';

import { signIn } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {} as { error?: string });
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={action} className="card" style={{ width: 360 }}>
        <h1>BrainBrew Admin</h1>
        <p className="faint" style={{ marginTop: 0 }}>Authorized personnel only.</p>
        <label className="kpi-label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" style={{ width: '100%', margin: '4px 0 12px' }} />
        <label className="kpi-label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" style={{ width: '100%', margin: '4px 0 16px' }} />
        <button className="primary" type="submit" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {state?.error && <p className="pill danger" style={{ marginTop: 12 }}>{state.error}</p>}
      </form>
    </div>
  );
}
