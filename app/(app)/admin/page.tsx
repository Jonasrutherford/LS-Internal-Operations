import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import type { Client, Person, TaskType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Clients, task types and administrative configuration, section 37.
 *  requireAdmin here, plus admin-only write policies in the database. */
export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [clientsRes, taskTypesRes, peopleRes] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('task_types').select('*').order('scope').order('name'),
    supabase.from('people').select('*').order('name'),
  ]);

  const clients = (clientsRes.data ?? []) as Client[];
  const taskTypes = (taskTypesRes.data ?? []) as TaskType[];
  const people = (peopleRes.data ?? []) as Person[];

  return (
    <>
      <header><div className="eyebrow">System</div><h1>System Admin</h1></header>

      <section style={{ marginTop: 20 }}>
        <h2>Clients</h2>
        <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Client</th><th>Status</th><th>Brand colour</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.active ? 'Active' : 'Inactive'}</td>
                  <td>{c.brand_color ?? <span className="muted">Not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Task types</h2>
        <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Task</th><th>Scope</th><th>Unit</th><th>Quick start</th></tr></thead>
            <tbody>
              {taskTypes.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{t.scope}</td>
                  <td>{t.unit ?? <span className="muted">No unit</span>}</td>
                  <td>{t.quick_start ? 'Yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>People</h2>
        <div className="panel" style={{ marginTop: 8, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Name</th><th>Access</th><th>Status</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.role}</td>
                  <td>{p.active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
