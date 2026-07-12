'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCapability, contextCan, hasRecentAuth } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

type R = { error?: string; ok?: string };

/** Create a blank future-pack draft and jump to its editor. */
export async function createPackDraftAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('manage_content');
  const date = String(form.get('date') ?? '').trim() || null;
  const r = (await adminClient().rpc('admin_create_pack_draft', { p_intended_date: date, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; id?: string } | null;
  if (!r?.ok || !r.id) return { error: 'Could not create the draft.' };
  redirect(`/packs/authoring/${r.id}`);
}

/** Set one slot to a puzzle (category-locked, approved-only — enforced by the RPC). */
export async function setSlotAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  const position = Number(form.get('position') ?? 0);
  const puzzle = String(form.get('puzzle') ?? '').trim() || null;
  const version = form.get('version') ? Number(form.get('version')) : null;
  const r = (await adminClient().rpc('admin_set_pack_slot', { p_draft_id: id, p_position: position, p_puzzle_id: puzzle, p_expected_version: version, p_by: ctx.userId })).data as { ok?: boolean; reason?: string } | null;
  if (!r?.ok) {
    const m: Record<string, string> = { already_scheduled: 'That puzzle is already in a live pack.', not_approved: 'Only approved puzzles can be scheduled.', wrong_category: 'Wrong category for this slot.', stale_version: 'The draft changed — reload and retry.', not_editable: 'This draft is not editable.' };
    return { error: m[r?.reason ?? ''] ?? `Could not set slot (${r?.reason ?? 'error'}).` };
  }
  revalidatePath(`/packs/authoring/${id}`);
  return { ok: 'Slot updated.' };
}

/** Fill empty slots with eligible puzzles (basic suggester; see Known limitations). */
export async function suggestPackAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  const svc = adminClient();
  const draft = (await svc.from('authoring_pack_drafts').select('draft_version').eq('id', id).maybeSingle()).data as { draft_version?: number } | null;
  const slots = (await svc.from('authoring_pack_draft_slots').select('position,category,puzzle_id').eq('pack_draft_id', id)).data as { position: number; category: string; puzzle_id: string | null }[] | null;
  let version = draft?.draft_version ?? null;
  let filled = 0;
  for (const s of (slots ?? []).filter((x) => !x.puzzle_id).sort((a, b) => a.position - b.position)) {
    const el = (await svc.rpc('admin_pack_eligible_puzzles', { p_category: s.category, p_limit: 25, p_offset: 0 })).data as { rows: { puzzle_id: string }[] } | null;
    // Skip puzzles already staged in another active draft (soft cross-draft conflict avoidance).
    const staged = new Set(((await svc.from('authoring_pack_draft_slots').select('puzzle_id').not('puzzle_id', 'is', null)).data as { puzzle_id: string }[] | null ?? []).map((x) => x.puzzle_id));
    const pick = (el?.rows ?? []).find((p) => !staged.has(p.puzzle_id)) ?? (el?.rows ?? [])[0];
    if (!pick) continue;
    const r = (await svc.rpc('admin_set_pack_slot', { p_draft_id: id, p_position: s.position, p_puzzle_id: pick.puzzle_id, p_expected_version: version, p_by: ctx.userId })).data as { ok?: boolean; version?: number } | null;
    if (r?.ok) { filled++; version = r.version ?? version; }
  }
  revalidatePath(`/packs/authoring/${id}`);
  return filled ? { ok: `Suggested ${filled} slot(s) from the eligible reserve/approved pool.` } : { error: 'No eligible puzzles to suggest — add reserve content first.' };
}

async function simple(id: string, cap: string, fn: (svc: ReturnType<typeof adminClient>, ctx: Awaited<ReturnType<typeof requireCapability>>) => Promise<R>): Promise<R> {
  const ctx = await requireCapability(cap);
  const out = await fn(adminClient(), ctx);
  revalidatePath(`/packs/authoring/${id}`);
  return out;
}

export async function validatePackAction(_prev: unknown, form: FormData): Promise<R> {
  const id = String(form.get('id') ?? '');
  return simple(id, 'manage_content', async (svc, ctx) => {
    const r = (await svc.rpc('admin_validate_pack_draft', { p_draft_id: id, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; report?: { passed: boolean; blocking: string[]; warnings: string[] } } | null;
    if (!r?.ok) return { error: 'Validation could not run.' };
    return r.report?.passed ? { ok: `Passed. ${r.report.warnings.length} warning(s).` } : { error: `Blocked: ${(r.report?.blocking ?? []).join('; ')}` };
  });
}

export async function submitPackAction(_prev: unknown, form: FormData): Promise<R> {
  const id = String(form.get('id') ?? '');
  const notes = String(form.get('notes') ?? '').trim();
  if (!notes) return { error: 'Author notes are required.' };
  return simple(id, 'manage_content', async (svc, ctx) => {
    const r = (await svc.rpc('admin_submit_pack_review', { p_draft_id: id, p_notes: notes, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string } | null;
    return r?.ok ? { ok: 'Submitted for review.' } : { error: r?.reason === 'validation_failed' ? 'Fix blocking constraints first.' : `Submit failed (${r?.reason ?? 'error'}).` };
  });
}

export async function decidePackAction(_prev: unknown, form: FormData): Promise<R> {
  const id = String(form.get('id') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const emergency = form.get('emergency') === 'on';
  if (!reason) return { error: 'A reason is required.' };
  return simple(id, 'review_content', async (svc, ctx) => {
    if (decision === 'approve' && emergency && ctx.role !== 'founder') return { error: 'Emergency override is Founder-only.' };
    const r = (await svc.rpc('admin_decide_pack_review', { p_draft_id: id, p_decision: decision, p_by: ctx.userId, p_role: ctx.role, p_reason: reason, p_emergency: emergency })).data as { ok?: boolean; reason?: string } | null;
    return r?.ok ? { ok: decision === 'approve' ? 'Pack approved.' : decision === 'reject' ? 'Pack rejected.' : 'Changes requested.' } : { error: r?.reason === 'self_approval_blocked' ? 'A different reviewer must approve.' : `Decision failed (${r?.reason ?? 'error'}).` };
  });
}

/** Publish an approved pack to a future date — recent auth + typed confirm + idempotent. */
export async function publishPackAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('publish_pack');
  const id = String(form.get('id') ?? '');
  const date = String(form.get('date') ?? '').trim();
  const reason = String(form.get('reason') ?? '').trim();
  const confirm = String(form.get('confirm') ?? '');
  const version = form.get('version') ? Number(form.get('version')) : null;
  if (confirm !== 'PUBLISH') return { error: 'Type PUBLISH to confirm.' };
  if (!reason) return { error: 'A reason is required.' };
  if (!date) return { error: 'A future UTC date is required.' };
  if (!(await hasRecentAuth())) return { error: 'Please sign in again before publishing.' };
  // Deterministic idempotency key so a double-submit publishes once.
  const key = `${id}:${date}`;
  const r = (await adminClient().rpc('admin_publish_pack', { p_draft_id: id, p_intended_date: date, p_expected_version: version, p_by: ctx.userId, p_role: ctx.role, p_idempotency_key: key })).data as { ok?: boolean; reason?: string; pack_id?: string; idempotent?: boolean } | null;
  if (!r?.ok) {
    const m: Record<string, string> = { date_taken: 'That UTC date is already taken.', date_not_future: 'The date must be in the future.', not_approved: 'The pack must be approved first.', stale_version: 'The draft changed — reload and retry.', validation_failed: 'A slot became ineligible — revalidate.' };
    return { error: m[r?.reason ?? ''] ?? `Publish failed (${r?.reason ?? 'error'}).` };
  }
  await writeAudit(ctx, { action: 'pack_publish_ui', targetType: 'daily_pack', targetId: r.pack_id ?? id, summary: { date, idempotent: !!r.idempotent }, reason });
  revalidatePath(`/packs/authoring/${id}`);
  return { ok: `Published as ${r.pack_id} for ${date}${r.idempotent ? ' (idempotent no-op)' : ''}. Live packs are immutable.` };
}

export async function cancelPackAction(_prev: unknown, form: FormData): Promise<R> {
  const id = String(form.get('id') ?? '');
  const reason = String(form.get('reason') ?? '').trim() || 'cancelled';
  return simple(id, 'manage_content', async (svc, ctx) => {
    const r = (await svc.rpc('admin_cancel_pack_draft', { p_draft_id: id, p_reason: reason, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string } | null;
    return r?.ok ? { ok: 'Draft cancelled (history preserved).' } : { error: r?.reason === 'already_published' ? 'A published pack cannot be cancelled — it is live/immutable.' : `Cancel failed (${r?.reason ?? 'error'}).` };
  });
}
