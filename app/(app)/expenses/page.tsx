import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { money, FREQUENCY_LABEL } from '@/lib/finance';
import type { Expense } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Itemised, never bundled, section 41. Software is listed per vendor rather than
 *  as one number, section 43. */
export default async function ExpensesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from('expenses').select('*').eq('deleted', false).order('category').order('label');
  const rows = (data ?? []) as Expense[];

  const groups: Array<[Expense['category'], string]> = [
    ['contractor', 'Contractors'],
    ['software', 'Software'],
    ['service', 'Services'],
    ['other', 'Other'],
  ];

  return (
    <>
      <header><div className="eyebrow">Finances</div><h1>Expenses / Payouts</h1></header>

      {rows.length === 0 && (
        <div className="panel muted" style={{ padding: 20, marginTop: 14 }}>
          No expenses recorded yet. Contractor costs and individual software
          subscriptions are entered here one line at a time.
        </div>
      )}

      {groups.map(([key, label]) => {
        const list = rows.filter((r) => r.category === key);
        if (!list.length) return null;
        const total = list.reduce((a, r) => a + Number(r.amount), 0);
        return (
          <section key={key} style={{ marginTop: 20 }}>
            <h2>{label}</h2>
            <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Item</th><th>Vendor</th><th>Frequency</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td>{r.vendor ?? <span className="muted">&mdash;</span>}</td>
                      <td>{r.recurring && r.frequency ? FREQUENCY_LABEL[r.frequency] : 'One-off'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{money(Number(r.amount))}</td>
                    </tr>
                  ))}
                  <tr className="sub">
                    <td colSpan={3}>{label} total</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
