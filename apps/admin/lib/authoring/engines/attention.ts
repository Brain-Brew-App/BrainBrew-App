/**
 * Attention Speed authoring schemas (Phase 7H.3.2B): ATT_001 Symbol Sweep,
 * ATT_002 Memory Flash, ATT_003 Rapid Classification. Pure data + functions.
 *
 * Timed engines share one set of timing controls (Task 10). Previews are STATIC
 * storyboards — they never run a real timed/ranked attempt, hold no token, and
 * emit no analytics. Approved glyph sets only; classification is accuracy-first
 * with a 40–60% bucket balance so one-sided tapping can't win.
 */

import { AUTHORING_VOCAB } from '../canonical.generated.mjs';
import type { ClientCheck, EngineFormSchema, FieldDescriptor, PreviewModel } from './types';
import { rejectUnknownFields } from './types';

const num = (v: unknown) => Number(v);
const isInt = (v: unknown) => Number.isInteger(Number(v));
const fail = (fe: Record<string, string>, formErrors: string[] = []): ClientCheck => ({ ok: Object.keys(fe).length === 0 && formErrors.length === 0, fieldErrors: fe, formErrors });
const DIFF = { key: 'difficulty', kind: 'difficulty' as const, label: 'Difficulty', required: true, min: 1, max: 5 };

/** Shared timed-task controls (Task 10) — accuracy-first, fair, canonical limits. */
function durationField(help: string): FieldDescriptor {
  return { key: 'durationMs', kind: 'number', label: 'Duration (ms)', required: true, min: 4000, max: 20000, step: 500, help };
}

// ── ATT_001 Symbol Sweep ─────────────────────────────────────────────────────
interface SweepForm { target: string; distractors: string[]; columns: number; rows: number; targetCount: number; durationMs: number; difficulty: number }

export const ATT_001_SCHEMA: EngineFormSchema<SweepForm> = {
  engineId: 'ATT_001', category: 'attention-speed', displayName: 'Symbol Sweep', schemaVersion: 1,
  defaultForm: { target: AUTHORING_VOCAB.sweepGlyphs[0], distractors: [AUTHORING_VOCAB.sweepGlyphs[1], AUTHORING_VOCAB.sweepGlyphs[2], AUTHORING_VOCAB.sweepGlyphs[3]] as string[], columns: 5, rows: 5, targetCount: 8, durationMs: 8000, difficulty: 2 },
  fieldGroups: [
    { title: 'Glyphs', description: 'Approved sweep alphabet only. At least two distractor glyphs so it is a scan, not a count. Accuracy first — a wrong tap costs more than a slow one.', fields: [
      { key: 'target', kind: 'glyph', label: 'Target glyph', required: true, glyphSource: AUTHORING_VOCAB.sweepGlyphs as string[] },
      { key: 'distractors', kind: 'glyph-multi', label: 'Distractor glyphs', required: true, glyphSource: AUTHORING_VOCAB.sweepGlyphs as string[], selectCount: null, help: 'At least two, excluding the target.' },
    ] },
    { title: 'Grid', fields: [
      { key: 'columns', kind: 'number', label: 'Columns', required: true, min: 3, max: 5, step: 1, help: '≤5 keeps tiles ≥48dp at 320dp.' },
      { key: 'rows', kind: 'number', label: 'Rows', required: true, min: 3, max: 6, step: 1 },
      { key: 'targetCount', kind: 'number', label: 'Target count', required: true, min: 5, step: 1, help: '≥5, and at most half the grid.' },
    ] },
    { title: 'Timing', fields: [durationField('Scoring limit = duration; par ≈ 60%.'), DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, target: f.target, distractors: [...f.distractors], columns: num(f.columns), rows: num(f.rows), targetCount: num(f.targetCount), durationMs: num(f.durationMs), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ target: s.target, distractors: [...s.distractors], columns: s.columns, rows: s.rows, targetCount: s.targetCount, durationMs: s.durationMs, difficulty: s.difficulty }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['target', 'distractors', 'columns', 'rows', 'targetCount', 'durationMs', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    const approved = new Set(AUTHORING_VOCAB.sweepGlyphs);
    const total = num(f.columns) * num(f.rows);
    if (!approved.has(f.target)) fe.target = 'Choose an approved glyph.';
    if (!Array.isArray(f.distractors) || f.distractors.length < 2) fe.distractors = 'At least two distractor glyphs.';
    else if (f.distractors.some((g) => !approved.has(g))) fe.distractors = 'All glyphs must be approved.';
    else if (f.distractors.includes(f.target)) fe.distractors = 'Distractors must exclude the target.';
    else if (new Set(f.distractors).size !== f.distractors.length) fe.distractors = 'Distractors must be distinct.';
    if (num(f.columns) < 3 || num(f.columns) > 5) fe.columns = 'Columns 3–5.';
    if (total % num(f.columns) !== 0) fe.rows = 'Grid must fill complete rows.';
    if (num(f.targetCount) < 5) fe.targetCount = 'At least five targets.';
    else if (total - num(f.targetCount) < num(f.targetCount)) fe.targetCount = 'Distractors must be at least the target count (no “tap everything”).';
    if (num(f.durationMs) < 4000) fe.durationMs = 'Duration too short.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const symbols = pub.symbols as { id: string; glyph: string }[] | undefined;
    if (!Array.isArray(symbols) || typeof pub.columns !== 'number') throw new Error('ATT_001 preview: malformed payload');
    const targetMap = new Map((answer?.symbols as { id: string; isTarget: boolean }[] | undefined ?? []).map((s) => [s.id, s.isTarget]));
    return { kind: 'symbol-grid', columns: pub.columns as number, targetGlyph: pub.targetGlyph as string, durationMs: pub.durationMs as number, symbols: symbols.map((s) => ({ glyph: s.glyph, target: targetMap.size ? targetMap.get(s.id) : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Choose an approved target + ≥2 distractor glyphs, a grid that fills complete rows, and a target count ≥5 but ≤ half the grid. Accuracy-first; ≤5 columns.',
  accessibilityNotes: ['No colour dependence.', 'Accuracy-first scoring; begin-gate before the clock starts.'],
  smallScreenNotes: ['≤5 columns keeps tiles ≥48dp at 320dp.'],
  approvedInputs: ['SWEEP_GLYPHS'],
};

// ── ATT_002 Memory Flash ─────────────────────────────────────────────────────
interface MemForm { targets: string[]; boardSize: number; columns: number; difficulty: number }

export const ATT_002_SCHEMA: EngineFormSchema<MemForm> = {
  engineId: 'ATT_002', category: 'attention-speed', displayName: 'Memory Flash', schemaVersion: 1,
  defaultForm: { targets: [AUTHORING_VOCAB.memoryGlyphs[0], AUTHORING_VOCAB.memoryGlyphs[1], AUTHORING_VOCAB.memoryGlyphs[2]] as string[], boardSize: 12, columns: 4, difficulty: 3 },
  fieldGroups: [
    { title: 'Targets', description: '3–5 distinct glyphs to remember (approved memory alphabet). Exposure is set by difficulty (2400→1500ms); order counts only at difficulty 5.', fields: [
      { key: 'targets', kind: 'glyph-multi', label: 'Target glyphs', required: true, glyphSource: AUTHORING_VOCAB.memoryGlyphs as string[], selectCount: null, help: '3 to 5 distinct glyphs.' },
    ] },
    { title: 'Board', fields: [
      { key: 'boardSize', kind: 'number', label: 'Board size', required: true, min: 6, max: 20, step: 1, help: 'At least twice the target count; fills complete rows.' },
      { key: 'columns', kind: 'number', label: 'Columns', required: true, min: 3, max: 4, step: 1, help: '≤4 keeps tiles ≥48dp at 320dp.' },
    ] },
    { title: 'Difficulty', fields: [{ ...DIFF, min: 2, help: 'Exposure band exists for 2–5 only; 5 makes order matter.' }] },
  ],
  serializeFormToSeed: (f, id) => ({ id, targets: [...f.targets], boardSize: num(f.boardSize), columns: num(f.columns), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ targets: [...s.targets], boardSize: s.boardSize, columns: s.columns, difficulty: s.difficulty }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['targets', 'boardSize', 'columns', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    const approved = new Set(AUTHORING_VOCAB.memoryGlyphs);
    if (!Array.isArray(f.targets) || f.targets.length < 3 || f.targets.length > 5) fe.targets = '3 to 5 target glyphs.';
    else if (f.targets.some((g) => !approved.has(g))) fe.targets = 'All glyphs must be approved.';
    else if (new Set(f.targets).size !== f.targets.length) fe.targets = 'Targets must be distinct.';
    else if (num(f.boardSize) < f.targets.length * 2) fe.boardSize = 'Board must hold at least twice the targets.';
    if (num(f.boardSize) % num(f.columns) !== 0) fe.boardSize = 'Board must fill complete rows.';
    if (num(f.columns) < 3 || num(f.columns) > 4) fe.columns = 'Columns 3–4.';
    if (num(f.difficulty) < 2 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 2–5 (exposure band).';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const board = pub.board as { id: string; glyph: string }[] | undefined;
    const targets = pub.targets as string[] | undefined;
    if (!Array.isArray(board) || !Array.isArray(targets)) throw new Error('ATT_002 preview: malformed payload');
    const targetIds = new Set((answer?.targetIds as string[] | undefined) ?? []);
    return { kind: 'memory-flash', columns: pub.columns as number, targets, exposureMs: pub.exposureMs as number, intervalMs: pub.intervalMs as number, orderMatters: !!pub.orderMatters, board: board.map((t) => ({ glyph: t.glyph, target: targetIds.size ? targetIds.has(t.id) : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick 3–5 distinct glyphs and a board at least twice their count. Exposure is set by difficulty; the board never repeats a glyph and targets scatter.',
  accessibilityNotes: ['Exposure floor 1500ms (saccade latency varies).', 'No hint persists after exposure.'],
  smallScreenNotes: ['≤4 columns keeps tiles ≥48dp at 320dp.'],
  approvedInputs: ['MEMORY_GLYPHS'],
};

// ── ATT_003 Rapid Classification ─────────────────────────────────────────────
interface ClsForm { rule: string; items: number; durationMs: number; difficulty: number }

export const ATT_003_SCHEMA: EngineFormSchema<ClsForm> = {
  engineId: 'ATT_003', category: 'attention-speed', displayName: 'Rapid Classification', schemaVersion: 1,
  defaultForm: { rule: AUTHORING_VOCAB.classificationRules[0].value, items: 12, durationMs: 8000, difficulty: 2 },
  fieldGroups: [
    { title: 'Rule', description: 'Curated, total rules over a closed alphabet (every glyph has exactly one bucket, no borderline symbols). Buckets balance 40–60% so one-sided tapping cannot win.', fields: [
      { key: 'rule', kind: 'select', label: 'Classification rule', required: true, options: AUTHORING_VOCAB.classificationRules.map((r) => ({ value: r.value, label: `${r.label} [${r.buckets[0]} / ${r.buckets[1]}]` })) },
      { key: 'items', kind: 'number', label: 'Item count', required: true, min: 6, max: 40, step: 2, help: 'Even, so the two buckets balance exactly.' },
    ] },
    { title: 'Timing', fields: [durationField('Scoring limit = duration; par ≈ 65%.'), DIFF] },
  ],
  serializeFormToSeed: (f, id) => ({ id, rule: f.rule, items: num(f.items), durationMs: num(f.durationMs), difficulty: num(f.difficulty) }),
  deserializeSeedToForm: (s: any) => ({ rule: s.rule, items: s.items, durationMs: s.durationMs, difficulty: s.difficulty }),
  clientValidate: (f) => {
    const unknown = rejectUnknownFields(f, ['rule', 'items', 'durationMs', 'difficulty']);
    if (unknown.length) return fail({}, [`unknown field(s): ${unknown.join(', ')}`]);
    const fe: Record<string, string> = {};
    if (!AUTHORING_VOCAB.classificationRules.some((r) => r.value === f.rule)) fe.rule = 'Choose a curated rule.';
    if (!isInt(f.items) || num(f.items) % 2 !== 0) fe.items = 'Item count must be an even whole number.';
    else if (num(f.items) < 6) fe.items = 'At least six items.';
    if (num(f.durationMs) < 4000) fe.durationMs = 'Duration too short.';
    if (num(f.difficulty) < 1 || num(f.difficulty) > 5) fe.difficulty = 'Difficulty is 1–5.';
    return fail(fe);
  },
  previewAdapter: (pub, answer) => {
    const items = pub.items as { id: string; glyph: string }[] | undefined;
    const buckets = pub.buckets as [string, string] | undefined;
    if (!Array.isArray(items) || !Array.isArray(buckets)) throw new Error('ATT_003 preview: malformed payload');
    const bucketMap = new Map((answer?.items as { id: string; bucket: number }[] | undefined ?? []).map((i) => [i.id, i.bucket]));
    return { kind: 'classification', rule: pub.rule as string, buckets, durationMs: pub.durationMs as number, items: items.map((i) => ({ glyph: i.glyph, bucket: bucketMap.size ? bucketMap.get(i.id) : undefined })) } satisfies PreviewModel;
  },
  helpText: 'Pick a curated rule and an even item count. Every glyph maps to exactly one bucket, buckets balance 40–60%, and scoring is accuracy-first.',
  accessibilityNotes: ['No colour-only distinction; no borderline glyphs.', 'Begin-gate before the clock; accuracy first.'],
  smallScreenNotes: ['Two bucket labels + stream fit 320dp.'],
  approvedInputs: ['CLASSIFICATION_RULES (curated)'],
};
