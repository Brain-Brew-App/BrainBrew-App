/**
 * Puzzle revision + lineage + structured-diff tests — `npm run db:revisions-test`.
 *
 * Proves the Phase 7I.2D revision workflow: admin_create_revision makes a new
 * authoring draft that copies the source seed, links its parent, carries NO
 * approval/validation, and never mutates the source; lineage lists revisions;
 * client roles denied. Also exercises the pure structured-diff module.
 */

import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { freshDb, actAs } from './pglite-harness.mjs';

const hh = (s) => createHash('sha256').update(s).digest('hex');
const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, m) { try { await fn(); failures.push(`${name} — expected rejection`); } catch (e) { if (m && !new RegExp(m, 'i').test(e.message)) failures.push(`${name} — ${e.message.split('\n')[0]}`); else passed++; } }

const FOUNDER = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [FOUNDER]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'founder','active')`, [FOUNDER]);
await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
  values ('OBS_091','observation','Odd', true, 'built', 1, 5, 7, 1, 8000, 'C', 'OBS_091', 'OBS_091', 'score', 'static')`);
await db.query(`insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash) values ('s1','OBS_091',$1::jsonb,3,'human',$2)`, [JSON.stringify({ family: 'triangles', oddIndex: 7 }), hh('s1')]);
// A canonical approved puzzle (immutable) to revise.
await db.query(`insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status)
  values ('src-1','OBS_091','s1','observation',3,'Which is odd?','{}'::jsonb,'b','v',$1,'draft')`, [hh('src-1')]);
await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source) values ('src-1','v',true,'[]'::jsonb,$1,'test')`, [hh('src-1v')]);
await db.query(`insert into puzzle_answers (puzzle_id, answer_payload, explanation) values ('src-1','{}'::jsonb,'x')`);
await db.query(`update puzzles set status='approved', approved_at=now() where puzzle_id='src-1'`);

await actAs(db, null); // service role

// =============================================================================
// 1. Create revision
// =============================================================================
const rev = one(await q(`select admin_create_revision('src-1',$1,'founder') r`, [FOUNDER])).r;
ok('create_revision → ok + draft_id + new id', rev.ok === true && rev.draft_id && /^rev-/.test(rev.proposed_puzzle_id));
const d = one(await q(`select engine_id, category, difficulty, seed, parent_puzzle_id, status::text status, proposed_puzzle_id, validation from authoring_drafts where id=$1`, [rev.draft_id]));
ok('revision copies engine/category/difficulty', d.engine_id === 'OBS_091' && d.category === 'observation' && d.difficulty === 3);
ok('revision copies the canonical seed', d.seed.family === 'triangles' && d.seed.oddIndex === 7);
ok('revision links parent_puzzle_id = source', d.parent_puzzle_id === 'src-1');
ok('revision starts as draft with NO approval/validation', d.status === 'draft' && JSON.stringify(d.validation) === '{}');
ok('unknown source → source_not_found', one(await q(`select admin_create_revision('nope',$1,'founder') r`, [FOUNDER])).r.reason === 'source_not_found');

// Source puzzle is untouched.
ok('source puzzle status/hash untouched', one(await q(`select status::text s, content_hash from puzzles where puzzle_id='src-1'`)).s === 'approved');
ok('create_revision audited', one(await q(`select count(*)::int c from admin_audit_log where action='create_revision'`)).c === 1);

// =============================================================================
// 2. Lineage
// =============================================================================
const lin = one(await q(`select admin_puzzle_lineage('src-1') r`)).r;
ok('lineage lists the revision draft', Array.isArray(lin.revisions) && lin.revisions.length === 1 && lin.revisions[0].proposed_puzzle_id === rev.proposed_puzzle_id);
ok('lineage marks it not-yet-promoted', lin.revisions[0].promoted === false);

// =============================================================================
// 3. Security
// =============================================================================
await actAs(db, FOUNDER, { isAnonymous: false });
await expectFail('authenticated cannot call admin_create_revision', () => q(`select admin_create_revision('src-1',$1,'founder')`, [FOUNDER]), 'permission denied');
await expectFail('authenticated cannot call admin_puzzle_lineage', () => q(`select admin_puzzle_lineage('src-1')`), 'permission denied');
await db.exec('reset role;');

// =============================================================================
// 4. Structured diff (pure module)
// =============================================================================
const out = mkdtempSync(join(tmpdir(), 'bb-diff-'));
const res = await build({ entryPoints: [resolve(import.meta.dirname, '..', '..', 'apps/admin/lib/authoring/diff.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2020', write: false, logLevel: 'silent' });
const f = join(out, 'diff.mjs'); writeFileSync(f, res.outputFiles[0].text);
const diff = await import(pathToFileURL(f).href);
{
  const before = { difficulty: 3, prompt: 'A', options: [{ id: 'a', label: 'x' }], content_hash: 'h1' };
  const after = { difficulty: 4, prompt: 'A', options: [{ id: 'a', label: 'y' }], content_hash: 'h2', explanation: 'new' };
  const entries = diff.diffFields(before, after, diff.PUZZLE_DIFF_ORDER);
  const byField = Object.fromEntries(entries.map((e) => [e.field, e]));
  ok('diff: unchanged field (prompt) omitted', !('prompt' in byField));
  ok('diff: changed difficulty 3→4', byField.difficulty?.kind === 'changed' && byField.difficulty.before === '3' && byField.difficulty.after === '4');
  ok('diff: changed options compared meaningfully (not one-line dump)', byField.options?.kind === 'changed' && byField.options.after.includes('label: y'));
  ok('diff: added explanation', byField.explanation?.kind === 'added' && byField.explanation.before === null);
  ok('diff: content_hash change surfaced', byField.content_hash?.kind === 'changed');
  ok('diff: stable order follows PUZZLE_DIFF_ORDER', entries[0].field === 'difficulty');
}
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} REVISION/DIFF CHECK(S) FAILED:`);
  for (const f2 of failures) console.error(`  ✕ ${f2}`);
  process.exit(1);
}
console.log(`✓ ${passed} revision/diff checks passed — revision copies seed + parent-links + no-approval, source untouched, lineage, security, structured diff`);
