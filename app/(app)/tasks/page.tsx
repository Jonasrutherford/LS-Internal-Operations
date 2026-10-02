import { createClient } from '@/lib/supabase/server';
import { requirePerson } from '@/lib/auth';
import { one } from '@/lib/rel';

export const dynamic = 'force-dynamic';

/** Open Work, section 29. Work anyone can pick up, kept off the personal dashboard
 *  so the dashboard stays useful rather than stressful, section 56. */
export default async function TasksPage() {
  const me = await requirePerson();
  const supabase = await createClient();

  const { data } = await supabase
    .from('time_entries')
    .select('id, custom_task_name, started_at, person_id, clients(name), task_types(name), people(name)')
    .eq('completed', false)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const mine = rows.filter((r) => r.person_id === me.id);
  const others = rows.filter((r) => r.person_id !== me.id);

  const table = (list: typeof rows, label: string, empty: string) => (
    <section style={{ marginTop: 20 }}>
      <h2>{label}</h2>
      <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
        <table>
          <thead>
            <tr><th>Task</th><th>Client</th><th>Owner</th><th>Last worked</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={4} className="muted" style={{ padding: 20, textAlign: 'center' }}>{empty}</td></tr>
            )}
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.custom_task_name ?? one(r.task_types)?.name}</td>
                <td>{one(r.clients)?.name ?? <span className="muted">Internal</span>}</td>
                <td>{one(r.people)?.name}</td>
                <td className="mono">
                  {new Date(r.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      <header><div className="eyebrow">Work</div><h1>Tasks</h1></header>
      {table(mine, 'Yours to finish', 'Nothing of yours is left open.')}
      {table(others, 'Open across the team', 'Nothing open elsewhere.')}
    </>
  );
}
