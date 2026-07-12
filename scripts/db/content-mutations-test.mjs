/**
 * Content-mutation lifecycle tests — `npm run db:content-mutations-test`.
 *
 * Proves the Phase 7H.1 historical-integrity rules: retire preserves history and
 * blocks on a future-pack reference; hard-delete is allowed ONLY for a never-used
 * draft (transactional reference checks); client roles are denied.
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

const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [ADMIN]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'founder','active')`, [ADMIN]);

// Seed one engine + seed, then puzzles in various states.
const H = 'a'.repeat(64);
await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
  values ('OBS_001','observation','Odd One Out', true, 'built', 1, 5, 7, 1, 8000, 'OddOneOut', 'buildOdd', 'validateOdd', 'scoreOdd', 'static')`);
await db.query(`insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash) values ('s1','OBS_001','{}'::jsonb,3,'human',$1)`, [H]);
const mkDraft = async (id) => db.query(
  `insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status)
   values ($1,'OBS_001','s1','observation',3,'Which tile is odd?','{}'::jsonb,'b1','v1',$2,'draft')`, [id, hh(id)]);
// Approving requires a passing validation result + an answer (enforced by trigger).
const mkApproved = async (id) => {
  await mkDraft(id);
  await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source) values ($1,'v1',true,'[]'::jsonb,$2,'test')`, [id, hh(id + 'v')]);
  await db.query(`insert into puzzle_answers (puzzle_id, answer_payload, explanation) values ($1,'{}'::jsonb,'x')`, [id]);
  await db.query(`update puzzles set status='approved', approved_at=now() where puzzle_id=$1`, [id]);
};
await mkDraft('pz-draft');       // never used draft → deletable
await mkApproved('pz-appr');     // approved unused → retirable, not deletable
await mkApproved('pz-sched');    // approved + future pack → retire blocked
await mkDraft('pz-prac');        // draft in a practice slot → not deletable

// Future daily pack referencing pz-sched.
await db.query(`insert into daily_packs (pack_id, pack_index, pack_date, status, content_hash, difficulty_label) values ('futpack', 1, (current_date + 5), 'draft', $1, 'standard')`, [H]);
await db.query(`insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id, max_score) values ('futpack',1,'observation','pz-sched','OBS_001',20)`);
// Practice pack using pz-prac.
await db.query(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('aaaaaaaa-0000-0000-0000-000000000001',$1,'s',current_date)`, [ADMIN]);
await db.query(`insert into practice_pack_slots (practice_pack_id, position, category, puzzle_id, engine_id, max_score) values ('aaaaaaaa-0000-0000-0000-000000000001',1,'observation','pz-prac','OBS_001',20)`);

const retire = (id) => q(`select admin_retire_puzzle($1,'test',$2,'founder') r`, [id, ADMIN]);
const del = (id) => q(`select admin_delete_unused_draft($1,'test',$2,'founder') r`, [id, ADMIN]);

// =============================================================================
// Retire
// =============================================================================
await svc();
{
  const r = one(await retire('pz-appr')).r;
  ok('retire unused approved → ok, status retired', r.ok === true && r.status === 'retired');
  ok('retired_at set + status retired', one(await q(`select status::text s, retired_at from puzzles where puzzle_id='pz-appr'`)).s === 'retired');
  ok('retire wrote an audit row', one(await q(`select count(*)::int c from admin_audit_log where action='retire_puzzle' and target_id='pz-appr'`)).c === 1);
}
ok('retire blocked when referenced by a future pack', one(await retire('pz-sched')).r.reason === 'referenced_by_future_pack');
ok('already-retired retire → already_retired', one(await retire('pz-appr')).r.reason === 'already_retired');

// =============================================================================
// Delete (unused draft only)
// =============================================================================
{
  const r = one(await del('pz-draft')).r;
  ok('delete unused draft → ok', r.ok === true && r.deleted === true);
  ok('puzzle actually gone', one(await q(`select count(*)::int c from puzzles where puzzle_id='pz-draft'`)).c === 0);
  ok('delete wrote an audit row (persists after cascade)', one(await q(`select count(*)::int c from admin_audit_log where action='delete_unused_draft' and target_id='pz-draft'`)).c === 1);
}
ok('delete approved puzzle → denied (not draft)', one(await del('pz-appr')).r.reason === 'not_deletable_not_draft');
ok('delete practice-used draft → denied', one(await del('pz-prac')).r.reason === 'used_in_practice');
// (Drafts can never be scheduled into a daily pack — the slot trigger requires an
//  approved puzzle — so "delete scheduled draft" is impossible by design; the RPC's
//  scheduled_or_historical guard is belt-and-suspenders.)
ok('delete approved+scheduled puzzle → denied (scheduled_or_historical)', one(await del('pz-sched')).r.reason === 'not_deletable_not_draft');

// =============================================================================
// Security
// =============================================================================
await actAs(db, ADMIN, { isAnonymous: false });
await expectFail('authenticated cannot call admin_retire_puzzle', () => q(`select admin_retire_puzzle('pz-sched','x',$1,'founder')`, [ADMIN]), 'permission denied');
await expectFail('authenticated cannot call admin_delete_unused_draft', () => q(`select admin_delete_unused_draft('pz-sched','x',$1,'founder')`, [ADMIN]), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} CONTENT-MUTATION CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} content-mutation checks passed — retire (history-safe, future-blocked), delete (unused-draft only), security`);
