import { createClient } from '@/lib/supabase/server';
import { requirePerson } from '@/lib/auth';
import { entrySeconds, formatHours } from '@/lib/finance';
import Timer from '@/components/Timer';
import type { Client, Person, TaskType, Timer as TimerRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TimeLogPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; client?: string; scope?: string }>;
}) {
  const me = await requirePerson();
  const filters = await searchParams;
  const supabase = await createClient();

  const [clientsRes, taskTypesRes, peopleRes, timerRes] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('task_types').select('*').order('name'),
    supabase.from('people').select('*').eq('active', true).order('name'),
    supabase.from('timers').select('*').eq('person_id', me.id).maybeSingle(),
  ]);

  let query = supabase
    .from('time_entries')
    .select('*, clients(name), task_types(name, unit), people(name)')
    .order('started_at', { ascending: false })
    .limit(200);

  // Admins filter across everyone. Employees land on their own work first.
  if (me.role === 'admin') {
    if (filters.person) query = query.eq('person_id', filters.person);
  } else {
    query = query.eq('person_id', me.id);
  }
  if (filters.client) query = query.eq('client_id', filters.client);
  if (filters.scope === 'internal' || filters.scope === 'external') {
    query = query.eq('scope', filters.scope);
  }

  const { data: entries } = await query;

  const clients = (clientsRes.data ?? []) as Client[];
  const taskTypes = (taskTypesRes.data ?? []) as TaskType[];
  const people = (peopleRes.data ?? []) as Person[];

  const rows = entries ?? [];
  const totalSeconds = rows.reduce(
    (a, e) => a + entrySeconds(e.started_at, e.ended_at, e.paused_seconds), 0,
  );

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <div className="eyebrow">Work</div>
        <h1>Time Log</h1>
      </header>

      <Timer
        timer={(timerRes.data as TimerRow) ?? null}
        clients={clients}
        taskTypes={taskTypes}
        people={people}
        me={me}
      />

      <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', margin: '22px 0 12px' }}>
        {me.role === 'admin' && (
          <label style={{ display: 'grid', gap: 5, minWidth: 160 }}>
            <span className="eyebrow">Person</span>
            <select name="person" defaultValue={filters.person ?? ''}>
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'grid', gap: 5, minWidth: 160 }}>
          <span className="eyebrow">Client</span>
          <select name="client" defaultValue={filters.client ?? ''}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, minWidth: 140 }}>
          <span className="eyebrow">Type</span>
          <select name="scope" defaultValue={filters.scope ?? ''}>
            <option value="">Internal and external</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
        </label>
        <button type="submit">Filter</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}, {formatHours(totalSeconds)}
        </span>
      </form>

      <div className="panel" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Started</th>
              {me.role === 'admin' && <th>Person</th>}
              <th>Type</th>
              <th>Client</th>
              <th>Task</th>
              <th style={{ textAlign: 'right' }}>Time</th>
              <th style={{ textAlign: 'right' }}>Units</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                  No time logged yet. Start a task above.
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const secs = entrySeconds(e.started_at, e.ended_at, e.paused_seconds);
              return (
                <tr key={e.id}>
                  <td className="mono">
                    {new Date(e.started_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                  {me.role === 'admin' && <td>{e.people?.name ?? ''}</td>}
                  <td style={{ textTransform: 'capitalize' }}>{e.scope}</td>
                  <td>{e.clients?.name ?? <span className="muted">Internal</span>}</td>
                  <td>
                    {e.custom_task_name ?? e.task_types?.name}
                    {e.joint && <span className="muted"> · joint</span>}
                    {e.contract_deliverable && <span className="muted"> · deliverable</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{formatHours(secs)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {e.unit_count != null
                      ? `${e.unit_count} ${e.task_types?.unit ?? ''}`
                      : <span className="muted">&mdash;</span>}
                  </td>
                  <td>
                    {e.ended_at
                      ? (e.completed ? 'Completed' : 'Open')
                      : 'Running'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
