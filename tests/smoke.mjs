/* Loads the built page in a real browser with the seed preloaded, then walks the
 * app the way a person would. Catches runtime errors that a syntax check cannot. */
import pw from '/opt/npm-tools/node_modules/playwright/index.js';
const { chromium } = pw;
import fs from 'node:fs';
import path from 'node:path';

const PAGE = path.resolve('standalone/site/index.html');
const SEED = JSON.parse(fs.readFileSync('out/ls-command-seed.json', 'utf8'));

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

// Preload the store so the gate does not appear.
await page.addInitScript(docs => {
  localStorage.setItem('lucidos.store.v1', JSON.stringify(docs));
}, SEED.documents);

await page.goto('file://' + PAGE);
await page.waitForTimeout(1200);

// The person gate appears first; claim Carter.
const gate = await page.locator('[data-act="claim"]').count();
if (gate) { await page.locator('[data-act="claim"]').first().click(); await page.waitForTimeout(800); }

const nav = await page.locator('#rail a[data-go]').allTextContents();
console.log('nav:', nav.join(' | ') || '(none)');

const results = [];
for (const id of ['me','track','entries','board','performance','projections','revenue','payouts','contracts','settings','admin']) {
  await page.evaluate(v => location.hash = '#' + v, id);
  await page.waitForTimeout(450);
  const h1 = await page.locator('#main h1').first().textContent().catch(() => null);
  const empty = await page.locator('#main').textContent();
  results.push(`${id.padEnd(12)} ${h1 ? 'h1="' + h1.trim() + '"' : 'NO H1'}  ${empty.trim().length} chars`);
}
console.log(results.join('\n'));

// The critical path: open the start sheet.
await page.evaluate(() => location.hash = '#track');
await page.waitForTimeout(500);
const startBtn = page.locator('[data-act="start"]').first();
console.log('start button visible:', await startBtn.count() > 0);
if (await startBtn.count()) {
  await startBtn.click();
  await page.waitForTimeout(600);
  const modal = await page.locator('#modal h2').textContent().catch(() => null);
  console.log('start modal:', modal);
  console.log('scope buttons:', await page.locator('#st-scope .seg-b').count());
  console.log('category options:', await page.locator('#st-cat option').count());
}

// Client pickers must not offer Internal, and must not offer retired clients.
await page.evaluate(() => location.hash = '#performance');
await page.waitForTimeout(500);
await page.evaluate(() => { try { closeModal(); } catch {} });
await page.waitForTimeout(250);
const filterClients = await page.locator('#f-client option').allTextContents();
console.log('\nfilter clients:', filterClients.join(' | '));
const bad = filterClients.filter(t => /internal|Casa Barranca|HMD|Hospital Procedure|Dawn|Solid Supply/i.test(t));
console.log(bad.length ? 'FAIL leaked into client filter: ' + bad.join(', ') : 'OK: no internal or retired clients in the filter');
console.log('scope filter present:', await page.locator('#f-scope').count() > 0);

// Category must narrow the task list.
await page.evaluate(() => { try { closeModal(); } catch {} });
await page.waitForTimeout(300);
await page.evaluate(() => location.hash = '#track');
await page.waitForTimeout(400);
await page.locator('[data-act="start"]').first().click();
await page.waitForTimeout(500);
const allTypes = await page.evaluate(() => { comboList('st-type',''); return document.querySelectorAll('[data-combo="st-type"] .opt').length; });
await page.selectOption('#st-cat', 'Client reporting');
await page.waitForTimeout(250);
const narrowed = await page.evaluate(() => { comboList('st-type',''); return document.querySelectorAll('[data-combo="st-type"] .opt').length; });
console.log(`task types: ${allTypes} unfiltered -> ${narrowed} under "Client reporting"`,
  narrowed > 0 && narrowed < allTypes ? 'OK' : 'FAIL');

// Full start flow.
await page.evaluate(() => { const o=[...document.querySelectorAll('[data-combo="st-type"] .opt')][0]; pickType('st-type', o.dataset.code); });
await page.selectOption('#st-client', { index: 1 });
await page.locator('[data-act="start-go"]').click();
await page.waitForTimeout(700);
const running = await page.locator('.timer.on').count();
console.log('timer started:', running > 0 ? 'OK' : 'FAIL');
if (running) {
  await page.locator('[data-act="pause"]').click(); await page.waitForTimeout(300);
  console.log('paused state shown:', await page.locator('.state-pill.is-paused').count() > 0 ? 'OK' : 'FAIL');
  await page.locator('[data-act="resume"]').click(); await page.waitForTimeout(300);
  await page.locator('[data-act="stop"]').click(); await page.waitForTimeout(600);
  const stopFields = await page.evaluate(() => ({
    person: !!document.querySelector('#ed-person')?.offsetParent,
    deliverable: !!document.querySelector('#ed-deliv'),
    done: !!document.querySelector('#ed-done'),
    joint: !!document.querySelector('#ed-joint'),
  }));
  console.log('stop sheet:', JSON.stringify(stopFields),
    (!stopFields.person && stopFields.deliverable && stopFields.done && stopFields.joint) ? 'OK' : 'FAIL');
}

console.log('\nERRORS (' + errors.length + '):');
console.log(errors.slice(0, 12).join('\n') || '  none');
await browser.close();
process.exit(errors.length ? 1 : 0);
