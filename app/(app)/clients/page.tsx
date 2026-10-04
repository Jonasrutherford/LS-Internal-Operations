import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import { loadCatalog, loadEntries, loadFinance } from '@/lib/data';
import { addDays, EPOCH, laDate, resolveRange } from '@/lib/time';
import { clientEconomics } from '@/lib/economics';
import { counts, entrySeconds } from '@/lib/work';
import { CONTRACT_TYPE_LABEL } from '@/lib/finance';
import { hours, money, pct } from '@/lib/format';
import { RangePicker } from '@/components/controls';
import { BubbleChart, Heatmap, HeatLegend } from '@/components/charts';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'ytd');
  const [catalog, fin, entries] = await Promise.all([
    loadCatalog(), loadFinance(),
    // Payouts need every month's hours in the range, so load the whole range plus nothing else.
    loadEntries({ from: range.key === 'all' ? EPOCH : range.from, to: range.to }),
  ]);
  const econ = clientEconomics(fin, entries, catalog, range.from, range.to);
  const rows = econ.rows;
  const tot = rows.reduce((a, r) => ({ paid: a.paid + r.paid, hours: a.hours + r.hours, labor: a.labor + r.laborCost, contribution: a.contribution + r.contribution, ar: a.ar + r.ar }),
    { paid: 0, hours: 0, labor: 0, contribution: 0, ar: 0 });
  const blended = tot.hours > 0 ? tot.paid / tot.hours : null;

  // Where client hours go: client × service line or category.
  const clientEntries = entries.filter((e) => counts(e) && e.client_id && laDate(e.started_at) >= range.from && laDate(e.started_at) <= range.to);
  const lineOf = (e: (typeof entries)[number]) => {
    const t = catalog.taskTypes.find((x) => x.id === e.task_type_id);
    return t?.service_line ?? catalog.categories.find((c) => c.id === e.category_id)?.name ?? 'Other';
  };
  const lineTotals = new Map<string, number>();
  const mix: Record<string, Record<string, number>> = {};
  for (const e of clientEntries) {
    const l = lineOf(e); const h = entrySeconds(e) / 3600;
    lineTotals.set(l, (lineTotals.get(l) ?? 0) + h);
    mix[e.client_id!] ??= {}; mix[e.client_id!][l] = (mix[e.client_id!][l] ?? 0) + h;
  }
  const lines = [...lineTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l]) => l);
  const mixClients = rows.filter((r) => r.hours > 0);
  const legacy = entries.some((e) => e.source === 'import' && laDate(e.started_at) >= range.from);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Finances</div>
          <h1>Clients</h1>
          <p className="lede">Which clients are economically attractive and which are operationally expensive. Labor cost uses the period&apos;s effective payout per hour{econ.rate != null ? ` (${money(econ.rate, true)}/h in this range)` : ''}: partner payouts divided by every hour logged.</p>
        </div>
      </div>
      <RangePicker value={range.key} from={range.from} to={range.to} keys={['month', 'last_month', '90d', 'ytd', 'prev_year', 'all', 'custom']} />

      <section className="panel">
        <div className="panel-head">
          <div><h2>Labor hours vs paid revenue</h2><p>Bubble size is contribution dollars. Color is contribution margin. Above the dashed line a client earns more than the blended rate per hour.</p></div>
          <div className="legend">
            <span><i style={{ background: 'var(--crit)' }} />Negative margin</span>
            <span><i style={{ background: 'var(--neutral)' }} />Under 15%</span>
            <span><i style={{ background: 'var(--s1)' }} />Healthy</span>
          </div>
        </div>
        <div className="panel-body">
          {rows.some((r) => r.hours > 0 || r.paid > 0) ? (
            <BubbleChart xLabel="Labor hours" yLabel="Paid revenue" xFmt="hours" yFmt="moneyShort" height={440}
              refSlope={blended ? { value: blended, label: `${money(blended)}/h blended` } : null}
              points={rows.filter((r) => r.hours > 0 || r.paid > 0).map((r) => ({
                id: r.id, label: r.name, x: r.hours, y: r.paid, size: r.contribution, tone: r.margin ?? -1,
                lines: [
                  ['Paid revenue', money(r.paid)], ['Labor hours', `${r.hours.toFixed(1)} h`], ['Revenue per hour', r.revPerHour != null ? money(r.revPerHour) : 'N/A'],
                  ['Labor cost', money(r.laborCost)], ['Contribution', money(r.contribution)], ['Margin', pct(r.margin)],
                ],
              }))} />
          ) : <div className="empty"><h3>No client revenue or labor in this range</h3><p>Record billing in Revenue and log client time; each client then appears as a bubble placed by hours and revenue.</p></div>}
          {legacy && <p className="muted small" style={{ marginTop: 8 }}>Includes reconstructed time from before the October 1, 2026 baseline. Choose a range from October onward for logged-only figures.</p>}
        </div>
      </section>

      <div className="kpis">
        <div className="kpi"><div className="label">Paid revenue</div><div className="value">{money(tot.paid)}</div><div className="sub">{range.label}</div></div>
        <div className="kpi"><div className="label">Client labor</div><div className="value">{hours(tot.hours * 3600)}</div><div className="sub">{money(tot.labor)} at payout rate</div></div>
        <div className="kpi"><div className="label">Contribution</div><div className="value" style={{ color: tot.contribution < 0 ? 'var(--crit)' : undefined }}>{money(tot.contribution)}</div><div className="sub">{tot.paid ? `${pct(tot.contribution / tot.paid)} margin` : 'N/A'}</div></div>
        <div className="kpi"><div className="label">Revenue per hour</div><div className="value">{blended != null ? money(blended) : 'N/A'}</div><div className="sub">blended across clients</div></div>
        <div className="kpi"><div className="label">Receivable</div><div className="value">{money(tot.ar)}</div><div className="sub">invoiced, unpaid</div></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Client P&amp;L</h2><p>Paid is cash received in the range. Recognized is billed in the range. Contribution is paid revenue minus labor at the payout rate.</p></div></div>
        {rows.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Client</th><th>Contract</th><th className="n">Paid</th><th className="n">Recognized</th><th className="n">Receivable</th><th className="n">Hours</th><th className="n">Rev / h</th><th className="n">Labor cost</th><th className="n">Contribution</th><th className="n">Margin</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? '' : 'dim'}>
                  <td className="primary"><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>{r.color && <span className="dot" style={{ background: r.color }} />}{r.name}</span>{!r.active && <span className="sub">Former client</span>}</td>
                  <td>{r.contract ? CONTRACT_TYPE_LABEL[r.contract] : <span className="muted">None</span>}</td>
                  <td className="n">{money(r.paid)}</td>
                  <td className="n">{money(r.recognized)}</td>
                  <td className="n">{r.ar ? money(r.ar) : <span className="muted">0</span>}</td>
                  <td className="n">{r.hours.toFixed(1)}</td>
                  <td className="n">{r.revPerHour != null ? money(r.revPerHour) : <span className="muted">N/A</span>}</td>
                  <td className="n">{money(r.laborCost)}</td>
                  <td className="n strong" style={{ color: r.contribution < 0 ? 'var(--crit)' : undefined }}>{money(r.contribution)}</td>
                  <td className="n">{r.margin == null ? <span className="muted">N/A</span> : <span className={`tag ${r.margin < 0 ? 'crit' : r.margin < 0.15 ? 'warn' : 'good'}`}>{pct(r.margin)}</span>}</td>
                </tr>
              ))}
              <tr className="total"><td>Total</td><td /><td className="n">{money(tot.paid)}</td><td /><td className="n">{money(tot.ar)}</td><td className="n">{tot.hours.toFixed(1)}</td><td className="n">{blended != null ? money(blended) : 'N/A'}</td><td className="n">{money(tot.labor)}</td><td className="n">{money(tot.contribution)}</td><td className="n">{tot.paid ? pct(tot.contribution / tot.paid) : 'N/A'}</td></tr>
            </tbody>
          </table></div>
        ) : <div className="empty"><p>No client activity in this range.</p></div>}
        <div className="panel-foot">Labor rate: {money(econ.payoutTotal)} in partner payouts over {econ.totalHours.toFixed(1)} logged hours (internal and external). Payout rules are on Payouts / Expenses.</div>
      </section>

      {mixClients.length > 0 && lines.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Where client hours go</h2><p>Hours per client by service line, or by category where a task has no service line.</p></div><HeatLegend /></div>
          <div className="panel-body">
            <Heatmap format="hours" rowLabelWidth={170} rows={mixClients.map((r) => ({ key: r.id, label: r.name }))} cols={lines.map((l) => ({ key: l, label: l.length > 12 ? l.slice(0, 11) + '…' : l }))} data={mix} />
            <p className="muted small" style={{ marginTop: 8 }}>Columns: {lines.join(', ')}.</p>
          </div>
        </section>
      )}
      <p className="muted small">Data through {addDays(laDate(), 0)}.</p>
    </div>
  );
}
