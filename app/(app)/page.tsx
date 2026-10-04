import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadEntries, loadFinance } from '@/lib/data';
import { addDays, fmtDate, laDate, weekStart } from '@/lib/time';
import { counts, entrySeconds, openWork } from '@/lib/work';
import { describe } from '@/lib/describe';
import { duration, hours, money, pct } from '@/lib/format';
import { goalPace, isReceivable, paidIn, total } from '@/lib/finance';
import EntryList from '@/components/EntryList';
import { ResumeButton } from '@/components/log/buttons';

export const metadata: Metadata = { title: 'Dashboard' };

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Dashboard() {
  const me = await requirePerson();
  const isAdmin = me.role === 'admin';
  const today = laDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [catalog, entries, fin] = await Promise.all([
    loadCatalog(),
    loadEntries({ from: addDays(today, -45), to: today }),
    isAdmin ? loadFinance() : Promise.resolve(null),
  ]);

  const mine = entries.filter((e) => e.person_id === me.id);
  const secsSince = (list: typeof entries, from: string) => list.filter((e) => counts(e) && laDate(e.started_at) >= from).reduce((a, e) => a + entrySeconds(e), 0);
  const team = (from: string) => secsSince(entries, from);
  const teamMonth = entries.filter((e) => counts(e) && laDate(e.started_at) >= monthStart);
  const extMonth = teamMonth.filter((e) => e.work_type === 'external').reduce((a, e) => a + entrySeconds(e), 0);
  const allMonth = teamMonth.reduce((a, e) => a + entrySeconds(e), 0);

  const running = entries.filter((e) => !e.ended_at && !e.deleted);
  const open = openWork(mine).slice(0, 5);
  const recent = entries.filter((e) => e.ended_at && !e.parallel_of).slice(0, 8);
  const name = (id: string) => catalog.people.find((p) => p.id === id)?.name ?? 'Unknown';

  // Alerts: things that need a person, not a chart.
  const alerts: Array<{ tone: 'warn' | 'crit' | ''; text: React.ReactNode }> = [];
  for (const r of running) {
    const h = entrySeconds(r) / 3600;
    if (h >= 4) alerts.push({ tone: 'warn', text: <>{name(r.person_id)}&apos;s timer has run {duration(entrySeconds(r))}. Forgotten?</> });
  }
  const unlisted = entries.filter((e) => counts(e) && !e.task_type_id).length;
  if (isAdmin && unlisted) alerts.push({ tone: '', text: <><Link className="link" href="/admin?tab=taxonomy">{unlisted} unlisted task{unlisted === 1 ? '' : 's'}</Link> logged recently. Add them to the taxonomy.</> });

  let money$ = null as null | { month: number; ytd: number; goal: number | null; ar: number; arOld: number; pace: ReturnType<typeof goalPace> | null };
  if (fin) {
    const year = Number(today.slice(0, 4));
    const ytd = total(paidIn(fin.billing, `${year}-01-01`, today));
    const goal = fin.goals[year] ?? null;
    const recv = fin.billing.filter(isReceivable);
    const arOld = total(recv.filter((b) => b.invoice_date < addDays(today, -30)));
    if (arOld > 0) alerts.push({ tone: 'crit', text: <><Link className="link" href="/revenue">{money(arOld)}</Link> invoiced more than 30 days ago is still unpaid.</> });
    money$ = { month: total(paidIn(fin.billing, monthStart, today)), ytd, goal, ar: total(recv), arOld, pace: goal ? goalPace(goal, ytd, today) : null };
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1>{greeting()}, {me.name}</h1>
          <p className="lede">What is happening at Lucid Studio right now.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">You today</div><div className="value">{duration(secsSince(mine, today))}</div><div className="sub">{mine.filter((e) => counts(e) && laDate(e.started_at) === today).length} entries</div></div>
        <div className="kpi"><div className="label">You this week</div><div className="value">{hours(secsSince(mine, weekStart(today)))}</div>
          <div className="sub">{me.weekly_capacity_hours ? `of ${Number(me.weekly_capacity_hours)} h capacity` : 'Week to date'}</div></div>
        <div className="kpi"><div className="label">Team this month</div><div className="value">{hours(team(monthStart))}</div><div className="sub">{hours(team(weekStart(today)))} this week</div></div>
        <div className="kpi"><div className="label">External share</div><div className="value">{allMonth ? pct(extMonth / allMonth) : 'N/A'}</div><div className="sub">of team time this month</div></div>
      </div>

      {money$ && (
        <section className="panel pad">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow">Revenue {today.slice(0, 4)}</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em' }} className="num">
                {money(money$.ytd)} {money$.goal && <span className="muted" style={{ fontSize: 18 }}>of {money(money$.goal)}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 28 }}>
              <div><div className="muted small strong">This month</div><div className="num strong" style={{ fontSize: 18 }}>{money(money$.month)}</div></div>
              <div><div className="muted small strong">Receivable</div><div className="num strong" style={{ fontSize: 18 }}>{money(money$.ar)}</div></div>
              {money$.pace && <div><div className="muted small strong">Pace vs target</div>
                <div className="num strong" style={{ fontSize: 18, color: money$.ytd >= money$.pace.targetToDate ? 'var(--good)' : 'var(--crit)' }}>
                  {money$.ytd >= money$.pace.targetToDate ? '+' : ''}{money(money$.ytd - money$.pace.targetToDate)}</div></div>}
            </div>
          </div>
          {money$.pace && (
            <div style={{ marginTop: 16 }}>
              <div className="meter" title={`${pct(money$.pace.pctOfGoal)} of goal`}>
                <div className="fill" style={{ width: `${Math.min(100, money$.pace.pctOfGoal * 100)}%` }} />
                <div className="mark" style={{ left: `${Math.min(100, (money$.pace.targetToDate / money$.pace.goal) * 100)}%` }} title="Where a straight line to the goal would be today" />
              </div>
              <div className="row muted small" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <span>{pct(money$.pace.pctOfGoal)} of the annual goal. The dark mark is where an even pace would be today.</span>
                <Link className="link" href="/projections">Company Projections</Link>
              </div>
            </div>
          )}
          {!money$.goal && <p className="muted small" style={{ marginTop: 8 }}>No revenue goal set for this year. Set one in Company Projections.</p>}
        </section>
      )}

      {alerts.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {alerts.map((a, i) => <div key={i} className={`notice ${a.tone}`}>{a.text}</div>)}
        </div>
      )}

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>Running now</h2></div></div>
          {running.length ? (
            <div className="table-wrap"><table className="data"><tbody>
              {running.map((e) => {
                const d = describe(catalog, e);
                return (
                  <tr key={e.id}>
                    <td className="primary">{name(e.person_id)}<span className="sub">{d.task} · {d.where}</span></td>
                    <td className="n strong nowrap">{duration(entrySeconds(e))}{e.paused_at && <span className="sub">paused</span>}</td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : <div className="empty"><p>No timers running.</p></div>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>Your work in progress</h2></div><Link className="link small" href="/tasks">All tasks</Link></div>
          {open.length ? (
            <div className="table-wrap"><table className="data"><tbody>
              {open.map(({ last, seconds }) => {
                const d = describe(catalog, last);
                return (
                  <tr key={last.id}>
                    <td className="primary">{d.task}<span className="sub">{d.where} · {duration(seconds)} so far</span></td>
                    <td style={{ width: 1 }}><ResumeButton entryId={last.id} /></td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : <div className="empty"><p>Nothing in progress.</p></div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Recent activity</h2><p>The latest finished sessions across the team.</p></div><Link className="link small" href="/time-log">Time Log</Link></div>
        {recent.length
          ? <EntryList entries={recent} catalog={catalog} showDate showPerson canEdit={(e) => isAdmin || e.person_id === me.id} />
          : <div className="empty"><h3>No time logged yet</h3><p>October 1, 2026 is the clean baseline. Everything the team logs from here on builds the analytics.</p></div>}
      </section>
    </div>
  );
}
