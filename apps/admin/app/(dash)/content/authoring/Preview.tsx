'use client';

/**
 * Safe authoring preview (Phase 7H.3.2A, Task 10).
 *
 * Renders a sanitized PreviewModel at 320dp and 390dp. It creates NO attempt,
 * emits NO analytics, calls NO gameplay Edge Function, holds NO token, and
 * imports NO native Expo UI. The answer overlay (highlight / correct flag) is
 * present in the model ONLY when the server authorized the reveal — this
 * component cannot fetch it.
 */

import { useState } from 'react';
import type { PreviewModel } from '@/lib/authoring/engines/types';

const cell = (filled: boolean) => ({
  width: 18, height: 18, borderRadius: 3,
  background: filled ? 'var(--violet)' : 'transparent',
  border: `1px solid ${filled ? 'var(--violet)' : 'var(--border)'}`,
}) as const;

function ShapeGrid({ rows }: { rows: string[] }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 2 }}>
          {[...r].map((ch, j) => <div key={j} style={cell(ch === '#')} />)}
        </div>
      ))}
    </div>
  );
}

function ModelBody({ model }: { model: PreviewModel }) {
  if (model.kind === 'tile-grid') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${model.columns}, 1fr)`, gap: 6 }}>
        {model.tiles.map((t, i) => (
          <div key={i} style={{
            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, borderRadius: 8,
            background: t.highlight ? 'rgba(94,231,195,0.18)' : 'var(--surface-raised)',
            border: `1px solid ${t.highlight ? 'var(--mint)' : 'var(--border)'}`,
          }}>{t.glyph}</div>
        ))}
      </div>
    );
  }
  if (model.kind === 'shape-options') {
    return (
      <div>
        <div className="kpi-label">Target</div>
        <div style={{ margin: '6px 0 12px' }}><ShapeGrid rows={model.target} /></div>
        <div className="kpi-label">Candidates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
          {model.options.map((o) => (
            <div key={o.id} style={{ padding: 8, borderRadius: 8, border: `1px solid ${o.correct ? 'var(--mint)' : 'var(--border)'}`, background: o.correct ? 'rgba(94,231,195,0.12)' : 'transparent' }}>
              <ShapeGrid rows={o.cells} />
              <div className="faint" style={{ textAlign: 'center', marginTop: 4 }}>{o.id}{o.correct ? ' ✓' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (model.kind === 'chip-sequence') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {model.sequence.map((t, i) => (
            <div key={i} style={{ minWidth: 40, padding: '10px 12px', textAlign: 'center', borderRadius: 8, background: 'var(--surface-raised)', border: '1px solid var(--border)', fontWeight: 700 }}>{t}</div>
          ))}
          <div style={{ minWidth: 40, padding: '10px 12px', textAlign: 'center', borderRadius: 8, border: '1px dashed var(--border-hi)' }}>?</div>
        </div>
        <div className="kpi-label" style={{ marginTop: 12 }}>Options</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {model.options.map((o) => (
            <div key={o.id} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${o.correct ? 'var(--mint)' : 'var(--border)'}`, background: o.correct ? 'rgba(94,231,195,0.12)' : 'transparent' }}>{o.label}{o.correct ? ' ✓' : ''}</div>
          ))}
        </div>
      </div>
    );
  }
  if (model.kind === 'matrix') {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {model.cells.map((c, i) => (
            <div key={i} style={{ minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, borderRadius: 8, background: c ? 'var(--surface-raised)' : 'transparent', border: `1px ${c ? 'solid' : 'dashed'} var(--border)` }}>{c ?? '?'}</div>
          ))}
        </div>
        <div className="kpi-label" style={{ marginTop: 12 }}>Options</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {model.options.map((o) => (
            <div key={o.id} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, border: `1px solid ${o.correct ? 'var(--mint)' : 'var(--border)'}`, background: o.correct ? 'rgba(94,231,195,0.12)' : 'transparent' }}>{o.label}{o.correct ? ' ✓' : ''}</div>
          ))}
        </div>
      </div>
    );
  }
  // chip-repair
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {model.terms.map((t, i) => {
        const wrong = model.wrongIndex === i;
        return (
          <div key={i} style={{ minWidth: 40, padding: '10px 12px', textAlign: 'center', borderRadius: 8, background: wrong ? 'rgba(242,116,140,0.18)' : 'var(--surface-raised)', border: `1px solid ${wrong ? 'var(--danger)' : 'var(--border)'}`, fontWeight: 700 }}>{t}{wrong ? ' ✕' : ''}</div>
        );
      })}
    </div>
  );
}

export function Preview({ model, prompt, explanation, answerRevealed }: {
  model: PreviewModel | null;
  prompt: string | null;
  explanation: string | null;
  answerRevealed: boolean;
}) {
  const [w, setW] = useState<320 | 390>(390);
  if (!model) return <div className="card"><p className="pending">No preview — build a valid candidate first.</p></div>;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="kpi-label">Preview</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {([320, 390] as const).map((px) => (
            <button key={px} type="button" onClick={() => setW(px)} className={w === px ? 'primary' : ''} style={{ minHeight: 36 }}>{px}dp</button>
          ))}
        </div>
      </div>
      <div style={{ width: w, maxWidth: '100%', margin: '0 auto', padding: 12, borderRadius: 12, background: 'var(--navy)', border: '1px solid var(--border)' }}>
        {prompt && <p style={{ fontWeight: 600, marginBottom: 10 }}>{prompt}</p>}
        <ModelBody model={model} />
        {answerRevealed && explanation && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--surface-raised)' }}>
            <div className="kpi-label">Explanation (authorized reveal)</div>
            <p style={{ fontSize: 13 }}>{explanation}</p>
          </div>
        )}
      </div>
      {!answerRevealed && <p className="faint" style={{ marginTop: 8 }}>Answer overlay hidden — requires a reviewer role with recent sign-in.</p>}
    </div>
  );
}
