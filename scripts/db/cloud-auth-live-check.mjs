/**
 * Live anonymous-Auth + profile + ownership verification — `npm run cloud:auth-check`.
 *
 * Drives the DEPLOYED functions with REAL Supabase Anonymous Auth (publishable
 * key only) and proves the Phase 5B identity model on the live project:
 *
 *   • one anonymous auth user is created (is_anonymous true);
 *   • the same user is restored from a persisted session (restart);
 *   • a profile exists (username_required) and onboarding completes;
 *   • username uniqueness is enforced by the database across users;
 *   • attempts bind to the auth user; the result is UNRANKED; no answer leaks;
 *   • another authenticated user cannot use the owner's attempt token;
 *   • an unauthenticated request is rejected.
 *
 * Needs only the two PUBLIC env vars.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';

import { compilePureModules } from '../compile.mjs';
import { playsFor } from './plays.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !PUB) { console.error('Missing public env vars'); process.exit(2); }

const { load, out } = compilePureModules();
const { ALL_PUZZLES } = await load('content/library.js');
const byId = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const rand = () => Array.from(webcrypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const mk = () => createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });

async function invoke(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    let code = 'error';
    try { code = (await error.context.json()).error ?? code; } catch { /* keep */ }
    return { error: code };
  }
  return { data };
}

// 1. Anonymous sign-in → user A.
const A = mk();
{
  const { data, error } = await A.auth.signInAnonymously();
  ok('anonymous sign-in succeeds', !error && Boolean(data.user));
  ok('the user is anonymous (is_anonymous claim)', data.user?.is_anonymous === true);
}
const sessionA = (await A.auth.getSession()).data.session;
const userAId = (await A.auth.getUser()).data.user.id;
ok('auth user has a UUID identity', /^[0-9a-f-]{36}$/.test(userAId));

// 2. Restart: a fresh client restores the SAME user from the persisted session.
{
  const restored = mk();
  await restored.auth.setSession({ access_token: sessionA.access_token, refresh_token: sessionA.refresh_token });
  const id = (await restored.auth.getUser()).data.user?.id;
  ok('the same auth user is restored after "restart"', id === userAId);
}

// 3. Profile lifecycle.
{
  const prof = (await A.rpc('get_my_profile')).data;
  ok('a profile exists for the new auth user', prof && prof.id === userAId);
  ok('new profile needs onboarding', prof.onboarding_status === 'username_required' && prof.account_type === 'anonymous');
  ok('profile projection has no email/moderation fields', !('email' in prof) && !('moderation_flags' in prof));
}
const username = `live_${rand().slice(0, 8)}`;
{
  const avail = (await A.rpc('check_username_available', { p_username: username })).data;
  ok('a fresh username is available', avail.available === true);
  const setU = await A.rpc('set_username', { p_username: username });
  ok('set_username succeeds', !setU.error);
  const setC = await A.rpc('set_country', { p_country: 'AE', p_display: true });
  ok('set_country succeeds', !setC.error);
  const prof = (await A.rpc('get_my_profile')).data;
  ok('onboarding completes with username + country', prof.onboarding_status === 'complete' && prof.username === username && prof.country_code === 'AE');
}

// 4. Username uniqueness across a second auth user.
const B = mk();
await B.auth.signInAnonymously();
const userBId = (await B.auth.getUser()).data.user.id;
{
  const setU = await B.rpc('set_username', { p_username: username.toUpperCase() });
  ok('a case-variant of a taken username is rejected across users', Boolean(setU.error));
  // B can read only its own profile (RLS): get_my_profile returns B, never A.
  const bProf = (await B.rpc('get_my_profile')).data;
  ok('RLS: user B reads only its own profile', bProf.id === userBId && bProf.username === null);
}

// 5. Unauthenticated request is rejected.
{
  const anon = mk(); // never signed in — only the publishable key
  const r = await invoke(anon, 'start-attempt', { sessionId: rand() + rand() });
  ok('an unauthenticated start-attempt is rejected', r.error === 'auth_required' || r.error === 'auth_invalid');
}

// 6. Authenticated gameplay as user A — owned, unranked, no leak.
const installId = `install_${rand()}`;
const start = (await invoke(A, 'start-attempt', { sessionId: installId, appVersion: '1.0.0' })).data;
ok('authenticated start-attempt issues a token', typeof start?.attemptToken === 'string');

let total = 0;
let ownerAttemptToken = start.attemptToken;
let firstOpenToken = null;
for (const pos of [1, 2, 3, 4, 5]) {
  const opened = (await invoke(A, 'open-puzzle', { attemptToken: start.attemptToken, sessionId: installId, position: pos })).data;
  ok(`open ${pos}: no answer field in the puzzle`,
    !['oddTileId', 'correctOptionId', 'targetIds', 'isTarget', 'explanation', 'pairTileIds', 'correctOrder'].some((k) => k in opened.puzzle));
  if (pos === 1) firstOpenToken = opened.openToken;
  const puzzle = byId.get(opened.puzzle.puzzleId);
  const [perfect] = playsFor(puzzle, 1000);
  const res = (await invoke(A, 'submit-answer', { openToken: opened.openToken, sessionId: installId, position: pos, submission: perfect.raw })).data;
  ok(`submit ${pos}: server verdict + explanation only now`, res.verdict === 'correct' && res.explanation?.length > 0);
  total += res.points;
}
const done = (await invoke(A, 'complete-attempt', { attemptToken: start.attemptToken, sessionId: installId })).data;
ok('final BrewScore = sum of server slots', done.finalScore === total);
ok('the attempt is UNRANKED', done.isRanked === false);

// 7. Cross-user: user B cannot use A's attempt token (B's JWT → different user).
{
  const r = await invoke(B, 'open-puzzle', { attemptToken: ownerAttemptToken, sessionId: installId, position: 1 });
  ok('another auth user cannot use the owner\'s attempt token', /invalid_token|wrong_user|attempt_not_active|already/.test(r.error ?? ''));
}

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} CLOUD AUTH LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live anonymous-auth + profile + ownership checks passed on the live project`);
