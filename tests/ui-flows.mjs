// Drives the real UI against tests/mock-supabase.mjs and checks the logging rules.
//   node tests/mock-supabase.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 NEXT_PUBLIC_SUPABASE_ANON_KEY=mock npx next dev -p 3100 &
//   node tests/ui-flows.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const SHOTS = process.argv[2];
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];

async function session(email, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) errors.push(`${email} console: ${m.text().slice(0, 200)}`); });
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'mock-password');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30000 }), page.click('button[type=submit]')]);
  return { ctx, page };
}

const optionTexts = (page, sel) => page.$$eval(`${sel} option`, (os) => os.map((o) => o.textContent.trim()));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

// ---------------------------------------------------------------- admin
const { page } = await session('admin@lucidstudiollc.com');

await check('dashboard says LS Command and greets the person', async () => {
  await page.goto(`${BASE}/`);
  assert.match(await page.title(), /LS Command/);
  assert.ok((await page.textContent('h1')).includes('Carter'));
  assert.ok(!(await page.content()).includes('Lucid OS'));
  await shot(page, '01-dashboard');
});

await check('start timer: Internal shows only internal fields', async () => {
  await page.goto(`${BASE}/log`);
  await page.click('header button:has-text("Start timer")');
  await page.click('.sheet button[data-wt="internal"]');
  assert.equal(await page.$('#start-entity'), null, 'no client/prospect selector for internal');
  assert.equal(await page.$('text=Who is it for?'), null);
  const cats = await optionTexts(page, '#start-cat');
  assert.ok(cats.includes('SOPs & Process Documentation'));
  assert.ok(cats.includes('Project Management'), 'Both category appears');
  for (const ext of ['Service Fulfillment', 'Sales & Outreach', 'Client Communication', 'Content Creation for Clients']) assert.ok(!cats.includes(ext), `${ext} hidden`);
  await page.selectOption('#start-cat', { label: 'SOPs & Process Documentation' });
  const tasks = await optionTexts(page, '#start-task');
  assert.deepEqual(tasks.filter((t) => !/Choose|Not listed/.test(t)), ['Create SOP', 'Update SOP']);
  await shot(page, '02-start-internal');
});

await check('switching Internal to External clears internal selections', async () => {
  await page.click('.sheet button[data-wt="external"]');
  assert.equal(await page.$('#start-cat'), null, 'category hidden until relationship chosen');
  await page.click('.sheet button:has-text("Client")');
  assert.ok(await page.$('#start-entity'));
  assert.equal(await page.$('#start-cat'), null, 'category hidden until client chosen');
  await page.selectOption('#start-entity', { label: 'EQUIPT Movement' });
  const clients = await optionTexts(page, '#start-entity');
  assert.ok(!clients.some((c) => /internal|Lucid Studio|leads/i.test(c)), 'Lucid Studio is never a client');
  assert.ok(!clients.includes('Solid Supply Inc.'), 'former clients hidden');
  const cats = await optionTexts(page, '#start-cat');
  assert.ok(cats.includes('Service Fulfillment'));
  assert.ok(cats.includes('Project Management'), 'Both category for client work');
  for (const int of ['SOPs & Process Documentation', 'Hiring & Recruiting', 'Sales & Outreach']) assert.ok(!cats.includes(int), `${int} hidden for client work`);
  await shot(page, '03-start-external-client');
});

await check('prospect context offers only pipeline categories and general prospecting', async () => {
  await page.click('.sheet button:has-text("Prospect")');
  const ents = await optionTexts(page, '#start-entity');
  assert.ok(ents[0].includes('General prospecting'));
  assert.ok(ents.includes('Mesa Coffee'));
  const cats = await optionTexts(page, '#start-cat');
  assert.ok(cats.includes('Sales & Outreach') && cats.includes('Discovery Calls'));
  assert.ok(!cats.includes('Service Fulfillment'));
});

await check('start an external client timer and see it running', async () => {
  await page.click('.sheet button:has-text("Client")');
  await page.selectOption('#start-entity', { label: 'EQUIPT Movement' });
  await page.selectOption('#start-cat', { label: 'Service Fulfillment' });
  await page.selectOption('#start-task', { label: 'Email (AI-built, end to end)' });
  assert.ok((await page.textContent('.sheet')).includes('per email'));
  await page.click('.sheet button:has-text("Start")');
  await page.waitForSelector('header button:has-text("Stop")', { timeout: 15000 });
  assert.ok((await page.textContent('header')).includes('Email (AI-built, end to end)'));
  await shot(page, '04-timer-running');
});

await check('stop asks only what is not known; deliverable count appears for email', async () => {
  await page.click('header button:has-text("Stop")');
  const sheet = await page.textContent('.sheet');
  for (const absent of ['Billable', 'Revision', 'Approved', 'Payout', 'Note']) assert.ok(!sheet.includes(absent), `${absent} not asked`);
  assert.equal(await page.$('.sheet input[type=date]'), null, 'no date');
  assert.equal(await page.$('.sheet input[type=time]'), null, 'no times');
  assert.ok(sheet.includes('How many emails?'));
  assert.ok(sheet.includes('Contract deliverable'));
  await page.fill('.sheet input[type=number]', '3');
  await page.click('.sheet label:has-text("Parallel task") input');
  await page.click('.sheet .panel button[data-wt="internal"]');
  await page.selectOption('#par-cat', { label: 'Internal Operations' });
  await page.selectOption('#par-task', { label: 'Time logging and admin' });
  await shot(page, '05-stop-sheet');
  await page.click('.sheet button:has-text("Save time")');
  await page.waitForSelector('header button:has-text("Start timer")', { timeout: 15000 });
});

await check('saved entry appears in Time Log with quantity and filters work', async () => {
  await page.goto(`${BASE}/time-log`);
  const txt = await page.textContent('main');
  assert.ok(txt.includes('Email (AI-built, end to end)'));
  assert.ok(txt.includes('3 emails'));
  assert.ok(txt.includes('Parallel'));
  await page.click('button:has-text("Internal")');
  await page.waitForURL(/wt=internal/);
  const rows = await page.$$eval('main summary b', (bs) => bs.map((b) => b.textContent));
  assert.ok(rows.includes('Time logging and admin'), 'internal parallel entry listed');
  assert.ok(!rows.includes('Email (AI-built, end to end)'), 'external entry filtered out');
  assert.equal(await page.$('select[aria-label="Client"]'), null, 'client filter hidden for internal');
  const cats = await optionTexts(page, 'select[aria-label="Category"]');
  assert.ok(!cats.includes('Service Fulfillment'));
  await shot(page, '06-time-log-internal');
});

await check('past time logging uses the same conditional form', async () => {
  await page.goto(`${BASE}/log`);
  await page.click('main button:has-text("Log past time")');
  await page.click('.sheet button[data-wt="internal"]');
  assert.equal(await page.$('#past-entity'), null);
  await page.selectOption('#past-cat', { label: 'Internal Meetings' });
  await page.selectOption('#past-task', { label: 'Team meeting' });
  await page.fill('.sheet input[type=time] >> nth=0', '08:00');
  await page.fill('.sheet input[type=time] >> nth=1', '08:45');
  await page.click('.sheet button:has-text("In Progress")');
  await page.click('.sheet button:has-text("Save time")');
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 15000 });
  assert.ok((await page.textContent('main')).includes('Team meeting'));
  await shot(page, '07-log-page');
});

await check('in-progress work can be resumed', async () => {
  await page.goto(`${BASE}/tasks`);
  assert.ok((await page.textContent('main')).includes('Team meeting'));
  await page.click('main button:has-text("Resume")');
  await page.waitForSelector('header button:has-text("Stop")', { timeout: 15000 });
  await page.click('header button:has-text("Stop")');
  await page.click('.sheet button:has-text("Save time")');
  await page.waitForSelector('header button:has-text("Start timer")', { timeout: 15000 });
  await shot(page, '08-tasks');
});

for (const [path, name, must] of [
  ['/performance', '09-performance', 'Team Performance'], ['/projections', '10-projections', 'Company Projections'],
  ['/revenue', '11-revenue', 'Monthly revenue by stream'], ['/clients', '12-clients', 'Labor hours vs paid revenue'],
  ['/expenses', '13-expenses', 'Melanie Lee'], ['/settings', '14-settings', 'Where your data lives'],
  ['/admin?tab=taxonomy', '15-admin-taxonomy', 'Unlisted'], ['/admin?tab=clients', '16-admin-clients', 'Active clients'],
  ['/admin?tab=contracts', '17-admin-contracts', 'Ad Commission'], ['/admin?tab=prospects', '18-admin-prospects', 'Convert to client'],
  ['/admin?tab=team', '19-admin-team', 'Weekly capacity'], ['/admin?tab=changes', '20-admin-changes', 'Change Log'], ['/admin?tab=import', '21-admin-import', 'previous app'],
]) {
  await check(`${path} renders`, async () => {
    await page.goto(`${BASE}${path}`);
    const t = await page.textContent('body');
    if (name === '15-admin-taxonomy') assert.ok(t.includes('Task Taxonomy'));
    else if (name === '17-admin-contracts') assert.ok(t.includes('Retainer'));
    else assert.ok(t.includes(must), `missing "${must}"`);
    assert.ok(!t.includes('Lucid OS') && !t.includes('Clients or Leads') && !t.includes('Client or Lead'));
    await shot(page, name);
  });
}

await check('Clients bubble chart is the first panel on Clients', async () => {
  await page.goto(`${BASE}/clients`);
  const first = await page.$eval('main section.panel h2', (h) => h.textContent);
  assert.equal(first, 'Labor hours vs paid revenue');
  assert.ok(await page.$('main section.panel svg circle'));
});

await check('Projections is goal-focused and includes contractor costs', async () => {
  await page.goto(`${BASE}/projections`);
  const t = await page.textContent('main');
  assert.ok(t.includes('2026 goal') && t.includes('$100,000'));
  assert.ok(t.includes('Melanie Lee') && t.includes('Sofia Burke'));
});

await check('taxonomy admin: create a category and a task', async () => {
  await page.goto(`${BASE}/admin?tab=taxonomy`);
  await page.click('button:has-text("New category")');
  await page.fill('.sheet input[type=text] >> nth=0', 'Podcast Production');
  await page.click('.sheet button:has-text("Both")');
  await page.click('.sheet button:has-text("Save")');
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 15000 });
  await page.waitForSelector('main b:has-text("Podcast Production")', { timeout: 15000 });
  await page.click('button:has-text("New task")');
  await page.fill('.sheet input[type=text] >> nth=0', 'Podcast edit');
  await page.selectOption('.sheet select >> nth=0', { label: 'Podcast Production' });
  await page.click('.sheet label:has-text("discrete deliverable") input');
  await page.fill('.sheet input[placeholder="Not set"]', '90');
  await page.locator('.sheet input[type=text]').nth(2).fill('episode');
  await page.selectOption('.sheet select >> nth=2', 'measured');
  await page.click('.sheet button:has-text("Save")');
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 15000 });
  await page.fill('input[type=search]', 'Podcast');
  await page.waitForSelector('main td:has-text("Podcast edit")', { timeout: 15000 });
  const t = await page.textContent('main');
  assert.ok(t.includes('Podcast edit') && t.includes('per episode') && t.includes('1.5 h'));
  await shot(page, '22-taxonomy-new');
});

// ---------------------------------------------------------------- employee
const emp = await session('employee@lucidstudiollc.com');
await check('employee sees no Finances or System Admin', async () => {
  const nav = await emp.page.textContent('aside');
  for (const hidden of ['Revenue', 'Payouts / Expenses', 'System Admin', 'Company Projections']) assert.ok(!nav.includes(hidden), `${hidden} hidden`);
  for (const path of ['/revenue', '/admin', '/expenses', '/projections', '/clients']) {
    await emp.page.goto(`${BASE}${path}`);
    assert.equal(new URL(emp.page.url()).pathname, '/', `${path} redirects home`);
  }
  await shot(emp.page, '23-employee-dashboard');
});

// ---------------------------------------------------------------- mobile
const mob = await session('admin@lucidstudiollc.com', { width: 390, height: 844 });
await check('mobile: no horizontal scroll on main pages', async () => {
  for (const p of ['/', '/log', '/time-log', '/clients', '/projections']) {
    await mob.page.goto(`${BASE}${p}`);
    const over = await mob.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `${p} overflows by ${over}px`);
  }
  await mob.page.goto(`${BASE}/log`);
  await shot(mob.page, '24-mobile-log');
});

await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log('\nBrowser errors:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
