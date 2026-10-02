export type Role = 'employee' | 'admin';
export type Scope = 'internal' | 'external';

/** Discrete deliverable units. Non-discrete work has no unit and is never asked for one. */
export type Unit = 'emails' | 'posts' | 'graphics' | 'reels' | 'reports';

export type BillingFrequency =
  | 'monthly'
  | 'quarterly'
  | 'biannually'
  | 'annually'
  | 'one_off'
  | 'commission';

export type ContractType =
  | 'retainer'
  | 'ad_commission'
  | 'hourly'
  | 'one_off';

export type RevenueKind =
  | 'recurring'
  | 'one_off'
  | 'ad_commission'
  | 'hourly';

export interface Person {
  id: string;
  auth_user_id: string | null;
  name: string;
  role: Role;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  active: boolean;
  /** Optional brand hex used only in that client's own charts, never in global UI. */
  brand_color: string | null;
}

export interface TaskType {
  id: string;
  code: string;
  name: string;
  scope: Scope;
  /** Null means this task type is not counted in discrete units. */
  unit: Unit | null;
  /** Parent category code, for deliverable types that sit under a category. */
  parent_code: string | null;
  /** Only discrete, repeatable, measurable work appears in Quick Start. */
  quick_start: boolean;
  /** Planning estimate in hours, used for estimated vs actual variance. Null when unknown. */
  estimate_hours: number | null;
  active: boolean;
}

export interface TimeEntry {
  id: string;
  person_id: string;
  scope: Scope;
  client_id: string | null;
  task_type_id: string;
  /** Free text name supplied when the user picked Other. */
  custom_task_name: string | null;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  completed: boolean;
  contract_deliverable: boolean;
  /** Derived from the task type, never hand-entered. */
  unit_count: number | null;
  joint: boolean;
  notes: string | null;
  deleted: boolean;
}

export interface EntryParticipant {
  entry_id: string;
  person_id: string;
}

/** Background work done alongside a primary entry. */
export interface ParallelWork {
  id: string;
  entry_id: string;
  client_id: string | null;
  task_type_id: string;
}

export interface Timer {
  person_id: string;
  scope: Scope;
  client_id: string | null;
  task_type_id: string;
  custom_task_name: string | null;
  started_at: string;
  paused_at: string | null;
  paused_seconds: number;
}

export interface Contract {
  id: string;
  client_id: string;
  type: ContractType;
  billing_frequency: BillingFrequency;
  /** Fixed amount per billing cycle. Null for ad_commission contracts. */
  amount_per_billing: number | null;
  /** Percentage for ad_commission contracts. Null otherwise. */
  percent_commission: number | null;
  start_date: string;
  active: boolean;
}

/** Pricing changes are recorded rather than forcing a brand new contract. */
export interface ContractPriceChange {
  id: string;
  contract_id: string;
  effective_date: string;
  amount_per_billing: number | null;
  percent_commission: number | null;
  changed_by: string;
  reason: string | null;
}

export interface RevenueLine {
  id: string;
  client_id: string | null;
  contract_id: string | null;
  kind: RevenueKind;
  amount: number;
  /** Date the money is expected or was collected. */
  date: string;
  collected: boolean;
  description: string | null;
  deleted: boolean;
}

export interface Expense {
  id: string;
  /** Itemised, never bundled. Software entries carry a vendor. */
  category: 'contractor' | 'software' | 'service' | 'other';
  vendor: string | null;
  label: string;
  amount: number;
  recurring: boolean;
  frequency: BillingFrequency | null;
  date: string;
  deleted: boolean;
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
