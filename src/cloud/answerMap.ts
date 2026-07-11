/**
 * Answer mapping — domain `Answer` → the server submission contract.
 *
 * Cloud mode sends the player's RAW response and nothing else: no score, no
 * correctness, no derived accuracy. This module is the single, exhaustive,
 * type-safe boundary between the engines' local answer shapes and the four
 * submission shapes the Edge Functions accept. It rejects malformed answers
 * BEFORE they reach the network and caps list sizes so a hostile/buggy client
 * can't send an unbounded payload.
 *
 * Pure and platform-free — unit-tested against every one of the 15 engines.
 */

import type { Answer, EngineId } from '../types/puzzle';

/** The exact submission shapes the server's `validateSubmission` accepts. */
export type CloudSubmission =
  | { selectedId: string }
  | { selectedIds: string[] }
  | { tappedIds: string[] }
  | { classifications: { itemId: string; bucket: 0 | 1 }[] };

export type MapResult =
  | { ok: true; submission: CloudSubmission }
  | { ok: false; error: string };

/** No engine has more than this many tiles/items; caps a runaway payload. */
export const MAX_LIST = 64;
const MAX_ID = 64;

const SINGLE_CHOICE: ReadonlySet<EngineId> = new Set<EngineId>([
  'OBS_001', 'PAT_003', 'OBS_003', 'PAT_001', 'PAT_002', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002',
]);
const ID_LIST: ReadonlySet<EngineId> = new Set<EngineId>(['OBS_004', 'LOG_003', 'LNG_003', 'ATT_002']);

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const idsWithin = (v: unknown, min: number): v is string[] =>
  Array.isArray(v) && v.length >= min && v.length <= MAX_LIST && v.every(isId);

/**
 * Map a domain answer for `engineId` to a server submission, or return a stable
 * error code. The engine family — not a guess — determines the shape.
 */
export function toSubmission(engineId: EngineId, answer: Answer): MapResult {
  // Single-choice engines: a non-null selected id.
  if (SINGLE_CHOICE.has(engineId)) {
    if (answer.kind !== 'choice') return { ok: false, error: 'expected_choice' };
    if (!isId(answer.selectedId)) return { ok: false, error: 'no_selection' };
    return { ok: true, submission: { selectedId: answer.selectedId } };
  }

  // Pair / ordering / memory engines: an ordered list of ids (order preserved).
  if (ID_LIST.has(engineId)) {
    if (answer.kind !== 'sequence') return { ok: false, error: 'expected_sequence' };
    // Pair Find is exactly two; the others need at least one placed id.
    const min = engineId === 'OBS_004' ? 2 : 1;
    if (!idsWithin(answer.selectedIds, min)) return { ok: false, error: 'invalid_ids' };
    if (engineId === 'OBS_004' && answer.selectedIds.length !== 2) return { ok: false, error: 'pair_needs_two' };
    return { ok: true, submission: { selectedIds: [...answer.selectedIds] } };
  }

  // Symbol Sweep: the raw tapped ids (an empty sweep is a valid play).
  if (engineId === 'ATT_001') {
    if (answer.kind !== 'sweep') return { ok: false, error: 'expected_sweep' };
    const t = answer.tappedIds;
    if (!Array.isArray(t) || t.length > MAX_LIST || !t.every(isId)) return { ok: false, error: 'invalid_taps' };
    // De-duplicate, preserving first-tap order — the server does the same.
    return { ok: true, submission: { tappedIds: [...new Set(t)] } };
  }

  // Rapid Classification: each classified item's chosen bucket.
  if (engineId === 'ATT_003') {
    if (answer.kind !== 'classify') return { ok: false, error: 'expected_classify' };
    const c = answer.classifications;
    if (
      !Array.isArray(c) || c.length > MAX_LIST ||
      !c.every((x) => x && typeof x === 'object' && isId(x.itemId) && (x.bucket === 0 || x.bucket === 1))
    ) {
      return { ok: false, error: 'invalid_classifications' };
    }
    return { ok: true, submission: { classifications: c.map((x) => ({ itemId: x.itemId, bucket: x.bucket })) } };
  }

  return { ok: false, error: 'unknown_engine' };
}
