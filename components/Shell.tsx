import type { Person } from '@/lib/types';
import { signOut } from '@/app/actions/auth';
import NavLink from './NavLink';
import s from './Shell.module.css';

/** Information architecture from section 31. The Finances group is not rendered at
 *  all for employees, and every page behind it independently calls requireAdmin,
 *  so hiding the link is a convenience rather than the control. */
const WORK = [
  { href: '/', label: 'Dashboard' },
  { href: '/time-log', label: 'Time Log' },
  { href: '/tasks', label: 'Tasks' },
];

const FINANCES = [
  { href: '/revenue', label: 'Revenue' },
  { href: '/expenses', label: 'Expenses / Payouts' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/projections', label: 'Company Projections' },
];

export default function Shell({
  person,
  children,
}: {
  person: Person;
  children: React.ReactNode;
}) {
  const isAdmin = person.role === 'admin';

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <div className={s.brand}>
          <svg className={s.mark} viewBox="0 0 24 24" aria-hidden="true" fill="none">
            <path d="M12 2 4 7v10l8 5 8-5V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M12 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <b>Lucid OS</b>
        </div>

        <nav className={s.nav}>
          <div className={s.group}>
            <div className={s.groupLabel}>Work</div>
            {WORK.map((l) => <NavLink key={l.href} {...l} />)}
          </div>

          {isAdmin && (
            <div className={s.group}>
              <div className={s.groupLabel}>Finances</div>
              {FINANCES.map((l) => <NavLink key={l.href} {...l} />)}
            </div>
          )}

          <div className={s.group}>
            <div className={s.groupLabel}>System</div>
            <NavLink href="/settings" label="Settings" />
            {isAdmin && <NavLink href="/admin" label="System Admin" />}
          </div>
        </nav>

        <div className={s.foot}>
          <div className={s.who}>
            <b>{person.name}</b>
            <span className={s.role}>{person.role}</span>
          </div>
          <form action={signOut}>
            <button className={s.out} type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <main className={s.main}>{children}</main>
    </div>
  );
}
