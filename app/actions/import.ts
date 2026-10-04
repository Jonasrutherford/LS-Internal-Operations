'use server';

// One-time move of the standalone page's browser data into Supabase.
//
// Before LS Command ran on Supabase, Lucid's data lived in each browser
// (localStorage key "lucidos.store.v1", loaded from a seed file that is never
// committed). This maps those documents onto the new model. Every imported row
// carries a legacy_ref, so running the import twice never duplicates anything.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertAdmin, audit } from '@/lib/auth';

type Doc = Record<string, unknown>;
type Items = Record<string, Doc>;
export interface ImportReport { section: string; added: number; updated: number; skipped: number; notes: string[] }

const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const numOrNull = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const isoDate = (v: unknown) => { const s = str(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

async function ctx() {
  const me = await assertAdmin();
  const sb = await createClient();
  const [clients, people, cats, types, contracts] = await Promise.all([
    sb.from('clients').select('id,name,legacy_key,brand_color,brand_color_dark,active'),
    sb.from('people').select('id,legacy_key,name'),
    sb.from('task_categories').select('id,code,eligibility,contexts'),
    sb.from('task_types').select('id,code,category_id,eligibility,has_deliverable,expected_minutes,expected_source'),
    sb.from('contracts').select('*'),
  ]);
  return { me, sb, clients: clients.data ?? [], people: people.data ?? [], cats: cats.data ?? [], types: types.data ?? [], contracts: contracts.data ?? [] };
}

// ---------------------------------------------------------------- reference data

export async function importReference(payload: { clients?: Items; taxonomy?: { types?: Items } }): Promise<{ ok: true; reports: ImportReport[] } | { ok: false; error: string }> {
  let c;
  try { c = await ctx(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { sb } = c;
  const reports: ImportReport[] = [];

  // Clients. Leads and "Lucid Studio (internal)" are not clients and are never imported as one.
  const cr: ImportReport = { section: 'Clients', added: 0, updated: 0, skipped: 0, notes: [] };
  for (const [key, raw] of Object.entries(payload.clients ?? {})) {
    const kind = str(raw.kind);
    if (key === 'internal' || key === 'prospects' || kind === 'internal' || kind === 'lead') { cr.skipped++; continue; }
    const brand = str(raw.brandLight) || null;
    const brandDark = str(raw.brandDark) || null;
    const existing = c.clients.find((x) => x.legacy_key === key) ?? c.clients.find((x) => x.name.toLowerCase() === str(raw.name).toLowerCase());
    if (existing) {
      const patch: Doc = {};
      if (!existing.legacy_key) patch.legacy_key = key;
      if (brand && !existing.brand_color) patch.brand_color = brand;
      if (brandDark && !existing.brand_color_dark) patch.brand_color_dark = brandDark;
      if (Object.keys(patch).length) { await sb.from('clients').update(patch).eq('id', existing.id); cr.updated++; }
    } else if (str(raw.name)) {
      const { error } = await sb.from('clients').insert({ name: str(raw.name), legacy_key: key, active: raw.active !== false, brand_color: brand, brand_color_dark: brandDark });
      if (error) { cr.skipped++; cr.notes.push(`${str(raw.name)}: ${error.message}`); } else cr.added++;
    }
  }
  reports.push(cr);

  // Expected times edited in the old app carry over onto the same task codes.
  const tr: ImportReport = { section: 'Expected times', added: 0, updated: 0, skipped: 0, notes: [] };
  const srcMap: Record<string, string> = { measured: 'measured', estimate: 'estimate', benchmark: 'benchmark', contract: 'contract' };
  for (const [code, raw] of Object.entries(payload.taxonomy?.types ?? {})) {
    const t = c.types.find((x) => x.code === code);
    const hrs = numOrNull(raw.planHours ?? raw.estimateHours);
    const src = srcMap[str(raw.source ?? raw.estimateSource).toLowerCase()];
    if (!t || !hrs || hrs <= 0 || !src) { tr.skipped++; continue; }
    const mins = Math.round(hrs * 60 * 100) / 100;
    if (Number(t.expected_minutes ?? -1) === mins && t.expected_source === src) continue;
    await sb.from('task_types').update({ expected_minutes: mins, expected_source: src, expected_updated_at: new Date().toISOString() }).eq('id', t.id);
    tr.updated++;
  }
  reports.push(tr);
  revalidatePath('/', 'layout');
  return { ok: true, reports };
}

// ---------------------------------------------------------------- finance

const KIND: Record<string, string> = { retainer: 'retainer', 'one-off': 'one_off', one_off: 'one_off', hourly: 'hourly', 'ad commission': 'ad_commission', commission: 'ad_commission', 'other income': 'other_income', additional: 'additional_charge' };
const EXP_CAT: Record<string, string> = {
  software: 'software', marketing: 'marketing', meals: 'meals', 'cost of delivery': 'cost_of_delivery', equipment: 'equipment',
  contractors: 'contractor', contractor: 'contractor', services: 'service', service: 'service',
};
const EXP_FREQ: Record<string, string> = { monthly: 'monthly', quarterly: 'quarterly', annual: 'annually', annually: 'annually', yearly: 'annually' };

export async function importFinance(payload: { ledger?: Items; expenses?: Items; contracts?: Items }): Promise<{ ok: true; reports: ImportReport[] } | { ok: false; error: string }> {
  let c;
  try { c = await ctx(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { sb } = c;
  const reports: ImportReport[] = [];
  const clientId = (key: unknown, name?: unknown) =>
    c.clients.find((x) => x.legacy_key === str(key))?.id ??
    (name ? c.clients.find((x) => x.name.toLowerCase() === str(name).toLowerCase())?.id : undefined) ?? null;

  // Contracts: update the existing agreement for a client rather than adding a second one.
  const kr: ImportReport = { section: 'Contracts', added: 0, updated: 0, skipped: 0, notes: [] };
  for (const [id, raw] of Object.entries(payload.contracts ?? {})) {
    if (raw.deleted || (str(raw.lifecycle) && str(raw.lifecycle) !== 'active')) { kr.skipped++; continue; }
    const cid = clientId(raw.clientId, raw.clientName);
    if (!cid) { kr.skipped++; kr.notes.push(`No client for contract ${str(raw.clientName)}`); continue; }
    const commission = /commission/.test(str(raw.contractType).toLowerCase());
    const type = commission ? 'ad_commission' : 'retainer';
    const freq = commission ? 'commission' : (['monthly', 'quarterly', 'biannually', 'annually'].includes(str(raw.frequency)) ? str(raw.frequency) : 'monthly');
    const start = isoDate(raw.start);
    const existing = c.contracts.find((k) => k.client_id === cid && k.type === type);
    const values = {
      type, billing_frequency: freq, start_date: start ?? existing?.start_date ?? '2026-01-01',
      amount_per_billing: commission ? null : numOrNull(raw.amount), percent_commission: commission ? numOrNull(raw.percentCommission) : null,
      legacy_ref: `contract:${id}`,
    };
    if (!commission && values.amount_per_billing == null) { kr.skipped++; continue; }
    if (existing) {
      if (existing.legacy_ref === values.legacy_ref || existing.legacy_ref == null) {
        const changed = existing.start_date !== values.start_date || Number(existing.amount_per_billing ?? -1) !== Number(values.amount_per_billing ?? -1)
          || existing.billing_frequency !== values.billing_frequency || Number(existing.percent_commission ?? -1) !== Number(values.percent_commission ?? -1);
        if (changed || !existing.legacy_ref) {
          const { error } = await sb.from('contracts').update(values).eq('id', existing.id);
          if (error) { kr.skipped++; kr.notes.push(error.message); } else kr.updated++;
        }
      } else kr.skipped++;
    } else {
      const { error } = await sb.from('contracts').insert({ ...values, client_id: cid, status: 'active', active: true });
      if (error) { kr.skipped++; kr.notes.push(error.message); } else kr.added++;
    }
  }
  reports.push(kr);
  const { data: freshContracts } = await sb.from('contracts').select('id,client_id,type');

  // Revenue ledger to billing events.
  const lr: ImportReport = { section: 'Revenue', added: 0, updated: 0, skipped: 0, notes: [] };
  const { data: haveRev } = await sb.from('billing_events').select('legacy_ref').not('legacy_ref', 'is', null);
  const seenRev = new Set((haveRev ?? []).map((r) => r.legacy_ref));
  const revRows: Doc[] = [];
  for (const [id, raw] of Object.entries(payload.ledger ?? {})) {
    if (raw.deleted) continue;
    const ref = `ledger:${id}`;
    if (seenRev.has(ref)) { lr.skipped++; continue; }
    const kind = KIND[str(raw.revenueType).toLowerCase()] ?? 'one_off';
    const cid = kind === 'other_income' ? null : clientId(raw.clientId, raw.clientName);
    if (kind !== 'other_income' && !cid) { lr.skipped++; lr.notes.push(`No client for "${str(raw.clientName)}" ${str(raw.invoiceDate)} ${str(raw.amount)}`); continue; }
    const invoice = isoDate(raw.invoiceDate) ?? isoDate(raw.recognitionDate) ?? isoDate(raw.paidDate);
    if (!invoice) { lr.skipped++; continue; }
    const amount = Number(raw.amount ?? 0);
    const paidAmount = Number(raw.paidAmount ?? 0);
    const st = str(raw.status);
    const contract = cid ? (freshContracts ?? []).find((k) => k.client_id === cid && (kind === 'ad_commission' ? k.type === 'ad_commission' : k.type !== 'ad_commission')) : null;
    const base = { client_id: cid, contract_id: kind === 'retainer' || kind === 'ad_commission' ? contract?.id ?? null : null, kind, invoice_date: invoice, description: str(raw.notes) || null, source: 'import' };
    if (st === 'paid') revRows.push({ ...base, legacy_ref: ref, status: 'paid', amount, paid_date: isoDate(raw.paidDate) ?? invoice });
    else if (st === 'partial' && paidAmount > 0) {
      revRows.push({ ...base, legacy_ref: ref, status: 'paid', amount: paidAmount, paid_date: isoDate(raw.paidDate) ?? invoice });
      if (amount - paidAmount > 0) revRows.push({ ...base, legacy_ref: `${ref}:balance`, status: 'invoiced', amount: Math.round((amount - paidAmount) * 100) / 100 });
    } else if (st === 'ar' || st === 'invoiced' || st === 'partial') revRows.push({ ...base, legacy_ref: ref, status: 'invoiced', amount });
    else if (st === 'written_off') revRows.push({ ...base, legacy_ref: ref, status: 'written_off', amount });
    else revRows.push({ ...base, legacy_ref: ref, status: 'scheduled', amount });
  }
  for (let i = 0; i < revRows.length; i += 200) {
    const { error } = await sb.from('billing_events').insert(revRows.slice(i, i + 200));
    if (error) { lr.notes.push(error.message); lr.skipped += Math.min(200, revRows.length - i); } else lr.added += Math.min(200, revRows.length - i);
  }
  reports.push(lr);

  // Expenses. Recurring rules already seeded (contractors, annual subscriptions) are not duplicated.
  const xr: ImportReport = { section: 'Expenses', added: 0, updated: 0, skipped: 0, notes: [] };
  const { data: haveExp } = await sb.from('expenses').select('legacy_ref,vendor,recurring').eq('deleted', false);
  const seenExp = new Set((haveExp ?? []).map((r) => r.legacy_ref));
  const recurringVendors = new Set((haveExp ?? []).filter((r) => r.recurring).map((r) => str(r.vendor).toLowerCase()));
  const expRows: Doc[] = [];
  for (const [id, raw] of Object.entries(payload.expenses ?? {})) {
    if (raw.deleted) continue;
    const ref = `expense:${id}`;
    if (seenExp.has(ref)) { xr.skipped++; continue; }
    const recurring = !!raw.recurring;
    const vendor = str(raw.vendor) || 'Unknown vendor';
    if (recurring && recurringVendors.has(vendor.toLowerCase())) { xr.skipped++; continue; }
    const date = isoDate(raw.date);
    if (!date) { xr.skipped++; continue; }
    expRows.push({
      category: EXP_CAT[str(raw.category).toLowerCase()] ?? 'other', vendor, amount: Math.abs(Number(raw.amount ?? 0)),
      recurring, frequency: recurring ? EXP_FREQ[str(raw.frequency).toLowerCase()] ?? 'monthly' : null,
      date, end_date: recurring ? isoDate(raw.endDate) : null, notes: str(raw.notes) || null, source: 'import', legacy_ref: ref,
    });
  }
  for (let i = 0; i < expRows.length; i += 200) {
    const { error } = await sb.from('expenses').insert(expRows.slice(i, i + 200));
    if (error) { xr.notes.push(error.message); xr.skipped += Math.min(200, expRows.length - i); } else xr.added += Math.min(200, expRows.length - i);
  }
  reports.push(xr);

  await audit({ table_name: 'import', record_id: 'finance', field: 'imported', after_value: reports.map((r) => `${r.section}: +${r.added} ~${r.updated}`).join('; '), reason: 'Imported from the previous browser data' });
  revalidatePath('/', 'layout');
  return { ok: true, reports };
}

// ---------------------------------------------------------------- time

// Old codes whose meaning moved to a different task in the audited taxonomy.
const CODE_MOVES: Record<string, string> = { 'IO-05': 'EO-01', 'CS-02': 'AU-03' };
// Old internal work logged against client-only task types: what Lucid was really doing.
const INTERNAL_EQUIV: Array<[RegExp, string]> = [
  [/^WB-/, 'IM-02'], [/^(SC|VD-0[1-5])/, 'IM-01'], [/^VD-/, 'IM-04'], [/^GD-/, 'IM-03'], [/^CM-09$/, 'LA-01'], [/^(SA|PM-0[1-7])/, 'IO-06'],
];

export async function importEntries(month: string, items: Items): Promise<{ ok: true; report: ImportReport } | { ok: false; error: string }> {
  let c;
  try { c = await ctx(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const { sb } = c;
  const r: ImportReport = { section: `Time ${month}`, added: 0, updated: 0, skipped: 0, notes: [] };
  const byCode = new Map(c.types.map((t) => [t.code, t]));
  const catById = new Map(c.cats.map((x) => [x.id, x]));
  const catByCode = new Map(c.cats.map((x) => [x.code, x]));
  const { data: have } = await sb.from('time_entries').select('legacy_ref').like('legacy_ref', 'entry:%');
  const seen = new Set((have ?? []).map((x) => x.legacy_ref));

  const rows: Doc[] = [];
  const joints = new Map<string, string[]>();
  for (const [id, e] of Object.entries(items)) {
    const ref = `entry:${id}`;
    if (e.deleted || seen.has(ref)) { if (seen.has(ref)) r.skipped++; continue; }
    const start = Number(e.start); const end = Number(e.end);
    if (!start || !end || end <= start) { r.skipped++; continue; }
    const person = c.people.find((p) => p.legacy_key === str(e.personId));
    if (!person) { r.skipped++; r.notes.push(`Unknown person ${str(e.personId)}`); continue; }

    const ck = str(e.clientId);
    let workType: 'internal' | 'external' = e.scope === 'internal' || ck === 'internal' ? 'internal' : 'external';
    let kind: string | null = workType === 'internal' ? null : ck === 'prospects' ? 'prospect' : 'client';
    let client = kind === 'client' ? c.clients.find((x) => x.legacy_key === ck)?.id ?? null : null;

    let code = CODE_MOVES[str(e.typeId)] ?? str(e.typeId);
    let t = byCode.get(code);
    if (!t) { r.skipped++; r.notes.push(`${month}: unknown task ${str(e.typeId) || '(none)'}`); continue; }
    let cat = catById.get(t.category_id)!;

    // Sales work logged as "internal" in the old app was pipeline work: prospecting.
    if (workType === 'internal' && cat.eligibility === 'external' && cat.contexts.includes('prospect')) { workType = 'external'; kind = 'prospect'; client = null; }
    if (workType === 'internal' && cat.eligibility === 'external') {
      const eq = INTERNAL_EQUIV.find(([re]) => re.test(code))?.[1] ?? 'IO-09';
      code = eq; t = byCode.get(code)!; cat = catById.get(t.category_id)!;
    }
    if (workType === 'external' && kind === 'client' && !client) {
      if (cat.contexts.includes('prospect')) { kind = 'prospect'; } else { r.skipped++; r.notes.push(`${month}: no client on ${str(e.note).slice(0, 40)}`); continue; }
    }
    if (workType === 'external' && !cat.contexts.includes(kind as 'client')) {
      // A client call with a prospect, for example. Use the matching prospect category.
      const alt = catByCode.get(kind === 'prospect' ? 'discovery_calls' : 'client_communication');
      const altType = c.types.find((x) => x.category_id === alt?.id);
      if (!alt || !altType) { r.skipped++; continue; }
      cat = alt; t = altType;
    }

    rows.push({
      person_id: person.id, work_type: workType, entity_kind: workType === 'internal' ? null : kind,
      client_id: kind === 'client' ? client : null, category_id: cat.id, task_type_id: t.id,
      started_at: new Date(start).toISOString(), ended_at: new Date(end).toISOString(), paused_seconds: 0,
      status: 'finished', deliverable_qty: t.has_deliverable && numOrNull(e.units) ? Math.round(Number(e.units)) : null,
      joint: !!e.joint, ai_assisted: !!e.ai, source: 'import', legacy_ref: ref,
    });
    if (e.jointGroup) joints.set(str(e.jointGroup), [...(joints.get(str(e.jointGroup)) ?? []), ref]);
  }

  const inserted: Array<{ id: string; legacy_ref: string; person_id: string }> = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await sb.from('time_entries').insert(chunk).select('id,legacy_ref,person_id');
    if (!error) { inserted.push(...(data ?? [])); r.added += chunk.length; continue; }
    for (const row of chunk) {
      const one = await sb.from('time_entries').insert(row).select('id,legacy_ref,person_id').single();
      if (one.error) { r.skipped++; r.notes.push(`${month}: ${one.error.message.slice(0, 120)}`); } else { inserted.push(one.data); r.added++; }
    }
  }

  // Joint sessions: each person's entry lists the other as a participant.
  for (const refs of joints.values()) {
    const group = inserted.filter((x) => refs.includes(x.legacy_ref));
    for (const a of group) for (const b of group) if (a.person_id !== b.person_id) {
      await sb.from('entry_participants').insert({ entry_id: a.id, person_id: b.person_id });
    }
  }
  r.notes = [...new Set(r.notes)].slice(0, 12);
  revalidatePath('/', 'layout');
  return { ok: true, report: r };
}

export async function recordImportDone(summary: string) {
  await assertAdmin();
  await audit({ table_name: 'import', record_id: 'all', field: 'completed', after_value: summary.slice(0, 900), reason: 'Imported from the previous browser data' });
}
