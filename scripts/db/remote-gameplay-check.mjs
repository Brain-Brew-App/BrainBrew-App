/**
 * Remote server-authoritative gameplay verification (Phase 4B, Step 12).
 *
 * Drives the REAL deployed Edge Functions with the publishable key only — the
 * exact client capability — and proves the secure path end to end on the live
 * project: fetch the public pack (no answers), start an unranked attempt, open
 * each slot, submit raw answers, receive server-scored verdicts + explanations,
 * complete the attempt. Then the adversarial cases: duplicate, wrong-slot,
 * altered/ wrong-session tokens, post-completion mutation, direct Data API
 * writes, and the is_ranked=false guarantee.
 *
 * Scoring is cross-checked against the canonical local scorer using the SERVER's
 * own reported elapsedMs, so accuracy AND speed points must match exactly. The
 * local library (identical to remote by parity) supplies the correct/wrong raw
 * submissions the client itself never holds.
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/remote-gameplay-check.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { compilePureModules } from '../compile.mjs';
import { playsFor } from './plays.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const svc = createClient(URL, SECRET, { auth: { persistSession: false } });

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

async function fn(name, body) {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PUB, Authorization: `Bearer ${PUB}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// Local canonical scorer + content (identical to remote by parity).
const { load, out } = compilePureModules();
const app = await load('scoring/brewScore.js');
const { ALL_PUZZLES } = await load('content/library.js');
const puzzleById = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

const ANSWER_FIELDS = ['oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm', 'correctOrder', 'constraints', 'membership', 'targetIds', 'explanation'];
const SESSION = `remote-test-${Date.now()}-aaaaaaaa`; // ≥16 chars, unique, identifiable for cleanup
const cleanupSessions = [SESSION];

// ============================================================================
// 1. Public pack (no answers)
// ============================================================================
const pack = await fn('get-daily-pack', {});
ok('get-daily-pack returns 5 puzzles', pack.status === 200 && pack.json.puzzles?.length === 5);
ok('public puzzles carry no answer field', pack.json.puzzles.every((p) => ANSWER_FIELDS.every((f) => !(f in p))));

// ============================================================================
// 2. Full honest attempt (correct answers), scored + cross-checked
// ============================================================================
const start = await fn('start-attempt', { sessionId: SESSION, appVersion: '1.0.0' });
ok('start-attempt issues a token', start.status === 200 && typeof start.json.attemptToken === 'string');
const attemptToken = start.json.attemptToken;

let expectedTotal = 0;
for (const pos of [1, 2, 3, 4, 5]) {
  const opened = await fn('open-puzzle', { attemptToken, sessionId: SESSION, position: pos });
  ok(`open-puzzle ${pos} succeeds`, opened.status === 200 && typeof opened.json.openToken === 'string');
  ok(`open-puzzle ${pos} withholds the explanation/answer`, !('explanation' in opened.json.puzzle) && ANSWER_FIELDS.every((f) => !(f in opened.json.puzzle)));

  const puzzle = puzzleById.get(opened.json.puzzle.puzzleId);
  const [perfect] = playsFor(puzzle, 0);
  const res = await fn('submit-answer', { openToken: opened.json.openToken, sessionId: SESSION, position: pos, submission: perfect.raw });
  ok(`submit ${pos} scores correct`, res.status === 200 && res.json.correct === true && res.json.verdict === 'correct');
  ok(`submit ${pos} reveals explanation only now`, typeof res.json.explanation === 'string' && res.json.explanation.length > 0);

  // Cross-check full points against the local scorer using the SERVER's elapsedMs.
  const local = app.scorePuzzle(puzzle, playsFor(puzzle, res.json.elapsedMs)[0].answer);
  ok(`submit ${pos} (${puzzle.engineId}) matches local scorer exactly`,
    res.json.points === local.points && res.json.accuracyPoints === local.accuracyPoints && res.json.speedPoints === local.speedPoints);
  expectedTotal += res.json.points;

  // Duplicate submission (replay of the open token) is rejected.
  const dup = await fn('submit-answer', { openToken: opened.json.openToken, sessionId: SESSION, position: pos, submission: perfect.raw });
  ok(`submit ${pos} cannot be replayed`, dup.status === 409 && dup.json.error === 'already_submitted');
}

const done = await fn('complete-attempt', { attemptToken, sessionId: SESSION });
ok('complete-attempt returns the summed BrewScore', done.status === 200 && done.json.finalScore === expectedTotal);
ok('completed attempt is UNRANKED', done.json.isRanked === false);
ok('complete-attempt is idempotent', (await fn('complete-attempt', { attemptToken, sessionId: SESSION })).json.finalScore === expectedTotal);
ok('a completed attempt cannot open a new slot', (await fn('open-puzzle', { attemptToken, sessionId: SESSION, position: 1 })).json.error === 'attempt_not_active' || (await fn('open-puzzle', { attemptToken, sessionId: SESSION, position: 1 })).status === 409);

// ============================================================================
// 3. Adversarial cases (fresh attempt so the scored one is untouched)
// ============================================================================
const adv = await fn('start-attempt', { sessionId: SESSION, appVersion: '1.0.0' });
const advToken = adv.json.attemptToken;

// Wrong answer scores correctly (accuracy component matches local).
{
  const opened = await fn('open-puzzle', { attemptToken: advToken, sessionId: SESSION, position: 2 });
  const puzzle = puzzleById.get(opened.json.puzzle.puzzleId);
  const [, wrong] = playsFor(puzzle, 0);
  const res = await fn('submit-answer', { openToken: opened.json.openToken, sessionId: SESSION, position: 2, submission: wrong.raw });
  const local = app.scorePuzzle(puzzle, playsFor(puzzle, res.json.elapsedMs)[1].answer);
  ok('a wrong answer scores exactly like the local scorer', res.json.points === local.points && res.json.correct === local.correct);
}

// Wrong-slot: an open token for one slot cannot submit another.
{
  const opened = await fn('open-puzzle', { attemptToken: advToken, sessionId: SESSION, position: 3 });
  const res = await fn('submit-answer', { openToken: opened.json.openToken, sessionId: SESSION, position: 4, submission: { selectedId: 'x' } });
  ok('an open token is bound to its slot (wrong-slot rejected)', res.status === 401 && /wrong_slot/.test(res.json.error));
}

// Altered token.
{
  const forged = advToken.slice(0, -3) + (advToken.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
  const res = await fn('open-puzzle', { attemptToken: forged, sessionId: SESSION, position: 1 });
  ok('a tampered token is rejected', res.status === 401 && /invalid_token/.test(res.json.error));
}

// Wrong-session token.
{
  const res = await fn('open-puzzle', { attemptToken: advToken, sessionId: 'different-session-99999', position: 1 });
  ok('a token cannot be used by another session', res.status === 401 && /invalid_token/.test(res.json.error));
}

// Missing token.
{
  const res = await fn('open-puzzle', { sessionId: SESSION, position: 1 });
  ok('a missing token is rejected', res.status === 401);
}

// ============================================================================
// 4. Direct Data API + is_ranked guarantee (service-role/anon assertions)
// ============================================================================
const anon = createClient(URL, PUB, { auth: { persistSession: false } });
{
  const { error } = await anon.from('attempts').insert({ session_id: 'x'.repeat(16), pack_id: 'pack-01' });
  ok('anon cannot write attempts via the Data API', Boolean(error));
}
{
  const { data: att } = await svc.from('attempts').select('id, is_ranked').eq('session_id', SESSION).limit(1);
  const id = att?.[0]?.id;
  ok('every attempt is is_ranked=false', (att ?? []).every((a) => a.is_ranked === false));
  // The is_ranked=false CHECK is enforced: flipping it is rejected.
  const { error } = await svc.from('attempts').update({ is_ranked: true }).eq('id', id);
  ok('is_ranked cannot be set true (CHECK enforced)', Boolean(error));
}

// ============================================================================
// Cleanup: remove only the throwaway test attempts (identifiable session).
// ============================================================================
for (const s of cleanupSessions) {
  await svc.from('attempts').delete().eq('session_id', s); // cascades to attempt_items
}
const { count: leftover } = await svc.from('attempts').select('*', { count: 'exact', head: true }).eq('session_id', SESSION);
ok('test attempts cleaned up', (leftover ?? 0) === 0);

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} REMOTE GAMEPLAY CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} remote server-authoritative gameplay checks passed on the live project`);
