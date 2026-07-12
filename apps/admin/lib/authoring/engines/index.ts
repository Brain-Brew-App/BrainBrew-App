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
import { LOG_001_SCHEMA, LOG_002_SCHEMA, LOG_003_SCHEMA } from './logic';
import { LNG_001_SCHEMA, LNG_002_SCHEMA, LNG_003_SCHEMA } from './language';
import { ATT_001_SCHEMA, ATT_002_SCHEMA, ATT_003_SCHEMA } from './attention';

export const FORM_REGISTRY: Record<string, EngineFormSchema<any, any>> = {
  OBS_001: OBS_001_SCHEMA,
  OBS_003: OBS_003_SCHEMA,
  OBS_004: OBS_004_SCHEMA,
  PAT_001: PAT_001_SCHEMA,
  PAT_002: PAT_002_SCHEMA,
  PAT_003: PAT_003_SCHEMA,
  LOG_001: LOG_001_SCHEMA,
  LOG_002: LOG_002_SCHEMA,
  LOG_003: LOG_003_SCHEMA,
  LNG_001: LNG_001_SCHEMA,
  LNG_002: LNG_002_SCHEMA,
  LNG_003: LNG_003_SCHEMA,
  ATT_001: ATT_001_SCHEMA,
  ATT_002: ATT_002_SCHEMA,
  ATT_003: ATT_003_SCHEMA,
};

/** All 15 active engines are authorable. */
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
