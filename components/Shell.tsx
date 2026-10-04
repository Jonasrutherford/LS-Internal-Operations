import type { Catalog, Person, TimeEntry } from '@/lib/types';
import { signOut } from '@/app/actions/auth';
import Logo from './Logo';
import SideNav, { type NavGroup } from './SideNav';
import ThemeToggle from './ThemeToggle';
import { LogProvider } from './log/LogProvider';
import TimerBar from './log/TimerBar';
import s from './Shell.module.css';

/** Navigation. Finances and System Admin are not rendered for employees, and every
 *  page behind them calls requireAdmin() and is backed by row-level security, so the
 *  hidden link is a convenience, not the control. */
function groups(isAdmin: boolean): NavGroup[] {
  const g: NavGroup[] = [
    { label: 'Work', links: [
      { href: '/', label: 'Dashboard' },
      { href: '/log', label: 'Start / Log' },
      { href: '/time-log', label: 'Time Log' },
      { href: '/tasks', label: 'Tasks' },
    ] },
    { label: 'Insight', links: [
      { href: '/performance', label: 'Performance' },
      ...(isAdmin ? [{ href: '/projections', label: 'Company Projections' }] : []),
    ] },
  ];
  if (isAdmin) {
    g.push({ label: 'Finances', links: [
      { href: '/revenue', label: 'Revenue' },
      { href: '/clients', label: 'Clients' },
      { href: '/expenses', label: 'Payouts / Expenses' },
    ] });
  }
  g.push({ label: 'System', links: [
    { href: '/settings', label: 'Settings' },
    ...(isAdmin ? [{ href: '/admin', label: 'System Admin' }] : []),
  ] });
  return g;
}

export default function Shell({
  person, catalog, running, children,
}: { person: Person; catalog: Catalog; running: TimeEntry | null; children: React.ReactNode }) {
  const isAdmin = person.role === 'admin';
  return (
    <LogProvider catalog={catalog} running={running} me={person}>
      <div className={s.shell}>
        <SideNav
          groups={groups(isAdmin)}
          brand={
            <div className={s.brand}>
              <Logo className={s.logo} />
              <div>
                <b>LS Command</b>
                <span>Lucid Studio</span>
              </div>
            </div>
          }
          foot={
            <div className={s.foot}>
              <div className={s.who}>
                <span className={s.avatar} aria-hidden>{person.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>{person.name}</b>
                  <span>{isAdmin ? 'Admin' : 'Team'}{person.title ? ` · ${person.title}` : ''}</span>
                </div>
              </div>
              <div className={s.footActions}>
                <ThemeToggle />
                <form action={signOut}><button className={s.out} type="submit">Sign out</button></form>
              </div>
            </div>
          }
        />
        <div className={s.main}>
          <header className={s.top}>
            <TimerBar />
          </header>
          <main>{children}</main>
        </div>
      </div>
    </LogProvider>
  );
}
