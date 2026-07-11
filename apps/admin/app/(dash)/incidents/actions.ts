'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export async function openIncident(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('open_incident');
  const title = String(form.get('title') ?? '').trim();
  const severity = String(form.get('severity') ?? 'sev3');
  const description = String(form.get('description') ?? '').trim() || null;
  if (!title) return { error: 'Title is required.' };
  if (!['sev1', 'sev2', 'sev3', 'info'].includes(severity)) return { error: 'Bad severity.' };

  const svc = adminClient();
  const { data, error } = await svc.from('admin_incidents')
    .insert({ title, severity, description, created_by: ctx.userId, owner_admin: ctx.userId })
    .select('id').single();
  if (error) return { error: 'Failed to open incident.' };

  await writeAudit(ctx, { action: 'open_incident', targetType: 'incident', targetId: String(data.id), summary: { severity, title }, reason: 'incident opened' });
  revalidatePath('/incidents');
  return { ok: `Incident #${data.id} opened.` };
}

export async function resolveIncident(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('resolve_incident');
  const id = Number(form.get('id'));
  const note = String(form.get('note') ?? '').trim() || 'resolved';
  if (!id) return { error: 'Missing incident.' };
  const svc = adminClient();
  const { error } = await svc.from('admin_incidents').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: 'Failed to resolve.' };
  await svc.from('admin_incident_events').insert({ incident_id: id, admin_user_id: ctx.userId, note });
  await writeAudit(ctx, { action: 'resolve_incident', targetType: 'incident', targetId: String(id), summary: { note }, reason: 'incident resolved' });
  revalidatePath('/incidents');
  return { ok: `Incident #${id} resolved.` };
}
