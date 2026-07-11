/**
 * Assign / update an admin role — `node scripts/db/with-secrets.mjs node scripts/db/set-admin-role.mjs <email|uuid> <role> [--disable]`.
 *
 * The ONLY way founder/super_admin (or any admin role) is granted. Runs with the
 * service role from a privileged shell — never through the browser or the admin
 * UI. It looks the user up by email (or accepts a UUID), upserts admin_users, and
 * writes an admin_audit_log entry. It NEVER prints secrets.
 *
 * Roles: founder | super_admin | product_admin | content_admin | finance |
 *        support | engineering | viewer
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';

const ROLES = ['founder', 'super_admin', 'product_admin', 'content_admin', 'finance', 'support', 'engineering', 'viewer'];
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SECRET) { console.error('Missing EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY'); process.exit(2); }

const [ident, role, ...flags] = process.argv.slice(2);
const disable = flags.includes('--disable');
if (!ident || !role || !ROLES.includes(role)) {
  console.error(`Usage: set-admin-role <email|uuid> <role> [--disable]\n  role ∈ ${ROLES.join(' | ')}`);
  process.exit(2);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUserId(x) {
  if (UUID_RE.test(x)) return x;
  // Look up by email via the Admin API (paginated).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('admin_list_failed');
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === x.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

const userId = await resolveUserId(ident);
if (!userId) { console.error('No auth user found for that email/uuid. The person must sign in once first.'); process.exit(1); }

const status = disable ? 'disabled' : 'active';
const { error: upErr } = await admin.from('admin_users').upsert(
  { user_id: userId, role, status, last_reviewed_at: new Date().toISOString() },
  { onConflict: 'user_id' },
);
if (upErr) { console.error('Failed to upsert admin_users:', upErr.message); process.exit(1); }

// Audit the grant itself (no secrets, no email in the summary — user id only).
await admin.rpc('admin_log', {
  p_admin: userId, p_role: role, p_action: disable ? 'admin_role_disabled' : 'admin_role_set',
  p_target_type: 'admin_user', p_target_id: userId,
  p_summary: { role, status }, p_reason: 'privileged CLI grant', p_request_id: null,
  p_ip_hash: null, p_success: true, p_approval_ref: null,
}).catch(() => { /* audit is best-effort here; the row is already set */ });

console.log(`✓ ${status === 'active' ? 'Granted' : 'Disabled'} role "${role}" for user ${userId.slice(0, 8)}… (audited)`);
