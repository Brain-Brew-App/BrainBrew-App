import { requireCapability } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Freshness, num, StateNote } from '@/components/ui';
import { TestSubjectButton } from './form';

export const dynamic = 'force-dynamic';

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCapability('lookup_user');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const uid = (sp.uid ?? '').trim();
  const svc = adminClient();

  let results: Record<string, unknown>[] = [];
  let profile: Record<string, unknown> | null = null;
  if (/^[0-9a-f-]{36}$/i.test(uid)) {
    profile = (await svc.rpc('admin_user_profile', { p_user: uid })).data as Record<string, unknown> | null;
  } else if (q.length >= 3) {
    results = ((await svc.rpc('admin_user_lookup', { p_query: q })).data ?? []) as Record<string, unknown>[];
  }

  return (
    <>
      <h1>User Support</h1>
      <Freshness source="profiles + attempts + entitlements (live)" />
      <form method="get" className="card" style={{ display: 'flex', gap: 8, maxWidth: 520, marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Exact username or Auth UUID (min 3 chars)" style={{ flex: 1 }} />
        <button className="primary" type="submit">Search</button>
      </form>

      {profile ? (
        <>
          <div className="grid cards">
            <div className="card"><div className="kpi-label">Username</div><div className="kpi-value" style={{ fontSize: 20 }}>{String(profile.username ?? '—')}</div><div className="faint">{String(profile.account_type)} · {String(profile.country_code ?? '—')}</div></div>
            <div className="card"><div className="kpi-label">Ranked</div><div className="kpi-value">{num((profile.ranked as Record<string, unknown>)?.completed)}</div><div className="faint">best {num((profile.ranked as Record<string, unknown>)?.best_score)} · last {String((profile.ranked as Record<string, unknown>)?.last_ranked_date ?? '—')}</div></div>
            <div className="card"><div className="kpi-label">Practice</div><div className="kpi-value">{num((profile.practice as Record<string, unknown>)?.completed)}</div></div>
            <div className="card"><div className="kpi-label">Entitlement</div><div className="kpi-value" style={{ fontSize: 18 }}>{String((profile.entitlement as Record<string, unknown>)?.state)}</div><div className="faint">active: {String((profile.entitlement as Record<string, unknown>)?.is_active)}</div></div>
          </div>
          <p className="faint" style={{ marginTop: 12 }}>UUID {String(profile.user_id)} · created {profile.created_at ? new Date(String(profile.created_at)).toISOString().slice(0, 10) : '—'} · last activity {profile.last_activity ? new Date(String(profile.last_activity)).toISOString().slice(0, 10) : '—'} · onboarding {String(profile.onboarding_status)}</p>
          <div className="card" style={{ marginTop: 12, maxWidth: 520 }}>
            <div className="kpi-label">Analytics test subject</div>
            <p className="faint">Currently {profile.test_excluded ? 'EXCLUDED from business KPIs' : 'counted in KPIs'}.</p>
            <TestSubjectButton userId={String(profile.user_id)} excluded={profile.test_excluded === true} />
          </div>
          <p className="faint" style={{ marginTop: 12 }}>No tokens, passwords, provider ids, payment data, submitted answers, or anti-cheat thresholds are shown. Higher-impact actions (disable, delete, invalidate, entitlement grant) require separate operational certification.</p>
        </>
      ) : q.length >= 3 ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table><thead><tr><th>Username</th><th>Type</th><th>Country</th><th>Created</th></tr></thead>
            <tbody>
              {results.map((r) => <tr key={String(r.user_id)}><td><a href={`?uid=${r.user_id}`}>{String(r.username ?? '(no username)')}</a></td><td>{String(r.account_type)}</td><td>{String(r.country_code ?? '—')}</td><td className="faint">{r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : '—'}</td></tr>)}
              {results.length === 0 && <tr><td colSpan={4}><StateNote kind="empty">No user matches that exact username or UUID.</StateNote></td></tr>}
            </tbody>
          </table>
        </div>
      ) : <StateNote kind="empty">Enter an exact username or Auth UUID (≥3 chars). Email lookup and broader search are intentionally not enumeration-friendly.</StateNote>}
    </>
  );
}
