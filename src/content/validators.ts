/**
 * Deterministic validators — one per engine.
 *
 * Every function here re-derives the answer **independently of the builder that
 * produced it**. That independence is the point: if `authoring.ts` and this file
 * shared a helper, a bug in the derivation would validate itself. They must be
 * able to disagree.
 *
 * A validator returns a list of problems. Empty means the puzzle may go to human
 * review. Non-empty means it never does — the pipeline rejects it and reports
 * exactly which rule broke (Core Spec §5: never a silent "best effort").
 *
 * No AI, no heuristics, no randomness. See docs/CONTENT_PIPELINE.md §6.
 */

import type {
  Figure,
  MatrixRule,
  Puzzle,
  ShapeCells,
} from '../types/puzzle';
import { CLASSIFICATION_RULES } from './lexicon';

export type Problem = string;

const ENGINE_CATEGORY: Record<string, string> = {
  OBS_001: 'observation',
  OBS_003: 'observation',
  OBS_004: 'observation',
  PAT_001: 'pattern',
  PAT_002: 'pattern',
  PAT_003: 'pattern',
  LOG_001: 'logic',
  LOG_002: 'logic',
  LOG_003: 'logic',
  LNG_001: 'language-logic',
  LNG_002: 'language-logic',
  LNG_003: 'language-logic',
  ATT_001: 'attention-speed',
  ATT_002: 'attention-speed',
  ATT_003: 'attention-speed',
};

/** Engines whose `options` are text choices. Rotation Match's carry a matrix. */
const TEXT_CHOICE_ENGINES = ['PAT_001', 'PAT_002', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002'];

// =============================================================================
// Shape maths — an independent implementation
// =============================================================================

type Grid = number[][];
const parse = (rows: ShapeCells): Grid => rows.map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
const sig = (g: Grid) => g.map((r) => r.join('')).join('/');
const turn = (g: Grid): Grid => g[0]!.map((_, c) => g.map((r) => r[c]!).reverse());
const flip = (g: Grid): Grid => g.map((r) => [...r].reverse());
const turns = (g: Grid) => {
  const out: string[] = [];
  let x = g;
  for (let i = 0; i < 4; i++) {
    out.push(sig(x));
    x = turn(x);
  }
  return out;
};
const filled = (g: Grid) => g.flat().filter(Boolean).length;

function isConnected(g: Grid): boolean {
  const H = g.length;
  const W = g[0]!.length;
  let start: [number, number] | null = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W && !start; c++) if (g[r]![c]) start = [r, c];
  if (!start) return false;
  const seen = new Set([start.join()]);
  const stack: [number, number][] = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || !g[nr]![nc]) continue;
      const k = `${nr},${nc}`;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return seen.size === filled(g);
}

// =============================================================================
// Balance: brute-force every integer weighting, independently of the seed
// =============================================================================

/** Every distinct subject/unit ratio consistent with the drawn scales. */
export function balanceRatios(
  scales: { left: string[]; right: string[] }[],
  subject: string,
  unit: string,
  maxWeight = 16,
): number[] {
  const glyphs = [...new Set(scales.flatMap((s) => [...s.left, ...s.right]))];
  const sum = (arr: string[], w: Record<string, number>) => arr.reduce((t, g) => t + w[g]!, 0);
  const ratios = new Set<number>();

  const assign = (i: number, w: Record<string, number>) => {
    if (i === glyphs.length) {
      for (const s of scales) if (sum(s.left, w) !== sum(s.right, w)) return;
      ratios.add(w[subject]! / w[unit]!);
      return;
    }
    for (let v = 1; v <= maxWeight; v++) assign(i + 1, { ...w, [glyphs[i]!]: v });
  };
  assign(0, {});
  return [...ratios];
}

// =============================================================================
// Matrix: re-derive the missing figure from the eight visible cells
// =============================================================================

const ATTRS = ['shape', 'count', 'fill'] as const;
const DOMAINS: Record<(typeof ATTRS)[number], readonly unknown[]> = {
  shape: ['circle', 'square', 'diamond'],
  count: [1, 2, 3],
  fill: ['outline', 'half', 'solid'],
};

function deriveMissing(cells: (Figure | null)[], rules: Record<string, MatrixRule>): Figure | Problem {
  const out: Record<string, unknown> = {};

  for (const attr of ATTRS) {
    const rule = rules[attr]!;
    const row2 = [cells[6]![attr], cells[7]![attr]];
    const col2 = [cells[2]![attr], cells[5]![attr]];

    if (rule === 'rowConstant') {
      if (row2[0] !== row2[1]) return `${attr}: not constant along the last row`;
      out[attr] = row2[0];
    } else if (rule === 'colConstant') {
      if (col2[0] !== col2[1]) return `${attr}: not constant down the last column`;
      out[attr] = col2[0];
    } else {
      const inRow = DOMAINS[attr].filter((v) => !row2.includes(v as never));
      const inCol = DOMAINS[attr].filter((v) => !col2.includes(v as never));
      const both = inRow.filter((v) => inCol.includes(v));
      if (both.length !== 1) return `${attr}: Latin square leaves ${both.length} candidates for the blank`;
      out[attr] = both[0];
    }
  }
  return out as unknown as Figure;
}

const sameFigure = (a: Figure, b: Figure) => ATTRS.every((k) => a[k] === b[k]);

// =============================================================================
// The validators
// =============================================================================

/** Rules every puzzle obeys, whatever its engine (Catalog §2.2). */
function validateCommon(p: Puzzle): Problem[] {
  const out: Problem[] = [];

  if (!(p.engineId in ENGINE_CATEGORY)) out.push(`unknown engine id "${p.engineId}"`);
  else if (ENGINE_CATEGORY[p.engineId] !== p.category) out.push(`engine ${p.engineId} does not belong to category ${p.category}`);

  if (!p.prompt.trim()) out.push('empty prompt');
  if (p.explanation.trim().length < 25) out.push('explanation is too short to explain anything');
  if (!/[.!?]$/.test(p.explanation.trim())) out.push('explanation does not end in a full stop');
  if (p.timing.parMs >= p.timing.limitMs) out.push('par time is not before the limit');
  if (p.difficulty < 1 || p.difficulty > 5) out.push(`difficulty ${p.difficulty} outside 1–5`);

  if (TEXT_CHOICE_ENGINES.includes(p.engineId)) {
    const q = p as Extract<Puzzle, { options: { id: string; label: string }[] }>;
    const ids = q.options.map((o) => o.id);
    const labels = q.options.map((o) => o.label.trim());
    if (q.options.length !== 4) out.push(`expected four options, found ${q.options.length}`);
    if (new Set(ids).size !== ids.length) out.push('duplicate option ids');
    if (new Set(labels).size !== labels.length) out.push('duplicate option labels');
    if (!ids.includes(q.correctOptionId)) out.push('correctOptionId names no option');

    // The answer must not be inferable from formatting (Catalog §2.2 rule 3).
    //
    // Only meaningful for prose options. A numeric answer being two digits while
    // a distractor is one digit carries no signal, and a tie for longest carries
    // none either — the cue is being *uniquely and markedly* the longest.
    const numeric = labels.every((l) => /^\d+$/.test(l));
    if (!numeric && labels.length > 1) {
      const correct = q.options.find((o) => o.id === q.correctOptionId)!.label;
      const lengths = labels.map((l) => l.length);
      const longest = Math.max(...lengths);
      const shortest = Math.min(...lengths);
      const uniquelyLongest = lengths.filter((l) => l === longest).length === 1;
      if (uniquelyLongest && correct.length === longest && longest > shortest * 1.6) {
        out.push('the correct option is uniquely and markedly the longest');
      }
    }
  }

  return out;
}

export function validateOddOneOut(p: Extract<Puzzle, { engineId: 'OBS_001' }>): Problem[] {
  const out: Problem[] = [];
  const odd = p.tiles.find((t) => t.id === p.oddTileId);
  if (!odd) return ['oddTileId names no tile'];

  const counts = new Map<string, number>();
  for (const t of p.tiles) counts.set(t.glyph, (counts.get(t.glyph) ?? 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;

  if (counts.size !== 2) out.push(`expected two distinct glyphs, found ${counts.size}`);
  if (counts.get(odd.glyph) !== 1) out.push('the odd glyph appears more than once');
  if (odd.glyph === majority[0]) out.push('the odd tile carries the majority glyph');
  if (p.tiles.length % p.columns !== 0) out.push('grid does not fill complete rows');
  if (new Set(p.tiles.map((t) => t.id)).size !== p.tiles.length) out.push('duplicate tile ids');
  if (p.oddTileId === 'tile-0' || p.oddTileId === `tile-${p.tiles.length - 1}`) out.push('odd tile sits in the first or last position');
  if (p.tiles.length / p.columns < 3) out.push('grid is too shallow to require a scan');
  return out;
}

export function validateRotationMatch(p: Extract<Puzzle, { engineId: 'OBS_003' }>): Problem[] {
  const out: Problem[] = [];
  const target = parse(p.target);
  const rots = turns(target);

  if (new Set(rots).size !== 4) out.push('target has rotational symmetry, so two candidates coincide');
  if (rots.includes(sig(flip(target)))) out.push('target is achiral, so the mirror distractor is also a rotation');
  if (!isConnected(target)) out.push('target is not a single connected shape');

  const opts = p.options.map((o) => ({ id: o.id, g: parse(o.cells) }));
  const rotationOpts = opts.filter((o) => rots.includes(sig(o.g)));

  if (opts.length !== 4) out.push(`expected four candidates, found ${opts.length}`);
  if (rotationOpts.length !== 1) out.push(`${rotationOpts.length} candidates are rotations of the target — exactly one must be`);
  else if (rotationOpts[0]!.id !== p.correctOptionId) out.push('the rotation is not the correct option');

  if (!opts.every((o) => filled(o.g) === filled(target))) out.push('a candidate has a different cell count — it can be eliminated by counting');
  if (new Set(opts.map((o) => sig(o.g))).size !== opts.length) out.push('two candidates are identical');
  if (!opts.every((o) => o.g.length === target.length && o.g[0]!.length === target[0]!.length)) out.push('candidates do not share the target grid size');
  if (!opts.some((o) => sig(o.g) === sig(flip(target)))) out.push('no mirror-image distractor');
  if (!opts.every((o) => isConnected(o.g))) out.push('a candidate is not a single connected shape');
  return out;
}

export function validatePairFind(p: Extract<Puzzle, { engineId: 'OBS_004' }>): Problem[] {
  const out: Problem[] = [];
  const counts = new Map<string, number>();
  for (const t of p.tiles) counts.set(t.glyph, (counts.get(t.glyph) ?? 0) + 1);

  const twice = [...counts.entries()].filter(([, c]) => c === 2);
  if (twice.length !== 1) out.push(`${twice.length} glyphs appear exactly twice — exactly one must`);
  if ([...counts.values()].some((c) => c > 2)) out.push('a glyph appears more than twice');

  const pairGlyphs = p.pairTileIds.map((id) => p.tiles.find((t) => t.id === id)?.glyph);
  if (pairGlyphs[0] !== pairGlyphs[1]) out.push('pairTileIds name two different glyphs');
  if (twice[0] && pairGlyphs[0] !== twice[0][0]) out.push('pairTileIds do not name the repeated glyph');
  if (p.tiles.length % p.columns !== 0) out.push('grid does not fill complete rows');
  if (new Set(p.tiles.map((t) => t.id)).size !== p.tiles.length) out.push('duplicate tile ids');

  const pos = p.pairTileIds.map((id) => p.tiles.findIndex((t) => t.id === id));
  const rc = pos.map((i) => [Math.floor(i / p.columns), i % p.columns]);
  if (rc[0]![0] === rc[1]![0]) out.push('the pair shares a row');
  if (rc[0]![1] === rc[1]![1]) out.push('the pair shares a column');
  if (Math.abs(rc[0]![0] - rc[1]![0]) <= 1 && Math.abs(rc[0]![1] - rc[1]![1]) <= 1) out.push('the pair is adjacent');
  return out;
}

export function validateSequence(p: Extract<Puzzle, { engineId: 'PAT_001' }>): Problem[] {
  const out: Problem[] = [];
  if (p.sequence.length < 4) out.push('too few visible terms to fix a rule');
  if (p.sequence.length > 5) out.push('sequence will wrap on a 320dp screen');
  if (p.sequence.some((t) => t.length > 3)) out.push('a term is too wide for the chip row');
  if (new Set(p.sequence).size !== p.sequence.length && p.sequence[0] !== p.sequence[1]) {
    out.push('the visible run repeats a term');
  }

  const values = p.options.map((o) => Number(o.label));
  if (values.some((v) => !Number.isFinite(v))) out.push('a non-numeric option');
  if (values.some((v) => v <= 0)) out.push('a non-positive option');
  if (new Set(values).size !== values.length) out.push('two options share a value');

  // A distractor must never already appear in the visible run.
  const shown = new Set(p.sequence.map(Number));
  for (const o of p.options) if (o.id !== p.correctOptionId && shown.has(Number(o.label))) out.push(`distractor ${o.label} already appears in the sequence`);
  return out;
}

export function validateMatrix(p: Extract<Puzzle, { engineId: 'PAT_002' }>): Problem[] {
  const out: Problem[] = [];
  if (p.cells.length !== 9 || p.cells[8] !== null) return ['the grid must be nine cells with the last one blank'];
  if (!p.cells.slice(0, 8).every(Boolean)) return ['a visible cell is missing'];

  const derived = deriveMissing(p.cells, p.rules);
  if (typeof derived === 'string') return [derived];

  for (const attr of ATTRS) {
    const seen = new Set(p.cells.slice(0, 8).map((c) => c![attr]));
    if (seen.size < 2) out.push(`${attr} is constant across the grid — it is decoration, not a rule`);
  }

  const correct = p.optionFigures[p.correctOptionId];
  if (!correct) out.push('correctOptionId names no figure');
  else if (!sameFigure(correct, derived)) out.push('the correct option is not the figure the rules derive');

  const figures = p.options.map((o) => p.optionFigures[o.id]!);
  const satisfying = figures.filter((f) => sameFigure(f, derived));
  if (satisfying.length !== 1) out.push(`${satisfying.length} options satisfy every rule — exactly one must`);
  if (new Set(figures.map((f) => JSON.stringify(f))).size !== figures.length) out.push('two options are the same figure');

  for (const o of p.options) {
    if (o.id === p.correctOptionId) continue;
    const differing = ATTRS.filter((a) => p.optionFigures[o.id]![a] !== derived[a]).length;
    if (differing !== 1) out.push(`distractor ${o.id} differs in ${differing} attributes — it must differ in exactly one`);
  }
  return out;
}

export function validateDeduction(p: Extract<Puzzle, { engineId: 'LOG_001' }>): Problem[] {
  const out: Problem[] = [];
  if (p.premises.length < 2) out.push('fewer than two premises');
  if (p.premises.some((s) => s.split(/\s+/).length > 18)) out.push('a premise is longer than 18 words');
  if (p.options.some((o) => o.label.split(/\s+/).length > 14)) out.push('an option is longer than 14 words');
  if (p.premises.some((s) => !/[.]$/.test(s.trim()))) out.push('a premise does not end in a full stop');

  // The conclusion must not be a verbatim premise — except for the restatement
  // trap, where that *is* the answer, and the explanation must say so.
  const correct = p.options.find((o) => o.id === p.correctOptionId)!.label;
  const isRestatement = p.premises.some((s) => s.trim() === correct.trim());
  if (isRestatement && !/restated|only the first statement/i.test(p.explanation)) {
    out.push('the answer restates a premise but the explanation does not say why that is the point');
  }
  return out;
}

export function validateBalance(p: Extract<Puzzle, { engineId: 'LOG_002' }>): Problem[] {
  const out: Problem[] = [];
  if (p.scales.length < 2) out.push('fewer than two scales');
  if (p.scales.some((s) => !s.left.length || !s.right.length)) out.push('a scale has an empty pan');

  const together = p.scales.some(
    (s) => [...s.left, ...s.right].includes(p.query.subject) && [...s.left, ...s.right].includes(p.query.unit),
  );
  if (together) out.push('subject and unit share a scale — the answer can be read off without substituting');

  const ratios = balanceRatios(p.scales, p.query.subject, p.query.unit);
  if (ratios.length === 0) out.push('the scales admit no consistent integer weighting');
  else if (ratios.length > 1) out.push(`the scales admit ${ratios.length} different ratios — the answer is not unique`);
  else {
    const ratio = ratios[0]!;
    if (!Number.isInteger(ratio) || ratio <= 0) out.push(`the ratio ${ratio} is not a positive integer`);
    const correct = Number(p.options.find((o) => o.id === p.correctOptionId)!.label);
    if (correct !== ratio) out.push(`the correct option (${correct}) is not the solved ratio (${ratio})`);
    const values = p.options.map((o) => Number(o.label));
    if (values.filter((v) => v === ratio).length !== 1) out.push('the ratio appears as more than one option');
    if (values.some((v) => !Number.isInteger(v) || v <= 0)) out.push('an option is not a positive integer');
  }
  return out;
}

export function validateAnalogy(p: Extract<Puzzle, { engineId: 'LNG_001' }>): Problem[] {
  const out: Problem[] = [];
  if (p.relation.length !== 2) out.push('relation must render as two lines');
  if (p.options.some((o) => /\s/.test(o.label))) out.push('an option is more than one word');
  if (p.options.some((o) => !/^[A-Z]{3,12}$/.test(o.label))) out.push('an option is outside the common-word band (3–12 letters, uppercase)');
  const words = p.relation.join(' ');
  for (const o of p.options) if (words.includes(o.label)) out.push(`option ${o.label} already appears in the relation`);
  return out;
}

export function validateOddWordOut(p: Extract<Puzzle, { engineId: 'LNG_002' }>): Problem[] {
  const out: Problem[] = [];
  const words = p.options.map((o) => o.label);
  if (words.length !== 4) out.push('expected four words');
  if (!words.every((w) => Array.isArray(p.membership[w]))) return ['membership does not cover every option'];
  if (!words.every((w) => /^[A-Z]{3,12}$/.test(w))) out.push('a word is outside the common-word band');

  // Leave-one-out: the other three must share a category the removed word lacks.
  const outliers = words.filter((candidate) => {
    const rest = words.filter((w) => w !== candidate);
    const shared = p.membership[rest[0]!]!.filter((c) => rest.every((w) => p.membership[w]!.includes(c)));
    return shared.some((c) => !p.membership[candidate]!.includes(c));
  });

  if (outliers.length !== 1) out.push(`${outliers.length} words qualify as the odd one out — exactly one must`);
  else if (p.options.find((o) => o.id === p.correctOptionId)!.label !== outliers[0]) out.push('the correct option is not the odd word');
  return out;
}

export function validateSweep(p: Extract<Puzzle, { engineId: 'ATT_001' }>): Problem[] {
  const out: Problem[] = [];
  const targets = p.symbols.filter((s) => s.isTarget);
  const distractors = new Set(p.symbols.filter((s) => !s.isTarget).map((s) => s.glyph));

  if (targets.length < 5) out.push('fewer than five targets');
  if (p.symbols.length - targets.length < targets.length) out.push('fewer distractors than targets');
  if (distractors.size < 2) out.push('only one distractor glyph — this is a counting task, not a sweep');
  if (!p.symbols.every((s) => s.isTarget === (s.glyph === p.targetGlyph))) out.push('isTarget disagrees with the target glyph');
  if (p.symbols.length % p.columns !== 0) out.push('grid does not fill complete rows');
  if (new Set(p.symbols.map((s) => s.id)).size !== p.symbols.length) out.push('duplicate symbol ids');
  if (!p.prompt.includes(p.targetGlyph)) out.push('the prompt does not name the target glyph');
  if (p.durationMs < p.timing.limitMs) out.push('the window is shorter than the scoring limit');
  if (p.columns > 5) out.push('more than five columns falls below 48dp at 320dp width');
  return out;
}

export function validateClassification(p: Extract<Puzzle, { engineId: 'ATT_003' }>): Problem[] {
  const out: Problem[] = [];
  const rule = Object.values(CLASSIFICATION_RULES).find((r) => r.question === p.rule);
  if (!rule) return [`the rule "${p.rule}" is not in the curated table`];

  if (p.buckets[0] !== rule.buckets[0] || p.buckets[1] !== rule.buckets[1]) out.push('buckets do not match the curated rule');
  if (p.items.length < 6) out.push('too few items to find a rhythm');
  if (new Set(p.items.map((i) => i.id)).size !== p.items.length) out.push('duplicate item ids');
  if (!p.items.every((i) => rule.alphabet.includes(i.glyph))) out.push('an item uses a glyph outside the curated alphabet');
  if (!p.items.every((i) => i.bucket === rule.bucketOf(i.glyph))) out.push('an item is filed in the wrong bucket');
  if (p.durationMs < p.timing.limitMs) out.push('the window is shorter than the scoring limit');

  const share = p.items.filter((i) => i.bucket === 0).length / p.items.length;
  if (share < 0.4 || share > 0.6) out.push(`buckets are ${Math.round(share * 100)}/${100 - Math.round(share * 100)} — one-sided tapping could win`);
  return out;
}


// =============================================================================
// PAT_003 Sequence Repair — the subtlest validator in the catalog
// =============================================================================

/**
 * An independent reimplementation of the approved rule families.
 *
 * It must not import the builder's recognisers. If the two shared code, a bug in
 * the derivation would validate itself — which is the one failure this whole
 * pipeline exists to prevent.
 */
const RULES_FOR_REPAIR: ((t: number[]) => boolean)[] = [
  (t) => {
    const step = t[1]! - t[0]!;
    return step !== 0 && t.every((v, i) => i === 0 || v - t[i - 1]! === step);
  },
  (t) => {
    if (!t[0]) return false;
    const ratio = t[1]! / t[0]!;
    return Number.isInteger(ratio) && ratio >= 2 && t.every((v, i) => i === 0 || v === t[i - 1]! * ratio);
  },
  (t) => t.length >= 3 && t.every((v, i) => i < 2 || v === t[i - 1]! + t[i - 2]!),
  (t) => {
    const root = Math.round(Math.sqrt(t[0]!));
    return root >= 1 && root ** 2 === t[0]! && t.every((v, i) => v === (root + i) ** 2);
  },
  (t) => {
    const n = Math.round((Math.sqrt(8 * t[0]! + 1) - 1) / 2);
    return n >= 1 && (n * (n + 1)) / 2 === t[0]! && t.every((v, i) => v === ((n + i) * (n + i + 1)) / 2);
  },
  (t) => {
    const n = Math.round((Math.sqrt(4 * t[0]! + 1) - 1) / 2);
    return n >= 1 && n * (n + 1) === t[0]! && t.every((v, i) => v === (n + i) * (n + i + 1));
  },
];

const obeysARule = (terms: number[]) =>
  terms.every((v) => Number.isInteger(v) && v > 0 && v <= 999) && RULES_FOR_REPAIR.some((fits) => fits(terms));

/** Every position at which some single replacement restores a valid rule. */
function repairable(terms: number[]): number[] {
  const out: number[] = [];
  for (let j = 0; j < terms.length; j++) {
    for (let v = 1; v <= 999; v++) {
      if (v === terms[j]) continue;
      const trial = [...terms];
      trial[j] = v;
      if (obeysARule(trial)) {
        out.push(j);
        break;
      }
    }
  }
  return out;
}

export function validateSequenceRepair(p: Extract<Puzzle, { engineId: 'PAT_003' }>): Problem[] {
  const out: Problem[] = [];
  const terms = p.terms.map(Number);

  if (terms.length !== 6) out.push(`expected six terms, found ${terms.length}`);
  if (terms.some((t) => !Number.isInteger(t) || t <= 0)) out.push('a term is not a positive integer');
  if (p.terms.some((t) => t.length > 3)) out.push('a term is too wide for the chip row at 320dp');
  if (p.wrongIndex === 0 || p.wrongIndex === terms.length - 1) {
    out.push('the corrupted term is first or last — either can be "repaired" by shortening the run');
  }
  if (String(terms[p.wrongIndex]) === p.correctTerm) out.push('the corrupted term equals the correct term');

  // Repairing the named term must restore a rule…
  const repaired = [...terms];
  repaired[p.wrongIndex] = Number(p.correctTerm);
  if (!obeysARule(repaired)) out.push('replacing the named term does not restore any approved rule');

  // …and no other single-term repair may do so.
  const positions = repairable(terms);
  if (positions.length !== 1) {
    out.push(`${positions.length} positions admit a single-term repair (${positions.join(', ')}) — exactly one must`);
  } else if (positions[0] !== p.wrongIndex) {
    out.push(`the repairable position is ${positions[0]}, not the named ${p.wrongIndex}`);
  }

  // Bounded corruption: findable, but not obvious.
  const correct = Number(p.correctTerm);
  const delta = Math.abs(terms[p.wrongIndex]! - correct);
  if (delta === 0) out.push('the corruption has zero magnitude');
  if (correct >= 10 && delta / correct > 0.5) out.push('the corruption is more than half the correct value — too obvious');

  return out;
}

// =============================================================================
// LOG_003 Ordering
// =============================================================================

const allOrders = <T>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => allOrders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));

/**
 * Clues are stored as rendered English, so the validator parses them back. That
 * is deliberate: it checks what the *player reads*, not what the author meant.
 */
function clueSatisfied(clue: string, order: string[], labelOf: (id: string) => string): boolean | null {
  const names = order.map(labelOf);

  let m = clue.match(/^(\S+) \S+ before (\S+)\.$/);
  if (m) return names.indexOf(m[1]!) < names.indexOf(m[2]!);

  m = clue.match(/^(\S+) was first\.$/);
  if (m) return names[0] === m[1];

  m = clue.match(/^(\S+) was last\.$/);
  if (m) return names[names.length - 1] === m[1];

  m = clue.match(/^(\S+) was not first\.$/);
  if (m) return names[0] !== m[1];

  m = clue.match(/^(\S+) was not last\.$/);
  if (m) return names[names.length - 1] !== m[1];

  return null; // unparseable
}

export function validateOrdering(p: Extract<Puzzle, { engineId: 'LOG_003' }>): Problem[] {
  const out: Problem[] = [];
  const ids = p.items.map((i) => i.id);
  const labelOf = (id: string) => p.items.find((i) => i.id === id)!.label;

  if (p.items.length !== 4) out.push(`expected four items, found ${p.items.length}`);
  if (new Set(ids).size !== ids.length) out.push('duplicate item ids');
  if (new Set(p.items.map((i) => i.label)).size !== p.items.length) out.push('duplicate item labels');
  if (p.clues.length < 3) out.push('fewer than three clues');
  if (p.clues.some((c) => c.split(/\s+/).length > 12)) out.push('a clue is longer than 12 words');

  for (const clue of p.clues) {
    if (clueSatisfied(clue, ids, labelOf) === null) out.push(`unparseable clue: "${clue}"`);
    // Every name a clue mentions must be an item.
    for (const word of clue.replace(/[.]/g, '').split(/\s+/)) {
      if (/^[A-Z][a-z]+$/.test(word) && !p.items.some((i) => i.label === word)) {
        out.push(`clue names "${word}", which is not one of the items`);
      }
    }
  }
  if (out.length) return out;

  const satisfying = allOrders(ids).filter((order) => p.clues.every((c) => clueSatisfied(c, order, labelOf) === true));
  if (satisfying.length !== 1) out.push(`${satisfying.length} orderings satisfy the clues — exactly one must`);
  else if (satisfying[0]!.join() !== p.correctOrder.join()) out.push('correctOrder is not the ordering the clues imply');

  // Every clue load-bearing: drop one, and a second ordering must appear.
  for (let i = 0; i < p.clues.length; i++) {
    const without = p.clues.filter((_, j) => j !== i);
    const count = allOrders(ids).filter((order) => without.every((c) => clueSatisfied(c, order, labelOf) === true)).length;
    if (count === 1) out.push(`clue ${i + 1} is redundant — the answer stays unique without it`);
  }

  return out;
}

// =============================================================================
// LNG_003 Sentence Ordering
// =============================================================================

const LEADING_CONNECTIVE = /^(and|so|but|because|which|where|while|until|though|although)\b/i;

export function validateSentenceOrdering(p: Extract<Puzzle, { engineId: 'LNG_003' }>): Problem[] {
  const out: Problem[] = [];
  const ids = p.fragments.map((f) => f.id);
  const textOf = (id: string) => p.fragments.find((f) => f.id === id)!.label;

  if (p.fragments.length !== 4) out.push(`expected four fragments, found ${p.fragments.length}`);
  if (new Set(ids).size !== ids.length) out.push('duplicate fragment ids');
  if (p.fragments.some((f) => f.label.split(/\s+/).length > 6 + 2)) out.push('a fragment is too long to stay legible at 320dp');

  const capitalised = p.fragments.filter((f) => /^[A-Z]/.test(f.label));
  const terminal = p.fragments.filter((f) => /\.$/.test(f.label));
  if (capitalised.length !== 1) out.push(`${capitalised.length} fragments start with a capital — exactly one must`);
  if (terminal.length !== 1) out.push(`${terminal.length} fragments end with a full stop — exactly one must`);
  if (capitalised[0] && capitalised[0].id !== p.constraints.opensId) out.push('the capitalised fragment is not the declared opener');
  if (terminal[0] && terminal[0].id !== p.constraints.closesId) out.push('the terminal fragment is not the declared closer');

  // A fragment that starts with a connective can never open the sentence.
  if (LEADING_CONNECTIVE.test(textOf(p.constraints.opensId))) out.push('the opening fragment starts with a connective');

  for (const [a, b] of p.constraints.follows) {
    if (!ids.includes(a) || !ids.includes(b)) out.push('a follows-constraint names an unknown fragment');
  }
  if (out.length) return out;

  const satisfying = allOrders(ids).filter((order) => {
    if (order[0] !== p.constraints.opensId) return false;
    if (order[order.length - 1] !== p.constraints.closesId) return false;
    return p.constraints.follows.every(([a, b]) => order.indexOf(a) < order.indexOf(b));
  });

  if (satisfying.length !== 1) out.push(`${satisfying.length} orderings satisfy the structure — exactly one must`);
  else if (satisfying[0]!.join() !== p.correctOrder.join()) out.push('correctOrder is not the ordering the constraints imply');

  // The assembled sentence must actually read as one sentence.
  const assembled = p.correctOrder.map(textOf).join(' ');
  if (!/^[A-Z]/.test(assembled)) out.push('the assembled sentence does not begin with a capital');
  if (!/\.$/.test(assembled)) out.push('the assembled sentence does not end with a full stop');

  return out;
}

// =============================================================================
// ATT_002 Memory Flash
// =============================================================================

export function validateMemoryFlash(p: Extract<Puzzle, { engineId: 'ATT_002' }>): Problem[] {
  const out: Problem[] = [];
  const boardGlyphs = p.board.map((t) => t.glyph);

  if (p.targets.length < 3 || p.targets.length > 5) out.push(`${p.targets.length} targets — the band is 3 to 5`);
  if (p.board.length < p.targets.length * 2) out.push('the board holds fewer than twice the targets');
  if (new Set(boardGlyphs).size !== boardGlyphs.length) out.push('the board repeats a glyph');
  if (new Set(p.board.map((t) => t.id)).size !== p.board.length) out.push('duplicate board tile ids');
  if (p.board.length % p.columns !== 0) out.push('the board does not fill complete rows');
  if (p.columns > 4) out.push('more than four columns falls below 48dp at 320dp width');

  for (const glyph of p.targets) {
    const hits = boardGlyphs.filter((g) => g === glyph).length;
    if (hits !== 1) out.push(`target ${glyph} appears ${hits} times on the board — it must appear exactly once`);
  }

  if (new Set(p.targets).size !== p.targets.length) out.push('a target is repeated in the exposure');
  if (p.targetIds.length !== p.targets.length) out.push('targetIds does not match the targets');
  for (let i = 0; i < p.targets.length; i++) {
    const tile = p.board.find((t) => t.id === p.targetIds[i]);
    if (!tile) out.push(`targetIds[${i}] names no board tile`);
    else if (tile.glyph !== p.targets[i]) out.push(`targetIds[${i}] points at ${tile.glyph}, not ${p.targets[i]}`);
  }

  // §13: the exposure floor is generous because saccade latency varies widely.
  if (p.exposureMs < 1500) out.push(`exposure ${p.exposureMs}ms is below the 1500ms floor`);
  if (p.intervalMs < 300 || p.intervalMs > 1200) out.push(`interval ${p.intervalMs}ms outside the 300–1200ms band`);
  if (p.orderMatters !== (p.difficulty === 5)) out.push('order only matters at difficulty 5');

  // A target layout that forms a row, a column, or a contiguous run leaks the set.
  const indices = p.targetIds.map((id) => p.board.findIndex((t) => t.id === id)).sort((a, b) => a - b);
  if (indices.every((v, i) => i === 0 || v === indices[i - 1]! + 1)) out.push('the targets sit in a contiguous run');
  if (new Set(indices.map((i) => Math.floor(i / p.columns))).size === 1) out.push('every target sits in one row');
  if (new Set(indices.map((i) => i % p.columns)).size === 1) out.push('every target sits in one column');

  return out;
}

// =============================================================================

/** Runs the common rules plus the engine's own. Empty ⇒ eligible for review. */
export function validatePuzzle(p: Puzzle): Problem[] {
  const out = validateCommon(p);

  switch (p.engineId) {
    case 'OBS_001': out.push(...validateOddOneOut(p)); break;
    case 'OBS_003': out.push(...validateRotationMatch(p)); break;
    case 'OBS_004': out.push(...validatePairFind(p)); break;
    case 'PAT_001': out.push(...validateSequence(p)); break;
    case 'PAT_002': out.push(...validateMatrix(p)); break;
    case 'PAT_003': out.push(...validateSequenceRepair(p)); break;
    case 'LOG_001': out.push(...validateDeduction(p)); break;
    case 'LOG_002': out.push(...validateBalance(p)); break;
    case 'LOG_003': out.push(...validateOrdering(p)); break;
    case 'LNG_001': out.push(...validateAnalogy(p)); break;
    case 'LNG_002': out.push(...validateOddWordOut(p)); break;
    case 'LNG_003': out.push(...validateSentenceOrdering(p)); break;
    case 'ATT_001': out.push(...validateSweep(p)); break;
    case 'ATT_002': out.push(...validateMemoryFlash(p)); break;
    case 'ATT_003': out.push(...validateClassification(p)); break;
  }
  return out;
}

/** Every problem in the library, keyed by puzzle id. Empty map ⇒ library is clean. */
export function validateLibrary(puzzles: Puzzle[]): Record<string, Problem[]> {
  const report: Record<string, Problem[]> = {};
  for (const p of puzzles) {
    const problems = validatePuzzle(p);
    if (problems.length) report[p.id] = problems;
  }
  return report;
}
