/**
 * Content audit — `npm run audit`.
 *
 * Runs every validator across the whole library, then reports the things a
 * validator cannot: near-duplicates, distractor fatigue, weak explanations,
 * hedged wording, difficulty drift, engine usage, and whether the assembled
 * packs actually satisfy the rotation rules in Core Spec §5.
 *
 * A validator says "this puzzle is wrong". The audit says "this library is
 * getting tired". Only the first blocks publication; the second guides the next
 * authoring session (docs/CONTENT_PIPELINE.md §7).
 *
 * Exits non-zero only on validator failures or rotation violations — the rest
 * are advisory, and printed so a human can judge.
 */

import { rmSync } from 'node:fs';

import { compilePureModules } from './compile.mjs';

const { out, load } = compilePureModules();

const { ALL_PUZZLES, LIBRARY } = await load('content/library.js');
const { validateLibrary } = await load('content/validators.js');
const { PACKS } = await load('data/packs.js');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const heading = (s) => console.log(`\n${bold(s)}\n${'─'.repeat(s.length)}`);
let blocking = 0;
const advisories = [];

const CATEGORIES = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];

// =============================================================================
// 1. Validators
// =============================================================================

heading('1. Validators');

const problems = validateLibrary(ALL_PUZZLES);
const failed = Object.keys(problems);

if (failed.length === 0) {
  console.log(green(`  ✓ all ${ALL_PUZZLES.length} puzzles pass every deterministic validator`));
} else {
  blocking += failed.length;
  console.log(red(`  ✕ ${failed.length} of ${ALL_PUZZLES.length} puzzles failed`));
  for (const id of failed) console.log(`    ${id}: ${problems[id].join(' | ')}`);
}

// =============================================================================
// 2. Engine usage
// =============================================================================

heading('2. Engine usage');

const usedInPacks = new Map();
for (const pack of PACKS) for (const p of pack.puzzles) usedInPacks.set(p.engineId, (usedInPacks.get(p.engineId) ?? 0) + 1);

console.log(`  ${'engine'.padEnd(10)} ${'authored'.padStart(8)} ${'scheduled'.padStart(10)} ${'reuse'.padStart(7)}`);
for (const [engine, pool] of Object.entries(LIBRARY)) {
  const scheduled = usedInPacks.get(engine) ?? 0;
  const reuse = pool.length ? (scheduled / pool.length).toFixed(2) : '—';
  const flag = scheduled === 0 ? red('  UNUSED') : Number(reuse) > 1.01 ? yellow('  repeats') : '';
  console.log(`  ${engine.padEnd(10)} ${String(pool.length).padStart(8)} ${String(scheduled).padStart(10)} ${String(reuse).padStart(7)}${flag}`);
}

const enginesPerCategory = {};
for (const p of ALL_PUZZLES) (enginesPerCategory[p.category] ??= new Set()).add(p.engineId);

// =============================================================================
// 3. Rotation constraints (Core Spec §5)
// =============================================================================

heading('3. Rotation constraints');

/** Can a 7-day week be filled from E engines at weekly cap C, no consecutive repeat? */
function minWeeklyCap(E, days = 7) {
  const feasible = (C) => {
    const count = new Array(E).fill(0);
    const seq = [];
    const go = (d) => {
      if (d === days) return true;
      for (let e = 0; e < E; e++) {
        if (count[e] >= C || (d > 0 && seq[d - 1] === e)) continue;
        count[e]++; seq.push(e);
        if (go(d + 1)) return true;
        count[e]--; seq.pop();
      }
      return false;
    };
    return go(0);
  };
  for (let C = 1; C <= days; C++) if (feasible(C)) return C;
  return Infinity;
}

for (const [slot, category] of CATEGORIES.entries()) {
  const sequence = PACKS.map((pack) => pack.puzzles[slot].engineId);
  const engines = [...new Set(sequence)];

  let consecutive = 0;
  for (let i = 1; i < sequence.length; i++) if (sequence[i] === sequence[i - 1]) consecutive++;

  // Max appearances of any one engine in any rolling 7-pack window.
  let worstWindow = 0;
  for (let i = 0; i + 7 <= sequence.length; i++) {
    const window = sequence.slice(i, i + 7);
    for (const e of engines) worstWindow = Math.max(worstWindow, window.filter((x) => x === e).length);
  }

  // Every engine must appear within any rolling 14-pack window.
  let coverageGap = false;
  for (let i = 0; i + 14 <= sequence.length; i++) {
    const window = new Set(sequence.slice(i, i + 14));
    if (window.size < engines.length) coverageGap = true;
  }

  const cap = minWeeklyCap(engines.length);
  const okConsecutive = consecutive === 0;
  if (!okConsecutive) blocking++;

  console.log(`  ${category.padEnd(16)} engines=${engines.length}  consecutive-repeats=${okConsecutive ? green('0') : red(String(consecutive))}  worst 7-day count=${worstWindow}  14-day coverage=${coverageGap ? red('gap') : green('ok')}`);

  if (engines.length < 3) {
    advisories.push(
      `${category}: only ${engines.length} engines. Alternating avoids consecutive repeats, but a 7-day week needs weekly_cap ≥ ${cap} (catalog target is 2, floor is 3 engines).`,
    );
  }
}

// =============================================================================
// 4. Difficulty distribution
// =============================================================================

heading('4. Difficulty distribution');

const histogram = [0, 0, 0, 0, 0, 0];
for (const p of ALL_PUZZLES) histogram[p.difficulty]++;
const total = ALL_PUZZLES.length;

for (let d = 1; d <= 5; d++) {
  const n = histogram[d];
  const pct = Math.round((n / total) * 100);
  console.log(`  ${d}  ${String(n).padStart(3)}  ${'█'.repeat(Math.round(pct / 2))} ${pct}%`);
}

const mean = ALL_PUZZLES.reduce((t, p) => t + p.difficulty, 0) / total;
console.log(`\n  mean difficulty ${mean.toFixed(2)}`);

// Core Spec §7 target per pack: 1 easy, 2 medium, 1 hard, 1 speed-based.
let offTarget = 0;
for (const pack of PACKS) {
  const nonSpeed = pack.puzzles.filter((p) => p.category !== 'attention-speed');
  const easy = nonSpeed.filter((p) => p.difficulty <= 2).length;
  const hard = nonSpeed.filter((p) => p.difficulty >= 4).length;
  if (easy === 0 || hard === 0) offTarget++;
}
console.log(`  packs missing an easy or a hard puzzle: ${offTarget} of ${PACKS.length}`);
if (offTarget > 0) {
  advisories.push(
    `${offTarget} of ${PACKS.length} packs lack a clear easy or hard non-speed puzzle (§7 targets 1 easy, 2 medium, 1 hard, 1 speed). ` +
      `Cause: the scheduler is greedy — by the late packs an engine's remaining pool holds only mid-difficulty puzzles. ` +
      `A lookahead assignment, or simply more easy/hard content per engine, would close it.`,
  );
}

const packLabels = {};
for (const pack of PACKS) packLabels[pack.difficulty] = (packLabels[pack.difficulty] ?? 0) + 1;
console.log(`  pack labels: ${Object.entries(packLabels).map(([k, v]) => `${k}=${v}`).join('  ')}`);

// =============================================================================
// 5. Duplicate concepts and near-duplicates
// =============================================================================

heading('5. Duplicate concepts');

/**
 * What the player actually sees. Two equal keys mean the same puzzle shipped
 * twice — not merely the same parameters, which for a sweep or a classification
 * run still yields a different board.
 */
function conceptKey(p) {
  switch (p.engineId) {
    case 'OBS_001': return `oddone:${p.tiles.map((t) => t.glyph).join('')}`;
    case 'OBS_003': return `rot:${p.target.join('')}:${p.options.map((o) => o.cells.join('')).join('|')}`;
    case 'OBS_004': return `pair:${p.tiles.map((t) => t.glyph).join('')}`;
    case 'PAT_001': return `seq:${p.sequence.join(',')}`;
    case 'PAT_002': return `matrix:${p.rules.shape}/${p.rules.count}/${p.rules.fill}`;
    case 'LOG_001': return `ded:${p.premises.join(' ')}`;
    case 'LOG_002': return `bal:${p.scales.map((s) => `${s.left.join('')}=${s.right.join('')}`).join(';')}`;
    case 'LNG_001': return `ana:${p.relation.join('|')}`;
    case 'LNG_002': return `odd:${p.options.map((o) => o.label).sort().join(',')}`;
    case 'ATT_001': return `sweep:${p.targetGlyph}:${p.symbols.map((s) => s.glyph).join('')}`;
    case 'ATT_003': return `class:${p.rule}:${p.items.map((i) => i.glyph).join('')}`;
    default: return p.id;
  }
}

/** A second, coarser view: same *parameters* is a weaker smell, worth reporting. */
function parameterKey(p) {
  switch (p.engineId) {
    case 'ATT_001': return `sweep:${p.targetGlyph}:${p.symbols.length}`;
    case 'ATT_003': return ;
    case 'PAT_003': return ;
    case 'LOG_003': return ;
    case 'LNG_003': return ;
    case 'ATT_002': return ;
    case 'OBS_001': return `oddone:${[...new Set(p.tiles.map((t) => t.glyph))].sort().join('')}`;
    default: return null;
  }
}

const byConcept = new Map();
for (const p of ALL_PUZZLES) {
  const k = conceptKey(p);
  if (!byConcept.has(k)) byConcept.set(k, []);
  byConcept.get(k).push(p.id);
}
const dupes = [...byConcept.entries()].filter(([, ids]) => ids.length > 1);

if (dupes.length === 0) console.log(green('  ✓ no two puzzles present the same board, sequence or scenario'));
else {
  blocking += dupes.length;
  console.log(red(`  ✕ ${dupes.length} concepts appear more than once:`));
  for (const [k, ids] of dupes.slice(0, 12)) console.log(`    ${dim(k.slice(0, 60))} → ${ids.join(', ')}`);
}

// Same parameters, different board. Weaker signal, but it is how a library gets stale.
const byParam = new Map();
for (const p of ALL_PUZZLES) {
  const k = parameterKey(p);
  if (!k) continue;
  if (!byParam.has(k)) byParam.set(k, []);
  byParam.get(k).push(p.id);
}
const paramDupes = [...byParam.entries()].filter(([, ids]) => ids.length > 1);
if (paramDupes.length) {
  console.log(yellow(`  ⚠ ${paramDupes.length} parameter signatures repeat (different board, same shape of task):`));
  for (const [k, ids] of paramDupes.slice(0, 6)) console.log(`    ${dim(k.padEnd(24))} → ${ids.join(', ')}`);
  advisories.push(`${paramDupes.length} parameter signatures repeat — same target and size, different layout.`);
}

// Shape/glyph-family reuse inside Odd One Out.
const familyUse = new Map();
for (const p of LIBRARY.OBS_001) {
  const glyphs = [...new Set(p.tiles.map((t) => t.glyph))].sort().join('');
  familyUse.set(glyphs, (familyUse.get(glyphs) ?? 0) + 1);
}
const heavy = [...familyUse.entries()].filter(([, n]) => n > 1);
if (heavy.length) console.log(dim(`  glyph pairs used more than once: ${heavy.map(([g, n]) => `${g}×${n}`).join('  ')}`));

// =============================================================================
// 6. Repeated distractors
// =============================================================================

heading('6. Repeated distractors');

/**
 * Only prose distractors matter here. A numeric near-miss ("5") and a figure
 * description ("1 diamond, outline") repeat by arithmetic necessity — there are
 * only so many small integers and so many shape/count/fill combinations. A
 * repeated *sentence* is content fatigue.
 */
const PROSE_ENGINES = ['LOG_001', 'LNG_001', 'LNG_002'];
const distractorUse = new Map();

for (const p of ALL_PUZZLES) {
  if (!PROSE_ENGINES.includes(p.engineId)) continue;
  for (const o of p.options) {
    if (o.id === p.correctOptionId) continue;
    const key = `${p.engineId}:${o.label}`;
    if (!distractorUse.has(key)) distractorUse.set(key, []);
    distractorUse.get(key).push(p.id);
  }
}

const overused = [...distractorUse.entries()].filter(([, ids]) => ids.length >= 3).sort((a, b) => b[1].length - a[1].length);

if (overused.length === 0) console.log(green(`  ✓ no prose distractor is reused three or more times (checked ${PROSE_ENGINES.join(', ')})`));
else {
  console.log(yellow(`  ⚠ ${overused.length} prose distractors reused ≥3 times within one engine:`));
  for (const [key, ids] of overused.slice(0, 10)) console.log(`    ${dim(key.slice(0, 44).padEnd(46))} ×${ids.length}  (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? '…' : ''})`);
  advisories.push(`${overused.length} prose distractors are reused three or more times.`);
}

console.log(dim('  (numeric and figure options are excluded: small integers and shape/count/fill combinations must repeat)'));

// =============================================================================
// 7. Explanation quality
// =============================================================================

heading('7. Explanation quality');

const HEDGES = /\b(maybe|perhaps|probably|usually|often|might|could be|seems|generally)\b/i;
/** A real explanation names a mechanism, a quantity, or a relation. */
const EXPLAINS = /\b(because|so|since|only|each|every|same|rule|turn|shortage|opposite|part|follows|sum|square|double|divid|times|substitut|balance|accuracy|appears|shaded|point|mirror|latin|adds?)\b|\d/i;

const tooShort = [];
const unexplained = [];
const hedged = [];
const templated = new Map();

for (const p of ALL_PUZZLES) {
  const e = p.explanation.trim();
  const words = e.split(/\s+/).length;

  if (words < 8) tooShort.push(`${p.id}: only ${words} words`);
  if (!EXPLAINS.test(e)) unexplained.push(`${p.id}: names no mechanism, quantity or relation`);
  if (HEDGES.test(e)) hedged.push(`${p.id}: hedged wording`);

  templated.set(e, (templated.get(e) ?? 0) + 1);
}

const identical = [...templated.entries()].filter(([, n]) => n > 1);

console.log(`  too short (<8 words) : ${tooShort.length ? red(String(tooShort.length)) : green('0')}`);
for (const w of tooShort.slice(0, 8)) console.log(`    ${w}`);
console.log(`  states no mechanism  : ${unexplained.length ? yellow(String(unexplained.length)) : green('0')}`);
for (const w of unexplained.slice(0, 8)) console.log(`    ${w}`);
console.log(`  hedged wording       : ${hedged.length ? yellow(String(hedged.length)) : green('0')}`);
for (const h of hedged.slice(0, 5)) console.log(`    ${h}`);
console.log(`  identical text       : ${identical.length ? yellow(String(identical.length)) : green('0')} strings reused`);
for (const [text, n] of identical.slice(0, 6)) console.log(`    ×${n}  ${dim(text.slice(0, 70))}…`);

// Only a genuinely empty explanation blocks; the rest guide the next session.
blocking += tooShort.length;
if (unexplained.length) advisories.push(`${unexplained.length} explanations name no mechanism, quantity or relation.`);
if (identical.length) advisories.push(`${identical.length} explanation strings are shared by more than one puzzle. Expected for the timed engines, where the lesson genuinely is identical; a smell anywhere else.`);

// =============================================================================
// 8. Ambiguous wording
// =============================================================================

heading('8. Ambiguous wording');

const AMBIGUOUS_PROMPT = /\b(best|most likely|could|probably|approximately)\b/i;
const ambiguous = [];

for (const p of ALL_PUZZLES) {
  if (AMBIGUOUS_PROMPT.test(p.prompt)) ambiguous.push(`${p.id}: prompt hedges ("${p.prompt}")`);
  if ('options' in p && p.options.length && 'label' in p.options[0]) {
    for (const o of p.options) if (AMBIGUOUS_PROMPT.test(o.label)) ambiguous.push(`${p.id}: option hedges ("${o.label}")`);
  }
  // "Must be true" questions may never use a hedged conclusion.
  if (p.engineId === 'LOG_001' && p.options.some((o) => /\bsome\b/i.test(o.label) && !/at least one/i.test(o.label))) {
    ambiguous.push(`${p.id}: an option uses bare "some", which readers parse inconsistently`);
  }
}

if (ambiguous.length === 0) console.log(green('  ✓ no hedged prompts or options'));
else {
  console.log(yellow(`  ⚠ ${ambiguous.length} findings:`));
  for (const a of ambiguous.slice(0, 10)) console.log(`    ${a}`);
}

// =============================================================================
// 9. Similar puzzles inside a single pack
// =============================================================================

heading('9. Within-pack similarity');

let sameEngineTwice = 0;
for (const pack of PACKS) {
  const engines = pack.puzzles.map((p) => p.engineId);
  if (new Set(engines).size !== engines.length) sameEngineTwice++;
}
console.log(`  packs using one engine twice: ${sameEngineTwice === 0 ? green('0') : red(String(sameEngineTwice))}`);
if (sameEngineTwice) blocking += sameEngineTwice;

const packEngineMixes = new Set(PACKS.map((p) => p.puzzles.map((x) => x.engineId).join('+')));
console.log(`  distinct engine tuples across ${PACKS.length} packs: ${packEngineMixes.size}`);
// With three engines per category on a fixed cycle, the five-engine tuple has
// period 3 — three tuples is the arithmetic result, not a scheduling flaw. It is
// invisible to a once-daily player, who sees a different engine per category
// each day. Flag only if a category dropped below three engines.
const thinCategory = [...CATEGORIES].some((c) => (enginesPerCategory[c]?.size ?? 0) < 3);
if (packEngineMixes.size < 3 || thinCategory) {
  advisories.push(`Only ${packEngineMixes.size} engine tuples and a category with <3 engines — day-to-day variety is genuinely thin.`);
}

// =============================================================================

heading('Summary');

console.log(`  puzzles      ${ALL_PUZZLES.length}`);
console.log(`  packs        ${PACKS.length}`);
console.log(`  engines      ${Object.keys(LIBRARY).length}`);
console.log(`  blocking     ${blocking === 0 ? green('0') : red(String(blocking))}`);
console.log(`  advisories   ${advisories.length}`);

if (advisories.length) {
  console.log('');
  for (const a of advisories) console.log(`  ${yellow('•')} ${a}`);
}

rmSync(out, { recursive: true, force: true });
console.log('');
process.exit(blocking === 0 ? 0 : 1);
