/**
 * The Admin authoring-form registry (Phase 7H.3.2A, Task 1).
 *
 * Maps engineId → EngineFormSchema. A single generic form/preview renderer reads
 * these; there is no per-engine switch component. Only the six engines shipped in
 * 7H.3.2A are registered — the remaining nine (Logic, Language Logic, Attention
 * Speed) are added here as DATA in later checkpoints, not as new code paths.
 */

import type { EngineFormSchema } from './types';
import { OBS_001_SCHEMA, OBS_003_SCHEMA, OBS_004_SCHEMA } from './observation';
import { PAT_001_SCHEMA, PAT_002_SCHEMA, PAT_003_SCHEMA } from './pattern';

export const FORM_REGISTRY: Record<string, EngineFormSchema<any, any>> = {
  OBS_001: OBS_001_SCHEMA,
  OBS_003: OBS_003_SCHEMA,
  OBS_004: OBS_004_SCHEMA,
  PAT_001: PAT_001_SCHEMA,
  PAT_002: PAT_002_SCHEMA,
  PAT_003: PAT_003_SCHEMA,
};

/** Engines with an authoring form live in this checkpoint (Observation + Pattern). */
export const AUTHORABLE_ENGINE_IDS = Object.keys(FORM_REGISTRY);

/** Resolve a schema; throws on an unknown/unauthorable engine (never silently). */
export function getFormSchema(engineId: string): EngineFormSchema<any, any> {
  const schema = FORM_REGISTRY[engineId];
  if (!schema) throw new Error(`no authoring form for engine ${engineId}`);
  return schema;
}

export function isAuthorableEngine(engineId: string): boolean {
  return engineId in FORM_REGISTRY;
}

export function authorableEnginesByCategory(): { category: string; engines: EngineFormSchema<any, any>[] }[] {
  const byCat = new Map<string, EngineFormSchema<any, any>[]>();
  for (const s of Object.values(FORM_REGISTRY)) {
    const list = byCat.get(s.category) ?? [];
    list.push(s);
    byCat.set(s.category, list);
  }
  return [...byCat.entries()].map(([category, engines]) => ({ category, engines }));
}

export type { EngineFormSchema } from './types';
export * from './types';
