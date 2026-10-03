/* ================================================================ LS Command core */
const S = {
  ready:false, db:null, user:null, mcp:null, dl:null, sample:null,
  me:{id:null, name:'', avatarUrl:'', isOwner:false},
  settings:null, taxonomy:null, clients:{}, people:{},
  entryDocs:{}, fin:{ledger:{},contracts:{},expenses:{}}, timers:{}, payouts:{}, auditDocs:{}, clickup:null,
  personId:null, view:'track', loaded:{}, v:0,
};
const UI = { filters:null, modal:null, charts:[], tick:null, awayAt:null, dismissed:{}, cmdOpen:false };

/* ---------- small utils */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = (p='x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const r2 = n => Math.round((+n || 0) * 100) / 100;
const sum = (a, f = x => x) => a.reduce((t, x) => t + (+f(x) || 0), 0);
const groupBy = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
const money = (n, d=0) => (n < 0 ? '-' : '') + '$' + Math.abs(+n || 0).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
const money2 = n => money(n, 2);
const pct = (n, d=0) => isFinite(n) ? (n*100).toFixed(d) + '%' : '–';
const hrs = min => (Math.round((min||0)/6)/10).toFixed(1);           // decimal hours
const hm = min => { min = Math.round(min||0); const h = Math.floor(min/60), m = min%60; return h ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`; };
const clockFmt = ms => { const s = Math.max(0, Math.floor(ms/1000)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`; };
const lsGet = (k, d) => { try { const v = localStorage.getItem('lucidos.'+k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('lucidos.'+k, JSON.stringify(v)); } catch {} };
const clone = o => JSON.parse(JSON.stringify(o ?? null));
function toast(msg){ const t = document.createElement('div'); t.className='toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- time zone: all business dates live in the company time zone */
const TZ = () => S.settings?.timezone || 'America/Los_Angeles';
const _fmtCache = {};
function zparts(ms){
  const tz = TZ();
  const f = _fmtCache[tz] ||= new Intl.DateTimeFormat('en-CA', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23', weekday:'short'});
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value; return o;
}
const dayKey = ms => { const o = zparts(ms); return `${o.year}-${o.month}-${o.day}`; };
const timeKey = ms => { const o = zparts(ms); return `${o.hour}:${o.minute}`; };
const hourOf = ms => +zparts(ms).hour;
function zoned(dateStr, timeStr){
  const [y,m,d] = dateStr.split('-').map(Number); const [hh,mm] = (timeStr||'00:00').split(':').map(Number);
  const target = Date.UTC(y, m-1, d, hh, mm); let g = target;
  for (let i=0; i<3; i++){ const o = zparts(g); const as = Date.UTC(+o.year, +o.month-1, +o.day, +o.hour, +o.minute); g += target - as; }
  return g;
}
const today = () => dayKey(Date.now());
const monthOf = d => d.slice(0,7);
const addDays = (d, n) => { const t = new Date(d+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10); };
const addMonths = (m, n) => { const [y,mm] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mm-1+n, 1)); return t.toISOString().slice(0,7); };
const monthEnd = m => addDays(addMonths(m,1)+'-01', -1);
const daysBetween = (a, b) => Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z'))/864e5);
const dow = d => new Date(d+'T00:00:00Z').getUTCDay();
const weekStart = d => addDays(d, -((dow(d)+6)%7));   // Monday
const monthLabel = m => new Date(m+'-15T00:00:00Z').toLocaleDateString('en-US', {month:'long', year:'numeric', timeZone:'UTC'});
const monthShort = m => new Date(m+'-15T00:00:00Z').toLocaleDateString('en-US', {month:'short', timeZone:'UTC'});
const dateLabel = d => d ? new Date(d+'T12:00:00Z').toLocaleDateString('en-US', {month:'short', day:'numeric', timeZone:'UTC'}) : '–';
const dateLong = d => d ? new Date(d+'T12:00:00Z').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', timeZone:'UTC'}) : '–';

/* ---------- lookups */
const person = id => S.people[id] || {name: id || 'Unknown'};
const client = id => S.clients[id];
const clientName = id => id ? (S.clients[id]?.name || id) : 'Unassigned';
const ttype = code => S.taxonomy?.types?.[code];
const typeName = code => code ? (ttype(code)?.name || code) : 'Unclassified';
const famOf = code => ttype(code)?.family || 'none';
const famName = f => S.taxonomy?.families?.[f]?.name || 'Unclassified';
const partners = () => Object.entries(S.people).filter(([,p]) => p.poolMember).map(([id]) => id);
const isPartner = () => !!S.people[S.personId]?.poolMember;
function seriesColor(i){ return getComputedStyle(document.documentElement).getPropertyValue('--s'+((i%8)+1)).trim(); }
function cssv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
const FAMILY_ORDER = () => Object.entries(S.taxonomy?.families||{}).sort((a,b)=>a[1].order-b[1].order).map(([k])=>k);

/* ---------- entries */
function allEntries(){
  if (S._ev === S.v && S._entries) return S._entries;
  const out = [];
  for (const doc of Object.values(S.entryDocs)) for (const e of Object.values(doc.items||{})) if (e && !e.deleted) out.push(e);
  out.sort((a,b) => (b.start||0) - (a.start||0));
  S._entries = out; S._ev = S.v; S._labor = null; return out;
}
/* Each entry becomes one or more labor rows. Active allocations carve minutes out of the session; the rest stays on the primary task.
   Background (AI / machine) allocations are recorded but add no labor minutes. */
function laborRows(){
  if (S._labor && S._lv === S.v) return S._labor;
  const rows = [];
  for (const e of allEntries()){
    if (!e.minutes || e.minutes <= 0) continue;
    const scope = e.scope || (e.clientId === 'internal' ? 'internal' : 'external');
    const base = {entryId:e.id, personId:e.personId, date:e.date, start:e.start, status:e.status, joint:!!e.joint, source:e.source, ai:e.ai, scope, category:e.category||null};
    const allocs = (e.allocations||[]).filter(a => a && a.minutes > 0);
    const active = allocs.filter(a => a.attention !== 'background');
    const used = Math.min(e.minutes, sum(active, a => a.minutes));
    const primaryMin = e.minutes - used;
    if (primaryMin > 0) rows.push({...base, clientId:e.clientId, typeId:e.typeId, family:famOf(e.typeId), minutes:primaryMin, billable:!!e.billable, payoutEligible:e.payoutEligible !== false, primary:true, units:e.units||0});
    for (const a of active){ const t = ttype(a.typeId); rows.push({...base, clientId:a.clientId||e.clientId, typeId:a.typeId, family:famOf(a.typeId), minutes:a.minutes, billable: a.billable ?? (!!t?.billable && !['internal','prospects'].includes(a.clientId||e.clientId)), payoutEligible:e.payoutEligible !== false, primary:false, units:a.units||0}); }
    for (const a of allocs.filter(a => a.attention === 'background')) rows.push({...base, clientId:a.clientId||e.clientId, typeId:a.typeId, family:famOf(a.typeId), minutes:0, bgMinutes:a.minutes, billable:false, payoutEligible:false, primary:false, background:true, units:a.units||0});
  }
  S._labor = rows; S._lv = S.v; return rows;
}
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

/* ---------- finance helpers */
const ledgerItems = () => Object.values(S.fin.ledger||{}).filter(l => l && !l.deleted);
const contractItems = () => Object.values(S.fin.contracts||{}).filter(c => c && !c.deleted);
const expenseItems = () => Object.values(S.fin.expenses||{}).filter(x => x && !x.deleted);
const FREQ_M = {monthly:1, quarterly:3, semiannual:6, annual:12};
const STATUS_LABEL = {draft:'Draft', contracted:'Contracted', invoiced:'Invoiced', ar:'Accounts receivable', partial:'Partially paid', paid:'Paid', written_off:'Written off'};
const BASIS_LABEL = {cash:'Cash collected', recognized:'Revenue recognized', paid_ar:'Paid plus accounts receivable', custom:'Manually approved amount'};

function paidIn(l, from, to){ return ['paid','partial'].includes(l.status) && l.paidDate && inRange(l.paidDate, from, to) ? (+l.paidAmount || (l.status==='paid' ? +l.amount : 0)) : 0; }
function outstanding(l){ return ['invoiced','ar','partial'].includes(l.status) ? Math.max(0, (+l.amount||0) - (+l.paidAmount||0)) : 0; }

/* Revenue for one payment period on the chosen basis. Returns the lines used, so every payout traces to ledger rows. */
function periodRevenue(m, basis){
  const from = m+'-01', to = monthEnd(m); const lines = [];
  if (basis === 'custom'){
    const amt = +(S.settings.customAmounts||{})[m] || 0;
    return {eligible:amt, other:0, lines:[], custom:true};
  }
  for (const l of ledgerItems()){
    let amt = 0, why = '';
    if (basis === 'cash'){ amt = paidIn(l, from, to); why = 'paid ' + dateLabel(l.paidDate); }
    else if (basis === 'recognized'){ if (l.recognitionDate && inRange(l.recognitionDate, from, to) && !['draft','written_off','contracted'].includes(l.status)){ amt = +l.amount||0; why = 'recognized ' + dateLabel(l.recognitionDate); } }
    else if (basis === 'paid_ar'){
      const p = paidIn(l, from, to); if (p){ amt = p; why = 'paid ' + dateLabel(l.paidDate); }
      else if (['invoiced','ar','partial'].includes(l.status) && l.invoiceDate && inRange(l.invoiceDate, from, to)){ amt = outstanding(l); why = 'A/R, invoiced ' + dateLabel(l.invoiceDate); }
    }
    if (amt) lines.push({...l, used:amt, why});
  }
  return {eligible: r2(sum(lines.filter(l => l.poolEligible !== false), l => l.used)), other: r2(sum(lines.filter(l => l.poolEligible === false), l => l.used)), lines};
}
/* Expense occurrences in a date range: one-time rows by date, recurring rules expanded by frequency. */
function expensesIn(from, to){
  const out = [];
  for (const x of expenseItems()){
    if (!x.recurring){ if (x.date && inRange(x.date, from, to)) out.push({...x, on:x.date}); continue; }
    const step = FREQ_M[x.frequency] || 1; let d = x.date; let guard = 0;
    while (d && d <= to && guard++ < 400){
      if (d >= from && (!x.endDate || d <= x.endDate)) out.push({...x, on:d});
      if (x.endDate && d > x.endDate) break;
      const nm = addMonths(d.slice(0,7), step); const day = Math.min(+x.date.slice(8,10), +monthEnd(nm).slice(8,10));
      d = nm + '-' + String(day).padStart(2,'0');
    }
  }
  return out;
}
/* Split cents so individual payouts sum to the pool exactly (largest remainder). */
function splitCents(total, weights){
  const cents = Math.round(total*100), W = sum(weights);
  if (!W) return weights.map(() => 0);
  const raw = weights.map(w => cents * w / W), base = raw.map(Math.floor);
  let left = cents - sum(base);
  raw.map((v,i) => [v - base[i], i]).sort((a,b) => b[0]-a[0]).forEach(([,i]) => { if (left > 0){ base[i]++; left--; } });
  return base.map(c => c/100);
}
function hoursFor(m, personId){
  const from = m+'-01', to = monthEnd(m);
  const rows = laborRows().filter(r => r.personId === personId && inRange(r.date, from, to) && r.payoutEligible);
  return { approved: sum(rows, r => r.minutes), pending: 0 };
}
/* Payouts.
 *
 * Two regimes, because the split changed:
 *   through 2026-09  fixed shares of total revenue, Carter 40% and Jonas 30%
 *   from   2026-10   a 65% pool, divided by each partner's share of approved hours
 *
 * fixedSplit in settings holds the old percentages so historical months stay
 * truthful instead of being recomputed under today's rules. */
function splitRegime(m){
  const st = S.settings;
  const cutover = st.hoursBasedFrom || '2026-10';
  return m < cutover ? 'fixed' : 'hours';
}
function payoutFor(m){
  const st = S.settings; const basis = st.revenueBasis;
  const regime = splitRegime(m);
  const p = regime === 'fixed'
    ? sum(Object.values(st.fixedSplit || {}))
    : +st.poolPct;
  const rev = periodRevenue(m, basis);
  const exp = expensesIn(m+'-01', monthEnd(m));
  const expTotal = r2(sum(exp, x => x.amount)), overhead = r2(sum(exp.filter(x => x.allocation !== 'client'), x => x.amount)), direct = r2(expTotal - overhead);
  const poolBase = st.expenseTiming === 'before' ? Math.max(0, rev.eligible - expTotal) : rev.eligible;
  const pool = r2(poolBase * p);
  const ids = partners();
  const hrsBy = ids.map(id => ({id, ...hoursFor(m, id)}));
  const totalMin = sum(hrsBy, h => h.approved);

  /* Fixed regime pays the agreed percentage of revenue regardless of hours.
     Hours regime divides the pool by each partner's share of approved hours. */
  const weights = regime === 'fixed'
    ? ids.map(id => (st.fixedSplit || {})[id] || 0)
    : hrsBy.map(h => h.approved);
  const pays = splitCents(pool, weights);

  const people = hrsBy.map((h,i) => {
    const share = regime === 'fixed'
      ? ((st.fixedSplit || {})[h.id] || 0) / (p || 1)
      : (totalMin ? h.approved/totalMin : 0);
    return {...h, share, payout: pays[i], perHour: h.approved ? pays[i] / (h.approved/60) : 0};
  });
  const retained = r2(rev.eligible - pool);
  const contribution = st.expenseTiming === 'before' ? r2(rev.eligible - expTotal - pool) : r2(retained - expTotal);
  return {m, basis, pct:p, regime, rev, exp, expTotal, overhead, direct, poolBase:r2(poolBase), pool, people, totalMin,
          unallocated: (regime === 'hours' && !totalMin) ? pool : 0,
          retained, contribution, reconstructed: m <= (st.reconstructedThrough||''), locked: S.payouts[m]?.locked ? S.payouts[m] : null};
}

/* ---------- contracts */
function billingDates(c, from, to){
  const out = []; if (!c.start) return out;
  const step = FREQ_M[c.frequency] || 1; let m = c.start.slice(0,7); const bday = +(c.billingDay || c.start.slice(8,10)); let guard = 0;
  while (guard++ < 400){
    const d = m + '-' + String(Math.min(bday, +monthEnd(m).slice(8,10))).padStart(2,'0');
    if (d > to || (c.end && d > c.end)) break;
    if (d >= from && d >= c.start) out.push(d);
    m = addMonths(m, step);
  }
  return out;
}
const isActiveContract = c => ['active','pending','renewing'].includes(c.lifecycle);
function contractFuture(c, to){ if (!isActiveContract(c)) return {dates:[], amount:0}; const dates = billingDates(c, addDays(today(),1), to || c.end || addDays(today(), 365)); return {dates, amount: r2(dates.length * (+c.amount||0))}; }
/* 12-month pace, zero churn: every active retainer (plus signed ones starting within 31 days) runs all 12 months,
   and one-off project revenue continues at its trailing-90-day rate. End dates are ignored on purpose: zero churn means everyone renews. */
function runRate(){
  const t = today(), soon = addDays(t, 31), from90 = addDays(t, -89);
  const retainers = contractItems().filter(c => isActiveContract(c) && c.start <= soon && ['retainer','ad fee','hourly'].includes(c.contractType))
    .map(c => ({c, monthly: r2((+c.amount||0) / (FREQ_M[c.frequency]||1)), starts: c.start > t ? c.start : null}));
  const recurringMonthly = r2(sum(retainers, r => r.monthly));
  const oneOffLines = ledgerItems().filter(l => l.poolEligible !== false && l.revenueType !== 'retainer' && paidIn(l, from90, t));
  const oneOff90 = r2(sum(oneOffLines, l => paidIn(l, from90, t)));
  const oneOffAnnual = r2(oneOff90 * 365 / 90);
  return {retainers, recurringMonthly, recurringAnnual: r2(recurringMonthly*12), oneOff90, oneOffAnnual, oneOffLines, from90,
          total: r2(recurringMonthly*12 + oneOffAnnual), monthly: r2(recurringMonthly + oneOffAnnual/12)};
}
function mrr(){ const t = today(); return r2(sum(contractItems().filter(c => isActiveContract(c) && c.start <= t && (!c.end || c.end >= t)), c => (+c.amount||0) / (FREQ_M[c.frequency]||1))); }

/* ---------- data-quality checks (used by Review and the rail badge) */
function reviewItems(){
  if (S._rev && S._rvv === S.v) return S._rev;
  const E = allEntries(), me = S.personId, st = S.settings || {};
  const out = {mapping:[], units:[], overlap:[], long:[], approve:[], drafts:[], orphanRev:[], revStatus:[], dupes:[], contracts:[], expenses:[], noClient:[]};
  for (const e of E){
    if (e.needsReview) out.mapping.push(e);
    else if (!e.clientId || !e.typeId) out.noClient.push(e);
    if (e.source !== 'import' && e.status !== 'draft' && ttype(e.typeId)?.cls === 'revenue' && !(e.units > 0)) out.units.push(e);
    if (e.minutes > (st.longTimerHours||3)*60*1.7) out.long.push(e);
    if (e.status === 'submitted' && e.personId !== me && isPartner()) out.approve.push(e);
    if (e.status === 'draft' && e.personId === me) out.drafts.push(e);
  }
  // overlaps: same person, time ranges intersect
  const byP = groupBy(E.filter(e => e.start && e.end), e => e.personId);
  for (const list of Object.values(byP)){
    const s = [...list].sort((a,b) => a.start - b.start);
    for (let i=1; i<s.length; i++){
      for (let j=i-1; j>=0 && j>=i-4; j--){
        const a = s[j], b = s[i];
        if (b.start < a.end){
          const ov = Math.round((Math.min(a.end,b.end) - b.start)/60000);
          const same = a.start === b.start && a.end === b.end;
          if (ov >= 1) (same ? out.dupes : out.overlap).push({a, b, minutes:ov});
        }
      }
    }
  }
  for (const l of ledgerItems()){
    if (l.revenueType !== 'other income' && !l.clientId) out.orphanRev.push({l, why:'No client'});
    else if (l.revenueType === 'retainer' && !l.contractId) out.orphanRev.push({l, why:'Retainer payment not linked to a contract'});
    if (l.status === 'paid' && !l.paidDate) out.revStatus.push({l, why:'Marked paid with no payment date'});
    if (['ar','invoiced'].includes(l.status) && l.paidDate) out.revStatus.push({l, why:'Has a payment date but is still open'});
    if (['ar','invoiced'].includes(l.status) && l.invoiceDate && daysBetween(l.invoiceDate, today()) > 45) out.revStatus.push({l, why:`Open for ${daysBetween(l.invoiceDate, today())} days`});
    if (l.status === 'partial' && !(+l.paidAmount > 0)) out.revStatus.push({l, why:'Partially paid with no paid amount'});
  }
  for (const c of contractItems()){
    if (c.needsReview) out.contracts.push({c, why:(c.reviewNotes||[]).join(' ') || 'Flagged for review'});
    else if (isActiveContract(c) && (!c.end || !c.renewalDate)) out.contracts.push({c, why:'Missing end or renewal date'});
  }
  for (const x of expenseItems()) if (x.needsReview) out.expenses.push({x, why:(x.reviewNotes||[]).join(' ') || 'Flagged for review'});
  out.total = out.mapping.length + out.noClient.length + out.units.length + out.overlap.length + out.approve.length + out.orphanRev.length + out.revStatus.length + out.dupes.length + out.contracts.length + out.expenses.length;
  S._rev = out; S._rvv = S.v; return out;
}

/* ---------- benchmarks: only approved, structured entries with a unit count */
function quant(a, q){ if (!a.length) return null; const s = [...a].sort((x,y)=>x-y); const pos = (s.length-1)*q, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi]-s[lo])*(pos-lo); }
function benchmarks(){
  if (S._bm && S._bv === S.v) return S._bm;
  const by = {};
  for (const r of laborRows()){
    if (!(r.units > 0) || !r.typeId || r.background) continue;
    const e = entryById(r.entryId);
    (by[r.typeId] ||= []).push({perUnit: r.minutes / r.units, units:r.units, minutes:r.minutes, ai: e?.ai && e.ai !== 'none', complexity: e?.complexity, revision: +e?.revision||0, date:r.date});
  }
  const out = {};
  for (const [code, xs] of Object.entries(by)){
    const v = xs.map(x => x.perUnit), mean = sum(v)/v.length;
    const sd = Math.sqrt(sum(v, x => (x-mean)**2) / Math.max(1, v.length-1));
    const ai = xs.filter(x => x.ai).map(x => x.perUnit), noai = xs.filter(x => !x.ai).map(x => x.perUnit);
    out[code] = {n:xs.length, units:sum(xs, x=>x.units), minutes:sum(xs, x=>x.minutes), mean, median:quant(v,.5), p25:quant(v,.25), p75:quant(v,.75), p90:quant(v,.9), sd,
      aiMedian: quant(ai,.5), aiN: ai.length, noAiMedian: quant(noai,.5), noAiN: noai.length, xs,
      confidence: xs.length < 5 ? 'Preliminary' : xs.length < 15 ? 'Medium' : 'High'};
  }
  S._bm = out; S._bv = S.v; return out;
}
function entryById(id){ for (const d of Object.values(S.entryDocs)) if (d.items?.[id]) return d.items[id]; return null; }

/* ---------- writes */
async function upsertItem(col, docId, itemId, obj){
  const ref = S.db.doc(col+'/'+docId);
  try { await ref.update({items:{[itemId]: obj}}); }
  catch (e){
    if (e?.code === 'invalid_argument'){ const snap = await ref.get(); if (!snap.exists){ await ref.set({items:{[itemId]: obj}}); return; } }
    throw e;
  }
}
async function audit(entity, entityId, changes, reason, extra={}){
  const m = today().slice(0,7), id = uid('a');
  try { await upsertItem('audit', m, id, {id, ts:Date.now(), personId:S.personId, userId:S.me.id, entity, entityId, changes, reason:reason||'', ...extra}); } catch(e){ console.warn('audit failed', e); }
}
function diff(before, after, fields){
  const ch = [];
  for (const f of fields){ const a = before?.[f] ?? null, b = after?.[f] ?? null; if (JSON.stringify(a) !== JSON.stringify(b)) ch.push({field:f, from:a, to:b}); }
  return ch;
}
const ENTRY_FIELDS = ['personId','date','start','end','minutes','clientId','typeId','units','unitType','stage','complexity','ai','revision','billable','cls','payoutEligible','allocations','note','status','clickupTaskId','joint'];
const PAYOUT_FIELDS = ['personId','date','minutes','payoutEligible','status','allocations'];
function isLocked(m){ return !!S.payouts[m]?.locked; }

async function saveEntry(e, reason){
  const prev = e.id ? entryById(e.id) : null;
  const m = monthOf(e.date);
  if (isLocked(m) || (prev && isLocked(monthOf(prev.date)))) throw new Error(`${monthLabel(isLocked(m) ? m : monthOf(prev.date))} is locked. Unlock the payment period on Payouts first.`);
  e.id ||= uid('e'); e.updatedAt = Date.now(); e.updatedBy = S.personId; e.createdAt ||= Date.now(); e.createdBy ||= S.personId;
  if (prev && monthOf(prev.date) !== m){ await upsertItem('entries', monthOf(prev.date), e.id, {...prev, deleted:true, movedTo:m}); }
  await upsertItem('entries', m, e.id, e);
  const ch = diff(prev, e, ENTRY_FIELDS);
  const payoutImpact = prev && (prev.status === 'approved' || e.status === 'approved') && diff(prev, e, PAYOUT_FIELDS).length;
  if (!prev) await audit('entry', e.id, [{field:'created', from:null, to:`${hm(e.minutes)} ${typeName(e.typeId)}`}], reason, {month:m});
  else if (ch.length) await audit('entry', e.id, ch, reason, {month:m, payoutImpact:!!payoutImpact});
  return e;
}
async function saveFin(kind, item, reason, fields){
  const prev = S.fin[kind]?.[item.id] || null;
  item.id ||= uid(kind.slice(0,3)); item.updatedAt = Date.now(); item.updatedBy = S.personId;
  await S.db.doc('fin/'+kind).update({items:{[item.id]: item}}).catch(async e => {
    if (e?.code === 'invalid_argument'){ const s = await S.db.doc('fin/'+kind).get(); if (!s.exists) return S.db.doc('fin/'+kind).set({items:{[item.id]: item}}); }
    throw e;
  });
  const ch = prev ? diff(prev, item, fields) : [{field:'created', from:null, to: item.amount != null ? money2(item.amount) : ''}];
  if (ch.length) await audit(kind, item.id, ch, reason, {payoutImpact: kind !== 'contracts'});
  return item;
}
async function saveConfig(doc, patch, reason, label){
  const before = clone(doc === 'settings' ? S.settings : null);
  await S.db.doc('config/'+doc).update(patch);
  if (doc === 'settings'){ const ch = Object.keys(patch).map(k => ({field:k, from:before?.[k] ?? null, to:patch[k]})); await audit('settings', 'settings', ch, reason, {payoutImpact: ['poolPct','revenueBasis','expenseTiming','customAmounts'].some(k => k in patch)}); }
  else await audit(doc, doc, [{field: label || 'updated', from:null, to:null}], reason);
}
