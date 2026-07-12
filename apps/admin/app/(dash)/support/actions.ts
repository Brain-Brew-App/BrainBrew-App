'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** Mark/unmark a user as an analytics test subject (excluded from business KPIs). */
export async function setTestSubject(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('lookup_user');
  const userId = String(form.get('user_id') ?? '');
  const exclude = form.get('exclude') === 'true';
  const reason = String(form.get('reason') ?? '').trim() || 'support-marked test subject';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: 'Invalid user id.' };

  const svc = adminClient();
  const { error } = await svc.rpc('set_subject_flag', { p_user: userId, p_exclude: exclude, p_reason: reason, p_env: 'production', p_by: ctx.userId });
  if (error) return { error: 'Failed to update.' };
  await writeAudit(ctx, { action: exclude ? 'mark_test_subject' : 'unmark_test_subject', targetType: 'user', targetId: userId, summary: { exclude }, reason });
  revalidatePath('/support');
  return { ok: exclude ? 'Marked as test subject (excluded from KPIs).' : 'Unmarked — now counted in KPIs.' };
}
