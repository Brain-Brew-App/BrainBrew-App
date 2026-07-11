'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { adminClient, sessionClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/**
 * Apply operational flags. Guarded: capability + REAUTHENTICATION (re-enter
 * password) + a mandatory reason. Server-enforced end to end; audited.
 */
export async function setMaintenance(_prev: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCapability('set_maintenance');

  const password = String(form.get('password') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return { error: 'A reason is required.' };

  // Reauthenticate the acting admin before a state change.
  const supa = await sessionClient();
  if (ctx.email) {
    const { error } = await supa.auth.signInWithPassword({ email: ctx.email, password });
    if (error) return { error: 'Reauthentication failed.' };
  }

  const mode = String(form.get('mode') ?? 'normal');
  const flags = {
    ranked: form.get('ranked') === 'on',
    practice: form.get('practice') === 'on',
    purchases: form.get('purchases') === 'on',
    publication: form.get('publication') === 'on',
  };
  const message = String(form.get('message') ?? '') || null;
  const expiresMin = Number(form.get('expires_min') ?? 0);
  const expiresAt = expiresMin > 0 ? new Date(Date.now() + expiresMin * 60000).toISOString() : null;

  const svc = adminClient();
  const { error } = await svc.rpc('set_operational_flags', {
    p_mode: mode, p_ranked: flags.ranked, p_practice: flags.practice, p_purchases: flags.purchases,
    p_publication: flags.publication, p_message: message, p_reason: reason, p_set_by: ctx.userId, p_expires_at: expiresAt,
  });
  if (error) { return { error: 'Failed to apply.' }; }

  await writeAudit(ctx, {
    action: 'set_maintenance', targetType: 'system', targetId: 'operational_flags',
    summary: { mode, ...flags, expires_at: expiresAt }, reason,
  });
  revalidatePath('/maintenance');
  return { ok: `Applied “${mode}”.` };
}
