/**
 * The puzzle authoring framework.
 *
 * An author fills a small, typed seed — a rule and its parameters, a scenario, a
 * word set — and the builder derives the rest: the terms, the grid, the typed
 * distractors, the explanation. Authors never hand-write options, and never
 * hand-write JSON.
 *
 * This is the same division the Core Spec demands of AI (§2.4): the *rule* is
 * authored, the *artefacts* are computed. Nothing here is random — every builder
 * is a pure function of its seed, so a given seed always produces byte-identical
 * content, forever.
 *
 * See docs/CONTENT_PIPELINE.md §3 and §5.
 */

import type {
  AnalogyPuzzle,
  BalanceScalesPuzzle,
  ChoiceOption,
  DeductionPuzzle,
  Difficulty,
  Figure,
  FigureFill,
  FigureShape,
  MatrixCompletionPuzzle,
  MatrixRule,
  MemoryFlashPuzzle,
  OddOneOutPuzzle,
  OddWordOutPuzzle,
  OrderingPuzzle,
  PairFindPuzzle,
  RapidClassificationPuzzle,
  RotationMatchPuzzle,
  Scale,
  SentenceOrderingPuzzle,
  SequenceCompletionPuzzle,
  SequenceRepairPuzzle,
  ShapeCells,
  SymbolSweepPuzzle,
  Timing,
} from '../types/puzzle';
import {
  ANALOGIES,
  CLASSIFICATION_RULES,
  DEDUCTION_SCENARIOS,
  FAMILY_DESCRIPTIONS,
  GLYPH_FAMILIES,
  MEMORY_EXPOSURE_BY_DIFFICULTY,
  MEMORY_INTERVAL_MS,
  ODD_WORD_SETS,
  ORDERING_SCENARIOS,
  SENTENCE_SETS,
  SWEEP_GLYPHS,
  type AnalogyEntry,
  type Clue,
  type DeductionScenario,
  type GlyphFamily,
  type OddWordSet,
  type SequenceFamily,
} from './lexicon';

// =============================================================================
// Deterministic primitives — no Math.random, ever
// =============================================================================

/** Small LCG. Same seed, same order, on every device and every run. */
function lcg(seed: number) {
  let s = (seed * 2654435761) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Fisher–Yates driven by the LCG. Pure: never mutates its input. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = lcg(seed + 1);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const OPTION_IDS = ['a', 'b', 'c', 'd'] as const;

/**
 * Places the correct answer at `correctIndex` and the typed distractors around
 * it. Distractor *order* is preserved: each has a designed role, and shuffling
 * them would lose that.
 */
function choices(correct: string, distractors: string[], correctIndex: number) {
  const labels: string[] = [];
  let d = 0;
  for (let i = 0; i < 4; i++) labels.push(i === correctIndex ? correct : distractors[d++]!);
  return {
    options: labels.map((label, i) => ({ id: OPTION_IDS[i]!, label })) as ChoiceOption[],
    correctOptionId: OPTION_IDS[correctIndex]!,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Time envelope from authored difficulty. Slower puzzles get more room. */
function timingFor(base: number, difficulty: Difficulty): Timing {
  const parMs = base + (difficulty - 1) * Math.round(base * 0.22);
  return { parMs, limitMs: Math.round(parMs * 2.4) };
}

// =============================================================================
// Shape maths, shared by Rotation Match
// =============================================================================

type Matrix = number[][];

const toMatrix = (rows: ShapeCells): Matrix => rows.map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
const toRows = (m: Matrix): ShapeCells => m.map((r) => r.map((x) => (x ? '#' : '.')).join(''));
const keyOf = (m: Matrix) => m.map((r) => r.join('')).join('/');
const rot90 = (m: Matrix): Matrix => m[0]!.map((_, c) => m.map((r) => r[c]!).reverse());
const mirrorOf = (m: Matrix): Matrix => m.map((r) => [...r].reverse());
const rotationsOf = (m: Matrix) => {
  const out: Matrix[] = [];
  let x = m;
  for (let i = 0; i < 4; i++) {
    out.push(x);
    x = rot90(x);
  }
  return out;
};
const cellCount = (m: Matrix) => m.flat().filter(Boolean).length;

function connected(m: Matrix): boolean {
  const H = m.length;
  const W = m[0]!.length;
  let start: [number, number] | null = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W && !start; c++) if (m[r]![c]) start = [r, c];
  if (!start) return false;

  const seen = new Set([start.join()]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || !m[nr]![nc]) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return seen.size === cellCount(m);
}

/** Chiral (its mirror is not a rotation) and with four distinct rotations. */
const usableShape = (m: Matrix) => {
  const keys = rotationsOf(m).map(keyOf);
  return new Set(keys).size === 4 && !keys.includes(keyOf(mirrorOf(m)));
};

/**
 * Every connected, chiral, rotationally-asymmetric shape of `cells` filled cells
 * on an H×W grid, deduplicated by rotation class. Pure and deterministic, so the
 * pool is identical on every run — a shape's index is a stable identifier.
 */
export function shapePool(H: number, W: number, cells: number): ShapeCells[] {
  const found: Matrix[] = [];
  const seen = new Set<string>();

  const rec = (i: number, acc: number[]) => {
    if (acc.length === cells) {
      const g: Matrix = Array.from({ length: H }, () => new Array(W).fill(0));
      for (const j of acc) g[Math.floor(j / W)]![j % W] = 1;
      // Anchored to the top row and left column so translations are not duplicates.
      if (!g[0]!.some(Boolean) || !g.some((r) => r[0])) return;
      if (!connected(g) || !usableShape(g)) return;
      const keys = rotationsOf(g).map(keyOf);
      if (keys.some((k) => seen.has(k))) return;
      keys.forEach((k) => seen.add(k));
      found.push(g);
      return;
    }
    if (i >= H * W || acc.length + (H * W - i) < cells) return;
    acc.push(i);
    rec(i + 1, acc);
    acc.pop();
    rec(i + 1, acc);
  };

  rec(0, []);
  return found.map(toRows);
}

/** One cell relocated: still connected, and neither a rotation nor the mirror. */
function movedCell(m: Matrix): Matrix | null {
  const rots = rotationsOf(m).map(keyOf);
  const mir = keyOf(mirrorOf(m));
  const H = m.length;
  const W = m[0]!.length;

  for (let r1 = 0; r1 < H; r1++)
    for (let c1 = 0; c1 < W; c1++) {
      if (!m[r1]![c1]) continue;
      for (let r2 = 0; r2 < H; r2++)
        for (let c2 = 0; c2 < W; c2++) {
          if (m[r2]![c2]) continue;
          const g = m.map((r) => [...r]);
          g[r1]![c1] = 0;
          g[r2]![c2] = 1;
          if (connected(g) && !rots.includes(keyOf(g)) && keyOf(g) !== mir) return g;
        }
    }
  return null;
}

// =============================================================================
// OBSERVATION
// =============================================================================

export interface OddOneOutSeed {
  id: string;
  family: GlyphFamily;
  /** Indices into the family. Must differ. */
  majority: number;
  odd: number;
  tiles: number;
  columns: number;
  oddIndex: number;
  difficulty: Difficulty;
}

export function oddOneOut(seed: OddOneOutSeed): OddOneOutPuzzle {
  const family = GLYPH_FAMILIES[seed.family] as readonly string[];
  const majority = family[seed.majority]!;
  const odd = family[seed.odd]!;

  return {
    id: seed.id,
    engineId: 'OBS_001',
    category: 'observation',
    engine: 'Odd One Out',
    difficulty: seed.difficulty,
    prompt: 'One of these is not like the others. Tap it.',
    explanation: `Every symbol is ${FAMILY_DESCRIPTIONS[seed.family]}. Exactly one of them is turned the other way.`,
    columns: seed.columns,
    tiles: Array.from({ length: seed.tiles }, (_, i) => ({
      id: `tile-${i}`,
      glyph: i === seed.oddIndex ? odd : majority,
    })),
    oddTileId: `tile-${seed.oddIndex}`,
    timing: timingFor(6_000, seed.difficulty),
  };
}

export interface RotationMatchSeed {
  id: string;
  grid: [number, number];
  cells: number;
  /** Index into `shapePool(...)`. Stable across runs. */
  shape: number;
  /** Quarter turns clockwise that produce the correct answer: 1, 2 or 3. */
  turns: 1 | 2 | 3;
  correctIndex: number;
  difficulty: Difficulty;
}

export function rotationMatch(seed: RotationMatchSeed): RotationMatchPuzzle {
  const [H, W] = seed.grid;
  const pool = shapePool(H, W, seed.cells);
  const target = toMatrix(pool[seed.shape % pool.length]!);

  const rotated = rotationsOf(target)[seed.turns]!;
  const mirrored = mirrorOf(target);
  const moved = movedCell(target);
  if (!moved) throw new Error(`${seed.id}: no valid moved-cell distractor`);

  // A genuinely different shape: same cell count, not a rotation or the mirror.
  const banned = new Set([...rotationsOf(target).map(keyOf), keyOf(mirrored), keyOf(moved)]);
  const other = pool
    .map(toMatrix)
    .find((m) => !banned.has(keyOf(m)) && !rotationsOf(m).some((r) => banned.has(keyOf(r))));
  if (!other) throw new Error(`${seed.id}: no valid different-shape distractor`);

  const distractors = [mirrored, moved, other];
  const cellsList: Matrix[] = [];
  let d = 0;
  for (let i = 0; i < 4; i++) cellsList.push(i === seed.correctIndex ? rotated : distractors[d++]!);

  const turnWord = seed.turns === 1 ? 'a quarter turn clockwise' : seed.turns === 2 ? 'a half turn' : 'a quarter turn anticlockwise';

  return {
    id: seed.id,
    engineId: 'OBS_003',
    category: 'observation',
    engine: 'Rotation Match',
    difficulty: seed.difficulty,
    prompt: 'Which shape is the one above, turned?',
    explanation: `Give the shape ${turnWord} and it lands on the answer. One of the others is its mirror image — it looks right, but no turn gets you there. Every option has the same number of filled cells, so counting them tells you nothing.`,
    target: toRows(target),
    options: cellsList.map((m, i) => ({ id: OPTION_IDS[i]!, cells: toRows(m) })),
    correctOptionId: OPTION_IDS[seed.correctIndex]!,
    timing: timingFor(16_000, seed.difficulty),
  };
}

export interface PairFindSeed {
  id: string;
  /** The repeated glyph. */
  pair: string;
  /** Distinct glyphs filling the rest. Must not contain `pair`. */
  others: string[];
  columns: number;
  /** Where the two matching tiles sit. Must differ in row *and* column. */
  at: [number, number];
  difficulty: Difficulty;
}

export function pairFind(seed: PairFindSeed): PairFindPuzzle {
  const total = seed.others.length + 2;
  const glyphs: string[] = [];
  let o = 0;
  for (let i = 0; i < total; i++) glyphs.push(seed.at.includes(i) ? seed.pair : seed.others[o++]!);

  return {
    id: seed.id,
    engineId: 'OBS_004',
    category: 'observation',
    engine: 'Pair Find',
    difficulty: seed.difficulty,
    prompt: 'Exactly two of these match. Tap them both.',
    explanation: `Only two tiles carry the same symbol. Every other symbol on the board appears exactly once.`,
    columns: seed.columns,
    tiles: glyphs.map((glyph, i) => ({ id: `tile-${i}`, glyph })),
    pairTileIds: [`tile-${seed.at[0]}`, `tile-${seed.at[1]}`],
    timing: timingFor(14_000, seed.difficulty),
  };
}

// =============================================================================
// PATTERN
// =============================================================================

interface SequenceRule {
  terms: number[];
  next: number;
  explanation: string;
  /** Near-miss values produced by perturbing the rule, in preference order. */
  nearMisses: number[];
}

/** Every sequence family the generator may use. Terms are *computed*, never typed. */
function buildSequence(family: SequenceFamily, params: number[], length: number): SequenceRule {
  const n = length;
  const terms: number[] = [];

  switch (family) {
    case 'arithmetic': {
      const [a, d] = params as [number, number];
      for (let i = 0; i < n + 1; i++) terms.push(a + i * d);
      const next = terms.pop()!;
      return { terms, next, explanation: `Each term adds ${d}. ${terms[n - 1]} + ${d} = ${next}.`, nearMisses: [next + d, next - 1, next + 1] };
    }
    case 'geometric': {
      const [a, r] = params as [number, number];
      for (let i = 0; i < n + 1; i++) terms.push(a * r ** i);
      const next = terms.pop()!;
      return { terms, next, explanation: `Each term is ${r} times the one before it. ${terms[n - 1]} x ${r} = ${next}.`, nearMisses: [next + terms[n - 1]!, next - 2, next + 2, next * 2] };
    }
    case 'divide': {
      const [a, r] = params as [number, number];
      let x = a;
      for (let i = 0; i < n + 1; i++) {
        terms.push(x);
        x = x / r;
      }
      const next = terms.pop()!;
      return { terms, next, explanation: `Each term is the one before it divided by ${r}. ${terms[n - 1]} ÷ ${r} = ${next}.`, nearMisses: [next * r, next + 1, next + 2, next + 3] };
    }
    case 'squares': {
      const [start] = params as [number];
      for (let i = 0; i < n + 1; i++) terms.push((start + i) ** 2);
      const next = terms.pop()!;
      const k = start + n;
      return { terms, next, explanation: `These are the square numbers. Next is ${k} x ${k} = ${next}.`, nearMisses: [next - 1, next + k, next - k] };
    }
    case 'triangular': {
      const [start] = params as [number];
      const tri = (k: number) => (k * (k + 1)) / 2;
      for (let i = 0; i < n + 1; i++) terms.push(tri(start + i));
      const next = terms.pop()!;
      return { terms, next, explanation: `The gap grows by one each step. Each term is k x (k + 1) ÷ 2, so the next is ${next}.`, nearMisses: [next + 1, next - 1, next + 3] };
    }
    case 'oblong': {
      const [start] = params as [number];
      const ob = (k: number) => k * (k + 1);
      for (let i = 0; i < n + 1; i++) terms.push(ob(start + i));
      const next = terms.pop()!;
      return { terms, next, explanation: `The gaps grow by two each step. Each term is k x (k + 1), so the next is ${next}.`, nearMisses: [next - 2, next + 2, next - 6] };
    }
    case 'fibonacci': {
      const [a, b] = params as [number, number];
      terms.push(a, b);
      for (let i = 2; i < n + 1; i++) terms.push(terms[i - 1]! + terms[i - 2]!);
      const next = terms.pop()!;
      return { terms, next, explanation: `Each term is the sum of the two before it. ${terms[n - 2]} + ${terms[n - 1]} = ${next}.`, nearMisses: [next + 1, next - 1, next + 2, next - 2, next + terms[n - 1]!] };
    }
    case 'alternating': {
      const [a, d, m] = params as [number, number, number];
      let x = a;
      for (let i = 0; i < n + 1; i++) {
        terms.push(x);
        x = i % 2 === 0 ? x + d : x * m;
      }
      const next = terms.pop()!;
      // The step that produced `next` was applied at index n-1, not n.
      const added = (n - 1) % 2 === 0;
      return {
        terms,
        next,
        explanation: added ? `The rule alternates: add ${d}, then multiply by ${m}. This step adds ${d}.` : `The rule alternates: add ${d}, then multiply by ${m}. This step multiplies by ${m}.`,
        nearMisses: [added ? next * m : next + d, next + 1, next - 1],
      };
    }
  }
}

export interface SequenceSeedInput {
  id: string;
  family: SequenceFamily;
  params: number[];
  length?: number;
  correctIndex: number;
  difficulty: Difficulty;
}

export function sequenceCompletion(seed: SequenceSeedInput): SequenceCompletionPuzzle {
  const length = seed.length ?? 5;
  const { terms, next, explanation, nearMisses } = buildSequence(seed.family, seed.params, length);

  // Distractors are near-misses of the rule, never random numbers — and never a
  // value already visible in the run, which would be a free elimination.
  //
  // Small answers (a sequence dividing down to 1) can exhaust the rule-derived
  // near-misses, because they collide with the visible terms. The fallback walks
  // outward from the answer, so a distractor is always *close* to it.
  const shown = new Set(terms);
  const fallback = Array.from({ length: 12 }, (_, k) => next + k + 1);
  const distractors: number[] = [];

  for (const value of [...nearMisses, ...fallback]) {
    if (value === next || value <= 0 || distractors.includes(value) || shown.has(value)) continue;
    distractors.push(value);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) throw new Error(`${seed.id}: could not build three distinct near-misses`);

  return {
    id: seed.id,
    engineId: 'PAT_001',
    category: 'pattern',
    engine: 'Sequence Completion',
    difficulty: seed.difficulty,
    prompt: 'What comes next in the sequence?',
    sequence: terms.map(String),
    explanation,
    ...choices(String(next), distractors.map(String), seed.correctIndex),
    timing: timingFor(9_000, seed.difficulty),
  };
}

const SHAPES: FigureShape[] = ['circle', 'square', 'diamond'];
const COUNTS: (1 | 2 | 3)[] = [1, 2, 3];
const FILLS: FigureFill[] = ['outline', 'half', 'solid'];

type Coeff = [number, number];

function valueAt<T>(values: readonly T[], rule: MatrixRule, r: number, c: number, k: Coeff): T {
  switch (rule) {
    case 'rowConstant':
      return values[r]!;
    case 'colConstant':
      return values[c]!;
    case 'latin':
      return values[(k[0] * r + k[1] * c) % 3]!;
  }
}

const nextOf = <T>(values: readonly T[], value: T): T => values[(values.indexOf(value) + 1) % values.length]!;
const describeFigure = (f: Figure) => `${f.count} ${f.shape}${f.count > 1 ? 's' : ''}, ${f.fill}`;

const RULE_WORDS: Record<MatrixRule, string> = {
  rowConstant: 'stays the same along each row',
  colConstant: 'stays the same down each column',
  latin: 'appears exactly once in every row and every column',
};

export interface MatrixSeed {
  id: string;
  rules: { shape: MatrixRule; count: MatrixRule; fill: MatrixRule };
  coeffs?: { shape: Coeff; count: Coeff; fill: Coeff };
  correctIndex: number;
  difficulty: Difficulty;
}

export function matrixCompletion(seed: MatrixSeed): MatrixCompletionPuzzle {
  const coeffs = seed.coeffs ?? { shape: [1, 1], count: [1, 2], fill: [2, 1] };

  const figures: Figure[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      figures.push({
        shape: valueAt(SHAPES, seed.rules.shape, r, c, coeffs.shape),
        count: valueAt(COUNTS, seed.rules.count, r, c, coeffs.count),
        fill: valueAt(FILLS, seed.rules.fill, r, c, coeffs.fill),
      });

  const correct = figures[8]!;
  // Each distractor breaks exactly one attribute — no free eliminations.
  const variants: Figure[] = [
    { ...correct, shape: nextOf(SHAPES, correct.shape) },
    { ...correct, count: nextOf(COUNTS, correct.count) },
    { ...correct, fill: nextOf(FILLS, correct.fill) },
  ];

  const chosen: Figure[] = [];
  let v = 0;
  for (let i = 0; i < 4; i++) chosen.push(i === seed.correctIndex ? correct : variants[v++]!);

  return {
    id: seed.id,
    engineId: 'PAT_002',
    category: 'pattern',
    engine: 'Matrix Completion',
    difficulty: seed.difficulty,
    prompt: 'One cell is missing. Which option belongs there?',
    explanation: `The shape ${RULE_WORDS[seed.rules.shape]}. The count ${RULE_WORDS[seed.rules.count]}. The fill ${RULE_WORDS[seed.rules.fill]}. Only one option satisfies all three at once.`,
    cells: figures.map((f, i) => (i === 8 ? null : f)),
    rules: seed.rules,
    options: chosen.map((f, i) => ({ id: OPTION_IDS[i]!, label: describeFigure(f) })),
    optionFigures: Object.fromEntries(chosen.map((f, i) => [OPTION_IDS[i]!, f])) as Record<string, Figure>,
    correctOptionId: OPTION_IDS[seed.correctIndex]!,
    timing: timingFor(22_000, seed.difficulty),
  };
}

// =============================================================================
// LOGIC
// =============================================================================

export interface DeductionSeed {
  id: string;
  /** Index into DEDUCTION_SCENARIOS. */
  scenario: number;
  correctIndex: number;
  difficulty: Difficulty;
}

/** Premises, the entailed conclusion, and three distractors typed by fallacy. */
function renderDeduction(s: DeductionScenario) {
  switch (s.form) {
    case 'BARBARA':
      return {
        premises: [`Every ${s.a} is a ${s.b}.`, `Every ${s.b} is ${s.c}.`],
        correct: `Every ${s.a} is ${s.c}.`,
        distractors: [
          `Everything that is ${s.c} is a ${s.b}.`, // illicit conversion
          `No ${s.a} is ${s.c}.`, // contradiction
          `At least one ${s.b} is not ${s.c}.`, // contradicts premise 2
        ],
        explanation: `Every ${s.a} is a ${s.b}, and every ${s.b} is ${s.c} — so every ${s.a} must be ${s.c}. The others reverse a statement or contradict one.`,
      };
    case 'CELARENT':
      return {
        premises: [`Every ${s.a} is ${s.b}.`, `Nothing that is ${s.b} is ${s.c}.`],
        correct: `No ${s.a} is ${s.c}.`,
        distractors: [
          `At least one ${s.a} is ${s.c}.`, // contradiction
          `Everything that is ${s.c} is ${s.b}.`, // illicit conversion
          `At least one ${s.a} is not ${s.b}.`, // contradicts premise 1
        ],
        explanation: `Every ${s.a} is ${s.b}, and nothing ${s.b} is ${s.c} — so no ${s.a} can be ${s.c}. The others reverse a statement or contradict one.`,
      };
    case 'RESTATEMENT_TRAP':
      return {
        premises: [`Every ${s.a} is a ${s.b}.`, `Some ${s.bPlural} are ${s.c}.`],
        correct: `Every ${s.a} is a ${s.b}.`,
        distractors: [
          `At least one ${s.a} is ${s.c}.`, // the tempting, invalid one
          `Everything that is ${s.c} is a ${s.b}.`,
          `No ${s.a} is ${s.c}.`,
        ],
        explanation: `The ${s.c} ${s.bPlural} need not be the ones described in the first statement, so nothing follows about them either way. Only the first statement, restated, must be true.`,
      };
    case 'MODUS_TOLLENS':
      return {
        premises: [`If ${s.p}, then ${s.q}.`, `${cap(s.notQ)}.`],
        correct: `${cap(s.notP)}.`,
        distractors: [`${cap(s.p)}.`, s.noise[0], s.noise[1]],
        explanation: `If ${s.p}, then ${s.q} would follow. But ${s.notQ} — so ${s.notP}. Why that is the case is never stated.`,
      };
    case 'DISJUNCTIVE':
      return {
        premises: [`Either ${s.p}, or ${s.q}.`, `${cap(s.notQ)}.`],
        correct: `${cap(s.p)}.`,
        distractors: [`${cap(s.q)}.`, s.noise[0], s.noise[1]],
        explanation: `One of the two must hold. The second is ruled out, so the first must be true. Nothing else is stated.`,
      };
  }
}

export function deduction(seed: DeductionSeed): DeductionPuzzle {
  const scenario = DEDUCTION_SCENARIOS[seed.scenario]!;
  const { premises, correct, distractors, explanation } = renderDeduction(scenario);

  return {
    id: seed.id,
    engineId: 'LOG_001',
    category: 'logic',
    engine: 'Deduction',
    difficulty: seed.difficulty,
    prompt: 'If both statements are true, which must also be true?',
    premises,
    explanation,
    ...choices(correct, distractors, seed.correctIndex),
    timing: timingFor(14_000, seed.difficulty),
  };
}

export interface BalanceSeed {
  id: string;
  /** Positive integer weight per glyph. */
  weights: Record<string, number>;
  /** Each entry is [left glyphs, right glyphs]; both pans must weigh the same. */
  scales: [string[], string[]][];
  query: { subject: string; unit: string };
  correctIndex: number;
  difficulty: Difficulty;
}

export function balanceScales(seed: BalanceSeed): BalanceScalesPuzzle {
  const w = seed.weights;

  for (const [left, right] of seed.scales) {
    const l = left.reduce((t, g) => t + w[g]!, 0);
    const r = right.reduce((t, g) => t + w[g]!, 0);
    if (l !== r) throw new Error(`${seed.id}: scale does not balance (${l} vs ${r})`);
  }

  const ratio = w[seed.query.subject]! / w[seed.query.unit]!;
  if (!Number.isInteger(ratio) || ratio <= 1) throw new Error(`${seed.id}: ratio ${ratio} must be an integer above 1`);

  // Distractors are plausible arithmetic slips, not random numbers.
  const candidates = [ratio + 1, ratio - 1, ratio * 2, ratio + 2, Math.floor(ratio / 2)];
  const distractors: number[] = [];
  for (const value of candidates) {
    if (value === ratio || value <= 0 || distractors.includes(value)) continue;
    distractors.push(value);
    if (distractors.length === 3) break;
  }

  const scales: Scale[] = seed.scales.map(([left, right]) => ({ left, right }));
  const many = seed.scales.length > 2 ? 'All three scales balance.' : 'Both scales balance.';

  return {
    id: seed.id,
    engineId: 'LOG_002',
    category: 'logic',
    engine: 'Balance Scales',
    difficulty: seed.difficulty,
    prompt: `${many} Work out the missing amount.`,
    explanation: `Substitute one scale into the next until the two shapes in the question meet. One ${seed.query.subject} balances ${ratio} of the ${seed.query.unit}.`,
    scales,
    query: seed.query,
    ...choices(String(ratio), distractors.map(String), seed.correctIndex),
    timing: timingFor(22_000, seed.difficulty),
  };
}

// =============================================================================
// LANGUAGE LOGIC
// =============================================================================

const RELATION_WORDS: Record<AnalogyEntry['relation'], string> = {
  'part-of': 'the first is one part of the second',
  'cause-effect': 'the first brings about the second',
  intensity: 'the second is a far stronger version of the first',
  'scarcity-of': 'the first is a severe shortage of the second',
  'member-of': 'the first belongs to the group named by the second',
  'tool-function': 'the first is used to do the second',
  'before-after': 'the second is what follows the first',
  'origin-mature': 'the first grows into the second',
  'practitioner-recipient': 'the first serves the second',
  antonym: 'the second is the opposite of the first',
};

export interface AnalogySeed {
  id: string;
  /** Index into ANALOGIES. */
  entry: number;
  correctIndex: number;
  difficulty: Difficulty;
}

export function analogy(seed: AnalogySeed): AnalogyPuzzle {
  const e = ANALOGIES[seed.entry]!;

  return {
    id: seed.id,
    engineId: 'LNG_001',
    category: 'language-logic',
    engine: 'Analogy',
    difficulty: seed.difficulty,
    prompt: 'Complete the analogy.',
    relation: [`${e.given[0]} is to ${e.given[1]}`, `${e.ask} is to ?`],
    explanation: `In the first pair, ${RELATION_WORDS[e.relation]}. Carry that same relation across: ${e.ask} is to ${e.answer}. The other options sit nearby but hold a different relation.`,
    ...choices(e.answer, [...e.distractors], seed.correctIndex),
    timing: timingFor(10_000, seed.difficulty),
  };
}

export interface OddWordSeed {
  id: string;
  /** Index into ODD_WORD_SETS. */
  set: number;
  correctIndex: number;
  difficulty: Difficulty;
}

export function oddWordOut(seed: OddWordSeed): OddWordOutPuzzle {
  const s: OddWordSet = ODD_WORD_SETS[seed.set]!;
  const rest = s.words.filter((w) => w !== s.outlier);
  const shared = s.membership[rest[0]!]!.find((c) => rest.every((w) => s.membership[w]!.includes(c)))!;
  const outlierCat = s.membership[s.outlier]!.find((c) => !rest.some((w) => s.membership[w]!.includes(c)))!;

  const others = rest.map((w) => w.toLowerCase());
  const readable = (c: string) => c.replace(/-/g, ' ');

  return {
    id: seed.id,
    engineId: 'LNG_002',
    category: 'language-logic',
    engine: 'Odd Word Out',
    difficulty: seed.difficulty,
    prompt: 'Three of these belong together. Tap the one that does not.',
    explanation: `${cap(others[0]!)}, ${others[1]} and ${others[2]} are each a ${readable(shared)}. ${cap(s.outlier.toLowerCase())} is a ${readable(outlierCat)}.`,
    membership: s.membership,
    ...choices(s.outlier, rest, seed.correctIndex),
    timing: timingFor(9_000, seed.difficulty),
  };
}

// =============================================================================
// ATTENTION SPEED
// =============================================================================

export interface SweepSeed {
  id: string;
  target: string;
  /** At least two, so the task is not a counting exercise. */
  distractors: string[];
  columns: number;
  rows: number;
  targetCount: number;
  durationMs: number;
  difficulty: Difficulty;
}

export function symbolSweep(seed: SweepSeed): SymbolSweepPuzzle {
  const total = seed.rows * seed.columns;
  const glyphs: string[] = Array.from({ length: seed.targetCount }, () => seed.target);
  for (let i = glyphs.length; i < total; i++) glyphs.push(seed.distractors[i % seed.distractors.length]!);

  const laid = shuffle(glyphs, hash(seed.id));

  return {
    id: seed.id,
    engineId: 'ATT_001',
    category: 'attention-speed',
    engine: 'Symbol Sweep',
    difficulty: seed.difficulty,
    prompt: `Tap every ${seed.target}. Ignore the rest.`,
    explanation: 'Accuracy counts first. A wrong tap costs you more than a slow one.',
    targetGlyph: seed.target,
    symbols: laid.map((glyph, i) => ({ id: `sym-${i}`, glyph, isTarget: glyph === seed.target })),
    columns: seed.columns,
    durationMs: seed.durationMs,
    timing: { parMs: Math.round(seed.durationMs * 0.6), limitMs: seed.durationMs },
  };
}

export interface ClassificationSeed {
  id: string;
  /** Key into CLASSIFICATION_RULES. */
  rule: string;
  /** Even, so the two buckets balance exactly. */
  items: number;
  durationMs: number;
  difficulty: Difficulty;
}

export function rapidClassification(seed: ClassificationSeed): RapidClassificationPuzzle {
  const rule = CLASSIFICATION_RULES[seed.rule];
  if (!rule) throw new Error(`${seed.id}: unknown classification rule "${seed.rule}"`);
  if (seed.items % 2 !== 0) throw new Error(`${seed.id}: item count must be even so the buckets balance`);

  const bucket0 = rule.alphabet.filter((g) => rule.bucketOf(g) === 0);
  const bucket1 = rule.alphabet.filter((g) => rule.bucketOf(g) === 1);
  const half = seed.items / 2;

  // Exactly half from each bucket: one-sided tapping can never win.
  const glyphs: string[] = [];
  for (let i = 0; i < half; i++) glyphs.push(bucket0[i % bucket0.length]!);
  for (let i = 0; i < half; i++) glyphs.push(bucket1[i % bucket1.length]!);

  const laid = shuffle(glyphs, hash(seed.id));

  return {
    id: seed.id,
    engineId: 'ATT_003',
    category: 'attention-speed',
    engine: 'Rapid Classification',
    difficulty: seed.difficulty,
    prompt: 'Sort each symbol before the clock runs out.',
    explanation: `Accuracy first. Sorting a few carefully beats rushing all ${seed.items}.`,
    rule: rule.question,
    buckets: rule.buckets,
    items: laid.map((glyph, i) => ({ id: `item-${i}`, glyph, bucket: rule.bucketOf(glyph) })),
    durationMs: seed.durationMs,
    timing: { parMs: Math.round(seed.durationMs * 0.65), limitMs: seed.durationMs },
  };
}

/** Stable string hash — seeds the shuffle from the puzzle id, not from a clock. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// =============================================================================
// PAT_003 — Sequence Repair
// =============================================================================

/**
 * The approved rule families a *repair* may appeal to.
 *
 * `alternating` and `divide` are excluded: the first is too loosely constrained
 * over six terms (many corruptions admit a second reading), the second runs into
 * fractions. Narrowing the space is what makes the uniqueness search meaningful.
 */
const REPAIR_RECOGNISERS: ((t: number[]) => boolean)[] = [
  // arithmetic
  (t) => {
    const d = t[1]! - t[0]!;
    return d !== 0 && t.every((v, i) => i === 0 || v - t[i - 1]! === d);
  },
  // geometric, integer ratio ≥ 2
  (t) => {
    if (t[0]! === 0) return false;
    const r = t[1]! / t[0]!;
    return Number.isInteger(r) && r >= 2 && t.every((v, i) => i === 0 || v === t[i - 1]! * r);
  },
  // fibonacci-style recurrence
  (t) => t.length >= 3 && t.every((v, i) => i < 2 || v === t[i - 1]! + t[i - 2]!),
  // consecutive squares
  (t) => {
    const k = Math.round(Math.sqrt(t[0]!));
    return k >= 1 && k * k === t[0]! && t.every((v, i) => v === (k + i) ** 2);
  },
  // consecutive triangular numbers
  (t) => {
    const k = Math.round((Math.sqrt(8 * t[0]! + 1) - 1) / 2);
    const tri = (n: number) => (n * (n + 1)) / 2;
    return k >= 1 && tri(k) === t[0]! && t.every((v, i) => v === tri(k + i));
  },
  // consecutive oblong numbers
  (t) => {
    const k = Math.round((Math.sqrt(4 * t[0]! + 1) - 1) / 2);
    const ob = (n: number) => n * (n + 1);
    return k >= 1 && ob(k) === t[0]! && t.every((v, i) => v === ob(k + i));
  },
];

const followsSomeRule = (terms: number[]) =>
  terms.every((v) => Number.isInteger(v) && v > 0 && v <= 999) &&
  REPAIR_RECOGNISERS.some((fits) => fits(terms));

/** Positions at which *some* single replacement value restores a valid rule. */
function repairablePositions(terms: number[], maxValue = 999): number[] {
  const out: number[] = [];
  for (let j = 0; j < terms.length; j++) {
    for (let v = 1; v <= maxValue; v++) {
      if (v === terms[j]) continue;
      const candidate = [...terms];
      candidate[j] = v;
      if (followsSomeRule(candidate)) {
        out.push(j);
        break;
      }
    }
  }
  return out;
}

export interface SequenceRepairSeed {
  id: string;
  family: SequenceFamily;
  params: number[];
  /** Never 0 or 5: either end can be "repaired" by simply shortening the run. */
  corruptIndex: 1 | 2 | 3 | 4;
  difficulty: Difficulty;
}

export function sequenceRepair(seed: SequenceRepairSeed): SequenceRepairPuzzle {
  const { terms, explanation } = buildSequence(seed.family, seed.params, 6);
  const correct = terms[seed.corruptIndex]!;

  // A corruption must be large enough to be findable and small enough to be
  // non-obvious, and it must leave *exactly one* repairable position.
  const magnitudes = [0.15, 0.25, 0.35, 0.1, 0.4];
  const deltas = magnitudes.flatMap((pct) => {
    const step = Math.max(1, Math.round(correct * pct));
    return [step, -step];
  });

  for (const delta of deltas) {
    const wrong = correct + delta;
    if (wrong <= 0 || wrong > 999 || wrong === correct) continue;

    const corrupted = [...terms];
    corrupted[seed.corruptIndex] = wrong;

    const repairable = repairablePositions(corrupted);
    if (repairable.length !== 1 || repairable[0] !== seed.corruptIndex) continue;

    return {
      id: seed.id,
      engineId: 'PAT_003',
      category: 'pattern',
      engine: 'Sequence Repair',
      difficulty: seed.difficulty,
      prompt: 'One term in this sequence is wrong. Tap it.',
      explanation: `${explanation.split('.')[0]}. So the term at position ${seed.corruptIndex + 1} should be ${correct}, not ${wrong}.`,
      terms: corrupted.map(String),
      wrongIndex: seed.corruptIndex,
      correctTerm: String(correct),
      timing: timingFor(18_000, seed.difficulty),
    };
  }

  throw new Error(
    `${seed.id}: no corruption of term ${seed.corruptIndex} leaves exactly one repairable position`,
  );
}

// =============================================================================
// LOG_003 — Ordering
// =============================================================================

const permutations = <T>(items: T[]): T[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));

const clueHolds = (clue: Clue, order: string[]): boolean => {
  switch (clue.type) {
    case 'before': return order.indexOf(clue.a) < order.indexOf(clue.b);
    case 'first': return order[0] === clue.x;
    case 'last': return order[order.length - 1] === clue.x;
    case 'notFirst': return order[0] !== clue.x;
    case 'notLast': return order[order.length - 1] !== clue.x;
  }
};

const solutions = (items: string[], clues: Clue[]) =>
  permutations(items).filter((order) => clues.every((c) => clueHolds(c, order)));

const renderClue = (clue: Clue, verb: string): string => {
  switch (clue.type) {
    case 'before': return `${clue.a} ${verb} before ${clue.b}.`;
    case 'first': return `${clue.x} was first.`;
    case 'last': return `${clue.x} was last.`;
    case 'notFirst': return `${clue.x} was not first.`;
    case 'notLast': return `${clue.x} was not last.`;
  }
};

export interface OrderingSeed {
  id: string;
  /** Index into ORDERING_SCENARIOS. */
  scenario: number;
  difficulty: Difficulty;
}

export function ordering(seed: OrderingSeed): OrderingPuzzle {
  const s = ORDERING_SCENARIOS[seed.scenario]!;

  // The solution is derived, never authored.
  const found = solutions(s.items, s.clues);
  if (found.length !== 1) throw new Error(`${seed.id}: ${found.length} orderings satisfy the clues — exactly one must`);

  // Every clue must be load-bearing. A redundant clue is reading time for nothing.
  for (let i = 0; i < s.clues.length; i++) {
    const without = s.clues.filter((_, j) => j !== i);
    if (solutions(s.items, without).length === 1) {
      throw new Error(`${seed.id}: clue ${i + 1} is redundant — the answer stays unique without it`);
    }
  }

  const answer = found[0]!;
  const items = s.items.map((label, i) => ({ id: `item-${i}`, label }));
  const idOf = (name: string) => items.find((i) => i.label === name)!.id;

  return {
    id: seed.id,
    engineId: 'LOG_003',
    category: 'logic',
    engine: 'Ordering',
    difficulty: seed.difficulty,
    prompt: 'Use the clues to put these in order.',
    explanation: `Only one order satisfies every clue at once: ${answer.join(', ')}. Drop any clue and a second order becomes possible.`,
    // Displayed shuffled, so the pool never hints at the answer.
    items: shuffle(items, hash(seed.id)),
    clues: s.clues.map((c) => renderClue(c, s.verb)),
    correctOrder: answer.map(idOf),
    timing: timingFor(26_000, seed.difficulty),
  };
}

// =============================================================================
// LNG_003 — Sentence Ordering
// =============================================================================
const opensSentence = (text: string) => /^[A-Z]/.test(text);
const closesSentence = (text: string) => /\.$/.test(text);

export interface SentenceOrderingSeed {
  id: string;
  /** Index into SENTENCE_SETS. */
  set: number;
  difficulty: Difficulty;
}

export function sentenceOrdering(seed: SentenceOrderingSeed): SentenceOrderingPuzzle {
  const s = SENTENCE_SETS[seed.set]!;
  const fragments = s.fragments.map((text, i) => ({ id: `frag-${i}`, label: text }));

  const openers = fragments.filter((f) => opensSentence(f.label));
  const closers = fragments.filter((f) => closesSentence(f.label));
  if (openers.length !== 1) throw new Error(`${seed.id}: ${openers.length} fragments start with a capital — exactly one must`);
  if (closers.length !== 1) throw new Error(`${seed.id}: ${closers.length} fragments end with a full stop — exactly one must`);
  if (openers[0]!.id !== 'frag-0') throw new Error(`${seed.id}: the capitalised fragment is not the first`);
  if (closers[0]!.id !== 'frag-3') throw new Error(`${seed.id}: the closing fragment is not the last`);

  const [antecedent, pronoun] = s.hinge;
  const constraints = {
    opensId: 'frag-0',
    closesId: 'frag-3',
    follows: [[`frag-${antecedent}`, `frag-${pronoun}`]] as [string, string][],
  };

  const orders = permutations(fragments.map((f) => f.id)).filter((order) => {
    if (order[0] !== constraints.opensId) return false;
    if (order[order.length - 1] !== constraints.closesId) return false;
    return constraints.follows.every(([a, b]) => order.indexOf(a) < order.indexOf(b));
  });
  if (orders.length !== 1) throw new Error(`${seed.id}: ${orders.length} orderings satisfy the structure — exactly one must`);

  return {
    id: seed.id,
    engineId: 'LNG_003',
    category: 'language-logic',
    engine: 'Sentence Ordering',
    difficulty: seed.difficulty,
    prompt: 'These fragments make one sentence. Tap them in order.',
    explanation:
      'Only one order opens with the capitalised fragment, closes with the full stop, and places the pronoun after the name it refers to.',
    fragments: shuffle(fragments, hash(seed.id)),
    correctOrder: orders[0]!,
    constraints,
    timing: timingFor(24_000, seed.difficulty),
  };
}

// =============================================================================
// ATT_002 — Memory Flash
// =============================================================================

/** Distinct, shape-based, and safe to render. The board never repeats a glyph. */
export const MEMORY_GLYPHS = [...SWEEP_GLYPHS, '◐', '◑'] as const;

/** Targets must not sit in one row, one column, or a contiguous run. */
function targetsAreScattered(indices: number[], columns: number, boardSize: number): boolean {
  const sorted = [...indices].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1);
  if (contiguous) return false;

  const rows = new Set(sorted.map((i) => Math.floor(i / columns)));
  const cols = new Set(sorted.map((i) => i % columns));
  if (rows.size === 1 || cols.size === 1) return false;

  return boardSize > 0;
}

export interface MemoryFlashSeed {
  id: string;
  /** 3–5 glyphs, drawn from MEMORY_GLYPHS. */
  targets: string[];
  boardSize: number;
  columns: number;
  difficulty: Difficulty;
}

export function memoryFlash(seed: MemoryFlashSeed): MemoryFlashPuzzle {
  const exposureMs = MEMORY_EXPOSURE_BY_DIFFICULTY[seed.difficulty];
  if (!exposureMs) throw new Error(`${seed.id}: no exposure band for difficulty ${seed.difficulty}`);
  if (seed.boardSize < seed.targets.length * 2) throw new Error(`${seed.id}: board must hold at least twice the targets`);

  const distractors = MEMORY_GLYPHS.filter((g) => !seed.targets.includes(g)).slice(
    0,
    seed.boardSize - seed.targets.length,
  );
  if (distractors.length + seed.targets.length !== seed.boardSize) throw new Error(`${seed.id}: not enough distinct glyphs for the board`);

  // Lay the board out deterministically, re-seeding until the targets scatter.
  const glyphs = [...seed.targets, ...distractors];
  let laid = glyphs;
  let seedOffset = 0;
  for (; seedOffset < 64; seedOffset++) {
    laid = shuffle(glyphs, hash(seed.id) + seedOffset);
    const indices = seed.targets.map((g) => laid.indexOf(g));
    if (targetsAreScattered(indices, seed.columns, seed.boardSize)) break;
  }
  if (seedOffset === 64) throw new Error(`${seed.id}: could not scatter the targets`);

  const board = laid.map((glyph, i) => ({ id: `tile-${i}`, glyph }));
  const targetIds = seed.targets.map((g) => board.find((t) => t.glyph === g)!.id);
  const orderMatters = seed.difficulty === 5;

  const seconds = (exposureMs / 1000).toFixed(exposureMs % 1000 ? 1 : 0);

  return {
    id: seed.id,
    engineId: 'ATT_002',
    category: 'attention-speed',
    engine: 'Memory Flash',
    difficulty: seed.difficulty,
    prompt: orderMatters ? 'Remember the symbols, then tap them back in order.' : 'Remember the symbols, then find them again.',
    explanation: orderMatters
      ? `${seed.targets.length} symbols for ${seconds} seconds, and the order counts. Accuracy first — a wrong tile cancels a right one.`
      : `${seed.targets.length} symbols for ${seconds} seconds. Accuracy first — a wrong tile cancels a right one.`,
    targets: [...seed.targets],
    board,
    targetIds,
    columns: seed.columns,
    exposureMs,
    intervalMs: MEMORY_INTERVAL_MS,
    orderMatters,
    // The clock covers selection only, so it is generous by design.
    timing: timingFor(9_000, seed.difficulty),
  };
}
