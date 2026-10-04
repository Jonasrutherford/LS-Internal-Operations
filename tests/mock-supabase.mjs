// A small in-memory stand-in for Supabase (auth + PostgREST), for driving the UI
// locally when the real project is unreachable. Not a security model: it has no
// row-level security. RLS is tested against the real database instead.
//
//   node tests/mock-supabase.mjs        # listens on :54329
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 npm run dev

import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 54329);

// ---------------------------------------------------------------- fixtures
const tax = JSON.parse(execFileSync('python3', ['-c', `
import json,sys; sys.path.insert(0,'scripts'); import taxonomy as t
print(json.dumps({'c':t.CATEGORIES,'t':t.TYPES}))`]).toString());

const db = { task_categories: [], task_types: [], people: [], clients: [], prospects: [], partners: [], time_entries: [], entry_participants: [],
  contracts: [], contract_price_changes: [], billing_events: [], expenses: [], revenue_goals: [], app_settings: [], audit_log: [] };
const catId = {};
tax.c.forEach(([code, name, eligibility, contexts, rel, description], i) => {
  const id = randomUUID(); catId[code] = id;
  db.task_categories.push({ id, code, name, eligibility, contexts, revenue_relationship: rel, description, sort_order: i, active: true });
});
tax.t.forEach(([code, cat, name, eligibility, unit, hrs, src, line, qs], i) => db.task_types.push({
  id: randomUUID(), code, category_id: catId[cat], name, description: null, eligibility, revenue_relationship: null, service_line: line,
  has_deliverable: !!unit, deliverable_unit: unit, expected_minutes: hrs == null ? null : Math.round(hrs * 6000) / 100,
  expected_source: src, expected_updated_at: null, quick_start: qs, sort_order: i, active: true,
}));
const USERS = {
  'admin@lucidstudiollc.com': { id: randomUUID(), role: 'admin', name: 'Carter', legacy_key: 'carter', title: 'CEO', cap: 15 },
  'employee@lucidstudiollc.com': { id: randomUUID(), role: 'employee', name: 'Avery', legacy_key: null, title: 'Designer', cap: 30 },
};
for (const [email, u] of Object.entries(USERS)) {
  db.people.push({ id: randomUUID(), auth_user_id: u.id, name: u.name, email, role: u.role, title: u.title, weekly_capacity_hours: u.cap, legacy_key: u.legacy_key, active: true });
}
db.people.push({ id: randomUUID(), auth_user_id: null, name: 'Jonas', email: 'jonas@lucidstudiollc.com', role: 'admin', title: 'COO', weekly_capacity_hours: 12, legacy_key: 'jonas', active: true });
for (const [name, active, color] of [['Day & Knight Chess Club', true, '#2f6b3a'], ['EQUIPT Movement', true, '#d13b2e'], ['Saturation of Sound', true, null], ['Solid Supply Inc.', false, null]]) {
  db.clients.push({ id: randomUUID(), name, active, brand_color: color, brand_color_dark: null, notes: null, client_since: null, legacy_key: null });
}
db.prospects.push({ id: randomUUID(), name: 'Mesa Coffee', company: null, source: 'Referral', stage: 'open', converted_client_id: null, notes: null, active: true });
const [dk, eq, sos] = db.clients;
db.contracts.push(
  { id: randomUUID(), client_id: dk.id, type: 'retainer', billing_frequency: 'monthly', amount_per_billing: 2000, percent_commission: null, start_date: '2026-01-01', status: 'active', active: true, included_services: [], notes: null },
  { id: randomUUID(), client_id: eq.id, type: 'retainer', billing_frequency: 'monthly', amount_per_billing: 2400, percent_commission: null, start_date: '2026-03-15', status: 'active', active: true, included_services: ['Email', 'Paid ads'], notes: null },
);
let m = 1;
for (const c of [dk, eq, sos]) for (let k = 1; k <= 9; k++) {
  db.billing_events.push({ id: randomUUID(), client_id: c.id, contract_id: null, kind: 'retainer', status: 'paid', amount: c === sos ? 500 : c === dk ? 2000 : 2400,
    invoice_date: `2026-0${k}-05`, paid_date: `2026-0${k}-07`, hours: null, rate: null, description: 'Sample', source: 'manual', deleted: false });
  m++;
}
db.billing_events.push({ id: randomUUID(), client_id: eq.id, contract_id: null, kind: 'one_off', status: 'invoiced', amount: 1800, invoice_date: '2026-08-20', paid_date: null, hours: null, rate: null, description: 'Landing page', source: 'manual', deleted: false });
for (const [vendor, amount, cat] of [['Melanie Lee', 400, 'contractor'], ['Sofia Burke', 600, 'contractor']]) {
  db.expenses.push({ id: randomUUID(), category: cat, vendor, amount, recurring: true, frequency: 'monthly', date: '2026-10-01', end_date: null, notes: null, source: 'seed', deleted: false });
}
db.expenses.push({ id: randomUUID(), category: 'software', vendor: 'Framer', amount: 360, recurring: true, frequency: 'annually', date: '2027-02-18', end_date: null, notes: null, source: 'seed', deleted: false });
db.revenue_goals.push({ year: 2026, amount: 100000 });
db.app_settings.push({ id: 1, pool_pct: 0.65, hours_based_from: '2026-10', fixed_split: { carter: 0.4, jonas: 0.3 }, baseline_date: '2026-10-01' });

// ---------------------------------------------------------------- PostgREST subset
const parseVal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
function test(row, col, expr) {
  const [op, ...rest] = expr.split('.');
  const raw = rest.join('.');
  const val = row[col];
  const cmp = (a, b) => (typeof a === 'number' ? a - Number(b) : String(a ?? '').localeCompare(String(b)));
  switch (op) {
    case 'eq': return String(val) === String(parseVal(raw)) || val === parseVal(raw);
    case 'neq': return String(val) !== raw;
    case 'is': return parseVal(raw) === null ? val == null : val === parseVal(raw);
    case 'gte': return val != null && cmp(val, raw) >= 0;
    case 'gt': return val != null && cmp(val, raw) > 0;
    case 'lte': return val != null && cmp(val, raw) <= 0;
    case 'lt': return val != null && cmp(val, raw) < 0;
    case 'like': case 'ilike': { const re = new RegExp('^' + decodeURIComponent(raw).replace(/[%*]/g, '.*') + '$', op === 'ilike' ? 'i' : ''); return re.test(String(val ?? '')); }
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').includes(String(val));
    case 'not': return !test(row, col, rest.join('.'));
    default: return true;
  }
}
function filterRows(rows, params) {
  return rows.filter((r) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      if (k === 'or') {
        const parts = v.replace(/^\(|\)$/g, '').split(',');
        if (!parts.some((p) => { const [col, ...e] = p.split('.'); return test(r, col, e.join('.')); })) return false;
        continue;
      }
      if (!test(r, k, v)) return false;
    }
    return true;
  });
}
function embed(table, rows, select) {
  if (table === 'time_entries' && select?.includes('entry_participants')) {
    return rows.map((r) => ({ ...r, entry_participants: db.entry_participants.filter((p) => p.entry_id === r.id).map((p) => ({ person_id: p.person_id })) }));
  }
  return rows;
}
const DEFAULTS = {
  time_entries: () => ({ id: randomUUID(), entity_kind: null, client_id: null, prospect_id: null, partner_id: null, task_type_id: null, custom_task_name: null, ended_at: null, paused_at: null, paused_seconds: 0, status: 'in_progress', deliverable_qty: null, contract_deliverable: false, joint: false, ai_assisted: false, parallel_of: null, revenue_relationship: null, source: 'timer', deleted: false, created_at: new Date().toISOString() }),
  audit_log: () => ({ id: randomUUID(), at: new Date().toISOString() }),
};
function withDefaults(table, row) {
  const base = DEFAULTS[table]?.() ?? { id: randomUUID(), active: true, deleted: false, created_at: new Date().toISOString() };
  const out = { ...base, ...row };
  if (table === 'time_entries') {
    const t = db.task_types.find((x) => x.id === out.task_type_id);
    const c = db.task_categories.find((x) => x.id === out.category_id);
    let rel = t?.revenue_relationship ?? c?.revenue_relationship ?? null;
    if (out.work_type === 'internal' && rel === 'direct') rel = 'operational';
    out.revenue_relationship = rel;
    if (t && !t.has_deliverable) out.deliverable_qty = null;
  }
  return out;
}

const sessions = new Map();
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function userFor(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
  return sessions.get(tok);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = await new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
  if (req.method === 'OPTIONS') return send(res, 204, undefined, { 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });

  // ---- auth
  if (url.pathname === '/auth/v1/token') {
    const { email, password } = JSON.parse(body || '{}');
    const u = USERS[email];
    if (!u || password !== 'mock-password') return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
    const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const access = 'mock-' + randomUUID();
    sessions.set(access, user);
    return send(res, 200, { access_token: access, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r-' + access, user });
  }
  if (url.pathname === '/auth/v1/user') { const u = userFor(req); return u ? send(res, 200, u) : send(res, 401, { msg: 'no session' }); }
  if (url.pathname === '/auth/v1/logout') return send(res, 204);

  // ---- rest
  const match = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!match) return send(res, 404, { message: 'not found' });
  const table = match[1];
  if (!db[table]) return send(res, 404, { message: `relation ${table} does not exist` });
  const me = userFor(req);
  const person = me && db.people.find((p) => p.auth_user_id === me.id);
  if (!person) return send(res, 200, []);
  const params = [...url.searchParams.entries()];
  const single = (req.headers.accept || '').includes('vnd.pgrst.object');
  const prefer = req.headers.prefer || '';

  if (req.method === 'GET' || req.method === 'HEAD') {
    let rows = filterRows(db[table], params);
    const order = url.searchParams.get('order');
    if (order) {
      const [col, dir] = order.split(',')[0].split('.');
      rows = [...rows].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    const total = rows.length;
    const off = Number(url.searchParams.get('offset') || 0);
    const lim = url.searchParams.get('limit');
    if (lim) rows = rows.slice(off, off + Number(lim));
    rows = embed(table, rows, url.searchParams.get('select'));
    const headers = { 'content-range': `0-${Math.max(0, rows.length - 1)}/${total}` };
    if (req.method === 'HEAD') return send(res, 200, undefined, headers);
    if (single) return rows.length ? send(res, 200, rows[0], headers) : send(res, 406, { code: 'PGRST116', message: 'no rows' });
    return send(res, 200, rows, headers);
  }
  if (req.method === 'POST') {
    const input = JSON.parse(body || '[]');
    const list = Array.isArray(input) ? input : [input];
    const out = [];
    for (const r of list) {
      if (table === 'time_entries' && !r.ended_at && db.time_entries.some((e) => e.person_id === r.person_id && !e.ended_at && !e.deleted)) {
        return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "one_running_timer"' });
      }
      if (prefer.includes('resolution=merge-duplicates') && table === 'revenue_goals') {
        const i = db.revenue_goals.findIndex((g) => g.year === r.year);
        if (i >= 0) { db.revenue_goals[i] = { ...db.revenue_goals[i], ...r }; out.push(db.revenue_goals[i]); continue; }
      }
      const row = withDefaults(table, r);
      db[table].push(row); out.push(row);
    }
    if (!prefer.includes('return=representation')) return send(res, 201);
    return single ? send(res, 201, out[0]) : send(res, 201, out);
  }
  if (req.method === 'PATCH') {
    const patch = JSON.parse(body || '{}');
    const rows = filterRows(db[table], params);
    for (const r of rows) Object.assign(r, patch, table === 'time_entries' ? { revenue_relationship: withDefaults(table, { ...r, ...patch }).revenue_relationship } : {});
    if (!prefer.includes('return=representation')) return send(res, 204);
    return send(res, 200, single ? rows[0] : rows);
  }
  if (req.method === 'DELETE') {
    const rows = filterRows(db[table], params);
    db[table] = db[table].filter((r) => !rows.includes(r));
    return send(res, 204);
  }
  send(res, 405, {});
}).listen(PORT, () => console.log(`mock supabase on :${PORT}`));
