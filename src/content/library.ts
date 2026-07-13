/**
 * The authored library: 250 puzzles, 11 engines.
 *
 * Nothing below is a puzzle. Everything below is a *seed* — a rule, a scenario,
 * an index into a curated ontology. The builders in `authoring.ts` derive the
 * puzzle; the validators in `validators.ts` prove it. An author's whole job is
 * choosing good seeds.
 *
 * Seeds are pure data and the builders are pure functions, so the library is
 * byte-identical on every device and every run. That is what lets a date map to
 * a pack forever (Core Spec §2).
 */

import type { Difficulty, Puzzle , MatrixRule } from '../types/puzzle';
import {
  analogy,
  balanceScales,
  deduction,
  matrixCompletion,
  memoryFlash,
  MEMORY_GLYPHS,
  oddOneOut,
  oddWordOut,
  ordering,
  pairFind,
  rapidClassification,
  rotationMatch,
  sentenceOrdering,
  sequenceCompletion,
  sequenceRepair,
  symbolSweep,
  type BalanceSeed,
} from './authoring';
import { PAIR_GLYPHS, type GlyphFamily, type SequenceFamily } from './lexicon';

const cycle = <T>(values: readonly T[], i: number): T => values[i % values.length]!;
const DIFFS: Difficulty[] = [2, 3, 4, 3, 2, 4, 3, 5, 2, 3];

// =============================================================================
// OBSERVATION
// =============================================================================

/**
 * Only glyph pairs verified to render as *shapes* on every platform we check.
 * `◀ ▶ ◁ ▷ ◷ ◶` are deliberately excluded: they render as emoji-ish forms on
 * some Android builds, which destroys an odd-one-out puzzle rather than merely
 * making it look wrong (Catalog §7 risk 1).
 */
const ODD_ONE_OUT_PAIRS: [GlyphFamily, number, number][] = [
  ['halfCircles', 0, 1], ['halfCircles', 2, 3], ['halfCircles', 0, 2], ['halfCircles', 1, 3],
  ['halfCircles', 1, 0], ['cornerTriangles', 0, 1], ['cornerTriangles', 2, 3],
  ['cornerTriangles', 0, 2], ['cornerTriangles', 1, 3], ['cornerTriangles', 2, 0],
  ['cornerTriangles', 3, 1], ['circledOps', 0, 1], ['circledOps', 2, 3],
  ['halfSquares', 0, 1], ['halfSquares', 2, 3], ['triangles', 0, 1], ['filledTriangles', 0, 1],
];

const GRIDS: [number, number][] = [[12, 4], [15, 5], [16, 4], [12, 4], [20, 5]];

export const ODD_ONE_OUT = ODD_ONE_OUT_PAIRS.map(([family, majority, odd], i) => {
  const [tiles, columns] = cycle(GRIDS, i);
  return oddOneOut({
    id: `obs1-${String(i + 1).padStart(2, '0')}`,
    family,
    majority,
    odd,
    tiles,
    columns,
    // Never first or last, and walked across the grid so position carries no signal.
    oddIndex: 1 + ((i * 5 + 3) % (tiles - 2)),
    difficulty: cycle(DIFFS, i),
  });
});

/** Shape index / turn / answer slot all walk, so nothing is positionally learnable. */
const ROTATION_SHAPES: [[number, number], number, number][] = [
  ...Array.from({ length: 6 }, (_, i) => [[3, 3], 4, i] as [[number, number], number, number]),
  ...Array.from({ length: 6 }, (_, i) => [[3, 3], 5, i] as [[number, number], number, number]),
  ...Array.from({ length: 5 }, (_, i) => [[4, 4], 6, i] as [[number, number], number, number]),
];

export const ROTATION_MATCH = ROTATION_SHAPES.map(([grid, cells, shape], i) =>
  rotationMatch({
    id: `obs3-${String(i + 1).padStart(2, '0')}`,
    grid,
    cells,
    shape,
    turns: cycle([1, 2, 3] as const, i),
    correctIndex: (i * 3) % 4,
    difficulty: cells === 4 ? 2 : cells === 5 ? 3 : 4,
  }),
);

/** Positions never share a row or column, and are never adjacent. */
const PAIR_LAYOUTS: { columns: number; tiles: number; at: [number, number] }[] = [
  { columns: 3, tiles: 9, at: [2, 7] },
  { columns: 3, tiles: 9, at: [0, 5] },
  { columns: 4, tiles: 12, at: [3, 10] },
  { columns: 4, tiles: 12, at: [1, 11] },
  { columns: 4, tiles: 12, at: [0, 9] },
  { columns: 4, tiles: 12, at: [2, 8] },
];

export const PAIR_FIND = Array.from({ length: 16 }, (_, i) => {
  const layout = cycle(PAIR_LAYOUTS, i);
  const pool = [...PAIR_GLYPHS];
  const pair = pool[i % pool.length]!;
  const others = pool.filter((g) => g !== pair).slice(i % 5, (i % 5) + layout.tiles - 2);

  return pairFind({
    id: `obs4-${String(i + 1).padStart(2, '0')}`,
    pair,
    others,
    columns: layout.columns,
    at: layout.at,
    difficulty: layout.tiles === 9 ? 2 : i % 3 === 0 ? 4 : 3,
  });
});

// -----------------------------------------------------------------------------
// OBSERVATION RESERVE (Phase 7C). Authored through the SAME builders + validators
// as scheduled content, but kept OUT of `LIBRARY` so the scheduler never draws
// them — they are appended to `ALL_PUZZLES` only, making them permanent reserve
// (the ~64→ pool the daily 50 packs never consume). This closes the known defect
// (Observation reserve = 0) so Practice can be reserve-only for every category.
// Reuses proven glyph families / grid params, so every one passes its engine's
// deterministic validator. New stable ids (`obs*-r*`) never collide with
// scheduled ids, so the 50 daily packs and all content hashes stay byte-identical.
// -----------------------------------------------------------------------------

const RESERVE_ODD_ONE_OUT_SEEDS: [GlyphFamily, number, number, Difficulty][] = [
  ['halfCircles', 3, 0, 1],
  ['cornerTriangles', 1, 2, 2],
  ['halfSquares', 1, 0, 3],
  ['circledOps', 1, 0, 4],
];
const RESERVE_ODD_ONE_OUT = RESERVE_ODD_ONE_OUT_SEEDS.map(([family, majority, odd, difficulty], i) => {
  const [tiles, columns] = cycle(GRIDS, i + 2);
  return oddOneOut({
    id: `obs1-r${i + 1}`, family, majority, odd, tiles, columns,
    oddIndex: 1 + ((i * 7 + 2) % (tiles - 2)),
    difficulty,
  });
});

const RESERVE_ROTATION_SEEDS: [[number, number], number, number, 1 | 2 | 3, Difficulty][] = [
  [[3, 3], 4, 3, 2, 2],
  [[3, 3], 5, 4, 1, 3],
  [[4, 4], 6, 2, 3, 4],
  [[4, 4], 6, 3, 2, 5],
];
const RESERVE_ROTATION_MATCH = RESERVE_ROTATION_SEEDS.map(([grid, cells, shape, turns, difficulty], i) =>
  rotationMatch({ id: `obs3-r${i + 1}`, grid, cells, shape, turns, correctIndex: (i * 3 + 1) % 4, difficulty }),
);

const RESERVE_PAIR_FIND = Array.from({ length: 4 }, (_, i) => {
  const layout = PAIR_LAYOUTS[i % 2]!; // tiles-9 layouts keep the glyph pool comfortably large
  const pool = [...PAIR_GLYPHS];
  const pair = pool[(i + 3) % pool.length]!;
  const others = pool.filter((g) => g !== pair).slice((i + 1) % 4, ((i + 1) % 4) + layout.tiles - 2);
  return pairFind({
    id: `obs4-r${i + 1}`, pair, others, columns: layout.columns, at: layout.at,
    difficulty: (i % 2 === 0 ? 3 : 4) as Difficulty,
  });
});

/** Approved Observation reserve — appended to ALL_PUZZLES, never scheduled. */
export const RESERVE_OBSERVATION: Puzzle[] = [
  ...RESERVE_ODD_ONE_OUT,
  ...RESERVE_ROTATION_MATCH,
  ...RESERVE_PAIR_FIND,
];

// =============================================================================
// PATTERN
// =============================================================================

const SEQUENCE_SEEDS: { family: SequenceFamily; params: number[]; length?: number; difficulty: Difficulty }[] = [
  { family: 'arithmetic', params: [2, 3], difficulty: 1 },
  { family: 'arithmetic', params: [5, 5], difficulty: 1 },
  { family: 'arithmetic', params: [7, 4], difficulty: 2 },
  { family: 'arithmetic', params: [3, 7], difficulty: 2 },
  { family: 'arithmetic', params: [10, 10], difficulty: 1 },
  { family: 'geometric', params: [2, 2], difficulty: 2 },
  { family: 'geometric', params: [3, 2], difficulty: 2 },
  { family: 'geometric', params: [1, 3], difficulty: 3 },
  { family: 'geometric', params: [2, 3], difficulty: 3 },
  { family: 'divide', params: [81, 3], length: 4, difficulty: 3 },
  { family: 'divide', params: [64, 2], difficulty: 3 },
  { family: 'divide', params: [96, 2], difficulty: 3 },
  { family: 'squares', params: [1], difficulty: 2 },
  { family: 'squares', params: [2], difficulty: 3 },
  { family: 'squares', params: [3], difficulty: 3 },
  { family: 'triangular', params: [1], difficulty: 3 },
  { family: 'triangular', params: [2], difficulty: 4 },
  { family: 'oblong', params: [1], difficulty: 3 },
  { family: 'oblong', params: [2], difficulty: 4 },
  { family: 'fibonacci', params: [1, 1], difficulty: 3 },
  { family: 'fibonacci', params: [2, 3], difficulty: 4 },
  { family: 'fibonacci', params: [1, 3], difficulty: 4 },
  { family: 'alternating', params: [2, 3, 2], difficulty: 5 },
  { family: 'alternating', params: [1, 2, 3], difficulty: 5 },
  { family: 'alternating', params: [3, 1, 2], difficulty: 5 },
];

export const SEQUENCE_COMPLETION = SEQUENCE_SEEDS.map((seed, i) =>
  sequenceCompletion({
    id: `pat1-${String(i + 1).padStart(2, '0')}`,
    family: seed.family,
    params: seed.params,
    length: seed.length,
    correctIndex: (i * 3) % 4,
    difficulty: seed.difficulty,
  }),
);

/**
 * All 27 rule combinations except the two degenerate ones — every attribute
 * row-constant (three identical columns) or every attribute column-constant
 * (three identical rows). That leaves exactly 25.
 */
const RULES: MatrixRule[] = ['rowConstant', 'colConstant', 'latin'];
const MATRIX_COMBOS = RULES.flatMap((shape) =>
  RULES.flatMap((count) =>
    RULES.map((fill) => ({ shape, count, fill })).filter(
      (r) =>
        !(r.shape === 'rowConstant' && r.count === 'rowConstant' && r.fill === 'rowConstant') &&
        !(r.shape === 'colConstant' && r.count === 'colConstant' && r.fill === 'colConstant'),
    ),
  ),
);

export const MATRIX_COMPLETION = MATRIX_COMBOS.map((rules, i) => {
  const latins = [rules.shape, rules.count, rules.fill].filter((r) => r === 'latin').length;
  return matrixCompletion({
    id: `pat2-${String(i + 1).padStart(2, '0')}`,
    rules,
    correctIndex: (i * 3) % 4,
    difficulty: (latins === 0 ? 2 : latins === 1 ? 3 : latins === 2 ? 4 : 5) as Difficulty,
  });
});

// =============================================================================
// LOGIC
// =============================================================================

const FORM_DIFFICULTY: Difficulty[] = [2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 4, 4, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5];

export const DEDUCTION = Array.from({ length: 25 }, (_, i) =>
  deduction({
    id: `log1-${String(i + 1).padStart(2, '0')}`,
    scenario: i,
    correctIndex: (i * 3) % 4,
    difficulty: FORM_DIFFICULTY[i]!,
  }),
);

const SQ = '■';
const TR = '▲';
const DI = '◆';
const CI = '●';
const rep = (glyph: string, n: number) => Array.from({ length: n }, () => glyph);

/** Four families of weighting, all requiring at least one substitution. */
const BALANCE_SEEDS: Omit<BalanceSeed, 'id' | 'correctIndex'>[] = [
  // A: ▲ = k■ ; ◆ = m▲ ; ask ◆ in ■  →  ratio k·m
  ...([[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [5, 2], [2, 4], [3, 4], [5, 3], [4, 4]] as [number, number][]).map(
    ([k, m]) => ({
      weights: { [SQ]: 1, [TR]: k, [DI]: k * m },
      scales: [[[TR], rep(SQ, k)], [[DI], rep(TR, m)]] as [string[], string[]][],
      query: { subject: DI, unit: SQ },
      difficulty: (k * m <= 6 ? 2 : k * m <= 10 ? 3 : 4) as Difficulty,
    }),
  ),
  // B: a● = b▲ ; ▲ = t■ ; ask ● in ■  →  ratio b·t/a
  ...([[2, 3, 2], [3, 2, 3], [2, 3, 4], [3, 4, 3], [2, 5, 2], [4, 3, 4]] as [number, number, number][]).map(
    ([a, b, t]) => ({
      weights: { [SQ]: 1, [TR]: t, [CI]: (b * t) / a },
      scales: [[rep(CI, a), rep(TR, b)], [[TR], rep(SQ, t)]] as [string[], string[]][],
      query: { subject: CI, unit: SQ },
      difficulty: 3 as Difficulty,
    }),
  ),
  // C: ▲ = k■ ; ◆ = 2▲ ; ◆ = n● ; ask ● in ■  →  ratio 2k/n   (three scales)
  ...([[3, 3], [4, 2], [3, 2], [6, 3], [4, 4], [5, 2]] as [number, number][]).map(([k, n]) => ({
    weights: { [SQ]: 1, [TR]: k, [DI]: 2 * k, [CI]: (2 * k) / n },
    scales: [[[TR], rep(SQ, k)], [[DI], rep(TR, 2)], [[DI], rep(CI, n)]] as [string[], string[]][],
    query: { subject: CI, unit: SQ },
    difficulty: 5 as Difficulty,
  })),
  // D: ◆ = a■ ; ● = b◆ ; ask ● in ■  →  ratio a·b
  ...([[2, 2], [3, 2], [2, 3]] as [number, number][]).map(([a, b]) => ({
    weights: { [SQ]: 1, [DI]: a, [CI]: a * b },
    scales: [[[DI], rep(SQ, a)], [[CI], rep(DI, b)]] as [string[], string[]][],
    query: { subject: CI, unit: SQ },
    difficulty: 2 as Difficulty,
  })),
];

export const BALANCE_SCALES = BALANCE_SEEDS.map((seed, i) =>
  balanceScales({ ...seed, id: `log2-${String(i + 1).padStart(2, '0')}`, correctIndex: (i * 3) % 4 }),
);

// =============================================================================
// LANGUAGE LOGIC
// =============================================================================

const ANALOGY_DIFFICULTY: Difficulty[] = [3, 2, 3, 4, 4, 2, 2, 4, 2, 2, 3, 3, 3, 4, 4, 3, 3, 4, 4, 3, 4, 4, 5, 4, 3];

export const ANALOGY = Array.from({ length: 25 }, (_, i) =>
  analogy({
    id: `lng1-${String(i + 1).padStart(2, '0')}`,
    entry: i,
    correctIndex: (i * 3) % 4,
    difficulty: ANALOGY_DIFFICULTY[i]!,
  }),
);

const ODD_WORD_DIFFICULTY: Difficulty[] = [1, 2, 4, 2, 2, 3, 1, 3, 4, 1, 3, 3, 3, 3, 4, 3, 4, 3, 4, 2, 3, 3, 3, 4, 4];

export const ODD_WORD_OUT = Array.from({ length: 25 }, (_, i) =>
  oddWordOut({
    id: `lng2-${String(i + 1).padStart(2, '0')}`,
    set: i,
    correctIndex: (i * 3) % 4,
    difficulty: ODD_WORD_DIFFICULTY[i]!,
  }),
);

// =============================================================================
// ATTENTION SPEED
// =============================================================================

const SWEEP_SHAPES: { target: string; distractors: string[] }[] = [
  { target: '▲', distractors: ['▼', '◆'] },
  { target: '◆', distractors: ['▲', '■'] },
  { target: '●', distractors: ['■', '▲'] },
  { target: '■', distractors: ['●', '▼'] },
  { target: '▼', distractors: ['▲', '◆', '■'] },
  { target: '○', distractors: ['□', '△'] },
  { target: '△', distractors: ['▽', '◇'] },
];

const SWEEP_GRIDS: { rows: number; columns: number; targets: number; durationMs: number; difficulty: Difficulty }[] = [
  { rows: 4, columns: 4, targets: 6, durationMs: 11_000, difficulty: 1 },
  { rows: 4, columns: 5, targets: 7, durationMs: 12_000, difficulty: 2 },
  { rows: 5, columns: 5, targets: 9, durationMs: 14_000, difficulty: 3 },
  { rows: 4, columns: 5, targets: 8, durationMs: 11_000, difficulty: 4 },
  { rows: 5, columns: 5, targets: 10, durationMs: 13_000, difficulty: 5 },
];

export const SYMBOL_SWEEP = Array.from({ length: 25 }, (_, i) => {
  // 7 shape sets × 5 grids. Walking one axis per step would repeat a
  // (target, grid) pairing every 35; walking them independently gives 25
  // distinct pairings for 25 puzzles.
  const shapes = SWEEP_SHAPES[i % SWEEP_SHAPES.length]!;
  const grid = SWEEP_GRIDS[Math.floor(i / SWEEP_SHAPES.length) % SWEEP_GRIDS.length]!;
  return symbolSweep({
    id: `att1-${String(i + 1).padStart(2, '0')}`,
    target: shapes.target,
    distractors: shapes.distractors,
    rows: grid.rows,
    columns: grid.columns,
    targetCount: grid.targets,
    durationMs: grid.durationMs,
    difficulty: grid.difficulty,
  });
});

const CLASSIFY_RULES = ['curved', 'filled', 'pointsUp'];

/**
 * 3 rules × 9 item counts = 27 distinct setups, of which we use 25. Cycling one
 * axis would repeat a (rule, length) pairing every 8 puzzles, and the player
 * would feel it.
 */
export const RAPID_CLASSIFICATION = Array.from({ length: 25 }, (_, i) => {
  const rule = CLASSIFY_RULES[i % 3]!;
  const items = 8 + 2 * (Math.floor(i / 3) % 9);
  // Roughly 1.15s per item, so pace — not reading speed — is the constraint.
  const durationMs = Math.max(12_000, Math.round(items * 1_150));
  const difficulty = (items <= 10 ? 2 : items <= 14 ? 3 : items <= 18 ? 4 : 5) as Difficulty;

  return rapidClassification({ id: `att3-${String(i + 1).padStart(2, '0')}`, rule, items, durationMs, difficulty });
});

// =============================================================================


// =============================================================================
// PAT_003 — Sequence Repair
// =============================================================================

/**
 * Families whose six-term runs are tightly constrained enough that exactly one
 * position can be repaired. `alternating` and `divide` are deliberately absent
 * (see `REPAIR_RECOGNISERS`).
 */
const REPAIR_SEEDS: { family: SequenceFamily; params: number[]; difficulty: Difficulty }[] = [
  { family: 'arithmetic', params: [2, 3], difficulty: 2 },
  { family: 'arithmetic', params: [5, 5], difficulty: 2 },
  { family: 'arithmetic', params: [7, 4], difficulty: 2 },
  { family: 'arithmetic', params: [3, 7], difficulty: 3 },
  { family: 'geometric', params: [2, 2], difficulty: 3 },
  { family: 'geometric', params: [3, 2], difficulty: 3 },
  { family: 'geometric', params: [1, 3], difficulty: 4 },
  { family: 'geometric', params: [2, 3], difficulty: 4 },
  { family: 'squares', params: [1], difficulty: 3 },
  { family: 'squares', params: [2], difficulty: 4 },
  { family: 'squares', params: [3], difficulty: 4 },
  { family: 'triangular', params: [1], difficulty: 4 },
  { family: 'triangular', params: [2], difficulty: 5 },
  { family: 'oblong', params: [1], difficulty: 4 },
  { family: 'oblong', params: [2], difficulty: 5 },
  { family: 'fibonacci', params: [2, 3], difficulty: 5 },
];

export const SEQUENCE_REPAIR = REPAIR_SEEDS.map((seed, i) =>
  sequenceRepair({
    id: `pat3-${String(i + 1).padStart(2, '0')}`,
    family: seed.family,
    params: seed.params,
    // Walks across the interior so the break is never in a learnable place.
    corruptIndex: ((i % 4) + 1) as 1 | 2 | 3 | 4,
    difficulty: seed.difficulty,
  }),
);

// =============================================================================
// LOG_003 — Ordering
// =============================================================================

/** Chains of three `before` clues are hardest; a `first`+`last` pair is gentlest. */
const ORDERING_DIFFICULTY: Difficulty[] = [3, 3, 4, 3, 2, 3, 3, 4, 3, 2, 3, 3, 4, 3, 2, 3];

export const ORDERING = Array.from({ length: 16 }, (_, i) =>
  ordering({
    id: `log3-${String(i + 1).padStart(2, '0')}`,
    scenario: i,
    difficulty: ORDERING_DIFFICULTY[i]!,
  }),
);

// =============================================================================
// LNG_003 — Sentence Ordering
// =============================================================================

const SENTENCE_DIFFICULTY: Difficulty[] = [2, 3, 3, 3, 4, 2, 3, 3, 4, 3, 4, 3, 4, 3, 3, 4];

export const SENTENCE_ORDERING = Array.from({ length: 16 }, (_, i) =>
  sentenceOrdering({
    id: `lng3-${String(i + 1).padStart(2, '0')}`,
    set: i,
    difficulty: SENTENCE_DIFFICULTY[i]!,
  }),
);

// =============================================================================
// ATT_002 — Memory Flash
// =============================================================================

/** 3 targets on a 9-tile board … 5 targets on a 12-tile board. */
const FLASH_SHAPES: { count: number; boardSize: number; columns: number }[] = [
  { count: 3, boardSize: 9, columns: 3 },
  { count: 4, boardSize: 9, columns: 3 },
  { count: 4, boardSize: 12, columns: 4 },
  { count: 5, boardSize: 12, columns: 4 },
];

const FLASH_DIFFICULTY: Difficulty[] = [2, 3, 4, 5];

export const MEMORY_FLASH = Array.from({ length: 16 }, (_, i) => {
  const shape = FLASH_SHAPES[i % FLASH_SHAPES.length]!;
  const difficulty = FLASH_DIFFICULTY[Math.floor(i / 4) % FLASH_DIFFICULTY.length]!;

  // Walk the alphabet so no two puzzles show the same target set.
  const pool = [...MEMORY_GLYPHS];
  const start = (i * 3) % pool.length;
  const targets = Array.from({ length: shape.count }, (_, k) => pool[(start + k * 2) % pool.length]!);

  return memoryFlash({
    id: `att2-${String(i + 1).padStart(2, '0')}`,
    targets: [...new Set(targets)],
    boardSize: shape.boardSize,
    columns: shape.columns,
    difficulty,
  });
});

/** Every authored puzzle, grouped by engine. The scheduler draws from here. */
export const LIBRARY = {
  OBS_001: ODD_ONE_OUT,
  OBS_003: ROTATION_MATCH,
  OBS_004: PAIR_FIND,
  PAT_001: SEQUENCE_COMPLETION,
  PAT_002: MATRIX_COMPLETION,
  PAT_003: SEQUENCE_REPAIR,
  LOG_001: DEDUCTION,
  LOG_002: BALANCE_SCALES,
  LOG_003: ORDERING,
  LNG_001: ANALOGY,
  LNG_002: ODD_WORD_OUT,
  LNG_003: SENTENCE_ORDERING,
  ATT_001: SYMBOL_SWEEP,
  ATT_002: MEMORY_FLASH,
  ATT_003: RAPID_CLASSIFICATION,
} as const;

// Scheduled content (drawn by the pack builder) + permanent Observation reserve
// (Phase 7C). The reserve is imported and validated like any puzzle but is never
// in a daily pack, so the 50 packs stay byte-identical.
export const ALL_PUZZLES: Puzzle[] = [...Object.values(LIBRARY).flat(), ...RESERVE_OBSERVATION];
