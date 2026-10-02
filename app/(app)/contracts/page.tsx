import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { money, monthlyEquivalent, FREQUENCY_LABEL } from '@/lib/finance';
import { one } from '@/lib/rel';
import type { Contract } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<Contract['type'], string> = {
  retainer: 'Retainer',
  ad_commission: 'Ad Commission',
  hourly: 'Hourly',
  one_off: 'One-off',
  per_unit: 'Per deliverable',
} as Record<Contract['type'], string>;

export default async function ContractsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from('contracts')
    .select('*, clients(name)')
    .eq('active', true)
    .order('start_date');

  const rows = data ?? [];

  return (
    <>
      <header><div className="eyebrow">Finances</div><h1>Contracts</h1></header>

      <p className="muted" style={{ marginTop: 6, maxWidth: 62 + 'ch' }}>
        Billing frequency is stored exactly as agreed. The monthly column is a derived
        figure for analytics only and never changes what a client is actually billed.
      </p>

      <div className="panel" style={{ marginTop: 14, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Client</th><th>Type</th><th>Frequency</th>
              <th style={{ textAlign: 'right' }}>Per billing</th>
              <th style={{ textAlign: 'right' }}>Monthly equivalent</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ padding: 20, textAlign: 'center' }}>No contracts yet.</td></tr>
            )}
            {rows.map((c) => {
              const monthly = monthlyEquivalent(c as Contract);
              const needsRate = c.type === 'ad_commission' && c.percent_commission == null;
              return (
                <tr key={c.id}>
                  <td>{one(c.clients)?.name}</td>
                  <td>{TYPE_LABEL[c.type as Contract['type']] ?? c.type}</td>
                  <td>{FREQUENCY_LABEL[c.billing_frequency as Contract['billing_frequency']]}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {c.type === 'ad_commission'
                      ? (needsRate
                          ? <span style={{ color: 'var(--signal)' }}>Rate not set</span>
                          : `${c.percent_commission}%`)
                      : money(Number(c.amount_per_billing))}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {monthly == null ? <span className="muted">N/A</span> : money(monthly)}
                  </td>
                  <td className="mono">{c.start_date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
