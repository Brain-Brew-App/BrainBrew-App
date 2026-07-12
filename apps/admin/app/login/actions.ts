'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { adminClient, sessionClient } from '@/lib/supabase';

/** Delete every Supabase auth cookie variant (base + chunks) for this host. */
async function clearAuthCookies() {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.startsWith('sb-') || c.name.includes('-auth-token')) store.delete(c.name);
  }
}

/**
 * Password sign-in. Generic errors only (no user-exists leak). A successful auth
 * still only proceeds if the account is an ACTIVE admin — otherwise we sign back
 * out immediately (no dashboard leak). A fresh sign-in fully replaces any stale
 * session cookies (the middleware then keeps them refreshed correctly).
 */
export async function signIn(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supa = await sessionClient();
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: 'Invalid credentials.' };

  const { data: role } = await adminClient().rpc('admin_role_of', { p_user: data.user.id });
  if (!role) {
    await supa.auth.signOut();
    await clearAuthCookies();
    return { error: 'This account is not authorized for the Admin Command Center.' };
  }
  redirect('/');
}

/** Full sign-out — clears the session and every sb-* cookie variant. */
export async function signOut(): Promise<void> {
  const supa = await sessionClient();
  await supa.auth.signOut().catch(() => {});
  await clearAuthCookies();
  redirect('/login?signedout=1');
}

/**
 * Recovery: clear any stale/duplicate auth cookies WITHOUT needing a valid
 * session. This is the supported fix for a corrupted cookie in a normal browser
 * — one click, no "clear all browser data".
 */
export async function resetSession(): Promise<void> {
  await clearAuthCookies();
  redirect('/login?reset=1');
}
