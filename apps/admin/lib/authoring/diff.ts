/**
 * Structured field-level diff for puzzle revisions (Phase 7I.2D).
 *
 * Pure + serializable — no bundle, no secret. Produces a human-readable,
 * stably-ordered list of added / removed / changed fields between two records.
 * Arrays and nested objects are compared by a canonical string form (not dumped
 * as one giant JSON line). The CALLER decides which fields to include: answer
 * fields are only ever passed in for an authorized, recently-authenticated
 * reviewer, so this module never sees an answer it shouldn't.
 */

export type DiffKind = 'added' | 'removed' | 'changed';
export interface DiffEntry {
  field: string;
  kind: DiffKind;
  before: string | null;
  after: string | null;
}

/** Stable, readable rendering of a value (sorted keys; arrays element-per-line-ish). */
function render(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(render).join(', ')}]`;
  const o = v as Record<string, unknown>;
  return `{ ${Object.keys(o).sort().map((k) => `${k}: ${render(o[k])}`).join(', ')} }`;
}

const canon = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
};

/**
 * Diff two flat "field → value" maps. `order` pins the display order (unknown keys
 * follow, sorted). Fields equal on both sides are omitted.
 */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, order: string[] = []): DiffEntry[] {
  const keys = [...new Set([...order, ...Object.keys(before), ...Object.keys(after)])];
  const seen = new Set<string>();
  const out: DiffEntry[] = [];
  for (const field of keys) {
    if (seen.has(field)) continue;
    seen.add(field);
    const hasB = field in before;
    const hasA = field in after;
    const b = before[field];
    const a = after[field];
    if (hasB && hasA) {
      if (canon(b) !== canon(a)) out.push({ field, kind: 'changed', before: render(b), after: render(a) });
    } else if (hasA) {
      out.push({ field, kind: 'added', before: null, after: render(a) });
    } else if (hasB) {
      out.push({ field, kind: 'removed', before: render(b), after: null });
    }
  }
  return out;
}

/** The canonical field order for a puzzle diff (answer fields appended by caller). */
export const PUZZLE_DIFF_ORDER = [
  'difficulty', 'prompt', 'explanation', 'options', 'public_payload', 'seed',
  'builder_version', 'validator_version', 'schema_version', 'content_hash',
];
