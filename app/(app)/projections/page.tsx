import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { loadCatalog, loadEntries, loadFinance } from '@/lib/data';
import { addDays, fmtMonth, laDate, monthsBetween, resolveRange } from '@/lib/time';
import { contractedIn, EXPENSE_CATEGORY_LABEL, expensesIn, goalPace, isPaid, paidIn, r2, total } from '@/lib/finance';
import { payoutsForRange } from '@/lib/economics';
import { money, pct } from '@/lib/format';
import { RangePicker } from '@/components/controls';
import { Columns, Lines } from '@/components/charts';
import { GoalButton } from '@/components/finance/editors';

export const metadata: Metadata = { title: 'Company Projections' };

export default async function ProjectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'this_year');
  const today = laDate();
  const [catalog, fin] = await Promise.all([loadCatalog(), loadFinance()]);

  // ---------------------------------------------------------------- goal year
  const year = Number(today.slice(0, 4));
  const goal = fin.goals[year] ?? null;
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const ytd = total(paidIn(fin.billing, jan1, today));
  const pace = goal ? goalPace(goal, ytd, today) : null;
  const lastYearSame = total(paidIn(fin.billing, `${year - 1}-01-01`, `${year - 1}${today.slice(4)}`));
  const growth = lastYearSame > 0 ? ytd / lastYearSame - 1 : null;
  const tomorrow = addDays(today, 1);
  const contracted = contractedIn(fin.contracts, tomorrow, dec31);
  const contractedRest = r2(contracted.reduce((a, c) => a + c.amount, 0));
  const scheduledRest = total(fin.billing.filter((b) => !b.deleted && (b.status === 'scheduled' || b.status === 'invoiced')));
  const projectedContracted = r2(ytd + contractedRest);
  const thisMonth = today.slice(0, 7);

  // Cumulative actual vs target vs projection, January to December.
  const months = monthsBetween(jan1, dec31);
  let cum = 0; let proj = 0;
  const actual: Array<number | null> = []; const target: number[] = []; const projected: Array<number | null> = [];
  months.forEach((ym, i) => {
    const m = total(fin.billing.filter((b) => isPaid(b) && b.paid_date!.slice(0, 7) === ym));
    if (ym <= thisMonth) { cum += m; actual.push(r2(cum)); } else actual.push(null);
    target.push(goal ? r2((goal * (i + 1)) / 12) : 0);
    if (ym < thisMonth) projected.push(null);
    else {
      if (ym === thisMonth) proj = cum;
      proj += contracted.filter((c) => c.on.slice(0, 7) === ym).reduce((a, c) => a + c.amount, 0);
      projected.push(r2(proj));
    }
  });

  // ---------------------------------------------------------------- selected range history
  const firstPaid = fin.billing.filter(isPaid).map((b) => b.paid_date!).sort()[0];
  const hFrom = range.key === 'all' && firstPaid ? firstPaid : range.from;
  const hTo = range.to;
  const hMonths = monthsBetween(hFrom, hTo);
  const monthly = hMonths.map((ym) => ({
    label: fmtMonth(ym), muted: ym > thisMonth,
    values: {
      paid: total(fin.billing.filter((b) => isPaid(b) && b.paid_date!.slice(0, 7) === ym)),
      contracted: ym >= thisMonth ? r2(contractedIn(fin.contracts, ym === thisMonth ? tomorrow : `${ym}-01`, `${ym}-31`).reduce((a, c) => a + c.amount, 0)) : 0,
    },
  }));
  const monthlyTarget = hMonths.map((ym) => { const g = fin.goals[Number(ym.slice(0, 4))]; return g ? r2(g / 12) : 0; });
  let run = 0;
  const cumulativeHist = monthly.map((m) => (run += m.values.paid, r2(run)));
  const rangePaid = total(paidIn(fin.billing, hFrom, hTo));

  // ---------------------------------------------------------------- costs for the rest of the year
  const restExpenses = expensesIn(fin.expenses, tomorrow, dec31);
  const ytdExpenses = r2(expensesIn(fin.expenses, jan1, today).reduce((a, x) => a + Number(x.amount), 0));
  const byVendor = new Map<string, { vendor: string; category: string; amount: number; n: number }>();
  for (const x of restExpenses) {
    const k = x.id;
    const prev = byVendor.get(k) ?? { vendor: x.vendor, category: x.category, amount: 0, n: 0 };
    byVendor.set(k, { ...prev, amount: r2(prev.amount + Number(x.amount)), n: prev.n + 1 });
  }
  const restCost = r2(restExpenses.reduce((a, x) => a + Number(x.amount), 0));
  const entries = await loadEntries({ from: jan1, to: today });
  const ytdPayouts = r2(payoutsForRange(fin, entries, catalog, jan1, today).reduce((a, p) => a + p.pool, 0));
  const restPayouts = r2(contractedRest * fin.settings.pool_pct);
  const yearRevenue = projectedContracted;
  const yearCosts = r2(ytdExpenses + restCost);
  const yearPayouts = r2(ytdPayouts + restPayouts);
  const retained = r2(yearRevenue - yearCosts - yearPayouts);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Insight</div>
          <h1>Company Projections</h1>
          <p className="lede">How Lucid Studio is tracking against its {year} revenue goal. Actual is paid revenue. Projected adds only what active contracts will bill on their own schedule; nothing is guessed.</p>
        </div>
        <div className="actions"><GoalButton year={year} amount={goal} /></div>
      </div>

      <div className="kpis">
        <div className="kpi hero"><div className="label">{year} goal</div><div className="value">{goal ? money(goal) : 'Not set'}</div><div className="sub">{pace ? `${pct(pace.pctOfGoal)} reached` : 'Set a goal to track pace'}</div></div>
        <div className="kpi"><div className="label">Year to date</div><div className="value">{money(ytd)}</div><div className="sub">{growth == null ? 'No prior-year data' : `${growth >= 0 ? '+' : ''}${pct(growth)} vs same period ${year - 1}`}</div></div>
        <div className="kpi"><div className="label">Pace vs target</div><div className="value" style={{ color: pace ? (ytd >= pace.targetToDate ? 'var(--good)' : 'var(--crit)') : undefined }}>{pace ? `${ytd >= pace.targetToDate ? '+' : ''}${money(ytd - pace.targetToDate)}` : 'N/A'}</div><div className="sub">{pace ? `target today ${money(pace.targetToDate)}` : ''}</div></div>
        <div className="kpi"><div className="label">Projected year end</div><div className="value">{money(projectedContracted)}</div><div className="sub">YTD plus {money(contractedRest)} contracted</div></div>
        <div className="kpi"><div className="label">Still needed</div><div className="value">{pace ? money(Math.max(0, r2(goal! - projectedContracted))) : 'N/A'}</div><div className="sub">{pace?.neededPerMonth != null ? `beyond contracts · ${money(pace.neededPerMonth)}/mo total pace` : ''}</div></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>{year}: cumulative revenue against the goal</h2><p>Solid is paid revenue to date. Dashed navy is the straight-line path to the goal. Dashed orange adds contracted billing still to come.</p></div></div>
        <div className="panel-body">
          {ytd > 0 || contractedRest > 0 ? (
            <Lines format="moneyShort" height={320} labels={months.map((m) => fmtMonth(m))} series={[
              ...(goal ? [{ key: 'target', label: 'Goal path', color: 'var(--ink-3)', values: target, dashed: true }] : []),
              { key: 'projected', label: 'Projected', color: 'var(--s2)', values: projected, dashed: true },
              { key: 'actual', label: 'Actual', color: 'var(--s1)', values: actual },
            ]} />
          ) : <div className="empty"><h3>No revenue recorded for {year} yet</h3><p>Add billing in Revenue or import the previous ledger from System Admin. The chart then plots actual revenue against the goal path.</p></div>}
          {scheduledRest > 0 && <p className="muted small" style={{ marginTop: 8 }}>{money(scheduledRest)} is invoiced or scheduled but unpaid. It is not in the projection until paid, to avoid counting it twice with contracts.</p>}
        </div>
      </section>

      <RangePicker value={range.key} from={range.from} to={range.to} keys={['ytd', 'this_year', 'prev_year', 'all', 'custom']} />

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>Monthly revenue</h2><p>{range.label}: {money(rangePaid)} paid. The dashed line is the monthly share of that year&apos;s goal. Faded bars are contracted, not yet paid.</p></div></div>
          <div className="panel-body">
            <Columns format="moneyShort" height={280} data={monthly} targetLabel="Monthly goal pace"
              target={monthlyTarget.some((t) => t > 0) ? monthlyTarget : null}
              series={[{ key: 'paid', label: 'Paid', color: 'var(--s1)' }, { key: 'contracted', label: 'Contracted', color: 'var(--heat-3)' }]} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Cumulative over the range</h2><p>Running total of paid revenue, {range.label.toLowerCase()}.</p></div></div>
          <div className="panel-body">
            <Lines format="moneyShort" height={280} labels={monthly.map((m) => m.label)} series={[{ key: 'cum', label: 'Cumulative', color: 'var(--s1)', values: cumulativeHist }]} />
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>{year} outlook</h2><p>Each line traces to a source on the Revenue or Payouts / Expenses pages.</p></div></div>
          <div className="table-wrap"><table className="data"><tbody>
            <tr><td className="primary">Paid revenue to date</td><td className="n">{money(ytd)}</td></tr>
            <tr><td className="primary">Contracted billing still to come<span className="sub">{contracted.length} scheduled bills from active contracts</span></td><td className="n">{money(contractedRest)}</td></tr>
            <tr className="total"><td>Projected revenue</td><td className="n">{money(yearRevenue)}</td></tr>
            <tr><td className="primary">Expenses to date</td><td className="n">-{money(ytdExpenses)}</td></tr>
            <tr><td className="primary">Expected recurring costs to year end</td><td className="n">-{money(restCost)}</td></tr>
            <tr><td className="primary">Partner payouts to date</td><td className="n">-{money(ytdPayouts)}</td></tr>
            <tr><td className="primary">Payouts on contracted revenue<span className="sub">{Math.round(fin.settings.pool_pct * 100)}% pool</span></td><td className="n">-{money(restPayouts)}</td></tr>
            <tr className="total"><td>Projected retained by Lucid Studio</td><td className="n" style={{ color: retained < 0 ? 'var(--crit)' : undefined }}>{money(retained)}</td></tr>
          </tbody></table></div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Expected costs to year end</h2><p>Recurring commitments from tomorrow to December 31, each listed separately.</p></div></div>
          {byVendor.size ? (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Vendor</th><th>Category</th><th className="n">Charges</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {[...byVendor.values()].sort((a, b) => b.amount - a.amount).map((v) => (
                  <tr key={v.vendor + v.category}><td className="primary">{v.vendor}</td><td>{EXPENSE_CATEGORY_LABEL[v.category]}</td><td className="n">{v.n}</td><td className="n">{money(v.amount, true)}</td></tr>
                ))}
                <tr className="total"><td colSpan={3}>Total</td><td className="n">{money(restCost, true)}</td></tr>
              </tbody>
            </table></div>
          ) : <div className="empty"><p>No recurring costs fall due before year end.</p></div>}
        </section>
      </div>
    </div>
  );
}
