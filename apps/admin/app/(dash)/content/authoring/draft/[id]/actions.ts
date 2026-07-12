'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability, contextCan, hasRecentAuth } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

type R = { error?: string; ok?: string };

/** Reviewer decision: request_changes | reject | approve (+ Founder emergency). */
export async function decideReviewAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('review_content');
  const id = String(form.get('id') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const emergency = form.get('emergency') === 'on';
  if (!['approve', 'reject', 'request_changes'].includes(decision)) return { error: 'Invalid decision.' };
  if (!reason) return { error: 'A reason is required.' };

  // Founder emergency self-approval needs recent auth; approval is two-person otherwise.
  if (decision === 'approve' && emergency) {
    if (ctx.role !== 'founder') return { error: 'Emergency override is Founder-only.' };
    if (!(await hasRecentAuth())) return { error: 'Please sign in again before an emergency approval.' };
  }
  const d = (await adminClient().rpc('admin_decide_draft_review', { p_id: id, p_decision: decision, p_by: ctx.userId, p_role: ctx.role, p_reason: reason, p_emergency: emergency })).data as { ok?: boolean; reason?: string } | null;
  if (!d?.ok) {
    const msg: Record<string, string> = {
      self_approval_blocked: 'You cannot approve your own draft — a different reviewer must.',
      validation_not_passed: 'Validation must pass before approval.',
      not_in_review: 'This draft is not awaiting review.',
    };
    return { error: msg[d?.reason ?? ''] ?? `Decision failed (${d?.reason ?? 'error'}).` };
  }
  revalidatePath(`/content/authoring/draft/${id}`);
  return { ok: decision === 'approve' ? 'Approved.' : decision === 'reject' ? 'Rejected (kept in history).' : 'Changes requested — returned to the author.' };
}

/** Promote an approved draft into canonical reserve content (atomic, idempotent). */
export async function promoteAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  if (!(await hasRecentAuth())) return { error: 'Please sign in again before promoting to canonical content.' };
  const r = (await adminClient().rpc('admin_promote_draft_to_reserve', { p_id: id, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string; puzzle_id?: string } | null;
  if (!r?.ok) {
    const msg: Record<string, string> = { not_approved: 'Only an approved draft can be promoted.', id_exists: 'A puzzle with this stable ID already exists.', validation_not_passed: 'Validation must pass.' };
    return { error: msg[r?.reason ?? ''] ?? `Promotion failed (${r?.reason ?? 'error'}).` };
  }
  await writeAudit(ctx, { action: 'promote_ui', targetType: 'puzzle', targetId: r.puzzle_id ?? id, summary: { draft: id } });
  revalidatePath(`/content/authoring/draft/${id}`);
  return { ok: `Promoted to reserve as ${r.puzzle_id}. Canonical content is now immutable; further changes need a revision.` };
}

/** Assign / reassign a reviewer (lightweight queue indicator, no notifications). */
export async function assignReviewerAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('review_content');
  const id = String(form.get('id') ?? '');
  const reviewer = String(form.get('reviewer') ?? '').trim() || null;
  const { error } = await adminClient().from('authoring_drafts').update({ reviewer }).eq('id', id);
  if (error) return { error: 'Could not update the reviewer.' };
  await writeAudit(ctx, { action: 'assign_reviewer_ui', targetType: 'draft', targetId: id, summary: { reviewer } });
  revalidatePath(`/content/authoring/draft/${id}`);
  return { ok: reviewer ? 'Reviewer assigned.' : 'Reviewer cleared.' };
}
