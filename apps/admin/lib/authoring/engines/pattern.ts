/**
 * Pattern authoring schemas (Phase 7H.3.2A): PAT_001 Sequence Completion,
 * PAT_002 Matrix Completion, PAT_003 Sequence Repair. Pure data + functions.
 *
 * Sequences are computed from a family + parameters — authors never type terms.
 * Repair excludes the loosely-constrained families (alternating/divide) so the
 * builder's uniqueness search is meaningful. The canonical validator remains the
 * gate; clientValidate is a fast pre-check.
 */

import { AUTHORING_VOCAB } from '../canonical.generated.mjs';
import type { ClientCheck, EngineFormSchema, FieldOption, PreviewModel } from './types';
import { rejectUnknownFields } from './types';

const num = (v: unknown) => Number(v);
const isInt = (v: unknown) => Number.isInteger(Number(v));
const fail = (fieldErrors: Record<string, string>, formErrors: string[] = []): ClientCheck => ({
  ok: Object.keys(fieldErrors).length === 0 && formErrors.length === 0,
  fieldErrors,
  formErrors,
});

const DIFFICULTY_FIELD = { key: 'difficulty', kind: 'difficulty' as const, label: 'Difficulty', required: true, min: 1, max: 5 };

/** Parameter count each sequence family consumes. */
const SEQ_ARITY: Record<string, number> = {
  arithmetic: 2, geometric: 2, divide: 2, squares: 1, triangular: 1, oblong: 1, fibonacci: 2, alternating: 3,
};
/** Families a repair may appeal to (excludes alternating + divide — see builder). */
const REPAIR_FAMILIES = ['arithmetic', 'geometric', 'squares', 'triangular', 'oblong', 'fibonacci'];

const seqFamilyOptions = (families: readonly string[]): FieldOption[] =>
  families.map((f) => ({ value: f, label: `${f} (${SEQ_ARITY[f]} param${SEQ_ARITY[f] > 1 ? 's' : ''})` }));

const paramFields = () => [
  { key: 'p0', kind: 'number' as const, label: 'Parameter 1', required: true, step: 1, help: 'First rule parameter.' },
  { key: 'p1', kind: 'number' as const, label: 'Parameter 2', required: false, step: 1, help: 'Used by 2- and 3-parameter families.' },
  { key: 'p2', kind: 'number' as const, label: 'Parameter 3', required: false, step: 1, help: 'Used only by alternating.' },
];

const paramsFromForm = (family: string, f: { p0: number; p1: number; p2: number }): number[] =>
  [num(f.p0), num(f.p1), num(f.p2)].slice(0, SEQ_ARITY[family] ?? 2);

const paramsToForm = (params: number[]) => ({ p0: params[0] ?? 0, p1: params[1] ?? 0, p2: params[2] ?? 0 });

// ── PAT_001 Sequence Completion ──────────────────────────────────────────────
interface SeqForm { family: string; p0: number; p1: number; p2: number; length: number; correctIndex: number; difficulty: number }

export const PAT_001_SCHEMA: EngineFormSchema<SeqForm> = {
  engineId: 'PAT_001',
  category: 'pattern',
  displayName: 'Sequence Completion',
  schemaVersion: 1,
  defaultForm: { family: 'arithmetic', p0: 5, p1: 5, p2: 0, length: 5, correctIndex: 0, difficulty: 1 },
  fieldGroups: [
    {
      title: 'Rule',
      description: 'The terms are computed from the family + parameters. Distractors are near-misses of the rule, never random.',
      fields: [
        { key: 'family', kind: 'select', label: 'Sequence family', required: true, options: seqFamilyOptions(AUTHORING_VOCAB.sequenceFamilies) },
        ...paramFields(),
        { key: 'length', kind: 'number', label: 'Visible terms', required: true, min: 4, max: 5, step: 1, help: '4 or 5 (5 wraps on 320dp above 5).' },
      ],
    },
    { title: 'Answer', fields: [{ key: 'correctIndex', kind: 'number', label: 'Correct slot', required: true, min: 0, max: 3, step: 1 }] },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    family: f.family,
    params: paramsFromForm(f.family, f),
    length: num(f.length),
    correctIndex: num(f.correctIndex),
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    family: s.family,
    ...paramsToForm(s.params),
    length: s.length ?? 5,
    correctIndex: s.correctIndex,
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['family', 'p0', 'p1', 'p2', 'length', 'correctIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!AUTHORING_VOCAB.sequenceFamilies.includes(f.family)) fe.family = 'Unknown sequence family.';
    const arity = SEQ_ARITY[f.family] ?? 2;
    const params = paramsFromForm(f.family, f);
    if (params.some((p) => !isInt(p))) fe.p0 = 'Parameters must be whole numbers.';
    if (arity >= 1 && num(f.p0) <= 0) fe.p0 = 'Parameter 1 must be positive.';
    if (f.family === 'divide' && num(f.length) > 4) fe.length = 'Divide sequences need 4 visible terms to stay integer.';
    if (num(f.length) < 4 || num(f.length) > 5) fe.length = 'Visible terms must be 4 or 5.';
    if (num(f.correctIndex) < 0 || num(f.correctIndex) > 3) fe.correctIndex = 'Correct slot is 0–3.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const sequence = pub.sequence as string[] | undefined;
    const options = pub.options as { id: string; label: string }[] | undefined;
    if (!Array.isArray(sequence) || !Array.isArray(options)) throw new Error('PAT_001 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return {
      kind: 'chip-sequence',
      sequence,
      options: options.map((o) => ({ id: o.id, label: o.label, correct: correctId ? o.id === correctId : undefined })),
    } satisfies PreviewModel;
  },
  helpText: 'Choose a rule family and its parameters, and how many terms are visible (4–5). The next term and near-miss distractors are derived; nothing is hand-typed.',
  accessibilityNotes: ['Terms ≤3 digits to fit the chip row.', 'No wrapping at 320dp with ≤5 terms.'],
  smallScreenNotes: ['5 visible terms is the 320dp ceiling.'],
  approvedInputs: ['Sequence families (curated)'],
};

// ── PAT_002 Matrix Completion ────────────────────────────────────────────────
interface MatrixForm { ruleShape: string; ruleCount: string; ruleFill: string; correctIndex: number; difficulty: number }

const ruleOptions = (): FieldOption[] => AUTHORING_VOCAB.matrixRules.map((r) => ({ value: r, label: r }));

export const PAT_002_SCHEMA: EngineFormSchema<MatrixForm> = {
  engineId: 'PAT_002',
  category: 'pattern',
  displayName: 'Matrix Completion',
  schemaVersion: 1,
  defaultForm: { ruleShape: 'rowConstant', ruleCount: 'colConstant', ruleFill: 'latin', correctIndex: 0, difficulty: 3 },
  fieldGroups: [
    {
      title: 'Rules',
      description: 'Each of the three attributes (shape, count, fill) follows one rule. Each distractor breaks exactly one attribute; exactly one option satisfies all three.',
      fields: [
        { key: 'ruleShape', kind: 'matrix-rule', label: 'Shape rule', required: true, options: ruleOptions() },
        { key: 'ruleCount', kind: 'matrix-rule', label: 'Count rule', required: true, options: ruleOptions() },
        { key: 'ruleFill', kind: 'matrix-rule', label: 'Fill rule', required: true, options: ruleOptions() },
      ],
    },
    { title: 'Answer', fields: [{ key: 'correctIndex', kind: 'number', label: 'Correct slot', required: true, min: 0, max: 3, step: 1 }] },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    rules: { shape: f.ruleShape, count: f.ruleCount, fill: f.ruleFill },
    correctIndex: num(f.correctIndex),
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    ruleShape: s.rules.shape,
    ruleCount: s.rules.count,
    ruleFill: s.rules.fill,
    correctIndex: s.correctIndex,
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['ruleShape', 'ruleCount', 'ruleFill', 'correctIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    const rules = [f.ruleShape, f.ruleCount, f.ruleFill];
    if (rules.some((r) => !AUTHORING_VOCAB.matrixRules.includes(r))) fe.ruleShape = 'Unknown matrix rule.';
    if (rules.every((r) => r === 'rowConstant')) fe.ruleFill = 'All-row-constant is degenerate (three identical columns).';
    if (rules.every((r) => r === 'colConstant')) fe.ruleFill = 'All-column-constant is degenerate (three identical rows).';
    if (num(f.correctIndex) < 0 || num(f.correctIndex) > 3) fe.correctIndex = 'Correct slot is 0–3.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub) => {
    const cells = pub.cells as ({ shape: string; count: number; fill: string } | null)[] | undefined;
    const options = pub.options as { id: string; label: string }[] | undefined;
    const figures = pub.optionFigures as Record<string, { shape: string; count: number; fill: string }> | undefined;
    if (!Array.isArray(cells) || cells.length !== 9 || !Array.isArray(options)) throw new Error('PAT_002 preview: malformed payload');
    const label = (f: { shape: string; count: number; fill: string }) => `${f.count} ${f.shape}${f.count > 1 ? 's' : ''}, ${f.fill}`;
    // correctOptionId is private; a matrix has exactly one all-rules-satisfying figure,
    // but we do not recompute the answer here — highlight stays off unless the label
    // set later carries it. (Answer overlay is handled via findings, not derivation.)
    return {
      kind: 'matrix',
      cells: cells.map((c) => (c ? label(c) : null)),
      options: options.map((o) => ({ id: o.id, label: figures?.[o.id] ? label(figures[o.id]) : o.label })),
    } satisfies PreviewModel;
  },
  helpText: 'Assign a rule (row-constant, column-constant, or Latin square) to each of shape, count and fill. The missing cell and its distractors are derived; exactly one option fits all three rules.',
  accessibilityNotes: ['Figures are described in text (shape/count/fill) as well as drawn.', 'No colour-only distinction.'],
  smallScreenNotes: ['3×3 grid + four options fit 320dp and 390dp.'],
  approvedInputs: ['Matrix rules (rowConstant/colConstant/latin)'],
};

// ── PAT_003 Sequence Repair ──────────────────────────────────────────────────
interface RepairForm { family: string; p0: number; p1: number; p2: number; corruptIndex: number; difficulty: number }

export const PAT_003_SCHEMA: EngineFormSchema<RepairForm> = {
  engineId: 'PAT_003',
  category: 'pattern',
  displayName: 'Sequence Repair',
  schemaVersion: 1,
  defaultForm: { family: 'arithmetic', p0: 2, p1: 3, p2: 0, corruptIndex: 2, difficulty: 2 },
  fieldGroups: [
    {
      title: 'Rule',
      description: 'Six terms are computed, then one interior term is corrupted so that exactly one single-term repair restores a valid rule.',
      fields: [
        { key: 'family', kind: 'select', label: 'Sequence family', required: true, options: seqFamilyOptions(REPAIR_FAMILIES), help: 'Repair excludes alternating and divide.' },
        { key: 'p0', kind: 'number', label: 'Parameter 1', required: true, step: 1 },
        { key: 'p1', kind: 'number', label: 'Parameter 2', required: false, step: 1, help: 'Used by 2-parameter families.' },
        { key: 'p2', kind: 'number', label: 'Parameter 3', required: false, step: 1, help: 'Unused for repair families.' },
      ],
    },
    { title: 'Corruption', fields: [{ key: 'corruptIndex', kind: 'number', label: 'Corrupted position', required: true, min: 1, max: 4, step: 1, help: 'Interior only (1–4); never the first or last term.' }] },
    { title: 'Difficulty', fields: [DIFFICULTY_FIELD] },
  ],
  serializeFormToSeed: (f, id) => ({
    id,
    family: f.family,
    params: paramsFromForm(f.family, f),
    corruptIndex: num(f.corruptIndex),
    difficulty: num(f.difficulty),
  }),
  deserializeSeedToForm: (s: any) => ({
    family: s.family,
    ...paramsToForm(s.params),
    corruptIndex: s.corruptIndex,
    difficulty: s.difficulty,
  }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['family', 'p0', 'p1', 'p2', 'corruptIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!REPAIR_FAMILIES.includes(f.family)) fe.family = 'Repair supports only arithmetic, geometric, squares, triangular, oblong, fibonacci.';
    if (num(f.p0) <= 0 || !isInt(f.p0)) fe.p0 = 'Parameter 1 must be a positive whole number.';
    if (![1, 2, 3, 4].includes(num(f.corruptIndex))) fe.corruptIndex = 'Corrupted position is 1–4 (interior only).';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const terms = pub.terms as string[] | undefined;
    if (!Array.isArray(terms)) throw new Error('PAT_003 preview: malformed payload');
    const wrongIndex = answer?.wrongIndex as number | undefined;
    return { kind: 'chip-repair', terms, wrongIndex } satisfies PreviewModel;
  },
  helpText: 'Choose a rule family + parameters and which interior term (1–4) is corrupted. The builder proves exactly one single-term repair restores a valid rule.',
  accessibilityNotes: ['Terms ≤3 digits.', 'Corruption is findable but not obvious (≤half the correct value).'],
  smallScreenNotes: ['Six chips fit the 320dp row.'],
  approvedInputs: ['Repair sequence families (curated subset)'],
};
