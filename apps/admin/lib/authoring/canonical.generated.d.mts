/**
 * Types for the generated canonical bundle (canonical.generated.mjs).
 * Hand-written because esbuild emits JS only; kept in step with
 * src/content/authoringBoundary.ts. The runtime shape is proven by
 * npm run test:authoring-boundary.
 */

export type BuildOutcome =
  | {
      ok: true;
      puzzle: Record<string, unknown> & { id: string; engineId: string; difficulty: number };
      publicPayload: Record<string, unknown>;
      answer: Record<string, unknown>;
      contentString: string;
      seedString: string;
      findings: string[];
    }
  | { ok: false; code: 'unsupported_engine' | 'invalid_seed' | 'build_error'; message: string };

export interface EngineRegistryEntry {
  engineId: string;
  category: string;
  name: string;
  active: boolean;
  buildStatus: 'built' | 'planned' | 'retired';
  minDifficulty: number;
  maxDifficulty: number;
  weeklyCap: number;
  minDaysBetween: number;
  estimatedTimeMs: number;
  uiComponent: string;
  builderId: string;
  validatorId: string;
}

export const ENGINE_IDS: string[];
export const ENGINE_REGISTRY: EngineRegistryEntry[];
export const BUILDERS: Record<string, (seed: unknown) => Record<string, unknown>>;
export function isSupportedEngine(engineId: string): boolean;
export function canonicalStringify(value: unknown): string;
export function splitBuilt(puzzle: Record<string, unknown>): {
  public: Record<string, unknown>;
  answer: Record<string, unknown>;
};
export function assertNoAnswerLeak(publicPayload: Record<string, unknown>, puzzle: Record<string, unknown>): void;
export function buildCandidate(engineId: string, seed: unknown): BuildOutcome;
export function validatePuzzle(puzzle: Record<string, unknown>): string[];
