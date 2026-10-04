import 'server-only';
import { createClient } from './supabase/server';
import { rangeInstants } from './time';
import type {
  AuditRow, BillingEvent, Catalog, Category, Client, Contract, Expense, Partner, Person,
  PriceChange, Prospect, Settings, TaskType, TimeEntry,
} from './types';

const num = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
  rows.map((r) => {
    const o = { ...r };
    for (const k of keys) if (o[k] != null) (o as Record<string, unknown>)[k as string] = Number(o[k]);
    return o;
  });

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
}

export async function loadCatalog(): Promise<Catalog> {
  const sb = await createClient();
  const [c, t, cl, pr, pa, pe] = await Promise.all([
    sb.from('task_categories').select('*').order('sort_order'),
    sb.from('task_types').select('*').order('sort_order'),
    sb.from('clients').select('id,name,active,brand_color,brand_color_dark,notes,client_since,legacy_key').order('name'),
    sb.from('prospects').select('*').order('name'),
    sb.from('partners').select('*').order('name'),
    sb.from('people').select('id,auth_user_id,name,email,role,title,weekly_capacity_hours,legacy_key,active').order('name'),
  ]);
  fail('categories', c.error); fail('task types', t.error); fail('clients', cl.error);
  fail('prospects', pr.error); fail('partners', pa.error); fail('people', pe.error);
  return {
    categories: (c.data ?? []) as Category[],
    taskTypes: num((t.data ?? []) as unknown as Record<string, unknown>[], ['expected_minutes']) as unknown as TaskType[],
    clients: (cl.data ?? []) as Client[],
    prospects: (pr.data ?? []) as Prospect[],
    partners: (pa.data ?? []) as Partner[],
    people: num((pe.data ?? []) as unknown as Record<string, unknown>[], ['weekly_capacity_hours']) as unknown as Person[],
  };
}

const ENTRY_COLS = '*, entry_participants(person_id)';

type RawEntry = TimeEntry & { entry_participants?: { person_id: string }[] };
const shape = (rows: RawEntry[]): TimeEntry[] =>
  rows.map(({ entry_participants, ...e }) => ({ ...e, participants: (entry_participants ?? []).map((p) => p.person_id) }));

/** Entries that started inside an LA date range. Paged so a long range never truncates. */
export async function loadEntries(
  range: { from: string; to: string },
  opts: { personId?: string; includeDeleted?: boolean } = {},
): Promise<TimeEntry[]> {
  const sb = await createClient();
  const { start, end } = rangeInstants(range);
  const out: RawEntry[] = [];
  for (let page = 0; page < 50; page++) {
    let q = sb.from('time_entries').select(ENTRY_COLS)
      .gte('started_at', start).lt('started_at', end)
      .order('started_at', { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (opts.personId) q = q.eq('person_id', opts.personId);
    if (!opts.includeDeleted) q = q.eq('deleted', false);
    const { data, error } = await q;
    fail('time entries', error);
    out.push(...((data ?? []) as RawEntry[]));
    if (!data || data.length < 1000) break;
  }
  return shape(out);
}

export async function loadRunning(personId: string): Promise<TimeEntry | null> {
  const sb = await createClient();
  const { data, error } = await sb.from('time_entries').select(ENTRY_COLS)
    .eq('person_id', personId).is('ended_at', null).eq('deleted', false).maybeSingle();
  fail('running timer', error);
  return data ? shape([data as RawEntry])[0] : null;
}

/** Everyone's running timers, for the dashboard. */
export async function loadAllRunning(): Promise<TimeEntry[]> {
  const sb = await createClient();
  const { data, error } = await sb.from('time_entries').select(ENTRY_COLS).is('ended_at', null).eq('deleted', false);
  fail('running timers', error);
  return shape((data ?? []) as RawEntry[]);
}

/** Entries since a date, for in-progress work. */
export async function loadRecentEntries(sinceDate: string, personId?: string) {
  return loadEntries({ from: sinceDate, to: '2999-12-31' }, { personId });
}

export interface Finance {
  billing: BillingEvent[];
  expenses: Expense[];
  contracts: Contract[];
  priceChanges: PriceChange[];
  goals: Record<number, number>;
  settings: Settings;
}

/** Admin only. Row-level security returns nothing to anyone else. */
export async function loadFinance(): Promise<Finance> {
  const sb = await createClient();
  const [b, x, k, pc, g, s] = await Promise.all([
    sb.from('billing_events').select('*').eq('deleted', false).order('invoice_date'),
    sb.from('expenses').select('*').eq('deleted', false).order('date'),
    sb.from('contracts').select('*').order('start_date'),
    sb.from('contract_price_changes').select('*').order('effective_date'),
    sb.from('revenue_goals').select('*'),
    sb.from('app_settings').select('*').maybeSingle(),
  ]);
  fail('billing', b.error); fail('expenses', x.error); fail('contracts', k.error);
  fail('price history', pc.error); fail('goals', g.error); fail('settings', s.error);
  return {
    billing: num((b.data ?? []) as unknown as Record<string, unknown>[], ['amount', 'hours', 'rate']) as unknown as BillingEvent[],
    expenses: num((x.data ?? []) as unknown as Record<string, unknown>[], ['amount']) as unknown as Expense[],
    contracts: num((k.data ?? []) as unknown as Record<string, unknown>[], ['amount_per_billing', 'percent_commission']) as unknown as Contract[],
    priceChanges: num((pc.data ?? []) as unknown as Record<string, unknown>[], ['amount_per_billing', 'percent_commission']) as unknown as PriceChange[],
    goals: Object.fromEntries((g.data ?? []).map((r: { year: number; amount: number }) => [r.year, Number(r.amount)])),
    settings: (s.data
      ? { ...s.data, pool_pct: Number(s.data.pool_pct) }
      : { pool_pct: 0.65, hours_based_from: '2026-10', fixed_split: {}, baseline_date: '2026-10-01' }) as Settings,
  };
}

export async function loadAudit(limit = 300): Promise<AuditRow[]> {
  const sb = await createClient();
  const { data, error } = await sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit);
  fail('change log', error);
  return (data ?? []) as AuditRow[];
}

/** Count of time entries per task type and per category, for taxonomy admin. */
export async function loadUsage() {
  const sb = await createClient();
  const byType = new Map<string, number>();
  const byCat = new Map<string, number>();
  const custom: Array<{ id: string; name: string; category_id: string; started_at: string; person_id: string }> = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await sb.from('time_entries')
      .select('id,task_type_id,category_id,custom_task_name,started_at,person_id')
      .eq('deleted', false).range(page * 1000, page * 1000 + 999);
    fail('usage', error);
    for (const r of data ?? []) {
      if (r.task_type_id) byType.set(r.task_type_id, (byType.get(r.task_type_id) ?? 0) + 1);
      byCat.set(r.category_id, (byCat.get(r.category_id) ?? 0) + 1);
      if (!r.task_type_id && r.custom_task_name) {
        custom.push({ id: r.id, name: r.custom_task_name, category_id: r.category_id, started_at: r.started_at, person_id: r.person_id });
      }
    }
    if (!data || data.length < 1000) break;
  }
  return { byType, byCat, custom };
}
