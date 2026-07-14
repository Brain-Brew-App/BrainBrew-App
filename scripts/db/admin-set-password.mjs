/**
 * Set the Admin Command Center password — `npm run admin:set-password`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Founder admin account was created with a GOOGLE identity and no password.
 * `apps/admin/app/login/actions.ts` only ever calls `signInWithPassword`, so that
 * account could never sign in: Supabase rejects the attempt and the page shows the
 * deliberately generic "Invalid credentials." — which looks like a typo but was in
 * fact unfixable from the UI. There is no Google button, no forgot-password flow and
 * no auth-callback route in the admin app, so there was no way in at all.
 *
 * This sets a password on the existing admin user (it does NOT create an account and
 * does NOT grant any role — the `admin_users` row must already exist), then PROVES it
 * works by performing a real sign-in with the public anon key.
 *
 * SECURITY
 * --------
 * The password is read from a hidden prompt on YOUR machine and is never printed,
 * never logged, never sent anywhere except Supabase's auth API over TLS. It never
 * appears in the terminal, in an argv list, in shell history, or in any transcript.
 * The service key comes from the ignored local env, exactly like every other db script.
 */

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error('Missing env. Run via: npm run admin:set-password');
  process.exit(1);
}

/** Prompt without echoing keystrokes. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(String(char))) stdin.removeListener('data', onData);
      else stdout.write('\x1B[2K\x1B[200D' + question + '*'.repeat(rl.line.length));
    };
    stdin.on('data', onData);
    rl.question(question, (answer) => { rl.close(); stdout.write('\n'); resolve(answer); });
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// 1) Find the admin. The role must ALREADY exist — this script never grants one.
const { data: admins, error: adminErr } = await admin.from('admin_users').select('user_id, role');
if (adminErr) { console.error('Cannot read admin_users:', adminErr.message); process.exit(1); }
if (!admins?.length) { console.error('No admin_users rows exist. Nothing to do.'); process.exit(1); }

console.log('Admin accounts:');
const rows = [];
for (const a of admins) {
  const { data } = await admin.auth.admin.getUserById(a.user_id);
  const u = data?.user;
  if (!u) continue;
  const providers = (u.identities ?? []).map((i) => i.provider).join(', ') || 'none';
  rows.push({ id: u.id, email: u.email, role: a.role, providers });
  console.log(`  [${rows.length}] ${u.email}  role=${a.role}  identities=${providers}`);
}
if (!rows.length) { console.error('No matching auth users.'); process.exit(1); }

const pick = rows.length === 1 ? '1' : await ask(`\nWhich account? [1-${rows.length}]: `);
const target = rows[Number(pick) - 1];
if (!target) { console.error('Invalid selection.'); process.exit(1); }

console.log(`\nSetting a password for ${target.email} (role: ${target.role}).`);
console.log('It is never printed, logged, or stored anywhere by this script.\n');

const pw1 = await askHidden('New password (min 12 chars): ');
if (pw1.length < 12) { console.error('\nToo short — use at least 12 characters.'); process.exit(1); }
const pw2 = await askHidden('Confirm password:            ');
if (pw1 !== pw2) { console.error('\nPasswords do not match.'); process.exit(1); }

// 2) Set it.
const { error: upErr } = await admin.auth.admin.updateUserById(target.id, {
  password: pw1,
  email_confirm: true,
});
if (upErr) { console.error('\nFailed to set password:', upErr.message); process.exit(1); }

// 3) PROVE it works — a real sign-in with the public anon key, exactly as the login
//    page does. Setting a password on a Google-only account is not obviously
//    sufficient, so this is verified rather than assumed.
const pub = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({
  email: target.email, password: pw1,
});

if (signErr || !signIn?.user) {
  console.error('\n✕ Password was set but sign-in still FAILS:', signErr?.message ?? 'no user');
  console.error('  Do not assume the admin login works. Report this.');
  process.exit(1);
}

// 4) And confirm the role gate the login page applies right after auth.
const { data: role } = await admin.rpc('admin_role_of', { p_user: signIn.user.id });
await pub.auth.signOut().catch(() => {});

console.log('\n✓ Password set AND verified by a real sign-in.');
console.log(`✓ admin_role_of → ${role ?? 'NULL'} ${role ? '(the login page will admit this account)' : '(NO ROLE — the login page will reject it)'}`);
console.log('\nSign in at https://admin.brainbrew.dev/login with that email and password.');
