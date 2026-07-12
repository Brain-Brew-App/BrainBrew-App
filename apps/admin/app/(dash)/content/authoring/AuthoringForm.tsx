'use client';

/**
 * Generic registry-driven authoring form (Phase 7H.3.2A, Tasks 9, 12).
 *
 * ONE component renders every engine from a serializable `spec` (field groups +
 * default form). It holds form state, does light inline checks, and delegates the
 * canonical build/validate/preview + save to server actions — the client never
 * imports the canonical bundle, a schema function, or an answer.
 */

import { useMemo, useState, useTransition } from 'react';
import type { FieldGroup } from '@/lib/authoring/engines/types';
import { authorFromFormAction, saveDraftAction, type AuthorResult } from './actions';
import { Field, ValidationSummary, BuildStatusPanel, UnsavedBadge } from './FormPrimitives';
import { Preview } from './Preview';

export interface FormSpec {
  engineId: string;
  displayName: string;
  category: string;
  schemaVersion: number;
  fieldGroups: FieldGroup[];
  defaultForm: Record<string, unknown>;
  helpText: string;
  accessibilityNotes: string[];
  smallScreenNotes: string[];
  approvedInputs: string[];
}

export function AuthoringForm({ spec }: { spec: FormSpec }) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...spec.defaultForm });
  const [dirty, setDirty] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState<AuthorResult | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onChange = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaveMsg(null);
  };

  const build = () => start(async () => {
    setSaveMsg(null);
    const r = await authorFromFormAction(spec.engineId, form, reveal);
    setResult(r);
    setDirty(false);
  });

  const save = () => start(async () => {
    const r = await saveDraftAction(spec.engineId, form);
    setSaveMsg(r.ok ? `Draft saved (${r.draftId}). Build/validation persisted.` : `Save failed: ${r.error}`);
    if (r.ok) setDirty(false);
  });

  const fieldErrors = result?.clientCheck.fieldErrors ?? {};
  const passed = result?.build?.ok ? result.build.validation.passed : false;
  const canSave = passed && !dirty;

  const helpId = useMemo(() => `help-${spec.engineId}`, [spec.engineId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1.1fr)', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="card" aria-describedby={helpId}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>{spec.displayName}</h2>
            <span className="pill">{spec.engineId}</span>
            <span className="pill" style={{ background: 'var(--surface-raised)', color: 'var(--violet)' }}>{spec.category}</span>
            <UnsavedBadge dirty={dirty} />
          </div>
          <p id={helpId} className="faint" style={{ marginBottom: 4 }}>{spec.helpText}</p>
          <p className="faint">Approved inputs: {spec.approvedInputs.join(' · ')}</p>
        </div>

        {spec.fieldGroups.map((g) => (
          <fieldset key={g.title} className="card" style={{ border: '1px solid var(--border)' }}>
            <legend className="kpi-label" style={{ padding: '0 6px' }}>{g.title}</legend>
            {g.description && <p className="faint" style={{ marginTop: 0 }}>{g.description}</p>}
            {g.fields.map((f) => (
              <Field key={f.key} f={f} value={form[f.key]} error={fieldErrors[f.key]} onChange={onChange} />
            ))}
          </fieldset>
        ))}

        {result && result.clientCheck.formErrors.length > 0 && (
          <div className="banner danger">{result.clientCheck.formErrors.join(' · ')}</div>
        )}

        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={build} disabled={pending} style={{ minHeight: 44 }}>
            {pending ? 'Working…' : 'Build & validate'}
          </button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} style={{ width: 'auto', minHeight: 'auto' }} />
            Reveal answer (reviewer + recent sign-in)
          </label>
          <button type="button" onClick={save} disabled={pending || !canSave} style={{ minHeight: 44 }}
            title={canSave ? 'Persist as a private authoring draft' : 'Build a passing candidate (no unsaved edits) first'}>
            Save draft
          </button>
        </div>

        {saveMsg && <div className={`banner${saveMsg.startsWith('Draft saved') ? '' : ' danger'}`}>{saveMsg}</div>}

        <div className="card">
          <div className="kpi-label" style={{ marginBottom: 6 }}>Accessibility & small screen</div>
          <ul className="faint" style={{ margin: 0, paddingLeft: 18 }}>
            {[...spec.accessibilityNotes, ...spec.smallScreenNotes].map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {result?.build?.ok && (
          <ValidationSummary
            ok={result.build.validation.passed}
            blocking={result.build.validation.blockingFindings}
            warnings={result.build.validation.warningFindings}
            similarity={result.build.validation.similarityFindings}
          />
        )}
        {result?.build && !result.build.ok && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <span className="pill danger">Build failed</span>
            <p style={{ marginTop: 8 }}>{result.build.code}: {result.build.message}</p>
          </div>
        )}
        {result?.build?.ok && (
          <BuildStatusPanel
            contentHash={result.build.contentHash}
            seedHash={result.build.seedHash}
            builderVersion={result.build.builderVersion}
            validatorVersion={result.build.validation.validatorVersion}
            schemaVersion={spec.schemaVersion}
            hasAnswer={result.build.hasAnswer}
            builtAt={result.build.builtAt}
          />
        )}
        <Preview
          model={result?.preview ?? null}
          prompt={result?.build?.ok ? result.build.preview.prompt : null}
          explanation={result?.build?.ok ? result.build.preview.explanation : null}
          answerRevealed={result?.answerRevealed ?? false}
        />
      </div>
    </div>
  );
}
