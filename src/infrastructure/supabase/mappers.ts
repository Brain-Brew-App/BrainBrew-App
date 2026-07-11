/**
 * Mapping between database rows and the domain (gameplay) types.
 *
 * The domain types in `src/types/puzzle.ts` stay authoritative for rendering and
 * local behaviour; database types never leak past this file. Mapping is one-way
 * for now: DB → domain, and only for the *public* shape, because the public
 * surface deliberately does not carry answers.
 *
 * A "render-safe puzzle" is a domain `Puzzle` with its answer fields absent. It
 * is enough to draw a puzzle, and not enough to score it — which is exactly what
 * a pre-answer client should hold. Reconstructing a *full* Puzzle from the cloud
 * is impossible without the answer, and that is by design: it stays a
 * verification-only capability until server-authoritative scoring exists.
 */

import type { EngineId, Puzzle } from '../../types/puzzle';
import type { PublicPackSlotRow, Tables } from './database.types';

/** A domain Puzzle with its answer fields stripped — renderable, not scorable. */
export type RenderSafePuzzle = Omit<
  Puzzle,
  | 'oddTileId'
  | 'correctOptionId'
  | 'pairTileIds'
  | 'wrongIndex'
  | 'correctTerm'
  | 'correctOrder'
  | 'constraints'
  | 'membership'
  | 'targetIds'
  | 'explanation'
>;

/**
 * Map one public pack-slot row to a render-safe puzzle.
 *
 * The row's `public_payload` already IS the render-safe puzzle body (the
 * importer built it via the shared split), so this rehydrates it and layers the
 * row's typed columns on top. It cannot produce an answer field because the
 * public surface never carried one.
 */
export function publicSlotToRenderSafe(row: PublicPackSlotRow): RenderSafePuzzle {
  if (!row.public_payload || typeof row.public_payload !== 'object') {
    throw new Error(`public slot ${row.puzzle_id}: missing public_payload`);
  }
  // The payload was serialized from a render-safe puzzle; trust its shape but
  // re-stamp the columns the DB owns.
  return {
    ...(row.public_payload as object),
    id: row.puzzle_id ?? '',
    engineId: (row.engine_id ?? '') as EngineId,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
    prompt: row.prompt ?? undefined,
  } as unknown as RenderSafePuzzle;
}

/** A domain-shaped view of an engine registry row (metadata only). */
export interface EngineMeta {
  engineId: string;
  category: string;
  name: string;
  active: boolean;
  buildStatus: string;
  minDifficulty: number;
  maxDifficulty: number;
  rotationWeight: number;
  weeklyCap: number;
  minDaysBetween: number;
  estimatedTimeMs: number;
  uiComponent: string;
}

export function engineRowToMeta(row: Tables<'puzzle_engines'>): EngineMeta {
  return {
    engineId: row.engine_id,
    category: row.category,
    name: row.name,
    active: row.active,
    buildStatus: row.build_status,
    minDifficulty: row.min_difficulty,
    maxDifficulty: row.max_difficulty,
    rotationWeight: Number(row.rotation_weight),
    weeklyCap: row.weekly_cap,
    minDaysBetween: row.min_days_between,
    estimatedTimeMs: row.estimated_time_ms,
    uiComponent: row.ui_component,
  };
}
