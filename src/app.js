/* ================================================================ boot */
/* Information architecture, LS Command spec section 6.
 * Finances is admin-only and is filtered out for employees in renderRail(). */
const NAV = [
  ['Work',     [['me','Dashboard'],['track','Start / Log'],['entries','Time Log'],['board','Tasks']]],
  ['Insight',  [['performance','Performance'],['projections','Company Projections']]],
  ['Finances', [['revenue','Revenue'],['payouts','Payouts / Expenses'],['contracts','Clients']]],
  ['System',   [['settings','Settings'],['admin','System Admin']]],
];
/* Groups an employee never sees. Route guards in render() enforce this as well,
 * so hiding the link is a convenience rather than the control. */
const ADMIN_GROUPS = ['Finances'];
const ADMIN_VIEWS = ['revenue','payouts','contracts','expenses','admin','clients','tasks','projections','audit'];
/* 'company' is the old combined dashboard, superseded by 'performance'. */
const VIEWS = {};

/* Permissions, spec section 47. Partners administer; everyone else is an employee
 * who can log their own time and see company work, but not finances or config. */
function isAdmin(){ const p = S.people[S.personId]; return !!p && p.role === 'partner'; }
function canSee(view){ return isAdmin() || !ADMIN_VIEWS.includes(view); }

async function boot(){
  const th = lsGet('theme', ''); if (th) document.documentElement.dataset.theme = th;
  renderShell();
  const c = window.claude;
  const [db, user] = await Promise.all([c?.use?.('db') ?? null, c?.use?.('user') ?? null]);
  S.db = db; S.user = user;
  if (!db){ renderOutside(); return; }
  if (user){ const me = await user.me(); S.me = {id:me.id, name:me.name, avatarUrl:me.avatarUrl, isOwner:me.isOwner}; }
  c.use('downloads').then(d => { S.dl = d; }).catch(() => {});
  subscribe();
}
/* Shown when the page is opened outside Claude (for example from the Vercel deployment).
   Time, revenue and payout data only exist in the Claude-hosted app, so send people there. */
const APP_URL = 'https://claude.ai/artifact/Whr8uTA7z4by3d8wvt1VcU';
function renderOutside(){
  $('#rail').innerHTML = ''; $('#timer').innerHTML = ''; $('#who').innerHTML = '';
  $('#main').innerHTML = `<div class="gate">
    <div class="eyebrow">Lucid Studio</div><h1 style="margin:6px 0 8px">LS Command runs inside Claude</h1>
    <p class="ink2">This page needs its data store. Reload, and load the seed file if prompted.</p>
    <p style="margin-top:18px"><a class="btn sig" href="${APP_URL}" rel="noopener">Open LS Command</a></p>
    <p class="muted" style="margin-top:14px">No access yet? Ask Jonas to share it with you.</p></div>`;
  document.querySelector('.app')?.style.setProperty('grid-template-columns', 'minmax(0,1fr)');
  $('#rail').hidden = true;
}
function subscribe(){
  const onErr = e => console.warn('db', e);
  const bump = () => { S.v++; scheduleRender(); };
  S.db.collection('config').onSnapshot(snap => {
    for (const d of snap.docs){ const x = d.data(); if (d.id === 'settings') S.settings = x; else if (d.id === 'taxonomy') S.taxonomy = x; else if (d.id === 'clients') S.clients = x.items||{}; else if (d.id === 'people') S.people = x.items||{}; }
    S.loaded.config = true; resolveIdentity(); bump();
  }, onErr);
  S.db.collection('entries').onSnapshot(snap => { S.entryDocs = {}; for (const d of snap.docs) S.entryDocs[d.id] = d.data(); S.loaded.entries = true; bump(); }, onErr);
  S.db.collection('fin').onSnapshot(snap => { for (const d of snap.docs) S.fin[d.id] = d.data().items||{}; S.loaded.fin = true; bump(); }, onErr);
  S.db.collection('timers').onSnapshot(snap => { S.timers = {}; for (const d of snap.docs) S.timers[d.id] = d.data(); bump(); renderTimer(); }, onErr);
  S.db.collection('payouts').onSnapshot(snap => { S.payouts = {}; for (const d of snap.docs) S.payouts[d.id] = d.data(); bump(); }, onErr);
  S.db.collection('audit').onSnapshot(snap => { S.auditDocs = {}; for (const d of snap.docs) S.auditDocs[d.id] = d.data(); if (S.view === 'audit') bump(); }, onErr);
}
function resolveIdentity(){
  if (S.personId && S.people[S.personId]) return;
  const hit = Object.entries(S.people).find(([,p]) => p.userId && p.userId === S.me.id);
  if (hit){ S.personId = hit[0]; return; }
  if (!S.me.id){ S.personId = lsGet('actingAs', null); }
}
async function claimPerson(pid){
  if (!S.me.id){ lsSet('actingAs', pid); S.personId = pid; S.v++; scheduleRender(); return; }
  const p = S.people[pid]; if (p.userId && p.userId !== S.me.id && !S.me.isOwner){ toast(`${p.name} is already linked to another account`); return; }
  await S.db.doc('config/people').update({items:{[pid]:{userId:S.me.id}}});
  await audit('people', pid, [{field:'userId', from:p.userId||null, to:'linked'}], 'Linked sign-in to person');
  S.personId = pid; toast(`Signed in as ${p.name}`);
}

let _rq = false;
/* Direct links and the back button should move between pages, not just clicks. */
window.addEventListener('hashchange', () => {
  const h = (location.hash||'').slice(1);
  if (VIEWS[h] && h !== S.view) go(h);
});
function scheduleRender(){ if (_rq) return; _rq = true; requestAnimationFrame(() => { _rq = false; render(); }); }
function go(view){ if (!VIEWS[view]) view = 'me'; if (!canSee(view)) view = 'me'; S.view = view; lsSet('view', view); try { history.replaceState(null, '', '#'+view); } catch {} render(); window.scrollTo(0,0); }

/* ================================================================ shell */
const LOGO = `<svg viewBox="0 0 10880 4522" aria-hidden="true"><path d="%%LOGO%%"/></svg>`;
function renderShell(){
  $('#root').innerHTML = `<div class="app">
    <header class="strip"><div class="brand">${LOGO}<b>Lucid <span>OS</span></b></div><div class="timer" id="timer"></div><div class="who" id="who"></div></header>
    <nav class="rail" id="rail"></nav>
    <main id="main"><div class="empty">Loading LS Command…</div></main></div><div id="modal"></div>`;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  const h = (location.hash||'').slice(1); S.view = VIEWS[h] ? h : lsGet('view', 'me');
  UI.tick = setInterval(tick, 1000);
}
function renderRail(){
  const rv = S.personId && S.loaded.entries ? reviewItems() : null;
  const admin = isAdmin();
  $('#rail').innerHTML = NAV.filter(([g]) => admin || !ADMIN_GROUPS.includes(g)).map(([g, items]) => {
    const visible = items.filter(([id]) => admin || !ADMIN_VIEWS.includes(id));
    if (!visible.length) return '';
    return `<div class="grp eyebrow">${g}</div>` + visible.map(([id, label]) => {
      let badge = '';
      if (id === 'entries' && rv?.approve.length) badge = `<span class="badge">${rv.approve.length} to check</span>`;
      return `<a href="#${id}" data-go="${id}" class="${S.view===id?'on':''}">${label}${badge}</a>`;
    }).join('');
  }).join('') + `<div class="kbd"><kbd>⌘</kbd> <kbd>K</kbd> jump anywhere</div>`;
  const p = S.people[S.personId];
  $('#who').innerHTML = p ? `${S.me.avatarUrl ? `<img src="${esc(S.me.avatarUrl)}" alt="">` : ''}<span>${esc(p.name)}</span><button class="tbtn" data-act="theme" title="Theme">◐</button>` : '';
}
function render(){
  if (!S.loaded.config || !S.settings){ return; }
  if (!S.personId || !S.people[S.personId]){ renderGate(); return; }
  renderRail(); renderTimer();
  UI.charts.forEach(c => { try { c.dispose(); } catch {} }); UI.charts = [];
  const main = $('#main');
  const scroll = window.scrollY;
  if (!canSee(S.view)) S.view = 'me';
  main.innerHTML = banners() + (VIEWS[S.view] || VIEWS.me)();
  window.scrollTo(0, scroll);
  (VIEWS[S.view]?.after || (()=>{}))();
}
function renderGate(){
  $('#rail').innerHTML = ''; $('#timer').innerHTML = '';
  const opts = Object.entries(S.people).filter(([,p]) => p.role === 'partner' || p.active);
  $('#main').innerHTML = `<div class="gate">
    <div class="eyebrow">LS Command</div><h1 style="margin:6px 0 8px">Who's signing in?</h1>
    <p class="ink2">Pick your name once. LS Command links it to your Claude account so your timer and hours follow you across devices.</p>
    ${!S.me.id ? `<div class="note warn">This view can't read your Claude identity, so the choice is saved in this browser only.</div>` : ''}
    <div class="people">${opts.map(([id,p]) => {
      const taken = p.userId && p.userId !== S.me.id;
      return `<button data-act="claim" data-id="${id}" ${taken && !S.me.isOwner ? 'disabled' : ''}><b>${esc(p.name)}</b><span class="muted">${esc(p.role)}${taken ? ' · linked to another account' : ''}</span></button>`;
    }).join('')}</div></div>`;
}

/* ================================================================ banners: forgotten timers, idle time, work-hours nudge */
function banners(){
  const out = []; const t = S.timers[S.personId]; const st = S.settings;
  if (t?.running){
    const el = elapsedMs(t);
    if (el > (st.forgottenTimerHours||10)*3600e3) out.push(`<div class="banner"><span>Your timer has run for ${hm(el/60000)}. If you forgot to stop it, set the real end time.</span><button class="btn sm" data-act="stop">Correct and stop</button></div>`);
    else if (el > (st.longTimerHours||3)*3600e3 && !UI.dismissed.long) out.push(`<div class="banner"><span>Long session: ${hm(el/60000)} on ${esc(typeName(t.typeId))}. Still going?</span><span class="row"><button class="btn sm" data-act="dismiss" data-k="long">Still working</button><button class="btn sm" data-act="stop">Stop</button></span></div>`);
  }
  if (UI.awayPrompt && t?.running) out.push(`<div class="banner info"><span>You were away ${hm(UI.awayPrompt.minutes)} while the timer ran. Were you working?</span><span class="row"><button class="btn sm" data-act="away-keep">Yes, keep it</button><button class="btn sm pri" data-act="away-drop">Remove ${hm(UI.awayPrompt.minutes)}</button></span></div>`);
  if (st.workHours?.enabled && !t?.running && !UI.dismissed.work){
    const o = zparts(Date.now()); const d = ({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[o.weekday]; const now = `${o.hour}:${o.minute}`;
    if ((st.workHours.days||[]).includes(d) && now >= st.workHours.start && now <= st.workHours.end) out.push(`<div class="banner info"><span>It's inside your working hours and nothing is being tracked.</span><span class="row"><button class="btn sm" data-act="dismiss" data-k="work">Not working now</button><button class="btn sm pri" data-act="start">Start timer</button></span></div>`);
  }
  return out.length ? `<div class="banners">${out.join('')}</div>` : '';
}

/* ================================================================ timer */
function elapsedMs(t, at=Date.now()){ if (!t?.running) return 0; return at - t.start - (t.pausedMs||0) - (t.pausedAt ? at - t.pausedAt : 0); }
function renderTimer(){
  const el = $('#timer'); if (!el || !S.personId) return;
  const t = S.timers[S.personId];
  if (!t?.running){
    el.className = 'timer';
    el.innerHTML = `<div class="live"><span class="dot"></span><div class="what"><b>No timer running</b><small>Start one to capture time as you work</small></div><button class="tbtn go" data-act="start">Start timer</button></div><button class="tbtn" data-act="log">Log time</button>`;
    return;
  }
  const paused = !!t.pausedAt;
  el.className = 'timer on' + (paused ? ' paused' : '');
  /* Paused state, spec section 22: say plainly that it is paused, make Resume the
   * obvious next action, and keep Stop reachable. Switch is gone, section 15. */
  el.innerHTML = `<div class="live"><span class="dot"></span>
    <div class="what">
      <b>${esc(t.taskName || typeName(t.typeId))}</b>
      <small>${esc(t.scope === 'internal' ? 'Internal' : clientName(t.clientId))}${t.category ? ' · ' + esc(t.category) : ''}</small>
    </div>
    <span class="state-pill ${paused?'is-paused':'is-running'}">${paused ? 'Paused' : 'Running'}</span>
    <span class="clock" id="clock">${clockFmt(elapsedMs(t))}</span>
    <button class="tbtn ${paused?'go':''}" data-act="${paused?'resume':'pause'}">${paused?'Resume':'Pause'}</button>
    <button class="tbtn stop" data-act="stop">Stop</button></div>`;
}
function tick(){
  const t = S.timers[S.personId]; const c = $('#clock');
  if (t?.running && c) c.textContent = clockFmt(elapsedMs(t));
  if (t?.running){ const m = Math.floor(elapsedMs(t)/60000); document.title = `${clockFmt(elapsedMs(t)).slice(0,-3)} · ${t.taskName || typeName(t.typeId)} · LS Command`; if (m && m % 30 === 0 && new Date().getSeconds() === 0) maybeNotify(t, m); }
  else if (document.title !== 'LS Command') document.title = 'LS Command';
}
function maybeNotify(t, m){
  const st = S.settings; if (m < (st.longTimerHours||3)*60) return;
  try { if (window.Notification?.permission === 'granted') new Notification('LS Command timer still running', {body:`${hm(m)} on ${typeName(t.typeId)}`}); } catch {}
}
function onVisibility(){
  const t = S.timers[S.personId];
  if (document.hidden){ UI.awayAt = Date.now(); return; }
  if (UI.awayAt && t?.running && !t.pausedAt){
    const away = (Date.now() - UI.awayAt)/60000;
    if (away >= (S.settings.idleMinutes||30)){ UI.awayPrompt = {from:UI.awayAt, minutes:Math.round(away)}; scheduleRender(); }
  }
  UI.awayAt = null;
}
async function timerSet(patch){ await S.db.doc('timers/'+S.personId).set({...(S.timers[S.personId]||{}), ...patch, updatedAt:Date.now(), device:navigator.userAgent.slice(0,60)}); }
async function startTimer(d){
  if (S.timers[S.personId]?.running){ toast('A timer is already running. Use Switch.'); return; }
  await timerSet({running:true, start:Date.now(), pausedMs:0, pausedAt:null, scope:d.scope||'external', clientId:d.clientId, category:d.category||null, typeId:d.typeId||null, taskName:d.taskName||null, note:''});
  toast('Timer started');
}
async function pauseTimer(){ const t = S.timers[S.personId]; if (t?.running && !t.pausedAt) await timerSet({pausedAt:Date.now()}); }
async function resumeTimer(){ const t = S.timers[S.personId]; if (t?.pausedAt) await timerSet({pausedMs:(t.pausedMs||0) + (Date.now()-t.pausedAt), pausedAt:null}); }
/* Stop, spec section 17. Person, date, start, end, client and task are already
 * known, so none of them are asked for again. Only genuinely new facts appear. */
function stopTimer(){
  const t = S.timers[S.personId]; if (!t?.running) return;
  const end = t.pausedAt || Date.now();
  const ty = ttype(t.typeId);
  openEntryEditor({
    personId:S.personId, date:dayKey(t.start), start:t.start, end,
    pausedMin: Math.round((t.pausedMs||0)/60000),
    scope:t.scope||'external', clientId:t.clientId, category:t.category||null,
    typeId:t.typeId, taskName:t.taskName||null, note:'', unitType:ty?.unit||null,
    billable: defaultBillable(t.typeId, t.clientId), payoutEligible: ty?.payoutEligible !== false,
    cls: ty?.cls || null, status:'draft', source:'lucid',
  }, {fromTimer:true});
}
function defaultBillable(typeId, clientId){ const ty = ttype(typeId); return !!ty?.billable && !['internal','prospects'].includes(clientId); }

/* ================================================================ modals */
function openModal(html, opts={}){
  UI.modal = opts; $('#modal').innerHTML = `<div class="scrim" data-act="scrim"><div class="modal ${opts.wide?'wide':''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = $('#modal [autofocus]') || $('#modal input, #modal select'); f?.focus();
}
function closeModal(){ $('#modal').innerHTML = ''; UI.modal = null; }

/* Grouped into Clients and Leads. Internal never appears: it is a scope, not a
 * client, and has its own filter. Inactive legacy names only show if already
 * selected, so historical entries stay editable. */
function clientOptions(sel, withBlank=true){
  return (withBlank ? `<option value="">Choose client…</option>` : '') + partyOptions(sel).replace(/^<option value="">[^<]*<\/option>/, '');
}
function personOptions(sel, all=false){ return Object.entries(S.people).filter(([id,p]) => all || p.poolMember || p.active).map(([id,p]) => `<option value="${id}" ${id===sel?'selected':''}>${esc(p.name)}</option>`).join(''); }

/* task type combobox: grouped by service family, type to filter */
function typeCombo(id, value){
  return `<div class="combo" data-combo="${id}"><input class="in" id="${id}-q" placeholder="Search task types, e.g. reel, email, call" autocomplete="off" value="${esc(value ? ttype(value)?.code+' · '+typeName(value) : '')}"><input type="hidden" id="${id}" value="${esc(value||'')}"><div class="list" hidden></div></div>`;
}
function comboList(id, q){
  const box = $(`[data-combo="${id}"] .list`); q = (q||'').toLowerCase().trim();
  const T = S.taxonomy.types; let html = ''; let first = null;
  /* Narrow to the families that belong under the chosen category. Typing a query
   * searches everything, so nothing is ever unreachable. */
  const catEl = id === 'st-type' ? $('#st-cat') : $('#ed-cat');
  const fams = (!q && catEl?.value) ? familiesForCategory(catEl.value) : null;
  for (const f of (fams || FAMILY_ORDER())){
    const opts = Object.values(T).filter(t => t.family === f && t.active !== false && (!q || (t.code+' '+t.name+' '+famName(f)+' '+(t.unit||'')).toLowerCase().includes(q))).sort((a,b)=>a.order-b.order);
    if (!opts.length) continue;
    html += `<div class="fam">${esc(famName(f))}</div>` + opts.map(t => { first ||= t.code; return `<div class="opt" data-pick="${id}" data-code="${t.code}"><span>${esc(t.name)}</span><small>${t.code} · per ${esc(t.unit)}</small></div>`; }).join('');
  }
  html += `<div class="fam">Not listed</div><div class="opt" data-pick="${id}" data-code="OTHER"><span>Other</span><small>name the task yourself</small></div>`;
  box.innerHTML = html; box.hidden = false; box.dataset.first = first || 'OTHER';
}
function pickType(id, code){
  const other = code === 'OTHER';
  $('#'+id).value = other ? '' : code;
  const q = $('#'+id+'-q');
  q.value = other ? 'Other' : `${code} · ${typeName(code)}`;
  $(`[data-combo="${id}"] .list`).hidden = true; q.blur();
  /* The name field exists only once Other is chosen, spec section 13. */
  const wrap = $('#st-other-wrap');
  if (wrap && id === 'st-type'){
    wrap.hidden = !other;
    if (other) setTimeout(() => $('#st-other')?.focus(), 30); else { const o = $('#st-other'); if (o) o.value = ''; }
  }
  $('#'+id).dispatchEvent(new Event('change', {bubbles:true}));
}

/* ClickUp removed for V1, spec section 4. No sync, no task ids, no API key. */

/* Work classification, spec sections 9 and 10. Scope is the primary split and the
 * category list changes with it. This sits above the existing task-type taxonomy,
 * which still drives units and benchmarks, so older entries stay valid. */
const EXTERNAL_CATEGORIES = [
  'Sales & outreach','Lead generation','Lead qualification','Discovery calls',
  'Proposals & closing','Client onboarding','Client communication','Account management',
  'Client strategy','Service fulfillment','Content creation for clients','Client reporting',
  'Client retention','Upselling & cross-selling','Partnership development','Customer support',
  'Client feedback & satisfaction',
];
const INTERNAL_CATEGORIES = [
  'Hiring & recruiting','Employee onboarding','Training & development','Internal operations',
  'SOPs & process documentation','Workflow automation','Project management','Quality assurance',
  'Finance & accounting','Legal & administration','Internal meetings','Performance management',
  'Resource allocation','Strategic planning','Internal marketing','Technology & infrastructure',
  'Team management',
];

/* Each category maps to the service families whose task types belong under it,
 * so choosing a category narrows the task list instead of showing all 80.
 * A category with no entry here falls back to every family. */
const CATEGORY_FAMILIES = {
  // External
  'Sales & outreach':             ['sales'],
  'Lead generation':              ['sales'],
  'Lead qualification':           ['sales'],
  'Discovery calls':              ['sales'],
  'Proposals & closing':          ['sales','strategy'],
  'Client onboarding':            ['client'],
  'Client communication':         ['client'],
  'Account management':           ['client'],
  'Client strategy':              ['strategy'],
  'Service fulfillment':          ['web','seo','paid','email','automation','design','social','video'],
  'Content creation for clients': ['editorial','social','video','design'],
  'Client reporting':             ['reporting'],
  'Client retention':             ['client'],
  'Upselling & cross-selling':    ['sales','client'],
  'Partnership development':      ['sales'],
  'Customer support':             ['client'],
  'Client feedback & satisfaction': ['client'],
  // Internal
  'Hiring & recruiting':          ['internal'],
  'Employee onboarding':          ['internal'],
  'Training & development':       ['internal'],
  'Internal operations':          ['internal'],
  'SOPs & process documentation': ['internal'],
  'Workflow automation':          ['automation','internal'],
  'Project management':           ['internal'],
  'Quality assurance':            ['internal'],
  'Finance & accounting':         ['internal'],
  'Legal & administration':       ['internal'],
  'Internal meetings':            ['internal'],
  'Performance management':       ['internal'],
  'Resource allocation':          ['internal'],
  'Strategic planning':           ['strategy','internal'],
  'Internal marketing':           ['social','editorial','design','video','web','seo','paid','email'],
  'Technology & infrastructure':  ['automation','web','internal'],
  'Team management':              ['internal'],
};
const familiesForCategory = cat => CATEGORY_FAMILIES[cat] || null;

const categoriesFor = scope => scope === 'internal' ? INTERNAL_CATEGORIES : EXTERNAL_CATEGORIES;

/* Clients and Leads listed separately, spec section 11. Internal work carries no
 * client, so "Internal" never appears here. */
function partyOptions(sel){
  const entries = Object.entries(S.clients).filter(([id,c]) => id !== 'internal' && (c.active !== false || id === sel));
  const isLead = ([id,c]) => id === 'prospects' || c.kind === 'lead' || c.lead === true;
  const group = (label, list) => list.length
    ? `<optgroup label="${label}">${list.map(([id,c]) => `<option value="${id}" ${id===sel?'selected':''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '';
  const byName = (a,b) => a[1].name.localeCompare(b[1].name);
  return `<option value="">Choose…</option>`
    + group('Clients', entries.filter(e => !isLead(e)).sort(byName))
    + group('Leads',   entries.filter(isLead).sort(byName));
}

/* ---------- start sheet */
function openStart(prefill={}){
  const scope = prefill.scope || 'external';
  UI.startScope = scope;
  openModal(`<header><h2>Start timer</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">
    <div class="field"><span>Type of work</span>
      <div class="scope-switch" id="st-scope" data-scope="${scope}"><span class="thumb"></span>
        <button type="button" class="seg-b ${scope==='external'?'on':''}" data-act="scope-pick" data-scope="external">External</button>
        <button type="button" class="seg-b ${scope==='internal'?'on':''}" data-act="scope-pick" data-scope="internal">Internal</button>
      </div>
    </div>
    <div id="st-fields">${startFields(scope, prefill)}</div>
    <div class="err" id="st-err"></div>
  </div>
  <footer><span class="muted">Three choices, then go.</span><button class="btn sig" data-act="start-go">Start timer</button></footer>`);
}
/* Rebuilt whenever the scope toggle changes, so the category list always matches. */
function startFields(scope, prefill={}){
  return `${scope === 'external' ? `<label class="field"><span>Client or lead</span><select class="in" id="st-client" autofocus>${partyOptions(prefill.clientId)}</select></label>` : ''}
    <label class="field"><span>Category</span><select class="in" id="st-cat" ${scope==='internal'?'autofocus':''}>
      <option value="">Choose…</option>
      ${categoriesFor(scope).map(c => `<option value="${esc(c)}" ${c===prefill.category?'selected':''}>${esc(c)}</option>`).join('')}
    </select></label>
    <label class="field"><span>Task type</span>${typeCombo('st-type', prefill.typeId)}</label>
    <label class="field" id="st-other-wrap" hidden><span>Create task name</span><input class="in" id="st-other" placeholder="Name this task"></label>`;
}
async function startGo(){
  const scope = UI.startScope || 'external';
  const clientId = scope === 'external' ? ($('#st-client')?.value || '') : 'internal';
  const category = $('#st-cat')?.value || '';
  const typeId = $('#st-type')?.value || '';
  const otherName = ($('#st-other')?.value || '').trim();
  const err = $('#st-err');
  if (scope === 'external' && !clientId){ err.textContent = 'Choose a client or lead.'; return; }
  if (!category){ err.textContent = 'Choose a category.'; return; }
  if (!typeId && !otherName){ err.textContent = 'Choose a task type, or pick Other and name it.'; return; }
  closeModal();
  await startTimer({scope, clientId, category, typeId, taskName: otherName || null});
}

/* ---------- entry editor (new, edit, stop-timer completion) */
function openEntryEditor(e, opts={}){
  UI.edit = {e: clone(e), opts};
  const mine = e.personId === S.personId, locked = isLocked(monthOf(e.date));
  const approvedEdit = e.id && e.status === 'approved';
  const ty = ttype(e.typeId);
  const units = S.taxonomy.stages;
  const timed = !!opts.fromTimer;
  /* Discrete deliverables only: calls, builds and meetings carry no unit. */
  const DISCRETE = ['email','post','graphic','reel','newsletter','deck','shot','video','article','page'];
  const rawUnit = e.unitType || ty?.unit || '';
  const unit = DISCRETE.some(d => rawUnit.toLowerCase().includes(d)) ? rawUnit : '';
  const title = opts.fromTimer ? 'Wrap up this session' : e.id ? 'Edit time entry' : 'Log time';
  openModal(`<header><h2>${title}</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">
    ${locked ? `<div class="note crit">${monthLabel(monthOf(e.date))} is locked for payouts. Unlock it on Payouts to change this entry.</div>` : ''}
    ${e.source === 'import' ? `<div class="note">Imported from ${esc(e.importRef||'the old log')}: “${esc(e.importRaw?.task||'')}” (${esc(e.importRaw?.category||'')}).${(e.reviewNotes||[]).length ? ' ' + esc(e.reviewNotes.join('. ')) + '.' : ''}</div>` : ''}
    ${timed ? `
    <div class="note" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <span><b>${esc(e.taskName || typeName(e.typeId))}</b><br><span class="muted">${esc(e.scope === 'internal' ? 'Internal' : clientName(e.clientId))}${e.category ? ' · ' + esc(e.category) : ''}</span></span>
      <span class="eyebrow" id="ed-dur"></span>
    </div>
    <input type="hidden" id="ed-person" value="${esc(e.personId)}"><input type="hidden" id="ed-date" value="${esc(e.date)}">
    <input type="hidden" id="ed-start" value="${e.start ? timeKey(e.start) : ''}"><input type="hidden" id="ed-end" value="${e.end ? timeKey(e.end) : ''}">
    <input type="hidden" id="ed-client" value="${esc(e.clientId||'')}"><input type="hidden" id="ed-type" value="${esc(e.typeId||'')}">
    <label class="field"><span>Paused or on a break (minutes)</span><input class="in num" type="number" min="0" id="ed-paused" value="${e.pausedMin||0}"><small>Subtracted from the session. Do not fake an end time for a break.</small></label>
    ` : `
    <div class="fg">
      <label class="field"><span>Person</span><select class="in" id="ed-person" ${S.me.isOwner ? '' : 'disabled'}>${personOptions(e.personId, true)}</select></label>
      <label class="field"><span>Date</span><input class="in" type="date" id="ed-date" value="${esc(e.date)}"></label>
      <label class="field"><span>Start</span><input class="in" type="time" id="ed-start" value="${e.start ? timeKey(e.start) : ''}"></label>
      <label class="field"><span>End</span><input class="in" type="time" id="ed-end" value="${e.end ? timeKey(e.end) : ''}"></label>
      <label class="field"><span>Paused (min)</span><input class="in num" type="number" min="0" id="ed-paused" value="${e.pausedMin||0}"></label>
    </div>
    <div class="spread"><span id="ed-dur" class="eyebrow"></span></div>
    <div class="fg">
      <label class="field"><span>Client or lead</span><select class="in" id="ed-client">${partyOptions(e.clientId)}</select></label>
      <label class="field"><span>Category</span><select class="in" id="ed-cat"><option value="">Choose…</option>${categoriesFor(e.scope||'external').map(c => `<option value="${esc(c)}" ${c===e.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Task type</span>${typeCombo('ed-type', e.typeId)}</label>
    `}

    ${/* Units exist only where the task type defines one, spec section 14. The unit
         label comes from the type and is never typed by hand. */ ''}
    ${unit ? `<label class="field"><span>${esc(unit)} completed</span><input class="in num" type="number" min="0" step="1" id="ed-units" value="${e.units ?? ''}" placeholder="e.g. 6"></label>`
           : `<input type="hidden" id="ed-units" value="">`}
    <input type="hidden" id="ed-unit" value="${esc(unit || '')}">

    <div class="fg">
      <label class="field"><span>Did you complete this task?</span><select class="in" id="ed-done">
        <option value="yes" ${e.completed !== false ? 'selected' : ''}>Yes, finished</option>
        <option value="no" ${e.completed === false ? 'selected' : ''}>No, still in progress</option>
      </select></label>
      <label class="field"><span>AI assistance</span><select class="in" id="ed-ai">${[['none','None'],['assisted','AI-assisted'],['led','AI-led']].map(([v,l]) => `<option value="${v}" ${v===(e.ai||'none')?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>

    <label class="check"><input type="checkbox" id="ed-deliv" ${e.contractDeliverable?'checked':''}> Contract deliverable</label>

    <label class="check"><input type="checkbox" id="ed-joint" ${e.joint?'checked':''}> Joint task</label>
    <div id="ed-joint-wrap" ${e.joint?'':'hidden'} style="margin:4px 0 2px 26px">
      <span class="eyebrow">Who else worked on this</span>
      <div class="row" style="flex-wrap:wrap;gap:12px;margin-top:6px">
        ${Object.entries(S.people).filter(([id,p]) => id !== e.personId && p.active !== false).map(([id,p]) =>
          `<label class="check"><input type="checkbox" class="ed-jp" value="${id}" ${(e.jointWith||[]).includes(id)?'checked':''}> ${esc(p.name)}</label>`).join('')}
      </div>
    </div>
    <details ${ (e.allocations||[]).length ? 'open' : ''}><summary class="eyebrow" style="cursor:pointer">Parallel task</summary>
      <p class="muted" style="margin:6px 0 10px">Something else you did alongside the main task. Minutes come out of this session; whatever is left stays on the task above.</p>
      <div id="ed-allocs" class="stack" style="gap:8px"></div>
      <button class="btn sm" data-act="alloc-add" style="margin-top:8px">Add split</button>
    </details>
    ${approvedEdit ? `<label class="field"><span>Reason for change <span class="muted">(required, this entry is approved and affects payouts)</span></span><input class="in" id="ed-reason"></label>` : ''}
    <div class="err" id="ed-err"></div>
  </div>
  <footer><span class="row">${e.id && !locked ? `<button class="btn danger" data-act="ed-delete">Delete</button>` : ''}</span>
  <span class="row">${opts.fromTimer ? `<button class="btn" data-act="ed-discard">Discard session</button>` : ''}
    <button class="btn" data-act="ed-save" data-status="draft" ${locked?'disabled':''}>Save draft</button>
    <button class="btn pri" data-act="ed-save" data-status="submit" ${locked?'disabled':''}>${S.settings.approvalMode === 'self' ? 'Save and approve' : 'Save and submit'}</button></span></footer>`, {wide:true});
  renderAllocs(); updateDur();
}
function renderAllocs(){
  const box = $('#ed-allocs'); if (!box) return;
  const A = UI.edit.e.allocations ||= [];
  box.innerHTML = A.map((a,i) => `<div class="alloc">
    <select class="in" data-alloc="${i}" data-k="clientId">${clientOptions(a.clientId || UI.edit.e.clientId, false)}</select>
    <select class="in" data-alloc="${i}" data-k="typeId">${FAMILY_ORDER().map(f => `<optgroup label="${esc(famName(f))}">${Object.values(S.taxonomy.types).filter(t => t.family===f && t.active!==false).map(t => `<option value="${t.code}" ${t.code===a.typeId?'selected':''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select>
    <input class="in num" type="number" min="0" data-alloc="${i}" data-k="minutes" value="${a.minutes||0}" title="Minutes">
    <select class="in" data-alloc="${i}" data-k="attention"><option value="active" ${a.attention!=='background'?'selected':''}>Active attention</option><option value="background" ${a.attention==='background'?'selected':''}>Background / AI</option></select>
    <button class="btn sm ghost" data-act="alloc-del" data-i="${i}" title="Remove">✕</button></div>`).join('') || `<span class="muted">No splits.</span>`;
}
function readEditor(){
  const e = UI.edit.e;
  e.personId = $('#ed-person').value; e.date = $('#ed-date').value;
  const st = $('#ed-start').value, en = $('#ed-end').value;
  if (st && en && e.date){
    e.start = zoned(e.date, st); e.end = zoned(e.date, en); if (e.end <= e.start) e.end = zoned(addDays(e.date,1), en);
    e.pausedMin = Math.max(0, +$('#ed-paused').value || 0);
    e.minutes = Math.max(0, Math.round((e.end - e.start)/60000) - e.pausedMin);
  } else { e.start = e.start || null; e.end = e.end || null; }
  e.clientId = $('#ed-client').value || null; e.typeId = $('#ed-type').value || null;
  if ($('#ed-cat')) e.category = $('#ed-cat').value || null;
  e.scope = e.clientId === 'internal' ? 'internal' : (e.scope || 'external');
  const u = $('#ed-units')?.value; e.units = (u === '' || u == null) ? null : +u;
  e.unitType = $('#ed-unit')?.value || null;
  e.ai = $('#ed-ai')?.value || 'none';
  /* Spec section 19: Contract deliverable replaces classification, billable and
   * counts-toward-payout. Those are derived rather than asked for. */
  e.contractDeliverable = !!$('#ed-deliv')?.checked;
  e.completed = ($('#ed-done')?.value || 'yes') === 'yes';
  e.joint = !!$('#ed-joint')?.checked;
  e.jointWith = e.joint ? $$('.ed-jp').filter(c => c.checked).map(c => c.value) : [];
  const ty0 = ttype(e.typeId);
  e.cls = ty0?.cls || e.cls || null;
  e.billable = e.contractDeliverable || defaultBillable(e.typeId, e.clientId);
  e.payoutEligible = ty0?.payoutEligible !== false;
  e.note = e.taskName || e.note || '';
  return e;
}
function updateDur(){
  try { const e = readEditor(); const act = sum((e.allocations||[]).filter(a => a.attention!=='background'), a => a.minutes);
    $('#ed-dur').textContent = e.minutes ? `${hm(e.minutes)} of labor${act ? ` · ${hm(act)} split out · ${hm(Math.max(0,e.minutes-act))} on the main task` : ''}` : 'Set a start and end time';
  } catch {}
}
async function saveEditor(mode){
  const e = readEditor(); const err = $('#ed-err'); const prev = e.id ? entryById(e.id) : null;
  if (!e.date || !e.start || !e.end || !(e.minutes > 0)) return err.textContent = 'Set a date, start and end time.';
  if (!e.clientId || !e.typeId) return err.textContent = 'Choose a client and a task type.';
  const active = sum((e.allocations||[]).filter(a => a.attention !== 'background'), a => a.minutes);
  if (active > e.minutes) return err.textContent = `Split minutes (${active}) are more than the session (${e.minutes}). One person can't log more labor than elapsed time.`;
  // overlap guard: the same person cannot hold two full sessions in the same minutes
  const clash = allEntries().find(x => x.personId === e.personId && x.id !== e.id && x.id !== UI.edit.mergeDelete && x.start && x.end && x.start < e.end && e.start < x.end);
  if (clash && !UI.edit.overlapOk){ UI.edit.overlapOk = true; return err.innerHTML = `This overlaps your ${esc(timeKey(clash.start))}–${esc(timeKey(clash.end))} entry (${esc(typeName(clash.typeId))}). Multitasking belongs in one session with a parallel task. Save again to keep both; the overlap will be flagged in Time Log.`; }
  let reason = $('#ed-reason')?.value?.trim() || '';
  if (prev?.status === 'approved' && !reason) return err.textContent = 'Give a reason. This entry is approved and the change affects payouts.';
  if (mode === 'submit') e.status = S.settings.approvalMode === 'self' ? 'approved' : 'submitted';
  else if (!prev || prev.status !== 'approved') e.status = 'draft';
  if (prev?.status === 'approved' && prev.personId === S.personId && S.settings.approvalMode !== 'self') e.status = 'submitted';   // your own change to approved time goes back for approval
  if (e.status === 'approved'){ e.approvedBy ||= S.personId; e.approvedAt ||= Date.now(); }
  if (e.needsReview && e.clientId && e.typeId) { e.needsReview = false; e.reviewNotes = []; }
  e.source ||= 'lucid';
  const mergeFrom = UI.edit.mergeDelete; delete e._mergeFrom;
  if (mergeFrom && prev?.status === 'approved' && !reason) reason = 'Merged overlapping entries';
  try { await saveEntry(e, reason);
    if (mergeFrom){ const o = entryById(mergeFrom); if (o){ await upsertItem('entries', monthOf(o.date), o.id, {...o, deleted:true, mergedInto:e.id}); await audit('entry', o.id, [{field:'merged into', from:null, to:e.id}], reason || 'Merged overlapping entries', {payoutImpact:o.status==='approved'}); } }
  } catch (x){ return err.textContent = x.message || 'Could not save. Try again.'; }
  const {opts} = UI.edit; closeModal();
  if (opts.fromTimer){ await S.db.doc('timers/'+S.personId).set({running:false, updatedAt:Date.now()}); UI.awayPrompt = null; UI.dismissed.long = false; }
  toast(e.status === 'submitted' ? 'Saved and submitted for approval' : e.status === 'approved' ? 'Saved' : 'Saved as draft');
}
async function setStatus(ids, status, reason){
  for (const id of ids){
    const e = entryById(id); if (!e || isLocked(monthOf(e.date))) continue;
    const n = {...e, status};
    if (status === 'approved'){ n.approvedBy = S.personId; n.approvedAt = Date.now(); }
    if (status === 'rejected'){ n.rejectReason = reason || ''; }
    await upsertItem('entries', monthOf(e.date), id, n);
    await audit('entry', id, [{field:'status', from:e.status, to:status}], reason || '', {month:monthOf(e.date), payoutImpact: status==='approved' || e.status==='approved'});
  }
  toast(`${ids.length} ${ids.length===1?'entry':'entries'} ${status === 'submitted' ? 'submitted' : status}`);
}

/* AI Quick Log removed, spec section 3. Time logging is deterministic and the
 * product runs with no AI API key. Use Log time for anything not timed live. */
