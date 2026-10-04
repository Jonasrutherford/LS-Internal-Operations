'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useAction } from '@/components/admin/useAction';
import { BillingForm } from '@/components/admin/ContractsAdmin';
import { archiveExpense, saveExpense, saveGoal } from '@/app/actions/admin';
import { BILLING_KIND_LABEL, EXPENSE_CATEGORY_LABEL } from '@/lib/finance';
import { money } from '@/lib/format';
import { fmtDate, laDate } from '@/lib/time';
import type { BillingEvent, Client, Contract, Expense } from '@/lib/types';

export function AddBillingButton({ clients, contracts, label = 'Add billing', className = 'btn primary' }: { clients: Client[]; contracts: Contract[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button className={className} onClick={() => setOpen(true)}>{label}</button>
    {open && <BillingForm initial={{ kind: 'additional_charge', status: 'paid', invoice_date: laDate() }} clients={clients} contracts={contracts} onClose={() => setOpen(false)} />}
  </>);
}

export function BillingTable({ events, clients, contracts }: { events: BillingEvent[]; clients: Client[]; contracts: Contract[] }) {
  const [edit, setEdit] = useState<BillingEvent | null>(null);
  const name = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? 'Unknown' : 'Lucid Studio');
  if (!events.length) return <div className="empty"><p>No billing in this range.</p></div>;
  return (<>
    <div className="table-wrap"><table className="data">
      <thead><tr><th>Date</th><th>Client</th><th>Kind</th><th>Description</th><th>Status</th><th className="n">Amount</th><th /></tr></thead>
      <tbody>{events.map((b) => (
        <tr key={b.id}>
          <td className="nowrap">{fmtDate(b.paid_date ?? b.invoice_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td className="primary">{name(b.client_id)}</td>
          <td>{BILLING_KIND_LABEL[b.kind]}</td>
          <td className="small muted">{b.description}{b.hours ? ` · ${b.hours} h at ${money(Number(b.rate ?? 0))}` : ''}</td>
          <td><span className={`tag ${b.status === 'paid' ? 'good' : b.status === 'invoiced' ? 'warn' : ''}`}>{b.status === 'paid' ? 'Paid' : b.status === 'invoiced' ? 'Receivable' : b.status === 'scheduled' ? 'Scheduled' : 'Written off'}</span></td>
          <td className="n strong">{money(Number(b.amount), true)}</td>
          <td style={{ width: 1 }}><button className="btn ghost sm" onClick={() => setEdit(b)}>Edit</button></td>
        </tr>
      ))}</tbody>
    </table></div>
    {edit && <BillingForm initial={edit} clients={clients} contracts={contracts} onClose={() => setEdit(null)} />}
  </>);
}

export function ExpenseEditor({ initial, onClose }: { initial: Partial<Expense>; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({
    category: initial.category ?? 'software', vendor: initial.vendor ?? '', amount: initial.amount != null ? String(initial.amount) : '',
    recurring: initial.recurring ?? false, frequency: initial.frequency ?? 'monthly', date: initial.date ?? laDate(), end_date: initial.end_date ?? '', notes: initial.notes ?? '',
  });
  return (
    <Modal title={initial.id ? `Edit ${initial.vendor}` : 'Add expense'} onClose={onClose} error={error}
      footer={<>
        {initial.id && <button className="btn ghost danger" disabled={busy} onClick={() => { if (confirm('Remove this expense? It stays in the change log.')) run(() => archiveExpense(initial.id!), onClose); }}>Remove</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveExpense({ id: initial.id, ...v, amount: Number(v.amount), frequency: v.recurring ? v.frequency : null, end_date: v.end_date || null }), onClose)}>Save</button>
      </>}>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Vendor or person</span><input type="text" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} placeholder="Melanie Lee, Adobe" /></label>
        <label className="field"><span>Category</span>
          <select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Expense['category'] })}>
            {Object.entries(EXPENSE_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="field"><span>Amount</span><input type="number" min={0} step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></label>
        <label className="field"><span>{v.recurring ? 'First charge' : 'Date paid'}</span><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={v.recurring} onChange={(e) => setV({ ...v, recurring: e.target.checked })} /> Recurring <span className="hint">projects forward into expected costs</span></label>
      {v.recurring && (
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><span>Every</span><div className="seg">
            {(['monthly', 'quarterly', 'annually'] as const).map((f) => <button key={f} type="button" aria-pressed={v.frequency === f} onClick={() => setV({ ...v, frequency: f })}>{f === 'monthly' ? 'Month' : f === 'quarterly' ? 'Quarter' : 'Year'}</button>)}
          </div></div>
          <label className="field"><span>Ends <span className="hint">optional</span></span><input type="date" value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></label>
        </div>
      )}
      <label className="field"><span>Notes</span><input type="text" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    </Modal>
  );
}

export function ExpenseButton({ expense, label, className = 'btn ghost sm' }: { expense?: Expense; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button className={className} onClick={() => setOpen(true)}>{label}</button>
    {open && <ExpenseEditor initial={expense ?? { recurring: false }} onClose={() => setOpen(false)} />}
  </>);
}

export function GoalButton({ year, amount }: { year: number; amount: number | null }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(amount ? String(amount) : '');
  const { run, busy, error } = useAction();
  return (<>
    <button className="btn" onClick={() => setOpen(true)}>{amount ? 'Edit goal' : 'Set goal'}</button>
    {open && (
      <Modal title={`${year} revenue goal`} onClose={() => setOpen(false)} error={error}
        footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => run(() => saveGoal(year, Number(v)), () => setOpen(false))}>Save</button></>}>
        <label className="field"><span>Annual revenue goal</span><input type="number" min={0} step="1000" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></label>
        <p className="muted small">Paid revenue for {year} is tracked against this. The change is recorded in the change log.</p>
      </Modal>
    )}
  </>);
}
