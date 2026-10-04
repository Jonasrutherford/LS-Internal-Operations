'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useAction } from './useAction';
import { archiveBillingEvent, saveBillingEvent, saveContract } from '@/app/actions/admin';
import { BILLING_KIND_LABEL, CONTRACT_TYPE_LABEL, FREQUENCY_LABEL, monthlyEquivalent } from '@/lib/finance';
import { money } from '@/lib/format';
import { laDate } from '@/lib/time';
import type { BillingEvent, Client, Contract, PriceChange } from '@/lib/types';

export function ContractsAdmin({ contracts, clients, priceChanges }: { contracts: Contract[]; clients: Client[]; priceChanges: PriceChange[] }) {
  const [edit, setEdit] = useState<Partial<Contract> | null>(null);
  const [bill, setBill] = useState<Partial<BillingEvent> | null>(null);
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Unknown';
  const sorted = [...contracts].sort((a, b) => (a.status === b.status ? name(a.client_id).localeCompare(name(b.client_id)) : a.status === 'active' ? -1 : 1));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <p className="muted" style={{ flex: 1 }}>One contract per client relationship. A price increase updates the same contract and keeps the old price in its history. A one-off project, hourly work or an extra charge is a billing event, not a new contract.</p>
        <button className="btn" onClick={() => setBill({ kind: 'additional_charge', status: 'invoiced', invoice_date: laDate() })}>Add billing</button>
        <button className="btn primary" onClick={() => setEdit({ type: 'retainer', billing_frequency: 'monthly', status: 'active', start_date: laDate(), included_services: [] })}>Add contract</button>
      </div>
      <section className="panel">
        {sorted.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Client</th><th>Type</th><th>Billing</th><th className="n">Amount</th><th className="n">Monthly equivalent</th><th>Start</th><th>Status</th><th /></tr></thead>
            <tbody>{sorted.map((c) => {
              const history = priceChanges.filter((p) => p.contract_id === c.id);
              return (
                <tr key={c.id} className={c.status === 'active' ? '' : 'dim'}>
                  <td className="primary">{name(c.client_id)}
                    {c.included_services.length > 0 && <span className="sub">{c.included_services.join(', ')}</span>}
                    {history.length > 0 && <span className="sub">Previously {history.map((h) => `${h.amount_per_billing != null ? money(Number(h.amount_per_billing)) : `${h.percent_commission}%`} until ${h.effective_date}`).join('; ')}</span>}
                  </td>
                  <td>{CONTRACT_TYPE_LABEL[c.type]}</td>
                  <td>{FREQUENCY_LABEL[c.billing_frequency]}</td>
                  <td className="n">{c.type === 'ad_commission' ? (c.percent_commission != null ? `${Number(c.percent_commission)}%` : <span className="tag warn">Rate not set</span>) : money(Number(c.amount_per_billing ?? 0))}</td>
                  <td className="n">{(() => { const m = monthlyEquivalent(c); return m == null ? <span className="muted">N/A</span> : money(m); })()}</td>
                  <td className="nowrap">{c.start_date}</td>
                  <td><span className={`tag ${c.status === 'active' ? 'good' : c.status === 'paused' ? 'warn' : ''}`}>{c.status === 'active' ? 'Active' : c.status === 'paused' ? 'Paused' : 'Ended'}</span></td>
                  <td className="nowrap" style={{ width: 1 }}>
                    <button className="btn ghost sm" onClick={() => setBill({ client_id: c.client_id, contract_id: c.id, kind: c.type === 'ad_commission' ? 'ad_commission' : c.type === 'hourly' ? 'hourly' : 'retainer', status: 'invoiced', invoice_date: laDate(), amount: c.amount_per_billing ?? undefined })}>Bill</button>
                    <button className="btn ghost sm" onClick={() => setEdit(c)}>Edit</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <div className="empty"><p>No contracts yet.</p></div>}
      </section>
      {edit && <ContractForm initial={edit} clients={clients} onClose={() => setEdit(null)} />}
      {bill && <BillingForm initial={bill} clients={clients} contracts={contracts} onClose={() => setBill(null)} />}
    </div>
  );
}

function ContractForm({ initial, clients, onClose }: { initial: Partial<Contract>; clients: Client[]; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({
    client_id: initial.client_id ?? '', type: initial.type ?? 'retainer', billing_frequency: initial.billing_frequency ?? 'monthly',
    amount: initial.amount_per_billing != null ? String(initial.amount_per_billing) : '', pct: initial.percent_commission != null ? String(initial.percent_commission) : '',
    start_date: initial.start_date ?? laDate(), status: initial.status ?? 'active', services: (initial.included_services ?? []).join(', '), notes: initial.notes ?? '',
    price_effective: laDate(), price_reason: '',
  });
  const commission = v.type === 'ad_commission';
  const priceChanged = !!initial.id && (commission ? String(initial.percent_commission ?? '') !== v.pct : String(initial.amount_per_billing ?? '') !== v.amount);
  return (
    <Modal title={initial.id ? 'Edit contract' : 'Add contract'} onClose={onClose} error={error}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveContract({
          id: initial.id, client_id: v.client_id, type: v.type, billing_frequency: v.billing_frequency,
          amount_per_billing: v.amount === '' ? null : Number(v.amount), percent_commission: v.pct === '' ? null : Number(v.pct),
          start_date: v.start_date, status: v.status, included_services: v.services.split(','), notes: v.notes,
          price_effective: v.price_effective, price_reason: v.price_reason,
        }), onClose)}>Save</button></>}>
      <label className="field"><span>Client</span>
        <select value={v.client_id} disabled={!!initial.id} onChange={(e) => setV({ ...v, client_id: e.target.value })}>
          <option value="">Choose a client</option>
          {clients.filter((c) => c.active || c.id === v.client_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Contract type</span>
          <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as Contract['type'] })}>
            {Object.entries(CONTRACT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        {!commission && (
          <label className="field"><span>Billing frequency</span>
            <select value={v.billing_frequency} onChange={(e) => setV({ ...v, billing_frequency: e.target.value as Contract['billing_frequency'] })}>
              {['monthly', 'quarterly', 'biannually', 'annually', 'one_off'].map((k) => <option key={k} value={k}>{FREQUENCY_LABEL[k]}</option>)}
            </select></label>
        )}
        {commission
          ? <label className="field"><span>Percent Commission</span><input type="number" min={0} max={100} step="0.1" value={v.pct} onChange={(e) => setV({ ...v, pct: e.target.value })} placeholder="e.g. 10" /></label>
          : <label className="field"><span>{v.type === 'hourly' ? 'Hourly rate' : v.type === 'per_unit' ? 'Price per deliverable' : 'Amount per billing'}</span><input type="number" min={0} step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></label>}
        <label className="field"><span>Start date</span><input type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></label>
      </div>
      {priceChanged && (
        <div className="panel pad" style={{ background: 'var(--panel-2)', display: 'grid', gap: 10 }}>
          <b className="small">Price change. The old price is kept in the contract&apos;s history.</b>
          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field"><span>Effective from</span><input type="date" value={v.price_effective} onChange={(e) => setV({ ...v, price_effective: e.target.value })} /></label>
            <label className="field"><span>Reason</span><input type="text" value={v.price_reason} onChange={(e) => setV({ ...v, price_reason: e.target.value })} placeholder="Annual increase" /></label>
          </div>
        </div>
      )}
      <label className="field"><span>Included services <span className="hint">comma separated, optional</span></span><input type="text" value={v.services} onChange={(e) => setV({ ...v, services: e.target.value })} placeholder="Email, Social, Paid ads" /></label>
      <div className="field"><span>Status</span><div className="seg">
        {(['active', 'paused', 'ended'] as const).map((s) => <button key={s} type="button" aria-pressed={v.status === s} onClick={() => setV({ ...v, status: s })}>{s[0].toUpperCase() + s.slice(1)}</button>)}
      </div></div>
      <label className="field"><span>Notes</span><input type="text" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  );
}

export function BillingForm({ initial, clients, contracts, onClose }: { initial: Partial<BillingEvent>; clients: Client[]; contracts: Contract[]; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({
    client_id: initial.client_id ?? '', contract_id: initial.contract_id ?? '', kind: initial.kind ?? 'additional_charge', status: initial.status ?? 'invoiced',
    amount: initial.amount != null ? String(initial.amount) : '', invoice_date: initial.invoice_date ?? laDate(), paid_date: initial.paid_date ?? '',
    hours: initial.hours != null ? String(initial.hours) : '', rate: initial.rate != null ? String(initial.rate) : '', description: initial.description ?? '',
  });
  const forClient = contracts.filter((c) => c.client_id === v.client_id);
  const other = v.kind === 'other_income';
  const hourly = v.kind === 'hourly';
  return (
    <Modal title={initial.id ? 'Edit billing' : 'Add billing'} onClose={onClose} error={error}
      footer={<>
        {initial.id && <button className="btn ghost danger" disabled={busy} onClick={() => { if (confirm('Remove this billing event?')) run(() => archiveBillingEvent(initial.id!), onClose); }}>Remove</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveBillingEvent({
          id: initial.id, client_id: other ? null : v.client_id, contract_id: other ? null : v.contract_id || null, kind: v.kind, status: v.status,
          amount: Number(v.amount), invoice_date: v.invoice_date, paid_date: v.paid_date || null,
          hours: hourly && v.hours ? Number(v.hours) : null, rate: hourly && v.rate ? Number(v.rate) : null, description: v.description,
        }), onClose)}>Save</button></>}>
      <label className="field"><span>Kind</span>
        <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as BillingEvent['kind'] })}>
          {Object.entries(BILLING_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="hint">{other ? 'Income that is not client work, such as a bank bonus. It is kept out of client analytics.' : 'Bills against an existing relationship. No new contract is created.'}</span>
      </label>
      {!other && (
        <div className="grid-2" style={{ gap: 12 }}>
          <label className="field"><span>Client</span>
            <select value={v.client_id} onChange={(e) => setV({ ...v, client_id: e.target.value, contract_id: '' })}>
              <option value="">Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (former)'}</option>)}
            </select></label>
          <label className="field"><span>Contract <span className="hint">optional</span></span>
            <select value={v.contract_id} onChange={(e) => setV({ ...v, contract_id: e.target.value })}>
              <option value="">None</option>
              {forClient.map((c) => <option key={c.id} value={c.id}>{CONTRACT_TYPE_LABEL[c.type]} · {FREQUENCY_LABEL[c.billing_frequency]}</option>)}
            </select></label>
        </div>
      )}
      {hourly && (
        <div className="grid-2" style={{ gap: 12 }}>
          <label className="field"><span>Hours</span><input type="number" min={0} step="0.25" value={v.hours} onChange={(e) => { const h = e.target.value; setV({ ...v, hours: h, amount: h && v.rate ? String(Math.round(Number(h) * Number(v.rate) * 100) / 100) : v.amount }); }} /></label>
          <label className="field"><span>Rate</span><input type="number" min={0} step="0.01" value={v.rate} onChange={(e) => { const r = e.target.value; setV({ ...v, rate: r, amount: r && v.hours ? String(Math.round(Number(v.hours) * Number(r) * 100) / 100) : v.amount }); }} /></label>
        </div>
      )}
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Amount</span><input type="number" min={0} step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></label>
        <label className="field"><span>Invoice date</span><input type="date" value={v.invoice_date} onChange={(e) => setV({ ...v, invoice_date: e.target.value })} /></label>
      </div>
      <div className="field"><span>Status</span><div className="seg">
        {(['invoiced', 'paid', 'scheduled', 'written_off'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={v.status === s} onClick={() => setV({ ...v, status: s, paid_date: s === 'paid' ? v.paid_date || v.invoice_date : '' })}>
            {s === 'invoiced' ? 'Invoiced, unpaid' : s === 'paid' ? 'Paid' : s === 'scheduled' ? 'Scheduled' : 'Written off'}</button>
        ))}
      </div></div>
      {v.status === 'paid' && <label className="field"><span>Paid on</span><input type="date" value={v.paid_date} onChange={(e) => setV({ ...v, paid_date: e.target.value })} style={{ maxWidth: 200 }} /></label>}
      <label className="field"><span>Description</span><input type="text" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="October retainer, landing page project" /></label>
      {v.amount && <p className="muted small">{money(Number(v.amount), true)} {v.status === 'paid' ? 'counts as revenue on the paid date' : v.status === 'invoiced' ? 'shows as receivable until it is marked paid' : ''}.</p>}
    </Modal>
  );
}
