import { notFound } from 'next/navigation';

import { requireCapability, getAdminContext, contextCan } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { VoidControls } from './VoidControls';

export const dynamic = 'force-dynamic';

/** Void review screen: impact + incident linkage + typed confirmation. */
export default async function VoidReview({ params }: { params: Promise<{ slotId: string }> }) {
  const ctx = await requireCapability('view_incidents');
  const { slotId } = await params;
  const svc = adminClient();

  const slot = (await svc.from('daily_pack_slots').select('id,pack_id,position,category,puzzle_id,void_status,max_score').eq('id', slotId).maybeSingle()).data as
    | { id: string; pack_id: string; position: number; category: string; puzzle_id: string; void_status: boolean; max_score: number } | null;
  if (!slot) notFound();
  const pack = (await svc.from('daily_packs').select('pack_date,status').eq('pack_id', slot.pack_id).maybeSingle()).data as { pack_date: string | null; status: string } | null;

  // Impact: affected completed ranked attempts + denominators.
  const affected = (await svc.from('attempts').select('id', { count: 'exact', head: true }).eq('pack_id', slot.pack_id).eq('is_ranked', true).eq('status', 'completed')).count ?? 0;
  const allSlots = (await svc.from('daily_pack_slots').select('max_score,void_status').eq('pack_id', slot.pack_id)).data as { max_score: number; void_status: boolean }[] | null;
  const origDenom = (allSlots ?? []).reduce((n, s) => n + s.max_score, 0);
  const newDenom = origDenom - slot.max_score;
  const openIncidents = (await svc.from('admin_incidents').select('id,title').eq('status', 'open').order('id', { ascending: false }).limit(25)).data as { id: number; title: string }[] | null;

  const row = (k: string, v: React.ReactNode) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span className="faint">{k}</span><span style={{ fontFamily: 'monospace' }}>{v}</span></div>;

  return (
    <div>
      <p className="faint" style={{ marginBottom: 12 }}><a href="/incidents/void">← Void entry</a></p>
      <h1>Void review — {slot.puzzle_id}</h1>
      {slot.void_status && <div className="banner danger">This slot is already voided.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1fr) minmax(320px,1.2fr)', gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="kpi-label" style={{ marginBottom: 6 }}>Impact</div>
          {row('UTC date', pack?.pack_date ?? '—')}
          {row('pack', slot.pack_id.slice(0, 14))}
          {row('position / category', `${slot.position} · ${slot.category}`)}
          {row('pack status', pack?.status ?? '—')}
          {row('affected ranked attempts', affected)}
          {row('current denominator', origDenom)}
          {row('new denominator', newDenom)}
          {row('replacement', 'none (no substitution)')}
          <p className="faint" style={{ marginTop: 8 }}>Scores renormalize to {newDenom}. Progress/streak day stays valid while the pack keeps active content. Share cards already exported stay frozen; the app score is authoritative.</p>
        </div>

        <VoidControls slotId={slotId} incidents={openIncidents ?? []} isFounder={ctx.role === 'founder'} />
      </div>
    </div>
  );
}
