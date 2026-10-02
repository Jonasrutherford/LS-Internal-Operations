// Math checks for the ported finance helpers. These replace the old payout test,
// which cannot run here: it needs the spreadsheets in data/, which are deliberately
// kept out of git. See README.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  monthlyEquivalent, billingDates, expensesIn, splitCents,
  revenueShareByClient, varianceStats, entrySeconds,
} from '../lib/finance.ts';

const contract = (over = {}) => ({
  id: 'c1', client_id: 'cl1', type: 'retainer', billing_frequency: 'monthly',
  amount_per_billing: 100, percent_commission: null, start_date: '2026-01-15',
  active: true, ...over,
});

test('quarterly contracts are not silently turned into monthly ones', () => {
  const q = contract({ billing_frequency: 'quarterly', amount_per_billing: 300 });
  assert.equal(q.billing_frequency, 'quarterly');
  assert.equal(monthlyEquivalent(q), 100);            // analytics only
  assert.equal(billingDates(q, '2026-01-01', '2026-12-31').length, 4);
});

test('biannual bills twice a year, annual once', () => {
  assert.equal(billingDates(contract({ billing_frequency: 'biannually' }), '2026-01-01', '2026-12-31').length, 2);
  assert.equal(billingDates(contract({ billing_frequency: 'annually' }), '2026-01-01', '2026-12-31').length, 1);
});

test('no payment dates are invented for commission contracts', () => {
  const c = contract({ type: 'ad_commission', billing_frequency: 'commission', amount_per_billing: null, percent_commission: 20 });
  assert.deepEqual(billingDates(c, '2026-01-01', '2026-12-31'), []);
  assert.equal(monthlyEquivalent(c), null);
});

test('billing day clamps to short months', () => {
  const c = contract({ start_date: '2026-01-31' });
  const dates = billingDates(c, '2026-01-01', '2026-03-31');
  assert.deepEqual(dates, ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('recurring expenses expand, one-off expenses do not', () => {
  const recurring = { id: 'e1', category: 'software', vendor: 'Adobe', label: 'Adobe', amount: 60, recurring: true, frequency: 'monthly', date: '2026-01-05', deleted: false };
  const once = { id: 'e2', category: 'other', vendor: null, label: 'Filing fee', amount: 800, recurring: false, frequency: null, date: '2026-02-10', deleted: false };
  assert.equal(expensesIn([recurring], '2026-01-01', '2026-06-30').length, 6);
  assert.equal(expensesIn([once], '2026-01-01', '2026-06-30').length, 1);
  assert.equal(expensesIn([once], '2026-03-01', '2026-06-30').length, 0);
});

test('deleted expenses are excluded', () => {
  const gone = { id: 'e3', category: 'other', vendor: null, label: 'x', amount: 10, recurring: false, frequency: null, date: '2026-01-02', deleted: true };
  assert.equal(expensesIn([gone], '2026-01-01', '2026-12-31').length, 0);
});

test('splitCents sums to the total exactly', () => {
  const parts = splitCents(1000, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(splitCents(100, [0, 0]), [0, 0]);
});

test('revenue share sums to one', () => {
  const line = (id, client_id, amount) => ({ id, client_id, contract_id: null, kind: 'recurring', amount, date: '2026-01-01', collected: true, description: null, deleted: false });
  const shares = revenueShareByClient([line('1', 'a', 300), line('2', 'b', 100)]);
  assert.equal(shares[0].client_id, 'a');
  assert.equal(shares[0].share, 0.75);
  assert.equal(shares.reduce((a, s) => a + s.share, 0), 1);
});

test('variance reports insufficient data instead of inventing numbers', () => {
  assert.equal(varianceStats([]).insufficient, true);
  assert.equal(varianceStats([]).stdDev, null);
  assert.equal(varianceStats([{ estimatedHours: 2, actualHours: 3 }]).stdDev, null);
  const s = varianceStats([
    { estimatedHours: 2, actualHours: 3 },
    { estimatedHours: 2, actualHours: 1 },
  ]);
  assert.equal(s.insufficient, false);
  assert.equal(s.variance, 0);
  assert.equal(s.n, 2);
});

test('estimates of zero are ignored rather than counted as perfect', () => {
  assert.equal(varianceStats([{ estimatedHours: 0, actualHours: 5 }]).n, 0);
});

test('paused time is excluded from an entry', () => {
  const secs = entrySeconds('2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 600);
  assert.equal(secs, 7200 - 600);
});
