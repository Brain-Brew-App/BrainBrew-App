/**
 * Logic authoring schemas (Phase 7H.3.2B): LOG_001 Deduction, LOG_002 Balance
 * Scales, LOG_003 Ordering. Pure data + functions.
 *
 * Deduction and Ordering are curated-scenario selectors (index into the canonical
 * tables via AUTHORING_VOCAB). Balance assembles a canonical weights/scales seed
 * from an approved template + integer parameters — the balancing + unique-ratio
 * proof stay in the canonical builder/validator.
 */

import { AUTHORING_VOCAB } from '../canonical.generated.mjs';
import type { ClientCheck, EngineFormSchema, PreviewModel } from './types';
import { rejectUnknownFields } from './types';

const num = (v: unknown) => Number(v);
const isInt = (v: unknown) => Number.isInteger(Number(v));
const fail = (fe: Record<string, string>, formErrors: string[] = []): ClientCheck => ({ ok: Object.keys(fe).length === 0 && formErrors.length === 0, fieldErrors: fe, formErrors });
const DIFF = { key: 'difficulty', kind: 'difficulty' as const, label: 'Difficulty', required: true, min: 1, max: 5 };
const scenarioField = (engineId: string, label: string, help: string) => ({
  key: 'scenario', kind: 'select' as const, label, required: true, options: AUTHORING_VOCAB.scenarioOptions[engineId] ?? [], help,
});
const correctIndexField = { key: 'correctIndex', kind: 'number' as const, label: 'Correct slot', required: true, min: 0, max: 3, step: 1, help: 'Where the entailed answer sits among the four options.' };

// ── LOG_001 Deduction ────────────────────────────────────────────────────────
interface DedForm { scenario: number; correctIndex: number; difficulty: number }

export const LOG_001_SCHEMA: EngineFormSchema<DedForm> = {
  engineId: 'LOG_001', category: 'logic', displayName: 'Deduction', schemaVersion: 1,
  defaultForm: { scenario: 0, correctIndex: 0, difficulty: 2 },
  fieldGroups: [
    { title: 'Scenario', description: 'Curated syllogism / conditional forms (Barbara, Celarent, Modus Tollens, Disjunctive, Restatement Trap). The logic is computed; distractors are typed fallacies.', fields: [scenarioField('LOG_001', 'Deduction scenario', 'Choose a curated, culture-neutral scenario.')] },
    { title: 'Answer', fields: [correctIndexField] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, scenario: num(f.scenario), correctIndex: num(f.correctIndex), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ scenario: s.scenario, correctIndex: s.correctIndex, difficulty: s.difficulty }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['scenario', 'correctIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!isInt(f.scenario) || num(f.scenario) < 0 || num(f.scenario) >= (AUTHORING_VOCAB.scenarioCounts.LOG_001 ?? 0)) fe.scenario = 'Choose a curated scenario.';
    if (num(f.correctIndex) < 0 || num(f.correctIndex) > 3) fe.correctIndex = 'Correct slot is 0–3.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const premises = pub.premises as string[] | undefined;
    const options = pub.options as { id: string; label: string }[] | undefined;
    if (!Array.isArray(premises) || !Array.isArray(options)) throw new Error('LOG_001 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return { kind: 'labeled-options', contextLines: premises, options: options.map((o) => ({ id: o.id, label: o.label, correct: correctId ? o.id === correctId : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick a curated scenario and where the entailed conclusion sits. Exactly one option follows; the others are typed fallacies.',
  accessibilityNotes: ['Premises ≤18 words, options ≤14 words.', 'No outside knowledge required.'],
  smallScreenNotes: ['Premise list + four options fit 320dp.'],
  approvedInputs: ['DEDUCTION_SCENARIOS (curated)'],
};

// ── LOG_002 Balance Scales ───────────────────────────────────────────────────
interface BalForm { template: string; p0: number; p1: number; p2: number; correctIndex: number; difficulty: number }
const SQ = '■', TR = '▲', DI = '◆', CI = '●';
const rep = (g: string, n: number) => Array.from({ length: n }, () => g);

function balanceSeed(form: BalForm, id: string) {
  const [a, b, c] = [num(form.p0), num(form.p1), num(form.p2)];
  const correctIndex = num(form.correctIndex), difficulty = num(form.difficulty);
  switch (form.template) {
    case 'A': return { id, weights: { [SQ]: 1, [TR]: a, [DI]: a * b }, scales: [[[TR], rep(SQ, a)], [[DI], rep(TR, b)]], query: { subject: DI, unit: SQ }, correctIndex, difficulty };
    case 'D': return { id, weights: { [SQ]: 1, [DI]: a, [CI]: a * b }, scales: [[[DI], rep(SQ, a)], [[CI], rep(DI, b)]], query: { subject: CI, unit: SQ }, correctIndex, difficulty };
    case 'B': return { id, weights: { [SQ]: 1, [TR]: c, [CI]: (b * c) / a }, scales: [[rep(CI, a), rep(TR, b)], [[TR], rep(SQ, c)]], query: { subject: CI, unit: SQ }, correctIndex, difficulty };
    case 'C': return { id, weights: { [SQ]: 1, [TR]: a, [DI]: 2 * a, [CI]: (2 * a) / b }, scales: [[[TR], rep(SQ, a)], [[DI], rep(TR, 2)], [[DI], rep(CI, b)]], query: { subject: CI, unit: SQ }, correctIndex, difficulty };
    default: return { id, weights: {}, scales: [], query: { subject: DI, unit: SQ }, correctIndex, difficulty };
  }
}

export const LOG_002_SCHEMA: EngineFormSchema<BalForm> = {
  engineId: 'LOG_002', category: 'logic', displayName: 'Balance Scales', schemaVersion: 1,
  defaultForm: { template: 'A', p0: 2, p1: 2, p2: 0, correctIndex: 0, difficulty: 2 },
  fieldGroups: [
    { title: 'Template', description: 'Approved weighting families with fixed shapes (■ ▲ ◆ ●). Weights are positive integers; the answer requires substituting one scale into the next.', fields: [
      { key: 'template', kind: 'select', label: 'Weighting family', required: true, options: AUTHORING_VOCAB.balanceTemplates.map((t) => ({ value: t.value, label: t.label })) },
      { key: 'p0', kind: 'number', label: 'Parameter 1', required: true, min: 2, step: 1 },
      { key: 'p1', kind: 'number', label: 'Parameter 2', required: true, min: 1, step: 1 },
      { key: 'p2', kind: 'number', label: 'Parameter 3', required: false, min: 1, step: 1, help: 'Only template B (a, b, t) uses a third parameter.' },
    ] },
    { title: 'Answer', fields: [correctIndexField] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => balanceSeed(f, id),
  deserializeSeedToForm: (s: any) => {
    // Recover template + params from the query/scale structure.
    const w = s.weights as Record<string, number>;
    if (s.query.subject === DI) return { template: 'A', p0: w[TR], p1: w[DI] / w[TR], p2: 0, correctIndex: s.correctIndex, difficulty: s.difficulty };
    if (s.scales.length === 3) return { template: 'C', p0: w[TR], p1: (2 * w[TR]) / w[CI], p2: 0, correctIndex: s.correctIndex, difficulty: s.difficulty };
    if (w[DI]) return { template: 'D', p0: w[DI], p1: w[CI] / w[DI], p2: 0, correctIndex: s.correctIndex, difficulty: s.difficulty };
    // template B
    const t = w[TR]; const aB = s.scales[0][0].length; const bB = s.scales[0][1].length;
    return { template: 'B', p0: aB, p1: bB, p2: t, correctIndex: s.correctIndex, difficulty: s.difficulty };
  },
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['template', 'p0', 'p1', 'p2', 'correctIndex', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    const [a, b, c] = [num(f.p0), num(f.p1), num(f.p2)];
    if (!['A', 'D', 'B', 'C'].includes(f.template)) fe.template = 'Choose an approved template.';
    if (![a, b].every(isInt) || a < 1 || b < 1) fe.p0 = 'Parameters must be positive whole numbers.';
    let ratio = NaN;
    if (f.template === 'A' || f.template === 'D') ratio = a * b;
    if (f.template === 'B') { if (!isInt(c) || c < 1) fe.p2 = 'Template B needs a positive third parameter.'; if ((b * c) % a !== 0) fe.p1 = 'b·t must be divisible by a for integer weights.'; ratio = (b * c) / a; }
    if (f.template === 'C') { if ((2 * a) % b !== 0) fe.p1 = '2k must be divisible by n for integer weights.'; ratio = (2 * a) / b; }
    if (Number.isFinite(ratio) && (!Number.isInteger(ratio) || ratio <= 1)) fe.p0 = 'The resulting ratio must be a whole number greater than 1.';
    if (num(f.correctIndex) < 0 || num(f.correctIndex) > 3) fe.correctIndex = 'Correct slot is 0–3.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const scales = pub.scales as { left: string[]; right: string[] }[] | undefined;
    const query = pub.query as { subject: string; unit: string } | undefined;
    const options = pub.options as { id: string; label: string }[] | undefined;
    if (!Array.isArray(scales) || !query || !Array.isArray(options)) throw new Error('LOG_002 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return { kind: 'balance', scales, query, options: options.map((o) => ({ id: o.id, label: o.label, correct: correctId ? o.id === correctId : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick a weighting family and integer parameters. Both/all scales balance, the answer ratio is a whole number > 1, and solving needs a real substitution.',
  accessibilityNotes: ['Fixed shapes ■ ▲ ◆ ● — no colour dependence.', 'Trays/beam/fulcrum drawn connected.'],
  smallScreenNotes: ['Two–three scales + options fit 320dp.'],
  approvedInputs: ['Balance weighting families A/B/C/D'],
};

// ── LOG_003 Ordering ─────────────────────────────────────────────────────────
interface OrdForm { scenario: number; difficulty: number }

export const LOG_003_SCHEMA: EngineFormSchema<OrdForm> = {
  engineId: 'LOG_003', category: 'logic', displayName: 'Ordering', schemaVersion: 1,
  defaultForm: { scenario: 0, difficulty: 3 },
  fieldGroups: [
    { title: 'Scenario', description: 'Four people + clues. The one valid order is derived by enumeration; every clue must be load-bearing (the build fails a redundant clue).', fields: [scenarioField('LOG_003', 'Ordering scenario', 'Curated four-item scenario with load-bearing clues.')] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, scenario: num(f.scenario), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ scenario: s.scenario, difficulty: s.difficulty }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['scenario', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!isInt(f.scenario) || num(f.scenario) < 0 || num(f.scenario) >= (AUTHORING_VOCAB.scenarioCounts.LOG_003 ?? 0)) fe.scenario = 'Choose a curated scenario.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const items = pub.items as { id: string; label: string }[] | undefined;
    const clues = pub.clues as string[] | undefined;
    if (!Array.isArray(items) || !Array.isArray(clues)) throw new Error('LOG_003 preview: malformed payload');
    const correctOrder = answer?.correctOrder as string[] | undefined;
    return { kind: 'ordering', items, clues, correctOrder } satisfies PreviewModel;
  },
  helpText: 'Pick a curated scenario; the single valid order is derived and every clue is proven load-bearing.',
  accessibilityNotes: ['Four items, ≤12-word clues.', 'Pool shown shuffled — no positional hint.'],
  smallScreenNotes: ['Item pool + clue list fit 320dp.'],
  approvedInputs: ['ORDERING_SCENARIOS (curated)'],
};
