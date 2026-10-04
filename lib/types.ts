// Row shapes for the LS Command schema (supabase/migrations/0004 onward).

export type Role = 'employee' | 'admin';
export type WorkType = 'internal' | 'external';
export type Eligibility = 'internal' | 'external' | 'both';
export type EntityKind = 'client' | 'prospect' | 'partner';
export type RevenueRel = 'direct' | 'pipeline' | 'operational';
export type EstimateSource = 'measured' | 'estimate' | 'benchmark' | 'contract';
export type EntryStatus = 'finished' | 'in_progress';
export type BillingFrequency = 'monthly' | 'quarterly' | 'biannually' | 'annually' | 'one_off' | 'commission';
export type ContractType = 'retainer' | 'ad_commission' | 'hourly' | 'one_off' | 'per_unit';
export type BillingKind = 'retainer' | 'one_off' | 'hourly' | 'ad_commission' | 'additional_charge' | 'other_income';
export type BillingStatus = 'paid' | 'invoiced' | 'scheduled' | 'written_off';
export type ExpenseCategory =
  | 'contractor' | 'software' | 'marketing' | 'service' | 'equipment' | 'meals' | 'cost_of_delivery' | 'other';
export type ExpenseFrequency = 'monthly' | 'quarterly' | 'annually';

export interface Person {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  role: Role;
  title: string | null;
  weekly_capacity_hours: number | null;
  legacy_key: string | null;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  active: boolean;
  brand_color: string | null;
  brand_color_dark: string | null;
  notes: string | null;
  client_since: string | null;
  legacy_key: string | null;
}

export interface Prospect {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  stage: 'open' | 'won' | 'lost';
  converted_client_id: string | null;
  notes: string | null;
  active: boolean;
}

export interface Partner {
  id: string;
  name: string;
  kind: string | null;
  notes: string | null;
  active: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  eligibility: Eligibility;
  contexts: EntityKind[];
  revenue_relationship: RevenueRel;
  sort_order: number;
  active: boolean;
}

export interface TaskType {
  id: string;
  code: string;
  category_id: string;
  name: string;
  description: string | null;
  eligibility: Eligibility;
  revenue_relationship: RevenueRel | null;
  service_line: string | null;
  has_deliverable: boolean;
  deliverable_unit: string | null;
  expected_minutes: number | null;
  expected_source: EstimateSource | null;
  expected_updated_at: string | null;
  quick_start: boolean;
  sort_order: number;
  active: boolean;
}

export interface TimeEntry {
  id: string;
  person_id: string;
  work_type: WorkType;
  entity_kind: EntityKind | null;
  client_id: string | null;
  prospect_id: string | null;
  partner_id: string | null;
  category_id: string;
  task_type_id: string | null;
  custom_task_name: string | null;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  status: EntryStatus;
  deliverable_qty: number | null;
  contract_deliverable: boolean;
  joint: boolean;
  ai_assisted: boolean;
  parallel_of: string | null;
  revenue_relationship: RevenueRel | null;
  source: 'timer' | 'manual' | 'import';
  deleted: boolean;
  created_at: string;
  participants?: string[];
}

export interface Contract {
  id: string;
  client_id: string;
  type: ContractType;
  billing_frequency: BillingFrequency;
  amount_per_billing: number | null;
  percent_commission: number | null;
  start_date: string;
  status: 'active' | 'paused' | 'ended';
  included_services: string[];
  notes: string | null;
  active: boolean;
}

export interface PriceChange {
  id: string;
  contract_id: string;
  effective_date: string;
  amount_per_billing: number | null;
  percent_commission: number | null;
  reason: string | null;
  created_at: string;
}

export interface BillingEvent {
  id: string;
  client_id: string | null;
  contract_id: string | null;
  kind: BillingKind;
  status: BillingStatus;
  amount: number;
  invoice_date: string;
  paid_date: string | null;
  hours: number | null;
  rate: number | null;
  description: string | null;
  source: 'manual' | 'import';
  deleted: boolean;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  vendor: string;
  amount: number;
  recurring: boolean;
  frequency: ExpenseFrequency | null;
  date: string;
  end_date: string | null;
  notes: string | null;
  source: 'manual' | 'import' | 'seed';
  deleted: boolean;
}

export interface Settings {
  pool_pct: number;
  hours_based_from: string;
  fixed_split: Record<string, number>;
  baseline_date: string;
}

export interface AuditRow {
  id: string;
  at: string;
  person_id: string | null;
  table_name: string;
  record_id: string;
  field: string | null;
  before_value: string | null;
  after_value: string | null;
  reason: string | null;
}

/** Everything the logging forms need, loaded once per page. */
export interface Catalog {
  categories: Category[];
  taskTypes: TaskType[];
  clients: Client[];
  prospects: Prospect[];
  partners: Partner[];
  people: Person[];
}
