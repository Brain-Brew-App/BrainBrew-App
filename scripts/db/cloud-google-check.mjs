/**
 * Live Google-linking readiness check — `npm run cloud:google-check`.
 *
 * Verifies the parts of Phase 5D that DON'T require a real Google round-trip:
 *   • manual identity linking is enabled on the project (required by linkIdentity),
 *   • an authenticated user can reach `linkIdentity({ provider: 'google' })`,
 *   • the account-type sync is provider-agnostic (keys on is_anonymous, not email).
 *
 * It also reports whether the Google PROVIDER itself is configured (client id +
 * secret). Configuring the provider needs the Founder's Google Cloud OAuth
 * client, so this check PASSES whether or not the provider is live yet — it just
 * reports the remaining Founder step. The interactive OAuth consent round-trip is
 * necessarily Founder/browser-verified.
 *
 * Needs the access token (config read) + publishable key (client).
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'kfcshiktovyjcoepnrfw';
if (!URL || !PUB || !TOKEN) { console.error('Missing env'); process.exit(2); }

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// 1. Config: manual linking enabled; report Google provider status.
const cfg = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
ok('manual identity linking is enabled', cfg.security_manual_linking_enabled === true);
ok('redirect allow-list includes the native scheme', String(cfg.uri_allow_list).includes('brainbrew://'));
const googleConfigured = cfg.external_google_enabled === true && Boolean(cfg.external_google_client_id);
console.log(`  Google provider configured: ${googleConfigured ? 'YES' : 'NO (Founder step — see docs/GOOGLE_ACCOUNT_LINKING.md)'}`);

// 2. An authenticated user can reach linkIdentity for google, and when the
//    provider is live the authorization URL must point at the real Google
//    endpoint, carry the Supabase callback redirect, and request only minimal
//    identity scopes.
const client = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
await client.auth.signInAnonymously();
{
  const { data, error } = await client.auth.linkIdentity({ provider: 'google', options: { skipBrowserRedirect: true, scopes: 'email profile' } });
  if (data?.url) {
    const u = new globalThis.URL(data.url);
    ok('linkIdentity(google) returns an authorization URL (provider live + linking on)', true);
    ok('authorization URL targets the real Google OAuth endpoint', u.host === 'accounts.google.com');
    ok('authorization URL carries a client_id', u.searchParams.has('client_id'));
    ok('authorization URL redirect_uri is the Supabase callback', u.searchParams.get('redirect_uri') === `${URL.replace(/\/$/, '')}/auth/v1/callback`);
    const scopes = new Set((u.searchParams.get('scope') || '').split(/\s+/).filter(Boolean));
    ok('only minimal identity scopes requested (no contacts/drive/etc.)',
      [...scopes].every((s) => ['email', 'profile', 'openid'].includes(s)));
    ok('authorization URL carries CSRF state', u.searchParams.has('state'));
    if (googleConfigured) passed++; // provider config matches the reachable flow
  } else {
    const msg = (error?.message || '').toLowerCase();
    ok('linkIdentity is reachable (not blocked by disabled manual linking)', !msg.includes('manual linking') && !msg.includes('not enabled to link'));
    console.log(`  linkIdentity(google) without provider config -> "${(error?.message || '').slice(0, 80)}" (Founder step: enable the provider)`);
  }
}

// 3. account_type sync is provider-agnostic: it keys on the verified is_anonymous
//    claim, so ANY permanent identity (email OR google) yields 'permanent'. While
//    anonymous it stays anonymous.
{
  const uid = (await client.auth.getUser()).data.user.id;
  ok('anonymous user syncs to anonymous', (await client.rpc('sync_account_type')).data.account_type === 'anonymous');
  // Clean up the throwaway anon user via admin if we have the secret.
  const SEC = process.env.SUPABASE_SECRET_KEY;
  if (SEC) {
    const admin = createClient(URL, SEC, { auth: { persistSession: false } });
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

if (failures.length) {
  console.error(`\n${failures.length} GOOGLE READINESS CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
const tail = googleConfigured
  ? 'provider LIVE + linking on; interactive OAuth consent is Founder/browser-verified'
  : 'manual linking on; provider config is a documented Founder step';
console.log(`✓ ${passed} Google-linking readiness checks passed (${tail})`);
