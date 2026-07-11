/**
 * The Engine Registry — the 15 Version-1 engines as structured data.
 *
 * This is the single local source of truth for engine metadata (Core Spec §3),
 * feeding both the local `EngineRepository` and the database import of
 * `puzzle_engines`. Values mirror `docs/ENGINE_CATALOG.md`'s registry table.
 *
 * Platform-free (no React), so the app, the scripts, and the importer all read
 * the same list.
 */

import type { Category, EngineId } from '../types/puzzle';

export interface EngineRegistryEntry {
  engineId: EngineId;
  category: Category;
  name: string;
  active: boolean;
  buildStatus: 'built' | 'planned' | 'retired';
  minDifficulty: number;
  maxDifficulty: number;
  rotationWeight: number;
  weeklyCap: number;
  minDaysBetween: number;
  estimatedTimeMs: number;
  uiComponent: string;
  builderId: string;
  validatorId: string;
  scoringId: string;
  explanationStrategy: string;
  accessibilityProfile: Record<string, boolean | number>;
  minAppVersion: string;
}

/** §13 profile — every V1 engine satisfies the full accessibility baseline. */
const A11Y = {
  colorSafe: true,
  highContrast: true,
  screenScaling: true,
  handednessNeutral: true,
  noAudioDependency: true,
  noFlashingContent: true,
  minTapTargetDp: 48,
} as const;

const entry = (
  engineId: EngineId,
  category: Category,
  name: string,
  min: number,
  max: number,
  estimatedTimeMs: number,
  weeklyCap: number,
  minDaysBetween: number,
  rotationWeight: number,
  uiComponent: string,
  builderId: string,
  validatorId: string,
): EngineRegistryEntry => ({
  engineId,
  category,
  name,
  active: true,
  buildStatus: 'built',
  minDifficulty: min,
  maxDifficulty: max,
  rotationWeight,
  weeklyCap,
  minDaysBetween,
  estimatedTimeMs,
  uiComponent,
  builderId,
  validatorId,
  scoringId: 'scorePuzzle',
  explanationStrategy: 'builder-derived',
  accessibilityProfile: { ...A11Y },
  minAppVersion: '1.0.0',
});

export const ENGINE_REGISTRY: EngineRegistryEntry[] = [
  entry('OBS_001', 'observation', 'Odd One Out', 1, 4, 15000, 3, 2, 1.0, 'OddOneOutEngine', 'oddOneOut', 'validateOddOneOut'),
  entry('OBS_003', 'observation', 'Rotation Match', 2, 5, 32000, 2, 3, 0.9, 'RotationMatchEngine', 'rotationMatch', 'validateRotationMatch'),
  entry('OBS_004', 'observation', 'Pair Find', 2, 4, 30000, 2, 3, 0.8, 'PairFindEngine', 'pairFind', 'validatePairFind'),
  entry('PAT_001', 'pattern', 'Sequence Completion', 1, 5, 25000, 3, 2, 1.2, 'SequenceCompletionEngine', 'sequenceCompletion', 'validateSequence'),
  entry('PAT_002', 'pattern', 'Matrix Completion', 2, 5, 45000, 2, 3, 1.0, 'MatrixCompletionEngine', 'matrixCompletion', 'validateMatrix'),
  entry('PAT_003', 'pattern', 'Sequence Repair', 2, 5, 32000, 2, 3, 1.0, 'SequenceRepairEngine', 'sequenceRepair', 'validateSequenceRepair'),
  entry('LOG_001', 'logic', 'Deduction', 2, 5, 38000, 3, 2, 1.1, 'DeductionEngine', 'deduction', 'validateDeduction'),
  entry('LOG_002', 'logic', 'Balance Scales', 2, 5, 38000, 3, 2, 1.1, 'BalanceScalesEngine', 'balanceScales', 'validateBalance'),
  entry('LOG_003', 'logic', 'Ordering', 2, 5, 45000, 2, 3, 0.9, 'OrderingEngine', 'ordering', 'validateOrdering'),
  entry('LNG_001', 'language-logic', 'Analogy', 2, 5, 25000, 3, 2, 1.1, 'AnalogyEngine', 'analogy', 'validateAnalogy'),
  entry('LNG_002', 'language-logic', 'Odd Word Out', 1, 4, 20000, 3, 2, 1.0, 'OddWordOutEngine', 'oddWordOut', 'validateOddWordOut'),
  entry('LNG_003', 'language-logic', 'Sentence Ordering', 2, 4, 35000, 2, 3, 0.9, 'SentenceOrderingEngine', 'sentenceOrdering', 'validateSentenceOrdering'),
  entry('ATT_001', 'attention-speed', 'Symbol Sweep', 1, 5, 20000, 3, 2, 1.2, 'SymbolSweepEngine', 'symbolSweep', 'validateSweep'),
  entry('ATT_002', 'attention-speed', 'Memory Flash', 2, 5, 22000, 2, 3, 1.0, 'MemoryFlashEngine', 'memoryFlash', 'validateMemoryFlash'),
  entry('ATT_003', 'attention-speed', 'Rapid Classification', 2, 5, 22000, 2, 3, 1.0, 'RapidClassificationEngine', 'rapidClassification', 'validateClassification'),
];
