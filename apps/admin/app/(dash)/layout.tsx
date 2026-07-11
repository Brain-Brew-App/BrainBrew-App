import { requireAdmin, can } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { signOut } from '../login/actions';

/** Nav items gated by capability. Pages not yet built are marked "planned". */
const NAV: { href: string; label: string; cap: string; planned?: boolean }[] = [
  { href: '/', label: 'Overview', cap: 'view_overview' },
  { href: '/users', label: 'Users', cap: 'view_users' },
  { href: '/retention', label: 'Retention', cap: 'view_growth' },
  { href: '/gameplay', label: 'Gameplay', cap: 'view_gameplay' },
  { href: '/engines', label: 'Categories & Engines', cap: 'view_engines' },
  { href: '/puzzles', label: 'Puzzles', cap: 'view_puzzles', planned: true },
  { href: '/packs', label: 'Daily Packs', cap: 'view_packs', planned: true },
  { href: '/revenue', label: 'Revenue', cap: 'view_revenue' },
  { href: '/content', label: 'Content Review', cap: 'view_content', planned: true },
  { href: '/investor', label: 'Investor', cap: 'view_investor' },
  { href: '/health', label: 'System Health', cap: 'view_health' },
  { href: '/maintenance', label: 'Maintenance', cap: 'set_maintenance' },
  { href: '/incidents', label: 'Incidents', cap: 'view_incidents' },
  { href: '/audit', label: 'Audit Log', cap: 'view_overview' },
];

async function activeIncidents(): Promise<number> {
  const { data } = await adminClient().from('admin_incidents').select('id').neq('status', 'resolved');
  return data?.length ?? 0;
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin();
  const visible = (await Promise.all(NAV.map(async (n) => ((await can(ctx.role, n.cap)) ? n : null)))).filter(Boolean) as typeof NAV;
  const incidents = await activeIncidents();
  const status = (await adminClient().rpc('get_operational_status')).data as { mode?: string; message?: string } | null;

  return (
    <div className="layout">
      <nav className="nav">
        <div style={{ padding: '0 10px 12px', fontWeight: 800 }}>BrainBrew <span className="pill ok">admin</span></div>
        {visible.map((n) => (
          <a key={n.href} href={n.href}>{n.label}{n.planned ? <span className="faint"> · planned</span> : null}</a>
        ))}
        <form action={signOut} style={{ marginTop: 16, padding: '0 10px' }}>
          <div className="faint">{ctx.email} · {ctx.role}</div>
          <button type="submit" style={{ marginTop: 8, width: '100%' }}>Sign out</button>
        </form>
      </nav>
      <main className="main">
        {status?.mode && status.mode !== 'normal' && (
          <div className="banner danger">⚠ App is in <b>{status.mode}</b> mode{status.message ? ` — “${status.message}”` : ''}.</div>
        )}
        {incidents > 0 && <div className="banner">🚨 {incidents} active incident{incidents > 1 ? 's' : ''}. <a href="/incidents">View</a></div>}
        {children}
      </main>
    </div>
  );
}
