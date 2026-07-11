import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Kpi, Freshness, num } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requireCapability('view_users');
  const svc = adminClient();
  const [ov, countries] = await Promise.all([
    svc.rpc('admin_kpi_overview'),
    svc.from('profiles').select('country_code').not('country_code', 'is', null),
  ]);
  const o = (ov.data ?? {}) as Record<string, unknown>;

  // Country distribution (real, from profiles).
  const byCountry = new Map<string, number>();
  for (const r of (countries.data ?? []) as { country_code: string }[]) {
    byCountry.set(r.country_code, (byCountry.get(r.country_code) ?? 0) + 1);
  }
  const topCountries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <>
      <h1>Users</h1>
      <Freshness source="profiles + auth.users" at={o.generated_at as string} />
      <div className="grid cards">
        <Kpi label="Total users" value={num(o.total_users)} />
        <Kpi label="Permanent" value={num(o.permanent_users)} />
        <Kpi label="Anonymous" value={num(o.anonymous_users)} />
        <Kpi label="New today" value={num(o.new_users_today)} sub={`${num(o.new_users_7d)} (7d) · ${num(o.new_users_30d)} (30d)`} />
      </div>

      <h2 style={{ marginTop: 24 }}>Country distribution</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Country</th><th>Users</th></tr></thead>
          <tbody>
            {topCountries.map(([c, n]) => <tr key={c}><td>{c}</td><td>{num(n)}</td></tr>)}
            {topCountries.length === 0 && <tr><td colSpan={2} className="pending">No country data yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="faint" style={{ marginTop: 16 }}>
        Platform (iOS/Android/web) and app-version distribution are derived from mobile
        analytics events and populate once instrumentation ships — shown as pending rather than
        inferred from web traffic. Email/Google secured-account breakdown will read Auth identities
        via the server-only Admin API in the support build-out.
      </p>
    </>
  );
}
