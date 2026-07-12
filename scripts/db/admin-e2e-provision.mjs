/**
 * Admin E2E test-user provisioning (Phase 7I.2D, Task 1) — Founder-run.
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/admin-e2e-provision.mjs [--verify|--cleanup]
 *   (npm run admin-e2e:provision | admin-e2e:verify | admin-e2e:cleanup)
 *
 * Creates the eight deterministic, KPI-excluded, clearly-internal test identities
 * for the credentialed Playwright suite. Passwords are read ONLY from ignored env
 * (ADMIN_E2E_<ROLE>_PASSWORD) — never generated into output, never printed, never
 * committed. Idempotent + safe to rerun. Verifies the target project first.
 *
 * NEVER uses the Founder's personal account or any production customer account.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const EXPECTED_REF = process.env.SUPABASE_PROJECT_REF;
if (!URL || !SECRET) { console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY (run via with-secrets).'); process.exit(1); }
if (EXPECTED_REF && !URL.includes(EXPECTED_REF)) { console.error(`Refusing: SUPABASE_URL does not match SUPABASE_PROJECT_REF (${EXPECTED_REF}).`); process.exit(1); }

const mode = process.argv.includes('--cleanup') ? 'cleanup' : process.argv.includes('--verify') ? 'verify' : 'provision';
const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

// role → admin_users.role (null = an ordinary player / no admin row); disabled = admin row status='disabled'.
const ROLES = [
  { key: 'FOUNDER', role: 'founder' },
  { key: 'CONTENT', role: 'content_admin' },
  { key: 'ENGINEERING', role: 'engineering' },
  { key: 'FINANCE', role: 'finance' },
  { key: 'SUPPORT', role: 'support' },
  { key: 'VIEWER', role: 'viewer' },
  { key: 'PLAYER', role: null },
  { key: 'DISABLED', role: 'content_admin', disabled: true },
];
const emailFor = (key) => process.env[`ADMIN_E2E_${key}_EMAIL`] ?? `e2e+${key.toLowerCase()}@brainbrew.internal`;
const passFor = (key) => process.env[`ADMIN_E2E_${key}_PASSWORD`];

async function findUser(email) {
  // Page through admin users to find by email (small internal set).
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return (data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

let done = 0;
for (const r of ROLES) {
  const email = emailFor(r.key);
  const existing = await findUser(email);

  if (mode === 'cleanup') {
    // Retain stable identities by default (documented); only clear admin role for a clean matrix.
    if (existing && r.role !== null) await admin.from('admin_users').delete().eq('user_id', existing.id);
    console.log(`cleanup ${r.key}: ${existing ? 'admin role cleared (identity retained)' : 'absent'}`);
    continue;
  }
  if (mode === 'verify') {
    const okUser = !!existing;
    const okRole = r.role === null ? true : okUser && !!(await admin.from('admin_users').select('role,status').eq('user_id', existing.id).maybeSingle()).data;
    console.log(`verify ${r.key} <${email}>: user=${okUser ? '✓' : '✗'} role=${okRole ? '✓' : '✗'}`);
    continue;
  }

  // provision
  const password = passFor(r.key);
  if (!password) { console.error(`✗ ${r.key}: set ADMIN_E2E_${r.key}_PASSWORD in your ignored env first.`); process.exitCode = 1; continue; }
  let userId = existing?.id;
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { internal_test: true, username: `zz_e2e_${r.key.toLowerCase()}` } });
    if (error) { console.error(`✗ ${r.key}: ${error.message}`); process.exitCode = 1; continue; }
    userId = data.user.id;
  } else {
    await admin.auth.admin.updateUserById(existing.id, { password });
  }
  // Admin role (idempotent), KPI exclusion, internal flag.
  if (r.role !== null) {
    await admin.from('admin_users').upsert({ user_id: userId, role: r.role, status: r.disabled ? 'disabled' : 'active' }, { onConflict: 'user_id' });
  }
  await admin.from('analytics_subject_flags').upsert({ user_id: userId, exclude_from_business_kpis: true, note: 'e2e test identity' }, { onConflict: 'user_id' }).then(() => {}, () => {});
  console.log(`✓ ${r.key} <${email}> ${r.role ?? 'player'}${r.disabled ? ' (disabled)' : ''}`);
  done++;
}
if (mode === 'provision') console.log(`\nProvisioned/updated ${done}/${ROLES.length} identities. Passwords were read from env and never printed.`);
