/**
 * Admin auth + RBAC (Phase 7F) — SERVER ONLY.
 *
 * Every privileged page/action calls `requireAdmin()` / `requireCapability()`.
 * The role comes from the DATABASE (`admin_role_of`), never from a client claim
 * or an email domain, and the capability check calls the DB `admin_can` so the UI
 * and the server share ONE permission matrix (no divergence). Enforcement is
 * server-side: hiding a button is never the security boundary.
 */

import { redirect } from 'next/navigation';

import { adminClient, sessionClient } from './supabase';

export type AdminRole =
  | 'founder' | 'super_admin' | 'product_admin' | 'content_admin'
  | 'finance' | 'support' | 'engineering' | 'viewer';

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AdminRole;
}

/** The verified admin context, or null (not signed in, or not an active admin). */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supa = await sessionClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  // Resolve role via the service role (active admins only).
  const svc = adminClient();
  const { data, error } = await svc.rpc('admin_role_of', { p_user: user.id });
  if (error || !data) return null;
  return { userId: user.id, email: user.email ?? null, role: data as AdminRole };
}

/** Require an active admin; redirect to /login otherwise. Returns the context. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/** Whether a role may perform a capability — the DB matrix is authoritative. */
export async function can(role: AdminRole, capability: string): Promise<boolean> {
  const svc = adminClient();
  const { data, error } = await svc.rpc('admin_can', { p_role: role, p_capability: capability });
  return !error && data === true;
}

/** Require a capability; 403 (redirect to /denied) otherwise. Returns context. */
export async function requireCapability(capability: string): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!(await can(ctx.role, capability))) redirect('/denied');
  return ctx;
}

/** Non-throwing capability check for a known context (for conditional UI). */
export async function contextCan(ctx: AdminContext, capability: string): Promise<boolean> {
  return can(ctx.role, capability);
}
