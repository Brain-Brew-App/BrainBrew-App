/**
 * Live cloud-client verification — `npm run cloud:live-check`.
 *
 * Drives the DEPLOYED Edge Functions with the PUBLISHABLE key (the exact client
 * capability) and runs every response through the app's REAL compiled guards
 * (`src/cloud/validate.ts`, `src/cloud/answerMap.ts`). It plays a full five-slot
 * session and asserts what a browser network inspection would confirm:
 *
 *   • no answer-revealing field appears in any pre-submit payload (recursive),
 *   • the explanation appears ONLY in the submit response,
 *   • the client validators accept the real server payloads,
 *   • the final BrewScore equals the sum of the server-scored slots,
 *   • the attempt is unranked.
 *
 * Needs only the two PUBLIC env vars (no secret). It is the headless equivalent
 * of the cloud browser session for the parts a browser proves about the wire.
 */

import './load-env.mjs';
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';

import { compilePureModules } from '../compile.mjs';
import { playsFor } from './plays.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !PUB) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(2);
}

// Phase 5B: gameplay functions require a Supabase Auth session. Sign in
// anonymously and carry the user's access token (as the app does).
const authClient = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
await authClient.auth.signInAnonymously();
const ACCESS_TOKEN = (await authClient.auth.getSession()).data.session.access_token;

const { load, out } = compilePureModules();
const validate = await load('cloud/validate.js');
const amap = await load('cloud/answerMap.js');
const { ALL_PUZZLES } = await load('content/library.js');
const byId = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

async function fn(name, body) {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    // apikey = publishable (identifies the app); Authorization = the user's JWT.
    headers: { 'Content-Type': 'application/json', apikey: PUB, Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const guestId = 'guest_' + Array.from(webcrypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
ok('guest id is well-formed', /^guest_[0-9a-f]{32}$/.test(guestId));

// 1. Public pack — validate with the CLIENT validator; assert no leak.
const packRes = await fn('get-daily-pack', {});
ok('get-daily-pack 200', packRes.status === 200);
let pack;
try {
  pack = validate.validateDailyPack(packRes.json);
  ok('client validator accepts the live public pack', pack.puzzles.length === 5);
} catch (e) {
  failures.push(`client rejected live pack: ${e.message}`);
}
// Independent recursive leak scan on the raw wire payload.
ok('no forbidden field anywhere in the public pack (raw)',
  validate.findForbiddenKeys(packRes.json, validate.PRE_SUBMIT_FORBIDDEN).length === 0);

// 2. Start attempt.
const start = validate.validateStartAttempt((await fn('start-attempt', { sessionId: guestId, appVersion: '1.0.0' })).json);
ok('client validator accepts start-attempt', typeof start.attemptToken === 'string');

let total = 0;
for (const pos of [1, 2, 3, 4, 5]) {
  const openRaw = (await fn('open-puzzle', { attemptToken: start.attemptToken, sessionId: guestId, position: pos })).json;
  // Pre-submit: the open payload must carry NO explanation and NO answer field.
  ok(`open ${pos}: no answer/explanation leak (raw, recursive)`,
    validate.findForbiddenKeys(openRaw, validate.PRE_SUBMIT_FORBIDDEN).length === 0);
  const opened = validate.validateOpenPuzzle(openRaw, pos);
  ok(`open ${pos}: client validator accepts it`, typeof opened.openToken === 'string');

  const puzzle = byId.get(opened.puzzle.puzzleId);
  const [perfect] = playsFor(puzzle, 1000);
  const mapped = amap.toSubmission(puzzle.engineId, perfect.answer);
  ok(`open ${pos}: client maps the answer`, mapped.ok === true);
  // The mapped submission carries no score/correctness.
  ok(`submit ${pos}: raw submission has no score/correctness`,
    !Object.keys(mapped.submission).some((k) => /score|correct|verdict|points|accuracy/i.test(k)));

  const submitRaw = (await fn('submit-answer', { openToken: opened.openToken, sessionId: guestId, position: pos, submission: mapped.submission })).json;
  const result = validate.validateSubmitAnswer(submitRaw);
  ok(`submit ${pos}: verdict correct + explanation revealed only now`, result.verdict === 'correct' && result.explanation.length > 0);
  ok(`submit ${pos}: submit payload carries no answer key`,
    validate.findForbiddenKeys(submitRaw, validate.RESULT_FORBIDDEN).length === 0);
  total += result.points;
}

const complete = validate.validateCompleteAttempt((await fn('complete-attempt', { attemptToken: start.attemptToken, sessionId: guestId })).json);
ok('final BrewScore equals the sum of server-scored slots', complete.finalScore === total);
ok('attempt is UNRANKED', complete.isRanked === false);
ok('five per-slot results returned', complete.results.length === 5);

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} CLOUD LIVE-CHECK FAILURE(S):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} live cloud-client checks passed — client guards accept production, no answer leak on the wire, score matches`);
