import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadEntries } from '@/lib/data';
import { addDays, fmtDate, laDate, laTime } from '@/lib/time';
import { completedWorkItems, entrySeconds, openWork } from '@/lib/work';
import { describe } from '@/lib/describe';
import { duration, minutesLabel } from '@/lib/format';
import { unitLabel } from '@/lib/taxonomy';
import { ResumeButton } from '@/components/log/buttons';

export const metadata: Metadata = { title: 'Tasks' };

export default async function TasksPage() {
  const me = await requirePerson();
  const today = laDate();
  const [catalog, entries] = await Promise.all([loadCatalog(), loadEntries({ from: addDays(today, -90), to: today })]);
  const types = new Map(catalog.taskTypes.map((t) => [t.id, t]));

  const running = entries.filter((e) => !e.ended_at && !e.deleted);
  const open = openWork(entries);
  const done = completedWorkItems(entries, types).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, 25);
  const name = (id: string) => catalog.people.find((p) => p.id === id)?.name ?? 'Unknown';
  const mine = open.filter((o) => o.last.person_id === me.id);
  const others = open.filter((o) => o.last.person_id !== me.id);

  const OpenTable = ({ list, showPerson }: { list: typeof open; showPerson: boolean }) => (
    <div className="table-wrap"><table className="data">
      <thead><tr>{showPerson && <th>Person</th>}<th>Task</th><th>For</th><th className="n">Time so far</th><th>Last worked</th><th /></tr></thead>
      <tbody>
        {list.map(({ last, seconds }) => {
          const d = describe(catalog, last);
          const exp = d.taskType?.expected_minutes;
          const over = exp != null && !d.taskType?.has_deliverable && seconds / 60 > Number(exp);
          return (
            <tr key={last.id}>
              {showPerson && <td className="primary">{name(last.person_id)}</td>}
              <td className="primary">{d.task}<span className="sub">{d.category}</span></td>
              <td>{d.where}</td>
              <td className="n nowrap">{duration(seconds)}{exp != null && !d.taskType?.has_deliverable && <span className="sub" style={{ color: over ? 'var(--crit)' : undefined }}>of {minutesLabel(Number(exp))} expected</span>}</td>
              <td className="nowrap">{fmtDate(laDate(last.started_at))}</td>
              <td style={{ width: 1 }}>{last.person_id === me.id && <ResumeButton entryId={last.id} />}</td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Work</div>
          <h1>Tasks</h1>
          <p className="lede">What is being worked on right now, what is still open, and what was finished recently. Open work is anything whose latest session was marked In Progress.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>Running now</h2><p>Live timers across the team.</p></div></div>
        {running.length ? (
          <div className="table-wrap"><table className="data"><tbody>
            {running.map((e) => {
              const d = describe(catalog, e);
              return (
                <tr key={e.id}>
                  <td className="primary" style={{ width: 140 }}>{name(e.person_id)}</td>
                  <td className="primary">{d.task}<span className="sub">{d.where} · {d.category}</span></td>
                  <td className="nowrap muted">since {laTime(e.started_at)}{e.paused_at ? ' · paused' : ''}</td>
                  <td className="n strong nowrap">{duration(entrySeconds(e))}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        ) : <div className="empty"><p>No one has a timer running.</p></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Your open work</h2><p>Resume picks up the same task, client and category.</p></div></div>
        {mine.length ? <OpenTable list={mine} showPerson={false} /> : <div className="empty"><p>You have nothing open. Work marked In Progress when you stop a timer shows up here.</p></div>}
      </section>

      {others.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Team open work</h2></div></div>
          <OpenTable list={others} showPerson />
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>Recently finished</h2><p>Last 90 days. Actual time includes every session on the task.</p></div></div>
        {done.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Person</th><th>Task</th><th>For</th><th className="n">Actual</th><th className="n">Expected</th><th>Finished</th></tr></thead>
            <tbody>
              {done.map((w) => {
                const d = describe(catalog, w.entries[w.entries.length - 1]);
                const ratio = w.expectedMinutes ? w.actualSeconds / 60 / w.expectedMinutes - 1 : null;
                return (
                  <tr key={w.key + w.finishedAt}>
                    <td className="primary">{name(w.personId)}</td>
                    <td className="primary">{d.task}{w.qty ? <span className="sub">{w.qty} {unitLabel(d.taskType?.deliverable_unit ?? '', w.qty)}</span> : null}</td>
                    <td>{d.where}</td>
                    <td className="n nowrap">{duration(w.actualSeconds)}</td>
                    <td className="n nowrap">{w.expectedMinutes != null ? (
                      <>{minutesLabel(w.expectedMinutes)} <span className={`tag ${ratio! > 0.15 ? 'crit' : ratio! < -0.15 ? 'good' : ''}`}>{ratio! >= 0 ? '+' : ''}{Math.round(ratio! * 100)}%</span></>
                    ) : <span className="muted">Not set</span>}</td>
                    <td className="nowrap">{fmtDate(laDate(w.finishedAt))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <div className="empty"><p>Finished work appears here with its actual time against the expected time.</p></div>}
      </section>
    </div>
  );
}
