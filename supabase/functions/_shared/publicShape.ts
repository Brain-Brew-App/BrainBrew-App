/**
 * The public shape the client is allowed to receive, and the submission shapes
 * the server is willing to accept.
 *
 * Two jobs:
 *   1. `toPublicPuzzle` — turn a `get_public_pack` row into a render-safe puzzle,
 *      defensively stripping any answer field even though the stored
 *      `public_payload` is built without one (belt and suspenders at the edge).
 *   2. `validateSubmission` — reject any submission whose shape doesn't match the
 *      engine, before it reaches scoring. A cloud client is untrusted input.
 */

/** One row from the `get_public_pack(date)` RPC. */
export interface PublicSlotRow {
  pack_date: string;
  pack_difficulty: string;
  position: number;
  category: string;
  engine_id: string;
  puzzle_id: string;
  difficulty: number;
  prompt: string;
  public_payload: Record<string, unknown>;
  max_score: number;
}

export interface PublicPuzzle {
  position: number;
  category: string;
  engineId: string;
  puzzleId: string;
  difficulty: number;
  prompt: string;
  maxScore: number;
  [renderField: string]: unknown;
}

/**
 * Answer fields that must never appear in a payload sent to the client. Mirrors
 * `src/infrastructure/supabase/publicFields.ts::ENGINE_SPLIT`. If an engine adds
 * an answer field, add it here too — a leak here is a scoring compromise.
 */
const PRIVATE_TOP_LEVEL = new Set([
  'oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm',
  'correctOrder', 'constraints', 'membership', 'targetIds', 'explanation',
]);

/** Element sub-fields that carry the answer inside an array field. */
const PRIVATE_ELEMENT_FIELDS: Record<string, string> = { symbols: 'isTarget', items: 'bucket' };

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PRIVATE_TOP_LEVEL.has(k)) continue;
    const stripKey = PRIVATE_ELEMENT_FIELDS[k];
    if (stripKey && Array.isArray(v)) {
      out[k] = v.map((el) =>
        el && typeof el === 'object' ? Object.fromEntries(Object.entries(el).filter(([ek]) => ek !== stripKey)) : el,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Map a public row to the render-safe puzzle the client receives. */
export function toPublicPuzzle(row: PublicSlotRow): PublicPuzzle {
  const body = row.public_payload && typeof row.public_payload === 'object' ? row.public_payload : {};
  return {
    ...sanitizePayload(body),
    position: row.position,
    category: row.category,
    engineId: row.engine_id,
    puzzleId: row.puzzle_id,
    difficulty: row.difficulty,
    prompt: row.prompt,
    maxScore: row.max_score,
  };
}

// ---------------------------------------------------------------------------
// Submission validation
// ---------------------------------------------------------------------------

export interface RawSubmission {
  selectedId?: string;
  selectedIds?: string[];
  tappedIds?: string[];
  classifications?: { itemId: string; bucket: 0 | 1 }[];
}

const SINGLE_CHOICE = new Set([
  'OBS_001', 'PAT_003', 'OBS_003', 'PAT_001', 'PAT_002', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002',
]);
const ID_LIST = new Set(['OBS_004', 'LOG_003', 'LNG_003', 'ATT_002']);
const MAX_IDS = 64; // no engine has more; caps a hostile payload

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= MAX_IDS && v.every(isId);

/**
 * Validate a submission against its engine. Returns the accepted (narrowed)
 * submission, or an error code. Rejects unknown engines and malformed shapes.
 */
export function validateSubmission(
  engineId: string,
  raw: unknown,
): { ok: true; submission: RawSubmission } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'submission_not_object' };
  const s = raw as Record<string, unknown>;

  if (SINGLE_CHOICE.has(engineId)) {
    if (!isId(s.selectedId)) return { ok: false, error: 'expected_selectedId' };
    return { ok: true, submission: { selectedId: s.selectedId } };
  }
  if (ID_LIST.has(engineId)) {
    if (!isIdList(s.selectedIds)) return { ok: false, error: 'expected_selectedIds' };
    return { ok: true, submission: { selectedIds: s.selectedIds } };
  }
  if (engineId === 'ATT_001') {
    // An empty sweep is a valid play (the player tapped nothing).
    const t = s.tappedIds ?? [];
    if (!Array.isArray(t) || t.length > MAX_IDS || !t.every(isId)) return { ok: false, error: 'expected_tappedIds' };
    return { ok: true, submission: { tappedIds: t as string[] } };
  }
  if (engineId === 'ATT_003') {
    const c = s.classifications;
    if (
      !Array.isArray(c) || c.length > MAX_IDS ||
      !c.every((x) => x && typeof x === 'object' && isId((x as any).itemId) && ((x as any).bucket === 0 || (x as any).bucket === 1))
    ) {
      return { ok: false, error: 'expected_classifications' };
    }
    return { ok: true, submission: { classifications: c as { itemId: string; bucket: 0 | 1 }[] } };
  }
  return { ok: false, error: 'unknown_engine' };
}
