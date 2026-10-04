import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { loadAudit, loadCatalog, loadEntries, loadFinance, loadUsage } from '@/lib/data';
import { EPOCH, laDate } from '@/lib/time';
import { counts, entrySeconds } from '@/lib/work';
import TaxonomyAdmin from '@/components/admin/TaxonomyAdmin';
import { ClientsAdmin, PartnersAdmin, PeopleAdmin, ProspectsAdmin } from '@/components/admin/EntitiesAdmin';
import { ContractsAdmin } from '@/components/admin/ContractsAdmin';
import ImportPanel from '@/components/admin/ImportPanel';

export const metadata: Metadata = { title: 'System Admin' };

const TABS = [
  ['clients', 'Clients'], ['prospects', 'Prospects'], ['partners', 'Partners'], ['taxonomy', 'Task Taxonomy'],
  ['contracts', 'Contracts'], ['team', 'Team'], ['changes', 'Change Log'], ['import', 'Data Import'],
] as const;

const FIELD_LABEL: Record<string, string> = {
  created: 'Created', deleted: 'Removed', started_at: 'Start', ended_at: 'End', category_id: 'Category', task_type_id: 'Task',
  client_id: 'Client', expected_minutes: 'Expected time', amount_per_billing: 'Amount', percent_commission: 'Percent',
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireAdmin();
  const asked = (await searchParams).tab;
  const tab = TABS.some(([k]) => k === asked) ? asked! : 'taxonomy';
  const catalog = await loadCatalog();

  let body: React.ReactNode = null;
  if (tab === 'taxonomy') {
    const u = await loadUsage();
    const custom = new Map<string, { name: string; category_id: string; count: number; last: string }>();
    for (const c of u.custom) {
      const k = `${c.category_id}|${c.name.trim().toLowerCase()}`;
      const prev = custom.get(k);
      custom.set(k, { name: prev?.name ?? c.name.trim(), category_id: c.category_id, count: (prev?.count ?? 0) + 1, last: prev && prev.last > c.started_at ? prev.last : c.started_at });
    }
    body = <TaxonomyAdmin categories={catalog.categories} taskTypes={catalog.taskTypes}
      usage={{ byType: Object.fromEntries(u.byType), byCat: Object.fromEntries(u.byCat), custom: [...custom.values()].sort((a, b) => b.count - a.count) }} />;
  } else if (tab === 'clients' || tab === 'prospects' || tab === 'partners') {
    const entries = (await loadEntries({ from: EPOCH, to: laDate() })).filter(counts);
    const hrs: Record<string, number> = {};
    for (const e of entries) {
      const id = e.client_id ?? e.prospect_id ?? e.partner_id;
      if (id) hrs[id] = (hrs[id] ?? 0) + entrySeconds(e) / 3600;
    }
    body = tab === 'clients' ? <ClientsAdmin clients={catalog.clients} hours={hrs} />
      : tab === 'prospects' ? <ProspectsAdmin prospects={catalog.prospects} hours={hrs} />
        : <PartnersAdmin partners={catalog.partners} hours={hrs} />;
  } else if (tab === 'contracts') {
    const fin = await loadFinance();
    body = <ContractsAdmin contracts={fin.contracts} clients={catalog.clients} priceChanges={fin.priceChanges} />;
  } else if (tab === 'team') {
    body = <PeopleAdmin people={catalog.people} meId={me.id} />;
  } else if (tab === 'import') {
    body = <ImportPanel />;
  } else {
    const rows = await loadAudit(400);
    const who = (id: string | null) => catalog.people.find((p) => p.id === id)?.name ?? 'System';
    const lookup = (v: string | null) => {
      if (!v) return '';
      const raw = v.replace(/^"|"$/g, '');
      return catalog.taskTypes.find((t) => t.id === raw)?.name ?? catalog.categories.find((c) => c.id === raw)?.name
        ?? catalog.clients.find((c) => c.id === raw)?.name ?? (raw.length > 80 ? raw.slice(0, 80) + '…' : raw);
    };
    body = (
      <section className="panel">
        {rows.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>When</th><th>Who</th><th>Record</th><th>Change</th><th>Reason</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap small">{new Date(r.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="primary">{who(r.person_id)}</td>
                <td>{r.table_name.replace(/_/g, ' ')}</td>
                <td className="small">{FIELD_LABEL[r.field ?? ''] ?? r.field}{r.before_value != null || r.after_value != null ? <>: <span className="muted">{lookup(r.before_value)}</span>{r.before_value != null && ' → '}{lookup(r.after_value)}</> : null}</td>
                <td className="small muted">{r.reason}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><p>No changes recorded yet. Every edit to money, the taxonomy, or someone else&apos;s time appears here.</p></div>}
      </section>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">System</div>
          <h1>System Admin</h1>
          <p className="lede">The reference data everything else depends on: relationships, the work taxonomy, contracts and the team. Nothing referenced by history is ever deleted, only archived.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="System Admin sections">
        {TABS.map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {body}
    </div>
  );
}
