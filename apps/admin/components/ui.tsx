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

/** Server-side pager. Preserves other query params via `base` (a query string). */
export function Pager({ page, total, limit, base }: { page: number; total: number; limit: number; base: string }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const q = (p: number) => `?${base}${base ? '&' : ''}page=${p}`;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
      {page > 1 ? <a href={q(page - 1)}>← Prev</a> : <span className="faint">← Prev</span>}
      <span className="faint">Page {page} of {pages} · {total.toLocaleString('en-US')} total</span>
      {page < pages ? <a href={q(page + 1)}>Next →</a> : <span className="faint">Next →</span>}
    </div>
  );
}

/** Capability-filtered filter chips (links that set one query param). */
export function FilterChips({ param, options, active }: { param: string; options: { v: string; label: string }[]; active?: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      <a href="?" className={`pill ${!active ? 'ok' : ''}`} style={{ textDecoration: 'none' }}>All</a>
      {options.map((o) => (
        <a key={o.v} href={`?${param}=${o.v}`} className={`pill ${active === o.v ? 'ok' : ''}`} style={{ textDecoration: 'none', border: '1px solid var(--border)' }}>{o.label}</a>
      ))}
    </div>
  );
}

/** Honest state note that distinguishes empty / unavailable / stale. */
export function StateNote({ kind, children }: { kind: 'empty' | 'unavailable' | 'stale' | 'error'; children: React.ReactNode }) {
  const cls = kind === 'error' ? 'pill danger' : kind === 'stale' ? 'pill warn' : 'pending';
  return <p className={cls} style={{ display: 'inline-block' }}>{children}</p>;
}

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
