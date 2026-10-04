import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadEntries } from '@/lib/data';
import { fmtDate, laDate, laTime, resolveRange } from '@/lib/time';
import { counts, entrySeconds } from '@/lib/work';
import { describe } from '@/lib/describe';
import { duration, hours, minutesLabel, REL_LABEL } from '@/lib/format';
import { categoriesForFilter, expectedMinutes, unitLabel } from '@/lib/taxonomy';
import { ParamSelect, ParamSeg, RangePicker } from '@/components/controls';
import { EditButton, PastButton } from '@/components/log/buttons';
import type { TimeEntry, WorkType } from '@/lib/types';
import s from './timelog.module.css';

export const metadata: Metadata = { title: 'Time Log' };

type SP = Record<string, string | undefined>;

export default async function TimeLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePerson();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'month');
  const wt = (sp.wt === 'internal' || sp.wt === 'external' ? sp.wt : 'all') as WorkType | 'all';

  const [catalog, all] = await Promise.all([loadCatalog(), loadEntries(range)]);
  const isAdmin = me.role === 'admin';

  const rows = all.filter((e) => {
    if (sp.person && e.person_id !== sp.person) return false;
    if (wt !== 'all' && e.work_type !== wt) return false;
    if (sp.client && e.client_id !== sp.client) return false;
    if (sp.prospect && e.prospect_id !== sp.prospect) return false;
    if (sp.category && e.category_id !== sp.category) return false;
    if (sp.task && e.task_type_id !== sp.task) return false;
    if (sp.status === 'running' && e.ended_at) return false;
    if ((sp.status === 'finished' || sp.status === 'in_progress') && (e.status !== sp.status || !e.ended_at)) return false;
    return true;
  });

  const counted = rows.filter(counts);
  const totalSecs = counted.reduce((a, e) => a + entrySeconds(e), 0);
  const extSecs = counted.filter((e) => e.work_type === 'external').reduce((a, e) => a + entrySeconds(e), 0);
  const deliverables = counted.reduce((a, e) => a + (e.deliverable_qty ?? 0), 0);

  // Filter options follow the work type: Internal never offers clients or external categories.
  const cats = categoriesForFilter(catalog.categories, wt);
  const tasks = catalog.taskTypes
    .filter((t) => (!sp.category || t.category_id === sp.category) && cats.some((c) => c.id === t.category_id))
    .filter((t) => wt === 'all' || t.eligibility === 'both' || t.eligibility === wt);

  const byDay = new Map<string, TimeEntry[]>();
  for (const e of rows) {
    const d = laDate(e.started_at);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const shown = [...byDay.entries()].slice(0, 120);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Work</div>
          <h1>Time Log</h1>
          <p className="lede">Every session the team has logged. {isAdmin ? 'Admins can correct any entry; every change is recorded.' : 'You can edit your own entries.'}</p>
        </div>
        <div className="actions"><PastButton /></div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <RangePicker value={range.key} from={range.from} to={range.to} keys={['today', 'week', 'month', 'last_month', '90d', 'ytd', 'custom']} />
        <div className="toolbar">
          <ParamSelect name="person" label="Person" value={sp.person ?? ''} allLabel="Everyone"
            options={catalog.people.map((p) => ({ value: p.id, label: p.name }))} />
          <ParamSeg name="wt" value={wt === 'all' ? '' : wt} clears={['client', 'prospect', 'category', 'task']}
            options={[{ value: '', label: 'All work' }, { value: 'internal', label: 'Internal' }, { value: 'external', label: 'External' }]} />
          {wt !== 'internal' && (
            <ParamSelect name="client" label="Client" value={sp.client ?? ''} allLabel="All clients" clears={['prospect']}
              options={catalog.clients.map((c) => ({ value: c.id, label: c.name, group: c.active ? 'Active' : 'Former' }))} />
          )}
          {wt !== 'internal' && catalog.prospects.length > 0 && (
            <ParamSelect name="prospect" label="Prospect" value={sp.prospect ?? ''} allLabel="All prospects" clears={['client']}
              options={catalog.prospects.map((p) => ({ value: p.id, label: p.name }))} />
          )}
          <ParamSelect name="category" label="Category" value={sp.category ?? ''} allLabel="All categories" clears={['task']}
            options={cats.map((c) => ({ value: c.id, label: c.name, group: c.eligibility === 'internal' ? 'Internal' : c.eligibility === 'external' ? 'External' : 'Both' }))} />
          <ParamSelect name="task" label="Task" value={sp.task ?? ''} allLabel="All tasks"
            options={tasks.map((t) => ({ value: t.id, label: t.name }))} />
          <ParamSelect name="status" label="Status" value={sp.status ?? ''} allLabel="Any status"
            options={[{ value: 'finished', label: 'Finished' }, { value: 'in_progress', label: 'In Progress' }, { value: 'running', label: 'Running now' }]} />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Logged</div><div className="value">{hours(totalSecs)}</div><div className="sub">{range.label}</div></div>
        <div className="kpi"><div className="label">Entries</div><div className="value">{counted.length}</div><div className="sub">{rows.length - counted.length ? `${rows.length - counted.length} running or parallel` : 'all closed'}</div></div>
        <div className="kpi"><div className="label">External share</div><div className="value">{totalSecs ? `${Math.round((extSecs / totalSecs) * 100)}%` : 'N/A'}</div><div className="sub">{hours(extSecs)} external</div></div>
        <div className="kpi"><div className="label">Deliverables</div><div className="value">{deliverables}</div><div className="sub">units recorded</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="panel"><div className="empty"><h3>No entries match</h3><p>Try a wider date range or clear a filter. Time logged from October 1, 2026 onward appears here as soon as it is saved.</p></div></div>
      ) : (
        <div className="panel">
          {shown.map(([day, list]) => {
            const daySecs = list.filter(counts).reduce((a, e) => a + entrySeconds(e), 0);
            return (
              <section key={day} className={s.day}>
                <div className={s.dayHead}>
                  <b>{fmtDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}</b>
                  <span className="num">{duration(daySecs)}</span>
                </div>
                {list.map((e) => {
                  const d = describe(catalog, e);
                  const person = catalog.people.find((p) => p.id === e.person_id)?.name ?? 'Unknown';
                  const secs = entrySeconds(e);
                  const exp = expectedMinutes(d.taskType, e.deliverable_qty);
                  const partners = (e.participants ?? []).map((id) => catalog.people.find((p) => p.id === id)?.name).filter(Boolean);
                  const parent = e.parallel_of ? all.find((x) => x.id === e.parallel_of) : null;
                  return (
                    <details key={e.id} className={s.entry}>
                      <summary className={s.row}>
                        <span className={s.time}>{laTime(e.started_at)}{e.ended_at ? `–${laTime(e.ended_at)}` : ''}</span>
                        <span className={s.who}>{person}</span>
                        <span className={s.task}>
                          <b>{d.task}</b>
                          <span>{d.where} · {d.category}{e.deliverable_qty ? ` · ${e.deliverable_qty} ${unitLabel(d.taskType?.deliverable_unit ?? '', e.deliverable_qty)}` : ''}</span>
                        </span>
                        <span className={s.tags}>
                          <span className={`tag ${e.work_type === 'internal' ? 'int' : 'ext'}`}>{e.work_type === 'internal' ? 'Internal' : 'External'}</span>
                          {!e.ended_at ? <span className="tag warn">Running</span> : e.status === 'finished' ? <span className="tag good">Finished</span> : <span className="tag">In Progress</span>}
                          {e.parallel_of && <span className="tag">Parallel</span>}
                          {e.joint && <span className="tag navy">Joint</span>}
                          {d.custom && <span className="tag warn">Unlisted task</span>}
                        </span>
                        <span className={s.dur}>{duration(secs)}</span>
                      </summary>
                      <div className={s.detail}>
                        <dl>
                          <div><dt>Revenue relationship</dt><dd>{e.revenue_relationship ? REL_LABEL[e.revenue_relationship] : 'N/A'}</dd></div>
                          <div><dt>Expected</dt><dd>{exp != null ? minutesLabel(exp) : 'Not set'}</dd></div>
                          <div><dt>Actual</dt><dd>{minutesLabel(secs / 60)}{e.paused_seconds ? ` (paused ${duration(e.paused_seconds)})` : ''}</dd></div>
                          <div><dt>Contract deliverable</dt><dd>{e.contract_deliverable ? 'Yes' : 'No'}</dd></div>
                          <div><dt>AI assisted</dt><dd>{e.ai_assisted ? 'Yes' : 'No'}</dd></div>
                          {partners.length > 0 && <div><dt>Joint with</dt><dd>{partners.join(', ')}</dd></div>}
                          {parent && <div><dt>Parallel to</dt><dd>{describe(catalog, parent).task}</dd></div>}
                          <div><dt>Source</dt><dd>{e.source === 'timer' ? 'Timer' : e.source === 'manual' ? 'Logged after the fact' : 'Imported'}</dd></div>
                        </dl>
                        {e.ended_at && (isAdmin || e.person_id === me.id) && <EditButton entry={e} className="btn sm">Edit entry</EditButton>}
                      </div>
                    </details>
                  );
                })}
              </section>
            );
          })}
          {byDay.size > shown.length && <div className="panel-foot">Showing the latest {shown.length} days. Narrow the range to see more.</div>}
        </div>
      )}
    </div>
  );
}
