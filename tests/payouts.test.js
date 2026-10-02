// Checks the payout engine against the imported seed data.
// Run after `python3 scripts/build_seed.py`:  node tests/payouts.test.js
global.document = {documentElement:{}}; global.getComputedStyle = () => ({getPropertyValue:() => ''}); global.localStorage = {getItem:() => null, setItem(){}};
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), seed = f => JSON.parse(fs.readFileSync(path.join(root, 'data/seed', f + '.json')));
eval(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8') + `
S.settings = seed('settings'); S.taxonomy = seed('taxonomy'); S.clients = seed('clients').items; S.people = seed('people').items;
for (const f of fs.readdirSync(path.join(root, 'data/seed')).filter(f => f.startsWith('entries_'))) S.entryDocs[f.slice(8,15)] = seed(f.slice(0,-5));
for (const k of ['ledger','contracts','expenses']) S.fin[k] = seed(k).items;
const expect = {'2026-07':4736, '2026-08':5732, '2026-09':4650};   // cash collected per the revenue ledger
for (const [m, rev] of Object.entries(expect)){
  const P = payoutFor(m);
  assert.strictEqual(P.rev.eligible, rev, m + ' eligible revenue');
  assert.strictEqual(P.pool, r2(rev * 0.7), m + ' pool is 70%');
  assert.strictEqual(r2(sum(P.people, p => p.payout)), P.pool, m + ' payouts sum to the pool to the cent');
  console.log('ok', m, 'pool', P.pool, P.people.map(p => p.id + ' ' + p.payout).join(', '));
}
assert.strictEqual(payoutFor('2026-03').rev.other, 150, 'bank bonus is other income, outside the pool');
console.log('ok all payout checks');
`);
