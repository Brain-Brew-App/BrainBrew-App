/**
 * Live email-upgrade verification — `npm run cloud:upgrade-check`.
 *
 * Proves the Phase 5C invariants on the LIVE project: an anonymous user who
 * secures their progress with an email keeps the SAME auth UUID, the SAME
 * profile, and the SAME attempts, and becomes `permanent` only AFTER the email
 * is confirmed. Email verification is simulated with the admin API
 * (`updateUserById({ email, email_confirm: true })`) — the exact state the
 * client's link callback produces — because a real inbox isn't available here.
 *
 * Also verifies: pending (unverified) email does NOT flip account_type; a
 * conflict email cannot be attached to a second user (no merge); the permanent
 * session restores after "restart"; attempts stay unranked; no email leaks into
 * the profile projection.
 *
 * Needs the publishable key (client) and the secret key (admin simulation).
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SEC = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SEC) { console.error('Missing env (publishable + secret)'); process.exit(2); }

const admin = createClient(URL, SEC, { auth: { persistSession: false } });
const mk = () => createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
const rand = () => Array.from(webcrypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

async function invoke(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) { let code = 'error'; try { code = (await error.context.json()).error ?? code; } catch { /**/ } return { error: code }; }
  return { data };
}

const cleanup = [];
try {
  // 1. Anonymous user + complete profile.
  const A = mk();
  await A.auth.signInAnonymously();
  const uidBefore = (await A.auth.getUser()).data.user.id;
  cleanup.push(uidBefore);
  ok('starts anonymous', (await A.auth.getUser()).data.user.is_anonymous === true);

  const username = `sec_${rand().slice(0, 8)}`;
  await A.rpc('set_username', { p_username: username });
  await A.rpc('set_country', { p_country: 'AE', p_display: true });
  const profBefore = (await A.rpc('get_my_profile')).data;
  ok('profile complete before upgrade', profBefore.onboarding_status === 'complete' && profBefore.account_type === 'anonymous');

  // 2. Own an attempt.
  const installId = `install_${rand()}`;
  const start = (await invoke(A, 'start-attempt', { sessionId: installId, appVersion: '1.0.0' })).data;
  ok('created an owned attempt', typeof start?.attemptId === 'string');
  const attemptOwnerBefore = (await admin.from('attempts').select('user_id').eq('id', start.attemptId).single()).data.user_id;
  ok('attempt owned by the anonymous user', attemptOwnerBefore === uidBefore);

  // 3. Client requests the email upgrade (real call path). Rate limits are fine
  //    to observe — the point is the request is accepted or throttled, not sent.
  const email = `bbsec_${rand()}@gmail.com`;
  const up = await A.auth.updateUser({ email });
  ok('updateUser is accepted or rate-limited (request path works)',
    !up.error || /rate limit/i.test(up.error.message));

  // 3b. BEFORE verification, account_type must NOT be permanent.
  ok('pending email does not flip account_type', (await A.rpc('sync_account_type')).data.account_type === 'anonymous');

  // 4. Simulate the verified email click (admin) — same user gains the email.
  const confirm = await admin.auth.admin.updateUserById(uidBefore, { email, email_confirm: true });
  ok('verification attaches the email to the SAME user', !confirm.error && confirm.data.user.id === uidBefore);
  ok('user is no longer anonymous after verification', confirm.data.user.is_anonymous === false);
  ok('the identity list gained an email identity', (confirm.data.user.identities ?? []).some((i) => i.provider === 'email'));

  // 5. Client refreshes → same UUID, permanent claim → sync marks permanent.
  await A.auth.refreshSession();
  const uidAfter = (await A.auth.getUser()).data.user.id;
  ok('the auth UUID is UNCHANGED across upgrade', uidAfter === uidBefore);
  ok('account_type syncs to permanent only after verification', (await A.rpc('sync_account_type')).data.account_type === 'permanent');

  // 6. Profile continuity: same id, username, country; unchanged onboarding.
  const profAfter = (await A.rpc('get_my_profile')).data;
  ok('profile id unchanged', profAfter.id === profBefore.id && profAfter.id === uidBefore);
  ok('username + country preserved', profAfter.username === username && profAfter.country_code === 'AE');
  ok('account_type now permanent', profAfter.account_type === 'permanent');
  ok('email absent from the profile projection', !('email' in profAfter) && JSON.stringify(profAfter).indexOf('@') === -1);
  ok('exactly one profile for the user (no duplicate)',
    (await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', uidBefore)).count === 1);

  // 7. Attempt continuity: still owned by the same UUID, still unranked.
  const attemptOwnerAfter = (await admin.from('attempts').select('user_id, is_ranked').eq('id', start.attemptId).single()).data;
  ok('existing attempt still owned by the same UUID', attemptOwnerAfter.user_id === uidBefore);
  ok('attempt remains unranked', attemptOwnerAfter.is_ranked === false);

  // 8. Restart: a fresh client restores the PERMANENT session.
  const sessA = (await A.auth.getSession()).data.session;
  const restored = mk();
  await restored.auth.setSession({ access_token: sessA.access_token, refresh_token: sessA.refresh_token });
  const ru = (await restored.auth.getUser()).data.user;
  ok('permanent session restores after restart (same UUID, not anonymous)', ru.id === uidBefore && ru.is_anonymous === false);

  // 9. Conflict: a second user cannot attach the same confirmed email (no merge).
  const B = mk();
  await B.auth.signInAnonymously();
  const uidB = (await B.auth.getUser()).data.user.id;
  cleanup.push(uidB);
  const conflict = await admin.auth.admin.updateUserById(uidB, { email, email_confirm: true });
  ok('the same email cannot be attached to a second user (no merge)', Boolean(conflict.error));
  ok('the conflicting user keeps its OWN separate UUID', (await B.auth.getUser()).data.user.id === uidB && uidB !== uidBefore);
  // User A's ownership is untouched.
  ok('user A profile + attempt unaffected by the conflict',
    (await admin.from('attempts').select('user_id').eq('id', start.attemptId).single()).data.user_id === uidBefore);
} finally {
  for (const id of cleanup) await admin.auth.admin.deleteUser(id).catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} UPGRADE LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live email-upgrade checks passed — same UUID, same profile/attempts, permanent only after verification, no merge`);
