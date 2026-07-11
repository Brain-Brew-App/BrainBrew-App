'use server';

import { revalidatePath } from 'next/cache';

import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** Rebuild the daily rollups for the last N days. Founder/Engineering; audited. */
export async function refreshRollups(): Promise<void> {
  const ctx = await requireCapability('run_health_check'); // ops capability
  const svc = adminClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data } = await svc.rpc('rebuild_analytics_rollups', { p_from: from, p_to: to });
  await writeAudit(ctx, { action: 'refresh_rollups', targetType: 'system', targetId: 'analytics_rollups', summary: { from, to, days: data }, reason: 'manual rollup refresh' });
  revalidatePath('/gameplay');
}
