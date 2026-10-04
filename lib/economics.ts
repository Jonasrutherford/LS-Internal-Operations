// Client economics: revenue against the labor it consumed. Labor is priced at the
// period's effective payout per hour (partner payouts divided by all logged hours),
// the same definition the Clients page states on screen.

import { isPaid, isReceivable, payoutFor, r2, recognizedIn, total } from './finance';
import type { Finance } from './data';
import { monthsBetween, laDate } from './time';
import { counts, entrySeconds } from './work';
import type { Catalog, TimeEntry } from './types';

export function payoutsForRange(fin: Finance, entries: TimeEntry[], catalog: Catalog, from: string, to: string) {
  const months = monthsBetween(from, to);
  return months.map((ym) => {
    const revenue = total(fin.billing.filter((b) => isPaid(b) && b.paid_date!.slice(0, 7) === ym));
    const hrs: Record<string, number> = {};
    for (const e of entries) {
      if (!counts(e) || laDate(e.started_at).slice(0, 7) !== ym) continue;
      const p = catalog.people.find((x) => x.id === e.person_id);
      const key = p?.legacy_key ?? p?.name.toLowerCase() ?? e.person_id;
      hrs[key] = (hrs[key] ?? 0) + entrySeconds(e) / 3600;
    }
    return { ...payoutFor(ym, revenue, fin.settings, hrs), hours: hrs };
  });
}

export interface ClientRow {
  id: string; name: string; color: string | null; active: boolean;
  paid: number; recognized: number; ar: number; hours: number; revPerHour: number | null;
  laborCost: number; contribution: number; margin: number | null; contract: string | null; entries: number;
}

export function clientEconomics(fin: Finance, entries: TimeEntry[], catalog: Catalog, from: string, to: string) {
  const inRange = entries.filter((e) => counts(e) && laDate(e.started_at) >= from && laDate(e.started_at) <= to);
  // Price labor only from months that have logged time. A month with revenue but no
  // hours (before the logging baseline, for example) says nothing about hourly cost.
  const payouts = payoutsForRange(fin, entries, catalog, from, to);
  const counted = payouts.filter((p) => Object.values(p.hours).reduce((a, h) => a + h, 0) > 0);
  const totalHours = counted.reduce((a, p) => a + Object.values(p.hours).reduce((x, h) => x + h, 0), 0);
  const payoutTotal = r2(counted.reduce((a, p) => a + p.pool, 0));
  const rate = totalHours > 0 ? payoutTotal / totalHours : null;
  const excludedMonths = payouts.length - counted.length;

  const rows: ClientRow[] = catalog.clients.map((c) => {
    const ev = fin.billing.filter((b) => b.client_id === c.id);
    const paid = total(ev.filter((b) => isPaid(b) && b.paid_date! >= from && b.paid_date! <= to));
    const recognized = total(recognizedIn(ev, from, to));
    const ar = total(ev.filter(isReceivable));
    const ce = inRange.filter((e) => e.client_id === c.id);
    const hours = ce.reduce((a, e) => a + entrySeconds(e), 0) / 3600;
    const laborCost = rate != null ? r2(hours * rate) : 0;
    const contribution = r2(paid - laborCost);
    const k = fin.contracts.find((x) => x.client_id === c.id && x.status === 'active');
    return {
      id: c.id, name: c.name, color: c.brand_color, active: c.active, paid, recognized, ar, hours,
      revPerHour: hours > 0 ? paid / hours : null, laborCost, contribution, margin: paid > 0 ? contribution / paid : null,
      contract: k ? k.type : null, entries: ce.length,
    };
  }).filter((r) => r.paid || r.recognized || r.hours || r.ar);

  return { rows: rows.sort((a, b) => b.paid - a.paid), rate, payoutTotal, totalHours, payouts, excludedMonths };
}
