/**
 * The public/private boundary, declared once.
 *
 * For each engine, this describes how a full `Puzzle` splits into:
 *   * a render-safe **public payload** (`puzzles.public_payload`), and
 *   * a private **answer payload** (`puzzle_answers.answer_payload`)
 *     that a client must never receive before it submits.
 *
 * This is the single source of truth for the split. The importer uses it to
 * populate the two tables; a database test asserts every engine is covered and
 * that no public payload contains a private field. If a new engine adds an
 * answer field, describe it here and both sides stay correct.
 *
 * See docs/DATABASE_FOUNDATION.md §"Public/private boundary".
 */

import type { EngineId } from '../../types/puzzle';

/**
 * `delete` — top-level fields removed from the puzzle to form the answer key.
 * `reshape` — an array field whose *elements* carry the answer, so the field
 *   stays (the client needs the glyphs to render) but each element is stripped
 *   of its answer sub-field, which moves to the answer payload.
 */
export interface EngineSplit {
  delete: readonly string[];
  reshape?: {
    field: 'symbols' | 'items';
    /** Element sub-field that is the answer and must not ship. */
    answerKey: 'isTarget' | 'bucket';
  };
}

/** `explanation` is private for every engine (revealed only after answering). */
export const ALWAYS_PRIVATE_FIELDS = ['explanation'] as const;

export const ENGINE_SPLIT: Record<EngineId, EngineSplit> = {
  OBS_001: { delete: ['oddTileId'] },
  OBS_003: { delete: ['correctOptionId'] },
  OBS_004: { delete: ['pairTileIds'] },
  PAT_001: { delete: ['correctOptionId'] },
  PAT_002: { delete: ['correctOptionId'] },
  PAT_003: { delete: ['wrongIndex', 'correctTerm'] },
  LOG_001: { delete: ['correctOptionId'] },
  LOG_002: { delete: ['correctOptionId'] },
  LOG_003: { delete: ['correctOrder'] },
  LNG_001: { delete: ['correctOptionId'] },
  // `membership` encodes which word is the outlier, so it is part of the answer.
  LNG_002: { delete: ['correctOptionId', 'membership'] },
  // `constraints` pin the one valid ordering, so they are the answer.
  LNG_003: { delete: ['correctOrder', 'constraints'] },
  // The grid must render, but which tiles are targets is the answer: strip
  // `isTarget` from each symbol.
  ATT_001: { delete: [], reshape: { field: 'symbols', answerKey: 'isTarget' } },
  // The board and the shown `targets` are gameplay; which board tiles carry them
  // (`targetIds`) is the canonical answer key. (Memory Flash's real secret is the
  // player's memory — the answer is derivable from what they were shown. See the
  // design doc; the key is stored for a canonical record, not to hide it.)
  ATT_002: { delete: ['targetIds'] },
  // The stream must render, but each item's correct bucket is the answer.
  ATT_003: { delete: [], reshape: { field: 'items', answerKey: 'bucket' } },
} as const;
