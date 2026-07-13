/**
 * Canonical authoring boundary — the SINGLE server-side entry the Admin uses to
 * build and validate a puzzle candidate (Phase 7H.3, checkpoint 7H.3.1).
 *
 * This module reuses the exact canonical builders (`./authoring`), the exact
 * independent validator (`./validators`), the engine registry (`./engines`) and
 * the public/private split descriptors (`../infrastructure/supabase/publicFields`).
 * It reimplements NOTHING — it only wires them into one pure `buildCandidate`
 * function so the Admin never re-derives content or answers.
 *
 * It is deliberately PURE (no `node:crypto`, no DB, no React/RN): esbuild bundles
 * it into `apps/admin/lib/authoring/canonical.generated.mjs` so the isolated
 * Admin Vercel project (rooted at `apps/admin`) can import a single-source
 * artifact without reaching outside its deployment boundary. Because it is pure,
 * the same bundle runs under Node (Next.js server) and Deno, and is provable
 * byte-identical to the content pipeline in a plain Node test — see
 * `scripts/authoring-boundary-test.mjs`. Hashing is applied by the Node wrapper
 * (`apps/admin/lib/authoring/canonical.ts`) with `node:crypto`, over the exact
 * `canonicalString` this module returns — so hashes stay identical to the
 * importer/parity checker.
 *
 * See docs/ADMIN_AUTHORING_ARCHITECTURE.md for the decision + rejected options.
 */

import type { EngineId, Puzzle } from '../types/puzzle';
import {
  analogy,
  balanceScales,
  deduction,
  matrixCompletion,
  memoryFlash,
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
 MEMORY_GLYPHS } from './authoring';
import { ENGINE_REGISTRY } from './engines';
import { validatePuzzle } from './validators';
import { ALWAYS_PRIVATE_FIELDS, ENGINE_SPLIT } from '../infrastructure/supabase/publicFields';
import {
  ANALOGIES,
  CLASSIFICATION_RULES,
  DEDUCTION_SCENARIOS,
  GLYPH_FAMILIES,
  MEMORY_EXPOSURE_BY_DIFFICULTY,
  MEMORY_INTERVAL_MS,
  ODD_WORD_SETS,
  ORDERING_SCENARIOS,
  PAIR_GLYPHS,
  SENTENCE_SETS,
  SWEEP_GLYPHS,
} from './lexicon';

/** A safe {value,label} option — never carries a correct answer. */
type Opt = { value: string; label: string };

/**
 * Answer-free scenario selectors for the curated engines. Labels are derived from
 * PUBLIC scenario fields only (never the `answer`/`outlier`/`correctOrder`), so
 * the option lists shipped to an authoring form leak nothing. The full curated
 * tables (with answers) stay in the bundle, used only by the server-side builder.
 */
const scenarioOptions: Record<string, Opt[]> = {
  LOG_001: DEDUCTION_SCENARIOS.map((s, i) => ({ value: String(i), label: `${i}: ${s.form}` })),
  LNG_001: ANALOGIES.map((e, i) => ({ value: String(i), label: `${i}: ${e.relation} — ${e.given[0]} : ${e.given[1]}` })),
  LNG_002: ODD_WORD_SETS.map((s, i) => ({ value: String(i), label: `${i}: ${s.words[0]} / ${s.words[1]} / ${s.words[2]} / …` })),
  LOG_003: ORDERING_SCENARIOS.map((s, i) => ({ value: String(i), label: `${i}: ${s.items.join(', ')} (${s.verb})` })),
  LNG_003: SENTENCE_SETS.map((s, i) => ({ value: String(i), label: `${i}: ${s.fragments[0]}…` })),
};

/**
 * The curated authoring vocabularies, surfaced for the Admin forms so they offer
 * ONLY approved inputs — no free Unicode entry, no drift from the canonical
 * ontology. A model/author may CHOOSE from these; never ADD to them.
 */
export const AUTHORING_VOCAB = {
  glyphFamilies: GLYPH_FAMILIES as Record<string, readonly string[]>,
  pairGlyphs: PAIR_GLYPHS as readonly string[],
  sweepGlyphs: SWEEP_GLYPHS as readonly string[],
  memoryGlyphs: [...MEMORY_GLYPHS] as readonly string[],
  sequenceFamilies: [
    'arithmetic', 'geometric', 'divide', 'squares', 'triangular', 'oblong', 'fibonacci', 'alternating',
  ] as const,
  matrixRules: ['rowConstant', 'colConstant', 'latin'] as const,
  scenarioOptions,
  scenarioCounts: {
    LOG_001: DEDUCTION_SCENARIOS.length,
    LNG_001: ANALOGIES.length,
    LNG_002: ODD_WORD_SETS.length,
    LOG_003: ORDERING_SCENARIOS.length,
    LNG_003: SENTENCE_SETS.length,
  } as Record<string, number>,
  classificationRules: Object.values(CLASSIFICATION_RULES).map((r) => ({ value: r.key, label: r.question, buckets: r.buckets as [string, string] })),
  balanceTemplates: [
    { value: 'A', label: 'A · ▲=k■, ◆=m▲ → ◆ in ■ (2 scales)', params: ['k', 'm'] },
    { value: 'D', label: 'D · ◆=a■, ●=b◆ → ● in ■ (2 scales)', params: ['a', 'b'] },
    { value: 'B', label: 'B · a●=b▲, ▲=t■ → ● in ■ (2 scales)', params: ['a', 'b', 't'] },
    { value: 'C', label: 'C · ▲=k■, ◆=2▲, ◆=n● → ● in ■ (3 scales)', params: ['k', 'n'] },
  ] as const,
  memoryExposureByDifficulty: MEMORY_EXPOSURE_BY_DIFFICULTY as Record<number, number>,
  memoryIntervalMs: MEMORY_INTERVAL_MS,
} as const;

/** The 15 canonical builders, keyed by engine id (via the registry's builderId). */
const BUILDER_FNS: Record<string, (seed: any) => Puzzle> = {
  oddOneOut,
  rotationMatch,
  pairFind,
  sequenceCompletion,
  matrixCompletion,
  sequenceRepair,
  deduction,
  balanceScales,
  ordering,
  analogy,
  oddWordOut,
  sentenceOrdering,
  symbolSweep,
  memoryFlash,
  rapidClassification,
};

/** engineId → canonical builder function, resolved through the Engine Registry. */
export const BUILDERS: Record<string, (seed: any) => Puzzle> = Object.fromEntries(
  ENGINE_REGISTRY.map((e) => {
    const fn = BUILDER_FNS[e.builderId];
    if (!fn) throw new Error(`authoringBoundary: no builder for ${e.engineId} (${e.builderId})`);
    return [e.engineId, fn];
  }),
);

export const ENGINE_IDS = ENGINE_REGISTRY.map((e) => e.engineId);

// Re-export the canonical registry + validator so the Admin (and the parity test)
// use exactly these — never a re-implementation.
export { ENGINE_REGISTRY, validatePuzzle };

/** True iff the engine is a real, active, built V1 engine. */
export function isSupportedEngine(engineId: string): engineId is EngineId {
  const e = ENGINE_REGISTRY.find((x) => x.engineId === engineId);
  return !!e && e.active && e.buildStatus === 'built';
}

/**
 * Stable JSON: object keys sorted recursively — MUST stay byte-identical to
 * `scripts/db/canonical.mjs#canonicalStringify` (the importer/parity source of
 * truth). `scripts/authoring-boundary-test.mjs` enforces that equality across
 * all 326 puzzles; if you change one you break the gate.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

/**
 * Split a built puzzle into { public, answer } — a pure port of
 * `scripts/db/canonical.mjs#splitPuzzle`, driven by the same `ENGINE_SPLIT`
 * descriptors. Parity-tested against the importer for all 326 puzzles.
 */
export function splitBuilt(puzzle: Puzzle): { public: Record<string, unknown>; answer: Record<string, unknown> } {
  const spec = ENGINE_SPLIT[puzzle.engineId];
  if (!spec) throw new Error(`no split descriptor for engine ${puzzle.engineId}`);

  const del = new Set<string>([...spec.delete, ...ALWAYS_PRIVATE_FIELDS]);
  const pub: Record<string, unknown> = {};
  const answer: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(puzzle)) {
    if (del.has(key)) answer[key] = val;
    else pub[key] = val;
  }

  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const elements = (puzzle as Record<string, any>)[field] as Record<string, unknown>[];
    pub[field] = elements.map((el) => {
      const { [answerKey]: _omit, ...rest } = el;
      return rest;
    });
    answer[field] = elements.map((el) => ({ id: el.id, [answerKey]: el[answerKey] }));
  }

  return { public: pub, answer };
}

/** Assert the public payload leaks no private/answer field (mirror of the importer guard). */
export function assertNoAnswerLeak(publicPayload: Record<string, unknown>, puzzle: Puzzle): void {
  const spec = ENGINE_SPLIT[puzzle.engineId];
  const leaks: string[] = [];
  for (const field of [...spec.delete, ...ALWAYS_PRIVATE_FIELDS]) {
    if (field in publicPayload) leaks.push(field);
  }
  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const arr = (publicPayload[field] as Record<string, unknown>[]) ?? [];
    if (arr.some((el) => answerKey in el)) leaks.push(`${field}[].${answerKey}`);
  }
  if (leaks.length) throw new Error(`${puzzle.id}: public payload leaks answer field(s): ${leaks.join(', ')}`);
}

export type BuildOutcome =
  | {
      ok: true;
      puzzle: Puzzle;
      publicPayload: Record<string, unknown>;
      answer: Record<string, unknown>;
      /** canonicalStringify(puzzle) — the Node wrapper sha256's this for content_hash. */
      contentString: string;
      /** canonicalStringify(seed) — the Node wrapper sha256's this for the seed hash. */
      seedString: string;
      findings: string[];
    }
  | { ok: false; code: 'unsupported_engine' | 'invalid_seed' | 'build_error'; message: string };

/**
 * Build a candidate from a typed seed and validate it — the one canonical path.
 * Never throws for bad input: a builder that throws (impossible distractor,
 * missing glyph, …) becomes `{ ok:false, code:'build_error' }`. The caller
 * decides persistence; NO canonical row is written here.
 */
export function buildCandidate(engineId: string, seed: unknown): BuildOutcome {
  if (!isSupportedEngine(engineId)) {
    return { ok: false, code: 'unsupported_engine', message: `engine ${engineId} is not an active built engine` };
  }
  if (seed === null || typeof seed !== 'object') {
    return { ok: false, code: 'invalid_seed', message: 'seed must be an object' };
  }
  const builder = BUILDERS[engineId]!;
  let puzzle: Puzzle;
  try {
    puzzle = builder(seed);
  } catch (e) {
    return { ok: false, code: 'build_error', message: e instanceof Error ? e.message : String(e) };
  }
  const findings = validatePuzzle(puzzle).slice();
  const { public: publicPayload, answer } = splitBuilt(puzzle);
  return {
    ok: true,
    puzzle,
    publicPayload,
    answer,
    contentString: canonicalStringify(puzzle),
    seedString: canonicalStringify(seed),
    findings,
  };
}
