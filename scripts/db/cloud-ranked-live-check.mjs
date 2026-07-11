/**
 * Live RANKED daily-attempt verification — `npm run cloud:ranked-check`.
 *
 * Drives the DEPLOYED functions and RPCs on the live project through the whole
 * Phase 6A ranked path, with an ISOLATED permanent test user it creates and
 * deletes itself (never touches real players or canonical content):
 *
 *   • a permanent user with a complete profile is ELIGIBLE (get_today_player_status);
 *   • start-attempt intent:'ranked' reserves ONE ranked attempt;
 *   • five server-scored slots complete to a RANKED BrewScore (isRanked + date);
 *   • a second ranked start returns the COMPLETED, locked result (one-per-day);
 *   • replay after ranked completion is UNRANKED practice;
 *   • an anonymous user is ranked-INELIGIBLE (anonymous_account).
 *
 * Needs the two PUBLIC env vars (user sessions) AND the SECRET key (admin create/
 * cleanup + isolated teardown). Run via `node scripts/db/with-secrets.mjs`.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { rmSync } from 'node:fs';

import { compilePureModules } from '../compile.mjs';
import { playsFor } from './plays.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !PUB) { console.error('Missing public env vars'); process.exit(2); }
if (!SECRET) { console.error('Missing SUPABASE_SECRET_KEY (run via with-secrets.mjs)'); process.exit(2); }

const { load, out } = compilePureModules();
const { ALL_PUZZLES } = await load('content/library.js');
const byId = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const rand = () => Array.from(webcrypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const mk = () => createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

async function invoke(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    let code = 'error';
    try { code = (await error.context.json()).error ?? code; } catch { /* keep */ }
    return { error: code };
  }
  return { data };
}

/** Play five slots to completion for the given client; returns the server sum. */
async function playFive(client, attemptToken, sessionId, fromPosition = 1) {
  let total = 0;
  for (let pos = fromPosition; pos <= 5; pos++) {
    const opened = (await invoke(client, 'open-puzzle', { attemptToken, sessionId, position: pos })).data;
    if (!opened?.puzzle) throw new Error(`open ${pos} failed`);
    const puzzle = byId.get(opened.puzzle.puzzleId);
    const [perfect] = playsFor(puzzle, 1000);
    const res = (await invoke(client, 'submit-answer', { openToken: opened.openToken, sessionId, position: pos, submission: perfect.raw })).data;
    total += res?.points ?? 0;
  }
  return total;
}

const email = `ranked_${rand().slice(0, 12)}@brainbrew-test.invalid`;
const password = `Pw_${rand()}`;
let userId = null;

try {
  // --- Provision an ISOLATED permanent test user (email confirmed) ---
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  ok('admin creates a confirmed permanent test user', !created.error && Boolean(created.data.user));
  userId = created.data.user?.id ?? null;

  const U = mk();
  const signIn = await U.auth.signInWithPassword({ email, password });
  ok('the test user signs in (permanent, not anonymous)', !signIn.error && signIn.data.user?.is_anonymous !== true);

  // Complete onboarding: username + country → account_type permanent, onboarding complete.
  const username = `rk_${rand().slice(0, 10)}`;
  ok('set_username succeeds', !(await U.rpc('set_username', { p_username: username })).error);
  ok('set_country succeeds', !(await U.rpc('set_country', { p_country: 'AE', p_display: true })).error);
  const prof = (await U.rpc('get_my_profile')).data;
  ok('profile is permanent + complete', prof.account_type === 'permanent' && prof.onboarding_status === 'complete');

  // --- Eligibility: a complete permanent profile is eligible (or no_live_pack) ---
  const status = (await U.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data;
  const haveLivePack = status.reason !== 'no_live_pack';
  ok('get_today_player_status returns a rank-free shape',
    typeof status.eligible === 'boolean' && !('email' in status) && !('rank_restricted_until' in status) && 'practice_available' in status);
  if (!haveLivePack) {
    ok('SKIP (no live pack today) — ranked completion not verifiable live', true);
  } else {
    ok('a complete permanent profile is ranked-eligible', status.eligible === true && status.reason === 'eligible');

    // --- Start the ONE ranked attempt and complete it ---
    const sessionId = `install_${rand()}`;
    const rstart = (await invoke(U, 'start-attempt', { intent: 'ranked', sessionId, appVersion: '1.0.0' })).data;
    ok('ranked start returns an active ranked attempt', rstart?.status === 'active' && rstart.ranked === true);
    const total = await playFive(U, rstart.attemptToken, sessionId, rstart.resumePosition ?? 1);
    const done = (await invoke(U, 'complete-attempt', { attemptToken: rstart.attemptToken, sessionId })).data;
    ok('the completed brew is RANKED with today\'s date', done.isRanked === true && done.rankedDate === status.today);
    ok('the ranked BrewScore is the server sum (normalized to 100 base)', done.finalScore === total);

    // --- One ranked result per day: a second start returns the locked result ---
    const again = (await invoke(U, 'start-attempt', { intent: 'ranked', sessionId, appVersion: '1.0.0' })).data;
    ok('a second ranked start returns the completed, locked result', again?.status === 'completed' && again.lockedScore === done.finalScore);
    const statusAfter = (await U.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data;
    ok('status now reports today\'s ranked brew complete', statusAfter.ranked_status === 'completed' && statusAfter.locked_score === done.finalScore);

    // --- Replay after ranked completion is UNRANKED practice ---
    const practice = (await invoke(U, 'start-attempt', { sessionId, appVersion: '1.0.0' })).data;
    ok('practice start issues a token', typeof practice?.attemptToken === 'string');
    await playFive(U, practice.attemptToken, sessionId);
    const practiceDone = (await invoke(U, 'complete-attempt', { attemptToken: practice.attemptToken, sessionId })).data;
    ok('replay after ranked completion is UNRANKED', practiceDone.isRanked === false);
  }

  // --- An anonymous user is ranked-ineligible ---
  const G = mk();
  await G.auth.signInAnonymously();
  const gStatus = (await G.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data;
  ok('an anonymous user is ranked-ineligible (anonymous_account)', gStatus.eligible === false && gStatus.reason === 'anonymous_account');
  const gRanked = (await invoke(G, 'start-attempt', { intent: 'ranked', sessionId: `install_${rand()}`, appVersion: '1.0.0' })).data;
  ok('an anonymous ranked start is refused (ineligible)', gRanked?.status === 'ineligible' && gRanked.reason === 'anonymous_account');
  // Cleanup the throwaway anonymous user too.
  const gid = (await G.auth.getUser()).data.user?.id;
  if (gid) { await admin.from('attempts').delete().eq('user_id', gid); await admin.auth.admin.deleteUser(gid); }
} finally {
  // --- Teardown: remove the isolated test user + its attempts (never real data) ---
  if (userId) {
    await admin.from('attempts').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
  rmSync(out, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} CLOUD RANKED LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live ranked checks passed on the live project (isolated test user, cleaned up)`);
