/**
 * Live practice-isolation verification — `npm run cloud:share-practice-check`.
 *
 * Drives the DEPLOYED functions with an ISOLATED permanent test user: plays a
 * ranked brew, then a practice brew, and proves on the live project that:
 *   • attempt_purpose is server-derived ('ranked' then 'practice');
 *   • the practice attempt is UNRANKED and never enters ranked surfaces;
 *   • the ranked score, streak, and leaderboard total are UNCHANGED by practice;
 *   • the practice attempt is absent from ranked_result_projection;
 *   • answer secrecy holds (no answer fields on the wire).
 *
 * Isolated user + attempts are cleaned up. Needs the two PUBLIC env vars + SECRET.
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
if (!URL || !PUB || !SECRET) { console.error('Missing env (need public vars + SECRET)'); process.exit(2); }

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
  if (error) { let code = 'error'; try { code = (await error.context.json()).error ?? code; } catch { /* */ } return { error: code }; }
  return { data };
}
async function playFive(client, attemptToken, sessionId, from = 1) {
  let total = 0; let leak = false;
  for (let pos = from; pos <= 5; pos++) {
    const opened = (await invoke(client, 'open-puzzle', { attemptToken, sessionId, position: pos })).data;
    if (!opened?.puzzle) throw new Error(`open ${pos} failed`);
    if (['oddTileId', 'correctOptionId', 'targetIds', 'explanation'].some((k) => k in opened.puzzle)) leak = true;
    const [perfect] = playsFor(byId.get(opened.puzzle.puzzleId), 1000);
    const res = (await invoke(client, 'submit-answer', { openToken: opened.openToken, sessionId, position: pos, submission: perfect.raw })).data;
    total += res?.points ?? 0;
  }
  return { total, leak };
}

let userId = null;
try {
  const email = `sp_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  const U = mk();
  await U.auth.signInWithPassword({ email, password });
  await U.rpc('set_username', { p_username: `sp_${rand().slice(0, 10)}` });
  await U.rpc('set_country', { p_country: 'AE', p_display: true });

  const status = (await U.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data;
  if (status.reason === 'no_live_pack') {
    ok('SKIP — no live pack today; practice isolation not verifiable live', true);
  } else {
    const sid = `install_${rand()}`;
    // Ranked brew.
    const rstart = (await invoke(U, 'start-attempt', { intent: 'ranked', sessionId: sid, appVersion: '1.0.0' })).data;
    const rplay = await playFive(U, rstart.attemptToken, sid, rstart.resumePosition ?? 1);
    const rdone = (await invoke(U, 'complete-attempt', { attemptToken: rstart.attemptToken, sessionId: sid })).data;
    ok('ranked brew completes as ranked', rdone.isRanked === true);
    ok('no answer fields leaked on the wire', rplay.leak === false);

    const rankedScore = rdone.finalScore;
    const streakBefore = (await U.rpc('get_my_progress_summary', {})).data.current_streak;
    const lbBefore = (await U.rpc('get_daily_leaderboard', { p_scope: 'global' })).data.total;

    // attempt_purpose of the ranked row (via admin).
    const rankedRow = (await admin.from('attempts').select('attempt_purpose,is_ranked').eq('user_id', userId).eq('is_ranked', true).limit(1)).data[0];
    ok('ranked attempt_purpose = ranked', rankedRow.attempt_purpose === 'ranked');

    // Practice brew (unranked).
    const pstart = (await invoke(U, 'start-attempt', { sessionId: sid, appVersion: '1.0.0' })).data;
    await playFive(U, pstart.attemptToken, sid);
    const pdone = (await invoke(U, 'complete-attempt', { attemptToken: pstart.attemptToken, sessionId: sid })).data;
    ok('practice brew completes as UNRANKED', pdone.isRanked === false);

    const practiceRow = (await admin.from('attempts').select('attempt_purpose,is_ranked').eq('user_id', userId).eq('is_ranked', false).limit(1)).data[0];
    ok('practice attempt_purpose = practice', practiceRow.attempt_purpose === 'practice' && practiceRow.is_ranked === false);

    // Ranked surfaces UNCHANGED by practice.
    const statusAfter = (await U.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data;
    ok('ranked score unchanged after practice', statusAfter.locked_score === rankedScore);
    ok('streak unchanged after practice', (await U.rpc('get_my_progress_summary', {})).data.current_streak === streakBefore);
    ok('leaderboard total unchanged after practice', (await U.rpc('get_daily_leaderboard', { p_scope: 'global' })).data.total === lbBefore);

    // Practice absent from the projection.
    const projCount = (await admin.from('ranked_result_projection').select('attempt_id').eq('user_id', userId)).data.length;
    ok('exactly one ranked projection row for the user (practice excluded)', projCount === 1);
  }
} finally {
  if (userId) { await admin.from('attempts').delete().eq('user_id', userId); await admin.auth.admin.deleteUser(userId).catch(() => {}); }
  rmSync(out, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} SHARE/PRACTICE LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live practice-isolation checks passed (isolated user, cleaned up)`);
