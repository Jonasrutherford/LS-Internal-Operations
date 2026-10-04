'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useAction } from './useAction';
import { convertProspect, saveClient, savePartner, savePerson, saveProspect } from '@/app/actions/admin';
import type { Client, Partner, Person, Prospect } from '@/lib/types';

const Activity = ({ n }: { n: number }) => <span className="muted small">{n ? `${n} logged hours` : 'No time logged'}</span>;

export function ClientsAdmin({ clients, hours }: { clients: Client[]; hours: Record<string, number> }) {
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const active = clients.filter((c) => c.active);
  const former = clients.filter((c) => !c.active);
  const Table = ({ list }: { list: Client[] }) => (
    <div className="table-wrap"><table className="data">
      <thead><tr><th>Client</th><th>Client since</th><th>Brand color</th><th className="n">Hours</th><th /></tr></thead>
      <tbody>{list.map((c) => (
        <tr key={c.id}>
          <td className="primary">{c.name}{c.notes && <span className="sub">{c.notes}</span>}</td>
          <td>{c.client_since ?? <span className="muted">Not set</span>}</td>
          <td>{c.brand_color ? <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: c.brand_color, width: 14, height: 14 }} />{c.brand_color}</span> : <span className="muted">None</span>}</td>
          <td className="n"><Activity n={Math.round(hours[c.id] ?? 0)} /></td>
          <td style={{ width: 1 }}><button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><p className="muted" style={{ flex: 1 }}>Paying clients only. Prospects and partners have their own lists, and Lucid Studio itself is never a client: internal work is logged as Internal.</p>
        <button className="btn primary" onClick={() => setEdit({ active: true })}>Add client</button></div>
      <section className="panel"><div className="panel-head"><h2>Active clients</h2></div>{active.length ? <Table list={active} /> : <div className="empty"><p>No active clients.</p></div>}</section>
      {former.length > 0 && <section className="panel"><div className="panel-head"><div><h2>Former clients</h2><p>Hidden from logging. Their revenue and time history stays attributable.</p></div></div><Table list={former} /></section>}
      {edit && <ClientForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ClientForm({ initial, onClose }: { initial: Partial<Client>; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({ name: initial.name ?? '', active: initial.active ?? true, brand_color: initial.brand_color ?? '', brand_color_dark: initial.brand_color_dark ?? '', client_since: initial.client_since ?? '', notes: initial.notes ?? '' });
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'Add client'} onClose={onClose} error={error}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveClient({ id: initial.id, ...v }), onClose)}>Save</button></>}>
      <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Client since</span><input type="date" value={v.client_since} onChange={(e) => setV({ ...v, client_since: e.target.value })} /></label>
        <label className="field"><span>Brand color <span className="hint">used in client charts</span></span>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="color" value={v.brand_color || '#19169a'} onChange={(e) => setV({ ...v, brand_color: e.target.value })} style={{ width: 44, height: 40, padding: 2, border: '1px solid var(--line-2)', borderRadius: 8 }} />
            <input type="text" value={v.brand_color} placeholder="None" onChange={(e) => setV({ ...v, brand_color: e.target.value })} />
          </div></label>
      </div>
      <label className="field"><span>Notes</span><input type="text" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active <span className="hint">inactive clients leave the logging pickers</span></label>
    </Modal>
  );
}

export function ProspectsAdmin({ prospects, hours }: { prospects: Prospect[]; hours: Record<string, number> }) {
  const [edit, setEdit] = useState<Partial<Prospect> | null>(null);
  const { run, busy, error } = useAction();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><p className="muted" style={{ flex: 1 }}>Potential clients. Sales time can be logged against a named prospect or as general prospecting. When one signs, convert it: a client is created and the pipeline history stays.</p>
        <button className="btn primary" onClick={() => setEdit({ active: true, stage: 'open' })}>Add prospect</button></div>
      {error && <div className="notice crit">{error}</div>}
      <section className="panel">
        {prospects.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Prospect</th><th>Source</th><th>Stage</th><th className="n">Hours</th><th /></tr></thead>
            <tbody>{prospects.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'dim'}>
                <td className="primary">{p.name}{p.company && <span className="sub">{p.company}</span>}</td>
                <td>{p.source ?? <span className="muted">Unknown</span>}</td>
                <td><span className={`tag ${p.stage === 'won' ? 'good' : p.stage === 'lost' ? 'crit' : 'navy'}`}>{p.stage === 'open' ? 'Open' : p.stage === 'won' ? 'Won' : 'Lost'}</span></td>
                <td className="n"><Activity n={Math.round(hours[p.id] ?? 0)} /></td>
                <td className="nowrap" style={{ width: 1 }}>
                  {p.stage === 'open' && <button className="btn sm" disabled={busy} onClick={() => { if (confirm(`Convert ${p.name} to a client?`)) run(() => convertProspect(p.id)); }}>Convert to client</button>}{' '}
                  <button className="btn ghost sm" onClick={() => setEdit(p)}>Edit</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><h3>No prospects yet</h3><p>Add the companies you are pursuing. Until then, sales time logs as general prospecting.</p></div>}
      </section>
      {edit && <ProspectForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProspectForm({ initial, onClose }: { initial: Partial<Prospect>; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({ name: initial.name ?? '', company: initial.company ?? '', source: initial.source ?? '', stage: initial.stage ?? 'open', notes: initial.notes ?? '', active: initial.active ?? true });
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'Add prospect'} onClose={onClose} error={error}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveProspect({ id: initial.id, ...v }), onClose)}>Save</button></>}>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="field"><span>Company <span className="hint">if different</span></span><input type="text" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} /></label>
        <label className="field"><span>Source</span><input type="text" value={v.source} placeholder="Referral, cold outreach, inbound" onChange={(e) => setV({ ...v, source: e.target.value })} /></label>
        <label className="field"><span>Stage</span><select value={v.stage} onChange={(e) => setV({ ...v, stage: e.target.value as Prospect['stage'] })}>
          <option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
      </div>
      <label className="field"><span>Notes</span><input type="text" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active</label>
    </Modal>
  );
}

export function PartnersAdmin({ partners, hours }: { partners: Partner[]; hours: Record<string, number> }) {
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><p className="muted" style={{ flex: 1 }}>Referral partners, agencies and vendors Lucid Studio builds relationships with. Partnership work logs against them.</p>
        <button className="btn primary" onClick={() => setEdit({ active: true })}>Add partner</button></div>
      <section className="panel">
        {partners.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Partner</th><th>Type</th><th className="n">Hours</th><th /></tr></thead>
            <tbody>{partners.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'dim'}>
                <td className="primary">{p.name}{p.notes && <span className="sub">{p.notes}</span>}</td>
                <td>{p.kind ?? <span className="muted">Not set</span>}</td>
                <td className="n"><Activity n={Math.round(hours[p.id] ?? 0)} /></td>
                <td style={{ width: 1 }}><button className="btn ghost sm" onClick={() => setEdit(p)}>Edit</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><h3>No partners yet</h3><p>Partnership time can still be logged as general partnership work.</p></div>}
      </section>
      {edit && <PartnerForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PartnerForm({ initial, onClose }: { initial: Partial<Partner>; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({ name: initial.name ?? '', kind: initial.kind ?? '', notes: initial.notes ?? '', active: initial.active ?? true });
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'Add partner'} onClose={onClose} error={error}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => savePartner({ id: initial.id, ...v }), onClose)}>Save</button></>}>
      <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="field"><span>Type</span><input type="text" value={v.kind} placeholder="Referral, agency, vendor" onChange={(e) => setV({ ...v, kind: e.target.value })} /></label>
      <label className="field"><span>Notes</span><input type="text" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active</label>
    </Modal>
  );
}

export function PeopleAdmin({ people, meId }: { people: Person[]; meId: string }) {
  const [edit, setEdit] = useState<Partial<Person> | null>(null);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><p className="muted" style={{ flex: 1 }}>Add a teammate with their lucidstudiollc.com address. They set their own password on first sign-in and are linked to this record automatically.</p>
        <button className="btn primary" onClick={() => setEdit({ active: true, role: 'employee' })}>Add teammate</button></div>
      <section className="panel"><div className="table-wrap"><table className="data">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="n">Weekly capacity</th><th>Sign-in</th><th /></tr></thead>
        <tbody>{people.map((p) => (
          <tr key={p.id} className={p.active ? '' : 'dim'}>
            <td className="primary">{p.name}{p.title && <span className="sub">{p.title}</span>}</td>
            <td>{p.email ?? <span className="muted">None</span>}</td>
            <td><span className={`tag ${p.role === 'admin' ? 'navy' : ''}`}>{p.role === 'admin' ? 'Admin' : 'Employee'}</span></td>
            <td className="n">{p.weekly_capacity_hours != null ? `${Number(p.weekly_capacity_hours)} h` : <span className="muted">Not set</span>}</td>
            <td>{p.auth_user_id ? <span className="tag good">Active account</span> : <span className="tag">Not signed up yet</span>}</td>
            <td style={{ width: 1 }}><button className="btn ghost sm" onClick={() => setEdit(p)}>Edit</button></td>
          </tr>
        ))}</tbody>
      </table></div></section>
      {edit && <PersonForm initial={edit} self={edit.id === meId} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PersonForm({ initial, self, onClose }: { initial: Partial<Person>; self: boolean; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({ name: initial.name ?? '', email: initial.email ?? '', role: initial.role ?? 'employee', title: initial.title ?? '', cap: initial.weekly_capacity_hours != null ? String(initial.weekly_capacity_hours) : '', active: initial.active ?? true });
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'Add teammate'} onClose={onClose} error={error}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => savePerson({ id: initial.id, name: v.name, email: v.email, role: v.role, title: v.title, weekly_capacity_hours: v.cap === '' ? null : Number(v.cap), active: v.active }), onClose)}>Save</button></>}>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="field"><span>Title</span><input type="text" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
        <label className="field"><span>Email</span><input type="email" value={v.email} disabled={!!initial.auth_user_id} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="name@lucidstudiollc.com" /></label>
        <label className="field"><span>Weekly capacity (hours)</span><input type="number" min={0} value={v.cap} onChange={(e) => setV({ ...v, cap: e.target.value })} /></label>
      </div>
      <div className="field"><span>Role</span>
        <div className="seg">
          <button type="button" aria-pressed={v.role === 'employee'} disabled={self} onClick={() => setV({ ...v, role: 'employee' })}>Employee</button>
          <button type="button" aria-pressed={v.role === 'admin'} onClick={() => setV({ ...v, role: 'admin' })}>Admin</button>
        </div>
        <span className="hint">Admins see Finances and System Admin and can correct anyone&apos;s time.{self ? ' You cannot remove your own admin role.' : ''}</span>
      </div>
      {!self && <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active <span className="hint">inactive people cannot sign in</span></label>}
    </Modal>
  );
}
