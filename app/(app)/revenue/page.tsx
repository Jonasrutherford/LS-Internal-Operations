import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { loadCatalog, loadFinance } from '@/lib/data';
import { fmtMonth, monthsBetween, resolveRange } from '@/lib/time';
import { BILLING_KIND_LABEL, isPaid, isReceivable, paidIn, total } from '@/lib/finance';
import { money, pct } from '@/lib/format';
import { RangePicker } from '@/components/controls';
import { Columns } from '@/components/charts';
import HBars from '@/components/HBars';
import { AddBillingButton, BillingTable } from '@/components/finance/editors';
import type { BillingKind } from '@/lib/types';

export const metadata: Metadata = { title: 'Revenue' };

// Recurring and one-off are the two streams that matter for planning. Ad commission
// is variable recurring revenue and is shown on its own.
const STREAMS: Array<{ key: string; label: string; color: string; kinds: BillingKind[] }> = [
  { key: 'recurring', label: 'Recurring retainers', color: 'var(--s1)', kinds: ['retainer'] },
  { key: 'commission', label: 'Ad Commission', color: 'var(--s4)', kinds: ['ad_commission'] },
  { key: 'oneoff', label: 'One-off and hourly', color: 'var(--s2)', kinds: ['one_off', 'hourly', 'additional_charge'] },
  { key: 'other', label: 'Other income', color: 'var(--neutral)', kinds: ['other_income'] },
];
const streamOf = (k: BillingKind) => STREAMS.find((s) => s.kinds.includes(k))!.key;

export default async function RevenuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'this_year');
  const [catalog, fin] = await Promise.all([loadCatalog(), loadFinance()]);

  const firstPaid = fin.billing.filter(isPaid).map((b) => b.paid_date!).sort()[0];
  const from = range.key === 'all' && firstPaid ? firstPaid : range.from;
  const paid = paidIn(fin.billing, from, range.to);
  const totalPaid = total(paid);
  const clientPaid = total(paid.filter((b) => b.kind !== 'other_income'));
  const byStream = Object.fromEntries(STREAMS.map((s) => [s.key, total(paid.filter((b) => streamOf(b.kind) === s.key))]));
  const ar = fin.billing.filter(isReceivable);

  const months = monthsBetween(from, range.to);
  const monthly = months.map((ym) => {
    const inM = paid.filter((b) => b.paid_date!.slice(0, 7) === ym);
    return { label: fmtMonth(ym), values: Object.fromEntries(STREAMS.map((s) => [s.key, total(inM.filter((b) => streamOf(b.kind) === s.key))])) };
  });

  const byClient = new Map<string, number>();
  for (const b of paid) if (b.client_id) byClient.set(b.client_id, (byClient.get(b.client_id) ?? 0) + Number(b.amount));
  const clientRows = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const top3 = clientRows.slice(0, 3).reduce((a, [, v]) => a + v, 0);

  const kindRows = (Object.keys(BILLING_KIND_LABEL) as BillingKind[]).map((k) => ({ k, amount: total(paid.filter((b) => b.kind === k)), n: paid.filter((b) => b.kind === k).length })).filter((r) => r.n);
  const events = fin.billing.filter((b) => (b.paid_date ?? b.invoice_date) >= from && (b.paid_date ?? b.invoice_date) <= range.to)
    .sort((a, b) => (b.paid_date ?? b.invoice_date).localeCompare(a.paid_date ?? a.invoice_date));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Finances</div>
          <h1>Revenue</h1>
          <p className="lede">Revenue counts when it is paid. Every figure on this page is a sum of the billing events listed at the bottom.</p>
        </div>
        <div className="actions"><AddBillingButton clients={catalog.clients} contracts={fin.contracts} /></div>
      </div>
      <RangePicker value={range.key} from={range.from} to={range.to} keys={['month', 'last_month', 'ytd', 'this_year', 'prev_year', 'all', 'custom']} />

      <div className="kpis">
        <div className="kpi hero"><div className="label">Paid revenue</div><div className="value">{money(totalPaid)}</div><div className="sub">{range.label}</div></div>
        <div className="kpi"><div className="label">Recurring</div><div className="value">{money(byStream.recurring)}</div><div className="sub">{clientPaid ? `${pct(byStream.recurring / clientPaid)} of client revenue` : 'N/A'}</div></div>
        <div className="kpi"><div className="label">One-off and hourly</div><div className="value">{money(byStream.oneoff)}</div><div className="sub">{clientPaid ? pct(byStream.oneoff / clientPaid) : 'N/A'}</div></div>
        <div className="kpi"><div className="label">Ad Commission</div><div className="value">{money(byStream.commission)}</div><div className="sub">{clientPaid ? pct(byStream.commission / clientPaid) : 'N/A'}</div></div>
        <div className="kpi"><div className="label">Receivable now</div><div className="value">{money(total(ar))}</div><div className="sub">{ar.length} unpaid invoice{ar.length === 1 ? '' : 's'}</div></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Monthly revenue by stream</h2><p>Paid revenue per month. Recurring at the base, so a thin base under tall bars means revenue depends on one-off work.</p></div>
          <div className="legend">{STREAMS.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div></div>
        <div className="panel-body">
          {totalPaid > 0 ? <Columns format="moneyShort" data={monthly} series={STREAMS.map((s) => ({ key: s.key, label: s.label, color: s.color }))} height={300} />
            : <div className="empty"><h3>No paid revenue in this range</h3><p>Add billing as invoices are paid, or import the previous app&apos;s ledger from System Admin.</p></div>}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>Client revenue share</h2><p>{clientRows.length ? `Top three clients are ${pct(top3 / Math.max(1, clientPaid))} of client revenue.` : 'Share of paid client revenue.'}</p></div></div>
          <div className="panel-body">
            <HBars rows={clientRows.map(([id, v]) => {
              const c = catalog.clients.find((x) => x.id === id);
              return { key: id, label: c?.name ?? 'Unknown', value: v, display: money(v), sub: pct(v / Math.max(1, clientPaid)), color: c?.brand_color ?? 'var(--s1)' };
            })} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>By billing kind</h2></div></div>
          {kindRows.length ? (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Kind</th><th className="n">Bills</th><th className="n">Paid</th><th className="n">Share</th></tr></thead>
              <tbody>{kindRows.map((r) => (
                <tr key={r.k}><td className="primary">{BILLING_KIND_LABEL[r.k]}</td><td className="n">{r.n}</td><td className="n">{money(r.amount)}</td><td className="n">{pct(r.amount / Math.max(1, totalPaid))}</td></tr>
              ))}<tr className="total"><td>Total</td><td className="n">{paid.length}</td><td className="n">{money(totalPaid)}</td><td /></tr></tbody>
            </table></div>
          ) : <div className="empty"><p>Nothing paid in this range.</p></div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Billing events</h2><p>Paid, invoiced and scheduled bills in this range. Edit one to mark it paid.</p></div></div>
        <BillingTable events={events} clients={catalog.clients} contracts={fin.contracts} />
      </section>
    </div>
  );
}
