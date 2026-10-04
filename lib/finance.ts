// Finance math for LS Command. Every figure on a finance page traces to a row:
// billing events (revenue), expenses (one-off rows and recurring rules), contracts
// (forward expectations only) and app settings (payout rules). Covered by
// tests/finance.test.mjs.

import type { BillingEvent, BillingFrequency, Contract, Expense, ExpenseFrequency, Settings } from './types';

export const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const MONTHS_PER_CYCLE: Record<BillingFrequency, number | null> = {
  monthly: 1, quarterly: 3, biannually: 6, annually: 12, one_off: null, commission: null,
};
const EXPENSE_MONTHS: Record<ExpenseFrequency, number> = { monthly: 1, quarterly: 3, annually: 12 };

export const FREQUENCY_LABEL: Record<string, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', biannually: 'Twice a year', annually: 'Annually',
  one_off: 'One-off', commission: 'Commission',
};

export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  retainer: 'Retainer', ad_commission: 'Ad Commission', hourly: 'Hourly', one_off: 'Project', per_unit: 'Per deliverable',
};

export const BILLING_KIND_LABEL: Record<string, string> = {
  retainer: 'Retainer', one_off: 'One-off project', hourly: 'Hourly', ad_commission: 'Ad Commission',
  additional_charge: 'Additional charge', other_income: 'Other income',
};

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  contractor: 'Contractors', software: 'Software', marketing: 'Marketing', service: 'Services',
  equipment: 'Equipment', meals: 'Meals', cost_of_delivery: 'Cost of delivery', other: 'Other',
};

const lastDay = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Expand a monthly-anchored schedule (start date, every n months) inside a range. */
function schedule(start: string, everyMonths: number, from: string, to: string, end?: string | null) {
  const day = Number(start.slice(8, 10));
  const out: string[] = [];
  let ym = start.slice(0, 7);
  for (let g = 0; g < 600; g++) {
    const d = `${ym}-${String(Math.min(day, lastDay(ym))).padStart(2, '0')}`;
    if (d > to || (end && d > end)) break;
    if (d >= from && d >= start) out.push(d);
    ym = addMonths(ym, everyMonths);
  }
  return out;
}

// ---------------------------------------------------------------- revenue

/** Revenue counts on the day it was paid. Invoiced but unpaid is accounts receivable. */
export const isPaid = (b: BillingEvent) => !b.deleted && b.status === 'paid' && !!b.paid_date;
export const isReceivable = (b: BillingEvent) => !b.deleted && b.status === 'invoiced';

export function paidIn(events: BillingEvent[], from: string, to: string) {
  return events.filter((b) => isPaid(b) && b.paid_date! >= from && b.paid_date! <= to);
}

/** Recognized: billed in the range and not written off, whether or not it has been paid. */
export function recognizedIn(events: BillingEvent[], from: string, to: string) {
  return events.filter((b) => !b.deleted && b.status !== 'written_off' && b.status !== 'scheduled'
    && b.invoice_date >= from && b.invoice_date <= to);
}

export const total = (events: Array<{ amount: number }>) => r2(sum(events.map((e) => Number(e.amount))));

/** Paid revenue per month, every month in [fromYm, toYm] present even when zero. */
export function monthlyPaid(events: BillingEvent[], fromYm: string, toYm: string) {
  const m = new Map<string, number>();
  for (let ym = fromYm; ym <= toYm; ym = addMonths(ym, 1)) m.set(ym, 0);
  for (const b of events) {
    if (!isPaid(b)) continue;
    const ym = b.paid_date!.slice(0, 7);
    if (m.has(ym)) m.set(ym, r2(m.get(ym)! + Number(b.amount)));
  }
  return [...m.entries()].map(([month, amount]) => ({ month, amount }));
}

// ---------------------------------------------------------------- contracts

/** Monthly equivalent, for analytics only. Null when the contract has no fixed cycle. */
export function monthlyEquivalent(c: Pick<Contract, 'amount_per_billing' | 'billing_frequency'>): number | null {
  if (c.amount_per_billing == null) return null;
  const months = MONTHS_PER_CYCLE[c.billing_frequency];
  if (months == null) return null;
  return r2(Number(c.amount_per_billing) / months);
}

/** Dates a contract is expected to bill in a range, from its start date. Never invents
 *  dates for commission or one-off agreements. */
export function billingDates(c: Pick<Contract, 'billing_frequency' | 'start_date' | 'amount_per_billing'>, from: string, to: string) {
  const months = MONTHS_PER_CYCLE[c.billing_frequency];
  if (months == null || !c.start_date || c.amount_per_billing == null) return [];
  return schedule(c.start_date, months, from, to);
}

export function contractedIn(contracts: Contract[], from: string, to: string) {
  return contracts
    .filter((c) => c.status === 'active')
    .flatMap((c) => billingDates(c, from, to).map((on) => ({ contract: c, on, amount: Number(c.amount_per_billing) })));
}

// ---------------------------------------------------------------- expenses

/** Expense occurrences in a range. One-off rows land on their date; recurring rules
 *  expand by frequency from their first charge until their end date. */
export function expensesIn(expenses: Expense[], from: string, to: string) {
  const out: Array<Expense & { on: string }> = [];
  for (const x of expenses) {
    if (x.deleted) continue;
    if (!x.recurring || !x.frequency) {
      if (x.date >= from && x.date <= to) out.push({ ...x, on: x.date });
      continue;
    }
    for (const on of schedule(x.date, EXPENSE_MONTHS[x.frequency], from, to, x.end_date)) out.push({ ...x, on });
  }
  return out;
}

/** What a recurring rule costs per month on average. */
export function monthlyCost(x: Pick<Expense, 'amount' | 'recurring' | 'frequency'>) {
  if (!x.recurring || !x.frequency) return 0;
  return r2(Number(x.amount) / EXPENSE_MONTHS[x.frequency]);
}

// ---------------------------------------------------------------- payouts

export interface PayoutLine { personKey: string; hoursShare: number | null; amount: number }
export interface Payout {
  month: string;
  regime: 'fixed' | 'hours';
  revenue: number;
  pool: number;
  lines: PayoutLine[];
  explanation: string;
}

/** Partner payouts for a month. Through hours_based_from - 1: fixed shares of paid
 *  revenue. From hours_based_from: a pool of paid revenue split by share of logged hours.
 *  An old month is never recomputed under the new rule. */
export function payoutFor(
  month: string, revenue: number, settings: Settings, hoursByPerson: Record<string, number>,
): Payout {
  if (month < settings.hours_based_from) {
    const lines = Object.entries(settings.fixed_split).map(([personKey, share]) => ({
      personKey, hoursShare: null, amount: r2(revenue * Number(share)),
    }));
    return {
      month, regime: 'fixed', revenue, pool: r2(sum(lines.map((l) => l.amount))), lines,
      explanation: 'Fixed shares of paid revenue: ' +
        Object.entries(settings.fixed_split).map(([k, s]) => `${k} ${Math.round(Number(s) * 100)}%`).join(', '),
    };
  }
  const pool = r2(revenue * Number(settings.pool_pct));
  const keys = Object.keys(hoursByPerson).filter((k) => hoursByPerson[k] > 0);
  const totalH = sum(keys.map((k) => hoursByPerson[k]));
  const amounts = splitCents(pool, keys.map((k) => hoursByPerson[k]));
  return {
    month, regime: 'hours', revenue, pool,
    lines: keys.map((k, i) => ({ personKey: k, hoursShare: totalH ? hoursByPerson[k] / totalH : null, amount: amounts[i] })),
    explanation: `${Math.round(Number(settings.pool_pct) * 100)}% of paid revenue, split by share of logged hours`,
  };
}

/** Largest-remainder split so parts sum to the total exactly. */
export function splitCents(totalAmount: number, weights: number[]): number[] {
  const cents = Math.round(totalAmount * 100);
  const W = sum(weights);
  if (!W) return weights.map(() => 0);
  const raw = weights.map((w) => (cents * w) / W);
  const base = raw.map(Math.floor);
  let left = cents - sum(base);
  raw.map((v, i) => [v - base[i], i] as const).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  return base.map((c) => c / 100);
}

// ---------------------------------------------------------------- goal tracking

export interface GoalPace {
  goal: number;
  ytd: number;
  /** Where revenue would be today on a straight line to the goal. */
  targetToDate: number;
  /** Year-end if the year-to-date daily rate holds. */
  runRateYearEnd: number;
  remaining: number;
  /** Monthly revenue needed from next month to hit the goal. */
  neededPerMonth: number | null;
  pctOfGoal: number;
}

export function goalPace(goal: number, ytd: number, today: string): GoalPace {
  const year = Number(today.slice(0, 4));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const [y, m, d] = today.split('-').map(Number);
  const now = Date.UTC(y, m - 1, d + 1);
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const monthsLeft = 12 - m;
  const remaining = Math.max(0, r2(goal - ytd));
  return {
    goal, ytd,
    targetToDate: r2(goal * elapsed),
    runRateYearEnd: elapsed > 0 ? r2(ytd / elapsed) : 0,
    remaining,
    neededPerMonth: monthsLeft > 0 ? r2(remaining / monthsLeft) : null,
    pctOfGoal: goal ? ytd / goal : 0,
  };
}
