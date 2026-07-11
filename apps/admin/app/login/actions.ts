'use server';

import { redirect } from 'next/navigation';

import { adminClient, sessionClient } from '@/lib/supabase';

/**
 * Password sign-in for admins. Generic errors only (no "user not found" vs "wrong
 * password" leak). A successful auth still only reaches the dashboard if the user
 * is an ACTIVE admin — checked here and again by requireAdmin on every page.
 * No signup path exists; admins are provisioned via the privileged CLI.
 */
export async function signIn(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supa = await sessionClient();
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: 'Invalid credentials.' };

  // Must be an active admin, else sign back out immediately (no dashboard leak).
  const svc = adminClient();
  const { data: role } = await svc.rpc('admin_role_of', { p_user: data.user.id });
  if (!role) {
    await supa.auth.signOut();
    return { error: 'This account is not authorized for the Admin Command Center.' };
  }
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supa = await sessionClient();
  await supa.auth.signOut();
  redirect('/login');
}
