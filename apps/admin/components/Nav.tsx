'use client';

import { usePathname } from 'next/navigation';

export interface NavItem { href: string; label: string; planned?: boolean; danger?: boolean }
export interface NavGroup { title: string; items: NavItem[] }

/** Grouped sidebar with active-page state. Client-only for `usePathname`; tiny. */
export function Nav({ groups, email, role, signOut }: {
  groups: NavGroup[]; email: string | null; role: string; signOut: () => Promise<void>;
}) {
  const path = usePathname();
  return (
    <nav className="nav">
      <div className="nav-brand">BrainBrew <span className="pill ok">admin</span></div>
      {groups.map((g) => (
        <div key={g.title} className="nav-group">
          <div className="nav-group-title">{g.title}</div>
          {g.items.map((n) => {
            const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
            return (
              <a key={n.href} href={n.href} className={`nav-link${active ? ' active' : ''}${n.danger ? ' danger' : ''}`} aria-current={active ? 'page' : undefined}>
                {n.label}{n.planned ? <span className="faint"> · soon</span> : null}
              </a>
            );
          })}
        </div>
      ))}
      <form action={signOut} className="nav-footer">
        <div className="faint">{email}</div>
        <div className="pill" style={{ background: 'var(--surface-raised)', color: 'var(--violet)', marginTop: 2 }}>{role}</div>
        <button type="submit" style={{ marginTop: 8, width: '100%' }}>Sign out</button>
      </form>
    </nav>
  );
}
