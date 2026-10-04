// Finance, taxonomy and time-analytics checks. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  monthlyEquivalent, billingDates, expensesIn, splitCents, payoutFor, goalPace, paidIn, monthlyCost, total,
} from '../lib/finance.ts';
import { categoriesFor, tasksFor, expectedMinutes } from '../lib/taxonomy.ts';
import { completedWorkItems, entrySeconds, openWork, varianceSummary } from '../lib/work.ts';
import { laInstant, resolveRange, laDate } from '../lib/time.ts';

// ---------------------------------------------------------------- contracts

const contract = (over = {}) => ({ id: 'c1', client_id: 'cl1', type: 'retainer', billing_frequency: 'monthly', amount_per_billing: 100, percent_commission: null, start_date: '2026-01-15', status: 'active', ...over });

test('quarterly contracts stay quarterly; monthly equivalent is analytics only', () => {
  const q = contract({ billing_frequency: 'quarterly', amount_per_billing: 300 });
  assert.equal(monthlyEquivalent(q), 100);
  assert.equal(billingDates(q, '2026-01-01', '2026-12-31').length, 4);
});

test('no billing dates are invented for commission contracts', () => {
  const c = contract({ type: 'ad_commission', billing_frequency: 'commission', amount_per_billing: null, percent_commission: 10 });
  assert.deepEqual(billingDates(c, '2026-01-01', '2026-12-31'), []);
  assert.equal(monthlyEquivalent(c), null);
});

test('billing day clamps to short months', () => {
  assert.deepEqual(billingDates(contract({ start_date: '2026-01-31' }), '2026-01-01', '2026-03-31'), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

// ---------------------------------------------------------------- expenses

const exp = (over = {}) => ({ id: 'e', category: 'contractor', vendor: 'Melanie Lee', amount: 400, recurring: true, frequency: 'monthly', date: '2026-10-01', end_date: null, deleted: false, ...over });

test('Melanie $400 and Sofia $600 a month are each a recurring cost', () => {
  const rules = [exp(), exp({ id: 's', vendor: 'Sofia Burke', amount: 600 })];
  const q4 = expensesIn(rules, '2026-10-01', '2026-12-31');
  assert.equal(q4.length, 6);
  assert.equal(q4.reduce((a, x) => a + x.amount, 0), 3000);
  assert.equal(monthlyCost(rules[0]) + monthlyCost(rules[1]), 1000);
});

test('annual subscriptions recur yearly and average monthly', () => {
  const a = exp({ category: 'software', vendor: 'Framer', amount: 360, frequency: 'annually', date: '2027-02-18' });
  assert.equal(expensesIn([a], '2027-01-01', '2028-12-31').length, 2);
  assert.equal(monthlyCost(a), 30);
});

test('recurring rules stop at their end date; deleted rows never count', () => {
  assert.equal(expensesIn([exp({ end_date: '2026-11-15' })], '2026-10-01', '2026-12-31').length, 2);
  assert.equal(expensesIn([exp({ deleted: true })], '2026-10-01', '2026-12-31').length, 0);
});

// ---------------------------------------------------------------- revenue and payouts

const bill = (over = {}) => ({ id: 'b', client_id: 'c', contract_id: null, kind: 'retainer', status: 'paid', amount: 1000, invoice_date: '2026-10-01', paid_date: '2026-10-03', deleted: false, ...over });

test('revenue counts on the paid date, receivables do not count', () => {
  const ev = [bill(), bill({ id: 'x', status: 'invoiced', paid_date: null }), bill({ id: 'y', deleted: true })];
  assert.equal(total(paidIn(ev, '2026-10-01', '2026-10-31')), 1000);
  assert.equal(total(paidIn(ev, '2026-09-01', '2026-09-30')), 0);
});

const settings = { pool_pct: 0.65, hours_based_from: '2026-10', fixed_split: { carter: 0.4, jonas: 0.3 }, baseline_date: '2026-10-01' };

test('payouts before October use fixed shares, never hours', () => {
  const p = payoutFor('2026-09', 10000, settings, { carter: 1, jonas: 99 });
  assert.equal(p.regime, 'fixed');
  assert.deepEqual(p.lines.map((l) => l.amount), [4000, 3000]);
});

test('payouts from October split a 65% pool by hours, to the cent', () => {
  const p = payoutFor('2026-10', 1000, settings, { carter: 2, jonas: 1 });
  assert.equal(p.pool, 650);
  assert.equal(p.lines.reduce((a, l) => a + l.amount, 0), 650);
  assert.equal(p.lines.find((l) => l.personKey === 'carter').amount, 433.33);
});

test('splitCents sums exactly', () => {
  assert.equal(splitCents(100, [1, 1, 1]).reduce((a, b) => a + b, 0), 100);
});

test('goal pace: straight line to the goal and what is still needed', () => {
  const g = goalPace(120000, 60000, '2026-06-30');
  assert.ok(Math.abs(g.targetToDate - 59506.85) < 1);
  assert.equal(g.remaining, 60000);
  assert.equal(g.neededPerMonth, 10000);
});

// ---------------------------------------------------------------- taxonomy filtering

const cats = [
  { id: 'i1', eligibility: 'internal', contexts: [], active: true, sort_order: 1 },
  { id: 'x1', eligibility: 'external', contexts: ['client'], active: true, sort_order: 2 },
  { id: 'x2', eligibility: 'external', contexts: ['prospect'], active: true, sort_order: 3 },
  { id: 'b1', eligibility: 'both', contexts: ['client'], active: true, sort_order: 4 },
  { id: 'gone', eligibility: 'internal', contexts: [], active: false, sort_order: 5 },
];

test('Internal never shows external-only categories', () => {
  assert.deepEqual(categoriesFor(cats, 'internal', null).map((c) => c.id), ['i1', 'b1']);
});

test('External shows only categories for the chosen relationship', () => {
  assert.deepEqual(categoriesFor(cats, 'external', 'client').map((c) => c.id), ['x1', 'b1']);
  assert.deepEqual(categoriesFor(cats, 'external', 'prospect').map((c) => c.id), ['x2']);
  assert.deepEqual(categoriesFor(cats, 'external', null), []);
});

test('tasks in a Both category follow their own eligibility', () => {
  const types = [
    { id: 't1', category_id: 'b1', eligibility: 'both', active: true, sort_order: 1 },
    { id: 't2', category_id: 'b1', eligibility: 'internal', active: true, sort_order: 2 },
    { id: 't3', category_id: 'b1', eligibility: 'external', active: false, sort_order: 3 },
  ];
  assert.deepEqual(tasksFor(types, 'b1', 'external').map((t) => t.id), ['t1']);
  assert.deepEqual(tasksFor(types, 'b1', 'internal').map((t) => t.id), ['t1', 't2']);
});

test('expected time scales by deliverable count, and needs a count', () => {
  const email = { has_deliverable: true, expected_minutes: 43.2 };
  assert.equal(expectedMinutes(email, 3), 129.6);
  assert.equal(expectedMinutes(email, null), null);
  assert.equal(expectedMinutes({ has_deliverable: false, expected_minutes: 30 }, null), 30);
});

// ---------------------------------------------------------------- work items

const entry = (over) => ({
  id: Math.random().toString(36), person_id: 'p', work_type: 'external', entity_kind: 'client', client_id: 'c', prospect_id: null, partner_id: null,
  category_id: 'x1', task_type_id: 'web', custom_task_name: null, paused_seconds: 0, paused_at: null, status: 'finished',
  deliverable_qty: null, parallel_of: null, deleted: false, ...over,
});

test('a task worked over several sessions is measured once, in full', () => {
  const types = new Map([['web', { id: 'web', has_deliverable: false, expected_minutes: 120 }]]);
  const es = [
    entry({ started_at: '2026-10-01T16:00:00Z', ended_at: '2026-10-01T17:00:00Z', status: 'in_progress' }),
    entry({ started_at: '2026-10-02T16:00:00Z', ended_at: '2026-10-02T17:30:00Z', status: 'finished' }),
  ];
  const items = completedWorkItems(es, types);
  assert.equal(items.length, 1);
  assert.equal(items[0].actualSeconds, 9000);
  const v = varianceSummary(items);
  assert.equal(Math.round(v.ratio * 100), 25);
  assert.equal(v.withinPct, 0);
});

test('open work is the latest unfinished session; parallel work never counts as capacity', () => {
  const es = [
    entry({ started_at: '2026-10-01T16:00:00Z', ended_at: '2026-10-01T17:00:00Z', status: 'in_progress' }),
    entry({ task_type_id: 'other', started_at: '2026-10-01T16:00:00Z', ended_at: '2026-10-01T17:00:00Z', status: 'in_progress', parallel_of: 'x' }),
  ];
  assert.equal(openWork(es).length, 1);
});

test('paused time is excluded', () => {
  assert.equal(entrySeconds({ started_at: '2026-10-01T10:00:00Z', ended_at: '2026-10-01T12:00:00Z', paused_seconds: 600, paused_at: null }), 6600);
});

// ---------------------------------------------------------------- time zone

test('Los Angeles day boundaries hold across daylight saving', () => {
  assert.equal(laInstant('2026-07-01', '00:00').toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(laInstant('2026-12-01', '00:00').toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(laDate('2026-10-02T06:30:00Z'), '2026-10-01');
});

test('custom ranges are ordered and validated', () => {
  const r = resolveRange('custom', '2026-09-30', '2026-01-01');
  assert.equal(r.from, '2026-01-01');
  assert.equal(r.to, '2026-09-30');
});
