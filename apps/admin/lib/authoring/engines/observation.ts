/**
 * Observation authoring schemas (Phase 7H.3.2A): OBS_001 Odd One Out,
 * OBS_003 Rotation Match, OBS_004 Pair Find. Pure data + functions — no JSX.
 *
 * The forms offer ONLY approved curated inputs (AUTHORING_VOCAB); the canonical
 * builder + validator (through buildCandidateAction) remain the source of truth.
 * clientValidate is a fast usability pre-check, never the gate.
 */

import { AUTHORING_VOCAB } from '../canonical.generated.mjs';
import type { ClientCheck, EngineFormSchema, FieldOption, PreviewModel } from './types';
import { rejectUnknownFields } from './types';

const DIFFICULTY_FIELD = {
  key: 'difficulty',
  kind: 'difficulty' as const,
  label: 'Difficulty',
  required: true,
  min: 1,
  max: 5,
  help: 'Sets the time envelope. 1 = gentlest, 5 = hardest.',
};

const familyOptions = (): FieldOption[] =>
  Object.entries(AUTHORING_VOCAB.glyphFamilies).map(([name, glyphs]) => ({
    value: name,
    label: `${name} (${glyphs.join(' ')})`,
  }));

const glyphIndexOptions = (family: string): FieldOption[] => {
  const glyphs = AUTHORING_VOCAB.glyphFamilies[family] ?? [];
  return glyphs.map((g, i) => ({ value: String(i), label: `${i}: ${g}`, glyph: g }));
};

const num = (v: unknown) => Number(v);
const isInt = (v: unknown) => Number.isInteger(Number(v));
const ok = (): ClientCheck => ({ ok: true, fieldErrors: {}, formErrors: [] });
const fail = (fieldErrors: Record<string, string>, formErrors: string[] = []): ClientCheck => ({
  ok: Object.keys(fieldErrors).length === 0 && formErrors.length === 0,
  fieldErrors,
  formErrors,
});

// ── OBS_001 Odd One Out ──────────────────────────────────────────────────────
interface OddForm {
  family: string;
  majority: number;
  odd: number;
  tiles: number;
  columns: number;
  oddIndex: number;
  difficulty: number;
}

export const OBS_001_SCHEMA: EngineFormSchema<OddForm> = {
  engineId: 'OBS_001',
  category: 'observation',
  displayName: 'Odd One Out',
  schemaVersion: 1,
  defaultForm: { family: 'halfCircles', majority: 0, odd: 1, tiles: 12, columns: 4, oddIndex: 5, difficulty: 2 },
  fieldGroups: [
    {
      title: 'Glyphs',
      description: 'Every tile shows the same family glyph; exactly one is turned the other way.',
      fields: [
        { key: 'family', kind: 'select', label: 'Glyph family', required: true, options: familyOptions(), help: 'Approved Odd-One-Out families only.' },
        { key: 'majority', kind: 'select', label: 'Majority glyph', required: true, options: glyphIndexOptions('halfCircles'), help: 'The glyph most tiles carry.' },
        { key: 'odd', kind: 'select', label: 'Odd glyph', required: true, options: glyphIndexOptions('halfCircles'), help: 'Must differ from the majority glyph.' },
      ],
    },
    {
      title: 'Grid',
      fields: [
        { key: 'tiles', kind: 'number', label: 'Tiles', required: true, min: 9, max: 24, step: 1, help: 'Must fill complete rows and be at least 3 rows deep.' },
        { key: 'columns', kind: 'number', label: 'Columns', required: true, min: 3, max: 5, step: 1 },
        { key: 'oddIndex', kind: 'number', label: 'Odd tile position', required: true, min: 1, step: 1, help: 'Zero-based; never first or last.' },
      ],
    },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    family: f.family,
    majority: num(f.majority),
    odd: num(f.odd),
    tiles: num(f.tiles),
    columns: num(f.columns),
    oddIndex: num(f.oddIndex),
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    family: s.family,
    majority: s.majority,
    odd: s.odd,
    tiles: s.tiles,
    columns: s.columns,
    oddIndex: s.oddIndex,
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['family', 'majority', 'odd', 'tiles', 'columns', 'oddIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!AUTHORING_VOCAB.glyphFamilies[f.family]) fe.family = 'Unknown glyph family.';
    if (num(f.majority) === num(f.odd)) fe.odd = 'The odd glyph must differ from the majority glyph.';
    if (!isInt(f.tiles) || !isInt(f.columns) || num(f.columns) <= 0) fe.tiles = 'Tiles and columns must be whole numbers.';
    else {
      if (num(f.tiles) % num(f.columns) !== 0) fe.tiles = 'Tiles must fill complete rows (divisible by columns).';
      if (num(f.tiles) / num(f.columns) < 3) fe.tiles = 'The grid must be at least 3 rows deep to require a scan.';
    }
    if (num(f.oddIndex) <= 0 || num(f.oddIndex) >= num(f.tiles) - 1) fe.oddIndex = 'The odd tile may not be first or last.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const tiles = pub.tiles as { id: string; glyph: string }[] | undefined;
    if (!Array.isArray(tiles) || typeof pub.columns !== 'number') throw new Error('OBS_001 preview: malformed payload');
    const oddId = answer?.oddTileId as string | undefined;
    return {
      kind: 'tile-grid',
      columns: pub.columns as number,
      tiles: tiles.map((t) => ({ glyph: t.glyph, highlight: oddId ? t.id === oddId : undefined })),
    } satisfies PreviewModel;
  },
  helpText: 'Choose a family and two of its glyphs (majority vs odd), a grid that fills complete rows and is ≥3 deep, and where the odd tile sits (never first/last).',
  accessibilityNotes: ['Difference is orientation, never colour.', 'Tiles stay ≥48dp; keep columns ≤5.'],
  smallScreenNotes: ['≤5 columns keeps tiles readable at 320dp.'],
  approvedInputs: ['GLYPH_FAMILIES (Odd-One-Out families)'],
};

// ── OBS_003 Rotation Match ───────────────────────────────────────────────────
interface RotForm {
  gridH: number;
  gridW: number;
  cells: number;
  shape: number;
  turns: number;
  correctIndex: number;
  difficulty: number;
}

export const OBS_003_SCHEMA: EngineFormSchema<RotForm> = {
  engineId: 'OBS_003',
  category: 'observation',
  displayName: 'Rotation Match',
  schemaVersion: 1,
  defaultForm: { gridH: 3, gridW: 3, cells: 4, shape: 0, turns: 1, correctIndex: 0, difficulty: 2 },
  fieldGroups: [
    {
      title: 'Target shape',
      description: 'The target is chosen from the connected, chiral, rotationally-asymmetric shape pool for the grid. The builder derives the mirror + moved-cell distractors so cell-count can never solve it.',
      fields: [
        { key: 'gridH', kind: 'number', label: 'Grid rows', required: true, min: 3, max: 4, step: 1 },
        { key: 'gridW', kind: 'number', label: 'Grid columns', required: true, min: 3, max: 4, step: 1 },
        { key: 'cells', kind: 'number', label: 'Filled cells', required: true, min: 3, max: 8, step: 1, help: 'Every candidate has the same cell count.' },
        { key: 'shape', kind: 'number', label: 'Shape index', required: true, min: 0, step: 1, help: 'Index into the shape pool; the preview shows the chosen target.' },
      ],
    },
    {
      title: 'Answer',
      fields: [
        { key: 'turns', kind: 'number', label: 'Quarter turns', required: true, min: 1, max: 3, step: 1, help: '1, 2 or 3 clockwise quarter-turns to the correct candidate.' },
        { key: 'correctIndex', kind: 'number', label: 'Correct slot', required: true, min: 0, max: 3, step: 1 },
      ],
    },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    grid: [num(f.gridH), num(f.gridW)],
    cells: num(f.cells),
    shape: num(f.shape),
    turns: num(f.turns),
    correctIndex: num(f.correctIndex),
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    gridH: s.grid[0],
    gridW: s.grid[1],
    cells: s.cells,
    shape: s.shape,
    turns: s.turns,
    correctIndex: s.correctIndex,
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['gridH', 'gridW', 'cells', 'shape', 'turns', 'correctIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (num(f.gridH) < 3 || num(f.gridH) > 4 || num(f.gridW) < 3 || num(f.gridW) > 4) fe.gridH = 'Grid is 3×3 or 4×4.';
    if (num(f.cells) < 3 || num(f.cells) >= num(f.gridH) * num(f.gridW)) fe.cells = 'Filled cells must fit the grid and leave room.';
    if (num(f.shape) < 0 || !isInt(f.shape)) fe.shape = 'Shape index is a non-negative integer.';
    if (![1, 2, 3].includes(num(f.turns))) fe.turns = 'Turns must be 1, 2 or 3.';
    if (num(f.correctIndex) < 0 || num(f.correctIndex) > 3) fe.correctIndex = 'Correct slot is 0–3.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const target = pub.target as string[] | undefined;
    const options = pub.options as { id: string; cells: string[] }[] | undefined;
    if (!Array.isArray(target) || !Array.isArray(options)) throw new Error('OBS_003 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return {
      kind: 'shape-options',
      target,
      options: options.map((o) => ({ id: o.id, cells: o.cells, correct: correctId ? o.id === correctId : undefined })),
    } satisfies PreviewModel;
  },
  helpText: 'Pick a grid, cell count and a shape index from the pool; set which slot holds the rotation and by how many quarter-turns. Distractors (mirror, moved cell, different shape) are derived so counting cells can never solve it.',
  accessibilityNotes: ['All candidates share a cell count — no counting shortcut.', 'Shapes are single connected forms.'],
  smallScreenNotes: ['Grids render at 320dp and 390dp; 4×4 is the ceiling.'],
  approvedInputs: ['Derived shape pool (connected/chiral/asymmetric)'],
};

// ── OBS_004 Pair Find ────────────────────────────────────────────────────────
interface PairForm {
  pair: string;
  others: string[];
  columns: number;
  at0: number;
  at1: number;
  difficulty: number;
}

export const OBS_004_SCHEMA: EngineFormSchema<PairForm> = {
  engineId: 'OBS_004',
  category: 'observation',
  displayName: 'Pair Find',
  schemaVersion: 1,
  defaultForm: {
    pair: AUTHORING_VOCAB.pairGlyphs[0],
    others: AUTHORING_VOCAB.pairGlyphs.slice(1, 8) as string[],
    columns: 3,
    at0: 2,
    at1: 7,
    difficulty: 2,
  },
  fieldGroups: [
    {
      title: 'Glyphs',
      description: 'Exactly one glyph appears twice; every other glyph appears once. Approved Pair-Find alphabet only — no free Unicode.',
      fields: [
        { key: 'pair', kind: 'glyph', label: 'Repeated glyph', required: true, glyphSource: AUTHORING_VOCAB.pairGlyphs as string[] },
        { key: 'others', kind: 'glyph-multi', label: 'Other glyphs', required: true, glyphSource: AUTHORING_VOCAB.pairGlyphs as string[], selectCount: null, help: 'Distinct glyphs filling the rest of the board. Count = tiles − 2. Must not include the repeated glyph.' },
      ],
    },
    {
      title: 'Layout',
      fields: [
        { key: 'columns', kind: 'number', label: 'Columns', required: true, min: 3, max: 5, step: 1 },
        { key: 'at0', kind: 'number', label: 'First match tile', required: true, min: 0, step: 1, help: 'Zero-based tile index.' },
        { key: 'at1', kind: 'number', label: 'Second match tile', required: true, min: 0, step: 1, help: 'Different row AND column from the first; not adjacent.' },
      ],
    },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    pair: f.pair,
    others: [...f.others],
    columns: num(f.columns),
    at: [num(f.at0), num(f.at1)],
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    pair: s.pair,
    others: [...s.others],
    columns: s.columns,
    at0: s.at[0],
    at1: s.at[1],
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['pair', 'others', 'columns', 'at0', 'at1', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    const approved = new Set(AUTHORING_VOCAB.pairGlyphs);
    const tiles = (f.others?.length ?? 0) + 2;
    if (!approved.has(f.pair)) fe.pair = 'Choose an approved glyph.';
    if (!Array.isArray(f.others) || f.others.some((g) => !approved.has(g))) fe.others = 'All glyphs must be from the approved alphabet.';
    else if (new Set(f.others).size !== f.others.length) fe.others = 'Other glyphs must be distinct.';
    else if (f.others.includes(f.pair)) fe.others = 'The other glyphs must not include the repeated glyph.';
    if (num(f.columns) < 3 || num(f.columns) > 5) fe.columns = 'Columns 3–5.';
    if (tiles % num(f.columns) !== 0) fe.columns = 'Tiles (others + 2) must fill complete rows.';
    const c = num(f.columns);
    const rc = (i: number) => [Math.floor(i / c), i % c];
    const [r0, c0] = rc(num(f.at0));
    const [r1, c1] = rc(num(f.at1));
    if (num(f.at0) < 0 || num(f.at1) < 0 || num(f.at0) >= tiles || num(f.at1) >= tiles) fe.at1 = 'Match tiles must be on the board.';
    else if (r0 === r1) fe.at1 = 'The two match tiles may not share a row.';
    else if (c0 === c1) fe.at1 = 'The two match tiles may not share a column.';
    else if (Math.abs(r0 - r1) <= 1 && Math.abs(c0 - c1) <= 1) fe.at1 = 'The two match tiles may not be adjacent.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const tiles = pub.tiles as { id: string; glyph: string }[] | undefined;
    if (!Array.isArray(tiles) || typeof pub.columns !== 'number') throw new Error('OBS_004 preview: malformed payload');
    const pairIds = new Set((answer?.pairTileIds as string[] | undefined) ?? []);
    return {
      kind: 'tile-grid',
      columns: pub.columns as number,
      tiles: tiles.map((t) => ({ glyph: t.glyph, highlight: pairIds.size ? pairIds.has(t.id) : undefined })),
    } satisfies PreviewModel;
  },
  helpText: 'Pick the repeated glyph and the distinct filler glyphs (count = tiles − 2), then place the two matching tiles so they never share a row/column and are never adjacent.',
  accessibilityNotes: ['All glyphs shape-distinct at 48dp.', 'Cross-platform render risk shown per glyph.'],
  smallScreenNotes: ['320dp and 390dp previews; ≤5 columns.'],
  approvedInputs: ['PAIR_GLYPHS'],
};
