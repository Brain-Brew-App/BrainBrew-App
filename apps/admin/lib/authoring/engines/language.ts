/**
 * Language Logic authoring schemas (Phase 7H.3.2B): LNG_001 Analogy,
 * LNG_002 Odd Word Out, LNG_003 Sentence Ordering. All curated-scenario selectors
 * (index into canonical tables); the builder derives options/order + typed
 * distractors, the validator proves uniqueness from the curated membership.
 */

import { AUTHORING_VOCAB } from '../canonical.generated.mjs';
import type { ClientCheck, EngineFormSchema, PreviewModel } from './types';
import { rejectUnknownFields } from './types';

const num = (v: unknown) => Number(v);
const isInt = (v: unknown) => Number.isInteger(Number(v));
const fail = (fe: Record<string, string>, formErrors: string[] = []): ClientCheck => ({ ok: Object.keys(fe).length === 0 && formErrors.length === 0, fieldErrors: fe, formErrors });
const DIFF = { key: 'difficulty', kind: 'difficulty' as const, label: 'Difficulty', required: true, min: 1, max: 5 };
const correctIndexField = { key: 'correctIndex', kind: 'number' as const, label: 'Correct slot', required: true, min: 0, max: 3, step: 1 };
const scenarioField = (engineId: string, label: string, help: string) => ({ key: 'scenario', kind: 'select' as const, label, required: true, options: AUTHORING_VOCAB.scenarioOptions[engineId] ?? [], help });

const scenarioClient = (engineId: string, f: { scenario: number; difficulty: number; correctIndex?: number }, hasIndex: boolean): ClientCheck => {
  const allowed = hasIndex ? ['scenario', 'correctIndex', 'difficulty'] : ['scenario', 'difficulty'];
  const unknown = rejectUnknownFields(f, allowed);
  if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
  const fe: Record<string, string> = {};
  if (!isInt(f.scenario) || num(f.scenario) < 0 || num(f.scenario) >= (AUTHORING_VOCAB.scenarioCounts[engineId] ?? 0)) fe.scenario = 'Choose a curated scenario.';
  if (hasIndex && (num(f.correctIndex) < 0 || num(f.correctIndex) > 3)) fe.correctIndex = 'Correct slot is 0–3.';
  if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
  return fail(fe);
};

// ── LNG_001 Analogy ──────────────────────────────────────────────────────────
interface AnaForm { scenario: number; correctIndex: number; difficulty: number }

export const LNG_001_SCHEMA: EngineFormSchema<AnaForm> = {
  engineId: 'LNG_001', category: 'language-logic', displayName: 'Analogy', schemaVersion: 1,
  defaultForm: { scenario: 0, correctIndex: 0, difficulty: 2 },
  fieldGroups: [
    { title: 'Relation', description: 'Curated relation catalogue (part-of, cause-effect, intensity…). Tests relational reasoning, not obscure vocabulary; distractors are typed.', fields: [scenarioField('LNG_001', 'Analogy entry', 'Choose a curated relation pair.')] },
    { title: 'Answer', fields: [{ ...correctIndexField, help: 'Where the relation-preserving word sits.' }] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, entry: num(f.scenario), correctIndex: num(f.correctIndex), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ scenario: s.entry, correctIndex: s.correctIndex, difficulty: s.difficulty }),
  clientValidate: (f) => scenarioClient('LNG_001', f, true),
  previewAdapter: (pub, answer) => {
    const relation = pub.relation as string[] | undefined;
    const options = pub.options as { id: string; label: string }[] | undefined;
    if (!Array.isArray(relation) || !Array.isArray(options)) throw new Error('LNG_001 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return { kind: 'labeled-options', contextLines: relation, options: options.map((o) => ({ id: o.id, label: o.label, correct: correctId ? o.id === correctId : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick a curated relation and where the answer sits. Exactly one option preserves the relation; options share a grammar band (3–12 uppercase letters).',
  accessibilityNotes: ['One-word options, no length cue.', 'No culture-specific trivia.'],
  smallScreenNotes: ['Two relation lines + four options fit 320dp.'],
  approvedInputs: ['ANALOGIES (curated relation catalogue)'],
};

// ── LNG_002 Odd Word Out ─────────────────────────────────────────────────────
interface OwoForm { scenario: number; correctIndex: number; difficulty: number }

export const LNG_002_SCHEMA: EngineFormSchema<OwoForm> = {
  engineId: 'LNG_002', category: 'language-logic', displayName: 'Odd Word Out', schemaVersion: 1,
  defaultForm: { scenario: 0, correctIndex: 0, difficulty: 2 },
  fieldGroups: [
    { title: 'Word set', description: 'Curated ontology sets. Three words share a category the fourth lacks; the validator proves exactly one leave-one-out result from the curated membership.', fields: [scenarioField('LNG_002', 'Ontology set', 'Choose a curated four-word set.')] },
    { title: 'Answer', fields: [{ ...correctIndexField, help: 'Where the outlier sits among the four options.' }] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, set: num(f.scenario), correctIndex: num(f.correctIndex), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ scenario: s.set, correctIndex: s.correctIndex, difficulty: s.difficulty }),
  clientValidate: (f) => scenarioClient('LNG_002', f, true),
  previewAdapter: (pub, answer) => {
    const options = pub.options as { id: string; label: string }[] | undefined;
    if (!Array.isArray(options)) throw new Error('LNG_002 preview: malformed payload');
    const correctId = answer?.correctOptionId as string | undefined;
    return { kind: 'labeled-options', contextLines: ['Three of these belong together. Which does not?'], options: options.map((o) => ({ id: o.id, label: o.label, correct: correctId ? o.id === correctId : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick a curated word set and where the outlier sits. Exactly one word is the odd one out per the curated membership.',
  accessibilityNotes: ['Four uppercase words (3–12 letters), no length cue.', 'Curated ontology only — no free entry.'],
  smallScreenNotes: ['Four words fit 320dp.'],
  approvedInputs: ['ODD_WORD_SETS (curated ontology)'],
};

// ── LNG_003 Sentence Ordering ────────────────────────────────────────────────
interface SentForm { scenario: number; difficulty: number }

export const LNG_003_SCHEMA: EngineFormSchema<SentForm> = {
  engineId: 'LNG_003', category: 'language-logic', displayName: 'Sentence Ordering', schemaVersion: 1,
  defaultForm: { scenario: 0, difficulty: 2 },
  fieldGroups: [
    { title: 'Sentence set', description: 'Curated four-fragment sets with one hinge (a pronoun that must follow its antecedent). HUMAN REVIEW IS MANDATORY — English tolerates reordering the validator cannot fully rule out.', fields: [scenarioField('LNG_003', 'Sentence set', 'Choose a curated fragment set.')] },
    { title: 'Difficulty', fields: [DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, set: num(f.scenario), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ scenario: s.set, difficulty: s.difficulty }),
  clientValidate: (f) => scenarioClient('LNG_003', f, false),
  previewAdapter: (pub, answer) => {
    const fragments = pub.fragments as { id: string; label: string }[] | undefined;
    if (!Array.isArray(fragments)) throw new Error('LNG_003 preview: malformed payload');
    const correctOrder = answer?.correctOrder as string[] | undefined;
    return { kind: 'ordering', items: fragments, clues: [], correctOrder, note: 'Human review is mandatory for Sentence Ordering.' } satisfies PreviewModel;
  },
  helpText: 'Pick a curated fragment set. One order opens with the capitalised fragment, closes with the full stop, and places the pronoun after its antecedent. Human review is still mandatory.',
  accessibilityNotes: ['Fragments ≤~8 words to stay legible at 320dp.', 'Answer never cued only by punctuation.'],
  smallScreenNotes: ['Four fragments fit 320dp.'],
  approvedInputs: ['SENTENCE_SETS (curated)'],
};
