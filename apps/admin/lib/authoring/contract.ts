/**
 * Canonical build/validate contract (Phase 7H.3, Tasks 2–3).
 *
 * The typed request/response the Admin uses to build + validate a candidate
 * through the single canonical boundary. Pure types + version constants — safe to
 * import from client or server. The actual build runs server-only in
 * `./canonical.ts`; the private answer is NEVER included in a response unless the
 * caller is authorized AND explicitly asks for it.
 */

// ── Version pinning (Task 3) ─────────────────────────────────────────────────
// A later code release must not silently reinterpret an old approved draft: every
// build records these, and a rebuild under a newer version bumps the draft version
// and forces re-review (enforced in the DB state machine + surfaced in the UI).
export const AUTHORING_SCHEMA_VERSION = 1 as const;
export const BUILDER_VERSION = '1.0.0' as const;
export const VALIDATOR_VERSION = '1.0.0' as const;

export type BuildFailureCode =
  | 'unsupported_engine'
  | 'unsupported_schema_version'
  | 'invalid_seed'
  | 'build_error'
  | 'timeout'
  | 'permission_denied';

export interface BuildRequest {
  /** The draft being (re)built. Null for a first build before the draft row exists. */
  draftId: string | null;
  /** Optimistic-concurrency guard; the server rejects a stale version. Null on first build. */
  expectedDraftVersion: number | null;
  engineId: string;
  /** Typed seed for the engine — validated against the engine schema before build. */
  seed: unknown;
  difficulty: number;
  /** Pins the builder the client believes it is targeting; server rejects a mismatch. */
  builderVersion?: string;
  authoringSchemaVersion?: number;
  /**
   * Whether to include the private answer in the response. Only honored when the
   * caller's role is authorized (checked server-side); default false.
   */
  includeAnswer?: boolean;
}

export interface ValidationResult {
  passed: boolean;
  /** Findings that BLOCK approval (a failed validator can never be approved). */
  blockingFindings: string[];
  /** Advisory findings that do not block (empty today; reserved for soft checks). */
  warningFindings: string[];
  /** Near-duplicate/similarity findings where available (deferred; empty today). */
  similarityFindings: string[];
  validatorVersion: string;
  validatedAt: string;
}

/** Sanitized, gameplay-safe preview payload — no attempt, no token, no analytics. */
export interface SafePreview {
  engineId: string;
  category: string;
  difficulty: number;
  prompt: string | null;
  explanation: string | null;
  /** The public canonical payload (answer already split out). */
  publicPayload: Record<string, unknown>;
  /** Present only when the caller was authorized to reveal the answer. */
  answer?: Record<string, unknown>;
  estimatedTimeMs: number | null;
}

export interface BuildSuccess {
  ok: true;
  engineId: string;
  draftVersion: number | null;
  /** True iff a private answer exists (its value is withheld unless authorized). */
  hasAnswer: boolean;
  contentHash: string;
  seedHash: string;
  builderVersion: string;
  authoringSchemaVersion: number;
  builtAt: string;
  validation: ValidationResult;
  preview: SafePreview;
}

export interface BuildFailure {
  ok: false;
  code: BuildFailureCode;
  message: string;
}

export type BuildResponse = BuildSuccess | BuildFailure;
