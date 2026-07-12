'use server';

import { requireCapability, contextCan, hasRecentAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { buildAndValidateCandidate } from '@/lib/authoring/canonical';
import { BUILDER_VERSION, VALIDATOR_VERSION, type BuildRequest, type BuildResponse } from '@/lib/authoring/contract';

/**
 * Build + validate a puzzle candidate through the canonical boundary
 * (Phase 7H.3, checkpoint 7H.3.1). Content roles only. The answer is included in
 * the preview only when the caller may review content AND has recently
 * authenticated (Task 37). No canonical content is written here — this is the
 * pure build/validate step the authoring form calls before Save/Submit.
 *
 * `raw` is the typed engine seed as parsed by the (registry-driven) form; it is
 * validated canonically by the builder + validator, never trusted blindly.
 */
export async function buildCandidateAction(input: {
  engineId: string;
  seed: unknown;
  difficulty: number;
  draftId?: string | null;
  expectedDraftVersion?: number | null;
}): Promise<BuildResponse> {
  const ctx = await requireCapability('manage_content');

  // Answer reveal requires a reviewer role AND recent auth (server-verified time).
  const mayReveal = contextCan(ctx, 'review_content') && (await hasRecentAuth());

  const req: BuildRequest = {
    draftId: input.draftId ?? null,
    expectedDraftVersion: input.expectedDraftVersion ?? null,
    engineId: input.engineId,
    seed: input.seed,
    difficulty: Number(input.difficulty),
    builderVersion: BUILDER_VERSION,
    authoringSchemaVersion: 1,
  };

  const res = buildAndValidateCandidate(req, mayReveal);

  // Audit the build attempt (never the answer; findings + hash only).
  await writeAudit(ctx, {
    action: 'authoring_build',
    targetType: 'draft',
    targetId: input.draftId ?? `new:${input.engineId}`,
    summary: res.ok
      ? {
          engineId: res.engineId,
          contentHash: res.contentHash,
          passed: res.validation.passed,
          blocking: res.validation.blockingFindings.length,
          builderVersion: res.builderVersion,
          validatorVersion: VALIDATOR_VERSION,
          answerRevealed: mayReveal && res.hasAnswer,
        }
      : { engineId: input.engineId, failure: res.code },
  });

  return res;
}
