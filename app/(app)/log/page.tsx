import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadEntries } from '@/lib/data';
import { addDays, fmtDate, laDate, weekStart } from '@/lib/time';
import { counts, entrySeconds, openWork } from '@/lib/work';
import { describe } from '@/lib/describe';
import { duration, hours } from '@/lib/format';
import DayTimeline from '@/components/DayTimeline';
import EntryList from '@/components/EntryList';
import { PastButton, QuickStart, ResumeButton, StartButton } from '@/components/log/buttons';

export const metadata: Metadata = { title: 'Start / Log' };

export default async function LogPage() {
  const me = await requirePerson();
  const today = laDate();
  const [catalog, recent] = await Promise.all([
    loadCatalog(),
    loadEntries({ from: addDays(today, -60), to: today }, { personId: me.id }),
  ]);

  const todays = recent.filter((e) => laDate(e.started_at) === today);
  const sum = (from: string) => recent.filter((e) => counts(e) && laDate(e.started_at) >= from).reduce((a, e) => a + entrySeconds(e), 0);
  const todaySecs = sum(today);
  const weekSecs = sum(weekStart(today));
  const monthSecs = sum(`${today.slice(0, 7)}-01`);
  const capacity = me.weekly_capacity_hours ? Number(me.weekly_capacity_hours) * 3600 : null;

  // Quick Start: discrete, repeatable tasks this person has actually done, most recent first.
  const quick = new Map<string, (typeof recent)[number]>();
  for (const e of recent) {
    if (!counts(e) || !e.task_type_id) continue;
    const t = catalog.taskTypes.find((x) => x.id === e.task_type_id);
    if (!t?.quick_start || !t.active) continue;
    const k = `${e.task_type_id}|${e.client_id ?? e.prospect_id ?? e.partner_id ?? 'internal'}`;
    if (!quick.has(k)) quick.set(k, e);
  }
  const quickList = [...quick.values()].slice(0, 8);
  const quickTypes = catalog.taskTypes.filter((t) => t.quick_start && t.active).slice(0, 10);
  const open = openWork(recent);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1>Start / Log</h1>
          <p className="lede">Start a timer when you begin, stop it when you are done. Forgot one? Log the past time.</p>
        </div>
        <div className="actions">
          <PastButton />
          <StartButton className="btn primary lg" />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Today</div><div className="value">{duration(todaySecs)}</div><div className="sub">{todays.filter(counts).length} entries</div></div>
        <div className="kpi"><div className="label">This week</div><div className="value">{hours(weekSecs)}</div>
          <div className="sub">{capacity ? `of ${hours(capacity, 0)} capacity` : 'No capacity set'}</div></div>
        <div className="kpi"><div className="label">This month</div><div className="value">{hours(monthSecs)}</div><div className="sub">{fmtDate(today, { month: 'long', year: 'numeric' })}</div></div>
        <div className="kpi"><div className="label">In progress</div><div className="value">{open.length}</div><div className="sub">open pieces of work</div></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Today</h2><p>Los Angeles time. External in blue, internal in orange.</p></div></div>
        <div className="panel-body">
          <DayTimeline date={today} entries={todays} catalog={catalog} />
        </div>
        {todays.length > 0
          ? <EntryList entries={todays} catalog={catalog} canEdit={() => true} />
          : <div className="empty"><h3>Nothing logged today yet</h3><p>Start a timer or use Quick Start below. Each entry is saved to the cloud the moment you stop.</p></div>}
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>Quick Start</h2><p>Repeatable deliverables you have done recently. One click starts the timer.</p></div></div>
          <div className="panel-body stack" style={{ gap: 8 }}>
            {quickList.map((e) => {
              const d = describe(catalog, e);
              return (
                <QuickStart key={e.id} entry={e} className="btn" >
                  <span style={{ flex: 1, textAlign: 'left' }}>{d.task}</span>
                  <span className="muted small">{d.where}</span>
                </QuickStart>
              );
            })}
            {quickList.length === 0 && (
              <>
                <p className="muted small">Once you log a repeatable task, such as an email, a post or a reel, it appears here for one-click starts. Common ones:</p>
                <div className="row" style={{ gap: 6 }}>
                  {quickTypes.map((t) => (
                    <StartButton key={t.id} className="btn sm" label={t.name}
                      prefill={{ work_type: t.eligibility === 'internal' ? 'internal' : 'external', entity_kind: t.eligibility === 'internal' ? null : 'client', category_id: t.category_id, task_type_id: t.id }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>In Progress</h2><p>Work you marked In Progress. Resume to keep going on the same task.</p></div></div>
          {open.length ? (
            <div className="table-wrap"><table className="data"><tbody>
              {open.slice(0, 8).map(({ last, seconds }) => {
                const d = describe(catalog, last);
                return (
                  <tr key={last.id}>
                    <td className="primary">{d.task}<span className="sub">{d.where} · last worked {fmtDate(laDate(last.started_at))}</span></td>
                    <td className="n nowrap">{duration(seconds)}</td>
                    <td style={{ width: 1 }}><ResumeButton entryId={last.id} /></td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : <div className="empty"><p>Nothing in progress. When you stop a timer on unfinished work, mark it In Progress and it waits here.</p></div>}
        </section>
      </div>
    </div>
  );
}
