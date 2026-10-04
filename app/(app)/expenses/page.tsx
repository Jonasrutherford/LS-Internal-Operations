import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { loadCatalog, loadEntries, loadFinance } from '@/lib/data';
import { addDays, fmtDate, fmtMonth, laDate, resolveRange } from '@/lib/time';
import { EXPENSE_CATEGORY_LABEL, expensesIn, FREQUENCY_LABEL, monthlyCost, r2 } from '@/lib/finance';
import { payoutsForRange } from '@/lib/economics';
import { money, pct } from '@/lib/format';
import { RangePicker } from '@/components/controls';
import { ExpenseButton } from '@/components/finance/editors';
import type { Expense } from '@/lib/types';

export const metadata: Metadata = { title: 'Payouts / Expenses' };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'ytd');
  const today = laDate();
  const [catalog, fin, entries] = await Promise.all([loadCatalog(), loadFinance(), loadEntries(range)]);

  // ---------------------------------------------------------------- recurring commitments
  const rules = fin.expenses.filter((x) => x.recurring && (!x.end_date || x.end_date >= today));
  const monthlyTotal = r2(rules.reduce((a, x) => a + monthlyCost(x), 0));
  const next = (x: Expense) => expensesIn([x], today, addDays(today, 400))[0]?.on ?? null;
  const ruleGroups = Object.keys(EXPENSE_CATEGORY_LABEL).map((k) => ({ k, list: rules.filter((x) => x.category === k).sort((a, b) => monthlyCost(b) - monthlyCost(a)) })).filter((g) => g.list.length);

  // ---------------------------------------------------------------- actual expenses in range
  const occ = expensesIn(fin.expenses, range.from, range.to > today ? today : range.to).sort((a, b) => b.on.localeCompare(a.on));
  const spent = r2(occ.reduce((a, x) => a + Number(x.amount), 0));
  const byCat = Object.keys(EXPENSE_CATEGORY_LABEL).map((k) => ({ k, amount: r2(occ.filter((x) => x.category === k).reduce((a, x) => a + Number(x.amount), 0)) })).filter((r) => r.amount > 0);

  // ---------------------------------------------------------------- payouts
  const payouts = payoutsForRange(fin, entries, catalog, range.from, range.to > today ? today : range.to).reverse();
  const people = [...new Set(payouts.flatMap((p) => p.lines.map((l) => l.personKey)))];
  const label = (k: string) => catalog.people.find((p) => p.legacy_key === k)?.name ?? k[0].toUpperCase() + k.slice(1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Finances</div>
          <h1>Payouts / Expenses</h1>
          <p className="lede">What Lucid Studio pays out. Every recurring cost is its own line, and every payout shows the rule that produced it.</p>
        </div>
        <div className="actions"><ExpenseButton label="Add expense" className="btn primary" /></div>
      </div>

      <div className="kpis">
        <div className="kpi hero"><div className="label">Recurring costs</div><div className="value">{money(monthlyTotal)}</div><div className="sub">per month, averaged</div></div>
        <div className="kpi"><div className="label">Contractors</div><div className="value">{money(r2(rules.filter((x) => x.category === 'contractor').reduce((a, x) => a + monthlyCost(x), 0)))}</div><div className="sub">per month</div></div>
        <div className="kpi"><div className="label">Software and services</div><div className="value">{money(r2(rules.filter((x) => x.category !== 'contractor').reduce((a, x) => a + monthlyCost(x), 0)))}</div><div className="sub">per month</div></div>
        <div className="kpi"><div className="label">Spent in range</div><div className="value">{money(spent)}</div><div className="sub">{range.label}</div></div>
        <div className="kpi"><div className="label">Partner payouts</div><div className="value">{money(r2(payouts.reduce((a, p) => a + p.pool, 0)))}</div><div className="sub">{range.label}</div></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Recurring costs</h2><p>Each commitment individually. Annual subscriptions show their monthly average and next charge. These feed Company Projections.</p></div></div>
        {ruleGroups.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Vendor</th><th>Category</th><th>Billed</th><th className="n">Amount</th><th className="n">Per month</th><th>Next charge</th><th /></tr></thead>
            <tbody>
              {ruleGroups.flatMap((g) => g.list.map((x) => (
                <tr key={x.id}>
                  <td className="primary">{x.vendor}{x.notes && <span className="sub">{x.notes}</span>}</td>
                  <td>{EXPENSE_CATEGORY_LABEL[x.category]}</td>
                  <td>{FREQUENCY_LABEL[x.frequency ?? 'monthly']}</td>
                  <td className="n">{money(Number(x.amount), true)}</td>
                  <td className="n strong">{money(monthlyCost(x), true)}</td>
                  <td className="nowrap">{(() => { const n = next(x); return n ? fmtDate(n, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Ended'; })()}</td>
                  <td style={{ width: 1 }}><ExpenseButton expense={x} label="Edit" /></td>
                </tr>
              )))}
              <tr className="total"><td colSpan={4}>Total recurring</td><td className="n">{money(monthlyTotal, true)}</td><td colSpan={2} /></tr>
            </tbody>
          </table></div>
        ) : <div className="empty"><p>No recurring costs recorded.</p></div>}
      </section>

      <RangePicker value={range.key} from={range.from} to={range.to} keys={['month', 'last_month', 'ytd', 'prev_year', 'custom']} />

      <section className="panel">
        <div className="panel-head"><div><h2>Partner payouts</h2><p>Through {fmtMonth(addMonthsYm(fin.settings.hours_based_from, -1), true)}: fixed shares of paid revenue. From {fmtMonth(fin.settings.hours_based_from, true)}: {Math.round(fin.settings.pool_pct * 100)}% of paid revenue, split by share of logged hours. A past month is never recomputed under a newer rule.</p></div></div>
        {payouts.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Month</th><th className="n">Paid revenue</th><th>Rule</th>{people.map((k) => <th key={k} className="n">{label(k)}</th>)}<th className="n">Total payout</th><th className="n">Retained</th></tr></thead>
            <tbody>{payouts.map((p) => (
              <tr key={p.month}>
                <td className="primary nowrap">{fmtMonth(p.month, true)}</td>
                <td className="n">{money(p.revenue)}</td>
                <td className="small muted">{p.regime === 'fixed' ? 'Fixed shares' : `${Math.round(fin.settings.pool_pct * 100)}% pool by hours`}</td>
                {people.map((k) => {
                  const l = p.lines.find((x) => x.personKey === k);
                  return <td key={k} className="n">{l ? money(l.amount, true) : <span className="muted">0</span>}{l?.hoursShare != null && <span className="sub">{pct(l.hoursShare)} of {(p.hours[k] ?? 0).toFixed(1)} h</span>}</td>;
                })}
                <td className="n strong">{money(p.pool, true)}</td>
                <td className="n">{money(r2(p.revenue - p.pool), true)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><p>No months in this range.</p></div>}
        {payouts.some((p) => p.regime === 'hours' && p.revenue > 0 && p.lines.length === 0) && (
          <div className="panel-foot">A month with revenue but no logged hours has no basis to split the pool. Log time to allocate it.</div>
        )}
      </section>

      <div className="grid-2-1">
        <section className="panel">
          <div className="panel-head"><div><h2>Expenses in range</h2><p>One-off payments on their date, and each recurring charge as it falls due.</p></div></div>
          {occ.length ? (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}><table className="data">
              <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th className="n">Amount</th></tr></thead>
              <tbody>{occ.map((x, i) => (
                <tr key={x.id + x.on + i}>
                  <td className="nowrap">{fmtDate(x.on, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="primary">{x.vendor}{x.recurring && <span className="sub">recurring</span>}</td>
                  <td>{EXPENSE_CATEGORY_LABEL[x.category]}</td>
                  <td className="n">{money(Number(x.amount), true)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="empty"><p>No expenses in this range. Past bank transactions come in through System Admin, Data Import.</p></div>}
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>By category</h2></div></div>
          {byCat.length ? (
            <div className="table-wrap"><table className="data"><tbody>
              {byCat.sort((a, b) => b.amount - a.amount).map((r) => (
                <tr key={r.k}><td className="primary">{EXPENSE_CATEGORY_LABEL[r.k]}</td><td className="n">{money(r.amount)}</td><td className="n muted">{pct(r.amount / Math.max(1, spent))}</td></tr>
              ))}
              <tr className="total"><td>Total</td><td className="n">{money(spent)}</td><td /></tr>
            </tbody></table></div>
          ) : <div className="empty"><p>Nothing yet.</p></div>}
        </section>
      </div>
    </div>
  );
}

function addMonthsYm(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
