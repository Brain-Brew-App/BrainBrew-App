'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCapability, hasRecentAuth } from '@/lib/auth';
import { adminClient, sessionClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** Create a revised version of immutable canonical content (new draft, parent-linked). */
export async function createRevisionAction(_prev: unknown, form: FormData): Promise<{ error?: string }> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  const r = (await adminClient().rpc('admin_create_revision', { p_source_puzzle_id: id, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string; draft_id?: string } | null;
  if (!r?.ok || !r.draft_id) return { error: `Could not create revision (${r?.reason ?? 'error'}).` };
  await writeAudit(ctx, { action: 'create_revision_ui', targetType: 'puzzle', targetId: id, summary: { draft: r.draft_id } });
  redirect(`/content/authoring/draft/${r.draft_id}`);
}

/** Retire a puzzle (excludes from future use; history preserved). Content roles. */
export async function retirePuzzle(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return { error: 'A reason is required.' };
  const r = (await adminClient().rpc('admin_retire_puzzle', { p_puzzle_id: id, p_reason: reason, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string } | null;
  if (!r?.ok) {
    return { error: r?.reason === 'referenced_by_future_pack' ? 'Referenced by a future pack — correct the pack first.' : `Cannot retire (${r?.reason ?? 'error'}).` };
  }
  // The RPC audits inside the transaction; add a UI-side audit too for the actor context.
  await writeAudit(ctx, { action: 'retire_puzzle_ui', targetType: 'puzzle', targetId: id, summary: { via: 'detail' }, reason });
  revalidatePath(`/puzzles/${id}`);
  return { ok: 'Puzzle retired. Existing history is unchanged.' };
}

/** Hard-delete a NEVER-USED draft. Requires reauthentication (recent password sign-in). */
export async function deleteDraft(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('manage_content');
  const id = String(form.get('id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (!reason) return { error: 'A reason is required.' };
  if (confirm !== 'DELETE') return { error: 'Type DELETE to confirm.' };

  // Reauthenticate for this destructive action.
  const supa = await sessionClient();
  if (ctx.email) {
    const { error } = await supa.auth.signInWithPassword({ email: ctx.email, password });
    if (error) return { error: 'Reauthentication failed.' };
  } else if (!(await hasRecentAuth())) {
    return { error: 'Please sign in again before deleting.' };
  }

  const r = (await adminClient().rpc('admin_delete_unused_draft', { p_puzzle_id: id, p_reason: reason, p_by: ctx.userId, p_role: ctx.role })).data as { ok?: boolean; reason?: string } | null;
  if (!r?.ok) return { error: `Cannot delete (${r?.reason ?? 'error'}). Only a never-used draft can be deleted.` };
  return { ok: 'deleted' };
}
