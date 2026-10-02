/* ================================================================ shared filter + chart helpers */
function F(){ return UI.f ||= lsGet('f', {range:'ytd', from:'', to:'', person:'all', client:'all', family:'all'}); }
function setF(p){ Object.assign(F(), p); lsSet('f', F()); render(); }
function rangeDates(f=F()){
  const t = today(), m = t.slice(0,7);
  switch (f.range){
    case 'month': return [m+'-01', t, monthLabel(m)];
    case 'last': { const lm = addMonths(m,-1); return [lm+'-01', monthEnd(lm), monthLabel(lm)]; }
    case 'week': { const w = weekStart(t); return [w, t, 'This week']; }
    case '90': return [addDays(t,-89), t, 'Last 90 days'];
    case 'custom': return [f.from || t.slice(0,4)+'-01-01', f.to || t, `${dateLabel(f.from)} to ${dateLabel(f.to)}`];
    default: return [t.slice(0,4)+'-01-01', t, 'Year to date'];
  }
}
function filterBar(opts={person:true, client:true, family:true}){
  const f = F();
  return `<div class="filters">
    <div class="seg">${[['week','Week'],['month','Month'],['last','Last month'],['90','90 days'],['ytd','YTD'],['custom','Custom']].map(([k,l]) => `<button data-f="range" data-v="${k}" class="${f.range===k?'on':''}">${l}</button>`).join('')}</div>
    ${f.range==='custom' ? `<input class="in" type="date" id="f-from" value="${esc(f.from)}" style="width:auto"><input class="in" type="date" id="f-to" value="${esc(f.to)}" style="width:auto">` : ''}
    ${opts.person ? `<select class="in" id="f-person" style="width:auto"><option value="all">Everyone</option>${personOptions(f.person)}</select>` : ''}
    ${opts.client ? `<select class="in" id="f-client" style="width:auto"><option value="all">All clients</option>${clientOptions(f.client, false)}</select>` : ''}
    ${opts.family ? `<select class="in" id="f-family" style="width:auto"><option value="all">All services</option>${FAMILY_ORDER().map(k => `<option value="${k}" ${f.family===k?'selected':''}>${esc(famName(k))}</option>`).join('')}</select>` : ''}
  </div>`;
}
function filteredRows(f=F()){
  const [from, to] = rangeDates(f);
  return laborRows().filter(r => inRange(r.date, from, to) && (f.person==='all' || r.personId===f.person) && (f.client==='all' || r.clientId===f.client) && (f.family==='all' || r.family===f.family));
}
function statusChip(s){ return ({draft:`<span class="chip">Draft</span>`, submitted:`<span class="chip warn">Submitted</span>`, approved:`<span class="chip good">Approved</span>`, rejected:`<span class="chip crit">Rejected</span>`})[s] || `<span class="chip">${esc(s)}</span>`; }
function baseChart(){
  const ink2 = cssv('--ink-2'), ink3 = cssv('--ink-3'), line = cssv('--line');
  return { textStyle:{fontFamily:'Nunito, system-ui, sans-serif', color:ink2}, animationDuration:500,
    grid:{left:8, right:16, top:24, bottom:8, containLabel:true},
    tooltip:{trigger:'axis', backgroundColor:cssv('--panel'), borderColor:cssv('--line-2'), textStyle:{color:cssv('--ink')}, confine:true},
    _ax:{axisLine:{lineStyle:{color:line}}, axisTick:{show:false}, axisLabel:{color:ink3, fontSize:11}, splitLine:{lineStyle:{color:line, opacity:.6}}} };
}
const CHARTS = {};
function mountCharts(){
  if (!window.echarts) return;
  for (const el of $$('[data-chart]')){
    const build = CHARTS[el.dataset.chart]; if (!build) continue;
    const c = echarts.init(el, null, {renderer:'svg'}); c.setOption(build()); UI.charts.push(c);
  }
}
window.addEventListener('resize', () => UI.charts.forEach(c => c.resize()));
const noChartLib = () => !window.echarts ? `<div class="note">Charts are loading. If they don't appear, reload the page.</div>` : '';

/* ================================================================ TRACK */
VIEWS.track = () => {
  const me = S.personId, t = today();
  const mine = allEntries().filter(e => e.personId === me);
  const todays = mine.filter(e => e.date === t).sort((a,b) => a.start-b.start);
  const wk = weekStart(t);
  const weekMin = sum(laborRows().filter(r => r.personId===me && r.date>=wk), r => r.minutes);
  const monMin = sum(laborRows().filter(r => r.personId===me && r.date.startsWith(t.slice(0,7))), r => r.minutes);
  const recent = mine.filter(e => e.source !== 'import').slice(0, 5);
  const favs = Object.values(groupBy(mine.filter(e => e.typeId && e.clientId).slice(0,80), e => e.clientId+'|'+e.typeId)).sort((a,b) => b.length-a.length).slice(0,6).map(g => g[0]);
  const run = S.timers[me]?.running;
  const dayTicks = [6,9,12,15,18,21,24];
  return `<div class="head"><div><div class="eyebrow">${esc(dateLong(t))}</div><h1>Good ${hourOf(Date.now())<12?'morning':hourOf(Date.now())<18?'afternoon':'evening'}, ${esc(person(me).name)}</h1></div>
    <div class="row"><button class="btn" data-act="log">Log past time</button><button class="btn sig" data-act="start" ${run?'disabled title="Stop the running timer first"':''}>Start timer</button></div></div>
  <div class="band b4">
    <div><div class="k">Today</div><div class="v">${hm(sum(todays, e=>e.minutes) + (run && dayKey(S.timers[me].start)===t ? elapsedMs(S.timers[me])/60000 : 0))}</div><div class="s">${todays.length} ${todays.length===1?'entry':'entries'}</div></div>
    <div><div class="k">This week</div><div class="v">${hrs(weekMin)} h</div><div class="s">capacity ${person(me).weeklyCapacity||'–'} h</div></div>
    <div><div class="k">This month</div><div class="v">${hrs(monMin)} h</div><div class="s">${esc(monthLabel(t.slice(0,7)))}</div></div>
    <div><div class="k">Drafts to submit</div><div class="v">${reviewItems().drafts.length}</div><div class="s"><a href="#entries" data-go="entries">Open timesheet</a></div></div>
  </div>
  <div class="grid g-main" style="margin-top:14px">
    <div class="stack">
      <div class="panel"><h3>Today <span class="muted">${esc(TZ().split('/')[1].replace('_',' '))} time</span></h3>
        <div class="day">${dayTicks.slice(1,-1).map(h => `<b style="left:${(h-6)/18*100}%"></b>`).join('')}${todays.map((e,i) => { const s = Math.max(0,(hourOf(e.start)+ (+timeKey(e.start).slice(3))/60 - 6)/18), w = e.minutes/60/18; return `<i title="${esc(timeKey(e.start))} ${esc(typeName(e.typeId))}" style="left:${s*100}%; width:${Math.min(w,1-s)*100}%; background:${seriesColor(FAMILY_ORDER().indexOf(famOf(e.typeId)))}"></i>`; }).join('')}</div>
        <div class="day-scale">${dayTicks.map(h => `<span>${h===24?'12a':h>12?(h-12)+'p':h===12?'12p':h+'a'}</span>`).join('')}</div>
        ${todays.length ? `<table style="margin-top:10px"><tbody>${todays.map(e => entryRow(e, {compact:true})).join('')}</tbody></table>` : `<div class="empty">Nothing logged today yet.</div>`}
      </div>
      <!-- AI Quick Log removed, spec section 3: the product must work with no AI API key. -->
      </div>
    </div>
    <div class="stack">
      <div class="panel"><h3>Start again</h3>${favs.length ? `<div class="stack" style="gap:6px">${favs.map(e => `<button class="btn pick" data-act="quickstart" data-c="${e.clientId}" data-t="${e.typeId}" ${run?'disabled':''}><span>${esc(typeName(e.typeId))}</span><span class="muted">${esc(clientName(e.clientId))}</span></button>`).join('')}</div>` : `<div class="muted">Your most used client and task pairs show here.</div>`}</div>
      <div class="panel"><h3>Recent</h3>${recent.length ? `<table><tbody>${recent.map(e => entryRow(e, {compact:true, date:true})).join('')}</tbody></table>` : `<div class="muted">Entries you log in LS Command appear here.</div>`}</div>
    </div>
  </div>`;
};
function entryRow(e, o={}){
  const cls = S.clients[e.clientId];
  return `<tr data-act="edit" data-id="${e.id}" style="cursor:pointer">
    ${o.date ? `<td class="num muted">${dateLabel(e.date)}</td>` : ''}
    <td class="num muted">${e.start ? timeKey(e.start) : '–'}</td>
    <td class="wrap"><b>${esc(typeName(e.typeId))}</b>${e.units ? ` <span class="muted">× ${e.units}</span>` : ''}<br><span class="muted">${esc(cls?.name || 'Unassigned')}${e.note ? ' · ' + esc(e.note.slice(0,80)) : ''}</span></td>
    <td class="r num">${hm(e.minutes)}</td><td>${statusChip(e.status)}</td></tr>`;
}

/* ================================================================ TIMESHEET */
VIEWS.entries = () => {
  const f = UI.tf ||= {month:today().slice(0,7), person:S.personId, status:'all', client:'all', q:''};
  const months = [...new Set([today().slice(0,7), ...Object.keys(S.entryDocs)])].sort().reverse();
  let list = allEntries().filter(e => monthOf(e.date) === f.month && (f.person==='all' || e.personId===f.person) && (f.status==='all' || e.status===f.status || (f.status==='review' && e.needsReview)) && (f.client==='all' || e.clientId===f.client));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(e => (typeName(e.typeId)+' '+clientName(e.clientId)+' '+(e.note||'')).toLowerCase().includes(q)); }
  list.sort((a,b) => (b.date.localeCompare(a.date)) || (b.start - a.start));
  const myDrafts = list.filter(e => e.personId === S.personId && e.status === 'draft' && e.clientId && e.typeId);
  const toApprove = list.filter(e => e.personId !== S.personId && e.status === 'submitted');
  const locked = isLocked(f.month);
  const byDay = groupBy(list, e => e.date);
  return `<div class="head"><div><h1>Timesheet</h1><p>Every session, who did it, for which client and task. Drafts stay private until you submit them; ${S.settings.approvalMode==='self' ? 'submitting approves them.' : 'your partner approves submitted time before it counts toward payouts.'}</p></div>
    <div class="row">${myDrafts.length ? `<button class="btn pri" data-act="submit-all" ${locked?'disabled':''}>Submit my ${myDrafts.length} drafts</button>` : ''}${toApprove.length && isPartner() ? `<button class="btn pri" data-act="approve-all" ${locked?'disabled':''}>Approve ${toApprove.length} from ${esc(person(toApprove[0].personId).name)}</button>` : ''}<button class="btn" data-act="log">Log time</button></div></div>
  ${locked ? `<div class="note">${monthLabel(f.month)} is locked for payouts. Entries are read-only.</div>` : ''}
  <div class="filters">
    <select class="in" id="tf-month" style="width:auto">${months.map(m => `<option value="${m}" ${m===f.month?'selected':''}>${monthLabel(m)}</option>`).join('')}</select>
    <select class="in" id="tf-person" style="width:auto"><option value="all">Everyone</option>${personOptions(f.person, true)}</select>
    <select class="in" id="tf-status" style="width:auto">${[['all','Any status'],['draft','Draft'],['submitted','Submitted'],['approved','Approved'],['rejected','Rejected'],['review','Needs review']].map(([v,l]) => `<option value="${v}" ${v===f.status?'selected':''}>${l}</option>`).join('')}</select>
    <select class="in" id="tf-client" style="width:auto"><option value="all">All clients</option>${clientOptions(f.client, false)}</select>
    <input class="in" id="tf-q" placeholder="Search notes" value="${esc(f.q)}" style="width:180px">
    <span class="muted">${list.length} entries · ${hrs(sum(list, e=>e.minutes))} h</span>
  </div>
  ${list.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Person</th><th>Time</th><th>Task</th><th>Client</th><th class="r">Hours</th><th class="r">Units</th><th>Status</th><th></th></tr></thead><tbody>
  ${Object.entries(byDay).map(([d, es]) => `<tr class="sub"><td colspan="5">${dateLong(d)}</td><td class="r">${hrs(sum(es,e=>e.minutes))}</td><td colspan="3"></td></tr>` + es.map(e => `<tr>
    <td class="num muted">${dateLabel(e.date)}</td><td>${esc(person(e.personId).name)}${e.joint?' <span class="chip acc" title="Joint session">joint</span>':''}</td>
    <td class="num muted">${e.start?timeKey(e.start):'–'}–${e.end?timeKey(e.end):'–'}</td>
    <td class="wrap"><b>${esc(typeName(e.typeId))}</b> <span class="code">${esc(e.typeId||'')}</span>${(e.allocations||[]).length?` <span class="chip">+${e.allocations.length} split</span>`:''}<br><span class="muted">${esc((e.note||'').slice(0,110))}</span>${e.needsReview?`<br><span class="chip warn">Check mapping</span>`:''}</td>
    <td>${esc(clientName(e.clientId))}</td><td class="r num">${hrs(e.minutes)}</td><td class="r num">${e.units ?? ''}</td>
    <td>${statusChip(e.status)}${e.source==='import'?' <span class="chip">imported</span>':''}</td>
    <td style="white-space:nowrap">${entryActions(e, locked)}</td></tr>`).join('')).join('')}
  </tbody></table></div>` : `<div class="panel empty">No entries match. Start a timer or log time to add one.</div>`}`;
};
function entryActions(e, locked){
  if (locked) return '';
  const mine = e.personId === S.personId; const b = [];
  b.push(`<button class="btn sm ghost" data-act="edit" data-id="${e.id}">Edit</button>`);
  if (mine && e.status === 'draft') b.push(`<button class="btn sm" data-act="status" data-s="submitted" data-id="${e.id}">Submit</button>`);
  if (!mine && e.status === 'submitted' && isPartner()) b.push(`<button class="btn sm pri" data-act="status" data-s="approved" data-id="${e.id}">Approve</button><button class="btn sm" data-act="reject" data-id="${e.id}">Reject</button>`);
  return b.join('');
}

/* ================================================================ REVIEW */
/* Review queue removed, spec section 25. The useful checks it performed now
 * surface inside Time Log for admins, and reviewItems() still feeds the
 * 'to check' badge there. No route, no nav item, no dead buttons. */

function goalStats(){
  const st = S.settings, y = String(st.goalYear || today().slice(0,4)), t = today();
  const from = y+'-01-01', end = y+'-12-31';
  const L = ledgerItems().filter(l => l.poolEligible !== false);
  const paid = r2(sum(L, l => paidIn(l, from, end)));
  const ar = r2(sum(L, l => outstanding(l)));
  const contracted = r2(sum(contractItems(), c => contractFuture(c, end).amount));
  const yearDays = daysBetween(from, end) + 1, elapsed = Math.min(yearDays, daysBetween(from, t) + 1);
  const goal = +st.annualGoal || 0, remaining = Math.max(0, goal - paid), daysLeft = Math.max(1, yearDays - elapsed);
  return {y, from, end, paid, ar, contracted, projected: r2(paid+ar+contracted), goal, pctYear: elapsed/yearDays, pctGoal: goal ? paid/goal : 0, pctProjected: goal ? (paid+ar+contracted)/goal : 0,
    needDay: remaining/daysLeft, needWeek: remaining/(daysLeft/7), needMonth: remaining/(daysLeft/30.44), paceGap: paid - goal*elapsed/yearDays, daysLeft};
}
VIEWS.company = () => {
  const [from, to, label] = rangeDates(); const G = goalStats();
  const rows = filteredRows();
  const L = ledgerItems();
  const paidR = r2(sum(L.filter(l => l.poolEligible !== false), l => paidIn(l, from, to)));
  const other = r2(sum(L.filter(l => l.poolEligible === false), l => paidIn(l, from, to)));
  const labor = sum(rows, r => r.minutes), billable = sum(rows.filter(r => r.billable), r => r.minutes);
  const exp = expensesIn(from, to), expT = r2(sum(exp, x=>x.amount));
  const months = monthsIn(from, to);
  const pays = months.map(payoutFor); const pool = r2(sum(pays, p => p.pool)), contrib = r2(sum(pays, p => p.contribution));
  const firstLog = laborRows().reduce((m, r) => !m || r.date < m ? r.date : m, null) || from;
  const tFrom = firstLog > from ? firstLog : from; const clipped = tFrom > from;
  const paidT = r2(sum(L.filter(l => l.poolEligible !== false), l => paidIn(l, tFrom, to)));
  const weeks = Math.max(1, (daysBetween(tFrom, to)+1)/7);
  const cap = sum(partners(), id => (+S.people[id].weeklyCapacity||0)) * weeks;
  const active = new Set(contractItems().filter(isActiveContract).map(c => c.clientId));
  L.filter(l => paidIn(l, addDays(today(),-90), today())).forEach(l => l.clientId && active.add(l.clientId));
  const byClientRev = groupBy(L.filter(l => l.clientId && paidIn(l, from, to)), l => l.clientId);
  const topC = Object.entries(byClientRev).map(([c, ls]) => [c, sum(ls, l => paidIn(l, from, to))]).sort((a,b)=>b[1]-a[1])[0];
  const band = (k, v, s='') => `<div><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
  return `<div class="head"><div><h1>Company</h1><p>Actuals, receivables, contracts and forecasts are always labeled separately. Revenue figures use cash collected unless a label says otherwise.</p></div></div>
  ${filterBar()}${noChartLib()}
  <div class="band-title"><h2>${esc(G.y)} goal</h2><span class="muted">${money(G.goal)} target · ${pct(G.pctYear)} of the year gone</span></div>
  <div class="band b4">
    ${band('Paid (actual)', money(G.paid), `${pct(G.pctGoal)} of goal`)}
    ${band('Accounts receivable', money(G.ar), 'invoiced, not yet paid')}
    ${band('Contracted, not yet billed', money(G.contracted), `active retainers through Dec 31`)}
    ${band('Paid + A/R + contracted', money(G.projected), `${pct(G.pctProjected)} of goal · no churn assumed`)}
    ${band('Monthly recurring', money(mrr()), 'active retainers today')}
    ${band('Needed from here', money(G.needMonth)+'<small>/mo</small>', `${money(G.needWeek)}/wk · ${money(G.needDay)}/day for ${G.daysLeft} days`)}
    ${band('Pace vs straight line', (G.paceGap>=0?'+':'')+money(G.paceGap), G.paceGap>=0?'ahead of an even pace':'behind an even pace')}
    ${(() => { const RR = runRate(); return band('12-month pace', money(RR.total), `zero churn · ${money(RR.monthly)}/mo · <a href="#revenue" data-go="revenue">breakdown</a>`); })()}
  </div>
  <div class="panel" style="margin-top:14px"><h3>Revenue burn-up <span class="muted">cumulative ${G.y}, against an even pace to ${money(G.goal)}</span></h3><div class="chart tall" data-chart="burnup"></div></div>
  <div class="band-title"><h2>${esc(label)}</h2><span class="muted">${dateLabel(from)} to ${dateLabel(to)}${F().person!=='all'?' · '+esc(person(F().person).name):''}${F().client!=='all'?' · '+esc(clientName(F().client)):''}</span></div>
  <div class="band b3">
    ${band('Paid revenue', money(paidR), other ? `plus ${money(other)} other income` : 'cash collected')}
    ${band('Labor hours', hrs(labor), `${hrs(billable)} billable (${pct(labor?billable/labor:0)})`)}
    ${band('Revenue per labor hour', labor ? money(paidT/(labor/60)) : '–', clipped ? `paid since tracking began ${dateLabel(tFrom)} ÷ hours` : 'paid revenue ÷ all logged hours')}
    ${band('Labor pool', money(pool), `${pct(S.settings.poolPct)} of ${BASIS_LABEL[S.settings.revenueBasis].toLowerCase()}`)}
    ${band('Operating expenses', money(expT), `${money(sum(exp.filter(x=>x.allocation!=='client'),x=>x.amount))} overhead`)}
    ${band('Contribution margin', money(contrib), paidR ? pct(contrib/paidR)+' of eligible revenue' : '')}
    ${band('Utilization', cap ? pct(sum(rows.filter(r=>partners().includes(r.personId)),r=>r.minutes)/60/cap) : '–', `logged ÷ ${Math.round(cap)} h partner capacity${clipped ? ' since '+dateLabel(tFrom) : ''}`)}
    ${band('Client concentration', topC && paidR ? pct(topC[1]/paidR) : '–', topC ? 'from '+esc(clientName(topC[0])) : '')}
    ${band('Active clients', active.size, 'retainer or paid in 90 days')}
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="panel"><h3>Where the money went <span class="muted">${esc(label)}</span></h3><div class="chart" data-chart="waterfall"></div></div>
    <div class="panel"><h3>Hours by client <span class="muted">${esc(label)}</span></h3><div class="chart" data-chart="clientHours"></div></div>
  </div>
  <div class="panel" style="margin-top:14px"><h3>Work mix by week <span class="muted">labor hours by service family</span></h3><div class="chart" data-chart="mix"></div></div>
  <div class="panel" style="margin-top:14px"><h3>Daily labor hours <span class="muted">all logged time, ${G.y}</span></h3><div class="chart short" data-chart="cal"></div></div>`;
};
VIEWS.company.after = () => mountCharts();
function monthsIn(from, to){ const out = []; let m = from.slice(0,7); while (m <= to.slice(0,7)){ out.push(m); m = addMonths(m,1); } return out; }

CHARTS.burnup = () => {
  const G = goalStats(), b = baseChart(); const t = today();
  const L = ledgerItems().filter(l => l.poolEligible !== false);
  const days = []; for (let d = G.from; d <= G.end; d = addDays(d,1)) days.push(d);
  const paidBy = {}, arBy = {}; L.forEach(l => { const p = paidIn(l, G.from, G.end); if (p) paidBy[l.paidDate] = (paidBy[l.paidDate]||0)+p; const o = outstanding(l); if (o && l.invoiceDate) arBy[l.invoiceDate > t ? t : l.invoiceDate] = (arBy[l.invoiceDate > t ? t : l.invoiceDate]||0)+o; });
  const fut = {}; contractItems().forEach(c => contractFuture(c, G.end).dates.forEach(d => fut[d] = (fut[d]||0) + (+c.amount||0)));
  let cp = 0, ca = 0, cc = 0; const paid = [], pa = [], proj = [], target = [];
  days.forEach((d,i) => {
    cp += paidBy[d]||0; ca += (paidBy[d]||0) + (arBy[d]||0);
    paid.push(d <= t ? r2(cp) : null); pa.push(d <= t ? r2(ca) : null);
    if (d >= t){ cc = (d === t ? ca : cc) + (d === t ? 0 : fut[d]||0); proj.push(r2(cc)); } else proj.push(null);
    target.push(r2(G.goal * (i+1)/days.length));
  });
  const ax = b._ax;
  return {...b, legend:{top:0, left:0, textStyle:{color:cssv('--ink-2')}, icon:'roundRect', itemWidth:12, itemHeight:4},
    grid:{...b.grid, top:34},
    tooltip:{...b.tooltip, valueFormatter:v => v==null?'–':money(v)},
    xAxis:{type:'category', data:days, ...ax, axisLabel:{...ax.axisLabel, formatter:v => v.endsWith('-01') ? monthShort(v.slice(0,7)) : '', interval:0}, splitLine:{show:false}},
    yAxis:{type:'value', ...ax, axisLabel:{...ax.axisLabel, formatter:v => '$'+(v/1000)+'k'}},
    series:[
      {name:'Even pace to goal', type:'line', data:target, symbol:'none', lineStyle:{width:1.5, type:'dashed', color:cssv('--ink-3')}, itemStyle:{color:cssv('--ink-3')}},
      {name:'Paid + A/R', type:'line', data:pa, symbol:'none', lineStyle:{width:2, color:cssv('--s4')}, itemStyle:{color:cssv('--s4')}},
      {name:'Paid (actual)', type:'line', data:paid, symbol:'none', lineStyle:{width:2.5, color:cssv('--s1')}, itemStyle:{color:cssv('--s1')}, areaStyle:{color:cssv('--s1'), opacity:.08}},
      {name:'Contracted projection', type:'line', data:proj, symbol:'none', lineStyle:{width:2, type:'dotted', color:cssv('--s3')}, itemStyle:{color:cssv('--s3')},
       markLine:{silent:true, symbol:'none', data:[{xAxis:t}], label:{formatter:'Today', color:cssv('--ink-3')}, lineStyle:{color:cssv('--line-2'), type:'solid'}}},
    ]};
};
CHARTS.waterfall = () => {
  const [from, to] = rangeDates(); const b = baseChart();
  const pays = monthsIn(from, to).map(payoutFor);
  const gross = r2(sum(pays, p => p.rev.eligible)), pool = r2(sum(pays, p => p.pool)), direct = r2(sum(pays, p => p.direct)), over = r2(sum(pays, p => p.overhead));
  const kept = r2(gross - pool - direct - over);
  const steps = [['Eligible revenue', gross, 0, 'up'], ['Labor pool', pool, gross - pool, 'down'], ['Direct expenses', direct, gross-pool-direct, 'down'], ['Overhead', over, gross-pool-direct-over, 'down'], ['Retained margin', kept, 0, kept>=0?'total':'neg']];
  const col = {up:cssv('--s1'), down:cssv('--s2'), total:cssv('--good'), neg:cssv('--crit')};
  return {...b, tooltip:{...b.tooltip, trigger:'item', formatter:p => p.seriesIndex ? `${p.name}<br><b>${money2(steps[p.dataIndex][1])}</b>` : ''},
    xAxis:{type:'category', data:steps.map(s=>s[0]), ...b._ax, axisLabel:{...b._ax.axisLabel, interval:0, fontSize:11}},
    yAxis:{type:'value', ...b._ax, axisLabel:{...b._ax.axisLabel, formatter:v => money(v)}},
    series:[{type:'bar', stack:'w', data:steps.map(s => Math.min(s[2], s[2]+ (s[3]==='neg'?s[1]:0))), itemStyle:{color:'transparent'}, silent:true},
      {type:'bar', stack:'w', barMaxWidth:56, data:steps.map(s => ({value:Math.abs(s[1]), itemStyle:{color:col[s[3]], borderRadius:[4,4,0,0]}})), label:{show:true, position:'top', color:cssv('--ink-2'), formatter:p => money(steps[p.dataIndex][1])}}]};
};
CHARTS.clientHours = () => {
  const b = baseChart(); const rows = filteredRows();
  const by = Object.entries(groupBy(rows, r => r.clientId||'none')).map(([c, rs]) => [c, sum(rs, r=>r.minutes)/60, sum(rs.filter(r=>r.billable), r=>r.minutes)/60]).sort((a,b)=>a[1]-b[1]).slice(-10);
  return {...b, tooltip:{...b.tooltip, trigger:'axis', axisPointer:{type:'shadow'}, valueFormatter:v => v.toFixed(1)+' h'},
    legend:{top:0, left:0, textStyle:{color:cssv('--ink-2')}, itemWidth:10, itemHeight:10}, grid:{...b.grid, top:30},
    xAxis:{type:'value', ...b._ax}, yAxis:{type:'category', data:by.map(x => clientName(x[0]==='none'?null:x[0])), ...b._ax, splitLine:{show:false}},
    series:[{name:'Billable', type:'bar', stack:'h', data:by.map(x=>r2(x[2])), itemStyle:{color:cssv('--s1')}, barMaxWidth:18},
            {name:'Non-billable', type:'bar', stack:'h', data:by.map(x=>r2(x[1]-x[2])), itemStyle:{color:cssv('--s4'), borderRadius:[0,4,4,0]}, barMaxWidth:18}]};
};
CHARTS.mix = () => {
  const b = baseChart(); const rows = filteredRows();
  const weeks = [...new Set(rows.map(r => weekStart(r.date)))].sort();
  const famTot = Object.entries(groupBy(rows, r => r.family)).map(([f, rs]) => [f, sum(rs, r=>r.minutes)]).sort((a,b)=>b[1]-a[1]);
  const top = famTot.slice(0,6).map(x=>x[0]); const keys = [...top, ...(famTot.length>6?['other']:[])];
  const series = keys.map((k,i) => ({name: k==='other' ? 'Other' : famName(k), type:'line', stack:'m', smooth:false, symbol:'none', lineStyle:{width:0}, areaStyle:{opacity:.9, color:k==='other'?cssv('--div-mid'):seriesColor(i)}, itemStyle:{color:k==='other'?cssv('--div-mid'):seriesColor(i)},
    data: weeks.map(w => r2(sum(rows.filter(r => weekStart(r.date)===w && (k==='other' ? !top.includes(r.family) : r.family===k)), r=>r.minutes)/60))}));
  return {...b, legend:{top:0, left:0, textStyle:{color:cssv('--ink-2')}, itemWidth:10, itemHeight:10}, grid:{...b.grid, top:40},
    tooltip:{...b.tooltip, valueFormatter:v => v.toFixed(1)+' h'},
    xAxis:{type:'category', boundaryGap:false, data:weeks.map(w => 'Wk of '+dateLabel(w)), ...b._ax, splitLine:{show:false}}, yAxis:{type:'value', ...b._ax}, series};
};
CHARTS.cal = () => {
  const b = baseChart(); const y = String(S.settings.goalYear || today().slice(0,4));
  const f = F(); const rows = laborRows().filter(r => r.date.startsWith(y) && (f.person==='all' || r.personId===f.person) && (f.client==='all'||r.clientId===f.client));
  const by = groupBy(rows, r => r.date); const data = Object.entries(by).map(([d, rs]) => [d, r2(sum(rs, r=>r.minutes)/60)]);
  const first = rows.length ? rows.map(r=>r.date).sort()[0].slice(0,7)+'-01' : y+'-01-01';
  return {...b, tooltip:{...b.tooltip, trigger:'item', formatter:p => `${dateLong(p.value[0])}<br><b>${p.value[1]} h</b>`},
    visualMap:{min:0, max:Math.max(4, ...data.map(d=>d[1])), show:false, inRange:{color:[cssv('--heat-0'), cssv('--heat-1'), cssv('--heat-2'), cssv('--heat-3')]}},
    calendar:{range:[first, y+'-12-31'], cellSize:['auto', 15], left:36, right:10, top:22, itemStyle:{borderColor:cssv('--panel'), borderWidth:2, color:cssv('--panel-2')}, splitLine:{show:false},
      yearLabel:{show:false}, dayLabel:{color:cssv('--ink-3'), fontSize:10, nameMap:['S','M','T','W','T','F','S']}, monthLabel:{color:cssv('--ink-3'), fontSize:11}},
    series:[{type:'heatmap', coordinateSystem:'calendar', data}]};
};

/* ================================================================ MY DASHBOARD */
VIEWS.me = () => {
  const who = UI.mePerson && isPartner() ? UI.mePerson : S.personId;
  const t = today(), m = t.slice(0,7), y = t.slice(0,4);
  const R = laborRows().filter(r => r.personId === who);
  const span = (from, to) => sum(R.filter(r => inRange(r.date, from, to)), r => r.minutes);
  const P = payoutFor(UI.meMonth || m); const mine = P.people.find(p => p.id === who) || {approved:0, pending:0, share:0, payout:0, perHour:0};
  const [from, to, label] = rangeDates(); const rows = R.filter(r => inRange(r.date, from, to));
  const E = allEntries().filter(e => e.personId === who && inRange(e.date, from, to) && e.minutes > 0);
  const days = new Set(E.map(e => e.date)).size;
  const bill = sum(rows.filter(r=>r.billable), r=>r.minutes), tot = sum(rows, r=>r.minutes);
  const units = sum(rows, r => r.units||0);
  const unapproved = allEntries().filter(e => e.personId === who && e.status !== 'approved').length;
  const band = (k, v, s='') => `<div><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
  // revenue associated with this person's work: client paid revenue in range × person's share of that client's hours
  const allR = laborRows().filter(r => inRange(r.date, from, to));
  let assoc = 0; for (const [c, rs] of Object.entries(groupBy(rows, r=>r.clientId))){ if (!c || c==='internal' || c==='prospects') continue; const tot = sum(allR.filter(r=>r.clientId===c), r=>r.minutes); const rev = sum(ledgerItems().filter(l => l.clientId===c), l => paidIn(l, from, to)); if (tot) assoc += rev * sum(rs, r=>r.minutes)/tot; }
  return `<div class="head"><div><h1>${who===S.personId ? 'My dashboard' : esc(person(who).name)+'\'s dashboard'}</h1><p>Your hours, payout estimate and work mix. Speed figures sit next to complexity, revisions and sample size; they're for planning, not scoring.</p></div>
    ${isPartner() ? `<select class="in" id="me-person" style="width:auto">${partners().map(id => `<option value="${id}" ${id===who?'selected':''}>${esc(person(id).name)}</option>`).join('')}</select>` : ''}</div>
  <div class="band b4">
    ${band('Today', hm(span(t,t)))}${band('This week', hrs(span(weekStart(t), t))+' h')}${band('This month', hrs(span(m+'-01', t))+' h')}${band(y, hrs(span(y+'-01-01', t))+' h')}
  </div>
  <div class="band-title"><h2>Payout estimate</h2>
    <select class="in" id="me-month" style="width:auto">${monthsIn(y+'-01-01', t).reverse().map(x => `<option value="${x}" ${x===(UI.meMonth||m)?'selected':''}>${monthLabel(x)}</option>`).join('')}</select>
    ${P.reconstructed ? '<span class="chip">reconstructed from imported log</span>' : ''}${P.locked ? '<span class="chip good">locked</span>' : '<span class="chip warn">estimate, period open</span>'}</div>
  <div class="band b4">
    ${band('Approved payout hours', hrs(mine.approved), mine.pending ? `${hrs(mine.pending)} h not yet approved` : 'all approved')}
    ${band('Share of labor pool', pct(mine.share,1), `pool ${money(P.pool)}`)}
    ${band('Estimated payout', money2(mine.payout), BASIS_LABEL[P.basis])}
    ${band('Effective per hour', mine.approved ? money2(mine.perHour) : '–', 'payout ÷ approved hours')}
  </div>
  <div class="band-title"><h2>${esc(label)}</h2>${filterBar({person:false, client:true, family:true}).replace('<div class="filters">','<div class="filters" style="margin:0">')}</div>
  <div class="band b4">
    ${band('Billable', hrs(bill)+' h', pct(tot?bill/tot:0)+' of your time')}${band('Non-billable', hrs(tot-bill)+' h')}
    ${band('Average session', E.length ? hm(sum(E,e=>e.minutes)/E.length) : '–', `${E.length} sessions`)}
    ${band('Task switches per day', days ? (E.length/days).toFixed(1) : '–', `across ${days} working days`)}
    ${band('Deliverables logged', units || '–')}
    ${band('Revenue tied to your work', money(assoc), 'client revenue × your share of its hours')}
    ${band('Not yet approved', unapproved, unapproved ? '<a href="#entries" data-go="entries">open timesheet</a>' : '')}${band('Hours in range', hrs(tot)+' h', `${E.length} entries`)}
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="panel"><h3>Client mix</h3><div class="chart short" data-chart="meClients"></div></div>
    <div class="panel"><h3>Service mix</h3><div class="chart short" data-chart="meFamilies"></div></div>
  </div>
  <div class="panel" style="margin-top:14px"><h3>When you work <span class="muted">hours started, by weekday and hour (${esc(TZ())})</span></h3><div class="chart short" data-chart="meHeat"></div></div>
  <div class="panel" style="margin-top:14px"><h3>Your time vs benchmarks <span class="muted">entries with a deliverable count</span></h3>${myBench(who, from, to)}</div>`;
};
VIEWS.me.after = () => mountCharts();
function myBench(who, from, to){
  const B = benchmarks();
  const E = allEntries().filter(e => e.personId===who && inRange(e.date, from, to) && e.units > 0 && e.typeId).slice(0, 40);
  if (!E.length) return `<div class="muted">Add a deliverable count when you stop a timer (6 emails, 3 reels) and your time per unit will show here next to the team's median.</div>`;
  return `<div class="tw"><table><thead><tr><th>Date</th><th>Task</th><th class="r">Units</th><th class="r">Min / unit</th><th class="r">Team median</th><th class="r">Planning std</th><th>Complexity</th><th>Revision</th><th>AI</th><th class="r">Sample</th></tr></thead><tbody>
  ${E.map(e => { const b = B[e.typeId]; const per = e.minutes/e.units; const plan = (ttype(e.typeId)?.planHours||0)*60; return `<tr><td class="num">${dateLabel(e.date)}</td><td>${esc(typeName(e.typeId))}</td><td class="r num">${e.units}</td><td class="r num"><b>${per.toFixed(0)}</b></td><td class="r num">${b?.median!=null?b.median.toFixed(0):'–'}</td><td class="r num">${plan?plan.toFixed(0):'–'}</td><td>${esc(e.complexity||'–')}</td><td>${esc(e.revision??'–')}</td><td>${e.ai&&e.ai!=='none'?'Yes':'–'}</td><td class="r num">${b?`${b.n} <span class="chip ${b.confidence==='Preliminary'?'warn':''}">${b.confidence}</span>`:'–'}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function meRows(){ const who = UI.mePerson && isPartner() ? UI.mePerson : S.personId; const [from,to] = rangeDates(); const f = F(); return laborRows().filter(r => r.personId===who && inRange(r.date, from, to) && (f.client==='all'||r.clientId===f.client) && (f.family==='all'||r.family===f.family)); }
function barList(pairs, colorFn){
  const b = baseChart(); pairs = pairs.sort((a,b)=>a[1]-b[1]).slice(-8);
  return {...b, tooltip:{...b.tooltip, trigger:'item', formatter:p => `${esc(p.name)}<br><b>${p.value.toFixed(1)} h</b>`},
    xAxis:{type:'value', ...b._ax}, yAxis:{type:'category', data:pairs.map(p=>p[0]), ...b._ax, splitLine:{show:false}},
    series:[{type:'bar', data:pairs.map((p,i)=>({value:r2(p[1]), itemStyle:{color:colorFn?colorFn(p):cssv('--s1'), borderRadius:[0,4,4,0]}})), barMaxWidth:16, label:{show:true, position:'right', color:cssv('--ink-2'), formatter:p=>p.value.toFixed(1)}}]};
}
CHARTS.meClients = () => barList(Object.entries(groupBy(meRows(), r=>r.clientId)).map(([c,rs]) => [clientName(c==='null'?null:c), sum(rs,r=>r.minutes)/60]));
CHARTS.meFamilies = () => barList(Object.entries(groupBy(meRows(), r=>r.family)).map(([f,rs]) => [famName(f), sum(rs,r=>r.minutes)/60, f]), p => seriesColor(FAMILY_ORDER().indexOf(p[2])));
CHARTS.meHeat = () => {
  const b = baseChart(); const who = UI.mePerson && isPartner() ? UI.mePerson : S.personId; const [from,to] = rangeDates();
  const E = allEntries().filter(e => e.personId===who && e.start && inRange(e.date, from, to));
  const grid = {}; E.forEach(e => { const o = zparts(e.start); const d = ({Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6})[o.weekday]; const k = d+'|'+(+o.hour); grid[k] = (grid[k]||0) + e.minutes/60; });
  const data = Object.entries(grid).map(([k,v]) => { const [d,h] = k.split('|').map(Number); return [h, d, r2(v)]; });
  return {...b, tooltip:{...b.tooltip, trigger:'item', formatter:p => `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][p.value[1]]} ${p.value[0]}:00<br><b>${p.value[2]} h</b> started`},
    grid:{...b.grid, top:8}, xAxis:{type:'category', data:[...Array(24).keys()].map(h => h===0?'12a':h<12?h+'a':h===12?'12p':(h-12)+'p'), ...b._ax, splitLine:{show:false}},
    yAxis:{type:'category', data:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], inverse:true, ...b._ax, splitLine:{show:false}},
    visualMap:{min:0, max:Math.max(1,...data.map(d=>d[2])), show:false, inRange:{color:[cssv('--heat-0'), cssv('--heat-1'), cssv('--heat-2'), cssv('--heat-3')]}},
    series:[{type:'heatmap', data, itemStyle:{borderColor:cssv('--panel'), borderWidth:2, borderRadius:3}}]};
};
