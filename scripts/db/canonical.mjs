/**
 * Canonicalization: deterministic hashing and the public/private split.
 *
 * Shared by the importer, the parity checker, and the database test harness so
 * all three agree byte-for-byte. Pure Node (node:crypto) — never bundled into
 * the app.
 */

import { createHash } from 'node:crypto';

/** Stable JSON: object keys sorted recursively, so equal content hashes equal. */
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

export const sha256 = (input) => createHash('sha256').update(input).digest('hex');

/** The content hash of a full puzzle (answer included) — the identity for parity. */
export const contentHash = (puzzle) => sha256(canonicalStringify(puzzle));

/** The content hash of a seed payload. */
export const seedHash = (payload) => sha256(canonicalStringify(payload));

/** A pack's hash: its ordered puzzle content hashes. Order is part of identity. */
export const packHash = (orderedPuzzleHashes) => sha256(canonicalStringify(orderedPuzzleHashes));

/**
 * Split a full puzzle into { public, answer } using the engine's descriptor.
 *
 * `split` is the compiled `ENGINE_SPLIT` from src/infrastructure/supabase/
 * publicFields.ts, and `alwaysPrivate` the compiled `ALWAYS_PRIVATE_FIELDS`.
 * Passing them in keeps this module free of a TS import while preserving the
 * single source of truth.
 */
export function splitPuzzle(puzzle, split, alwaysPrivate) {
  const spec = split[puzzle.engineId];
  if (!spec) throw new Error(`no split descriptor for engine ${puzzle.engineId}`);

  const del = new Set([...spec.delete, ...alwaysPrivate]);
  const pub = {};
  const answer = {};

  for (const [key, val] of Object.entries(puzzle)) {
    if (del.has(key)) answer[key] = val;
    else pub[key] = val;
  }

  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const elements = puzzle[field];
    // The array stays public, but each element loses its answer sub-field…
    pub[field] = elements.map((el) => {
      const { [answerKey]: _omit, ...rest } = el;
      return rest;
    });
    // …which is recorded in the answer, keyed by element id.
    answer[field] = elements.map((el) => ({ id: el.id, [answerKey]: el[answerKey] }));
  }

  return { public: pub, answer };
}

/**
 * A hard assertion used by the importer and tests: the public payload must
 * contain no private field, and no reshaped answer sub-field. Throws on leak.
 */
export function assertNoAnswerLeak(publicPayload, puzzle, split, alwaysPrivate) {
  const spec = split[puzzle.engineId];
  const leaks = [];

  for (const field of [...spec.delete, ...alwaysPrivate]) {
    if (field in publicPayload) leaks.push(field);
  }
  if (spec.reshape) {
    const { field, answerKey } = spec.reshape;
    const arr = publicPayload[field] ?? [];
    if (arr.some((el) => answerKey in el)) leaks.push(`${field}[].${answerKey}`);
  }

  if (leaks.length) {
    throw new Error(`${puzzle.id}: public payload leaks answer field(s): ${leaks.join(', ')}`);
  }
}
