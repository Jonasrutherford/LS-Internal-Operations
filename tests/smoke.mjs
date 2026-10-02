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

console.log('\nERRORS (' + errors.length + '):');
console.log(errors.slice(0, 12).join('\n') || '  none');
await browser.close();
process.exit(errors.length ? 1 : 0);
