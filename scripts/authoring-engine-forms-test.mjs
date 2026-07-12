/**
 * Observation + Pattern authoring-form tests — `npm run test:authoring-forms`.
 *
 * Exhaustively proves the six 7H.3.2A engine schemas WITHOUT a browser:
 *   • default form serializes to a seed that canonically builds + validates clean
 *   • form↔seed round-trips are stable
 *   • unknown / missing / out-of-range fields are rejected client-side
 *   • the specified per-engine invalid mutations are caught by the canonical validator
 *   • preview adapters accept valid canonical payloads and reject malformed ones
 *
 * The schemas live in apps/admin (client+server TS); we esbuild the registry into
 * one Node-loadable ESM module (it re-uses the generated canonical bundle), the
 * same trick the boundary uses. The canonical builder/validator are the gate.
 */

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'bb-forms-'));

async function bundleToTemp(entry, name) {
  const res = await build({
    entryPoints: [resolve(ROOT, entry)],
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2020', write: false, logLevel: 'silent',
  });
  const file = join(out, name);
  writeFileSync(file, res.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

const registry = await bundleToTemp('apps/admin/lib/authoring/engines/index.ts', 'registry.mjs');
const canonical = await bundleToTemp('apps/admin/lib/authoring/canonical.generated.mjs', 'canonical.mjs');
const { FORM_REGISTRY, getFormSchema, isAuthorableEngine } = registry;
const { buildCandidate, validatePuzzle } = canonical;

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Build a valid puzzle from a schema's default form; return { schema, built }.
function buildDefault(engineId) {
  const schema = getFormSchema(engineId);
  const seed = schema.serializeFormToSeed(schema.defaultForm, `test-${engineId}-1`);
  const res = buildCandidate(engineId, seed);
  return { schema, seed, res };
}

// ── Registry sanity — all 15 active engines ──────────────────────────────────
const ALL_15 = ['OBS_001', 'OBS_003', 'OBS_004', 'PAT_001', 'PAT_002', 'PAT_003', 'LOG_001', 'LOG_002', 'LOG_003', 'LNG_001', 'LNG_002', 'LNG_003', 'ATT_001', 'ATT_002', 'ATT_003'];
ok('registry has exactly the 15 active engines', eq(Object.keys(FORM_REGISTRY).sort(), [...ALL_15].sort()));
ok('unknown engine is not authorable', isAuthorableEngine('NOPE') === false && isAuthorableEngine('ATT_099') === false);
let threw = false;
try { getFormSchema('NOPE'); } catch { threw = true; }
ok('getFormSchema throws on a non-authorable engine', threw);

// ── Cross-engine completeness (Task 19) ──────────────────────────────────────
const CATEGORY = { OBS: 'observation', PAT: 'pattern', LOG: 'logic', LNG: 'language-logic', ATT: 'attention-speed' };
const seenIds = new Set();
for (const id of ALL_15) {
  const s = getFormSchema(id);
  ok(`${id}: engineId matches key`, s.engineId === id);
  ok(`${id}: category correct`, s.category === CATEGORY[id.slice(0, 3)]);
  ok(`${id}: unique engine id`, !seenIds.has(id) && (seenIds.add(id), true));
  ok(`${id}: schemaVersion present`, typeof s.schemaVersion === 'number' && s.schemaVersion >= 1);
  ok(`${id}: has field groups`, Array.isArray(s.fieldGroups) && s.fieldGroups.length > 0);
  ok(`${id}: previewAdapter + serialize + clientValidate are functions`, typeof s.previewAdapter === 'function' && typeof s.serializeFormToSeed === 'function' && typeof s.clientValidate === 'function');
  ok(`${id}: help/a11y/small-screen notes non-empty`, s.helpText.length > 0 && s.accessibilityNotes.length > 0 && s.smallScreenNotes.length > 0 && s.approvedInputs.length > 0);
  // No engine field can set a score formula (none of the field kinds do).
  const kinds = s.fieldGroups.flatMap((g) => g.fields.map((f) => f.kind));
  ok(`${id}: no scoring/formula field kind`, kinds.every((k) => ['number', 'select', 'glyph', 'glyph-multi', 'difficulty', 'index-pair', 'matrix-rule'].includes(k)));
}

// ── Per-engine: default valid, round-trip, client checks, preview ────────────
for (const engineId of Object.keys(FORM_REGISTRY)) {
  const { schema, seed, res } = buildDefault(engineId);
  ok(`${engineId}: default form builds ok`, res.ok === true);
  if (res.ok) {
    ok(`${engineId}: default build has 0 validator findings`, res.findings.length === 0);
    // preview adapter accepts the real public payload
    let pv = null;
    try { pv = schema.previewAdapter(res.publicPayload, res.answer); } catch (e) { failures.push(`${engineId}: preview threw on valid payload — ${e.message}`); }
    ok(`${engineId}: preview adapter returns a model`, pv && typeof pv.kind === 'string');
    // preview rejects a malformed payload
    let rejected = false;
    try { schema.previewAdapter({}, undefined); } catch { rejected = true; }
    ok(`${engineId}: preview adapter rejects a malformed payload`, rejected);
    // answer overlay only when provided (secrecy): without answer, no highlight/correct flag
    const noAnswer = schema.previewAdapter(res.publicPayload, undefined);
    const leaks = JSON.stringify(noAnswer).includes('"correct":true') || JSON.stringify(noAnswer).includes('"highlight":true') || (noAnswer.kind === 'chip-repair' && noAnswer.wrongIndex !== undefined);
    ok(`${engineId}: preview without answer reveals no correct/highlight`, !leaks);
  }
  // round-trips
  ok(`${engineId}: form→seed→form round-trip stable`, eq(schema.deserializeSeedToForm(seed), schema.defaultForm));
  ok(`${engineId}: seed→form→seed round-trip stable`, eq(schema.serializeFormToSeed(schema.deserializeSeedToForm(seed), seed.id), seed));
  // client checks
  ok(`${engineId}: default form passes clientValidate`, schema.clientValidate(schema.defaultForm).ok === true);
  ok(`${engineId}: unknown field rejected`, schema.clientValidate({ ...schema.defaultForm, bogusField: 1 }).ok === false);
  ok(`${engineId}: out-of-range difficulty rejected`, schema.clientValidate({ ...schema.defaultForm, difficulty: 9 }).ok === false);
}

// ── Targeted invalid mutations (canonical validator must catch each) ─────────
// Helper: corrupt a valid built puzzle and assert the validator complains.
function mutantFindings(engineId, mutate) {
  const { res } = buildDefault(engineId);
  if (!res.ok) return ['(build failed)'];
  const p = structuredClone(res.puzzle);
  mutate(p);
  return validatePuzzle(p);
}
const flags = (engineId, label, mutate) => ok(`${engineId}: catches ${label}`, mutantFindings(engineId, mutate).length > 0);

// OBS_001
flags('OBS_001', 'two odd tiles', (p) => { const odd = p.oddTileId; const oddGlyph = p.tiles.find((t) => t.id === odd).glyph; const other = p.tiles.find((t) => t.glyph !== oddGlyph); other.glyph = oddGlyph; });
flags('OBS_001', 'no odd tile', (p) => { const oddGlyph = p.tiles.find((t) => t.id === p.oddTileId).glyph; const maj = p.tiles.find((t) => t.glyph !== oddGlyph).glyph; p.tiles.find((t) => t.id === p.oddTileId).glyph = maj; });
flags('OBS_001', 'duplicate tile ids', (p) => { p.tiles[1].id = p.tiles[0].id; });

// OBS_003
flags('OBS_003', 'wrong/mirror option marked correct', (p) => { const other = p.options.find((o) => o.id !== p.correctOptionId); p.correctOptionId = other.id; });
flags('OBS_003', 'cell-count leak', (p) => { const o = p.options.find((x) => x.id !== p.correctOptionId); let done = false; o.cells = o.cells.map((row) => { if (done || !row.includes('.')) return row; done = true; return row.replace('.', '#'); }); });
flags('OBS_003', 'symmetric target', (p) => { p.target = ['##', '##']; });
flags('OBS_003', 'disconnected target', (p) => { p.target = ['#..', '...', '..#']; });

// OBS_004
for (const [label, at] of [['same-row pair', [0, 1]], ['same-column pair', [0, 3]], ['adjacent pair', [0, 4]]]) {
  const schema = getFormSchema('OBS_004');
  const form = { ...schema.defaultForm, at0: at[0], at1: at[1] };
  const seed = schema.serializeFormToSeed(form, 'obs4-mut');
  const res = buildCandidate('OBS_004', seed);
  ok(`OBS_004: catches ${label}`, res.ok && validatePuzzle(res.puzzle).length > 0);
}
flags('OBS_004', 'second duplicate pair', (p) => { const nonPair = p.tiles.filter((t) => !p.pairTileIds.includes(t.id)); nonPair[1].glyph = nonPair[0].glyph; });

// PAT_001
flags('PAT_001', 'distractor collides with a visible term', (p) => { const d = p.options.find((o) => o.id !== p.correctOptionId); d.label = p.sequence[0]; });
flags('PAT_001', 'two options share a value', (p) => { const ds = p.options.filter((o) => o.id !== p.correctOptionId); ds[1].label = ds[0].label; });
flags('PAT_001', 'invalid sequence width (wraps)', (p) => { p.sequence = [...p.sequence, '99', '100']; });

// PAT_002
flags('PAT_002', 'wrong answer marked correct', (p) => { const other = p.options.find((o) => o.id !== p.correctOptionId); p.correctOptionId = other.id; });
flags('PAT_002', 'constant attribute (decoration)', (p) => { for (const c of p.cells) if (c) c.fill = 'solid'; });
flags('PAT_002', 'two options satisfy all rules', (p) => { const correct = p.optionFigures[p.correctOptionId]; const other = p.options.find((o) => o.id !== p.correctOptionId); p.optionFigures[other.id] = { ...correct }; });
flags('PAT_002', 'distractor differs in two attributes', (p) => { const correct = p.optionFigures[p.correctOptionId]; const other = p.options.find((o) => o.id !== p.correctOptionId); const f = p.optionFigures[other.id]; f.shape = correct.shape === 'circle' ? 'square' : 'circle'; f.count = correct.count === 3 ? 1 : correct.count + 1; f.fill = correct.fill; });

// PAT_003
flags('PAT_003', 'wrong correct-term (no valid repair)', (p) => { p.correctTerm = String(Number(p.correctTerm) + 7); });
flags('PAT_003', 'corrupted term first/last (unsupported position)', (p) => { p.wrongIndex = 0; });
flags('PAT_003', 'unsupported term count (not six)', (p) => { p.terms = p.terms.slice(0, 5); });
flags('PAT_003', 'term too wide for the chip row', (p) => { p.terms[2] = '1234'; });

// ── Logic / Language / Attention mutations (canonical validator catches each) ─
// LOG_001 Deduction — structural validator rules (correctness is guaranteed by the curated scenario).
flags('LOG_001', 'a premise missing its full stop', (p) => { p.premises[0] = p.premises[0].replace(/\.$/, ''); });
flags('LOG_001', 'an option longer than 14 words', (p) => { const o = p.options[1]; o.label = Array.from({ length: 16 }, () => 'word').join(' '); });
// LOG_002 Balance — wrong answer key, non-unique/near-miss options.
flags('LOG_002', 'correct option relabelled to a wrong ratio', (p) => { const c = p.options.find((o) => o.id === p.correctOptionId); c.label = String(Number(c.label) + 3); });
flags('LOG_002', 'the solved ratio appears twice', (p) => { const c = p.options.find((o) => o.id === p.correctOptionId); const d = p.options.find((o) => o.id !== p.correctOptionId); d.label = c.label; });
// LOG_003 Ordering — wrong correct order, duplicate item label.
flags('LOG_003', 'correctOrder is not the clues’ ordering', (p) => { p.correctOrder = [...p.correctOrder].reverse(); });
flags('LOG_003', 'duplicate item label', (p) => { p.items[1].label = p.items[0].label; });
// LNG_001 Analogy — grammar band + relation overlap.
flags('LNG_001', 'an option outside the word band (lowercase/space)', (p) => { p.options[1].label = 'two words'; });
flags('LNG_001', 'an option already in the relation', (p) => { const w = p.relation.join(' ').match(/[A-Z]{3,12}/)[0]; p.options[1].label = w; });
// LNG_002 Odd Word Out — wrong outlier keyed.
flags('LNG_002', 'correct option is not the odd word', (p) => { const other = p.options.find((o) => o.id !== p.correctOptionId); p.correctOptionId = other.id; });
flags('LNG_002', 'a word outside the band', (p) => { p.options[0].label = 'lower'; });
// LNG_003 Sentence Ordering — wrong order, duplicate fragment.
flags('LNG_003', 'correctOrder violates the constraints', (p) => { p.correctOrder = [p.constraints.closesId, ...p.correctOrder.filter((x) => x !== p.constraints.closesId)]; });
flags('LNG_003', 'duplicate fragment id', (p) => { p.fragments[1].id = p.fragments[0].id; });
// ATT_001 Symbol Sweep — misflag, all-targets, duplicate id, bad columns.
flags('ATT_001', 'misflagged target (isTarget disagrees)', (p) => { const s = p.symbols.find((x) => !x.isTarget); s.isTarget = true; });
flags('ATT_001', 'every tile a target (exploitable board)', (p) => { for (const s of p.symbols) { s.glyph = p.targetGlyph; s.isTarget = true; } });
flags('ATT_001', 'duplicate symbol ids', (p) => { p.symbols[1].id = p.symbols[0].id; });
// ATT_002 Memory Flash — targetIds mismatch, repeated board glyph.
flags('ATT_002', 'targetIds points at a non-target tile', (p) => { const nonTarget = p.board.find((t) => !p.targetIds.includes(t.id)); p.targetIds[0] = nonTarget.id; });
flags('ATT_002', 'board repeats a glyph', (p) => { const a = p.board.find((t) => !p.targetIds.includes(t.id)); const b = p.board.find((t) => t.id !== a.id && !p.targetIds.includes(t.id)); b.glyph = a.glyph; });
// ATT_003 Rapid Classification — wrong bucket, glyph outside alphabet.
flags('ATT_003', 'an item filed in the wrong bucket', (p) => { p.items[0].bucket = p.items[0].bucket === 0 ? 1 : 0; });
flags('ATT_003', 'an item glyph outside the curated alphabet', (p) => { p.items[0].glyph = 'Z'; });

// seed-level range rejects via clientValidate
ok('LOG_001: scenario out of range rejected client-side', getFormSchema('LOG_001').clientValidate({ ...getFormSchema('LOG_001').defaultForm, scenario: 9999 }).ok === false);
ok('LOG_002: template B with non-integer ratio rejected client-side', getFormSchema('LOG_002').clientValidate({ ...getFormSchema('LOG_002').defaultForm, template: 'B', p0: 3, p1: 2, p2: 2 }).ok === false);
ok('ATT_002: difficulty 1 (no exposure band) rejected client-side', getFormSchema('ATT_002').clientValidate({ ...getFormSchema('ATT_002').defaultForm, difficulty: 1 }).ok === false);
ok('ATT_003: odd item count rejected client-side', getFormSchema('ATT_003').clientValidate({ ...getFormSchema('ATT_003').defaultForm, items: 11 }).ok === false);
ok('ATT_001: distractors including target rejected client-side', (() => { const s = getFormSchema('ATT_001'); return s.clientValidate({ ...s.defaultForm, distractors: [s.defaultForm.target, ...s.defaultForm.distractors] }).ok === false; })());
ok('PAT_003: corruptIndex 0 rejected client-side', getFormSchema('PAT_003').clientValidate({ ...getFormSchema('PAT_003').defaultForm, corruptIndex: 0 }).ok === false);
ok('OBS_001: oddIndex 0 rejected client-side', getFormSchema('OBS_001').clientValidate({ ...getFormSchema('OBS_001').defaultForm, oddIndex: 0 }).ok === false);
ok('PAT_002: all-row-constant degenerate rejected client-side', getFormSchema('PAT_002').clientValidate({ ...getFormSchema('PAT_002').defaultForm, ruleShape: 'rowConstant', ruleCount: 'rowConstant', ruleFill: 'rowConstant' }).ok === false);
ok('OBS_004: pair included in others rejected client-side', (() => { const s = getFormSchema('OBS_004'); return s.clientValidate({ ...s.defaultForm, others: [s.defaultForm.pair, ...s.defaultForm.others.slice(1)] }).ok === false; })());

rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} AUTHORING-FORM CHECK(S) FAILED:`);
  for (const f of failures.slice(0, 40)) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} authoring-form checks passed — all 15 engine schemas: registry+cross-engine completeness, default valid, round-trips, client rejects, canonical mutation catches, preview adapters + answer secrecy`);
