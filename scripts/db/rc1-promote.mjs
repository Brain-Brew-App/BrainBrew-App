/**
 * RC1-A test provisioning — `node scripts/db/rc1-promote.mjs <uid-prefix> <tag>`.
 *
 * Ranked play requires `profiles.account_type = 'permanent'`, which is derived from
 * the VERIFIED `is_anonymous` JWT claim — a client cannot forge it. So a device that
 * signed in as a guest cannot run the ranked B-series until it has a confirmed
 * identity.
 *
 * This confirms an email on the device's CURRENT anonymous user via the Supabase
 * admin API — precisely what Supabase itself does when a player clicks the link in
 * the confirmation email, minus the inbox. It does NOT bypass the rule: the user
 * genuinely stops being anonymous, and the app still derives `account_type` from the
 * verified claim on its next token refresh.
 *
 * WHAT THIS THEREFORE DOES NOT CERTIFY: the email-link UX itself (sending, opening,
 * deep-link callback). That must be exercised separately with a real inbox.
 *
 * The address is synthetic (`@brainbrew.test`) — never a real mailbox, so nothing is
 * ever sent anywhere.
 */

import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const prefix = process.argv[2];
const tag = process.argv[3] ?? 'rc1a';
if (!prefix) { console.error('usage: rc1-promote.mjs <uid-prefix> <tag>'); process.exit(1); }

const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.error('listUsers failed:', error.message); process.exit(1); }

const user = list.users.find((u) => u.id.startsWith(prefix));
if (!user) { console.error(`no auth user starting with ${prefix}`); process.exit(1); }

const email = `${tag}-${user.id.slice(0, 8)}@brainbrew.test`;
const { error: upErr } = await db.auth.admin.updateUserById(user.id, { email, email_confirm: true });
if (upErr) { console.error('promote failed:', upErr.message); process.exit(1); }

const { data: after } = await db.auth.admin.getUserById(user.id);
console.log(`promoted ${user.id.slice(0, 8)}…`);
console.log(`  is_anonymous : ${after.user.is_anonymous}   (false ⇒ the app will derive account_type='permanent')`);
console.log(`  email        : ${email.replace(/^(.{4}).*(@.*)$/, '$1***$2')}`);
console.log('  → relaunch the app so the JWT refreshes and sync_account_type() runs.');
