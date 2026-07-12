import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/auth';
import { signOut } from '../login/actions';

export const dynamic = 'force-dynamic';

/**
 * Account-mismatch page: reached when a signed-in account is authenticated but is
 * NOT an active admin. Offers a clean sign-out + switch rather than a silent
 * redirect loop, and never auto-switches accounts.
 */
export default async function AccountPage() {
  const s = await getAdminSession();
  if (s.role) redirect('/'); // actually an admin → straight to the dashboard

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h1>Account not authorized</h1>
        {s.authenticated
          ? <p className="muted">You’re signed in as <b>{s.email ?? 'this account'}</b>, which isn’t an Admin Command Center account. Switch to your admin account to continue.</p>
          : <p className="muted">You’re not signed in.</p>}
        <form action={signOut} style={{ marginTop: 12 }}>
          <button className="primary" type="submit" style={{ width: '100%' }}>Sign out and use another account</button>
        </form>
        <p style={{ marginTop: 12 }}><a href="/login">Return to login</a></p>
      </div>
    </div>
  );
}
