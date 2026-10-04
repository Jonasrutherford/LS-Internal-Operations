import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePerson } from '@/lib/auth';
import { loadFinance } from '@/lib/data';
import { fmtMonth } from '@/lib/time';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const me = await requirePerson();
  const fin = me.role === 'admin' ? await loadFinance() : null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">System</div>
          <h1>Settings</h1>
          <p className="lede">Your profile, and how LS Command keeps Lucid Studio&apos;s data.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Your profile</h2></div>
        <div className="table-wrap"><table className="data"><tbody>
          <tr><td className="primary" style={{ width: 220 }}>Name</td><td>{me.name}</td></tr>
          <tr><td className="primary">Email</td><td>{me.email ?? 'Not set'}</td></tr>
          <tr><td className="primary">Role</td><td>{me.role === 'admin' ? 'Admin: Finances, System Admin and corrections to anyone\'s time' : 'Team: your own time, company work and performance'}</td></tr>
          <tr><td className="primary">Weekly capacity</td><td>{me.weekly_capacity_hours != null ? `${Number(me.weekly_capacity_hours)} hours` : 'Not set'}{me.role === 'admin' && <> · <Link className="link" href="/admin?tab=team">change in Team</Link></>}</td></tr>
          <tr><td className="primary">Time zone</td><td>Los Angeles. Every day, week and month in LS Command uses Lucid Studio&apos;s time zone.</td></tr>
          <tr><td className="primary">Theme</td><td>Use the Theme button at the bottom of the sidebar.</td></tr>
        </tbody></table></div>
      </section>

      <section className="panel pad stack" style={{ gap: 8 }}>
        <h2>Where your data lives</h2>
        <p className="muted">Every timer, entry and edit is saved to Lucid Studio&apos;s database the moment you make it, not in this browser. Close the tab, switch devices or clear your browser and nothing is lost. A running timer keeps running on the server, so you can stop it from any device.</p>
        <p className="muted">October 1, 2026 is the clean baseline for logged time. Analytics treat anything earlier as reconstructed history.</p>
      </section>

      {fin && (
        <section className="panel">
          <div className="panel-head"><div><h2>Company rules</h2><p>Used by Payouts and Company Projections.</p></div></div>
          <div className="table-wrap"><table className="data"><tbody>
            <tr><td className="primary" style={{ width: 220 }}>Payout pool</td><td>{Math.round(fin.settings.pool_pct * 100)}% of paid revenue, split by share of logged hours, from {fmtMonth(fin.settings.hours_based_from, true)}</td></tr>
            <tr><td className="primary">Before that</td><td>Fixed shares of paid revenue: {Object.entries(fin.settings.fixed_split).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${Math.round(Number(v) * 100)}%`).join(', ')}</td></tr>
            <tr><td className="primary">Revenue basis</td><td>Cash: revenue counts on the day it is paid</td></tr>
            <tr><td className="primary">Revenue goals</td><td>{Object.entries(fin.goals).map(([y, a]) => `${y}: $${Number(a).toLocaleString()}`).join(' · ') || 'None set'} · <Link className="link" href="/projections">edit in Company Projections</Link></td></tr>
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
