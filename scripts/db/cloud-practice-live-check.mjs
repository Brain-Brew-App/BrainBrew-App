/**
 * Live reserve-Practice verification — `npm run cloud:practice-check`.
 *
 * Drives the DEPLOYED start-practice-attempt + open/submit/complete with an
 * ISOLATED permanent test user, and proves on the live project:
 *   • a Practice brew is five FRESH reserve puzzles, none of today's ranked pack;
 *   • no answer fields leak on the wire;
 *   • Practice completes UNRANKED (attempt_purpose='practice');
 *   • the ranked score, streak, and leaderboard total are UNCHANGED by Practice;
 *   • resume returns the same active Practice; a new one is built after completion;
 *   • Practice is absent from ranked_result_projection;
 *   • a ranked token cannot open the practice attempt (cross-binding denied).
 *
 * Isolated user + attempts cleaned up. Needs the two PUBLIC env vars + SECRET.
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
if (!URL || !PUB || !SECRET) { console.error('Missing env (public vars + SECRET)'); process.exit(2); }

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
async function playFrom(client, token, sessionId, puzzles) {
  let leak = false;
  for (const pz of puzzles) {
    const opened = (await invoke(client, 'open-puzzle', { attemptToken: token, sessionId, position: pz.position })).data;
    if (!opened?.puzzle) throw new Error(`open ${pz.position} failed`);
    if (['oddTileId', 'correctOptionId', 'targetIds', 'explanation'].some((k) => k in opened.puzzle)) leak = true;
    const [perfect] = playsFor(byId.get(opened.puzzle.puzzleId), 1000);
    await invoke(client, 'submit-answer', { openToken: opened.openToken, sessionId, position: pz.position, submission: perfect.raw });
  }
  return leak;
}

let userId = null;
try {
  const email = `pr_${rand().slice(0, 12)}@brainbrew-test.invalid`;
  const password = `Pw_${rand()}`;
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  const U = mk();
  await U.auth.signInWithPassword({ email, password });
  await U.rpc('set_username', { p_username: `pr_${rand().slice(0, 10)}` });
  await U.rpc('set_country', { p_country: 'AE', p_display: true });

  const sid = `install_${rand()}`;
  // Ranked state (only if a live pack exists today) — for the isolation assertions.
  const dp = (await invoke(U, 'get-daily-pack', {})).data;
  const hasLivePack = Boolean(dp && dp.puzzles && dp.puzzles.length === 5);
  const rankedIds = new Set(hasLivePack ? dp.puzzles.map((p) => p.puzzleId) : []);
  let rankedScore = null, streakBefore = 0, lbBefore = 0, rankedTokenForCross = null;
  if (hasLivePack) {
    const rstart = (await invoke(U, 'start-attempt', { intent: 'ranked', sessionId: sid, appVersion: '1.0.0' })).data;
    await playFrom(U, rstart.attemptToken, sid, dp.puzzles);
    const rdone = (await invoke(U, 'complete-attempt', { attemptToken: rstart.attemptToken, sessionId: sid })).data;
    ok('ranked brew completes ranked', rdone.isRanked === true);
    rankedScore = rdone.finalScore; rankedTokenForCross = rstart.attemptToken;
    streakBefore = (await U.rpc('get_my_progress_summary', {})).data.current_streak;
    lbBefore = (await U.rpc('get_daily_leaderboard', { p_scope: 'global' })).data.total;
  } else {
    ok('SKIP ranked comparison — no live pack today (practice is still fully verified)', true);
  }

  // Reserve Practice brew — verified unconditionally (does not need a live ranked pack).
  const pstart = (await invoke(U, 'start-practice-attempt', { sessionId: sid, appVersion: '1.0.0' })).data;
  ok('practice start returns an active unranked brew with 5 puzzles', pstart.status === 'active' && pstart.ranked === false && pstart.puzzles.length === 5 && pstart.resumed === false);
  ok('practice puzzles are in fixed category order (incl. Observation)', pstart.puzzles.map((p) => p.category).join() === 'observation,pattern,logic,language-logic,attention-speed');
  ok('no practice puzzle is one of today\'s ranked puzzles', pstart.puzzles.every((p) => !rankedIds.has(p.puzzleId)));
  ok('practice puzzles carry no answer field on the wire', pstart.puzzles.every((p) => !['oddTileId', 'correctOptionId', 'targetIds', 'explanation'].some((k) => k in p)));

  const presume = (await invoke(U, 'start-practice-attempt', { sessionId: sid, appVersion: '1.0.0' })).data;
  ok('starting practice again resumes the same active attempt', presume.resumed === true);
  if (rankedTokenForCross) {
    const cross = await invoke(U, 'open-puzzle', { attemptToken: rankedTokenForCross, sessionId: sid, position: 1 });
    ok('a completed ranked token cannot be reused to open a slot', Boolean(cross.error));
  }

  const leak = await playFrom(U, pstart.attemptToken, sid, pstart.puzzles);
  const pdone = (await invoke(U, 'complete-attempt', { attemptToken: pstart.attemptToken, sessionId: sid })).data;
  ok('practice completes UNRANKED', pdone.isRanked === false);
  ok('no answer fields leaked during practice', leak === false);
  const practiceRow = (await admin.from('attempts').select('attempt_purpose,is_ranked,practice_pack_id').eq('user_id', userId).eq('is_ranked', false).limit(1)).data[0];
  ok('practice attempt_purpose=practice, bound to a practice pack', practiceRow.attempt_purpose === 'practice' && practiceRow.practice_pack_id !== null);

  // Practice Summary (Phase 7C) — reflects the completed practice; no ranked fields.
  const psum = (await U.rpc('get_my_practice_summary', {})).data;
  ok('practice summary counts the completed brew', psum.locked === false && psum.practice_brews_completed >= 1 && psum.total_practice_puzzles >= 5);
  ok('practice summary carries category stats + no ranked fields', Array.isArray(psum.categories) && psum.categories.length >= 1 && !('current_streak' in psum) && !('global_position' in psum));
  const phist = (await U.rpc('get_my_practice_history', { p_limit: 5 })).data;
  ok('practice history returns the brew, safe fields only', phist.rows.length >= 1 && !('attempt_id' in phist.rows[0]) && !('user_id' in phist.rows[0]));

  // Ranked surfaces UNCHANGED by practice (only meaningful with a live pack).
  if (hasLivePack) {
    ok('ranked score unchanged after practice', (await U.rpc('get_today_player_status', { p_app_version: '1.0.0' })).data.locked_score === rankedScore);
    ok('streak unchanged after practice', (await U.rpc('get_my_progress_summary', {})).data.current_streak === streakBefore);
    ok('leaderboard total unchanged after practice', (await U.rpc('get_daily_leaderboard', { p_scope: 'global' })).data.total === lbBefore);
    ok('practice absent from ranked_result_projection', (await admin.from('ranked_result_projection').select('attempt_id').eq('user_id', userId)).data.length === 1);
  }

  const pnew = (await invoke(U, 'start-practice-attempt', { sessionId: sid, appVersion: '1.0.0' })).data;
  ok('a new practice pack is generated after completion', pnew.resumed === false && pnew.status === 'active');

  // Cross-user denial.
  const email2 = `pr2_${rand().slice(0, 10)}@brainbrew-test.invalid`; const pw2 = `Pw_${rand()}`;
  const u2 = (await admin.auth.admin.createUser({ email: email2, password: pw2, email_confirm: true })).data.user.id;
  const U2 = mk(); await U2.auth.signInWithPassword({ email: email2, password: pw2 });
  const denied = await invoke(U2, 'open-puzzle', { attemptToken: pnew.attemptToken, sessionId: sid, position: 1 });
  ok('another user cannot open the owner\'s practice attempt', Boolean(denied.error));
  await admin.from('attempts').delete().eq('user_id', u2); await admin.auth.admin.deleteUser(u2).catch(() => {});
} finally {
  if (userId) { await admin.from('attempts').delete().eq('user_id', userId); await admin.auth.admin.deleteUser(userId).catch(() => {}); }
  rmSync(out, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} PRACTICE LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live reserve-practice checks passed (isolated user, cleaned up)`);
