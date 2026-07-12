import { notFound } from 'next/navigation';

import { requireCapability, getAdminContext, contextCan } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { PackEditor, type Slot } from './PackEditor';

export const dynamic = 'force-dynamic';

/** Pack draft editor: five fixed slots, eligible selectors, validate → review → publish. */
export default async function PackDraftEditor({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCapability('view_packs');
  const { id } = await params;
  const svc = adminClient();

  const draft = (await svc.from('authoring_pack_drafts').select('*').eq('id', id).maybeSingle()).data as Record<string, any> | null;
  if (!draft) notFound();
  const slotRows = (await svc.from('authoring_pack_draft_slots').select('position,category,puzzle_id').eq('pack_draft_id', id)).data as { position: number; category: string; puzzle_id: string | null }[] | null;

  const editable = ['draft', 'validation_failed', 'changes_requested'].includes(draft.status);
  const canManage = contextCan(ctx, 'manage_content');
  // Fetch eligible puzzles per slot category ONLY while the draft is editable + manageable.
  const slots: Slot[] = [];
  for (const s of (slotRows ?? []).sort((a, b) => a.position - b.position)) {
    let eligible: Slot['eligible'] = [];
    if (editable && canManage) {
      const el = (await svc.rpc('admin_pack_eligible_puzzles', { p_category: s.category, p_limit: 25, p_offset: 0 })).data as { rows: Slot['eligible'] } | null;
      eligible = el?.rows ?? [];
    }
    slots.push({ ...s, eligible });
  }

  return (
    <div>
      <p className="faint" style={{ marginBottom: 12 }}><a href="/packs/authoring">← Pack drafts</a></p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Pack draft {id.slice(0, 8)}</h1>
        <span className={`pill ${draft.status === 'approved' || draft.status === 'published' ? 'ok' : draft.status === 'validation_failed' || draft.status === 'cancelled' ? 'danger' : 'warn'}`}>{draft.status}</span>
        {draft.intended_date && <span className="pill" style={{ background: 'var(--surface-raised)', color: 'var(--violet)' }}>{draft.intended_date}</span>}
        {draft.published_pack_id && <span className="pill ok">→ {draft.published_pack_id}</span>}
      </div>

      <PackEditor
        id={id}
        status={draft.status}
        version={draft.draft_version}
        intendedDate={draft.intended_date}
        role={ctx.role}
        slots={slots}
        report={draft.constraint_report ?? {}}
        difficulty={draft.difficulty_summary ?? {}}
        rotation={draft.rotation_summary ?? {}}
        canManage={canManage}
        canReview={contextCan(ctx, 'review_content')}
        canPublish={contextCan(ctx, 'publish_pack')}
      />
    </div>
  );
}
