'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireCapability, hasRecentAuth } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

type R = { error?: string; ok?: string };

/**
 * Start a content void — Founder-only, recent-auth, typed "VOID SLOT". The RPC is
 * atomic + idempotent; recent auth is verified here (server-side time, not client).
 */
export async function startVoidAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('void_slot');
  if (ctx.role !== 'founder') return { error: 'Content void is Founder-only.' };
  const slotId = String(form.get('slot_id') ?? '');
  const incidentId = Number(form.get('incident_id') ?? 0);
  const reason = String(form.get('reason') ?? '').trim();
  const confirm = String(form.get('confirm') ?? '');
  if (!incidentId) return { error: 'Select or create an open incident first.' };
  if (confirm !== 'VOID SLOT') return { error: 'Type VOID SLOT exactly to confirm.' };
  if (!reason) return { error: 'A reason is required.' };
  if (!(await hasRecentAuth())) return { error: 'Please sign in again before voiding a live slot.' };

  const key = `void:${slotId}:${incidentId}`;
  const r = (await adminClient().rpc('admin_start_content_void', { p_incident_id: incidentId, p_slot_id: slotId, p_reason: reason, p_idempotency_key: key, p_confirmation: confirm, p_by: ctx.userId, p_role: ctx.role, p_batch: 200 })).data as { ok?: boolean; reason?: string; operation_id?: string } | null;
  if (!r?.ok) {
    const m: Record<string, string> = { already_voided: 'This slot is already voided.', pack_not_live: 'Only a live/historical pack slot can be voided.', incident_resolved: 'The incident is resolved — reopen or create a new one.', founder_only: 'Founder-only.', bad_confirmation: 'Confirmation phrase did not match.' };
    return { error: m[r?.reason ?? ''] ?? `Void failed (${r?.reason ?? 'error'}).` };
  }
  await writeAudit(ctx, { action: 'content_void_ui', targetType: 'daily_pack_slot', targetId: slotId, summary: { incident: incidentId, operation: r.operation_id }, reason });
  redirect(`/incidents/void/op/${r.operation_id}`);
}

/** Continue / retry a void operation (Founder-only, recent auth, idempotent). */
export async function retryVoidAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('void_slot');
  if (ctx.role !== 'founder') return { error: 'Founder-only.' };
  const opId = String(form.get('op_id') ?? '');
  const mode = String(form.get('mode') ?? 'continue');
  if (!(await hasRecentAuth())) return { error: 'Please sign in again before retrying.' };
  const fn = mode === 'retry' ? 'admin_retry_content_void' : 'admin_continue_content_void';
  const r = (await adminClient().rpc(fn, { p_op_id: opId, p_by: ctx.userId, p_role: ctx.role, p_batch: 200 })).data as { ok?: boolean; status?: string; processed?: number } | null;
  if (!r?.ok) return { error: 'Retry could not run.' };
  revalidatePath(`/incidents/void/op/${opId}`);
  return { ok: `Operation ${r.status} — ${r.processed ?? 0} processed.` };
}

/** Open a new incident for a broken slot (Founder), returning to the review screen. */
export async function createIncidentAction(_prev: unknown, form: FormData): Promise<R> {
  const ctx = await requireCapability('open_incident');
  const slotId = String(form.get('slot_id') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const severity = String(form.get('severity') ?? 'sev2');
  const description = String(form.get('description') ?? '').trim();
  if (!title) return { error: 'A title is required.' };
  const r = (await adminClient().from('admin_incidents').insert({ severity, title, description, affected_systems: ['content'], status: 'open', owner_admin: ctx.userId, created_by: ctx.userId }).select('id').single());
  if (r.error) return { error: 'Could not open the incident.' };
  await writeAudit(ctx, { action: 'incident_open_ui', targetType: 'admin_incident', targetId: String(r.data.id), summary: { slot: slotId, severity } });
  revalidatePath(`/incidents/void/${slotId}`);
  return { ok: `Incident #${r.data.id} opened.` };
}
