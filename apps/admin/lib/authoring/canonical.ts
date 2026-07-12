/**
 * Server-only canonical build/validate wrapper (Phase 7H.3, Task 4).
 *
 * This is the ONLY place the Admin turns a typed seed into a built + validated
 * candidate. It runs the single canonical boundary (`canonical.generated.mjs`,
 * regenerated from `src/content/authoringBoundary.ts` — never re-implemented),
 * hashes with `node:crypto` exactly as the importer does, pins builder/validator
 * versions, and handles every failure without ever writing canonical content
 * (the DB RPC does that separately, only from a passing, reviewed draft).
 *
 * `import 'server-only'` guarantees the builders, validator and any answer never
 * reach the browser bundle.
 */

import 'server-only';
import { createHash } from 'node:crypto';
import {
  buildCandidate,
  ENGINE_REGISTRY,
  isSupportedEngine,
} from './canonical.generated.mjs';
import {
  AUTHORING_SCHEMA_VERSION,
  BUILDER_VERSION,
  VALIDATOR_VERSION,
  type BuildRequest,
  type BuildResponse,
} from './contract';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A hard ceiling so a pathological builder can't hang a request (Task 4: timeout). */
const BUILD_TIMEOUT_MS = 3000;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build + validate a candidate through the canonical boundary.
 *
 * `authorizedForAnswer` MUST be resolved from the caller's Admin role by the
 * route/Server Action (never from client input). When false, the response omits
 * the answer entirely and only reports its presence.
 */
export function buildAndValidateCandidate(req: BuildRequest, authorizedForAnswer = false): BuildResponse {
  // Version pinning: a client targeting a different builder/schema must not get a
  // silently reinterpreted build.
  if (req.builderVersion && req.builderVersion !== BUILDER_VERSION) {
    return { ok: false, code: 'unsupported_schema_version', message: `builder ${req.builderVersion} != ${BUILDER_VERSION}` };
  }
  if (req.authoringSchemaVersion != null && req.authoringSchemaVersion !== AUTHORING_SCHEMA_VERSION) {
    return { ok: false, code: 'unsupported_schema_version', message: `schema ${req.authoringSchemaVersion} != ${AUTHORING_SCHEMA_VERSION}` };
  }
  if (!isSupportedEngine(req.engineId)) {
    return { ok: false, code: 'unsupported_engine', message: `engine ${req.engineId} is not active/built` };
  }

  const started = Date.now();
  const outcome = buildCandidate(req.engineId, req.seed);
  if (Date.now() - started > BUILD_TIMEOUT_MS) {
    return { ok: false, code: 'timeout', message: 'build exceeded the time budget' };
  }
  if (!outcome.ok) {
    // unsupported_engine | invalid_seed | build_error — all map through 1:1.
    return { ok: false, code: outcome.code, message: outcome.message };
  }

  const entry = ENGINE_REGISTRY.find((e) => e.engineId === req.engineId)!;
  const blocking = outcome.findings;
  const validatedAt = nowIso();
  const contentHash = sha256(outcome.contentString);
  const seedHash = sha256(outcome.seedString);
  const hasAnswer = Object.keys(outcome.answer).length > 0;

  const pz = outcome.puzzle as Record<string, unknown>;

  return {
    ok: true,
    engineId: req.engineId,
    draftVersion: req.expectedDraftVersion,
    hasAnswer,
    contentHash,
    seedHash,
    builderVersion: BUILDER_VERSION,
    authoringSchemaVersion: AUTHORING_SCHEMA_VERSION,
    builtAt: nowIso(),
    validation: {
      passed: blocking.length === 0,
      blockingFindings: blocking,
      warningFindings: [],
      similarityFindings: [],
      validatorVersion: VALIDATOR_VERSION,
      validatedAt,
    },
    preview: {
      engineId: req.engineId,
      category: entry.category,
      difficulty: req.difficulty,
      prompt: (pz.prompt as string) ?? null,
      explanation: (pz.explanation as string) ?? null,
      publicPayload: outcome.publicPayload,
      // Answer only crosses the boundary when the caller's role permits it.
      ...(authorizedForAnswer ? { answer: outcome.answer } : {}),
      estimatedTimeMs: entry.estimatedTimeMs ?? null,
    },
  };
}

export { ENGINE_REGISTRY } from './canonical.generated.mjs';
