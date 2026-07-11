import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const cell = (v: number | null) => {
  if (v == null) return { txt: '—', bg: 'transparent' };
  const t = Math.round(v * 100);
  const alpha = Math.min(0.85, 0.1 + v * 0.9);
  return { txt: `${t}%`, bg: `rgba(94,231,195,${alpha.toFixed(2)})` };
};

export default async function RetentionPage() {
  await requireCapability('view_growth');
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const rows = ((await adminClient().rpc('admin_retention', { p_from: from, p_to: to })).data ?? []) as Array<Record<string, number | null>>;

  return (
    <>
      <h1>Retention</h1>
      <Freshness source="attempts (cohort = first Brew start, UTC)" />
      <p className="faint">Cohort = a user’s first ranked or Practice Brew. A horizon shows “—” until its window has fully elapsed (honest incompleteness).</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Cohort</th><th>Size</th><th>D1</th><th>D3</th><th>D7</th><th>D14</th><th>D30</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.cohort)}>
                <td>{String(r.cohort)}</td>
                <td>{r.size}</td>
                {(['d1', 'd3', 'd7', 'd14', 'd30'] as const).map((k) => {
                  const c = cell(r[k]);
                  return <td key={k} style={{ background: c.bg, color: c.bg === 'transparent' ? 'var(--text-faint)' : 'var(--navy)', fontWeight: 700 }}>{c.txt}</td>;
                })}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="pending">No cohorts in range yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
