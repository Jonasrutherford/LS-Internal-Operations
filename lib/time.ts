// Lucid Studio runs on Los Angeles time. Every day boundary, week and month in
// LS Command is computed here so the server, the browser and the charts agree.

export const TZ = 'America/Los_Angeles';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar date (YYYY-MM-DD) in Los Angeles for an instant. */
export function laDate(at: string | number | Date = new Date()): string {
  return dateFmt.format(new Date(at));
}

/** Minutes the LA wall clock is behind UTC at an instant (420 or 480). */
function laOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((at.getTime() - wall) / 60000);
}

/** The UTC instant of an LA wall-clock date and time ("2026-10-03", "09:30"). */
export function laInstant(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = laOffsetMinutes(guess);
  const first = new Date(guess.getTime() + off * 60000);
  // Re-check across a DST boundary.
  const off2 = laOffsetMinutes(first);
  return off2 === off ? first : new Date(guess.getTime() + off2 * 60000);
}

/** LA wall-clock "HH:MM" for an instant. */
export function laTime(at: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(at));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Monday of the LA week containing date. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let ym = from.slice(0, 7);
  const end = to.slice(0, 7);
  for (let g = 0; g < 600 && ym <= end; g++) { out.push(ym); ym = addMonths(ym, 1); }
  return out;
}

export type RangeKey =
  | 'today' | 'week' | 'month' | 'last_month' | '90d' | 'ytd' | 'this_year' | 'prev_year' | 'all' | 'custom';

export interface DateRange { key: RangeKey; from: string; to: string; label: string }

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today', week: 'This week', month: 'This month', last_month: 'Last month', '90d': 'Last 90 days',
  ytd: 'Year to date', this_year: 'This year', prev_year: 'Previous year', all: 'All time', custom: 'Custom',
};

/** Earliest date any LS Command record can carry. */
export const EPOCH = '2025-01-01';

export function resolveRange(
  key: string | undefined, fromParam?: string, toParam?: string, fallback: RangeKey = 'month',
): DateRange {
  const today = laDate();
  const year = today.slice(0, 4);
  const k = (key && key in RANGE_LABEL ? key : fallback) as RangeKey;
  const r = (from: string, to: string): DateRange => ({ key: k, from, to, label: RANGE_LABEL[k] });
  switch (k) {
    case 'today': return r(today, today);
    case 'week': return r(weekStart(today), today);
    case 'month': return r(`${today.slice(0, 7)}-01`, today);
    case 'last_month': {
      const ym = addMonths(today.slice(0, 7), -1);
      return r(`${ym}-01`, lastDayOfMonth(ym));
    }
    case '90d': return r(addDays(today, -89), today);
    case 'ytd': return r(`${year}-01-01`, today);
    case 'this_year': return r(`${year}-01-01`, `${year}-12-31`);
    case 'prev_year': return r(`${Number(year) - 1}-01-01`, `${Number(year) - 1}-12-31`);
    case 'all': return r(EPOCH, today);
    case 'custom': {
      const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const from = ok(fromParam) ? fromParam! : `${today.slice(0, 7)}-01`;
      const to = ok(toParam) ? toParam! : today;
      return from <= to
        ? { key: 'custom', from, to, label: `${fmtDate(from)} to ${fmtDate(to)}` }
        : { key: 'custom', from: to, to: from, label: `${fmtDate(to)} to ${fmtDate(from)}` };
    }
  }
}

/** [from 00:00 LA, day after `to` 00:00 LA) as ISO instants, for timestamptz filters. */
export function rangeInstants(r: { from: string; to: string }) {
  return { start: laInstant(r.from).toISOString(), end: laInstant(addDays(r.to, 1)).toISOString() };
}

export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

export function fmtMonth(ym: string, long = false) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', {
    month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC',
  });
}
