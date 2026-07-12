import { requireCapability, contextCan } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { Freshness, num, pct, StateNote } from '@/components/ui';
import { RetireForm, DeleteDraftForm } from './form';

export const dynamic = 'force-dynamic';

// Only these roles may ever see the private answer key (server-enforced + audited).
const ANSWER_CAP = 'manage_content'; // founder + content_admin

export default async function PuzzleDetail(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> },
) {
  const ctx = await requireCapability('view_puzzles');
  const { id } = await params;
  const sp = await searchParams;
  const svc = adminClient();
  const detail = (await svc.rpc('admin_puzzle_detail', { p_puzzle_id: id })).data as Record<string, unknown> | null;
  if (!detail) return <><h1>Puzzle {id}</h1><StateNote kind="empty">No such puzzle.</StateNote></>;

  const mayReveal = contextCan(ctx, ANSWER_CAP);
  let answer: Record<string, unknown> | null = null;
  if (mayReveal && sp.reveal === '1') {
    answer = (await svc.rpc('admin_puzzle_answer', { p_puzzle_id: id })).data as Record<string, unknown> | null;
    // Auditing a private-answer view is a deliberate, narrowly-approved action.
    await writeAudit(ctx, { action: 'view_answer_key', targetType: 'puzzle', targetId: id, summary: { puzzle_id: id }, reason: 'content review' });
  }

  const stats = (detail.stats ?? {}) as Record<string, unknown>;
  const validation = (detail.validation ?? []) as Record<string, unknown>[];
  const scheduled = (detail.scheduled_in ?? []) as Record<string, unknown>[];

  return (
    <>
      <p className="faint"><a href="/puzzles">← Puzzles</a></p>
      <h1>{String(detail.puzzle_id)}</h1>
      <Freshness source="puzzles + validation + exposure" />
      <div className="grid cards">
        <div className="card"><div className="kpi-label">Engine / Category</div><div className="kpi-value" style={{ fontSize: 18 }}>{String(detail.engine_id)}</div><div className="faint">{String(detail.category)} · difficulty {num(detail.difficulty)}</div></div>
        <div className="card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ fontSize: 18 }}>{String(detail.status)}</div><div className="faint">{detail.is_reserve ? 'reserve' : 'scheduled'} · hash {String(detail.content_hash)}</div></div>
        <div className="card"><div className="kpi-label">Ranked plays</div><div className="kpi-value">{num(stats.plays)}</div><div className="faint">avg {num(stats.avg_points)}/20 · correct {pct(stats.correct_rate)} · {num(stats.avg_solve_ms)}ms</div></div>
      </div>

      <h2 style={{ marginTop: 24 }}>Prompt</h2>
      <div className="card"><p style={{ margin: 0 }}>{String(detail.prompt)}</p></div>

      <h2 style={{ marginTop: 24 }}>Validation</h2>
      <div className="card">
        {validation.length === 0 ? <StateNote kind="empty">No validation records.</StateNote> :
          validation.map((v, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span className={`pill ${v.passed ? 'ok' : 'danger'}`}>{v.passed ? 'passed' : 'failed'}</span>
              <span className="faint"> {String(v.validator_version)} · {new Date(String(v.validated_at)).toISOString().slice(0, 10)}</span>
              {Array.isArray(v.findings) && v.findings.length > 0 && <pre style={{ margin: '4px 0', color: 'var(--text-muted)', fontSize: 12 }}>{JSON.stringify(v.findings)}</pre>}
            </div>
          ))}
      </div>

      <h2 style={{ marginTop: 24 }}>Scheduled usage</h2>
      <div className="card">{scheduled.length === 0 ? <StateNote kind="empty">Reserve — never scheduled into a daily pack.</StateNote> : scheduled.map((s, i) => <span key={i} className="pill" style={{ marginRight: 6, border: '1px solid var(--border)' }}>{String(s.pack_date)} · pos {num(s.position)}</span>)}</div>

      <h2 style={{ marginTop: 24 }}>Answer key</h2>
      <div className="card" style={{ borderColor: 'var(--gold)' }}>
        {!mayReveal ? <StateNote kind="unavailable">Answer keys are restricted to Founder and Content Admin.</StateNote>
          : answer ? (
            <>
              <p className="pill warn" style={{ display: 'inline-block' }}>This view was audited.</p>
              <pre style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 12 }}>{JSON.stringify(answer.answer_payload, null, 2)}</pre>
              <p className="faint" style={{ marginTop: 8 }}>{String(answer.explanation)}</p>
            </>
          ) : <a className="pill danger" style={{ textDecoration: 'none' }} href={`?reveal=1`}>Reveal answer key (audited)</a>}
      </div>

      {contextCan(ctx, 'manage_content') && (
        <>
          <h2 style={{ marginTop: 24 }}>Operations</h2>
          <div className="card" style={{ display: 'grid', gap: 16 }}>
            {detail.status !== 'retired'
              ? <RetireForm id={String(detail.puzzle_id)} />
              : <StateNote kind="unavailable">Already retired.</StateNote>}
            {detail.status === 'draft' && !((detail.scheduled_in as unknown[])?.length) && <DeleteDraftForm id={String(detail.puzzle_id)} />}
          </div>
          <p className="faint" style={{ marginTop: 8 }}>
            Immutable-content edits (approved/scheduled/used puzzles) create a new version rather than mutating history — that authoring workflow is the next content-ops milestone. Live pack membership and answers are never changed here.
          </p>
        </>
      )}
    </>
  );
}
