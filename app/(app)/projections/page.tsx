import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { money, monthlyEquivalent, expensesIn } from '@/lib/finance';
import type { Contract, Expense } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectionsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [contractsRes, expensesRes] = await Promise.all([
    supabase.from('contracts').select('*').eq('active', true),
    supabase.from('expenses').select('*').eq('deleted', false),
  ]);

  const contracts = (contractsRes.data ?? []) as Contract[];
  const expenses = (expensesRes.data ?? []) as Expense[];

  // Only contracts with a fixed cycle contribute to recurring revenue. Commission
  // and per-deliverable work is excluded rather than estimated, section 52.
  const monthlyParts = contracts.map(monthlyEquivalent);
  const recurringMonthly = monthlyParts.reduce<number>((a, m) => a + (m ?? 0), 0);
  const unmodelled = contracts.filter((c) => monthlyEquivalent(c) == null).length;

  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28`;
  const monthExpenses = expensesIn(expenses, from, to);
  const expenseMonthly = monthExpenses.reduce((a, x) => a + Number(x.amount), 0);

  const tile = (label: string, value: React.ReactNode, note?: string) => (
    <div className="panel" style={{ padding: '13px 15px' }}>
      <div className="eyebrow">{label}</div>
      <div className="num" style={{ fontFamily: 'var(--f-display)', fontSize: 23, fontWeight: 600, marginTop: 3 }}>{value}</div>
      {note && <div className="muted" style={{ fontSize: 12 }}>{note}</div>}
    </div>
  );

  return (
    <>
      <header><div className="eyebrow">Finances</div><h1>Company Projections</h1></header>

      <div style={{ display: 'grid', gap: 12, marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {tile('Recurring revenue, monthly', money(recurringMonthly),
          unmodelled
            ? `${unmodelled} contract${unmodelled === 1 ? '' : 's'} excluded: no fixed cycle`
            : 'From active fixed-cycle contracts')}
        {tile('Projected expenses, this month',
          expenses.length ? money(expenseMonthly) : <span className="muted">Insufficient data</span>,
          expenses.length ? undefined : 'No expenses recorded yet')}
        {tile('Projected net, this month',
          expenses.length ? money(recurringMonthly - expenseMonthly) : <span className="muted">Insufficient data</span>)}
      </div>

      {unmodelled > 0 && (
        <p className="muted" style={{ marginTop: 16, maxWidth: '62ch' }}>
          Commission and per-deliverable contracts have no fixed billing cycle, so they
          are left out of these figures rather than given an invented monthly value.
        </p>
      )}
    </>
  );
}
