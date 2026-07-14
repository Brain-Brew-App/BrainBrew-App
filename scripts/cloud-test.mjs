/**
 * Cloud-client unit suite — `npm run test:cloud`.
 *
 * Exercises the pure cloud modules (mode config, guest identity, answer mapping,
 * payload validation, session state machine) in plain Node, the same way
 * `npm test` exercises scoring/content. No React, no network — the platform and
 * network layers are verified in a browser (Task 15).
 *
 * Includes the mutation cases the spec calls for: forbidden answer fields
 * rejected recursively, invalid transitions rejected, duplicate Start/Submit
 * rejected, malformed answers rejected.
 */

import { compilePureModules } from './compile.mjs';
import { playsFor } from './db/plays.mjs';

const { load, out } = compilePureModules();
const mode = await load('cloud/mode.js');
const guest = await load('cloud/guestId.js');
const amap = await load('cloud/answerMap.js');
const validate = await load('cloud/validate.js');
const machine = await load('cloud/sessionMachine.js');
const ctaMod = await load('cloud/rankedCta.js');
const errors = await load('cloud/errors.js');
const diag = await load('cloud/diagnostics.js');
const emailMod = await load('cloud/email.js');
const idMod = await load('cloud/identities.js');
const shareSnap = await load('cloud/shareSnapshot.js');
const practicePolicy = await load('cloud/practicePolicy.js');
const entitlements = await load('cloud/entitlements.js');
const rcOfferings = await load('cloud/revenuecat/offerings.js');
const rcService = await load('cloud/revenuecat/service.js');
const analyticsMod = await load('cloud/analytics/analytics.js');
const { ALL_PUZZLES } = await load('content/library.js');

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));
const throws = (name, fn) => {
  try { fn(); failures.push(`${name} — expected throw`); } catch { passed++; }
};

// =============================================================================
// Mode configuration
// =============================================================================
ok('mode defaults to local when unset', mode.parseContentMode(undefined, true) === 'local');
ok('mode empty string → local', mode.parseContentMode('', true) === 'local');
ok('mode local → local', mode.parseContentMode('local', true) === 'local');
ok('mode cloud → cloud', mode.parseContentMode('cloud', true) === 'cloud');
throws('invalid mode throws in dev', () => mode.parseContentMode('prod', true));
ok('invalid mode falls back to local in prod', mode.parseContentMode('prod', false) === 'local');
ok('cloud config needs supabase vars (ready flag)',
  mode.resolveContentConfig({ EXPO_PUBLIC_CONTENT_SOURCE: 'cloud', EXPO_PUBLIC_SUPABASE_URL: 'u', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' }, true).supabaseReady === true);
throws('cloud without supabase vars throws in dev',
  () => mode.resolveContentConfig({ EXPO_PUBLIC_CONTENT_SOURCE: 'cloud' }, true));
ok('local config never requires supabase vars',
  mode.resolveContentConfig({}, true).mode === 'local');

// =============================================================================
// Guest identity
// =============================================================================
{
  const hex = 'a'.repeat(32);
  const id = guest.formatGuestId(hex);
  ok('guest id has the guest_ prefix and 32 hex', guest.isValidGuestId(id) && id === `guest_${hex}`);
  ok('guest id is ≥16 chars (server requirement)', id.length >= 16);
  throws('too-little randomness throws', () => guest.formatGuestId('abc'));
  ok('a stored valid id is reused (not regenerated)',
    guest.resolveGuestId(id, () => 'b'.repeat(32)).id === id && guest.resolveGuestId(id, () => 'b'.repeat(32)).created === false);
  const fresh = guest.resolveGuestId(null, () => 'c'.repeat(32));
  ok('a missing id is generated once', fresh.created === true && guest.isValidGuestId(fresh.id));
  ok('a malformed stored id is replaced', guest.resolveGuestId('garbage', () => 'd'.repeat(32)).created === true);
  ok('two generations differ (randomness used)',
    guest.resolveGuestId(null, () => 'e'.repeat(32)).id !== guest.resolveGuestId(null, () => 'f'.repeat(32)).id);
  ok('invalid guest ids are rejected', !guest.isValidGuestId('guest_XYZ') && !guest.isValidGuestId('') && !guest.isValidGuestId(42));
}

// =============================================================================
// Answer mapping — all 15 engines
// =============================================================================
{
  const byEngine = new Map();
  for (const p of ALL_PUZZLES) if (!byEngine.has(p.engineId)) byEngine.set(p.engineId, p);
  ok('fixtures cover all 15 engines', byEngine.size === 15);

  for (const [engineId, puzzle] of byEngine) {
    const [perfect] = playsFor(puzzle, 1000);
    const res = amap.toSubmission(engineId, perfect.answer);
    ok(`maps ${engineId}`, res.ok === true);
    // No score/correctness leaks into the submission.
    const keys = res.ok ? Object.keys(res.submission) : [];
    ok(`${engineId} submission carries no score/correctness`,
      !keys.some((k) => /score|points|correct|verdict|accuracy/i.test(k)));
    // Shape matches the engine family.
    if (res.ok) {
      if (['OBS_001', 'OBS_003', 'PAT_001', 'PAT_002', 'PAT_003', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002'].includes(engineId))
        ok(`${engineId} → selectedId`, 'selectedId' in res.submission);
      if (['OBS_004', 'LOG_003', 'LNG_003', 'ATT_002'].includes(engineId))
        ok(`${engineId} → selectedIds`, 'selectedIds' in res.submission);
      if (engineId === 'ATT_001') ok('ATT_001 → tappedIds', 'tappedIds' in res.submission);
      if (engineId === 'ATT_003') ok('ATT_003 → classifications', 'classifications' in res.submission);
    }
  }

  // Ordering is preserved for ordering engines.
  const ordering = byEngine.get('LOG_003');
  const [orderPlay] = playsFor(ordering, 1000);
  const mapped = amap.toSubmission('LOG_003', orderPlay.answer);
  ok('ordering preserves order', mapped.ok && JSON.stringify(mapped.submission.selectedIds) === JSON.stringify(orderPlay.answer.selectedIds));

  // Pair semantics: exactly two.
  throws('pair with one id is rejected', () => {
    const r = amap.toSubmission('OBS_004', { kind: 'sequence', selectedIds: ['a'], elapsedMs: 1 });
    if (!r.ok) throw new Error(r.error);
  });

  // Malformed answer types rejected.
  ok('choice engine rejects a sequence answer', amap.toSubmission('OBS_001', { kind: 'sequence', selectedIds: ['x'], elapsedMs: 1 }).ok === false);
  ok('null selection rejected', amap.toSubmission('OBS_001', { kind: 'choice', selectedId: null, elapsedMs: 1 }).ok === false);
  ok('oversized list rejected', amap.toSubmission('LOG_003', { kind: 'sequence', selectedIds: Array.from({ length: 100 }, (_, i) => `t${i}`), elapsedMs: 1 }).ok === false);
  ok('empty sweep is a valid play', amap.toSubmission('ATT_001', { kind: 'sweep', hits: 0, falsePositives: 0, totalTargets: 3, tappedIds: [], elapsedMs: 1 }).ok === true);
}

// =============================================================================
// Payload validation
// =============================================================================
{
  const goodPuzzle = (pos, engineId, category) => ({
    position: pos, category, engineId, puzzleId: `pz-${pos}`, difficulty: 2,
    prompt: 'Solve this', maxScore: 20, timing: { parMs: 6000, limitMs: 20000 }, tiles: [],
  });
  const CATS = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];
  const ENGS = ['OBS_001', 'PAT_001', 'LOG_001', 'LNG_001', 'ATT_001'];
  const goodPack = () => ({
    packDate: '2026-07-11', difficultyLabel: 'standard',
    puzzles: CATS.map((c, i) => goodPuzzle(i + 1, ENGS[i], c)),
  });

  ok('valid public pack accepted', validate.validateDailyPack(goodPack()).puzzles.length === 5);
  throws('missing slot rejected', () => { const p = goodPack(); p.puzzles.pop(); validate.validateDailyPack(p); });
  throws('wrong category order rejected', () => { const p = goodPack(); p.puzzles[0].category = 'pattern'; validate.validateDailyPack(p); });
  throws('unknown engine rejected', () => { const p = goodPack(); p.puzzles[0].engineId = 'ZZZ_999'; validate.validateDailyPack(p); });
  throws('bad position rejected', () => { const p = goodPack(); p.puzzles[2].position = 9; validate.validateDailyPack(p); });
  throws('missing timing rejected', () => { const p = goodPack(); delete p.puzzles[0].timing; validate.validateDailyPack(p); });

  // Forbidden fields — recursive.
  for (const key of ['correctAnswer', 'correct_answer', 'answerKey', 'answer_key', 'correctId', 'private_answer', 'seed', 'validator_result', 'oddTileId', 'correctOptionId', 'targetIds', 'isTarget', 'explanation']) {
    throws(`forbidden top-level field rejected: ${key}`, () => { const p = goodPack(); p.puzzles[0][key] = 'x'; validate.validateDailyPack(p); });
  }
  throws('forbidden field nested deep is rejected recursively', () => {
    const p = goodPack();
    p.puzzles[0].tiles = [{ id: 't1', nested: { deep: { isTarget: true } } }];
    validate.validateDailyPack(p);
  });
  ok('findForbiddenKeys finds nested keys', validate.findForbiddenKeys({ a: { b: [{ correctAnswer: 1 }] } }, validate.PRE_SUBMIT_FORBIDDEN).length === 1);

  // Submit response: explanation allowed, answer keys not.
  ok('valid submit result accepted', validate.validateSubmitAnswer({ correct: true, verdict: 'correct', points: 20, accuracyPoints: 14, speedPoints: 6, explanation: 'Because.', elapsedMs: 1200 }).points === 20);
  throws('submit result with answer key rejected', () => validate.validateSubmitAnswer({ correct: true, verdict: 'correct', points: 20, accuracyPoints: 14, speedPoints: 6, explanation: 'x', elapsedMs: 1, correctOptionId: 'b' }));
  throws('bad verdict rejected', () => validate.validateSubmitAnswer({ correct: true, verdict: 'great', points: 1, accuracyPoints: 1, speedPoints: 0, explanation: 'x', elapsedMs: 1 }));

  // Complete response: is_ranked is server-authoritative; a ranked result must carry its date.
  ok('valid unranked complete accepted',
    validate.validateCompleteAttempt({ finalScore: 80, isRanked: false, results: [{ position: 1, verdict: 'correct', points: 20 }] }).finalScore === 80);
  ok('valid ranked complete accepted (with date)',
    validate.validateCompleteAttempt({ finalScore: 80, isRanked: true, rankedDate: '2026-07-11', results: [] }).rankedDate === '2026-07-11');
  ok('unranked complete carries a null rankedDate',
    validate.validateCompleteAttempt({ finalScore: 80, isRanked: false, results: [] }).rankedDate === null);
  throws('ranked complete without a date rejected', () => validate.validateCompleteAttempt({ finalScore: 80, isRanked: true, results: [] }));
  throws('complete with a non-boolean isRanked rejected', () => validate.validateCompleteAttempt({ finalScore: 80, isRanked: 'yes', results: [] }));
  throws('out-of-range score rejected', () => validate.validateCompleteAttempt({ finalScore: 200, isRanked: false, results: [] }));

  // Ranked start — a discriminated union the server derives.
  const activeStart = validate.validateRankedStart({ status: 'active', attemptId: 'a1', attemptToken: 't', expiresAt: Date.now() + 1000, packDate: '2026-07-11', completedPositions: [1, 2], resumePosition: 3 });
  ok('active ranked start parses resume info', activeStart.status === 'active' && activeStart.resumePosition === 3 && activeStart.completedPositions.length === 2);
  ok('completed ranked start parses the locked score', validate.validateRankedStart({ status: 'completed', rankedDate: '2026-07-11', lockedScore: 88 }).lockedScore === 88);
  ok('ineligible ranked start parses reason', validate.validateRankedStart({ status: 'ineligible', reason: 'anonymous_account', message: 'x' }).reason === 'anonymous_account');
  throws('ranked start with an answer field is rejected', () => validate.validateRankedStart({ status: 'active', attemptId: 'a', attemptToken: 't', expiresAt: 1, packDate: 'd', completedPositions: [], resumePosition: 1, correctOptionId: 'b' }));
  throws('ranked start with a bad resume position rejected', () => validate.validateRankedStart({ status: 'active', attemptId: 'a', attemptToken: 't', expiresAt: 1, packDate: 'd', completedPositions: [], resumePosition: 9 }));
  throws('ranked start with an unknown status rejected', () => validate.validateRankedStart({ status: 'sideways' }));

  // Reserve-Practice start — five sanitized reserve puzzles, never ranked.
  const PCATS = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];
  const PENGS = ['OBS_001', 'PAT_001', 'LOG_001', 'LNG_001', 'ATT_001'];
  const pPuzzle = (pos, engineId, category) => ({
    position: pos, category, engineId, puzzleId: `pz-${pos}`, difficulty: 2,
    prompt: 'Solve this', maxScore: 20, timing: { parMs: 6000, limitMs: 20000 }, tiles: [],
  });
  const goodPractice = () => ({
    status: 'active', attemptToken: 'tok', resumed: false, resumePosition: 1, completedPositions: [],
    ranked: false,
    puzzles: PCATS.map((c, i) => pPuzzle(i + 1, PENGS[i], c)),
  });
  ok('practice start: valid payload accepted (5 puzzles, fixed order)', validate.validatePracticeStart(goodPractice()).puzzles.length === 5);
  ok('practice start: resume info parsed', validate.validatePracticeStart({ ...goodPractice(), resumed: true, resumePosition: 3, completedPositions: [1, 2] }).resumePosition === 3);
  throws('practice start: a ranked flag is rejected', () => validate.validatePracticeStart({ ...goodPractice(), ranked: true }));
  throws('practice start: fewer than five puzzles rejected', () => { const p = goodPractice(); p.puzzles.pop(); return validate.validatePracticeStart(p); });
  throws('practice start: a duplicate puzzle id rejected', () => { const p = goodPractice(); p.puzzles[1].puzzleId = p.puzzles[0].puzzleId; return validate.validatePracticeStart(p); });
  throws('practice start: an answer field in a puzzle rejected', () => { const p = goodPractice(); p.puzzles[0].oddTileId = 'x'; return validate.validatePracticeStart(p); });
  throws('practice start: wrong category order rejected', () => { const p = goodPractice(); p.puzzles[0].category = 'pattern'; return validate.validatePracticeStart(p); });

  // Today player status — non-sensitive, rank-free.
  const ps = validate.validateTodayPlayerStatus({ eligible: true, reason: 'eligible', today: '2026-07-11', ranked_status: 'none', locked_score: null, practice_available: true, message: 'go' });
  ok('player status maps ranked_status → rankedState', ps.rankedState === 'none' && ps.eligible === true && ps.practiceAvailable === true);
  ok('player status carries a locked score when completed',
    validate.validateTodayPlayerStatus({ eligible: false, reason: 'ranked_attempt_completed', today: '2026-07-11', ranked_status: 'completed', locked_score: 73, practice_available: true, message: 'done' }).lockedScore === 73);
  throws('player status with an unknown ranked_status rejected', () => validate.validateTodayPlayerStatus({ eligible: true, reason: 'x', today: 'd', ranked_status: 'weird', practice_available: true }));
}

// =============================================================================
// Session state machine
// =============================================================================
{
  const t = machine.transition;
  const run = (events) => events.reduce((s, e) => t(s, e), machine.initialSession);
  const result = (position) => ({ position, engineId: 'OBS_001', category: 'observation', verdict: 'correct', correct: true, points: 20, accuracyPoints: 14, speedPoints: 6, explanation: 'x', elapsedMs: 1 });

  // Happy path to home.
  const home = run([{ type: 'LOAD_PACK' }, { type: 'PACK_LOADED' }]);
  ok('reaches home_ready', home.phase === 'home_ready');

  // Duplicate Start rejected.
  const starting = t(home, { type: 'START' });
  ok('START moves to starting_attempt', starting.phase === 'starting_attempt');
  throws('duplicate START rejected', () => t(starting, { type: 'START' }));

  // Full five-slot run.
  let s = t(starting, { type: 'ATTEMPT_STARTED' });
  ok('first slot opens at position 1', s.phase === 'opening_puzzle' && s.position === 1);
  for (let pos = 1; pos <= 5; pos++) {
    s = t(s, { type: 'PUZZLE_OPENED' });
    ok(`slot ${pos} playing`, s.phase === 'playing');
    const submitting = t(s, { type: 'SUBMIT' });
    throws(`duplicate SUBMIT at slot ${pos} rejected`, () => t(submitting, { type: 'SUBMIT' }));
    s = t(submitting, { type: 'SUBMITTED', result: result(pos) });
    ok(`slot ${pos} revealing`, s.phase === 'revealing' && s.results.length === pos);
    throws(`cannot SUBMIT while revealing at slot ${pos}`, () => t(s, { type: 'SUBMIT' }));
    s = t(s, { type: 'CONTINUE' });
  }
  ok('after five continues → completing', s.phase === 'completing');
  ok('cannot skip: SUBMIT not allowed in opening', (() => { try { t({ ...machine.initialSession, phase: 'opening_puzzle', position: 1 }, { type: 'SUBMIT' }); return false; } catch { return true; } })());
  s = t(s, { type: 'COMPLETED', finalScore: 100 });
  ok('completed after five results with a final score', s.phase === 'completed' && s.finalScore === 100);

  // Completion only after five results.
  throws('cannot COMPLETE before five results', () => t({ ...machine.initialSession, phase: 'completing', results: [result(1)] }, { type: 'COMPLETED', finalScore: 10 }));

  // Error + retry.
  const errored = t({ ...machine.initialSession, phase: 'submitting', position: 1 }, { type: 'SUBMIT_FAILED', code: 'network', retryable: true });
  ok('submit failure → error(retryable back to playing)', errored.phase === 'error' && errored.error.retryTo === 'playing');
  ok('RETRY returns to the failed phase', t(errored, { type: 'RETRY' }).phase === 'playing');
  const terminal = t({ ...machine.initialSession, phase: 'submitting', position: 1 }, { type: 'SUBMIT_FAILED', code: 'already_submitted', retryable: false });
  throws('non-retryable error cannot RETRY', () => t(terminal, { type: 'RETRY' }));

  // Replay: RESET creates a fresh attempt from any phase.
  ok('RESET clears to idle from completed', t(s, { type: 'RESET' }).phase === 'idle' && t(s, { type: 'RESET' }).results.length === 0);

  // Secure ranked RESUME: seed server-scored slots, open the next, still complete at five.
  const homeR = run([{ type: 'LOAD_PACK' }, { type: 'PACK_LOADED' }]);
  const startR = t(homeR, { type: 'START' });
  const resumed = t(startR, { type: 'RESUME', position: 3, completed: [result(1), result(2)] });
  ok('RESUME opens the next unfinished slot with prior slots seeded', resumed.phase === 'opening_puzzle' && resumed.position === 3 && resumed.results.length === 2);
  // Play slots 3,4,5 → completion allowed at five results.
  let rs = resumed;
  for (let pos = 3; pos <= 5; pos++) {
    rs = t(rs, { type: 'PUZZLE_OPENED' });
    rs = t(t(rs, { type: 'SUBMIT' }), { type: 'SUBMITTED', result: result(pos) });
    rs = t(rs, { type: 'CONTINUE' });
  }
  ok('a resumed ranked attempt reaches completing with five results', rs.phase === 'completing' && rs.results.length === 5);
  rs = t(rs, { type: 'COMPLETED', finalScore: 91 });
  ok('a resumed ranked attempt completes', rs.phase === 'completed' && rs.finalScore === 91);
  throws('RESUME with nothing left to play is rejected', () => t(startR, { type: 'RESUME', position: 5, completed: [result(1), result(2), result(3), result(4), result(5)] }));
  throws('RESUME with a bad position is rejected', () => t(startR, { type: 'RESUME', position: 0, completed: [] }));
  throws('RESUME outside starting_attempt is rejected', () => t(homeR, { type: 'RESUME', position: 2, completed: [result(1)] }));

  // ── REGRESSION (7K): the burned-ranked-attempt bug ────────────────────────
  // All five slots were scored server-side but complete-attempt never ran (app
  // killed between the last submit and completion). RESUME rejects that state, and
  // there was NO other route to `completing` — so a RANKED attempt in this
  // condition could never be finished. The day's one attempt was spent and no
  // score was ever locked in. RESUME_COMPLETE is the missing edge.
  const allFive = [result(1), result(2), result(3), result(4), result(5)];
  const rc = t(startR, { type: 'RESUME_COMPLETE', completed: allFive });
  ok('RESUME_COMPLETE (5/5 answered, never completed) → completing', rc.phase === 'completing' && rc.results.length === 5);
  const rcDone = t(rc, { type: 'COMPLETED', finalScore: 77 });
  ok('…and the attempt can now actually be COMPLETED (attempt not burned)', rcDone.phase === 'completed' && rcDone.finalScore === 77);
  throws('RESUME_COMPLETE with fewer than five results is rejected', () => t(startR, { type: 'RESUME_COMPLETE', completed: [result(1), result(2)] }));
  throws('RESUME_COMPLETE outside starting_attempt is rejected', () => t(homeR, { type: 'RESUME_COMPLETE', completed: allFive }));
  // The five-result invariant still gates completion.
  throws('COMPLETED still requires five results', () => t({ ...rc, results: [result(1)] }, { type: 'COMPLETED', finalScore: 10 }));
}

// =============================================================================
// Error handling
// =============================================================================
{
  ok('no_live_pack → return-home copy', errors.errorCopy('no_live_pack').returnHome === true);
  ok('network_error is retryable', errors.errorCopy('network_error').retryable === true);
  ok('expired token is terminal (not retryable)', errors.errorCopy('invalid_token:expired').retryable === false && errors.errorCopy('invalid_token:expired').returnHome === true);
  ok('invalid_token prefix matches detailed code', errors.errorCopy('invalid_token:wrong_slot').title === errors.errorCopy('invalid_token').title);
  ok('already_submitted is terminal but stays in-session', errors.errorCopy('already_submitted').retryable === false && errors.errorCopy('already_submitted').returnHome === false);
  ok('ranked_ineligible is terminal and returns home', errors.errorCopy('ranked_ineligible').retryable === false && errors.errorCopy('ranked_ineligible').returnHome === true);
  ok('invalid_submission detail maps to retryable copy', errors.errorCopy('invalid_submission:expected_selectedId').retryable === true);
  ok('unknown code falls back to generic (retryable)', errors.errorCopy('totally_unknown_code').retryable === true);
  const err = new errors.CloudFlowError('no_live_pack');
  ok('CloudFlowError carries its copy', err.code === 'no_live_pack' && err.copy.title.length > 0);
  // No raw/technical wording leaks into player copy.
  for (const code of ['no_live_pack', 'network_error', 'invalid_token:expired', 'answer_leak', 'timeout']) {
    const c = errors.errorCopy(code);
    ok(`copy for ${code} is player-safe (no Supabase/stack wording)`, !/supabase|undefined|stack|null|http|json/i.test(`${c.title} ${c.body}`));
  }
}

// =============================================================================
// Diagnostics redaction
// =============================================================================
{
  ok('redactId truncates and never shows the full value', diag.redactId('sb_abcdefghijklmnop') === 'sb_a…(19)');
  ok('redactId handles empty', diag.redactId('') === '∅' && diag.redactId(null) === '∅');
  const line = diag.formatCall({ fn: 'submit-answer', status: 200, ms: 42, position: 3, engineId: 'OBS_001', errorCode: 'correct' });
  ok('formatCall includes fn/status/slot/engine', /submit-answer/.test(line) && /slot=3/.test(line) && /engine=OBS_001/.test(line));
  ok('formatCall never contains a token-like value', !/[a-f0-9]{32}|guest_|Bearer|sb_/.test(line));
}

// =============================================================================
// Security: no answer key reachable in session state before submit
// =============================================================================
{
  // A revealing SlotResult only enters state via SUBMITTED (after the server scores).
  const t = machine.transition;
  const opened = { ...machine.initialSession, phase: 'playing', position: 1 };
  const stateJson = JSON.stringify(opened);
  ok('pre-submit session state holds no answer field', !/oddTileId|correctOptionId|answer_key|correctAnswer|isTarget|targetIds/.test(stateJson));
}

// =============================================================================
// Email validation / normalization / masking (Phase 5C)
// =============================================================================
{
  const { validateEmail, normalizeEmail, maskEmail } = emailMod;
  ok('valid email accepted', validateEmail('Alice@Gmail.com').ok === true);
  ok('domain is lowercased, local-part preserved', normalizeEmail('  Alice@GMAIL.com ') === 'Alice@gmail.com');
  ok('empty email rejected', validateEmail('').ok === false);
  ok('missing @ rejected', validateEmail('alicegmail.com').ok === false);
  ok('missing TLD rejected', validateEmail('alice@localhost').ok === false);
  ok('whitespace-embedded rejected', validateEmail('al ice@gmail.com').ok === false);
  ok('control char rejected', validateEmail('alice @gmail.com').ok === false);
  ok('zero-width char rejected', validateEmail('alice​@gmail.com').ok === false);
  ok('over-length rejected', validateEmail('a'.repeat(250) + '@gmail.com').ok === false);
  ok('mask hides the address', maskEmail('alice@gmail.com') === 'a•••@g•••.com');
  ok('mask never contains the full local/domain', !maskEmail('alice@gmail.com').includes('alice') && !maskEmail('alice@gmail.com').includes('gmail'));
}

// =============================================================================
// Linked identity methods (Phase 5D)
// =============================================================================
{
  const { linkedMethods, hasPermanentIdentity, isLastMethod } = idMod;
  const emailOnly = linkedMethods([{ provider: 'email' }], false);
  const googleOnly = linkedMethods([{ provider: 'google' }], false);
  const both = linkedMethods([{ provider: 'email' }, { provider: 'google' }], false);
  const anon = linkedMethods([], true);

  ok('email-only methods', emailOnly.email && !emailOnly.google && !emailOnly.anonymous && emailOnly.count === 1);
  ok('google-only methods', googleOnly.google && !googleOnly.email && googleOnly.count === 1);
  ok('email + google methods', both.email && both.google && both.count === 2 && !both.anonymous);
  ok('anonymous has no permanent method', anon.anonymous && anon.count === 0 && !anon.email && !anon.google);
  ok('anonymous provider entry ignored', linkedMethods([{ provider: 'anonymous' }], true).count === 0);
  ok('hasPermanentIdentity reflects linked methods', hasPermanentIdentity(both) && !hasPermanentIdentity(anon));
  ok('cannot remove the last method', isLastMethod(emailOnly, 'email') === true && isLastMethod(googleOnly, 'google') === true);
  ok('can remove Google when email also linked', isLastMethod(both, 'google') === false && isLastMethod(both, 'email') === false);
  // No provider subject id / metadata leaks into the derived view.
  ok('derived methods expose only booleans/count (no metadata)',
    Object.keys(both).every((k) => ['email', 'google', 'anonymous', 'count'].includes(k)));
}

// =============================================================================
// Daily leaderboards (Phase 6C) — sanitized contracts + display helpers
// =============================================================================
{
  const { validateMyDailyRank, validateLeaderboardPage, formatSolveTime, topPercent } = validate;

  // --- Personal rank summary ---
  const rank = validateMyDailyRank({
    locked: false, has_result: true, ranked_date: '2026-07-11', score: 92, score_locked: true,
    total_solve_ms: 222000, result_version: 0, updated_after_validation: false, country_code: 'AE',
    global_position: 382, global_total: 2418, global_percentile: 16,
    country_position: 24, country_total: 120, country_percentile: 20,
  });
  ok('my-rank: valid summary maps fields', rank.hasResult && rank.globalPosition === 382 && rank.countryCode === 'AE' && rank.globalPercentile === 16);
  ok('my-rank: locked summary short-circuits', validateMyDailyRank({ locked: true, ranked_date: '2026-07-11' }).locked === true);
  ok('my-rank: no-result summary is allowed', validateMyDailyRank({ locked: false, has_result: false, ranked_date: '2026-07-11', country_code: 'AE' }).hasResult === false);
  throws('my-rank: a user_id anywhere is rejected recursively', () => validateMyDailyRank({ locked: false, has_result: true, ranked_date: 'd', score: 1, global_position: 1, global_total: 1, user_id: 'x' }));
  throws('my-rank: integrity_status is rejected', () => validateMyDailyRank({ locked: false, has_result: true, ranked_date: 'd', score: 1, global_position: 1, global_total: 1, integrity_status: 'clean' }));
  throws('my-rank: a present result without a position is rejected', () => validateMyDailyRank({ locked: false, has_result: true, ranked_date: 'd', score: 1 }));

  // --- Leaderboard page ---
  const page = validateLeaderboardPage({
    locked: false, scope: 'global', ranked_date: '2026-07-11', total: 3, page_size: 50, after_position: 0,
    next_after: null, has_more: false, country_code: null,
    rows: [
      { position: 1, username: 'Ada', country_code: 'AE', score: 100, solve_ms: 100000, is_current_user: false },
      { position: 2, username: 'Ben', country_code: 'AE', score: 100, solve_ms: 120000, is_current_user: true },
      { position: 3, username: 'Cid', country_code: 'US', score: 90, solve_ms: 90000, is_current_user: false },
    ],
  });
  ok('leaderboard: valid page accepted', page.rows.length === 3 && page.total === 3 && page.scope === 'global');
  ok('leaderboard: current-user flag preserved on exactly one row', page.rows.filter((r) => r.isCurrentUser).length === 1);
  ok('leaderboard: locked page yields no rows', validateLeaderboardPage({ locked: true, scope: 'global', rows: [] }).rows.length === 0);
  throws('leaderboard: a row carrying user_id is rejected recursively', () => validateLeaderboardPage({
    locked: false, scope: 'global', rows: [{ position: 1, username: 'X', country_code: 'AE', score: 1, solve_ms: 1, is_current_user: false, user_id: 'leak' }],
  }));
  throws('leaderboard: a row carrying attempt_id is rejected', () => validateLeaderboardPage({
    locked: false, scope: 'global', rows: [{ position: 1, username: 'X', country_code: 'AE', score: 1, solve_ms: 1, is_current_user: false, attempt_id: 'leak' }],
  }));
  throws('leaderboard: a malformed row (no position) is rejected', () => validateLeaderboardPage({
    locked: false, scope: 'global', rows: [{ username: 'X', country_code: 'AE', score: 1, solve_ms: 1 }],
  }));
  ok('leaderboard: unknown scope normalizes to global', validateLeaderboardPage({ locked: false, scope: 'weird', rows: [] }).scope === 'global');

  // --- Display helpers (consistent between Results and Leaderboard) ---
  ok('solve time formats as m/s', formatSolveTime(222000) === '3m 42s' && formatSolveTime(45000) === '45s' && formatSolveTime(0) === '0s');
  ok('topPercent prefers the server value', topPercent(382, 2418, 16) === 16);
  ok('topPercent falls back to ceil(100*pos/total)', topPercent(1, 200, null) === 1 && topPercent(50, 200, null) === 25);
  ok('topPercent is null for a single ranked player', topPercent(1, 1, null) === null);
}

// =============================================================================
// Player progress (Phase 6D) — sanitized contracts + milestone helper
// =============================================================================
{
  const { validateProgressSummary, validateProgressDetail, validateHistoryPage, streakMilestone } = validate;

  // --- Streak / stats summary ---
  const sum = validateProgressSummary({
    locked: false, statistics_version: 1, today: '2026-07-11', today_completed: true,
    current_streak: 7, best_streak: 12, last_ranked_date: '2026-07-11', first_ranked_date: '2026-06-01',
    ranked_days_completed: 40, latest_score: 92, best_score: 100, average_score: 88.5,
    average_solve_ms: 210000, perfect_scores: 3, lifetime_score_sum: 3540, total_solve_ms: 8400000,
  });
  ok('progress summary maps streak + stats', sum.currentStreak === 7 && sum.bestStreak === 12 && sum.averageScore === 88.5 && sum.perfectScores === 3);
  ok('progress summary: locked short-circuits', validateProgressSummary({ locked: true }).locked === true);
  throws('progress summary: a user_id is rejected recursively', () => validateProgressSummary({ locked: false, current_streak: 1, user_id: 'x' }));
  throws('progress summary: an integrity_reason is rejected', () => validateProgressSummary({ locked: false, current_streak: 1, integrity_reason: 'flagged' }));
  throws('progress summary: a token is rejected', () => validateProgressSummary({ locked: false, current_streak: 1, token: 'abc' }));

  // --- Category + calendar detail ---
  const detail = validateProgressDetail({
    locked: false, statistics_version: 1,
    categories: [
      { category: 'observation', average_points: 15, best_points: 20, plays: 4, perfect: 1 },
      { category: 'attention-speed', average_points: 12.5, best_points: 18, plays: 4, perfect: 0 },
    ],
    calendar: { today: '2026-07-11', from_date: '2026-06-07', first_ranked_date: '2026-06-10', completed: [{ date: '2026-07-11', updated_after_validation: false }, { date: '2026-07-10', updated_after_validation: true }] },
  });
  ok('progress detail maps categories + calendar', detail.categories.length === 2 && detail.calendar.completed.length === 2 && detail.calendar.completed[1].updatedAfterValidation === true);
  throws('progress detail: an unknown category is rejected', () => validateProgressDetail({ locked: false, categories: [{ category: 'telepathy', average_points: 1, best_points: 1, plays: 1, perfect: 0 }], calendar: {} }));
  throws('progress detail: a submitted_answer anywhere is rejected', () => validateProgressDetail({ locked: false, categories: [], calendar: { completed: [{ date: 'd', submitted_answer: 'x' }] } }));

  // --- Ranked history ---
  const hist = validateHistoryPage({
    locked: false, page_size: 30, next_before: '2026-07-08', has_more: true,
    rows: [
      { ranked_date: '2026-07-11', score: 92, total_solve_ms: 210000, country_code: 'AE', completed_at: '2026-07-11T09:00:00Z', updated_after_validation: false, result_version: 0, status: 'counted' },
      { ranked_date: '2026-07-10', score: 88, total_solve_ms: 250000, country_code: 'AE', completed_at: '2026-07-10T09:00:00Z', updated_after_validation: true, result_version: 1, status: 'counted' },
    ],
  });
  ok('ranked history maps rows newest-first with cursor', hist.rows.length === 2 && hist.rows[0].rankedDate === '2026-07-11' && hist.nextBefore === '2026-07-08' && hist.hasMore === true);
  ok('ranked history: locked yields no rows', validateHistoryPage({ locked: true, rows: [] }).rows.length === 0);
  throws('ranked history: a row with attempt_id is rejected recursively', () => validateHistoryPage({ locked: false, rows: [{ ranked_date: 'd', score: 1, attempt_id: 'leak' }] }));
  throws('ranked history: a malformed row (no date) is rejected', () => validateHistoryPage({ locked: false, rows: [{ score: 1 }] }));

  // --- Milestone (derived from the streak value, not awarded) ---
  ok('milestone is exactly at a threshold', streakMilestone(3) === 3 && streakMilestone(7) === 7 && streakMilestone(100) === 100);
  ok('milestone is null off a threshold', streakMilestone(5) === null && streakMilestone(0) === null && streakMilestone(8) === null);
}

// =============================================================================
// Share cards + practice (Phase 7A) — snapshot contract, privacy, policy
// =============================================================================
{
  const { buildShareSnapshot, validateShareSnapshot, shareText } = shareSnap;
  const CATS = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];
  // A BrewScore fixture (no answers — CategoryResult carries points/verdict only).
  const mkScore = () => ({
    total: 88,
    totalElapsedMs: 222000,
    results: CATS.map((category, i) => ({
      puzzleId: `pz-${i}`, engineId: 'OBS_001', category, engine: 'x',
      correct: i < 3, points: i < 3 ? 20 : i === 3 ? 8 : 0,
      accuracyPoints: i < 3 ? 14 : 0, speedPoints: i < 3 ? 6 : 0, elapsedMs: 1000,
    })),
  });

  // Ranked snapshot.
  const ranked = buildShareSnapshot({ nowIso: '2026-07-11T09:00:00Z', sessionType: 'ranked', date: '2026-07-11', score: mkScore(), caption: 'A strong brew.', streak: 7, updatedAfterValidation: false });
  ok('ranked snapshot: frozen generatedAt + ranked type + streak', ranked.generatedAt === '2026-07-11T09:00:00Z' && ranked.sessionType === 'ranked' && ranked.streak === 7);
  ok('snapshot categories are in the fixed order', ranked.categories.map((c) => c.category).join() === CATS.join());
  ok('category states are spoiler-free (correct/partial/missed + points)', ranked.categories[0].state === 'correct' && ranked.categories[3].state === 'partial' && ranked.categories[4].state === 'missed' && ranked.categories[4].points === 0);
  ok('snapshot has NO answer/id/token fields anywhere',
    !JSON.stringify(ranked).match(/oddTileId|correctOptionId|selectedId|user_id|attempt_id|token|answer|prompt|email/i));
  ok('ranked recalculated state is represented', buildShareSnapshot({ nowIso: 't', sessionType: 'ranked', date: 'd', score: mkScore(), caption: 'c', streak: 3, updatedAfterValidation: true }).updatedAfterValidation === true);

  // Practice snapshot: no streak, unranked.
  const practice = buildShareSnapshot({ nowIso: 't', sessionType: 'practice', date: '2026-07-11', score: mkScore(), caption: 'Nice.', streak: 9, updatedAfterValidation: true });
  ok('practice snapshot: streak omitted + never updated-after-validation', practice.streak === null && practice.updatedAfterValidation === false && practice.sessionType === 'practice');

  // Username/country omitted by default.
  ok('username is omitted by default', ranked.username === null && !('country' in ranked) && !('countryCode' in ranked));

  // Recursive forbidden-field rejection.
  throws('a snapshot carrying a correct_answer is rejected', () => validateShareSnapshot({ ...ranked, correct_answer: 'b' }));
  throws('a snapshot carrying a user_id is rejected', () => validateShareSnapshot({ ...ranked, user_id: 'u' }));
  throws('a snapshot carrying an attempt_id is rejected', () => validateShareSnapshot({ ...ranked, attempt_id: 'a' }));
  throws('a snapshot with a nested selectedId is rejected recursively', () => validateShareSnapshot({ ...ranked, categories: ranked.categories.map((c, i) => (i === 0 ? { ...c, selectedId: 'x' } : c)) }));
  throws('a snapshot with a prompt is rejected', () => validateShareSnapshot({ ...ranked, prompt: 'Which tile…' }));
  throws('a snapshot with the wrong category order is rejected', () => validateShareSnapshot({ ...ranked, categories: [...ranked.categories].reverse() }));
  throws('a snapshot with an out-of-range score is rejected', () => validateShareSnapshot({ ...ranked, brewScore: 200 }));

  // Share text is answer-free and states rank/practice.
  ok('ranked share text has score + no answers', /88\/100/.test(shareText(ranked)) && !/oddTileId|answer|correct_/i.test(shareText(ranked)));
  ok('practice share text says Practice Brew', /Practice Brew/.test(shareText(practice)));

  // Practice access policy — beta unlimited, premium deferred.
  const pol = practicePolicy.currentPracticeAccess();
  ok('policy: unlimited beta practice, no archives/training yet', pol.canPlayTodayPractice === true && pol.canPlayUnlimitedPractice === true && pol.canAccessArchives === false && pol.canPlayCategoryTraining === false && pol.remainingFreePracticeCount === null && pol.betaUnlimited === true);

  // Practice Summary + history (Phase 7C) — private, separate from ranked.
  const psum = validate.validatePracticeSummary({
    locked: false, statistics_version: 1, practice_brews_completed: 3, total_practice_puzzles: 15,
    average_score: 71.7, best_score: 100, latest_score: 65, average_solve_ms: 15000,
    most_practiced_category: 'observation',
    categories: [{ category: 'observation', average_points: 15, best_points: 20, plays: 3 }],
  });
  ok('practice summary maps fields (no ranked fields)', psum.brewsCompleted === 3 && psum.averageScore === 71.7 && psum.categories[0].plays === 3 && !('currentStreak' in psum));
  ok('practice summary: locked short-circuits', validate.validatePracticeSummary({ locked: true }).locked === true);
  throws('practice summary: a user_id anywhere is rejected recursively', () => validate.validatePracticeSummary({ locked: false, practice_brews_completed: 1, user_id: 'x' }));
  throws('practice summary: a seed field is rejected', () => validate.validatePracticeSummary({ locked: false, practice_brews_completed: 1, seed: 'abc' }));
  throws('practice summary: an unknown category is rejected', () => validate.validatePracticeSummary({ locked: false, categories: [{ category: 'telepathy', average_points: 1, best_points: 1, plays: 1 }] }));

  const phist = validate.validatePracticeHistoryPage({
    locked: false, page_size: 20, next_before: '2026-07-10T09:00:00Z', has_more: true,
    rows: [{ completed_at: '2026-07-11T09:00:00Z', score: 65, total_solve_ms: 15000, selection_version: 1, categories: [{ category: 'observation', points: 15 }] }],
  });
  ok('practice history maps rows + cursor', phist.rows.length === 1 && phist.rows[0].score === 65 && phist.nextBefore === '2026-07-10T09:00:00Z');
  throws('practice history: a prompt anywhere is rejected', () => validate.validatePracticeHistoryPage({ locked: false, rows: [{ completed_at: 'd', score: 1, prompt: 'Which tile…' }] }));
  throws('practice history: an attempt_id is rejected', () => validate.validatePracticeHistoryPage({ locked: false, rows: [{ completed_at: 'd', score: 1, attempt_id: 'leak' }] }));
}

// =============================================================================
// Entitlements (Phase 7D) — the authoritative capability contract + validator.
// =============================================================================
{
  const { validateEntitlements } = validate;
  const { hasCapability, LOCAL_DEV_ENTITLEMENTS, PREMIUM_PREVIEW, PREMIUM_CAPABILITIES, RANKED_FAIRNESS_PROMISE } = entitlements;

  // A faithful copy of the server's beta payload shape.
  const betaPayload = {
    entitlement_state: 'beta', entitlement_version: 1,
    capabilities: {
      daily_ranked_brew: true, global_leaderboard: true, country_leaderboard: true, ranked_streaks: true,
      basic_progress: true, share_cards: true, practice_access: true, unlimited_practice: true,
      archives: false, category_training: false, difficulty_selection: false, advanced_practice_stats: false,
      advanced_ranked_stats: false, bonus_packs: false, premium_themes: false, private_tournaments: false,
    },
    limits: { ranked_attempts_per_utc_day: 1, free_practice_brews_per_period: null },
    period: null, source: 'beta_policy',
  };

  const beta = validateEntitlements(betaPayload);
  ok('entitlements: beta state, version, source parse', beta.entitlementState === 'beta' && beta.entitlementVersion === 1 && beta.source === 'beta_policy');
  ok('entitlements: free capabilities on, all Premium off', beta.capabilities.unlimited_practice === true && PREMIUM_CAPABILITIES.every((k) => beta.capabilities[k] === false));
  ok('entitlements: unlimited practice → no free-count cap', beta.freePracticeBrewsPerPeriod === null);

  // RANKED FAIRNESS INVARIANT — the client forces 1 no matter what the wire says.
  ok('entitlements: ranked limit is the constant 1', beta.rankedAttemptsPerUtcDay === 1);
  const tampered = validateEntitlements({ ...betaPayload, limits: { ranked_attempts_per_utc_day: 5, free_practice_brews_per_period: null } });
  ok('entitlements: a server claiming 5 ranked attempts is CLAMPED to 1', tampered.rankedAttemptsPerUtcDay === 1);
  const premiumTamper = validateEntitlements({
    ...betaPayload, entitlement_state: 'premium',
    capabilities: { ...betaPayload.capabilities, archives: true, premium_themes: true },
    limits: { ranked_attempts_per_utc_day: 99, free_practice_brews_per_period: null },
  });
  ok('entitlements: even a premium payload gets exactly 1 ranked attempt', premiumTamper.rankedAttemptsPerUtcDay === 1);

  // Capability normalisation — unknown ignored, missing = false (fail-closed).
  const partial = validateEntitlements({ entitlement_state: 'beta', capabilities: { unlimited_practice: true, telepathy: true }, limits: {} });
  ok('entitlements: unknown capability key is ignored', !('telepathy' in partial.capabilities));
  ok('entitlements: a missing known capability defaults to false', partial.capabilities.archives === false && partial.capabilities.daily_ranked_brew === false);

  // Locked (unauthenticated) → nothing unlocked.
  const locked = validateEntitlements({ entitlement_state: 'free', locked: true });
  ok('entitlements: locked → all capabilities off, free-count 0', locked.locked === true && PREMIUM_CAPABILITIES.every((k) => locked.capabilities[k] === false) && locked.capabilities.unlimited_practice === false);

  // Forbidden fields — payment/identity/answer keys rejected recursively.
  throws('entitlements: a receipt anywhere is rejected', () => validateEntitlements({ ...betaPayload, receipt: 'abc' }));
  throws('entitlements: a customer_id is rejected', () => validateEntitlements({ ...betaPayload, customer_id: 'cus_1' }));
  throws('entitlements: a nested purchase_token is rejected', () => validateEntitlements({ ...betaPayload, meta: { purchase_token: 'tok' } }));
  throws('entitlements: a user_id is rejected', () => validateEntitlements({ ...betaPayload, user_id: 'u1' }));
  throws('entitlements: an attempt_token is rejected', () => validateEntitlements({ ...betaPayload, attempt_token: 't' }));
  throws('entitlements: a correct_answer is rejected', () => validateEntitlements({ ...betaPayload, capabilities: { ...betaPayload.capabilities, correct_answer: 'x' } }));

  // hasCapability — fail-closed.
  ok('hasCapability: true for a granted capability', hasCapability(beta, 'unlimited_practice') === true);
  ok('hasCapability: false for a Premium capability in beta', hasCapability(beta, 'archives') === false);
  ok('hasCapability: null entitlement → false', hasCapability(null, 'unlimited_practice') === false);

  // Local-dev entitlement is the explicit local policy (never a network call).
  ok('LOCAL_DEV_ENTITLEMENTS mirrors beta, source local_dev', LOCAL_DEV_ENTITLEMENTS.entitlementState === 'beta' && LOCAL_DEV_ENTITLEMENTS.source === 'local_dev' && LOCAL_DEV_ENTITLEMENTS.capabilities.unlimited_practice === true && LOCAL_DEV_ENTITLEMENTS.rankedAttemptsPerUtcDay === 1);
  ok('LOCAL_DEV_ENTITLEMENTS unlocks no Premium capability', PREMIUM_CAPABILITIES.every((k) => LOCAL_DEV_ENTITLEMENTS.capabilities[k] === false));

  // Practice access derived from entitlements (cloud path) vs local policy.
  const cloudAccess = practicePolicy.practiceAccessFromEntitlements(beta);
  ok('practiceAccessFromEntitlements(beta) = unlimited, no premium', cloudAccess.canPlayUnlimitedPractice === true && cloudAccess.canAccessArchives === false && cloudAccess.remainingFreePracticeCount === null && cloudAccess.betaUnlimited === true);
  const lockedAccess = practicePolicy.practiceAccessFromEntitlements(locked);
  ok('practiceAccessFromEntitlements(locked) unlocks nothing', lockedAccess.canPlayTodayPractice === false && lockedAccess.canPlayUnlimitedPractice === false);

  // The preview catalogue is copy-only: no price/product/purchase fields, and it
  // never lists a ranked advantage.
  ok('PREMIUM_PREVIEW carries no price/product/purchase fields', PREMIUM_PREVIEW.every((b) => !('price' in b) && !('productId' in b) && !('product_id' in b) && !('sku' in b) && !('buy' in b)));
  ok('PREMIUM_PREVIEW never lists a ranked advantage', PREMIUM_PREVIEW.every((b) => !/ranked attempt|retry|multiplier|leaderboard advantage/i.test(`${b.title} ${b.blurb}`)));
  ok('RANKED_FAIRNESS_PROMISE states never-extra-ranked-attempts', /never/i.test(RANKED_FAIRNESS_PROMISE) && /ranked attempts/i.test(RANKED_FAIRNESS_PROMISE));
}

// =============================================================================
// Phase 7E — entitlement contract (policy_mode + subscription), offerings, service
// =============================================================================
{
  const { validateEntitlements } = validate;

  // The new server shape: policy_mode + safe subscription facts.
  const premiumPayload = {
    entitlement_state: 'premium', entitlement_version: 1, policy_mode: 'beta_open',
    capabilities: { daily_ranked_brew: true, global_leaderboard: true, country_leaderboard: true, ranked_streaks: true, basic_progress: true, share_cards: true, practice_access: true, unlimited_practice: true, archives: false, category_training: false, difficulty_selection: false, advanced_practice_stats: false, advanced_ranked_stats: false, bonus_packs: false, premium_themes: false, private_tournaments: false },
    limits: { ranked_attempts_per_utc_day: 1, free_practice_brews_per_period: null },
    subscription: { is_active: true, will_renew: true, period_type: 'normal', current_period_end: '2026-08-11T00:00:00Z', in_grace_period: false, billing_issue: false },
    source: 'subscription',
  };
  const prem = validateEntitlements(premiumPayload);
  ok('7E: premium parses, policyMode + subscription facts present', prem.entitlementState === 'premium' && prem.policyMode === 'beta_open' && prem.subscription.isActive === true && prem.subscription.willRenew === true);
  ok('7E: premium STILL ranked-limited to exactly 1', prem.rankedAttemptsPerUtcDay === 1);
  ok('7E: premium unlocks no ranked-advantage capability', prem.capabilities.archives === false && !('extra_ranked_attempts' in prem.capabilities));

  // Every subscription state stays ranked-limited to 1.
  for (const st of ['beta', 'free', 'premium', 'grace_period', 'billing_issue', 'expired', 'revoked']) {
    const e = validateEntitlements({ ...premiumPayload, entitlement_state: st });
    ok(`7E: state ${st} → ranked limit exactly 1`, e.rankedAttemptsPerUtcDay === 1);
  }

  // Provider identifiers are rejected recursively (never reach the client via RPC).
  throws('7E: revenuecat_product_id rejected', () => validateEntitlements({ ...premiumPayload, revenuecat_product_id: 'x' }));
  throws('7E: revenuecat_app_user_id rejected', () => validateEntitlements({ ...premiumPayload, subscription: { ...premiumPayload.subscription, revenuecat_app_user_id: 'u' } }));
  throws('7E: nested latest_event_id rejected', () => validateEntitlements({ ...premiumPayload, meta: { latest_event_id: 'evt' } }));
  ok('7E: unknown policy_mode → null (not trusted)', validateEntitlements({ ...premiumPayload, policy_mode: 'hacked' }).policyMode === null);

  // --- Offerings mapping (pure) ---
  const rawOfferings = (extra = {}) => ({ current: {
    identifier: 'default',
    availablePackages: [
      { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'brainbrew_premium_monthly', title: 'Monthly', priceString: '£3.99', price: 3.99, currencyCode: 'GBP', subscriptionPeriod: 'P1M' } },
      { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'brainbrew_premium_annual', title: 'Annual', priceString: '£29.99', price: 29.99, currencyCode: 'GBP', subscriptionPeriod: 'P1Y', introPrice: { priceString: 'Free' } } },
    ], ...extra,
  } });
  const off = rcOfferings.mapCurrentOffering(rawOfferings());
  ok('offerings: maps monthly + annual with store prices', off.packages.length === 2 && off.packages[0].plan === 'monthly' && off.packages[0].priceString === '£3.99' && off.packages[1].plan === 'annual');
  ok('offerings: period + intro derived from store', off.packages[0].period === 'month' && off.packages[1].period === 'year' && off.packages[1].hasIntroOffer === true);
  ok('offerings: no packages → null (calm unavailable)', rcOfferings.mapCurrentOffering({ current: { identifier: 'default', availablePackages: [] } }) === null);
  ok('offerings: missing price → package dropped (no fabricated price)', rcOfferings.mapPackage({ identifier: 'x', product: { identifier: 'p', title: 'T' } }) === null);
  ok('offerings: no current offering → null', rcOfferings.mapCurrentOffering({}) === null);
  ok('savings: only claimed when genuinely cheaper', rcOfferings.annualSavingPercent(3.99, 29.99) === 37 && rcOfferings.annualSavingPercent(1, 12) === null && rcOfferings.annualSavingPercent(1, null) === null);

  // --- Service (mocked adapter) ---
  const hasPremium = (info) => info && info.premium === true;
  function fakeAdapter(overrides = {}) {
    const calls = { configure: 0, logIn: 0, logOut: 0 };
    return {
      calls,
      async configure() { calls.configure++; },
      async logIn() { calls.logIn++; },
      async logOut() { calls.logOut++; },
      async getOfferings() { return rawOfferings(); },
      async getCustomerInfo() { return { premium: false }; },
      async purchasePackage() { return { customerInfo: { premium: true }, userCancelled: false }; },
      async restorePurchases() { return { premium: true }; },
      addCustomerInfoUpdateListener() { return () => {}; },
      setLogLevelVerbose() {},
      ...overrides,
    };
  }
  const mkSvc = (overrides) => rcService.createRevenueCatService({ adapter: fakeAdapter(overrides), apiKey: 'appl_public_key', hasPremium, isDev: false });

  {
    const a = fakeAdapter();
    const s = rcService.createRevenueCatService({ adapter: a, apiKey: 'k', hasPremium, isDev: false });
    await s.configure('11111111-1111-1111-1111-111111111111');
    await s.configure('11111111-1111-1111-1111-111111111111');
    ok('service: single init per identity (configure once)', a.calls.configure === 1 && s.currentUserId() === '11111111-1111-1111-1111-111111111111');
    await s.logIn('22222222-2222-2222-2222-222222222222');
    ok('service: logIn switches identity (no stale user)', a.calls.logIn === 1 && s.currentUserId() === '22222222-2222-2222-2222-222222222222');
    await s.logOutOrSwitch();
    ok('service: logout clears identity', a.calls.logOut === 1 && s.currentUserId() === null);
  }

  {
    const s = mkSvc();
    await s.configure('u1');
    const res = await s.getOfferings();
    ok('service: getOfferings returns mapped offering', 'offering' in res && res.offering.packages.length === 2);
    const out = await s.purchase('$rc_monthly');
    ok('service: successful purchase → purchased (server still authoritative)', out.status === 'purchased');
  }
  {
    const s = mkSvc({ async getCustomerInfo() { return { premium: true }; } });
    await s.configure('u1');
    ok('service: customer state reflects active premium (fast UI hint)', (await s.getCustomerState()).premiumActive === true);
  }
  {
    const s = mkSvc({ async purchasePackage() { return { customerInfo: null, userCancelled: true }; } });
    await s.configure('u1'); await s.getOfferings();
    ok('service: user cancellation is NOT an error', (await s.purchase('$rc_monthly')).status === 'cancelled');
  }
  {
    const s = mkSvc({ async purchasePackage() { throw { message: 'The network connection was lost' }; } });
    await s.configure('u1'); await s.getOfferings();
    const out = await s.purchase('$rc_monthly');
    ok('service: store failure → error code, no raw message leak', out.status === 'error' && out.code === 'network' && !('message' in out));
  }
  {
    const s = mkSvc({ async purchasePackage() { throw { message: 'the receipt is already in use by another user' }; } });
    await s.configure('u1'); await s.getOfferings();
    ok('service: cross-account receipt → conflict', (await s.purchase('$rc_monthly')).status === 'error' && (await (async () => { await s.getOfferings(); return s.purchase('$rc_monthly'); })()).code === 'conflict');
  }
  {
    // Single-flight: two concurrent purchases share one in-flight promise.
    let running = 0, maxConcurrent = 0;
    const s = mkSvc({ async purchasePackage() { running++; maxConcurrent = Math.max(maxConcurrent, running); await new Promise((r) => setTimeout(r, 5)); running--; return { customerInfo: { premium: true }, userCancelled: false }; } });
    await s.configure('u1'); await s.getOfferings();
    const [a2, b2] = await Promise.all([s.purchase('$rc_monthly'), s.purchase('$rc_monthly')]);
    ok('service: duplicate taps collapse to one purchase (single-flight)', maxConcurrent === 1 && a2.status === 'purchased' && b2.status === 'purchased');
  }
  {
    const s = mkSvc({ async restorePurchases() { return { premium: true }; } });
    await s.configure('u1');
    ok('service: restore with a purchase → restored', (await s.restore()).status === 'restored');
    const s2 = mkSvc({ async restorePurchases() { return { premium: false }; } });
    await s2.configure('u1');
    ok('service: restore with nothing → nothing_to_restore', (await s2.restore()).status === 'nothing_to_restore');
    const s3 = mkSvc({ async restorePurchases() { throw { message: 'receipt already in use' }; } });
    await s3.configure('u1');
    ok('service: restore cross-account → conflict', (await s3.restore()).status === 'conflict');
  }
  {
    const s = mkSvc({ async getOfferings() { throw new Error('store down'); } });
    await s.configure('u1');
    ok('service: offerings failure → store_unavailable', 'unavailable' in (await s.getOfferings()) && (await s.getOfferings()).unavailable === 'store_unavailable');
  }
  {
    const s = mkSvc();
    await s.configure('u1'); // no getOfferings → unknown package id
    ok('service: purchasing an unknown package → config error (no raw package)', (await s.purchase('nope')).status === 'error');
  }
}

// =============================================================================
// Phase 7G — client AnalyticsService (pure queue/batch/never-block)
// =============================================================================
{
  const { createAnalytics, ANALYTICS_EVENTS } = analyticsMod;
  const ctx = () => ({ platform: 'ios', appVersion: '1.0.0', environment: 'production' });
  let nowV = 1_700_000_000_000;
  const mk = (overrides = {}) => {
    const sent = [];
    const transport = { send: async (batch) => { sent.push(...batch); return { accepted: batch.length, rejected: 0 }; }, ...overrides };
    const a = createAnalytics({ transport, context: ctx, now: () => nowV, batchSize: 3, maxQueue: 5, maxRetries: 2 });
    return { a, sent, transport };
  };

  ok('analytics: taxonomy has the expected event set', ANALYTICS_EVENTS.includes('ranked_start_requested') && ANALYTICS_EVENTS.includes('purchase_requested'));

  { // enqueues + auto-flush at batchSize
    const { a, sent } = mk();
    a.track('app_opened'); a.track('home_ranked_cta_viewed');
    ok('analytics: queues events without flushing below batch', a._queued() === 2 && sent.length === 0);
    a.track('screen_viewed', { screen: 'home' }); // reaches batchSize=3 → auto-flush
    await Promise.resolve(); await Promise.resolve();
    ok('analytics: auto-flushes at batch size', sent.length === 3 && a._queued() === 0);
  }

  { // unknown event dropped client-side
    const { a } = mk();
    a.track('totally_bogus_event');
    ok('analytics: unknown event dropped', a._queued() === 0);
  }

  { // forbidden props scrubbed; nested objects dropped
    const { a, sent } = mk();
    a.track('reveal_viewed', { properties: { correct_answer: 'X', email: 'a@b.c', ok_field: 1, nested: { a: 1 } } });
    await a.flush();
    const p = sent[0].properties;
    ok('analytics: forbidden + nested props scrubbed, safe kept', !('correct_answer' in p) && !('email' in p) && !('nested' in p) && p.ok_field === 1);
  }

  { // dedup keys are stable per session and reset on identity change
    const { a } = mk();
    a.setSessionContext('sessA');
    a.track('app_opened'); a.track('app_opened');
    const q1 = a._queued();
    a.clearIdentityContext();
    ok('analytics: identity change clears the queue + context', q1 === 2 && a._queued() === 0);
  }

  { // transport failure → bounded retry, then drop; NEVER throws
    let fails = 0;
    const { a } = mk({ send: async () => { fails++; throw new Error('network'); } });
    a.track('app_opened');
    await a.flush(); ok('analytics: failed flush keeps the batch (retry 1)', a._queued() === 1);
    await a.flush(); await a.flush(); // exceed maxRetries=2
    ok('analytics: drops batch after retry budget (no infinite growth)', a._queued() === 0);
    ok('analytics: track never throws even when transport is broken', (() => { try { a.track('app_opened'); return true; } catch { return false; } })());
  }

  { // maxQueue cap drops oldest
    const { a } = mk({ send: async () => { throw new Error('down'); } });
    for (let i = 0; i < 8; i++) a.track('app_opened'); // batchSize triggers flush attempts that fail
    ok('analytics: queue never exceeds maxQueue', a._queued() <= 5);
  }
}

import { rmSync } from 'node:fs';
rmSync(out, { recursive: true, force: true });


// =============================================================================
// REGRESSION (7K): archive resume. The server returned no resume info, so an
// interrupted Archive brew always re-opened slot 1 → 'already_submitted' → the
// player was bounced Home. That archive date could then NEVER be completed.
// =============================================================================
{
  const base = { attemptId: 'a', attemptToken: 't', expiresAt: 1, rankedDate: '2026-07-12', puzzleCount: 5 };
  const fresh = validate.validateArchiveStartResult({ ...base, resumed: false, completedPositions: [], resumePosition: 1 });
  ok('archive fresh start → resume at slot 1, nothing completed', fresh.resumePosition === 1 && fresh.completedPositions.length === 0);

  const mid = validate.validateArchiveStartResult({ ...base, resumed: true, completedPositions: [1, 2], resumePosition: 3 });
  ok('archive resume carries completedPositions + resumePosition', mid.resumed === true && mid.resumePosition === 3 && mid.completedPositions.join(',') === '1,2');

  // All five answered: the server reports puzzleCount + 1 = 'nothing left to open'.
  const done = validate.validateArchiveStartResult({ ...base, resumed: true, completedPositions: [1,2,3,4,5], resumePosition: 6 });
  ok('archive 5/5 answered → resumePosition = puzzleCount + 1 (complete, do not re-open)', done.resumePosition === 6 && done.completedPositions.length === 5);

  throws('archive resumePosition beyond puzzleCount + 1 is rejected', () => validate.validateArchiveStartResult({ ...base, resumed: true, completedPositions: [], resumePosition: 7 }));
  throws('archive resumePosition below 1 is rejected', () => validate.validateArchiveStartResult({ ...base, resumed: true, completedPositions: [], resumePosition: 0 }));
  // The archive contract must still refuse anything ranked or pre-scored.
  throws('archive start claiming ranked is still rejected', () => validate.validateArchiveStartResult({ ...base, resumed: false, isRanked: true }));
  throws('archive start carrying a score is still rejected', () => validate.validateArchiveStartResult({ ...base, resumed: false, finalScore: 50 }));
}


// =============================================================================
// REGRESSION (RC1.1): a FAILED ranked check must never silently become Practice.
// The status used to come back undefined, Home read that as "no ranked brew", and
// offered a generic Start button that quietly began an UNRANKED attempt — the
// player spent their one daily ritual on a brew that never counted.
// =============================================================================
{
  const R = (o) => ctaMod.rankedCta(o);
  ok('ranked check FAILED -> retry_unknown (never a silent unranked start)', R({ unknown: true, eligible: false, state: 'none' }) === 'retry_unknown');
  ok('an unknown state does NOT start a ranked attempt', ctaMod.ctaStartsRanked(R({ unknown: true, eligible: false, state: 'none' })) === false);
  ok('unknown WINS over stale eligible/state values', R({ unknown: true, eligible: true, state: 'active' }) === 'retry_unknown');
  ok('eligible -> ranked_start', R({ eligible: true, state: 'none' }) === 'ranked_start');
  ok('active -> ranked_continue', R({ eligible: false, state: 'active' }) === 'ranked_continue');
  ok('completed -> practice_only', R({ eligible: false, state: 'completed' }) === 'practice_only');
  ok('KNOWN ineligibility (guest) -> plain_start', R({ eligible: false, state: 'none' }) === 'plain_start');
  ok('local mode -> plain_start', R(undefined) === 'plain_start');
  ok('only ranked_start/ranked_continue start a ranked brew', ctaMod.ctaStartsRanked('ranked_start') && ctaMod.ctaStartsRanked('ranked_continue') && !ctaMod.ctaStartsRanked('practice_only') && !ctaMod.ctaStartsRanked('plain_start'));
}

if (failures.length) {
  console.error(`\n${failures.length} CLOUD-CLIENT CHECK(S) FAILED:\n`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} cloud-client checks passed`);
