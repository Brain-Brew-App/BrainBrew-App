/**
 * Edge Function auth security — `npm run test:edge-auth`.
 *
 * The gameplay functions verify the caller LOCALLY against the project JWKS instead
 * of calling auth.getUser() on every request (that was 12 extra network hops per
 * brew). Local verification is only safe if it actually rejects everything a forged
 * client could send — so this proves it against the LIVE deployed functions:
 * no header, garbage, an alg:none forgery, a broken signature, and a tampered expiry
 * must all 401; a genuine signed token must still work.
 */
import { createClient } from '@supabase/supabase-js';
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const call = async (label, token) => {
  const res = await fetch(`${URL}/functions/v1/start-practice-attempt`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'authsec-probe-1234', appVersion: '1.0.0' }),
  });
  const body = await res.json().catch(() => ({}));
  const rejected = res.status === 401;
  console.log(`  ${rejected ? '✓ REJECTED' : '✗ ACCEPTED'}  ${label.padEnd(42)} → ${res.status} ${JSON.stringify(body).slice(0, 40)}`);
  return rejected;
};

console.log('\nForged / invalid tokens must all be rejected (401):');
let ok = true;
ok &= await call('no Authorization header', null);
ok &= await call('garbage string', 'not-a-jwt');
// A well-formed but UNSIGNED token claiming to be an admin user.
const fake = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
  Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated', aud: 'authenticated', iss: `${URL}/auth/v1`, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.';
ok &= await call('forged unsigned JWT (alg:none)', fake);
// Correct shape, signature garbage.
const [h, p] = fake.split('.');
ok &= await call('valid claims, invalid signature', `${h}.${p}.YmFkc2ln`);
// An EXPIRED but genuinely-signed token.
const sb = createClient(URL, ANON, { auth: { persistSession: false } });
const { data } = await sb.auth.signInAnonymously();
const real = data.session.access_token;
const [rh, rp, rs] = real.split('.');
const expiredPayload = JSON.parse(Buffer.from(rp, 'base64url').toString());
expiredPayload.exp = Math.floor(Date.now() / 1000) - 60;
const expired = `${rh}.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')}.${rs}`;
ok &= await call('genuine token, exp tampered to past', expired);

console.log('\nA REAL token must still work:');
const good = await fetch(`${URL}/functions/v1/start-practice-attempt`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${real}`, apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'authsec-probe-5678', appVersion: '1.0.0' }),
});
console.log(`  ${good.status === 200 ? '✓ ACCEPTED' : '✗ REJECTED'}  genuine signed token → ${good.status}`);

const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await admin.from('attempts').delete().eq('user_id', data.user.id);
await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
process.exit(ok && good.status === 200 ? 0 : 1);
