import { requireAdmin, contextCan } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { Nav, type NavGroup } from '@/components/Nav';
import { signOut } from '../login/actions';

// Capability-gated nav, grouped by function. Filtering is in-process (no RPC).
const GROUPS: { title: string; items: { href: string; label: string; cap: string; planned?: boolean; danger?: boolean }[] }[] = [
  { title: 'Analytics', items: [
    { href: '/', label: 'Overview', cap: 'view_overview' },
    { href: '/users', label: 'Users', cap: 'view_users' },
    { href: '/retention', label: 'Retention', cap: 'view_growth' },
    { href: '/gameplay', label: 'Gameplay', cap: 'view_gameplay' },
    { href: '/engines', label: 'Categories & Engines', cap: 'view_engines' },
  ]},
  { title: 'Content', items: [
    { href: '/puzzles', label: 'Puzzles', cap: 'view_puzzles' },
    { href: '/packs', label: 'Daily Packs', cap: 'view_packs' },
    { href: '/content', label: 'Content Review', cap: 'view_content' },
  ]},
  { title: 'Business', items: [
    { href: '/revenue', label: 'Revenue', cap: 'view_revenue' },
    { href: '/investor', label: 'Investor', cap: 'view_investor' },
    { href: '/reports', label: 'Reports & Exports', cap: 'view_reports' },
  ]},
  { title: 'People', items: [
    { href: '/support', label: 'User Support', cap: 'lookup_user' },
  ]},
  { title: 'Operations', items: [
    { href: '/health', label: 'System Health', cap: 'view_health' },
    { href: '/maintenance', label: 'Maintenance', cap: 'set_maintenance', danger: true },
    { href: '/incidents', label: 'Incidents', cap: 'view_incidents' },
    { href: '/audit', label: 'Audit Log', cap: 'view_overview' },
  ]},
];

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin(); // cached — the page reuses this, no second lookup

  // Nav filtering is synchronous (in-memory capabilities) — no RPCs.
  const groups: NavGroup[] = GROUPS
    .map((g) => ({ title: g.title, items: g.items.filter((n) => contextCan(ctx, n.cap)).map((n) => ({ href: n.href, label: n.label, planned: n.planned, danger: n.danger })) }))
    .filter((g) => g.items.length > 0);

  // The two banner queries run in parallel (independent).
  const svc = adminClient();
  const [incidentsRes, statusRes] = await Promise.all([
    svc.from('admin_incidents').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
    svc.rpc('get_operational_status'),
  ]);
  const incidents = incidentsRes.count ?? 0;
  const status = statusRes.data as { mode?: string; message?: string } | null;
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';

  return (
    <div className="layout">
      <Nav groups={groups} email={ctx.email} role={ctx.role} signOut={signOut} />
      <main className="main">
        {env !== 'production' && <div className="env-badge">{env.toUpperCase()} · non-production</div>}
        {status?.mode && status.mode !== 'normal' && (
          <div className="banner danger">⚠ App is in <b>{status.mode}</b> mode{status.message ? ` — “${status.message}”` : ''}.</div>
        )}
        {incidents > 0 && <div className="banner">🚨 {incidents} active incident{incidents > 1 ? 's' : ''}. <a href="/incidents">View</a></div>}
        {children}
      </main>
    </div>
  );
}
