'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './Shell.module.css';

export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link href={href} className={`${s.link} ${active ? s.active : ''}`}>
      {label}
    </Link>
  );
}
