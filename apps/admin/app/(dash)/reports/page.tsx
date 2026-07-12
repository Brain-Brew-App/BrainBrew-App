import { requireCapability, contextCan } from '@/lib/auth';
import { Freshness, StateNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

const EXPORTS = [
  { id: 'gameplay-daily', name: 'Gameplay (daily)', fields: 'day, ranked/practice starts & completions, avg/median score' },
  { id: 'user-daily', name: 'Users (daily)', fields: 'day, new/permanent/anonymous, active users' },
  { id: 'engine', name: 'Engine performance (30d)', fields: 'engine, exposures, players, avg points, perfect/zero rate' },
  { id: 'content-inventory', name: 'Content inventory', fields: 'engine, category, approved/reserve/scheduled counts' },
];

export default async function ReportsPage() {
  const ctx = await requireCapability('view_reports');
  const canExport = contextCan(ctx, 'export_reports');
  return (
    <>
      <h1>Reports &amp; Exports</h1>
      <Freshness source="aggregated datasets · UTC · no PII" />
      {!canExport && <StateNote kind="unavailable">Your role can view reports but not export. Ask a Founder for export access.</StateNote>}
      <div className="grid cards">
        {EXPORTS.map((e) => (
          <div key={e.id} className="card">
            <div className="kpi-label">{e.name}</div>
            <p className="faint" style={{ margin: '6px 0 10px' }}>{e.fields}</p>
            {canExport
              ? <a className="pill ok" style={{ textDecoration: 'none' }} href={`/api/export/${e.id}`} download>Download CSV</a>
              : <span className="pending">export not permitted</span>}
          </div>
        ))}
      </div>
      <p className="faint" style={{ marginTop: 16 }}>
        Exports are aggregate-only, row-capped, CSV-injection-safe, UTF-8 with a data-as-of header, and every download is audited. No emails, user UUIDs, tokens, answers, provider ids, or audit IP hashes are ever included.
      </p>
    </>
  );
}
