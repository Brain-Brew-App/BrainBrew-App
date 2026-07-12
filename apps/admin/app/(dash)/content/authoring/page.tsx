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
      <h1>Authoring</h1>
      <p className="faint" style={{ marginBottom: 16 }}>
        Author a typed seed → canonical build → independent validation → safe preview. Unapproved
        candidates never touch canonical content. Observation &amp; Pattern engines are live; Logic,
        Language Logic and Attention Speed forms follow in the next checkpoints.
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

      <section style={{ marginTop: 8 }}>
        <div className="kpi-label" style={{ marginBottom: 8 }}>Coming next</div>
        <p className="pending">Logic (LOG_001–003), Language Logic (LNG_001–003) and Attention Speed (ATT_001–003) authoring forms are checkpoint 7H.3.2B, on the same registry-driven architecture.</p>
      </section>
    </div>
  );
}
