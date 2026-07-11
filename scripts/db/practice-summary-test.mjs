/**
 * Practice Summary / history DB tests — `npm run db:practice-summary-test`.
 *
 * Proves the Phase 7C private Practice summary (derived from practice attempts):
 *   • brews/puzzles, avg/best/latest score, avg solve time, category performance,
 *     most-practiced category; empty player;
 *   • history newest-first, keyset pagination, safe fields only;
 *   • ranked attempts excluded; summary never touches ranked surfaces;
 *   • security: anonymous ok for own data, unauthenticated denied, no user param.
 */

import { freshDb, actAs, upsert, count } from './pglite-harness.mjs';
import { buildAllRows } from './build-rows.mjs';

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection, but it succeeded`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`); else passed++; }
}

const db = await freshDb();
const rows = await buildAllRows();
await upsert(db, 'puzzle_engines', rows.engines, 'engine_id');
await upsert(db, 'puzzle_seeds', rows.seeds, 'seed_id');
await upsert(db, 'puzzles', rows.puzzles.map((p) => ({ ...p, status: 'draft' })), 'puzzle_id');
await upsert(db, 'puzzle_answers', rows.answers, 'puzzle_id');
if ((await count(db, 'puzzle_validation_results')) === 0) {
  for (const v of rows.validations) {
    await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source)
       values ($1,$2,$3,$4::jsonb,$5,$6)`, [v.puzzle_id, v.validator_version, v.passed, JSON.stringify(v.findings), v.validation_hash, v.validation_source]);
  }
}
await db.exec(`update puzzles set status='approved', approved_at=now() where status='draft';`);
await upsert(db, 'daily_packs', rows.packs.map((p) => ({ ...p, status: 'draft' })), 'pack_id');
await upsert(db, 'daily_pack_slots', rows.slots, ['pack_id', 'position']);
await db.exec(`update daily_packs set status='approved' where status='draft';`);
const packId = rows.packs.find((p) => p.pack_index === 0).pack_id;
const today = (await db.query(`select (now() at time zone 'utc')::date::text d`)).rows[0].d;
await db.query(`select publish_pack($1, $2::date)`, [packId, today]);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = (r) => (r.length ? r[0] : null);
const call = async (id, sql, params = [], anon = false) => { await actAs(db, id, { isAnonymous: anon }); return one((await db.query(sql, params)).rows); };

const U = '11111111-1111-1111-1111-111111111111';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [U]);
await db.query(`update profiles set username='Prac', username_normalized='prac', country_code='AE', onboarding_status='complete' where id=$1`, [U]);

let seq = 0;
async function playPractice(user, scores, ageSec) {
  seq += 1;
  const r = one(await q(`select start_practice_pack($1,$2,'1.0.0') r`, [user, `pinstall${String(seq).padStart(8, '0')}`])).r;
  const slots = await q(`select id, position from practice_pack_slots where practice_pack_id=$1 order by position`, [r.practice_pack_id]);
  const base = Date.now() - 172800000;
  for (const s of slots) {
    const sc = scores[s.position - 1];
    await q(`insert into attempt_items (attempt_id, slot_id, position, answer_payload, awarded_score, verdict, result_payload, opened_at, submitted_at, status)
             values ($1,$2,$3,'{}'::jsonb,$4,$5,'{}'::jsonb, to_timestamp($6::double precision/1000), to_timestamp($7::double precision/1000), 'submitted')`,
      [r.attempt_id, s.id, s.position, sc, sc >= 20 ? 'correct' : sc > 0 ? 'partial' : 'incorrect', base, base + s.position * 1000]);
  }
  const total = scores.reduce((a, b) => a + b, 0);
  await q(`update attempts set status='completed', final_score=$2, completed_at=now() - ($3 || ' seconds')::interval where id=$1`, [r.attempt_id, total, ageSec]);
  return { attemptId: r.attempt_id, total };
}

// =============================================================================
// 1. Empty player
// =============================================================================
{
  const empty = (await call(U, `select get_my_practice_summary() r`)).r;
  ok('empty player: 0 brews, null scores, not locked', empty.locked === false && empty.practice_brews_completed === 0 && empty.average_score === null && empty.categories.length === 0);
}
await db.exec(`reset role;`);

// Three practice brews: 100, 50, 65 (brew3 most recent).
await playPractice(U, [20, 20, 20, 20, 20], 300);
await playPractice(U, [10, 10, 10, 10, 10], 200);
await playPractice(U, [15, 15, 15, 0, 20], 100);

// =============================================================================
// 2. Summary formulas
// =============================================================================
{
  const s = (await call(U, `select get_my_practice_summary() r`)).r;
  ok('brews completed = 3, puzzles = 15', s.practice_brews_completed === 3 && s.total_practice_puzzles === 15);
  ok('average score exact ((100+50+65)/3 = 71.7)', Number(s.average_score) === 71.7);
  ok('best score = 100, latest = 65 (most recent brew)', s.best_score === 100 && s.latest_score === 65);
  ok('average solve time exact (15000ms per brew)', Number(s.average_solve_ms) === 15000);
  ok('statistics carry a version + summary is Practice-only (no ranked fields)',
    s.statistics_version === 1 && !('current_streak' in s) && !('global_position' in s) && !('best_streak' in s));
  const byCat = Object.fromEntries(s.categories.map((c) => [c.category, c]));
  ok('observation category avg points exact (20,10,15 → 15), plays 3', Number(byCat.observation.average_points) === 15 && byCat.observation.plays === 3 && byCat.observation.best_points === 20);
  ok('all five categories present + most-practiced is a valid category', s.categories.length === 5 && ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'].includes(s.most_practiced_category));
}

// =============================================================================
// 3. History pagination + safe fields
// =============================================================================
{
  const h = (await call(U, `select get_my_practice_history(null, 2) r`)).r;
  ok('history newest first, page size honored, has_more', h.rows.length === 2 && h.rows[0].score === 65 && h.has_more === true);
  ok('history rows carry only safe fields (no ids/answers/seed/tokens)',
    h.rows.every((r) => !('user_id' in r) && !('attempt_id' in r) && !('id' in r) && !('seed' in r) && !('token' in r) && Array.isArray(r.categories)));
  const h2 = (await call(U, `select get_my_practice_history($1::timestamptz, 5) r`, [h.next_before])).r;
  ok('history next page continues (brew 100), no dup', h2.rows[0].score === 100 && h2.rows.length === 1);
}

// =============================================================================
// 4. Ranked isolation + security
// =============================================================================
{
  // A completed RANKED attempt must NOT appear in the practice summary.
  await db.exec(`reset role;`);
  await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator)
    values ($1,'rankedinstall0001',$2,true,$3::date,'completed',88,90000,now(),'AE','Prac',100)`, [U, packId, today]);
  const s = (await call(U, `select get_my_practice_summary() r`)).r;
  ok('ranked attempts are excluded from the practice summary', s.practice_brews_completed === 3);

  // No user parameter → no cross-user injection.
  await db.exec(`reset role;`);
  ok('practice summary has no user parameter', (await q(`select count(*)::int c from information_schema.parameters where specific_name like 'get_my_practice_summary%' and parameter_name ilike '%user%'`))[0].c === 0);

  // Anonymous user gets their OWN summary (practice is allowed for anonymous).
  const AN = '22222222-2222-2222-2222-222222222222';
  await db.query(`insert into auth.users (id, is_anonymous) values ($1,true)`, [AN]);
  const anon = (await call(AN, `select get_my_practice_summary() r`, [], true)).r;
  ok('anonymous user sees their own (empty) practice summary, not locked', anon.locked === false && anon.practice_brews_completed === 0);

  // Unauthenticated (anon role) denied; direct write denied.
  await db.exec(`reset role;`); await db.exec(`set role anon;`);
  await expectFail('anon (publishable) cannot call get_my_practice_summary', () => db.query(`select get_my_practice_summary()`), 'permission denied');
  await expectFail('anon cannot call get_my_practice_history', () => db.query(`select get_my_practice_history()`), 'permission denied');
  await db.exec(`reset role;`);
  await actAs(db, U, { isAnonymous: false });
  await expectFail('a client cannot write attempts directly', () => db.query(`update attempts set final_score=1 where user_id=$1`, [U]), 'permission denied');
  await actAs(db, null);
  await db.exec(`reset role;`);
}

if (failures.length) {
  console.error(`\n${failures.length} PRACTICE SUMMARY DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} practice-summary DB checks passed — formulas, history, isolation, security`);
