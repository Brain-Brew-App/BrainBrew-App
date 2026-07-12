import { requireCapability } from '@/lib/auth';
import { authorableEnginesByCategory } from '@/lib/authoring/engines';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  observation: 'Observation',
  pattern: 'Pattern',
  logic: 'Logic',
  'language-logic': 'Language Logic',
  'attention-speed': 'Attention Speed',
};

/** Authoring home — pick an engine to author a new puzzle draft. */
export default async function AuthoringHome() {
  await requireCapability('manage_content');
  const cats = authorableEnginesByCategory();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Authoring</h1>
        <a href="/content/authoring/queue" className="pill ok" style={{ textDecoration: 'none' }}>Review queue →</a>
      </div>
      <div style={{ height: 12 }} />
      <p className="faint" style={{ marginBottom: 16 }}>
        Author a typed seed → canonical build → independent validation → safe preview. Unapproved
        candidates never touch canonical content. All 15 active engines across the five categories
        are authorable through this one workflow.
      </p>

      {cats.map((c) => (
        <section key={c.category} style={{ marginBottom: 20 }}>
          <div className="kpi-label" style={{ marginBottom: 8 }}>{CATEGORY_LABEL[c.category] ?? c.category}</div>
          <div className="grid cards">
            {c.engines.map((e) => (
              <a key={e.engineId} href={`/content/authoring/new/${e.engineId}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{e.displayName}</strong>
                  <span className="pill">{e.engineId}</span>
                </div>
                <p className="faint" style={{ marginTop: 6 }}>{e.helpText}</p>
                <span className="pill ok" style={{ marginTop: 8 }}>New puzzle →</span>
              </a>
            ))}
          </div>
        </section>
      ))}

    </div>
  );
}
