/** Shared admin data components (Phase 7G) — cards, freshness, tables, states. */

export function Kpi({ label, value, sub, title }: { label: string; value: React.ReactNode; sub?: string; title?: string }) {
  return (
    <div className="card" title={title}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="faint">{sub}</div>}
    </div>
  );
}

export function Freshness({ source, at }: { source: string; at?: string | null }) {
  return <p className="faint">Source: {source} · UTC · as of {at ? new Date(at).toUTCString() : new Date().toUTCString()}</p>;
}

export function Pending({ children }: { children: React.ReactNode }) {
  return <span className="pending">{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card"><p className="pending">{children}</p></div>;
}

export const num = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-US') : v == null ? '—' : String(v));
export const pct = (v: unknown) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);

export function DateRangeBar({ range }: { range: { from: string; to: string } }) {
  const link = (r: string, label: string) => <a key={r} href={`?range=${r}`} style={{ marginRight: 10 }}>{label}</a>;
  return (
    <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      <span className="kpi-label">Range</span>
      {link('today', 'Today')}{link('7d', '7d')}{link('30d', '30d')}{link('90d', '90d')}
      <span className="faint">· {range.from} → {range.to} (UTC)</span>
    </div>
  );
}
