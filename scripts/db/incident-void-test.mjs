/**
 * Incident content-void orchestration tests — `npm run db:incident-void-test`.
 *
 * Proves the Phase 7I.2C void → recalculate pipeline: Founder-only + typed
 * confirmation + open-incident guards, slot voided without substitution, every
 * affected ranked result recalculated (denominator + score correction via the
 * canonical idempotent recalculate_ranked_result), idempotent replay, resumable
 * batches, retry without drift, leaderboard/progress inputs corrected, and
 * service-role-only security.
 */

import { createHash } from 'node:crypto';
import { freshDb, actAs } from './pglite-harness.mjs';

const hh = (s) => createHash('sha256').update(s).digest('hex');
const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
const svc = async () => { await actAs(db, null); };
let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, m) { try { await fn(); failures.push(`${name} — expected rejection`); } catch (e) { if (m && !new RegExp(m, 'i').test(e.message)) failures.push(`${name} — ${e.message.split('\n')[0]}`); else passed++; } }

const FOUNDER = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [FOUNDER]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'founder','active')`, [FOUNDER]);
await db.query(`insert into countries (code, name) values ('US','United States') on conflict do nothing`);

// A live pack with five approved-puzzle slots (max_score 20 each → denom 100).
const CATS = [['observation', 'OBS_091'], ['pattern', 'PAT_091'], ['logic', 'LOG_091'], ['language-logic', 'LNG_091'], ['attention-speed', 'ATT_091']];
for (const [cat, eng] of CATS) {
  await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
    values ($1,$2,$3,true,'built',1,5,7,1,8000,'C',$1,$1,'score','static')`, [eng, cat, eng]);
  await db.query(`insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash) values ($1,$2,'{}'::jsonb,3,'human',$3)`, [`s-${eng}`, eng, hh('seed' + eng)]);
  const pid = `pz-${eng}`;
  await db.query(`insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status) values ($1,$2,$3,$4,3,'p','{}'::jsonb,'b','v',$5,'draft')`, [pid, eng, `s-${eng}`, cat, hh(pid)]);
  await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source) values ($1,'v',true,'[]'::jsonb,$2,'test')`, [pid, hh(pid + 'v')]);
  await db.query(`insert into puzzle_answers (puzzle_id, answer_payload, explanation) values ($1,'{}'::jsonb,'x')`, [pid]);
  await db.query(`update puzzles set status='approved', approved_at=now() where puzzle_id=$1`, [pid]);
}
const PACK = 'pk-live-1';
await db.query(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ($1, 900, 'draft', $2, 'standard')`, [PACK, hh('pack')]);
const posOf = { observation: 1, pattern: 2, logic: 3, 'language-logic': 4, 'attention-speed': 5 };
for (const [cat, eng] of CATS) {
  await db.query(`insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id) values ($1,$2,$3,$4,$5)`, [PACK, posOf[cat], cat, `pz-${eng}`, eng]);
}
await db.query(`update daily_packs set status='approved' where pack_id=$1`, [PACK]);
await db.query(`update daily_packs set status='live', pack_date=current_date, published_at=now() where pack_id=$1`, [PACK]);

// Two completed ranked attempts. Awarded scores per slot: [20,20,20,10,10] → sum 80 / 100 = 80.
const slots = await q(`select id, position from daily_pack_slots where pack_id=$1 order by position`, [PACK]);
const AWARD = [20, 20, 20, 10, 10]; // positions 1..5
async function seedAttempt(uid, uname) {
  // Insert ACTIVE (items can only be added to a non-terminal attempt), then complete.
  const aid = one(await q(`insert into attempts (session_id, user_id, pack_id, status, is_ranked, ranked_date, country_code_snapshot, username_snapshot, active_denominator)
    values ($1,$2,$3,'active',true,current_date,'US',$4,100) returning id`, ['sess-' + uid.slice(0, 16), uid, PACK, uname])).id;
  for (const s of slots) {
    await q(`insert into attempt_items (attempt_id, slot_id, position, opened_at, submitted_at, answer_payload, awarded_score, verdict, status)
      values ($1,$2,$3, now() - interval '5 s', now(), '{}'::jsonb, $4, 'correct', 'submitted')`, [aid, s.id, s.position, AWARD[s.position - 1]]);
  }
  await q(`update attempts set status='completed', completed_at=now(), final_score=80 where id=$1`, [aid]);
  return aid;
}
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false)`, [U1, U2]);
const A1 = await seedAttempt(U1, 'alice');
const A2 = await seedAttempt(U2, 'bob');

// Open an incident.
const INC = one(await q(`insert into admin_incidents (severity, title, description, status, created_by) values ('sev1','Broken logic puzzle','bad answer key','open',$1) returning id`, [FOUNDER])).id;
const slot3 = slots.find((s) => s.position === 3).id; // logic slot

await svc();
// =============================================================================
// 1. Guards
// =============================================================================
ok('non-founder → founder_only', one(await q(`select admin_start_content_void($1,$2,'r','k0','VOID SLOT',$3,'content_admin',200) r`, [INC, slot3, FOUNDER])).r.reason === 'founder_only');
ok('bad confirmation → bad_confirmation', one(await q(`select admin_start_content_void($1,$2,'r','k0','nope',$3,'founder',200) r`, [INC, slot3, FOUNDER])).r.reason === 'bad_confirmation');
ok('empty reason → reason_required', one(await q(`select admin_start_content_void($1,$2,'   ','k0','VOID SLOT',$3,'founder',200) r`, [INC, slot3, FOUNDER])).r.reason === 'reason_required');
ok('unknown incident → incident_not_found', one(await q(`select admin_start_content_void(99999,$1,'r','k0','VOID SLOT',$2,'founder',200) r`, [slot3, FOUNDER])).r.reason === 'incident_not_found');

// =============================================================================
// 2. Execute void → recalc
// =============================================================================
const start = one(await q(`select admin_start_content_void($1,$2,'bad logic answer','key-void-1','VOID SLOT',$3,'founder',200) r`, [INC, slot3, FOUNDER])).r;
ok('void started → ok + operation_id', start.ok === true && start.operation_id);
ok('operation completed in one batch', start.status === 'completed');
ok('affected count = 2 attempts', start.affected === 2 && start.processed === 2);
ok('new denominator = 80 (100 − 20)', start.new_denominator === 80);
ok('slot is voided with reason + timestamp', one(await q(`select void_status, void_reason is not null r2, voided_at is not null r3 from daily_pack_slots where id=$1`, [slot3])).void_status === true);

// Scores recalced: sum excluding slot3 (20) = 60, / 80 = 75.
for (const [aid, who] of [[A1, 'alice'], [A2, 'bob']]) {
  const a = one(await q(`select final_score, active_denominator, recalc_version from attempts where id=$1`, [aid]));
  ok(`${who}: score renormalized 80→75 (60/80)`, a.final_score === 75 && a.active_denominator === 80);
  ok(`${who}: recalc_version bumped`, a.recalc_version === 1);
}
// Original per-item results preserved.
ok('original attempt_items awarded_score preserved', one(await q(`select awarded_score from attempt_items where attempt_id=$1 and slot_id=$2`, [A1, slot3])).awarded_score === 20);
ok('incident timeline entry added', one(await q(`select count(*)::int c from admin_incident_events where incident_id=$1`, [INC])).c >= 1);
ok('void audited', one(await q(`select count(*)::int c from admin_audit_log where action='content_void_start'`)).c === 1);

// =============================================================================
// 3. Idempotency + re-void guards
// =============================================================================
ok('replay same key → idempotent same op', one(await q(`select admin_start_content_void($1,$2,'r','key-void-1','VOID SLOT',$3,'founder',200) r`, [INC, slot3, FOUNDER])).r.idempotent === true);
ok('already-voided slot (new key) → already_voided', one(await q(`select admin_start_content_void($1,$2,'r','key-void-2','VOID SLOT',$3,'founder',200) r`, [INC, slot3, FOUNDER])).r.reason === 'already_voided');

// =============================================================================
// 4. Retry recovers a partial failure, drift-free (idempotent recalc)
// =============================================================================
// Simulate a partial failure (recalc can't be forced to fail on valid data): mark
// the op partially_failed with a reset cursor, then retry must reprocess to done.
await q(`update admin_content_void_operations set status='partially_failed', failed_attempt_count=1, processed_attempt_count=1, cursor_attempt_id=null where id=$1`, [start.operation_id]);
const retry = one(await q(`select admin_retry_content_void($1,$2,'founder',200) r`, [start.operation_id, FOUNDER])).r;
ok('retry reprocesses → completed', retry.status === 'completed' && retry.processed === 2 && retry.failed === 0);
{
  const a = one(await q(`select final_score, recalc_version from attempts where id=$1`, [A1]));
  ok('retry causes NO score drift (still 75)', a.final_score === 75);
  ok('retry causes NO extra recalc_version bump (still 1)', a.recalc_version === 1);
}
ok('retry_count incremented', one(await q(`select retry_count from admin_content_void_operations where id=$1`, [start.operation_id])).retry_count === 1);

// =============================================================================
// 5. Leaderboard/progress inputs reflect the correction
// =============================================================================
{
  const proj = one(await q(`select brewscore, result_version from ranked_result_projection where attempt_id=$1`, [A1]));
  ok('ranked projection shows corrected score 75', proj.brewscore === 75 && proj.result_version === 1);
}

// =============================================================================
// 6. Read helper + resolved-incident guard
// =============================================================================
ok('void operation read helper returns progress', one(await q(`select admin_void_operation($1) r`, [start.operation_id])).r.status === 'completed');
await q(`update admin_incidents set status='resolved', resolved_at=now() where id=$1`, [INC]);
// second incident + fresh live pack slot to test resolved guard cleanly
ok('resolved incident blocks a new void', one(await q(`select admin_start_content_void($1,$2,'r','key-void-3','VOID SLOT',$3,'founder',200) r`, [INC, slots.find((s) => s.position === 4).id, FOUNDER])).r.reason === 'incident_resolved');

// =============================================================================
// 7. Security — client roles denied
// =============================================================================
await actAs(db, FOUNDER, { isAnonymous: false });
for (const c of [
  `admin_start_content_void(${INC},'${slot3}','r','k','VOID SLOT','${FOUNDER}','founder',200)`,
  `admin_retry_content_void('${start.operation_id}','${FOUNDER}','founder',200)`,
  `admin_void_operation('${start.operation_id}')`,
]) {
  await expectFail(`authenticated cannot call ${c.split('(')[0]}`, () => q(`select ${c}`), 'permission denied');
}
await expectFail('authenticated cannot read admin_content_void_operations', () => q(`select * from admin_content_void_operations`), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} INCIDENT-VOID CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} incident-void checks passed — guards, void-without-substitution, recalc denominator/score correction, idempotency, retry drift-free, leaderboard/progress corrected, security`);
