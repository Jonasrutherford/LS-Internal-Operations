/* ================================================================ boot */
const NAV = [
  ['Work', [['track','Track'],['entries','Timesheet'],['review','Review queue']]],
  ['Insight', [['company','Company'],['me','My dashboard'],['clients','Clients'],['tasks','Task types']]],
  ['Money', [['payouts','Payouts'],['revenue','Revenue'],['contracts','Contracts'],['expenses','Expenses']]],
  ['System', [['settings','Settings'],['audit','Audit log']]],
];
const VIEWS = {};

async function boot(){
  const th = lsGet('theme', ''); if (th) document.documentElement.dataset.theme = th;
  renderShell();
  const c = window.claude;
  const [db, user] = await Promise.all([c?.use?.('db') ?? null, c?.use?.('user') ?? null]);
  S.db = db; S.user = user;
  if (!db){ $('#main').innerHTML = `<div class="gate panel"><h2>Lucid OS needs its database</h2><p class="ink2">Open this page inside Claude to load your team's time, revenue and payout records.</p></div>`; return; }
  if (user){ const me = await user.me(); S.me = {id:me.id, name:me.name, avatarUrl:me.avatarUrl, isOwner:me.isOwner}; }
  c.use('mcp').then(m => { S.mcp = m; }); c.use('downloads').then(d => { S.dl = d; }); c.use('sample').then(s => { S.sample = s; });
  subscribe();
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
  S.db.collection('sync').onSnapshot(snap => { for (const d of snap.docs) if (d.id === 'clickup') S.clickup = d.data(); bump(); }, onErr);
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
function scheduleRender(){ if (_rq) return; _rq = true; requestAnimationFrame(() => { _rq = false; render(); }); }
function go(view){ if (!VIEWS[view]) view = 'track'; S.view = view; lsSet('view', view); try { history.replaceState(null, '', '#'+view); } catch {} render(); window.scrollTo(0,0); }

/* ================================================================ shell */
const LOGO = `<svg viewBox="0 0 10880 4522" aria-hidden="true"><path d="%%LOGO%%"/></svg>`;
function renderShell(){
  $('#root').innerHTML = `<div class="app">
    <header class="strip"><div class="brand">${LOGO}<b>Lucid <span>OS</span></b></div><div class="timer" id="timer"></div><div class="who" id="who"></div></header>
    <nav class="rail" id="rail"></nav>
    <main id="main"><div class="empty">Loading Lucid OS…</div></main></div><div id="modal"></div>`;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  const h = (location.hash||'').slice(1); S.view = VIEWS[h] ? h : lsGet('view', 'track');
  UI.tick = setInterval(tick, 1000);
}
function renderRail(){
  const rv = S.personId && S.loaded.entries ? reviewItems() : null;
  $('#rail').innerHTML = NAV.map(([g, items]) => `<div class="grp eyebrow">${g}</div>` + items.map(([id, label]) => {
    let badge = '';
    if (id === 'review' && rv?.total) badge = `<span class="badge">${rv.total}</span>`;
    if (id === 'entries' && rv?.approve.length) badge = `<span class="badge">${rv.approve.length} to approve</span>`;
    return `<a href="#${id}" data-go="${id}" class="${S.view===id?'on':''}">${label}${badge}</a>`;
  }).join('')).join('') + `<div class="kbd"><kbd>⌘</kbd> <kbd>K</kbd> jump anywhere</div>`;
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
  main.innerHTML = banners() + (VIEWS[S.view] || VIEWS.track)();
  window.scrollTo(0, scroll);
  (VIEWS[S.view]?.after || (()=>{}))();
}
function renderGate(){
  $('#rail').innerHTML = ''; $('#timer').innerHTML = '';
  const opts = Object.entries(S.people).filter(([,p]) => p.role === 'partner' || p.active);
  $('#main').innerHTML = `<div class="gate">
    <div class="eyebrow">Lucid OS</div><h1 style="margin:6px 0 8px">Who's signing in?</h1>
    <p class="ink2">Pick your name once. Lucid OS links it to your Claude account so your timer and hours follow you across devices.</p>
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
  el.className = 'timer on' + (t.pausedAt ? ' paused' : '');
  el.innerHTML = `<div class="live"><span class="dot"></span><div class="what"><b>${esc(t.clickupTaskName || typeName(t.typeId))}</b><small>${esc(clientName(t.clientId))} · ${esc(t.clickupTaskName ? typeName(t.typeId) : (ttype(t.typeId)?.code||''))}${t.pausedAt?' · paused':''}</small></div>
    <span class="clock" id="clock">${clockFmt(elapsedMs(t))}</span>
    <button class="tbtn" data-act="${t.pausedAt?'resume':'pause'}">${t.pausedAt?'Resume':'Pause'}</button>
    <button class="tbtn" data-act="switch">Switch</button>
    <button class="tbtn stop" data-act="stop">Stop</button></div>`;
}
function tick(){
  const t = S.timers[S.personId]; const c = $('#clock');
  if (t?.running && c) c.textContent = clockFmt(elapsedMs(t));
  if (t?.running){ const m = Math.floor(elapsedMs(t)/60000); document.title = `${clockFmt(elapsedMs(t)).slice(0,-3)} · ${typeName(t.typeId)} · Lucid OS`; if (m && m % 30 === 0 && new Date().getSeconds() === 0) maybeNotify(t, m); }
  else if (document.title !== 'Lucid OS') document.title = 'Lucid OS';
}
function maybeNotify(t, m){
  const st = S.settings; if (m < (st.longTimerHours||3)*60) return;
  try { if (window.Notification?.permission === 'granted') new Notification('Lucid OS timer still running', {body:`${hm(m)} on ${typeName(t.typeId)}`}); } catch {}
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
  await timerSet({running:true, start:Date.now(), pausedMs:0, pausedAt:null, clientId:d.clientId, typeId:d.typeId, clickupTaskId:d.clickupTaskId||null, clickupTaskName:d.clickupTaskName||null, note:d.note||''});
  toast('Timer started');
}
async function pauseTimer(){ const t = S.timers[S.personId]; if (t?.running && !t.pausedAt) await timerSet({pausedAt:Date.now()}); }
async function resumeTimer(){ const t = S.timers[S.personId]; if (t?.pausedAt) await timerSet({pausedMs:(t.pausedMs||0) + (Date.now()-t.pausedAt), pausedAt:null}); }
function stopTimer(then){
  const t = S.timers[S.personId]; if (!t?.running) return;
  const end = t.pausedAt || Date.now();
  const pausedMin = Math.round(((t.pausedMs||0))/60000);
  const ty = ttype(t.typeId);
  openEntryEditor({
    personId:S.personId, date:dayKey(t.start), start:t.start, end, pausedMin, clientId:t.clientId, typeId:t.typeId,
    clickupTaskId:t.clickupTaskId, clickupTaskName:t.clickupTaskName, note:t.note||'', unitType:ty?.unit||null,
    billable: defaultBillable(t.typeId, t.clientId), payoutEligible: ty?.payoutEligible !== false, cls: ty?.cls || null, status:'draft', source:'lucid',
  }, {fromTimer:true, then});
}
function defaultBillable(typeId, clientId){ const ty = ttype(typeId); return !!ty?.billable && !['internal','prospects'].includes(clientId); }

/* ================================================================ modals */
function openModal(html, opts={}){
  UI.modal = opts; $('#modal').innerHTML = `<div class="scrim" data-act="scrim"><div class="modal ${opts.wide?'wide':''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = $('#modal [autofocus]') || $('#modal input, #modal select'); f?.focus();
}
function closeModal(){ $('#modal').innerHTML = ''; UI.modal = null; }

function clientOptions(sel, withBlank=true){
  const act = Object.entries(S.clients).sort((a,b) => (a[1].kind==='internal') - (b[1].kind==='internal') || a[1].name.localeCompare(b[1].name));
  return (withBlank ? `<option value="">Choose client…</option>` : '') + act.filter(([id,c]) => c.active !== false || id === sel).map(([id,c]) => `<option value="${id}" ${id===sel?'selected':''}>${esc(c.name)}</option>`).join('');
}
function personOptions(sel, all=false){ return Object.entries(S.people).filter(([id,p]) => all || p.poolMember || p.active).map(([id,p]) => `<option value="${id}" ${id===sel?'selected':''}>${esc(p.name)}</option>`).join(''); }

/* task type combobox: grouped by service family, type to filter */
function typeCombo(id, value){
  return `<div class="combo" data-combo="${id}"><input class="in" id="${id}-q" placeholder="Search task types, e.g. reel, email, call" autocomplete="off" value="${esc(value ? ttype(value)?.code+' · '+typeName(value) : '')}"><input type="hidden" id="${id}" value="${esc(value||'')}"><div class="list" hidden></div></div>`;
}
function comboList(id, q){
  const box = $(`[data-combo="${id}"] .list`); q = (q||'').toLowerCase().trim();
  const T = S.taxonomy.types; let html = ''; let first = null;
  for (const f of FAMILY_ORDER()){
    const opts = Object.values(T).filter(t => t.family === f && t.active !== false && (!q || (t.code+' '+t.name+' '+famName(f)+' '+(t.unit||'')).toLowerCase().includes(q))).sort((a,b)=>a.order-b.order);
    if (!opts.length) continue;
    html += `<div class="fam">${esc(famName(f))}</div>` + opts.map(t => { first ||= t.code; return `<div class="opt" data-pick="${id}" data-code="${t.code}"><span>${esc(t.name)}</span><small>${t.code} · per ${esc(t.unit)}</small></div>`; }).join('');
  }
  box.innerHTML = html || `<div class="empty">No task type matches. Add one on Task types.</div>`; box.hidden = false; box.dataset.first = first || '';
}
function pickType(id, code){
  $('#'+id).value = code; const q = $('#'+id+'-q'); q.value = `${code} · ${typeName(code)}`; $(`[data-combo="${id}"] .list`).hidden = true; q.blur();
  $('#'+id).dispatchEvent(new Event('change', {bubbles:true}));
}

/* ClickUp task picker */
function clickupOptions(clientId, sel){
  const tasks = (S.clickup?.tasks||[]).filter(t => !/complete|closed|done/i.test(t.status||'') || t.id === sel);
  const listId = S.clients[clientId]?.clickupListId;
  const scoped = listId ? tasks.filter(t => t.listId === listId) : tasks;
  const rest = listId ? tasks.filter(t => t.listId !== listId) : [];
  const opt = t => `<option value="${t.id}" ${t.id===sel?'selected':''}>${esc(t.name)} (${esc(t.listName||'')})</option>`;
  return `<option value="">No ClickUp task</option>` + (scoped.length ? `<optgroup label="${esc(listId ? S.clients[clientId].name : 'Open tasks')}">${scoped.map(opt).join('')}</optgroup>` : '') + (rest.length ? `<optgroup label="Other lists">${rest.slice(0,200).map(opt).join('')}</optgroup>` : '');
}

/* ---------- start sheet */
function openStart(prefill={}){
  const synced = S.clickup?.tasks?.length;
  openModal(`<header><h2>Start a timer</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">
    <div class="fg">
      <label class="field"><span>Client</span><select class="in" id="st-client" autofocus>${clientOptions(prefill.clientId)}</select></label>
      <label class="field"><span>ClickUp task</span><select class="in" id="st-cu">${synced ? clickupOptions(prefill.clientId, prefill.clickupTaskId) : '<option value="">Sync ClickUp in Settings to pick tasks</option>'}</select></label>
    </div>
    <label class="field"><span>Task type</span>${typeCombo('st-type', prefill.typeId)}<small>Pick the most specific type. It drives benchmarks and pricing.</small></label>
    <label class="field"><span>Note <span class="muted">(optional)</span></span><input class="in" id="st-note" value="${esc(prefill.note||'')}" placeholder="What are you working on?"></label>
    <div class="err" id="st-err"></div>
  </div>
  <footer><span class="muted">Only client and task type are required.</span><button class="btn sig" data-act="start-go">Start timer</button></footer>`);
}
async function startGo(){
  const clientId = $('#st-client').value, typeId = $('#st-type').value, cu = $('#st-cu').value;
  if (!clientId || !typeId){ $('#st-err').textContent = 'Choose a client (or Lucid Studio internal) and a task type.'; return; }
  const task = (S.clickup?.tasks||[]).find(t => t.id === cu);
  closeModal(); await startTimer({clientId, typeId, clickupTaskId:cu||null, clickupTaskName:task?.name||null, note:$('#st-note')?.value});
}

/* ---------- entry editor (new, edit, stop-timer completion) */
function openEntryEditor(e, opts={}){
  UI.edit = {e: clone(e), opts};
  const mine = e.personId === S.personId, locked = isLocked(monthOf(e.date));
  const approvedEdit = e.id && e.status === 'approved';
  const ty = ttype(e.typeId);
  const units = S.taxonomy.stages;
  const title = opts.fromTimer ? 'Wrap up this session' : e.id ? 'Edit time entry' : 'Log time';
  openModal(`<header><h2>${title}</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">
    ${locked ? `<div class="note crit">${monthLabel(monthOf(e.date))} is locked for payouts. Unlock it on Payouts to change this entry.</div>` : ''}
    ${e.source === 'import' ? `<div class="note">Imported from ${esc(e.importRef||'the old log')}: “${esc(e.importRaw?.task||'')}” (${esc(e.importRaw?.category||'')}).${(e.reviewNotes||[]).length ? ' ' + esc(e.reviewNotes.join('. ')) + '.' : ''}</div>` : ''}
    <div class="fg">
      <label class="field"><span>Person</span><select class="in" id="ed-person" ${S.me.isOwner ? '' : 'disabled'}>${personOptions(e.personId, true)}</select></label>
      <label class="field"><span>Date</span><input class="in" type="date" id="ed-date" value="${esc(e.date)}"></label>
      <label class="field"><span>Start</span><input class="in" type="time" id="ed-start" value="${e.start ? timeKey(e.start) : ''}"></label>
      <label class="field"><span>End</span><input class="in" type="time" id="ed-end" value="${e.end ? timeKey(e.end) : ''}"></label>
      <label class="field"><span>Paused (min)</span><input class="in num" type="number" min="0" id="ed-paused" value="${e.pausedMin||0}"></label>
    </div>
    <div class="spread"><span id="ed-dur" class="eyebrow"></span>${e.joint ? `<span class="chip acc">Joint session, counted in full for each person</span>` : ''}</div>
    <div class="fg">
      <label class="field"><span>Client</span><select class="in" id="ed-client">${clientOptions(e.clientId)}</select></label>
      <label class="field"><span>ClickUp task</span><select class="in" id="ed-cu">${clickupOptions(e.clientId, e.clickupTaskId)}</select></label>
    </div>
    <label class="field"><span>Task type</span>${typeCombo('ed-type', e.typeId)}</label>
    <div class="fg">
      <label class="field"><span>Deliverables</span><input class="in num" type="number" min="0" step="0.5" id="ed-units" value="${e.units ?? ''}" placeholder="e.g. 6"></label>
      <label class="field"><span>Unit</span><input class="in" id="ed-unit" value="${esc(e.unitType || ty?.unit || '')}"></label>
      <label class="field"><span>Work stage</span><select class="in" id="ed-stage"><option value="">–</option>${units.map(s => `<option ${s===e.stage?'selected':''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span>Complexity</span><select class="in" id="ed-cx"><option value="">–</option>${S.taxonomy.complexity.map(s => `<option ${s===e.complexity?'selected':''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span>AI assistance</span><select class="in" id="ed-ai">${[['','–'],['none','None'],['assisted','AI-assisted'],['led','AI-led']].map(([v,l]) => `<option value="${v}" ${v===(e.ai||'')?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Revision round</span><select class="in" id="ed-rev">${['','0','1','2','3+'].map(v => `<option value="${v}" ${String(e.revision ?? '')===v?'selected':''}>${v===''?'–':v==='0'?'Original':v}</option>`).join('')}</select></label>
    </div>
    <div class="fg">
      <label class="field"><span>Classification</span><select class="in" id="ed-cls">${[['revenue','Revenue-producing'],['support','Support'],['admin','Administrative']].map(([v,l]) => `<option value="${v}" ${v===(e.cls||ty?.cls)?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="ed-bill" ${e.billable?'checked':''}> Billable</label>
      <label class="check"><input type="checkbox" id="ed-pay" ${e.payoutEligible!==false?'checked':''}> Counts toward payout hours</label>
    </div>
    <label class="field"><span>Completion note</span><textarea class="in" id="ed-note" rows="2" placeholder="What got done">${esc(e.note||'')}</textarea></label>
    <details ${ (e.allocations||[]).length ? 'open' : ''}><summary class="eyebrow" style="cursor:pointer">Split or parallel tasks</summary>
      <p class="muted" style="margin:6px 0 10px">Split the session across tasks. Active minutes cannot exceed the session; whatever is left stays on the task above. Background items (an AI job, a render) are recorded but add no labor.</p>
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
  const cu = $('#ed-cu').value; e.clickupTaskId = cu || null; e.clickupTaskName = cu ? ((S.clickup?.tasks||[]).find(t => t.id===cu)?.name || e.clickupTaskName) : null;
  const u = $('#ed-units').value; e.units = u === '' ? null : +u; e.unitType = $('#ed-unit').value || null;
  e.stage = $('#ed-stage').value || null; e.complexity = $('#ed-cx').value || null; e.ai = $('#ed-ai').value || null;
  const rv = $('#ed-rev').value; e.revision = rv === '' ? null : rv;
  e.cls = $('#ed-cls').value; e.billable = $('#ed-bill').checked; e.payoutEligible = $('#ed-pay').checked; e.note = $('#ed-note').value.trim();
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
  if (clash && !UI.edit.overlapOk){ UI.edit.overlapOk = true; return err.innerHTML = `This overlaps your ${esc(timeKey(clash.start))}–${esc(timeKey(clash.end))} entry (${esc(typeName(clash.typeId))}). Multitasking belongs in one session with splits. Save again to keep both; the overlap will show in the Review queue.`; }
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
  if (opts.then === 'switch') openStart({clientId:e.clientId});
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

/* ---------- natural-language quick log (asks Claude, you confirm) */
async function parseQuick(text){
  const out = $('#ql-out');
  if (!S.sample){ out.innerHTML = `<div class="note">Quick log needs Claude access in this view. Use Log time instead.</div>`; return; }
  out.innerHTML = `<div class="muted">Reading that…</div>`;
  const types = Object.values(S.taxonomy.types).filter(t => t.active!==false).map(t => `${t.code}: ${t.name} (per ${t.unit})`).join('\n');
  const cls = Object.entries(S.clients).map(([id,c]) => `${id}: ${c.name}${c.aliases?.length ? ' aka '+c.aliases.join(', ') : ''}`).join('\n');
  const prompt = `You convert an agency team member's plain-English work note into structured time-log rows.
Today is ${today()} (${TZ()}). Clients (id: name):\n${cls}\nTask types (code: name):\n${types}
Return JSON: {"rows":[{"clientId":string|null,"typeId":string|null,"units":number|null,"minutes":number|null,"date":"YYYY-MM-DD"|null,"ai":"none"|"assisted"|"led"|null,"note":string}]}.
One row per distinct task type. Use the most specific task type. "Made" usually means production, "edited" means an edit or revision task. Only set minutes if the note states a duration. Use null when unsure. Note: "${text.replace(/"/g,"'")}"`;
  try {
    const res = await S.sample.json(prompt, {modelTier:'quick'});
    const rows = (res?.rows||[]).filter(r => r && (r.typeId || r.clientId));
    UI.quick = rows.map(r => ({...r, typeId: ttype(r.typeId) ? r.typeId : null, clientId: S.clients[r.clientId] ? r.clientId : null}));
    out.innerHTML = UI.quick.length ? `<div class="stack" style="gap:8px">${UI.quick.map((r,i) => `<div class="spread panel" style="padding:10px 12px"><span><b>${esc(typeName(r.typeId))}</b> · ${esc(clientName(r.clientId))}${r.units ? ` · ${r.units} ${esc(ttype(r.typeId)?.unit||'')}` : ''}${r.minutes ? ` · ${hm(r.minutes)}` : ''}${r.ai && r.ai!=='none' ? ' · AI-assisted' : ''}<br><span class="muted">${esc(r.note||'')}</span></span><button class="btn sm pri" data-act="ql-use" data-i="${i}">Review and save</button></div>`).join('')}</div>` : `<div class="note">Couldn't find a task in that. Try naming the client and what you made.</div>`;
  } catch (e){
    out.innerHTML = `<div class="note warn">${e?.code === 'not_granted' ? 'Claude access was declined for this page.' : e?.code === 'rate_limited' ? 'Too many requests. Wait a moment and try again.' : 'Could not read that note. Use Log time instead.'}</div>`;
  }
}
function useQuick(i){
  const r = UI.quick[i]; const end = Date.now(); const mins = r.minutes || 30; const d = r.date || today();
  const endMs = d === today() ? end : zoned(d, '17:00');
  const ty = ttype(r.typeId);
  openEntryEditor({personId:S.personId, date:d, start:endMs - mins*60000, end:endMs, clientId:r.clientId, typeId:r.typeId, units:r.units, unitType:ty?.unit, ai:r.ai, note:r.note,
    billable:defaultBillable(r.typeId, r.clientId), payoutEligible:true, cls:ty?.cls, status:'draft', source:'lucid'});
  if (!r.minutes) setTimeout(() => { const er = $('#ed-err'); if (er) er.textContent = 'Check the start and end time. The note didn\'t include a duration.'; }, 50);
}
