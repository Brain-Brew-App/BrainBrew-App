'use server';

import { randomUUID, createHash } from 'node:crypto';

import { requireCapability, contextCan, hasRecentAuth } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { buildAndValidateCandidate } from '@/lib/authoring/canonical';
import { BUILDER_VERSION, VALIDATOR_VERSION, type BuildResponse } from '@/lib/authoring/contract';
import { getFormSchema, isAuthorableEngine } from '@/lib/authoring/engines';
import type { ClientCheck, PreviewModel } from '@/lib/authoring/engines';

export interface AuthorResult {
  clientCheck: ClientCheck;
  build: BuildResponse | null;
  preview: PreviewModel | null;
  /** Whether the caller was authorized to see the answer overlay. */
  answerRevealed: boolean;
}

/**
 * The one authoring loop the form calls: raw form → (server) serialize →
 * canonical build+validate → safe preview. All schema logic + the canonical
 * bundle stay server-side; the client only ever receives a sanitized PreviewModel
 * (answer overlay included ONLY for reviewer roles with recent auth). No canonical
 * content is written here.
 */
export async function authorFromFormAction(engineId: string, form: Record<string, unknown>, revealAnswer = false): Promise<AuthorResult> {
  const ctx = await requireCapability('manage_content');
  if (!isAuthorableEngine(engineId)) {
    return { clientCheck: { ok: false, fieldErrors: {}, formErrors: ['This engine has no authoring form yet.'] }, build: null, preview: null, answerRevealed: false };
  }
  const schema = getFormSchema(engineId);

  const clientCheck = schema.clientValidate(form as never);
  if (!clientCheck.ok) return { clientCheck, build: null, preview: null, answerRevealed: false };

  // Answer overlay requires a reviewer role AND recent auth AND an explicit request.
  const mayReveal = revealAnswer && contextCan(ctx, 'review_content') && (await hasRecentAuth());

  const seed = schema.serializeFormToSeed(form as never, `auth-${engineId}-${randomUUID().slice(0, 8)}`);
  const build = buildAndValidateCandidate(
    { draftId: null, expectedDraftVersion: null, engineId, seed, difficulty: Number((form as { difficulty?: number }).difficulty ?? 0), builderVersion: BUILDER_VERSION, authoringSchemaVersion: 1 },
    mayReveal,
  );

  let preview: PreviewModel | null = null;
  if (build.ok) {
    try {
      preview = schema.previewAdapter(build.preview.publicPayload, mayReveal ? build.preview.answer : undefined);
    } catch {
      preview = null;
    }
  }

  await writeAudit(ctx, {
    action: 'authoring_build',
    targetType: 'draft',
    targetId: `new:${engineId}`,
    summary: build.ok
      ? { engineId, contentHash: build.contentHash, passed: build.validation.passed, blocking: build.validation.blockingFindings.length, builderVersion: build.builderVersion, validatorVersion: VALIDATOR_VERSION, answerRevealed: mayReveal && build.hasAnswer }
      : { engineId, failure: build.code },
  });

  return { clientCheck, build, preview, answerRevealed: mayReveal };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SaveResult { ok: boolean; draftId?: string; contentHash?: string; error?: string }

/**
 * Persist a built + passing candidate as an authoring draft, reusing the tested
 * 7H.2 `admin_save_draft` RPC (service-role, RLS-private). Re-builds server-side
 * (never trusts a client-sent hash/answer) and refuses to save a failing build.
 */
export async function saveDraftAction(engineId: string, form: Record<string, unknown>): Promise<SaveResult> {
  const ctx = await requireCapability('manage_content');
  if (!isAuthorableEngine(engineId)) return { ok: false, error: 'This engine has no authoring form yet.' };
  const schema = getFormSchema(engineId);

  const clientCheck = schema.clientValidate(form as never);
  if (!clientCheck.ok) return { ok: false, error: 'Fix the highlighted fields first.' };

  const proposedId = `auth-${engineId.toLowerCase()}-${randomUUID().slice(0, 12)}`;
  const seed = schema.serializeFormToSeed(form as never, proposedId);
  // Build with the answer so the draft stores the canonical answer payload (server-side only).
  const build = buildAndValidateCandidate({ draftId: null, expectedDraftVersion: null, engineId, seed, difficulty: Number((form as { difficulty?: number }).difficulty ?? 0) }, true);
  if (!build.ok) return { ok: false, error: `Build failed (${build.code}).` };
  if (!build.validation.passed) return { ok: false, error: 'Validation failed — resolve the findings before saving.' };

  const payload = {
    engine_id: engineId,
    category: schema.category,
    difficulty: Number((form as { difficulty?: number }).difficulty ?? 0),
    seed,
    proposed_puzzle_id: proposedId,
    built_payload: { ...build.preview.publicPayload, builder_version: build.builderVersion, validator_version: VALIDATOR_VERSION },
    answer_payload: build.preview.answer ?? {},
    explanation: (build.preview.explanation ?? '') as string,
    content_hash: build.contentHash,
    validation: { passed: build.validation.passed, findings: build.validation.blockingFindings },
  };

  try {
    const r = (await adminClient().rpc('admin_save_draft', { p_id: null, p_fields: payload, p_by: ctx.userId })).data as { ok?: boolean; id?: string } | null;
    if (!r?.ok || !r.id) return { ok: false, error: 'Save was rejected by the server.' };
    await writeAudit(ctx, { action: 'authoring_save_ui', targetType: 'draft', targetId: r.id, summary: { engineId, contentHash: build.contentHash, seedHash: sha256(build.seedHash) } });
    return { ok: true, draftId: r.id, contentHash: build.contentHash };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : 'Save failed.' };
  }
}

export interface SubmitResult { ok: boolean; error?: string }

/**
 * Submit a saved draft for review, reusing the tested 7H.2
 * `admin_submit_draft_review` RPC (which enforces status='built', i.e. a passing
 * validation). Requires author notes and a matching content hash (guards against
 * submitting after an unsaved edit / stale build). Audited.
 */
export async function submitDraftForReviewAction(draftId: string, expectedHash: string, notes: string): Promise<SubmitResult> {
  const ctx = await requireCapability('manage_content');
  const trimmed = notes.trim();
  if (trimmed.length < 3) return { ok: false, error: 'Author notes are required.' };

  // Stale-guard: the stored draft must still match the hash the author reviewed.
  const draft = (await adminClient().from('authoring_drafts').select('content_hash,status').eq('id', draftId).maybeSingle()).data as { content_hash?: string; status?: string } | null;
  if (!draft) return { ok: false, error: 'Draft not found.' };
  if (draft.content_hash !== expectedHash) return { ok: false, error: 'The draft changed since your last build — rebuild and save before submitting.' };
  if (draft.status !== 'built') return { ok: false, error: `Draft is ${draft.status ?? 'unknown'} — only a built, passing draft can be submitted.` };

  try {
    const r = (await adminClient().rpc('admin_submit_draft_review', { p_id: draftId, p_notes: trimmed, p_by: ctx.userId })).data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) return { ok: false, error: `Submit rejected (${r?.reason ?? 'error'}).` };
    await writeAudit(ctx, { action: 'authoring_submit_ui', targetType: 'draft', targetId: draftId, summary: { contentHash: expectedHash }, reason: trimmed });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : 'Submit failed.' };
  }
}
