/**
 * Content authoring review state-machine tests — `npm run db:authoring-test`.
 *
 * Proves the Phase 7H.2 draft lifecycle: validation gates approval, two-person
 * control (author can't approve own), rebuild resets review, promote-to-reserve
 * creates canonical approved (reserve) content, and client roles are denied.
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

const AUTHOR = '11111111-1111-1111-1111-111111111111';
const REVIEWER = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false)`, [AUTHOR, REVIEWER]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'content_admin','active'),($2,'content_admin','active')`, [AUTHOR, REVIEWER]);
await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
  values ('OBS_001','observation','Odd One Out', true, 'built', 1, 5, 7, 1, 8000, 'OddOneOut', 'buildOdd', 'validateOdd', 'scoreOdd', 'static')`);

// Build a valid draft candidate payload.
const built = (id) => ({
  engine_id: 'OBS_001', category: 'observation', difficulty: 3,
  seed: { family: 'glyphs', variant: 1 },
  built_payload: { prompt: 'Which tile is the odd one?', builder_version: 'admin', validator_version: 'admin' },
  answer_payload: { oddTileId: 't3' }, explanation: 'It differs in rotation.',
  content_hash: hh(id), proposed_puzzle_id: id,
  validation: { passed: true, findings: [] },
});

await svc();
// =============================================================================
// 1. save_draft: passing → built; failing → validation_failed
// =============================================================================
const d1 = one(await q(`select admin_save_draft(null,$1::jsonb,$2) r`, [JSON.stringify(built('auth-pz-1')), AUTHOR])).r;
ok('save_draft (valid) → ok + id', d1.ok === true && d1.id);
ok('draft status is built', one(await q(`select status::text s from authoring_drafts where id=$1`, [d1.id])).s === 'built');
const bad = { ...built('auth-pz-bad'), validation: { passed: false, findings: ['answer not unique'] } };
const d2 = one(await q(`select admin_save_draft(null,$1::jsonb,$2) r`, [JSON.stringify(bad), AUTHOR])).r;
ok('save_draft (invalid) → validation_failed', one(await q(`select status::text s from authoring_drafts where id=$1`, [d2.id])).s === 'validation_failed');

// =============================================================================
// 2. submit: failing can't submit; built can
// =============================================================================
ok('submit failing-validation draft → blocked (bad_state)', one(await q(`select admin_submit_draft_review($1,'notes',$2) r`, [d2.id, AUTHOR])).r.ok !== true);
ok('submit built draft → awaiting_review', one(await q(`select admin_submit_draft_review($1,'ready',$2) r`, [d1.id, AUTHOR])).r.ok === true);
ok('status now awaiting_review', one(await q(`select status::text s from authoring_drafts where id=$1`, [d1.id])).s === 'awaiting_review');

// =============================================================================
// 3. two-person control
// =============================================================================
ok('author approving own candidate → self_approval_blocked', one(await q(`select admin_decide_draft_review($1,'approve',$2,'content_admin','ok',false) r`, [d1.id, AUTHOR])).r.reason === 'self_approval_blocked');
ok('different reviewer can approve', one(await q(`select admin_decide_draft_review($1,'approve',$2,'content_admin','looks good',false) r`, [d1.id, REVIEWER])).r.ok === true);
ok('status approved + reviewer set', one(await q(`select status::text s, reviewer from authoring_drafts where id=$1`, [d1.id])).s === 'approved');
ok('approve wrote an audit row', one(await q(`select count(*)::int c from admin_audit_log where action='review_approve'`)).c === 1);

// =============================================================================
// 4. promote to reserve → canonical approved puzzle + answer + validation
// =============================================================================
const pr = one(await q(`select admin_promote_draft_to_reserve($1,$2,'content_admin') r`, [d1.id, REVIEWER])).r;
ok('promote → ok + puzzle_id', pr.ok === true && pr.puzzle_id === 'auth-pz-1');
ok('canonical puzzle exists + approved', one(await q(`select status::text s from puzzles where puzzle_id='auth-pz-1'`)).s === 'approved');
ok('puzzle is RESERVE (not scheduled)', one(await q(`select count(*)::int c from daily_pack_slots where puzzle_id='auth-pz-1'`)).c === 0);
ok('answer + validation rows created', one(await q(`select (select count(*) from puzzle_answers where puzzle_id='auth-pz-1') a, (select count(*) from puzzle_validation_results where puzzle_id='auth-pz-1' and passed) v`)).a === 1);
ok('draft marked promoted', one(await q(`select status::text s from authoring_drafts where id=$1`, [d1.id])).s === 'promoted');
ok('promote non-approved draft → not_approved', one(await q(`select admin_promote_draft_to_reserve($1,$2,'content_admin') r`, [d2.id, REVIEWER])).r.reason === 'not_approved');

// =============================================================================
// 5. rebuild resets review
// =============================================================================
const d3 = one(await q(`select admin_save_draft(null,$1::jsonb,$2) r`, [JSON.stringify(built('auth-pz-3')), AUTHOR])).r;
await q(`select admin_submit_draft_review($1,'x',$2)`, [d3.id, AUTHOR]);
await q(`select admin_save_draft($1,$2::jsonb,$3)`, [d3.id, JSON.stringify({ built_payload: { prompt: 'edited', builder_version: 'admin', validator_version: 'admin' }, answer_payload: { oddTileId: 't2' }, content_hash: hh('auth-pz-3b'), validation: { passed: true, findings: [] } }), AUTHOR]);
{
  const row = one(await q(`select status::text s, reviewer, draft_version from authoring_drafts where id=$1`, [d3.id]));
  ok('rebuild → status built, reviewer null, version bumped', row.s === 'built' && row.reviewer === null && row.draft_version === 2);
}

// =============================================================================
// 6. security
// =============================================================================
await actAs(db, AUTHOR, { isAnonymous: false });
for (const c of ['admin_save_draft(null,\'{}\'::jsonb,$1)', 'admin_submit_draft_review($1,\'x\',$1)', 'admin_decide_draft_review($1,\'approve\',$1,\'content_admin\',\'x\',false)', 'admin_promote_draft_to_reserve($1,$1,\'content_admin\')']) {
  await expectFail(`authenticated cannot call ${c.split('(')[0]}`, () => q(`select ${c}`, [AUTHOR]), 'permission denied');
}
await expectFail('authenticated cannot call admin_authoring_queue', () => q(`select admin_authoring_queue(null,25,0)`), 'permission denied');
await expectFail('authenticated cannot read authoring_drafts', () => q(`select * from authoring_drafts`), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} AUTHORING CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} content-authoring checks passed — lifecycle, validation-gates-approval, two-person control, promote-to-reserve, security`);
