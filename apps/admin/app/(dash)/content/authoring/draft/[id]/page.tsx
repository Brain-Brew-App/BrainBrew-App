import { notFound } from 'next/navigation';

import { requireCapability, getAdminContext, contextCan, hasRecentAuth } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { isAuthorableEngine, getFormSchema } from '@/lib/authoring/engines';
import type { PreviewModel } from '@/lib/authoring/engines/types';
import { Preview } from '../../Preview';
import { ReviewActions } from './ReviewActions';

export const dynamic = 'force-dynamic';

/** Review workbench for a single authoring draft. */
export default async function DraftWorkbench({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCapability('view_content');
  const { id } = await params;

  const draft = (await adminClient().from('authoring_drafts').select('*').eq('id', id).maybeSingle()).data as
    | Record<string, any>
    | null;
  if (!draft) notFound();

  const canReview = contextCan(ctx, 'review_content');
  const canManage = contextCan(ctx, 'manage_content');
  // Answer overlay only for a reviewer role with recent auth.
  const mayReveal = canReview && (await hasRecentAuth());

  let preview: PreviewModel | null = null;
  if (isAuthorableEngine(draft.engine_id) && draft.built_payload) {
    try {
      preview = getFormSchema(draft.engine_id).previewAdapter(draft.built_payload, mayReveal ? draft.answer_payload : undefined);
    } catch {
      preview = null;
    }
  }

  const validation = (draft.validation ?? {}) as { passed?: boolean; findings?: string[] };
  const meta = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
      <span className="faint">{k}</span><span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right' }}>{v}</span>
    </div>
  );

  return (
    <div>
      <p className="faint" style={{ marginBottom: 12 }}><a href="/content/authoring/queue">← Review queue</a></p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Draft {draft.proposed_puzzle_id ?? id.slice(0, 8)}</h1>
        <span className="pill">{draft.engine_id}</span>
        <span className={`pill ${draft.status === 'approved' || draft.status === 'promoted' ? 'ok' : draft.status === 'validation_failed' || draft.status === 'rejected' ? 'danger' : 'warn'}`}>{draft.status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,1fr) minmax(320px,1.1fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="kpi-label" style={{ marginBottom: 6 }}>Metadata</div>
            {meta('category', draft.category)}
            {meta('difficulty', draft.difficulty)}
            {meta('draft version', draft.draft_version)}
            {meta('author', draft.author?.slice(0, 8) ?? '—')}
            {meta('reviewer', draft.reviewer?.slice(0, 8) ?? '—')}
            {meta('builder', draft.built_payload?.builder_version ?? '—')}
            {meta('validator', draft.built_payload?.validator_version ?? '—')}
            {meta('content hash', draft.content_hash ? `${String(draft.content_hash).slice(0, 16)}…` : '—')}
            {meta('parent (revision of)', draft.parent_puzzle_id ?? '—')}
          </div>

          <div className="card" style={{ borderColor: validation.passed ? 'var(--ok)' : 'var(--danger)' }}>
            <span className={`pill ${validation.passed ? 'ok' : 'danger'}`}>{validation.passed ? 'Validation passed' : 'Validation failed'}</span>
            {(validation.findings ?? []).length > 0 && (
              <ul style={{ marginTop: 8 }}>{(validation.findings ?? []).map((f, i) => <li key={i} style={{ color: 'var(--danger)' }}>{f}</li>)}</ul>
            )}
            <p className="faint" style={{ marginTop: 8 }}>Similarity analysis is not yet available.</p>
          </div>

          {draft.review_notes && (
            <div className="card"><div className="kpi-label">Reviewer notes</div><p style={{ marginTop: 4 }}>{draft.review_notes}</p></div>
          )}

          <ReviewActions id={id} status={draft.status} role={ctx.role} isAuthor={draft.author === ctx.userId} canReview={canReview} canManage={canManage} />
        </div>

        <Preview
          model={preview}
          prompt={(draft.built_payload?.prompt as string) ?? null}
          explanation={mayReveal ? (draft.explanation as string) ?? null : null}
          answerRevealed={mayReveal}
        />
      </div>
    </div>
  );
}
