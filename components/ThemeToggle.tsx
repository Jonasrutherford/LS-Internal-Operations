'use client';

import s from './Shell.module.css';

export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('ls-theme', next); } catch { /* private mode */ }
  };
  return <button type="button" className={s.theme} onClick={toggle}>Theme</button>;
}
