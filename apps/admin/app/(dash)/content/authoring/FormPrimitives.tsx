'use client';

/**
 * Shared authoring form primitives (Phase 7H.3.2A, Task 2).
 *
 * Accessible, keyboard-usable, ≥44–48px controls with inline errors. Driven by
 * FieldDescriptor DATA (no per-engine code). These import ONLY types — never the
 * canonical bundle or any schema function — so nothing sensitive reaches the
 * client bundle.
 */

import type { FieldDescriptor } from '@/lib/authoring/engines/types';

const errStyle = { color: 'var(--danger)', fontSize: 12, marginTop: 4 } as const;
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 } as const;
const helpStyle = { fontSize: 12, color: 'var(--text-faint)', marginTop: 4 } as const;
const ctrl = { minHeight: 44, width: '100%' } as const;

function FieldShell({ f, error, children }: { f: FieldDescriptor; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle} htmlFor={`f-${f.key}`}>
        {f.label}{f.required ? ' *' : ''}
      </label>
      {children}
      {f.help && <div style={helpStyle}>{f.help}</div>}
      {error && <div style={errStyle} role="alert">{error}</div>}
    </div>
  );
}

export function Field({ f, value, error, onChange }: {
  f: FieldDescriptor;
  value: unknown;
  error?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  const set = (v: unknown) => onChange(f.key, v);

  if (f.kind === 'number') {
    return (
      <FieldShell f={f} error={error}>
        <input id={`f-${f.key}`} type="number" style={ctrl} value={value as number}
          min={f.min} max={f.max} step={f.step ?? 1}
          aria-invalid={!!error} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />
      </FieldShell>
    );
  }

  if (f.kind === 'select' || f.kind === 'matrix-rule') {
    return (
      <FieldShell f={f} error={error}>
        <select id={`f-${f.key}`} style={ctrl} value={String(value)} aria-invalid={!!error} onChange={(e) => set(e.target.value)}>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FieldShell>
    );
  }

  if (f.kind === 'difficulty') {
    const cur = Number(value);
    return (
      <FieldShell f={f} error={error}>
        <div role="radiogroup" aria-label={f.label} style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" role="radio" aria-checked={cur === d}
              onClick={() => set(d)}
              className={cur === d ? 'primary' : ''}
              style={{ minWidth: 44, minHeight: 44 }}>{d}</button>
          ))}
        </div>
      </FieldShell>
    );
  }

  if (f.kind === 'glyph') {
    const source = f.glyphSource ?? [];
    return (
      <FieldShell f={f} error={error}>
        <div role="radiogroup" aria-label={f.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {source.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={value === g} aria-label={`glyph ${g}`}
              onClick={() => set(g)} className={value === g ? 'primary' : ''}
              style={{ minWidth: 44, minHeight: 44, fontSize: 20 }}>{g}</button>
          ))}
        </div>
      </FieldShell>
    );
  }

  if (f.kind === 'glyph-multi') {
    const source = f.glyphSource ?? [];
    const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
    const toggle = (g: string) => {
      const next = new Set(selected);
      if (next.has(g)) next.delete(g); else next.add(g);
      // Preserve source order for determinism.
      set(source.filter((x) => next.has(x)));
    };
    return (
      <FieldShell f={f} error={error}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {source.map((g) => (
            <button key={g} type="button" aria-pressed={selected.has(g)} aria-label={`glyph ${g}`}
              onClick={() => toggle(g)} className={selected.has(g) ? 'primary' : ''}
              style={{ minWidth: 44, minHeight: 44, fontSize: 20 }}>{g}</button>
          ))}
        </div>
        <div style={helpStyle}>{selected.size} selected</div>
      </FieldShell>
    );
  }

  return null;
}

export function ValidationSummary({ ok, blocking, warnings, similarity }: {
  ok: boolean; blocking: string[]; warnings: string[]; similarity: string[];
}) {
  return (
    <div className="card" style={{ borderColor: ok ? 'var(--ok)' : 'var(--danger)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className={`pill ${ok ? 'ok' : 'danger'}`}>{ok ? 'Validation passed' : 'Validation failed'}</span>
        {!ok && <span className="faint">Review submission is blocked until this passes.</span>}
      </div>
      {blocking.length > 0 && (
        <>
          <div className="kpi-label">Blocking</div>
          <ul>{blocking.map((b, i) => <li key={i} style={{ color: 'var(--danger)' }}>{b}</li>)}</ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <div className="kpi-label">Warnings</div>
          <ul>{warnings.map((w, i) => <li key={i} style={{ color: 'var(--warn)' }}>{w}</li>)}</ul>
        </>
      )}
      <div className="kpi-label" style={{ marginTop: 8 }}>Similarity</div>
      <p className="faint">{similarity.length ? similarity.join('; ') : 'Similarity analysis is not yet available.'}</p>
    </div>
  );
}

export function BuildStatusPanel({ contentHash, seedHash, builderVersion, validatorVersion, schemaVersion, hasAnswer, builtAt }: {
  contentHash: string; seedHash: string; builderVersion: string; validatorVersion: string; schemaVersion: number; hasAnswer: boolean; builtAt: string;
}) {
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
      <span className="faint">{k}</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
    </div>
  );
  return (
    <div className="card">
      <div className="kpi-label" style={{ marginBottom: 6 }}>Build</div>
      {row('content hash', `${contentHash.slice(0, 16)}…`)}
      {row('seed hash', `${seedHash.slice(0, 16)}…`)}
      {row('builder', builderVersion)}
      {row('validator', validatorVersion)}
      {row('schema', `v${schemaVersion}`)}
      {row('answer', hasAnswer ? 'present (private)' : 'none')}
      {row('built at', new Date(builtAt).toUTCString())}
    </div>
  );
}

export function UnsavedBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return <span className="pill warn" role="status">Unsaved changes</span>;
}
