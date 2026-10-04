'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertAdmin, audit } from '@/lib/auth';
import type { Result } from './time';

type Row = Record<string, unknown>;

/** Insert or update one row, with one audit row per changed field. Admin only;
 *  row-level security enforces the same rule in the database. */
async function upsert(table: string, id: string | null | undefined, values: Row, reason?: string): Promise<Result<{ id: string }>> {
  try { await assertAdmin(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const sb = await createClient();
  if (!id) {
    const { data, error } = await sb.from(table).insert(values).select('id').single();
    if (error) return { ok: false, error: friendly(error.message) };
    await audit({ table_name: table, record_id: data.id, field: 'created', after_value: JSON.stringify(values).slice(0, 500), reason });
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: data.id } };
  }
  const { data: before } = await sb.from(table).select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'That record no longer exists.' };
  const { error } = await sb.from(table).update(values).eq('id', id);
  if (error) return { ok: false, error: friendly(error.message) };
  for (const [k, v] of Object.entries(values)) {
    const a = JSON.stringify(before[k] ?? null); const b = JSON.stringify(v ?? null);
    if (a !== b && !(typeof v === 'number' && Number(before[k]) === v)) {
      await audit({ table_name: table, record_id: id, field: k, before_value: a, after_value: b, reason });
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { id } };
}

function friendly(m: string) {
  if (/duplicate key/.test(m)) return 'Something with that name or code already exists.';
  if (/row-level security/.test(m)) return 'Only admins can change this.';
  if (/broader than|is .* but its category is/.test(m)) return m.replace(/^.*?ERROR:\s*/, '');
  if (/contexts_match_eligibility/.test(m)) return 'An external or Both category needs at least one relationship (Client, Prospect or Partner). An internal category has none.';
  if (/unit_needs_deliverable/.test(m)) return 'A task with a deliverable needs a unit, and a task without one cannot have a unit.';
  if (/commission_shape/.test(m)) return 'Ad Commission uses a percent. Every other contract type uses an amount.';
  return m;
}

const clean = (s: unknown) => { const t = String(s ?? '').trim(); return t || null; };
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// ---------------------------------------------------------------- relationships

export async function saveClient(v: { id?: string; name: string; active: boolean; brand_color?: string; brand_color_dark?: string; client_since?: string; notes?: string }) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  return upsert('clients', v.id, {
    name: clean(v.name), active: !!v.active, brand_color: clean(v.brand_color), brand_color_dark: clean(v.brand_color_dark),
    client_since: clean(v.client_since), notes: clean(v.notes),
  });
}

export async function saveProspect(v: { id?: string; name: string; company?: string; source?: string; stage: string; notes?: string; active: boolean }) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  return upsert('prospects', v.id, { name: clean(v.name), company: clean(v.company), source: clean(v.source), stage: v.stage || 'open', notes: clean(v.notes), active: !!v.active });
}

/** A prospect that signs becomes a client. The prospect row stays, marked won, so
 *  the pipeline time spent on it remains attributable. */
export async function convertProspect(id: string): Promise<Result<{ id: string }>> {
  try { await assertAdmin(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const sb = await createClient();
  const { data: p } = await sb.from('prospects').select('*').eq('id', id).maybeSingle();
  if (!p) return { ok: false, error: 'That prospect no longer exists.' };
  const name = p.company || p.name;
  let clientId: string | null = null;
  const { data: existing } = await sb.from('clients').select('id').eq('name', name).maybeSingle();
  if (existing) clientId = existing.id;
  else {
    const r = await upsert('clients', null, { name, active: true, client_since: new Date().toISOString().slice(0, 10) }, `Converted from prospect ${p.name}`);
    if (!r.ok) return r;
    clientId = r.data!.id;
  }
  return upsert('prospects', id, { stage: 'won', converted_client_id: clientId, active: false }, 'Converted to client');
}

export async function savePartner(v: { id?: string; name: string; kind?: string; notes?: string; active: boolean }) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  return upsert('partners', v.id, { name: clean(v.name), kind: clean(v.kind), notes: clean(v.notes), active: !!v.active });
}

export async function savePerson(v: { id?: string; name: string; email?: string; role: string; title?: string; weekly_capacity_hours?: number | null; active: boolean }) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  const email = clean(v.email)?.toLowerCase() ?? null;
  if (email && !email.endsWith('@lucidstudiollc.com')) return { ok: false, error: 'Use a lucidstudiollc.com address.' } as Result;
  return upsert('people', v.id, {
    name: clean(v.name), email, role: v.role === 'admin' ? 'admin' : 'employee', title: clean(v.title),
    weekly_capacity_hours: v.weekly_capacity_hours == null || Number.isNaN(Number(v.weekly_capacity_hours)) ? null : Number(v.weekly_capacity_hours),
    active: !!v.active,
  });
}

// ---------------------------------------------------------------- taxonomy

export async function saveCategory(v: { id?: string; name: string; description?: string; eligibility: string; contexts: string[]; revenue_relationship: string; active: boolean; sort_order?: number }) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  const contexts = v.eligibility === 'internal' ? [] : v.contexts;
  const values: Row = {
    name: clean(v.name), description: clean(v.description), eligibility: v.eligibility, contexts,
    revenue_relationship: v.revenue_relationship, active: !!v.active,
  };
  if (!v.id) { values.code = slug(v.name!); values.sort_order = v.sort_order ?? 999; }
  if (v.id && !v.active) {
    // Archiving a category hides its tasks from logging too; history keeps both.
    const sb = await createClient();
    const { count } = await sb.from('task_types').select('id', { count: 'exact', head: true }).eq('category_id', v.id).eq('active', true);
    if (count) {
      const r = await upsert('task_categories', v.id, values);
      if (!r.ok) return r;
      await sb.from('task_types').update({ active: false }).eq('category_id', v.id);
      await audit({ table_name: 'task_categories', record_id: v.id, field: 'archived_tasks', after_value: String(count), reason: 'Category archived' });
      return r;
    }
  }
  return upsert('task_categories', v.id, values);
}

export async function saveTaskType(v: {
  id?: string; category_id: string; name: string; description?: string; eligibility: string; revenue_relationship?: string | null;
  service_line?: string; has_deliverable: boolean; deliverable_unit?: string; expected_minutes?: number | null; expected_source?: string | null;
  quick_start: boolean; active: boolean; code?: string;
}) {
  if (!clean(v.name)) return { ok: false, error: 'Name is required.' } as Result;
  if (!v.category_id) return { ok: false, error: 'Choose a category.' } as Result;
  const mins = v.expected_minutes == null || Number.isNaN(Number(v.expected_minutes)) || Number(v.expected_minutes) <= 0 ? null : Math.round(Number(v.expected_minutes) * 100) / 100;
  const unit = v.has_deliverable ? clean(v.deliverable_unit)?.toLowerCase() ?? null : null;
  if (v.has_deliverable && !unit) return { ok: false, error: 'Name the deliverable unit, for example email or reel.' } as Result;
  if (mins != null && !v.expected_source) return { ok: false, error: 'Say where the expected time comes from.' } as Result;

  const values: Row = {
    category_id: v.category_id, name: clean(v.name), description: clean(v.description), eligibility: v.eligibility,
    revenue_relationship: v.revenue_relationship || null, service_line: clean(v.service_line),
    has_deliverable: !!v.has_deliverable, deliverable_unit: unit,
    expected_minutes: mins, expected_source: mins == null ? null : v.expected_source,
    quick_start: !!v.quick_start, active: !!v.active,
  };
  const sb = await createClient();
  if (v.id) {
    const { data: before } = await sb.from('task_types').select('expected_minutes, expected_source').eq('id', v.id).maybeSingle();
    if (before && (Number(before.expected_minutes ?? -1) !== (mins ?? -1) || before.expected_source !== values.expected_source)) {
      values.expected_updated_at = new Date().toISOString();
    }
  } else {
    values.code = (clean(v.code) ?? `T-${Date.now().toString(36).toUpperCase()}`).toUpperCase();
    values.sort_order = 999;
    if (mins != null) values.expected_updated_at = new Date().toISOString();
  }
  return upsert('task_types', v.id, values);
}

/** Turns an unlisted task that people typed into a real task type, and points the
 *  matching entries at it so history is measured from day one. */
export async function promoteCustomTask(v: { custom_name: string; category_id: string; name: string; eligibility: string }): Promise<Result> {
  const r = await saveTaskType({ category_id: v.category_id, name: v.name, eligibility: v.eligibility, has_deliverable: false, quick_start: false, active: true });
  if (!r.ok) return r;
  const sb = await createClient();
  const { data: rows, error } = await sb.from('time_entries').update({ task_type_id: r.data!.id, custom_task_name: null })
    .eq('category_id', v.category_id).is('task_type_id', null).ilike('custom_task_name', v.custom_name).select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  await audit({ table_name: 'task_types', record_id: r.data!.id, field: 'linked_entries', after_value: String(rows?.length ?? 0), reason: `Promoted unlisted task "${v.custom_name}"` });
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------- contracts and billing

export async function saveContract(v: {
  id?: string; client_id: string; type: string; billing_frequency: string; amount_per_billing?: number | null; percent_commission?: number | null;
  start_date: string; status: string; included_services?: string[]; notes?: string; price_effective?: string; price_reason?: string;
}): Promise<Result<{ id: string }>> {
  if (!v.client_id || !v.start_date) return { ok: false, error: 'Client and start date are required.' };
  const commission = v.type === 'ad_commission';
  const amount = commission ? null : v.amount_per_billing == null || Number.isNaN(Number(v.amount_per_billing)) ? null : Number(v.amount_per_billing);
  const pctV = commission ? (v.percent_commission == null || Number.isNaN(Number(v.percent_commission)) ? null : Number(v.percent_commission)) : null;
  if (!commission && amount == null) return { ok: false, error: 'Enter the amount billed each cycle.' };
  const values: Row = {
    client_id: v.client_id, type: v.type, billing_frequency: commission ? 'commission' : v.billing_frequency,
    amount_per_billing: amount, percent_commission: pctV, start_date: v.start_date, status: v.status,
    active: v.status === 'active', included_services: (v.included_services ?? []).map((s) => s.trim()).filter(Boolean), notes: clean(v.notes),
  };
  const sb = await createClient();
  let before: Row | null = null;
  if (v.id) before = (await sb.from('contracts').select('*').eq('id', v.id).maybeSingle()).data;
  const r = await upsert('contracts', v.id, values, v.price_reason);
  if (!r.ok) return r;
  // A price change updates the same contract and keeps the history.
  if (before && (Number(before.amount_per_billing ?? -1) !== (amount ?? -1) || Number(before.percent_commission ?? -1) !== (pctV ?? -1))) {
    const me = await assertAdmin();
    await sb.from('contract_price_changes').insert({
      contract_id: v.id, effective_date: v.price_effective || new Date().toISOString().slice(0, 10),
      amount_per_billing: before.amount_per_billing, percent_commission: before.percent_commission,
      changed_by: me.id, reason: clean(v.price_reason) ?? 'Price updated',
    });
  }
  return r;
}

export async function saveBillingEvent(v: {
  id?: string; client_id?: string | null; contract_id?: string | null; kind: string; status: string; amount: number;
  invoice_date: string; paid_date?: string | null; hours?: number | null; rate?: number | null; description?: string;
}) {
  if (!(Number(v.amount) >= 0) || !v.invoice_date) return { ok: false, error: 'Amount and invoice date are required.' } as Result;
  if (v.kind !== 'other_income' && !v.client_id) return { ok: false, error: 'Choose the client.' } as Result;
  const paid = v.status === 'paid' ? (v.paid_date || v.invoice_date) : null;
  return upsert('billing_events', v.id, {
    client_id: v.client_id || null, contract_id: v.contract_id || null, kind: v.kind, status: v.status,
    amount: Math.round(Number(v.amount) * 100) / 100, invoice_date: v.invoice_date, paid_date: paid,
    hours: v.hours == null || Number.isNaN(Number(v.hours)) ? null : Number(v.hours),
    rate: v.rate == null || Number.isNaN(Number(v.rate)) ? null : Number(v.rate),
    description: clean(v.description),
  });
}

export async function archiveBillingEvent(id: string) {
  return upsert('billing_events', id, { deleted: true }, 'Removed');
}

export async function saveExpense(v: {
  id?: string; category: string; vendor: string; amount: number; recurring: boolean; frequency?: string | null; date: string; end_date?: string | null; notes?: string;
}) {
  if (!clean(v.vendor) || !(Number(v.amount) >= 0) || !v.date) return { ok: false, error: 'Vendor, amount and date are required.' } as Result;
  return upsert('expenses', v.id, {
    category: v.category, vendor: clean(v.vendor), amount: Math.round(Number(v.amount) * 100) / 100,
    recurring: !!v.recurring, frequency: v.recurring ? v.frequency || 'monthly' : null,
    date: v.date, end_date: v.recurring ? v.end_date || null : null, notes: clean(v.notes),
  });
}

export async function archiveExpense(id: string) {
  return upsert('expenses', id, { deleted: true }, 'Removed');
}

export async function saveGoal(year: number, amount: number): Promise<Result> {
  let me;
  try { me = await assertAdmin(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (!(amount > 0)) return { ok: false, error: 'Enter a goal above zero.' };
  const sb = await createClient();
  const { data: before } = await sb.from('revenue_goals').select('amount').eq('year', year).maybeSingle();
  const { error } = await sb.from('revenue_goals').upsert({ year, amount });
  if (error) return { ok: false, error: friendly(error.message) };
  await audit({ table_name: 'revenue_goals', record_id: String(year), field: 'amount', before_value: before ? String(before.amount) : null, after_value: String(amount), reason: `Set by ${me.name}` });
  revalidatePath('/', 'layout');
  return { ok: true };
}
