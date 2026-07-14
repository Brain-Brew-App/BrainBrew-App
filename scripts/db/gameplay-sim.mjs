/**
 * Server-authoritative gameplay simulation — `npm run db:gameplay-sim`.
 *
 * Runs the ACTUAL Edge Function flow logic (`supabase/functions/_shared/
 * gameplay.ts`) against a real Postgres (PGlite) loaded with the real content
 * and a published live pack. It exercises the full secure path exactly as a
 * cloud client would, and proves the properties the phase is about:
 *
 *   • the public pack the client receives carries NO answer field;
 *   • the server times each puzzle itself (open → submit), not the client;
 *   • a correct raw submission scores identically to the canonical app scorer;
 *   • the answer key + explanation are revealed ONLY after submission;
 *   • replays, tampered/expired/wrong-session tokens, and voided slots are
 *     rejected;
 *   • the final BrewScore is the server's sum and is UNRANKED.
 *
 * No network, no secret key: PGlite stands in for the managed database, and the
 * flow code is the same bytes that deploy to Deno.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compilePureModules } from '../compile.mjs';
import { buildAllRows } from './build-rows.mjs';
import { count, freshDb, upsert } from './pglite-harness.mjs';
import { keyFor, playsFor } from './plays.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));
async function expectThrow(name, code, fn) {
  try {
    await fn();
    failures.push(`${name} — expected rejection (${code}) but it succeeded`);
  } catch (e) {
    if (String(e.message).includes(code)) passed++;
    else failures.push(`${name} — threw the wrong error: ${e.message}`);
  }
}

// --- Compile the Deno flow modules for Node (rewrite `.ts` imports) ----------
const SHARED = join(ROOT, 'supabase', 'functions', '_shared');
const outDir = mkdtempSync(join(tmpdir(), 'bb-flow-'));
for (const f of ['http.ts', 'points.ts', 'scoring.ts', 'token.ts', 'publicShape.ts', 'gameplay.ts']) {
  writeFileSync(
    join(outDir, f),
    readFileSync(join(SHARED, f), 'utf8').replace(/from '(\.\/[^']+)\.ts'/g, "from '$1'"),
  );
}
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [
    tsc, ...['http', 'points', 'scoring', 'token', 'publicShape', 'gameplay'].map((n) => join(outDir, `${n}.ts`)),
    '--ignoreConfig', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020',
    '--lib', 'es2020,dom', '--skipLibCheck',
  ], { stdio: 'pipe' });
} catch (e) {
  const real = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter((l) => /error TS\d+/.test(l) && !l.includes('TS5107'));
  if (real.length) { console.error('flow modules failed to compile:\n', real.join('\n')); process.exit(1); }
}
const flow = await import(pathToFileURL(join(outDir, 'gameplay.js')).href);

// --- Load the canonical content + app scorer (to cross-check server points) --
const { load, out: appOut } = compilePureModules();
const app = await load('scoring/brewScore.js');
const { ALL_PUZZLES } = await load('content/library.js');
const puzzleById = new Map(ALL_PUZZLES.map((p) => [p.id, p]));

// --- Fresh DB: migrations + real content + a published live pack -------------
const rows = await buildAllRows();
const db = await freshDb();
await upsert(db, 'puzzle_engines', rows.engines, 'engine_id');
await upsert(db, 'puzzle_seeds', rows.seeds, 'seed_id');
await upsert(db, 'puzzles', rows.puzzles.map((p) => ({ ...p, status: 'draft' })), 'puzzle_id');
await upsert(db, 'puzzle_answers', rows.answers, 'puzzle_id');
if ((await count(db, 'puzzle_validation_results')) === 0) {
  for (const v of rows.validations) {
    await db.query(
      `insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source)
       values ($1,$2,$3,$4::jsonb,$5,$6)`,
      [v.puzzle_id, v.validator_version, v.passed, JSON.stringify(v.findings), v.validation_hash, v.validation_source],
    );
  }
}
await db.exec(`update puzzles set status='approved', approved_at=now() where status='draft';`);
await upsert(db, 'daily_packs', rows.packs.map((p) => ({ ...p, status: 'draft' })), 'pack_id');
await upsert(db, 'daily_pack_slots', rows.slots, ['pack_id', 'position']);
await db.exec(`update daily_packs set status='approved' where status='draft';`);

// Publish the first pack to today (the flow resolves "today" via the injected clock).
const packId = rows.packs.find((p) => p.pack_index === 0).pack_id;
const today = (await db.query(`select (now() at time zone 'utc')::date::text d`)).rows[0].d;
await db.query(`select publish_pack($1, $2::date)`, [packId, today]);
ok('a real pack is published live for today', true);

// --- The Db port over PGlite (owner role bypasses RLS, like service_role) ----
const iso = (v) => new Date(v).toISOString();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = (r) => (r.length ? r[0] : null);

const port = {
  async getPublicPack(date) {
    return await q(`select * from get_public_pack($1::date) order by position`, [date]);
  },
  async getLivePack(date) {
    return one(await q(
      `select pack_id, pack_date::text pack_date, difficulty_label, status, incident_status
       from daily_packs where status='live' and pack_date=$1::date limit 1`, [date]));
  },
  async getPackById(packId) {
    return one(await q(
      `select pack_id, pack_date::text pack_date, difficulty_label, status, incident_status
       from daily_packs where pack_id=$1 limit 1`, [packId]));
  },
  async getSlot(packId, position) {
    return one(await q(
      `select id, pack_id, position, puzzle_id, engine_id, max_score, void_status
       from daily_pack_slots where pack_id=$1 and position=$2 limit 1`, [packId, position]));
  },
  async resolveSlot(attempt, position) {
    if (attempt.practice_pack_id) {
      const r = one(await q(
        `select id, practice_pack_id, position, puzzle_id, engine_id, max_score
         from practice_pack_slots where practice_pack_id=$1 and position=$2 limit 1`, [attempt.practice_pack_id, position]));
      if (!r) return null;
      return { id: r.id, pack_id: r.practice_pack_id, position: r.position, puzzle_id: r.puzzle_id, engine_id: r.engine_id, max_score: r.max_score, void_status: false };
    }
    return one(await q(
      `select id, pack_id, position, puzzle_id, engine_id, max_score, void_status
       from daily_pack_slots where pack_id=$1 and position=$2 limit 1`, [attempt.pack_id, position]));
  },
  async resolveSlotPublic(attempt, position) {
    if (attempt.practice_pack_id) {
      const rows = one(await q(`select practice_pack_public($1) r`, [attempt.practice_pack_id])).r;
      return rows.find((r) => r.position === position) ?? null;
    }
    const pd = one(await q(`select pack_date::text d from daily_packs where pack_id=$1`, [attempt.pack_id]));
    if (!pd) return null;
    const rows = await q(`select * from get_public_pack($1::date) order by position`, [pd.d]);
    const slot = await this.resolveSlot(attempt, position);
    return slot ? rows.find((r) => r.puzzle_id === slot.puzzle_id) ?? null : null;
  },
  async startPracticePack({ userId, sessionId, appVersion }) {
    const r = one(await q(`select start_practice_pack($1,$2,$3) r`, [userId, sessionId, appVersion]));
    const d = r.r;
    return { resumed: d.resumed, attempt_id: d.attempt_id, practice_pack_id: d.practice_pack_id, slots: d.slots ?? [] };
  },
  async getPuzzlePublicPayload(puzzleId) {
    const r = one(await q(`select public_payload from puzzles where puzzle_id=$1`, [puzzleId]));
    return r?.public_payload ?? null;
  },
  async getPuzzlePrivate(puzzleId) {
    return one(await q(`select answer_payload, explanation from puzzle_answers where puzzle_id=$1`, [puzzleId]));
  },
  async createAttempt({ userId, sessionId, packId, appVersion }) {
    return one(await q(
      `insert into attempts (user_id, session_id, pack_id, app_version) values ($1,$2,$3,$4)
       returning id, session_id, pack_id, status, user_id, is_ranked, ranked_date::text ranked_date, active_denominator`,
      [userId, sessionId, packId, appVersion]));
  },
  async getAttempt(attemptId) {
    return one(await q(
      `select id, session_id, pack_id, status, user_id, is_ranked, ranked_date::text ranked_date, active_denominator, practice_pack_id
       from attempts where id=$1`, [attemptId]));
  },
  async getItem(attemptId, slotId) {
    const r = one(await q(
      `select id, attempt_id, slot_id, position, opened_at, status
       from attempt_items where attempt_id=$1 and slot_id=$2`, [attemptId, slotId]));
    if (r) r.opened_at = iso(r.opened_at);
    return r;
  },
  async openItem({ attemptId, slotId, position }) {
    const r = one(await q(
      `insert into attempt_items (attempt_id, slot_id, position) values ($1,$2,$3)
       returning id, attempt_id, slot_id, position, opened_at, status`, [attemptId, slotId, position]));
    r.opened_at = iso(r.opened_at);
    return r;
  },
  async submitItem({ attemptId, slotId, answerPayload, awardedScore, verdict, resultPayload }) {
    await db.query(
      `update attempt_items set answer_payload=$3::jsonb, awarded_score=$4, verdict=$5,
         result_payload=$6::jsonb, submitted_at=now(), status='submitted'
       where attempt_id=$1 and slot_id=$2 and status='opened'`,
      [attemptId, slotId, JSON.stringify(answerPayload), awardedScore, verdict, JSON.stringify(resultPayload)]);
  },
  async submittedItems(attemptId) {
    return await q(
      `select position, awarded_score, verdict from attempt_items
       where attempt_id=$1 and status='submitted'`, [attemptId]);
  },
  async completeAttempt({ attemptId, finalScore }) {
    await db.query(
      `update attempts set status='completed', final_score=$2, completed_at=now()
       where id=$1 and status='active'`, [attemptId, finalScore]);
  },
  // --- Ranked (Phase 6A) ---
  async rankEligibility(userId, appVersion, today) {
    return one(await q(`select check_rank_eligibility($1,$2,$3::date) e`, [userId, appVersion, today])).e;
  },
  async profileSnapshot(userId) {
    const r = one(await q(`select username, country_code from profiles where id=$1`, [userId]));
    if (!r || !r.username || !r.country_code) return null;
    return { username: r.username, country_code: r.country_code };
  },
  async activeDenominator(packId) {
    return one(await q(`select coalesce(sum(max_score),0)::int d from daily_pack_slots where pack_id=$1 and void_status=false`, [packId])).d;
  },
  async createRankedAttempt(input) {
    try {
      return one(await q(
        `insert into attempts (user_id, session_id, pack_id, app_version, is_ranked, ranked_date, country_code_snapshot, username_snapshot, active_denominator, content_hash_snapshot, scoring_version)
         values ($1,$2,$3,$4,true,$5::date,$6,$7,$8,$9,$10)
         returning id, session_id, pack_id, status, user_id, is_ranked, ranked_date::text ranked_date, active_denominator`,
        [input.userId, input.sessionId, input.packId, input.appVersion, input.rankedDate, input.countryCode, input.username, input.denominator, input.contentHash, input.scoringVersion]));
    } catch (e) {
      if (/unique|duplicate/i.test(e.message)) { const err = new Error('ranked_conflict'); err.code = 'ranked_conflict'; throw err; }
      throw e;
    }
  },
  async activeRankedAttempt(userId, rankedDate) {
    return one(await q(
      `select id, session_id, pack_id, status, user_id, is_ranked, ranked_date::text ranked_date, active_denominator
       from attempts where user_id=$1 and ranked_date=$2::date and is_ranked=true and status='active' limit 1`, [userId, rankedDate]));
  },
  async submittedPositions(attemptId) {
    return (await q(`select position from attempt_items where attempt_id=$1 and status='submitted'`, [attemptId])).map((r) => r.position);
  },
};

// A fixed server clock so token expiry and the open→submit timer are deterministic.
const SECRET = 'simulation-secret-at-least-32-chars-long-xx';
let clockMs = Date.parse(`${today}T12:00:00.000Z`);
const deps = { db: port, secret: SECRET, now: () => clockMs };

/** Force the server-measured elapsed time for the open item of a slot. */
async function setElapsed(attemptId, slotId, elapsedMs) {
  await db.query(`update attempt_items set opened_at = to_timestamp($3::double precision / 1000)
    where attempt_id=$1 and slot_id=$2`, [attemptId, slotId, clockMs - elapsedMs]);
}

// =============================================================================
// 1. get-daily-pack: sanitized, no answers
// =============================================================================

const pack = await flow.getDailyPack(deps, {});
ok('get-daily-pack returns five puzzles', pack.puzzles.length === 5);
const ANSWER_FIELDS = ['oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm',
  'correctOrder', 'constraints', 'membership', 'targetIds', 'explanation'];
ok('no public puzzle carries a top-level answer field',
  pack.puzzles.every((pz) => ANSWER_FIELDS.every((f) => !(f in pz))));
ok('sweep symbols carry no isTarget, classify items no bucket',
  pack.puzzles.every((pz) =>
    (!Array.isArray(pz.symbols) || pz.symbols.every((s) => !('isTarget' in s))) &&
    (!Array.isArray(pz.items) || pz.items.every((i) => !('bucket' in i)))));
ok('public puzzles carry a prompt and timing to render/score', pack.puzzles.every((pz) => pz.prompt && pz.timing));

// =============================================================================
// 2. A full honest attempt: perfect answers, server-timed, cross-checked
// =============================================================================

// Two authenticated players (Phase 5B): the attempt owner and an attacker.
const USER = '11111111-1111-1111-1111-111111111111';
const ATTACKER = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1, true), ($2, true)`, [USER, ATTACKER]);

const SESSION = 'sim-session-abcdef0123456789';
const start = await flow.startAttempt(deps, { userId: USER, sessionId: SESSION, appVersion: '1.0.0' });
ok('start-attempt issues an attempt token', typeof start.attemptToken === 'string' && start.attemptId);
ok('the attempt is owned by the authenticated user', (await port.getAttempt(start.attemptId)).user_id === USER);

let expectedTotal = 0;
for (const pos of [1, 2, 3, 4, 5]) {
  const slot = await port.getSlot(packId, pos);
  const puzzle = puzzleById.get(slot.puzzle_id);
  const elapsed = puzzle.timing.parMs; // fast, clean

  const opened = await flow.openPuzzle(deps, { attemptToken: start.attemptToken, userId: USER, sessionId: SESSION, position: pos });
  ok(`open-puzzle position ${pos} withholds the answer`,
    ANSWER_FIELDS.every((f) => !(f in opened.puzzle)) && typeof opened.openToken === 'string');

  // Re-opening must not reset the timer.
  const openedAt1 = (await port.getItem(start.attemptId, slot.id)).opened_at;
  await flow.openPuzzle(deps, { attemptToken: start.attemptToken, userId: USER, sessionId: SESSION, position: pos });
  const openedAt2 = (await port.getItem(start.attemptId, slot.id)).opened_at;
  ok(`re-opening position ${pos} does not reset the server timer`, openedAt1 === openedAt2);

  await setElapsed(start.attemptId, slot.id, elapsed);

  const [perfect] = playsFor(puzzle, elapsed);
  const res = await flow.submitAnswer(deps, {
    openToken: opened.openToken, userId: USER, sessionId: SESSION, position: pos, submission: perfect.raw,
  });

  const expected = app.scorePuzzle(puzzle, perfect.answer);
  const expectVerdict = expected.correct ? 'correct' : expected.points > 0 ? 'partial' : 'incorrect';
  ok(`position ${pos} (${slot.engine_id}) scores exactly like the app scorer`,
    res.points === expected.points && res.correct === expected.correct && res.verdict === expectVerdict);
  ok(`position ${pos} reveals the explanation only on submit`, typeof res.explanation === 'string' && res.explanation.length > 0);
  ok(`position ${pos} used the server-measured elapsed time`, res.elapsedMs === elapsed);
  expectedTotal += res.points;

  // Replay: a second submit for the same slot is rejected.
  await expectThrow(`position ${pos} cannot be resubmitted`, 'already_submitted', () =>
    flow.submitAnswer(deps, { openToken: opened.openToken, userId: USER, sessionId: SESSION, position: pos, submission: perfect.raw }));
}

// Cross-user denial: the attacker cannot use the owner's token, even with the
// right session id — the token is bound to the owner's auth user AND the DB
// attempt row is owned by them.
await expectThrow('another user cannot open with the owner\'s attempt token', 'invalid_token:wrong_user', () =>
  flow.openPuzzle(deps, { attemptToken: start.attemptToken, userId: ATTACKER, sessionId: SESSION, position: 1 }));

const done = await flow.completeAttempt(deps, { attemptToken: start.attemptToken, userId: USER, sessionId: SESSION });
ok('complete-attempt returns the server-summed BrewScore', done.finalScore === expectedTotal);
ok('the completed attempt is UNRANKED', done.isRanked === false);
ok('complete-attempt is idempotent', (await flow.completeAttempt(deps, { attemptToken: start.attemptToken, userId: USER, sessionId: SESSION })).finalScore === expectedTotal);
const persisted = one(await q(`select final_score, status, is_ranked from attempts where id=$1`, [start.attemptId]));
ok('the attempt is persisted completed with a final score', persisted.status === 'completed' && persisted.final_score === expectedTotal && persisted.is_ranked === false);

// =============================================================================
// 2R. Ranked daily attempt (Phase 6A): one secure BrewScore per user per date
// =============================================================================
// Runs BEFORE the adversarial void section so the ranked pack still has all five
// active slots. A fresh PERMANENT player with a complete profile is eligible.
const RUSER = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous) values ($1, false)`, [RUSER]);
await db.query(
  `update profiles set username='Ranked_01', username_normalized='ranked_01',
     country_code='AE', display_country=true, onboarding_status='complete' where id=$1`, [RUSER]);
const RSESSION = 'ranked-session-abcdef012345';

const denomAll = await port.activeDenominator(packId);
const rstart = await flow.startDailyAttempt(deps, { userId: RUSER, sessionId: RSESSION, appVersion: '1.0.0' });
ok('ranked start returns an active ranked attempt at position 1',
  rstart.status === 'active' && rstart.ranked === true && rstart.resumePosition === 1);
const rrow = one(await q(
  `select is_ranked, ranked_date::text d, country_code_snapshot c, username_snapshot u,
     active_denominator ad, scoring_version sv from attempts where id=$1`, [rstart.attemptId]));
ok('the ranked row is server-marked is_ranked with today\'s date',
  rrow.is_ranked === true && rrow.d === today);
ok('the country + username are snapshotted at start', rrow.c === 'AE' && rrow.u === 'Ranked_01');
ok('the active denominator is the sum of live slot max scores', rrow.ad === denomAll);
ok('the scoring version is stamped', rrow.sv === flow.SCORING_VERSION);

// Play all five ranked slots honestly, server-timed.
let rtotal = 0;
for (const pos of [1, 2, 3, 4, 5]) {
  const slot = await port.getSlot(packId, pos);
  const puzzle = puzzleById.get(slot.puzzle_id);
  const opened = await flow.openPuzzle(deps, { attemptToken: rstart.attemptToken, userId: RUSER, sessionId: RSESSION, position: pos });
  await setElapsed(rstart.attemptId, slot.id, puzzle.timing.parMs);
  const [perfect] = playsFor(puzzle, puzzle.timing.parMs);
  const res = await flow.submitAnswer(deps, { openToken: opened.openToken, userId: RUSER, sessionId: RSESSION, position: pos, submission: perfect.raw });
  rtotal += res.points;
}
const rdone = await flow.completeAttempt(deps, { attemptToken: rstart.attemptToken, userId: RUSER, sessionId: RSESSION });
ok('ranked complete reports a ranked BrewScore', rdone.isRanked === true && rdone.rankedDate === today);
ok('the ranked BrewScore is normalized over the active denominator',
  rdone.finalScore === Math.min(100, Math.round((100 * rtotal) / denomAll)));

// One ranked result per user per UTC date: a second start returns the locked result.
const rAgain = await flow.startDailyAttempt(deps, { userId: RUSER, sessionId: RSESSION, appVersion: '1.0.0' });
ok('a second ranked start returns the completed, locked result',
  rAgain.status === 'completed' && rAgain.lockedScore === rdone.finalScore);
ok('get_today_player_status reports today\'s ranked brew complete',
  (await port.rankEligibility(RUSER, '1.0.0', today)).reason === 'ranked_attempt_completed');

// The DB unique index — not the app — forbids a second ranked row for the date.
await expectThrow('the DB rejects a second ranked row for the same user/date', 'duplicate', () =>
  db.query(
    `insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, country_code_snapshot)
     values ($1,'ranked-dupe-000000',$2,true,$3::date,'AE')`, [RUSER, packId, today]));

// Country snapshot is immutable: changing the live profile country cannot rewrite
// a completed ranked result's country.
await db.query(`update profiles set country_code='US', country_changed_at=null where id=$1`, [RUSER]);
ok('the completed result keeps its country snapshot',
  one(await q(`select country_code_snapshot c from attempts where id=$1`, [rstart.attemptId])).c === 'AE');
await db.query(`update profiles set country_code='AE' where id=$1`, [RUSER]); // restore for later

// A completed ranked score cannot be edited directly (no recalc_version bump).
const otherScore = rdone.finalScore === 50 ? 60 : 50; // in-range and always distinct
await expectThrow('a completed ranked score is final without a recalc bump', 'is final', () =>
  db.query(`update attempts set final_score=$2 where id=$1`, [rstart.attemptId, otherScore]));
// …and its ranked identity is immutable.
// A FIXED far-past date, never the value already stored. Using (current_date - 1)
// made this assertion date-fragile: the sim dates its ranked attempt from a mocked
// clock, so after a real UTC rollover the 'new' value equalled the old one, the
// UPDATE became a no-op, nothing was 'distinct from' anything, and the trigger
// correctly did not fire — so the test failed while the invariant was perfectly fine.
await expectThrow('ranked identity (date/country) is immutable', 'immutable', () =>
  db.query(`update attempts set ranked_date=DATE '2020-01-01' where id=$1`, [rstart.attemptId]));

// After ranked completion, replay is available only as UNRANKED practice.
const practice = await flow.startAttempt(deps, { userId: RUSER, sessionId: RSESSION, appVersion: '1.0.0' });
ok('replay after ranked completion is an unranked practice attempt',
  one(await q(`select is_ranked r from attempts where id=$1`, [practice.attemptId])).r === false);

// Void recalculation: void one played slot, renormalize over the survivors, idempotent.
const rItems = new Map((await q(`select position, awarded_score s from attempt_items where attempt_id=$1`, [rstart.attemptId])).map((r) => [r.position, r.s]));
const vSlot = await port.getSlot(packId, 5);
await db.query(`update daily_pack_slots set void_status=true, void_reason='sim-recalc', voided_at=now() where id=$1`, [vSlot.id]);
const recalc = one(await q(`select recalculate_ranked_result($1) r`, [rstart.attemptId])).r;
const survivorDenom = denomAll - vSlot.max_score;
const survivorSum = rtotal - (rItems.get(5) ?? 0);
ok('void recalculation renormalizes over the surviving slots',
  recalc.ok === true && recalc.active_denominator === survivorDenom &&
  recalc.final_score === Math.round((100 * survivorSum) / survivorDenom));
ok('void recalculation bumps recalc_version', recalc.recalc_version === 1);
const recalc2 = one(await q(`select recalculate_ranked_result($1) r`, [rstart.attemptId])).r;
ok('void recalculation is idempotent (no second bump)',
  recalc2.final_score === recalc.final_score && recalc2.recalc_version === 1);
// Slot 5 stays voided (voids are terminal); the adversarial section below voids
// slot 3 independently and only asserts on its own slot.

// =============================================================================
// 3. Adversarial: bad tokens, wrong session, expiry, void, wrong submission
// =============================================================================

const attacker = await flow.startAttempt(deps, { userId: ATTACKER, userId: ATTACKER, sessionId: 'attacker-session-0123456789', appVersion: '1.0.0' });

// Tampered attempt token.
await expectThrow('a tampered token is rejected', 'invalid_token', () => {
  const [b, s] = attacker.attemptToken.split('.');
  const forged = `${b.slice(0, -1)}${b.slice(-1) === 'A' ? 'B' : 'A'}.${s}`;
  return flow.openPuzzle(deps, { attemptToken: forged, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 1 });
});

// A valid token used by a different session.
await expectThrow('a token cannot be used by another session', 'invalid_token', () =>
  flow.openPuzzle(deps, { attemptToken: attacker.attemptToken, userId: ATTACKER, sessionId: 'someone-else-9999999999', position: 1 }));

// Expired token.
await expectThrow('an expired token is rejected', 'invalid_token:expired', () => {
  const saved = clockMs;
  clockMs = saved + 3 * 60 * 60 * 1000; // past the 2h attempt TTL
  return flow.openPuzzle(deps, { attemptToken: attacker.attemptToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 1 })
    .finally(() => { clockMs = saved; });
});

// An open token from one slot cannot submit another slot.
const openP1 = await flow.openPuzzle(deps, { attemptToken: attacker.attemptToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 1 });
await expectThrow('an open token is bound to its slot', 'invalid_token:wrong_slot', () =>
  flow.submitAnswer(deps, { openToken: openP1.openToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 2, submission: { selectedId: 'x' } }));

// A voided slot cannot be opened.
const voidPos = 3;
const voidSlot = await port.getSlot(packId, voidPos);
await db.query(`update daily_pack_slots set void_status=true, void_reason='sim', voided_at=now() where id=$1`, [voidSlot.id]);
await expectThrow('a voided slot cannot be opened', 'slot_voided', () =>
  flow.openPuzzle(deps, { attemptToken: attacker.attemptToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: voidPos }));
// …and it disappears from the public pack.
ok('a voided slot is hidden from the public pack', (await flow.getDailyPack(deps, {})).puzzles.every((pz) => pz.position !== voidPos));

// A malformed submission shape is rejected before scoring.
const openP2 = await flow.openPuzzle(deps, { attemptToken: attacker.attemptToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 2 });
await expectThrow('a submission of the wrong shape is rejected', 'invalid_submission', () =>
  flow.submitAnswer(deps, { openToken: openP2.openToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 2, submission: { tappedIds: ['a'] } }));

// A wrong (but well-formed) answer scores low and reveals the same explanation.
const slot2 = await port.getSlot(packId, 2);
const puzzle2 = puzzleById.get(slot2.puzzle_id);
await setElapsed(attacker.attemptId, slot2.id, puzzle2.timing.parMs);
const [, imperfect] = playsFor(puzzle2, puzzle2.timing.parMs);
const wrongRes = await flow.submitAnswer(deps, {
  openToken: openP2.openToken, userId: ATTACKER, sessionId: 'attacker-session-0123456789', position: 2, submission: imperfect.raw,
});
const wrongExpected = app.scorePuzzle(puzzle2, imperfect.answer);
ok('a wrong answer scores exactly like the app scorer', wrongRes.points === wrongExpected.points && wrongRes.correct === wrongExpected.correct);
ok('a wrong answer still reveals the explanation', typeof wrongRes.explanation === 'string' && wrongRes.explanation.length > 0);

// =============================================================================
// 4. Reserve-based Practice (Phase 7B): fresh unranked pack, full secure play
// =============================================================================
const PUSER = '44444444-4444-4444-4444-444444444444';
await db.query(`insert into auth.users (id, is_anonymous) values ($1, false)`, [PUSER]);
await db.query(`update profiles set username='prac_user', username_normalized='prac_user', country_code='AE', onboarding_status='complete' where id=$1`, [PUSER]);
const PSESSION = 'practice-session-abcdef01';
const todayRankedIds = new Set((await q(`select puzzle_id from daily_pack_slots where pack_id=$1`, [packId])).map((r) => r.puzzle_id));

const pstart = await flow.startPracticeAttempt(deps, { userId: PUSER, sessionId: PSESSION, appVersion: '1.0.0' });
ok('practice start returns an active UNRANKED brew with five puzzles', pstart.status === 'active' && pstart.ranked === false && pstart.puzzles.length === 5 && pstart.resumed === false);
ok('practice puzzles are in the fixed category order', pstart.puzzles.map((p) => p.category).join() === 'observation,pattern,logic,language-logic,attention-speed');
ok('no practice puzzle is one of today\'s ranked puzzles', pstart.puzzles.every((p) => !todayRankedIds.has(p.puzzleId)));
ok('practice puzzles carry NO answer field', pstart.puzzles.every((pz) => ANSWER_FIELDS.every((f) => !(f in pz))));

// Resume: starting again returns the SAME active practice attempt.
const presume = await flow.startPracticeAttempt(deps, { userId: PUSER, sessionId: PSESSION, appVersion: '1.0.0' });
ok('starting practice again resumes the same attempt (no new pack)', presume.resumed === true && presume.attemptId === pstart.attemptId);

// A ranked token cannot open a practice slot for another user.
await expectThrow('a ranked token cannot be used by the practice user', 'invalid_token:wrong_user', () =>
  flow.openPuzzle(deps, { attemptToken: rstart.attemptToken, userId: PUSER, sessionId: PSESSION, position: 1 }));

// Play all five practice slots, server-timed, and complete → still unranked.
let ptotal = 0;
for (const pos of [1, 2, 3, 4, 5]) {
  const opened = await flow.openPuzzle(deps, { attemptToken: pstart.attemptToken, userId: PUSER, sessionId: PSESSION, position: pos });
  const puzzle = puzzleById.get(opened.puzzle.puzzleId);
  const slotId = one(await q(`select slot_id from attempt_items where attempt_id=$1 and position=$2`, [pstart.attemptId, pos])).slot_id;
  await setElapsed(pstart.attemptId, slotId, puzzle.timing.parMs);
  const [perfect] = playsFor(puzzle, puzzle.timing.parMs);
  const res = await flow.submitAnswer(deps, { openToken: opened.openToken, userId: PUSER, sessionId: PSESSION, position: pos, submission: perfect.raw });
  ok(`practice slot ${pos} scores like the app scorer`, res.points === app.scorePuzzle(puzzle, perfect.answer).points);
  ptotal += res.points;
}
const pdone = await flow.completeAttempt(deps, { attemptToken: pstart.attemptToken, userId: PUSER, sessionId: PSESSION });
ok('a completed practice brew is UNRANKED', pdone.isRanked === false && pdone.finalScore === ptotal);
{
  const att = one(await q(`select is_ranked, attempt_purpose, practice_pack_id, pack_id from attempts where id=$1`, [pstart.attemptId]));
  ok('the practice attempt is unranked, purpose practice, bound to a practice pack', att.is_ranked === false && att.attempt_purpose === 'practice' && att.practice_pack_id !== null && att.pack_id === null);
}
// After completion a fresh start builds a NEW practice pack.
const pnew = await flow.startPracticeAttempt(deps, { userId: PUSER, sessionId: PSESSION, appVersion: '1.0.0' });
ok('after completion a new practice pack is generated', pnew.resumed === false && pnew.attemptId !== pstart.attemptId);
// Practice never entered the ranked leaderboard for PUSER's country.
ok('practice never appears in the ranked leaderboard', one(await q(`select count(*)::int c from ranked_result_projection where user_id=$1`, [PUSER])).c === 0);

// =============================================================================

rmSync(outDir, { recursive: true, force: true });
rmSync(appOut, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} GAMEPLAY-SIM FAILURE(S):\n`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} gameplay-sim checks passed — the full server-authoritative path holds end to end`);
