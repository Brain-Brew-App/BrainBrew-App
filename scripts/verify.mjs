/**
 * BrainBrew test suite — `npm test`.
 *
 * Compiles the pure, platform-free modules with the project's own TypeScript,
 * then exercises them in plain Node. No test framework, no new dependencies: the
 * things worth testing here are deterministic functions and authored data, not
 * React components.
 *
 * What it guards:
 *   - scoring maths (accuracy, speed bonus, clamping, partial-credit engines)
 *   - deterministic date → pack selection, and replay stability
 *   - the dev pack override being inert outside a dev build
 *   - every authored puzzle passing its engine's deterministic validator
 *   - the assembled packs: shape, rotation, and one-use-per-puzzle
 *   - the background colour token feeding all four surfaces
 *
 * Content *quality* — near-duplicates, distractor fatigue, difficulty drift — is
 * reported by `npm run audit`, which does not gate the build.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compilePureModules } from './compile.mjs';
import { renderWebShell } from './sync-web-shell.mjs';

const { out: OUT, load, ROOT } = compilePureModules();

let passed = 0;
const failures = [];

function ok(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${name}\n     got:  ${a}\n     want: ${e}`);
}

function okThrows(name, fn) {
  try {
    fn();
    failures.push(`${name}\n     expected a throw, got none`);
  } catch {
    passed++;
  }
}

const { scorePuzzle, computeBrewScore, brewScoreCaption, correctIdOf, MAX_BREW_SCORE } =
  await load('scoring/brewScore.js');
const { PACK_COUNT, getDailyPack, getPackByIndex, resolveDailyPack, selectPackIndexForDate, utcDayNumber, utcDateIso } =
  await load('data/dailyPack.js');
const { PACKS } = await load('data/packs.js');
const { ALL_PUZZLES, LIBRARY } = await load('content/library.js');
const { validateLibrary, validatePuzzle } = await load('content/validators.js');

const CATEGORY_ORDER = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];
const ENGINE_CATEGORY = {
  OBS_001: 'observation', OBS_003: 'observation', OBS_004: 'observation',
  PAT_001: 'pattern', PAT_002: 'pattern', PAT_003: 'pattern',
  LOG_001: 'logic', LOG_002: 'logic', LOG_003: 'logic',
  LNG_001: 'language-logic', LNG_002: 'language-logic', LNG_003: 'language-logic',
  ATT_001: 'attention-speed', ATT_002: 'attention-speed', ATT_003: 'attention-speed',
};

// =============================================================================
// Shared helpers
// =============================================================================

/** A flawless answer for any puzzle, whatever its engine. */
function perfectAnswer(puzzle, elapsedMs = 0) {
  switch (puzzle.engineId) {
    case 'OBS_001': return { kind: 'choice', selectedId: puzzle.oddTileId, elapsedMs };
    case 'PAT_003': return { kind: 'choice', selectedId: `term-${puzzle.wrongIndex}`, elapsedMs };
    case 'OBS_004': return { kind: 'sequence', selectedIds: [...puzzle.pairTileIds], elapsedMs };
    case 'LOG_003':
    case 'LNG_003': return { kind: 'sequence', selectedIds: [...puzzle.correctOrder], elapsedMs };
    case 'ATT_002': return { kind: 'sequence', selectedIds: [...puzzle.targetIds], elapsedMs };
    case 'ATT_001': {
      const t = puzzle.symbols.filter((s) => s.isTarget).length;
      return { kind: 'sweep', hits: t, falsePositives: 0, totalTargets: t, elapsedMs };
    }
    case 'ATT_003': {
      const n = puzzle.items.length;
      return { kind: 'classify', correct: n, attempted: n, total: n, elapsedMs };
    }
    default: return { kind: 'choice', selectedId: puzzle.correctOptionId, elapsedMs };
  }
}
const perfectAnswers = (pack) => pack.puzzles.map((p) => perfectAnswer(p));

// =============================================================================
// Content: every puzzle passes its own engine's validator
// =============================================================================

ok('326 puzzles authored (314 scheduled-pool + 12 Observation reserve)', ALL_PUZZLES.length, 326);
ok('fifteen engines in the library', Object.keys(LIBRARY).length, 15);

const problems = validateLibrary(ALL_PUZZLES);
ok('every authored puzzle passes its deterministic validator', Object.entries(problems).map(([id, p]) => `${id}: ${p.join('; ')}`), []);

// The validators must be able to reject. A validator that cannot go red is
// decoration. One adversarial mutation per engine that carries real risk.
const brokenSweep = structuredClone(LIBRARY.ATT_001[0]);
brokenSweep.symbols[0].isTarget = !brokenSweep.symbols[0].isTarget;
ok('the sweep validator rejects a mis-flagged target', validatePuzzle(brokenSweep).length > 0, true);

const brokenMatrix = structuredClone(LIBRARY.PAT_002[0]);
brokenMatrix.correctOptionId = brokenMatrix.options.find((o) => o.id !== brokenMatrix.correctOptionId).id;
ok('the matrix validator rejects a wrong answer key', validatePuzzle(brokenMatrix).length > 0, true);

const brokenWords = structuredClone(LIBRARY.LNG_002[0]);
brokenWords.membership[brokenWords.options[0].label] = ['tool', 'fastener'];
ok('the odd-word validator rejects an ambiguous set', validatePuzzle(brokenWords).length > 0, true);

const brokenBalance = structuredClone(LIBRARY.LOG_002[0]);
brokenBalance.scales[0].right.push(brokenBalance.scales[0].right[0]);
ok('the balance validator rejects an unbalanced scale', validatePuzzle(brokenBalance).length > 0, true);

// PAT_003: a corruption that leaves a *second* repairable position is ambiguous.
// Setting term 1 to a value that also fits an arithmetic reading of terms 1-5.
const brokenRepair = structuredClone(LIBRARY.PAT_003[0]);
brokenRepair.wrongIndex = 0; // first term can be "repaired" by shortening
ok('the sequence-repair validator rejects a first-term corruption', validatePuzzle(brokenRepair).length > 0, true);

// LOG_003: point correctOrder at an ordering the clues do not imply.
const brokenOrder = structuredClone(LIBRARY.LOG_003[0]);
brokenOrder.correctOrder = [...brokenOrder.correctOrder].reverse();
ok('the ordering validator rejects a wrong correctOrder', validatePuzzle(brokenOrder).length > 0, true);

// LOG_003: a redundant clue (duplicate) must be caught as non-load-bearing.
const redundantOrder = structuredClone(LIBRARY.LOG_003.find((p) => p.clues.length >= 3));
redundantOrder.clues = [...redundantOrder.clues, redundantOrder.clues[0]];
ok('the ordering validator rejects a redundant clue', validatePuzzle(redundantOrder).length > 0, true);

// LNG_003: swap two fragments so a second ordering becomes grammatical-looking.
const brokenSentence = structuredClone(LIBRARY.LNG_003[0]);
brokenSentence.correctOrder = [brokenSentence.correctOrder[1], brokenSentence.correctOrder[0], brokenSentence.correctOrder[2], brokenSentence.correctOrder[3]];
ok('the sentence-ordering validator rejects a wrong order', validatePuzzle(brokenSentence).length > 0, true);

// ATT_002: a target that appears twice on the board makes recall ambiguous.
const brokenFlash = structuredClone(LIBRARY.ATT_002[0]);
brokenFlash.board[brokenFlash.board.length - 1].glyph = brokenFlash.targets[0];
ok('the memory-flash validator rejects a duplicated target glyph', validatePuzzle(brokenFlash).length > 0, true);

// ATT_002: an exposure below the 1500ms accessibility floor.
const fastFlash = structuredClone(LIBRARY.ATT_002[0]);
fastFlash.exposureMs = 900;
ok('the memory-flash validator rejects a sub-floor exposure', validatePuzzle(fastFlash).length > 0, true);

// Ids are globally unique, and each engine's puzzles carry its category.
const ids = ALL_PUZZLES.map((p) => p.id);
ok('puzzle ids are globally unique', new Set(ids).size, ids.length);
ok('every puzzle sits in its engine\'s category', ALL_PUZZLES.every((p) => ENGINE_CATEGORY[p.engineId] === p.category), true);
ok('every engine is exercised', [...new Set(ALL_PUZZLES.map((p) => p.engineId))].sort(), Object.keys(ENGINE_CATEGORY).sort());

// Determinism: building the library twice must give byte-identical content.
const { ALL_PUZZLES: SECOND } = await import(pathToFileURL(join(OUT, 'content/library.js')).href + '?v=2');
ok('the library is byte-identical when built twice (no randomness)', JSON.stringify(SECOND), JSON.stringify(ALL_PUZZLES));

// =============================================================================
// Packs: shape, rotation, one-use-per-puzzle
// =============================================================================

ok('fifty packs', PACKS.length, 50);
ok('PACK_COUNT agrees with the pool', PACK_COUNT, 50);

const scheduled = PACKS.flatMap((p) => p.puzzles.map((x) => x.id));
ok('every pack holds five puzzles', PACKS.every((p) => p.puzzles.length === 5), true);
ok('every pack follows the fixed category order', PACKS.every((p) => JSON.stringify(p.puzzles.map((x) => x.category)) === JSON.stringify(CATEGORY_ORDER)), true);
ok('250 puzzles are scheduled (5 × 50)', scheduled.length, 250);
ok('no puzzle is scheduled twice', new Set(scheduled).size, 250);
// The remainder is a deliberate content reserve (Core Spec §4), never re-shown.
ok('scheduled puzzles are a subset of the library', scheduled.every((id) => ALL_PUZZLES.some((p) => p.id === id)), true);
ok('the reserve is exactly the unscheduled surplus', ALL_PUZZLES.length - new Set(scheduled).size, 76);
ok('pack ids are unique', new Set(PACKS.map((p) => p.id)).size, PACKS.length);
ok('no pack uses one engine twice', PACKS.every((p) => new Set(p.puzzles.map((x) => x.engineId)).size === 5), true);
ok('every pack is winnable to a perfect 100', PACKS.every((p) => computeBrewScore(p.puzzles, perfectAnswers(p)).total === 100), true);

// Rotation (§5): an engine never repeats in its category on consecutive packs.
for (const [slot, category] of CATEGORY_ORDER.entries()) {
  const sequence = PACKS.map((p) => p.puzzles[slot].engineId);
  let consecutive = 0;
  for (let i = 1; i < sequence.length; i++) if (sequence[i] === sequence[i - 1]) consecutive++;
  ok(`${category}: no engine repeats on consecutive packs`, consecutive, 0);

  const engines = new Set(sequence);
  let gap = false;
  for (let i = 0; i + 14 <= sequence.length; i++) if (new Set(sequence.slice(i, i + 14)).size < engines.size) gap = true;
  ok(`${category}: every engine appears within any 14-pack window`, gap, false);
}

// =============================================================================
// Scoring
// =============================================================================

const pack1 = PACKS[0];
const pat = ALL_PUZZLES.find((p) => p.engineId === 'PAT_001');
const log = ALL_PUZZLES.find((p) => p.engineId === 'LOG_001');
const att = ALL_PUZZLES.find((p) => p.engineId === 'ATT_001');

ok('perfect run scores 100', computeBrewScore(pack1.puzzles, perfectAnswers(pack1)).total, 100);
ok('unanswered puzzle scores 0', scorePuzzle(pat, { kind: 'choice', selectedId: null, elapsedMs: 0 }).points, 0);
ok('wrong answer earns no speed bonus', scorePuzzle(log, { kind: 'choice', selectedId: log.options.find((o) => o.id !== log.correctOptionId).id, elapsedMs: 0 }).points, 0);
ok('correct at par earns full 20', scorePuzzle(pat, { kind: 'choice', selectedId: pat.correctOptionId, elapsedMs: pat.timing.parMs }).points, 20);
ok('correct at limit earns accuracy only', scorePuzzle(pat, { kind: 'choice', selectedId: pat.correctOptionId, elapsedMs: pat.timing.limitMs }).points, 14);
ok('correct past limit never goes below 14', scorePuzzle(pat, { kind: 'choice', selectedId: pat.correctOptionId, elapsedMs: 999_999 }).points, 14);
ok('result carries the engine id', scorePuzzle(pat, perfectAnswer(pat)).engineId, 'PAT_001');

const targets = att.symbols.filter((s) => s.isTarget).length;
ok('sweep: spraying every tile scores 0', scorePuzzle(att, { kind: 'sweep', hits: targets, falsePositives: att.symbols.length - targets, totalTargets: targets, elapsedMs: 500 }).points, 0);
ok('sweep: false positives cannot push below 0', scorePuzzle(att, { kind: 'sweep', hits: 0, falsePositives: 99, totalTargets: targets, elapsedMs: 0 }).points, 0);
ok('sweep: clean + instant caps at 20', scorePuzzle(att, { kind: 'sweep', hits: targets, falsePositives: 0, totalTargets: targets, elapsedMs: 0 }).points, 20);
ok('sweep: clean at limit earns accuracy only', scorePuzzle(att, { kind: 'sweep', hits: targets, falsePositives: 0, totalTargets: targets, elapsedMs: att.timing.limitMs }).points, 14);
ok('sweep: a partial sweep is not "correct"', scorePuzzle(att, { kind: 'sweep', hits: targets, falsePositives: 1, totalTargets: targets, elapsedMs: 0 }).correct, false);
ok('Attention Speed is exactly one fifth of the maximum', 20 / MAX_BREW_SCORE, 0.2);

const pairPuzzle = ALL_PUZZLES.find((p) => p.engineId === 'OBS_004');
const [pa, pb] = pairPuzzle.pairTileIds;
const otherTile = pairPuzzle.tiles.find((t) => !pairPuzzle.pairTileIds.includes(t.id)).id;
ok('pair: both correct at par scores 20', scorePuzzle(pairPuzzle, { kind: 'sequence', selectedIds: [pa, pb], elapsedMs: pairPuzzle.timing.parMs }).points, 20);
ok('pair: order does not matter', scorePuzzle(pairPuzzle, { kind: 'sequence', selectedIds: [pb, pa], elapsedMs: 0 }).correct, true);
ok('pair: half a pair scores 0 (no partial credit)', scorePuzzle(pairPuzzle, { kind: 'sequence', selectedIds: [pa, otherTile], elapsedMs: 0 }).points, 0);
ok('pair: tapping the same tile twice is not correct', scorePuzzle(pairPuzzle, { kind: 'sequence', selectedIds: [pa, pa], elapsedMs: 0 }).correct, false);

// Ordering / Sentence Ordering: partial credit per correct absolute position.
const orderPuzzle = ALL_PUZZLES.find((p) => p.engineId === 'LOG_003');
const co = orderPuzzle.correctOrder;
ok('ordering: perfect order at par scores 20', scorePuzzle(orderPuzzle, { kind: 'sequence', selectedIds: [...co], elapsedMs: orderPuzzle.timing.parMs }).points, 20);
ok('ordering: two of four right is not "correct"', scorePuzzle(orderPuzzle, { kind: 'sequence', selectedIds: [co[0], co[1], co[3], co[2]], elapsedMs: 0 }).correct, false);
ok('ordering: two of four right earns 7 accuracy points', scorePuzzle(orderPuzzle, { kind: 'sequence', selectedIds: [co[0], co[1], co[3], co[2]], elapsedMs: 0 }).accuracyPoints, 7);
ok('ordering: a fully wrong order scores 0', scorePuzzle(orderPuzzle, { kind: 'sequence', selectedIds: [co[3], co[2], co[1], co[0]], elapsedMs: 0 }).accuracyPoints, 0);

const sentencePuzzle = ALL_PUZZLES.find((p) => p.engineId === 'LNG_003');
ok('sentence ordering: perfect at par scores 20', scorePuzzle(sentencePuzzle, { kind: 'sequence', selectedIds: [...sentencePuzzle.correctOrder], elapsedMs: sentencePuzzle.timing.parMs }).points, 20);

// Memory Flash: (hits − misses) / targets. A wrong tile cancels a right one.
const flashPuzzle = ALL_PUZZLES.find((p) => p.engineId === 'ATT_002' && !p.orderMatters);
const ft = flashPuzzle.targetIds;
const fdistract = flashPuzzle.board.find((t) => !flashPuzzle.targetIds.includes(t.id)).id;
ok('flash: all targets at par scores 20', scorePuzzle(flashPuzzle, { kind: 'sequence', selectedIds: [...ft], elapsedMs: flashPuzzle.timing.parMs }).points, 20);
ok('flash: order does not matter below difficulty 5', scorePuzzle(flashPuzzle, { kind: 'sequence', selectedIds: [...ft].reverse(), elapsedMs: 0 }).correct, true);
ok('flash: a wrong tile cancels a right one', scorePuzzle(flashPuzzle, { kind: 'sequence', selectedIds: [ft[0], fdistract], elapsedMs: 0 }).accuracyPoints, 0);
ok('flash: selecting the whole board cannot win', scorePuzzle(flashPuzzle, { kind: 'sequence', selectedIds: flashPuzzle.board.map((t) => t.id), elapsedMs: 0 }).points, 0);

const flashOrdered = ALL_PUZZLES.find((p) => p.engineId === 'ATT_002' && p.orderMatters);
if (flashOrdered) {
  ok('flash (ordered): correct order scores full', scorePuzzle(flashOrdered, { kind: 'sequence', selectedIds: [...flashOrdered.targetIds], elapsedMs: flashOrdered.timing.parMs }).points, 20);
  ok('flash (ordered): right symbols wrong order is not "correct"', scorePuzzle(flashOrdered, { kind: 'sequence', selectedIds: [...flashOrdered.targetIds].reverse(), elapsedMs: 0 }).correct, false);
}

// A sequence answer to a choice engine is a bug, not a silent zero.
okThrows('a sequence answer to a choice engine throws', () => scorePuzzle(pat, { kind: 'sequence', selectedIds: ['x'], elapsedMs: 0 }));

const rc = ALL_PUZZLES.find((p) => p.engineId === 'ATT_003');
const n = rc.items.length;
ok('classify: all right, all attempted, at par scores 20', scorePuzzle(rc, { kind: 'classify', correct: n, attempted: n, total: n, elapsedMs: rc.timing.parMs }).points, 20);
ok('classify: nothing attempted scores 0', scorePuzzle(rc, { kind: 'classify', correct: 0, attempted: 0, total: n, elapsedMs: 0 }).points, 0);
ok('classify: everything wrong scores 0', scorePuzzle(rc, { kind: 'classify', correct: 0, attempted: n, total: n, elapsedMs: 0 }).points, 0);
ok(
  'classify: guessing everything fast cannot beat answering everything right',
  scorePuzzle(rc, { kind: 'classify', correct: n / 2, attempted: n, total: n, elapsedMs: 0 }).points <
    scorePuzzle(rc, { kind: 'classify', correct: n, attempted: n, total: n, elapsedMs: rc.timing.limitMs }).points,
  true,
);

okThrows('missing answer throws rather than scoring 0', () => computeBrewScore(pack1.puzzles, []));

ok('100 is the only "perfect" caption', brewScoreCaption(100), 'A perfect brew.');
ok('97 is not called perfect', brewScoreCaption(97).includes('perfect'), false);

// Null exactly for the engines answered by a set, an ordering, a sweep or a
// classification run — everything not reducible to a single option id.
const NULL_ID_ENGINES = ['OBS_004', 'LOG_003', 'LNG_003', 'ATT_001', 'ATT_002', 'ATT_003'];
for (const p of ALL_PUZZLES) {
  const expectNull = NULL_ID_ENGINES.includes(p.engineId);
  if ((correctIdOf(p) === null) !== expectNull) failures.push(`${p.id}: correctIdOf nullness is wrong (engine ${p.engineId})`);
}
passed++;

// =============================================================================
// Deterministic date → pack selection
// =============================================================================

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);

ok('same date resolves to the same pack, every time', getDailyPack(d('2026-07-10')).id, getDailyPack(d('2026-07-10')).id);
ok('replay later the same UTC day keeps the same pack', getDailyPack(new Date('2026-07-10T23:59:59Z')).id, getDailyPack(new Date('2026-07-10T00:00:00Z')).id);

const before = JSON.stringify(getDailyPack(d('2026-07-10')));
computeBrewScore(getDailyPack(d('2026-07-10')).puzzles, perfectAnswers(getDailyPack(d('2026-07-10'))));
ok('scoring a pack does not mutate it (replay is safe)', JSON.stringify(getDailyPack(d('2026-07-10'))), before);

const start = selectPackIndexForDate(d('2026-07-10'));
const days = Array.from({ length: PACK_COUNT + 1 }, (_, i) => selectPackIndexForDate(new Date(Date.UTC(2026, 6, 10 + i))));
ok('consecutive days step through packs in order', days, Array.from({ length: PACK_COUNT + 1 }, (_, i) => (start + i) % PACK_COUNT));
ok('the cycle wraps after PACK_COUNT days', days[PACK_COUNT], days[0]);

const spread = ['1969-12-31', '1970-01-01', '2000-02-29', '2026-01-01', '2099-12-31'];
ok('index is always within range, even pre-epoch', spread.every((iso) => { const i = selectPackIndexForDate(d(iso)); return Number.isInteger(i) && i >= 0 && i < PACK_COUNT; }), true);
ok('utcDayNumber ignores time of day', utcDayNumber(new Date('2026-07-10T23:00:00Z')), utcDayNumber(new Date('2026-07-10T01:00:00Z')));
ok('utcDayNumber rolls at 00:00 UTC', utcDayNumber(new Date('2026-07-11T00:00:00Z')) - utcDayNumber(new Date('2026-07-10T23:59:59Z')), 1);
ok('displayed date matches the selecting date', utcDateIso(d('2026-07-10')), '2026-07-10');
ok('getPackByIndex wraps instead of throwing', getPackByIndex(PACK_COUNT + 2).id, getPackByIndex(2).id);
ok('getPackByIndex wraps negatives', getPackByIndex(-1).id, getPackByIndex(PACK_COUNT - 1).id);

const day = d('2026-07-10');
const todaysPack = getDailyPack(day);
ok('override is ignored when dev is disabled', resolveDailyPack(day, 3, false).id, todaysPack.id);
ok('override with a null index is ignored even in dev', resolveDailyPack(day, null, true).id, todaysPack.id);
ok('override applies only in a dev build', resolveDailyPack(day, 3, true).id, PACKS[3].id);
ok('override does not mutate normal selection', getDailyPack(day).id, todaysPack.id);

// =============================================================================
// Background colour: one token, four surfaces, no drift
// =============================================================================

const palette = JSON.parse(readFileSync(join(ROOT, 'src', 'theme', 'palette.json'), 'utf8'));
const BG = palette.background;

ok('palette defines a 6-digit hex background', /^#[0-9A-Fa-f]{6}$/.test(BG), true);

const appConfigSrc = readFileSync(join(ROOT, 'app.config.js'), 'utf8');
ok('app.config.js reads the token from palette.json', appConfigSrc.includes("require('./src/theme/palette.json')"), true);
ok('app.config.js hard-codes no background hex', new RegExp(BG, 'i').test(appConfigSrc), false);
ok('the old app.json is gone (it would re-introduce a duplicate)', existsSync(join(ROOT, 'app.json')), false);

const themeSrc = readFileSync(join(ROOT, 'src', 'theme', 'theme.ts'), 'utf8');
ok('theme.ts reads background from palette.json', /background:\s*palette\.background/.test(themeSrc), true);

const expoConfig = (await import(pathToFileURL(join(ROOT, 'app.config.js')).href)).default;
ok('expo config: root view background', expoConfig.backgroundColor, BG);
ok('expo config: web background', expoConfig.web.backgroundColor, BG);
const splash = (expoConfig.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
ok('expo config: splash background', splash?.[1]?.backgroundColor, BG);
ok('expo config: splash dark background', splash?.[1]?.dark?.backgroundColor, BG);

const shellPath = join(ROOT, 'public', 'index.html');
ok('public/index.html exists', existsSync(shellPath), true);
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, 'utf8');
  ok('public/index.html is in sync with palette.json', shell, renderWebShell(BG));
  ok('public/index.html paints the background before JS', shell.includes(`background-color: ${BG}`), true);
}

// =============================================================================

rmSync(OUT, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  ✕ ${f}\n`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}

console.log(`✓ ${passed} checks passed`);
