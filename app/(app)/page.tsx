import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePerson } from '@/lib/auth';
import { entrySeconds, formatHours } from '@/lib/finance';
import { one } from '@/lib/rel';

export const dynamic = 'force-dynamic';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const startOfWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Dashboard answers one question: what do I need to know right now. It summarises
 *  the other pages rather than duplicating them, section 30. */
export default async function DashboardPage() {
  const me = await requirePerson();
  const supabase = await createClient();

  const weekStart = startOfWeek();

  const [mineRes, timerRes, openRes, companyRes] = await Promise.all([
    supabase.from('time_entries')
      .select('started_at, ended_at, paused_seconds')
      .eq('person_id', me.id).gte('started_at', weekStart),
    supabase.from('timers')
      .select('*, clients(name), task_types(name)').eq('person_id', me.id).maybeSingle(),
    supabase.from('time_entries')
      .select('id, custom_task_name, started_at, clients(name), task_types(name)')
      .eq('person_id', me.id).eq('completed', false).not('ended_at', 'is', null)
      .order('started_at', { ascending: false }).limit(5),
    supabase.from('time_entries')
      .select('started_at, ended_at, paused_seconds, scope')
      .gte('started_at', weekStart),
  ]);

  const mine = mineRes.data ?? [];
  const today = startOfToday();

  const todaySeconds = mine
    .filter((e) => e.started_at >= today)
    .reduce((a, e) => a + entrySeconds(e.started_at, e.ended_at, e.paused_seconds), 0);
  const weekSeconds = mine
    .reduce((a, e) => a + entrySeconds(e.started_at, e.ended_at, e.paused_seconds), 0);

  const company = companyRes.data ?? [];
  const companySeconds = company
    .reduce((a, e) => a + entrySeconds(e.started_at, e.ended_at, e.paused_seconds), 0);
  const externalSeconds = company.filter((e) => e.scope === 'external')
    .reduce((a, e) => a + entrySeconds(e.started_at, e.ended_at, e.paused_seconds), 0);

  const timer = timerRes.data;
  const open = openRes.data ?? [];

  const tile = (label: string, value: string, note?: string) => (
    <div className="panel" style={{ padding: '13px 15px' }}>
      <div className="eyebrow">{label}</div>
      <div className="num" style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 600, marginTop: 3 }}>
        {value}
      </div>
      {note && <div className="muted" style={{ fontSize: 12 }}>{note}</div>}
    </div>
  );

  return (
    <>
      <header style={{ marginBottom: 18 }}>
        <div className="eyebrow">Work</div>
        <h1>Dashboard</h1>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {tile('Today', formatHours(todaySeconds))}
        {tile('This week', formatHours(weekSeconds))}
        {tile('Company this week', formatHours(companySeconds),
          companySeconds
            ? `${Math.round((externalSeconds / companySeconds) * 100)}% external`
            : 'No time logged yet')}
        {tile('Open tasks', String(open.length), open.length ? 'Not marked completed' : 'Nothing outstanding')}
      </div>

      <section style={{ marginTop: 22 }}>
        <h2>Current task</h2>
        <div className="panel" style={{ padding: 15, marginTop: 8 }}>
          {timer ? (
            <>
              <b style={{ fontFamily: 'var(--f-display)', fontSize: 15 }}>
                {timer.custom_task_name ?? one(timer.task_types)?.name}
              </b>
              <div className="muted">
                {timer.scope === 'external' ? one(timer.clients)?.name : 'Internal'}
                {timer.paused_at ? ' · paused' : ' · running'}
              </div>
              <Link href="/time-log" style={{ color: 'var(--accent)', fontSize: 13 }}>
                Go to Time Log
              </Link>
            </>
          ) : (
            <div className="muted">
              Nothing running. <Link href="/time-log" style={{ color: 'var(--accent)' }}>Start a task</Link>.
            </div>
          )}
        </div>
      </section>

      {open.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2>Your open work</h2>
          <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
            <table>
              <thead>
                <tr><th>Task</th><th>Client</th><th>Last worked</th></tr>
              </thead>
              <tbody>
                {open.map((e) => (
                  <tr key={e.id}>
                    <td>{e.custom_task_name ?? one(e.task_types)?.name}</td>
                    <td>{one(e.clients)?.name ?? <span className="muted">Internal</span>}</td>
                    <td className="mono">
                      {new Date(e.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
