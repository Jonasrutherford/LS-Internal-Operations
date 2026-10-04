'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import s from './Shell.module.css';

export interface NavGroup { label: string; links: { href: string; label: string }[] }

export default function SideNav({ groups, brand, foot }: { groups: NavGroup[]; brand: React.ReactNode; foot: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button className={s.menuBtn} onClick={() => setOpen(true)} aria-label="Open navigation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} />}
      <aside className={`${s.side} ${open ? s.sideOpen : ''}`}>
        {brand}
        <nav className={s.nav} aria-label="Main">
          {groups.map((g) => (
            <div className={s.group} key={g.label}>
              <div className={s.groupLabel}>{g.label}</div>
              {g.links.map((l) => {
                const active = l.href === '/' ? pathname === '/' : pathname === l.href || pathname.startsWith(l.href + '/');
                return (
                  <Link key={l.href} href={l.href} className={`${s.link} ${active ? s.active : ''}`} aria-current={active ? 'page' : undefined}>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {foot}
      </aside>
    </>
  );
}
