/**
 * Founder bootstrap — create (or password-set) an admin login and grant a role.
 * `node scripts/db/with-secrets.mjs node scripts/db/create-admin-user.mjs <email> <role>`
 *
 * The admin dashboard signs in with EMAIL + PASSWORD (Supabase signInWithPassword),
 * but the mobile app never sets a password — so an admin needs a dedicated account.
 * This creates it with the service role (email pre-confirmed), or sets the password
 * if the email already exists, then upserts admin_users and audits.
 *
 * Password source (never on the command line, so it stays out of shell history):
 *   set the env var ADMIN_BOOTSTRAP_PASSWORD before running. Example (PowerShell):
 *     $env:ADMIN_BOOTSTRAP_PASSWORD = 'a-strong-passphrase'
 *     node scripts/db/with-secrets.mjs node scripts/db/create-admin-user.mjs me@example.com founder
 *
 * Never prints the password or any service credential.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';

const ROLES = ['founder', 'super_admin', 'product_admin', 'content_admin', 'finance', 'support', 'engineering', 'viewer'];
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, role] = process.argv.slice(2);
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

function fail(msg, code = 2) { console.error(msg); process.exit(code); }
if (!URL || !SECRET) fail('Missing EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (run via with-secrets.mjs)');
if (!email || !email.includes('@') || !role || !ROLES.includes(role)) {
  fail(`Usage: create-admin-user <email> <role>\n  role ∈ ${ROLES.join(' | ')}\n  and set env ADMIN_BOOTSTRAP_PASSWORD first.`);
}
if (!password || password.length < 10) fail('Set env ADMIN_BOOTSTRAP_PASSWORD to a strong password (≥10 chars) first — never pass it on the command line.');

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

async function findByEmail(e) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('admin_list_failed: ' + error.message);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === e.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let user = await findByEmail(email);
  if (user) {
    // Existing account (e.g. an upgraded anonymous user) → set a password so it can sign in.
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) fail('Failed to set password: ' + error.message, 1);
    console.log(`Updated existing account ${user.id.slice(0, 8)}… (password set, email confirmed).`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) fail('Failed to create user: ' + error.message, 1);
    user = data.user;
    console.log(`Created admin account ${user.id.slice(0, 8)}… (email confirmed).`);
  }

  const { error: upErr } = await admin.from('admin_users').upsert(
    { user_id: user.id, role, status: 'active', last_reviewed_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (upErr) fail('Failed to upsert admin_users: ' + upErr.message, 1);

  try {
    await admin.rpc('admin_log', {
      p_admin: user.id, p_role: role, p_action: 'admin_bootstrap', p_target_type: 'admin_user',
      p_target_id: user.id, p_summary: { role, status: 'active' }, p_reason: 'founder bootstrap (privileged CLI)',
      p_request_id: null, p_ip_hash: null, p_success: true, p_approval_ref: null,
    });
  } catch { /* audit is best-effort; the role is already set */ }

  console.log(`✓ Role "${role}" granted. Sign in at https://admin.brainbrew.dev with this email + password.`);
}

main().then(() => process.exit(0)).catch((e) => fail('Unexpected error: ' + e.message, 1));
