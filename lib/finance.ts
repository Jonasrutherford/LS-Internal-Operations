import type { BillingFrequency, Contract, Expense, RevenueLine } from './types';

/** Months per billing cycle. Used to derive monthly-equivalent figures for analytics.
 *  The contract itself always keeps its real frequency, section 35. */
export const MONTHS_PER_CYCLE: Record<BillingFrequency, number | null> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
  one_off: null,
  commission: null,
};

export const FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Biannually',
  annually: 'Annually',
  one_off: 'One-off',
  commission: 'Commission',
};

export const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const lastDayOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Monthly-equivalent value of a contract, for analytics only.
 *  Returns null when the contract has no fixed cycle, such as commission or
 *  per-unit work, rather than guessing a number. */
export function monthlyEquivalent(c: Contract): number | null {
  if (c.amount_per_billing == null) return null;
  const months = MONTHS_PER_CYCLE[c.billing_frequency];
  if (months == null) return null;
  return r2(c.amount_per_billing / months);
}

/** The dates a contract is expected to bill between two dates, derived from its
 *  start date, section 49. Never invents a payment date for a contract with no
 *  fixed cycle. */
export function billingDates(c: Contract, from: string, to: string): string[] {
  const months = MONTHS_PER_CYCLE[c.billing_frequency];
  if (months == null || !c.start_date) return [];

  const billingDay = Number(c.start_date.slice(8, 10));
  const out: string[] = [];
  let ym = c.start_date.slice(0, 7);

  for (let guard = 0; guard < 400; guard++) {
    const day = Math.min(billingDay, lastDayOf(ym));
    const date = `${ym}-${String(day).padStart(2, '0')}`;
    if (date > to) break;
    if (date >= from && date >= c.start_date) out.push(date);
    ym = addMonths(ym, months);
  }
  return out;
}

/** Expense occurrences in a range. One-off rows land on their own date; recurring
 *  rules are expanded by frequency. Ported from expensesIn in the original core.js. */
export function expensesIn(expenses: Expense[], from: string, to: string) {
  const out: Array<Expense & { on: string }> = [];

  for (const x of expenses) {
    if (x.deleted) continue;

    if (!x.recurring) {
      if (x.date && x.date >= from && x.date <= to) out.push({ ...x, on: x.date });
      continue;
    }

    const months = x.frequency ? MONTHS_PER_CYCLE[x.frequency] : 1;
    if (months == null) continue;

    const day = Number(x.date.slice(8, 10));
    let ym = x.date.slice(0, 7);

    for (let guard = 0; guard < 400; guard++) {
      const d = `${ym}-${String(Math.min(day, lastDayOf(ym))).padStart(2, '0')}`;
      if (d > to) break;
      if (d >= from && d >= x.date) out.push({ ...x, on: d });
      ym = addMonths(ym, months);
    }
  }
  return out;
}

/** Largest-remainder split so parts sum to the total exactly. Kept from the
 *  original core.js: it is a general money utility, not part of the retired
 *  compensation model. */
export function splitCents(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const W = sum(weights);
  if (!W) return weights.map(() => 0);

  const raw = weights.map((w) => (cents * w) / W);
  const base = raw.map(Math.floor);
  let left = cents - sum(base);

  raw
    .map((v, i) => [v - base[i], i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) { base[i]++; left--; }
    });

  return base.map((c) => c / 100);
}

export interface ClientShare {
  client_id: string | null;
  amount: number;
  share: number;
}

/** Revenue share by client for the pie on the Revenue page, section 50. */
export function revenueShareByClient(lines: RevenueLine[]): ClientShare[] {
  const live = lines.filter((l) => !l.deleted);
  const total = sum(live.map((l) => l.amount));
  if (!total) return [];

  const byClient = new Map<string | null, number>();
  for (const l of live) {
    byClient.set(l.client_id, (byClient.get(l.client_id) ?? 0) + l.amount);
  }

  return [...byClient.entries()]
    .map(([client_id, amount]) => ({ client_id, amount: r2(amount), share: amount / total }))
    .sort((a, b) => b.amount - a.amount);
}

export interface VarianceStats {
  n: number;
  estimated: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  meanVariance: number;
  stdDev: number | null;
  /** True when there is too little data to report, section 39. */
  insufficient: boolean;
}

/** Estimated versus actual time, section 39. Returns insufficient rather than a
 *  fabricated figure when there is not enough data. Standard deviation needs at
 *  least two samples to mean anything. */
export function varianceStats(
  samples: Array<{ estimatedHours: number; actualHours: number }>,
): VarianceStats {
  const usable = samples.filter((s) => s.estimatedHours > 0);
  const n = usable.length;

  if (n === 0) {
    return {
      n: 0, estimated: 0, actual: 0, variance: 0, variancePct: null,
      meanVariance: 0, stdDev: null, insufficient: true,
    };
  }

  const estimated = r2(sum(usable.map((s) => s.estimatedHours)));
  const actual = r2(sum(usable.map((s) => s.actualHours)));
  const variance = r2(actual - estimated);
  const deltas = usable.map((s) => s.actualHours - s.estimatedHours);
  const meanVariance = r2(sum(deltas) / n);

  const stdDev =
    n < 2
      ? null
      : r2(Math.sqrt(sum(deltas.map((d) => (d - meanVariance) ** 2)) / (n - 1)));

  return {
    n,
    estimated,
    actual,
    variance,
    variancePct: estimated ? r2((variance / estimated) * 100) : null,
    meanVariance,
    stdDev,
    insufficient: n < 2,
  };
}

/** Billable seconds for an entry, excluding paused time. */
export function entrySeconds(started_at: string, ended_at: string | null, paused_seconds: number) {
  const end = ended_at ? new Date(ended_at).getTime() : Date.now();
  const raw = Math.max(0, (end - new Date(started_at).getTime()) / 1000);
  return Math.max(0, Math.round(raw - paused_seconds));
}

export function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
