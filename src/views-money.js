/* ================================================================ CLIENTS */
function clientPL(from, to){
  const rows = laborRows().filter(r => inRange(r.date, from, to));
  const pays = monthsIn(from, to).map(payoutFor);
  const pool = sum(pays, p => p.pool), poolMin = sum(pays, p => p.totalMin);
  const rate = poolMin ? pool / (poolMin/60) : 0;            // effective payout per labor hour in this range
  const exp = expensesIn(from, to).filter(x => x.allocation === 'client');
  const ids = new Set([...Object.keys(S.clients), ...rows.map(r=>r.clientId).filter(Boolean)]);
  const out = [];
  for (const id of ids){
    const c = S.clients[id]; if (c?.kind === 'internal') continue;
    const L = ledgerItems().filter(l => l.clientId === id);
    const paid = r2(sum(L, l => paidIn(l, from, to)));
    const recog = r2(sum(L.filter(l => l.recognitionDate && inRange(l.recognitionDate, from, to) && !['draft','written_off','contracted'].includes(l.status)), l => +l.amount||0));
    const ar = r2(sum(L, outstanding));
    const fut = r2(sum(contractItems().filter(k => k.clientId === id), k => contractFuture(k).amount));
    const direct = r2(sum(exp.filter(x => x.clientId === id), x => x.amount));
    const cr = rows.filter(r => r.clientId === id); const min = sum(cr, r => r.minutes);
    const laborCost = r2(min/60 * rate);
    const contrib = r2(paid - laborCost - direct);
    const units = sum(cr, r => r.units||0);
    const con = contractItems().find(k => k.clientId === id && isActiveContract(k));
    const monthMin = sum(laborRows().filter(r => r.clientId===id && r.date.startsWith(today().slice(0,7))), r=>r.minutes);
    if (!paid && !min && !ar && !fut) continue;
    out.push({id, name:clientName(id), paid, recog, ar, fut, direct, min, laborCost, contrib, margin: paid ? contrib/paid : null, perHour: min ? paid/(min/60) : null, units,
      planned: con?.plannedMonthlyHours || null, monthMin, fams: groupBy(cr, r => r.family)});
  }
  return {rows: out.sort((a,b) => b.paid - a.paid || b.min - a.min), rate};
}
VIEWS.clients = () => {
  const [from, to, label] = rangeDates(); const {rows, rate} = clientPL(from, to);
  const T = k => r2(sum(rows, r => r[k]));
  return `<div class="head"><div><h1>Clients</h1><p>Client P&L. Labor cost uses the period's effective payout per hour (${money2(rate)}/h in this range), so contribution is what's left after paying the people who did the work and any direct costs.</p></div>
    <button class="btn" data-act="client-new">Add client</button></div>
  ${filterBar({person:false, client:false, family:false})}${noChartLib()}
  <div class="panel"><h3>Portfolio <span class="muted">labor hours vs paid revenue · bubble size is contribution dollars · color is contribution margin</span></h3><div class="chart tall" data-chart="quadrant"></div>
    <div class="legend"><span><i style="background:var(--div-neg)"></i>negative margin</span><span><i style="background:var(--div-mid)"></i>break-even</span><span><i style="background:var(--div-pos)"></i>healthy margin</span><span class="muted">Top left: efficient. Top right: high revenue, labor-heavy. Bottom right: underpriced.</span></div></div>
  <div class="tw" style="margin-top:14px"><table><thead><tr><th>Client</th><th class="r">Paid</th><th class="r">Recognized</th><th class="r">A/R</th><th class="r">Contracted future</th><th class="r">Hours</th><th class="r">Rev / hr</th><th class="r">Labor cost</th><th class="r">Direct exp.</th><th class="r">Contribution</th><th class="r">Margin</th><th class="r">Units</th><th>Retainer use (this month)</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="r num">${money(r.paid)}</td><td class="r num">${money(r.recog)}</td><td class="r num">${r.ar?money(r.ar):'–'}</td><td class="r num">${r.fut?money(r.fut):'–'}</td>
    <td class="r num">${hrs(r.min)}</td><td class="r num">${r.perHour!=null?money(r.perHour):'–'}</td><td class="r num">${money(r.laborCost)}</td><td class="r num">${r.direct?money(r.direct):'–'}</td>
    <td class="r num"><b>${money(r.contrib)}</b></td><td class="r num">${r.margin!=null?`<span class="chip ${r.margin<0?'crit':r.margin<.3?'warn':'good'}">${pct(r.margin)}</span>`:'–'}</td><td class="r num">${r.units||'–'}</td>
    <td>${r.planned ? `<div class="num" style="font-size:12px">${hrs(r.monthMin)} of ${r.planned} h</div><div class="meter"><i style="width:${Math.min(100, r.monthMin/60/r.planned*100)}%; ${r.monthMin/60>r.planned?'background:var(--crit)':''}"></i></div>` : `<span class="muted">${hrs(r.monthMin)} h · no plan set</span>`}</td>
    <td><button class="btn sm ghost" data-act="client-edit" data-id="${r.id}">Edit</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td class="r num">${money(T('paid'))}</td><td class="r num">${money(T('recog'))}</td><td class="r num">${money(T('ar'))}</td><td class="r num">${money(T('fut'))}</td><td class="r num">${hrs(T('min'))}</td><td></td><td class="r num">${money(T('laborCost'))}</td><td class="r num">${money(T('direct'))}</td><td class="r num">${money(T('contrib'))}</td><td colspan="4"></td></tr></tfoot></table></div>
  <div class="panel" style="margin-top:14px"><h3>Hours by service line <span class="muted">${esc(label)}</span></h3>
  <div class="tw"><table><thead><tr><th>Client</th>${FAMILY_ORDER().map(f => `<th class="r">${esc(famName(f).split(' ')[0])}</th>`).join('')}</tr></thead><tbody>
  ${rows.filter(r=>r.min).map(r => `<tr><td>${esc(r.name)}</td>${FAMILY_ORDER().map(f => { const m = sum(r.fams[f]||[], x=>x.minutes); return `<td class="r num ${m?'':'muted'}">${m?hrs(m):'·'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
};
VIEWS.clients.after = () => mountCharts();
CHARTS.quadrant = () => {
  const [from, to] = rangeDates(); const {rows} = clientPL(from, to); const b = baseChart();
  const pts = rows.filter(r => r.min > 0 || r.paid > 0);
  const maxC = Math.max(1, ...pts.map(r => Math.abs(r.contrib)));
  const mh = pts.length ? sum(pts, r=>r.min/60)/pts.length : 0, mr = pts.length ? sum(pts, r=>r.paid)/pts.length : 0;
  return {...b, grid:{...b.grid, top:20, right:30},
    tooltip:{...b.tooltip, trigger:'item', formatter:p => { const r = pts[p.dataIndex]; return `<b>${esc(r.name)}</b><br>Paid ${money(r.paid)} · ${hrs(r.min)} h<br>Contribution ${money(r.contrib)} (${r.margin!=null?pct(r.margin):'–'})`; }},
    xAxis:{type:'value', name:'labor hours', nameLocation:'middle', nameGap:26, nameTextStyle:{color:cssv('--ink-3')}, ...b._ax},
    yAxis:{type:'value', name:'paid revenue', nameTextStyle:{color:cssv('--ink-3')}, ...b._ax, axisLabel:{...b._ax.axisLabel, formatter:v=>money(v)}},
    visualMap:{show:false, dimension:3, min:-.5, max:.5, inRange:{color:[cssv('--div-neg'), cssv('--div-mid'), cssv('--div-pos')]}},
    series:[{type:'scatter', data:pts.map(r => [r2(r.min/60), r.paid, r.contrib, r.margin ?? -0.5]), symbolSize:v => 12 + 40*Math.sqrt(Math.abs(v[2])/maxC),
      itemStyle:{borderColor:cssv('--panel'), borderWidth:2, opacity:.9},
      label:{show:true, position:'right', color:cssv('--ink-2'), fontSize:11, formatter:p => pts[p.dataIndex].name.split(' ')[0]},
      markLine:{silent:true, symbol:'none', lineStyle:{color:cssv('--line-2'), type:'dashed'}, label:{show:false}, data:[{xAxis:r2(mh)},{yAxis:r2(mr)}]}}]};
};

/* ================================================================ TASK TYPES + BENCHMARKS */
VIEWS.tasks = () => {
  const B = benchmarks(); const q = (UI.tq||'').toLowerCase();
  const T = Object.values(S.taxonomy.types).filter(t => !q || (t.code+' '+t.name+' '+t.unit).toLowerCase().includes(q));
  const logged = groupBy(laborRows().filter(r => r.typeId), r => r.typeId);
  const withBox = Object.entries(B).filter(([,b]) => b.n >= 3);
  const f = m => m==null ? '–' : m < 90 ? m.toFixed(0)+'m' : (m/60).toFixed(1)+'h';
  return `<div class="head"><div><h1>Task types</h1><p>The dropdown behind every timer: ${Object.keys(S.taxonomy.types).length} types in ${FAMILY_ORDER().length} service families. Measured figures use approved entries with a deliverable count only. Fewer than 5 samples is labeled preliminary. The planning standard is what pricing uses; set it by hand when history isn't representative.</p></div>
    <div class="row"><input class="in" id="tq" placeholder="Filter" value="${esc(UI.tq||'')}" style="width:180px"><button class="btn pri" data-act="type-new">Add task type</button></div></div>
  ${withBox.length ? `<div class="panel" style="margin-bottom:14px"><h3>Time per unit <span class="muted">median, quartiles and outliers, minutes</span></h3><div class="chart" data-chart="box"></div></div>` : `<div class="note" style="margin-bottom:14px">Distributions appear once a task type has 3 or more approved entries with a deliverable count. The imported log has no counts, so this fills in as you track.</div>`}
  <div class="tw"><table><thead><tr><th>Code</th><th>Task type</th><th>Unit</th><th class="r">Planning std</th><th class="r">Median</th><th class="r">P25–P75</th><th class="r">P90</th><th class="r">Mean ± SD</th><th class="r">AI vs not</th><th class="r">Sample</th><th class="r">Hours logged</th><th>Defaults</th><th></th></tr></thead><tbody>
  ${FAMILY_ORDER().map(fam => { const ts = T.filter(t => t.family===fam).sort((a,b)=>a.order-b.order); if (!ts.length) return '';
    return `<tr class="sub"><td colspan="13">${esc(famName(fam))} <span class="muted" style="font-weight:500">· ${esc(S.taxonomy.families[fam].cls)}</span></td></tr>` + ts.map(t => { const b = B[t.code]; const lg = sum(logged[t.code]||[], r=>r.minutes);
      return `<tr class="${t.active===false?'muted':''}"><td class="code">${esc(t.code)}</td><td><b>${esc(t.name)}</b>${t.active===false?' <span class="chip">inactive</span>':''}</td><td>${esc(t.unit)}</td>
      <td class="r num">${f((+t.planHours||0)*60)} <span class="chip" title="Source of the planning standard">${esc((t.source||'').toLowerCase())}</span></td>
      <td class="r num"><b>${f(b?.median)}</b></td><td class="r num">${b?`${f(b.p25)}–${f(b.p75)}`:'–'}</td><td class="r num">${f(b?.p90)}</td><td class="r num">${b?`${f(b.mean)} ± ${f(b.sd)}`:'–'}</td>
      <td class="r num">${b && b.aiN && b.noAiN ? `${f(b.aiMedian)} / ${f(b.noAiMedian)}` : '–'}</td>
      <td class="r num">${b?`${b.n} <span class="chip ${b.confidence==='Preliminary'?'warn':b.confidence==='High'?'good':''}">${b.confidence}</span>`:'<span class="muted">0</span>'}</td>
      <td class="r num">${lg?hrs(lg):'–'}</td><td>${t.billable?'<span class="chip acc">billable</span>':'<span class="chip">non-billable</span>'}${t.payoutEligible===false?' <span class="chip warn">no payout</span>':''}</td>
      <td><button class="btn sm ghost" data-act="type-edit" data-id="${t.code}">Edit</button></td></tr>`; }).join(''); }).join('')}
  </tbody></table></div>`;
};
VIEWS.tasks.after = () => mountCharts();
CHARTS.box = () => {
  const B = benchmarks(); const b = baseChart();
  const items = Object.entries(B).filter(([,x]) => x.n >= 3).sort((a,b) => b[1].n - a[1].n).slice(0, 14);
  const data = items.map(([,x]) => { const v = x.xs.map(y=>y.perUnit).sort((a,b)=>a-b); const iqr = x.p75-x.p25; const lo = Math.max(v[0], x.p25-1.5*iqr), hi = Math.min(v[v.length-1], x.p75+1.5*iqr); return [lo, x.p25, x.median, x.p75, hi].map(r2); });
  const out = []; items.forEach(([,x],i) => { const [lo,,,,hi] = data[i]; x.xs.forEach(y => { if (y.perUnit < lo || y.perUnit > hi) out.push([i, r2(y.perUnit)]); }); });
  return {...b, tooltip:{...b.tooltip, trigger:'item'},
    xAxis:{type:'category', data:items.map(([c]) => c), ...b._ax, splitLine:{show:false}}, yAxis:{type:'value', ...b._ax, name:'min / unit', nameTextStyle:{color:cssv('--ink-3')}},
    series:[{type:'boxplot', data, itemStyle:{color:cssv('--accent-soft'), borderColor:cssv('--s1'), borderWidth:1.5},
      tooltip:{formatter:p => `<b>${esc(typeName(items[p.dataIndex][0]))}</b><br>n=${items[p.dataIndex][1].n}<br>median ${p.data[3]} min<br>P25–P75 ${p.data[2]}–${p.data[4]}`}},
      {type:'scatter', data:out, symbolSize:8, itemStyle:{color:cssv('--s2')}}]};
};

/* ================================================================ PAYOUTS */
VIEWS.payouts = () => {
  const st = S.settings; const months = [...new Set([...Object.keys(S.entryDocs), today().slice(0,7)])].sort();
  const m = UI.pm ||= today().slice(0,7);
  const P = payoutFor(m);
  const lock = P.locked;
  const ytd = months.filter(x => x.startsWith(today().slice(0,4))).map(payoutFor);
  const drift = lock && (Math.abs(lock.snapshot.pool - P.pool) > .005 || lock.snapshot.people.some(p => Math.abs(p.payout - (P.people.find(q=>q.id===p.id)?.payout||0)) > .005));
  const pending = sum(P.people, p => p.pending);
  return `<div class="head"><div><h1>Payouts</h1><p>${pct(P.pct)} of eligible revenue goes to the labor pool, split by each partner's approved payout-eligible hours in the month. Basis: <b>${esc(BASIS_LABEL[P.basis])}</b>. Expenses come out ${st.expenseTiming==='before'?'<b>before</b>':'<b>after</b>'} the pool. <a href="#settings" data-go="settings">Change rules</a></p></div>
    <select class="in" id="pm" style="width:auto">${months.slice().reverse().map(x => `<option value="${x}" ${x===m?'selected':''}>${monthLabel(x)}</option>`).join('')}</select></div>
  <div class="row" style="margin-bottom:14px">
    ${P.reconstructed ? `<span class="chip long">Reconstructed from the imported log. Compare with what was actually paid.</span>` : ''}
    ${lock ? `<span class="chip good">Locked ${dateLabel(new Date(lock.lockedAt).toISOString().slice(0,10))} by ${esc(person(lock.lockedBy).name)}</span>` : `<span class="chip warn long">Open: numbers move as time and revenue change</span>`}
    ${pending ? `<span class="chip warn long">${hrs(pending)} h in this month not yet approved and not counted</span>` : ''}
  </div>
  ${drift ? `<div class="note crit" style="margin-bottom:14px">Live numbers no longer match the locked snapshot. Something changed after locking; check the audit log.</div>` : ''}
  <div class="grid g-main">
    <div class="panel"><h3>${monthLabel(m)} calculation</h3>
      <div class="kv">
        <span>Eligible revenue <span class="muted">(${esc(BASIS_LABEL[P.basis].toLowerCase())})</span></span><span>${money2(P.rev.eligible)}</span>
        ${P.rev.other ? `<span class="muted">Other income, excluded from the pool</span><span class="muted">${money2(P.rev.other)}</span>` : ''}
        ${st.expenseTiming==='before' ? `<span>Less expenses before the pool</span><span>−${money2(P.expTotal)}</span><span>Pool base</span><span>${money2(P.poolBase)}</span>` : ''}
        <span class="t">Labor pool (${pct(P.pct)})</span><span class="t">${money2(P.pool)}</span>
        <span>Company retained</span><span>${money2(P.retained)}</span>
        <span>Expenses <span class="muted">(${money2(P.overhead)} overhead, ${money2(P.direct)} direct)</span></span><span>−${money2(P.expTotal)}</span>
        <span class="t">Contribution margin</span><span class="t">${money2(P.contribution)}</span>
      </div>
      <div class="tw" style="margin-top:16px"><table><thead><tr><th>Partner</th><th class="r">Approved hours</th><th class="r">Share</th><th class="r">Payout</th><th class="r">Per hour</th></tr></thead><tbody>
      ${P.people.map(p => `<tr><td><b>${esc(person(p.id).name)}</b>${p.pending?`<br><span class="muted">${hrs(p.pending)} h pending</span>`:''}</td><td class="r num">${hrs(p.approved)}</td><td class="r num">${pct(p.share,1)}</td><td class="r num"><b>${money2(p.payout)}</b></td><td class="r num">${p.approved?money2(p.perHour):'–'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="r num">${hrs(P.totalMin)}</td><td class="r num">${P.totalMin?'100.0%':'–'}</td><td class="r num">${money2(sum(P.people,p=>p.payout))}</td><td></td></tr></tfoot></table></div>
      ${P.unallocated ? `<div class="note warn" style="margin-top:10px">No approved hours this month, so ${money2(P.unallocated)} of pool is unallocated.</div>` : ''}
      <div class="row" style="margin-top:14px; justify-content:flex-end">${isPartner() ? (lock ? `<button class="btn" data-act="unlock" data-m="${m}">Unlock period</button>` : `<button class="btn pri" data-act="lock" data-m="${m}">Approve and lock ${monthShort(m)}</button>`) : ''}</div>
    </div>
    <div class="stack">
      <div class="panel"><h3>Revenue lines used <span class="muted">${P.rev.lines.length}</span></h3>
        ${P.rev.custom ? `<div class="note">Manually approved amount set in Settings.</div>` : P.rev.lines.length ? `<table><tbody>${P.rev.lines.map(l => `<tr><td>${esc(l.clientName||clientName(l.clientId))}<br><span class="muted">${esc(l.revenueType)} · ${esc(l.why)}</span></td><td class="r num">${l.poolEligible===false?'<span class="muted">':''}${money2(l.used)}${l.poolEligible===false?'</span>':''}</td></tr>`).join('')}</tbody></table>` : `<div class="muted">No revenue on this basis in ${monthLabel(m)}.</div>`}</div>
      <div class="panel"><h3>Expenses <span class="muted">${P.exp.length}</span></h3>${P.exp.length ? `<table><tbody>${P.exp.map(x => `<tr><td>${esc(x.vendor)}<br><span class="muted">${esc(x.category)}${x.recurring?' · recurring':''}${x.source==='seed'?' · seeded estimate':''}</span></td><td class="r num">${money2(x.amount)}</td></tr>`).join('')}</tbody></table>` : `<div class="muted">None recorded.</div>`}</div>
    </div>
  </div>
  <div class="panel" style="margin-top:14px"><h3>Year to date</h3><div class="tw"><table><thead><tr><th>Month</th><th class="r">Eligible revenue</th><th class="r">Pool</th>${partners().map(id => `<th class="r">${esc(person(id).name)} hrs</th><th class="r">${esc(person(id).name)} payout</th><th class="r">$/h</th>`).join('')}<th class="r">Expenses</th><th class="r">Contribution</th><th>Status</th></tr></thead><tbody>
  ${ytd.map(p => `<tr><td><a href="#payouts" data-act="pm" data-m="${p.m}">${monthLabel(p.m)}</a></td><td class="r num">${money2(p.rev.eligible)}</td><td class="r num">${money2(p.pool)}</td>${partners().map(id => { const x = p.people.find(q=>q.id===id); return `<td class="r num">${hrs(x?.approved)}</td><td class="r num">${money2(x?.payout)}</td><td class="r num">${x?.approved?money(x.perHour):'–'}</td>`; }).join('')}<td class="r num">${money2(p.expTotal)}</td><td class="r num">${money2(p.contribution)}</td><td>${p.locked?'<span class="chip good">locked</span>':p.reconstructed?'<span class="chip">reconstructed</span>':'<span class="chip warn">open</span>'}</td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td class="r num">${money2(sum(ytd,p=>p.rev.eligible))}</td><td class="r num">${money2(sum(ytd,p=>p.pool))}</td>${partners().map(id => `<td class="r num">${hrs(sum(ytd,p=>p.people.find(q=>q.id===id)?.approved))}</td><td class="r num">${money2(sum(ytd,p=>p.people.find(q=>q.id===id)?.payout))}</td><td></td>`).join('')}<td class="r num">${money2(sum(ytd,p=>p.expTotal))}</td><td class="r num">${money2(sum(ytd,p=>p.contribution))}</td><td></td></tr></tfoot></table></div>
  <p class="muted" style="margin:10px 0 0">Months before the time log began (July 13) have revenue but no tracked hours, so their pool shows as unallocated.</p></div>
  <div class="panel" style="margin-top:14px"><h3>Compensation models <span class="muted">analysis only, never changes payouts</span></h3>${compModels(P)}</div>`;
};
function compModels(P){
  const m = P.m, from = m+'-01', to = monthEnd(m); const ids = partners();
  const rows = laborRows().filter(r => inRange(r.date, from, to) && r.status==='approved' && r.payoutEligible && ids.includes(r.personId));
  const cxW = {Low:.8, Standard:1, High:1.3};
  const lvlW = l => ({1:.6, 2:.8, 3:1, 4:1.25})[l] || 1;
  const w = (fn) => ids.map(id => sum(rows.filter(r => r.personId===id), fn));
  const clientRev = {}; ledgerItems().forEach(l => { const p = paidIn(l, from, to); if (p && l.clientId) clientRev[l.clientId] = (clientRev[l.clientId]||0) + p; });
  const clientMin = groupBy(rows, r => r.clientId);
  const revAttr = ids.map(id => sum(Object.entries(clientRev), ([c, rev]) => { const all = sum(clientMin[c]||[], r=>r.minutes); const mine = sum((clientMin[c]||[]).filter(r=>r.personId===id), r=>r.minutes); return all ? rev*mine/all : 0; }));
  const models = [
    ['Raw hours (current)', w(r => r.minutes)],
    ['Complexity-weighted hours', w(r => r.minutes * (cxW[entryById(r.entryId)?.complexity] || 1))],
    ['Deliverable points (planning std × units)', w(r => r.units ? r.units * (ttype(r.typeId)?.planHours||0) : 0)],
    ['Revenue-attributed', revAttr],
    ['Hybrid: 50% hours, 50% revenue', ids.map((id,i) => { const h = w(r=>r.minutes), H = sum(h), R = sum(revAttr); return (H? .5*h[i]/H : 0) + (R ? .5*revAttr[i]/R : 0); })],
    ['Role-weighted hours (task level)', w(r => r.minutes * lvlW(ttype(r.typeId)?.level))],
  ];
  return `<p class="muted" style="margin:0 0 10px">Raw hours can reward taking longer. These show how the same ${money2(P.pool)} pool would split under other rules. Deliverable points only count entries with a unit count.</p>
  <div class="tw"><table><thead><tr><th>Model</th>${ids.map(id => `<th class="r">${esc(person(id).name)}</th>`).join('')}<th class="r">Difference vs current</th></tr></thead><tbody>
  ${models.map(([name, ws], k) => { const pays = splitCents(P.pool, ws.map(x => Math.max(0,x))); const base = splitCents(P.pool, models[0][1]); const has = sum(ws) > 0;
    return `<tr><td>${esc(name)}</td>${ids.map((id,i) => `<td class="r num">${has ? money2(pays[i]) : '<span class="muted">no data</span>'}</td>`).join('')}<td class="r num">${k && has ? ids.map((id,i) => `${esc(person(id).name)} ${(pays[i]-base[i])>=0?'+':''}${money(pays[i]-base[i])}`).join(' · ') : '–'}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

/* ================================================================ REVENUE / CONTRACTS / EXPENSES */
VIEWS.revenue = () => {
  const L = ledgerItems().sort((a,b) => (b.paidDate||b.invoiceDate||'').localeCompare(a.paidDate||a.invoiceDate||''));
  const by = groupBy(L, l => l.status);
  const band = (k, v, s='') => `<div><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
  const RR = runRate();
  return `<div class="head"><div><h1>Revenue ledger</h1><p>Every dollar in or owed, traced to a client, project or contract. Status decides which totals it lands in; nothing mixes paid, receivable and contracted without a label.</p></div><button class="btn pri" data-act="fin-new" data-k="ledger">Add revenue</button></div>
  <div class="panel pace">
    <div class="spread" style="align-items:flex-start">
      <div><div class="eyebrow">12-month pace · zero churn</div><div class="pace-v">${money(RR.total)}</div>
        <div class="ink2">If every current retainer renews and one-off work keeps its last-90-day pace for the next 12 months. That's ${money(RR.monthly)} a month${S.settings.annualGoal ? `, ${pct(RR.total / S.settings.annualGoal)} of the ${money(S.settings.annualGoal)} goal` : ''}.</div></div>
      <div class="kv" style="min-width:260px">
        <span>Retainers <span class="muted">${money(RR.recurringMonthly)}/mo × 12</span></span><span>${money(RR.recurringAnnual)}</span>
        <span>One-off projects <span class="muted">${money(RR.oneOff90)} in 90 days, annualized</span></span><span>${money(RR.oneOffAnnual)}</span>
        <span class="t">12-month pace</span><span class="t">${money(RR.total)}</span>
      </div>
    </div>
    <div class="tw" style="margin-top:14px"><table><thead><tr><th>Retainer</th><th class="r">Per month</th><th class="r">12 months</th><th class="r">Share</th><th></th></tr></thead><tbody>
    ${RR.retainers.sort((a,b)=>b.monthly-a.monthly).map(r => `<tr><td><b>${esc(clientName(r.c.clientId))}</b>${r.c.frequency!=='monthly'?` <span class="muted">${money2(r.c.amount)} ${esc(r.c.frequency)}</span>`:''}</td><td class="r num">${money2(r.monthly)}</td><td class="r num">${money(r.monthly*12)}</td><td class="r num">${pct(RR.total ? r.monthly*12/RR.total : 0)}</td><td>${r.starts?`<span class="chip acc">starts ${dateLabel(r.starts)}</span>`:''}${r.c.needsReview?' <span class="chip warn">billing to confirm</span>':''}</td></tr>`).join('')}
    <tr><td><b>One-off projects</b> <span class="muted">${RR.oneOffLines.length} payments since ${dateLabel(RR.from90)}</span></td><td class="r num">${money2(RR.oneOffAnnual/12)}</td><td class="r num">${money(RR.oneOffAnnual)}</td><td class="r num">${pct(RR.total ? RR.oneOffAnnual/RR.total : 0)}</td><td></td></tr>
    </tbody></table></div>
  </div>
  <div class="band" style="margin-top:14px">${['paid','partial','ar','invoiced','contracted','draft','written_off'].filter(s => by[s]).map(s => band(STATUS_LABEL[s], money(sum(by[s], l => s==='paid' ? (+l.paidAmount||+l.amount) : +l.amount)), `${by[s].length} lines`)).join('')}</div>
  <div class="tw" style="margin-top:14px"><table><thead><tr><th>Client</th><th>Type</th><th>Contract</th><th>Invoiced</th><th>Paid</th><th class="r">Amount</th><th>Status</th><th>Pool</th><th>Notes</th><th></th></tr></thead><tbody>
  ${L.map(l => { const c = S.fin.contracts?.[l.contractId]; return `<tr><td><b>${esc(l.clientName || clientName(l.clientId))}</b>${!l.clientId && l.revenueType!=='other income'?' <span class="chip warn">no client</span>':''}</td><td>${esc(l.revenueType)}</td><td>${c?`${money(c.amount)}/${esc(c.frequency)}`:'–'}</td><td class="num">${dateLabel(l.invoiceDate)}</td><td class="num">${dateLabel(l.paidDate)}</td><td class="r num">${money2(l.amount)}</td>
    <td><span class="chip ${l.status==='paid'?'good':['ar','invoiced','partial'].includes(l.status)?'warn':l.status==='written_off'?'crit':''}">${esc(STATUS_LABEL[l.status]||l.status)}</span></td><td>${l.poolEligible===false?'<span class="chip">excluded</span>':'✓'}</td><td class="wrap muted">${esc(l.notes||'')}</td><td><button class="btn sm ghost" data-act="fin-edit" data-k="ledger" data-id="${l.id}">Edit</button></td></tr>`; }).join('')}
  </tbody></table></div>`;
};
VIEWS.contracts = () => {
  const C = contractItems().filter(isActiveContract).sort((a,b) => clientName(a.clientId).localeCompare(clientName(b.clientId)));
  const FREQ = {monthly:'Monthly', quarterly:'Quarterly', semiannual:'Biannually', annual:'Annually', commission:'Commission'};
  /* Spec section 37: planned hours, renewal date and end date are gone. Section 38:
   * ad commission shows a percentage, never a dollar amount. */
  return `<div class="head"><div><h1>Clients</h1><p>Active agreements only. Billing frequency is recorded exactly as agreed; the monthly column is derived for analytics and never changes what a client is billed.</p></div><button class="btn pri" data-act="fin-new" data-k="contracts">Add client agreement</button></div>
  <div class="band">
    <div><div class="k">Monthly recurring</div><div class="v">${money(mrr())}</div><div class="s">fixed-cycle agreements, normalized</div></div>
    <div><div class="k">Active clients</div><div class="v">${new Set(C.map(c => c.clientId)).size}</div></div>
    <div><div class="k">Commission based</div><div class="v">${C.filter(c => c.contractType === 'ad commission').length}</div><div class="s">no fixed monthly value</div></div>
  </div>
  <div class="tw" style="margin-top:14px"><table><thead><tr>
    <th>Client</th><th>Type</th><th class="r">Amount</th><th class="r">Monthly equivalent</th><th>Billing</th><th>Since</th><th></th>
  </tr></thead><tbody>
  ${C.map(c => {
    const commission = c.contractType === 'ad commission';
    const months = {monthly:1, quarterly:3, semiannual:6, annual:12}[c.frequency];
    const monthly = (!commission && months && c.amount != null) ? c.amount / months : null;
    return `<tr>
      <td><b>${esc(clientName(c.clientId))}</b></td>
      <td>${commission ? 'Ad Commission' : esc(c.contractType)}</td>
      <td class="r num">${commission
        ? (c.percentCommission != null ? esc(c.percentCommission)+'%' : '<span class="chip warn">rate not set</span>')
        : money2(c.amount)}</td>
      <td class="r num">${monthly != null ? money2(monthly) : '<span class="muted">N/A</span>'}</td>
      <td>${esc(FREQ[c.frequency] || c.frequency)}${c.billingDay ? ', day '+esc(c.billingDay) : ''}</td>
      <td class="num">${dateLabel(c.start)}</td>
      <td><button class="btn sm ghost" data-act="fin-edit" data-k="contracts" data-id="${c.id}">Edit</button>
          <button class="btn sm" data-act="bill-add" data-id="${c.id}">Add charge</button></td></tr>`;
  }).join('')}
  </tbody></table></div>
  <p class="muted" style="margin-top:10px">Pricing changes are edits, not new agreements. Use Add charge for one-off or hourly work on an existing client, spec sections 40 to 42.</p>`;
};

/* One-off and hourly charges on an existing client, spec sections 41 and 42.
 * Writes a revenue line rather than forcing a duplicate client or contract. */
function openBillModal(contractId){
  const c = contractItems().find(x => x.id === contractId); if (!c) return;
  openModal(`<header><h2>Add charge</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">
    <p class="muted" style="margin-top:0">Billed to <b>${esc(clientName(c.clientId))}</b> on top of their existing agreement.</p>
    <div class="fg">
      <label class="field"><span>Type</span><select class="in" id="bl-type">
        <option value="one-off">One-off project</option>
        <option value="hourly">Hourly</option>
        <option value="ad commission">Ad commission</option>
      </select></label>
      <label class="field"><span>Amount</span><input class="in num" type="number" step="0.01" min="0" id="bl-amt"></label>
      <label class="field"><span>Date</span><input class="in" type="date" id="bl-date" value="${today()}"></label>
    </div>
    <label class="field"><span>Description</span><input class="in" id="bl-desc" placeholder="What is being billed"></label>
    <div class="err" id="bl-err"></div>
  </div>
  <footer><span></span><button class="btn pri" data-act="bill-save" data-id="${contractId}">Record charge</button></footer>`);
}
async function saveBill(contractId){
  const c = contractItems().find(x => x.id === contractId); if (!c) return;
  const amt = +$('#bl-amt').value, date = $('#bl-date').value, desc = $('#bl-desc').value.trim();
  if (!amt || amt <= 0){ $('#bl-err').textContent = 'Enter an amount.'; return; }
  if (!date){ $('#bl-err').textContent = 'Pick a date.'; return; }
  const id = uid('rev');
  await saveFin('ledger', {id, clientId:c.clientId, clientName:clientName(c.clientId), contractId:c.id,
    revenueType:$('#bl-type').value, amount:amt, invoiceDate:date, paidDate:null, paidAmount:0,
    status:'invoiced', poolEligible:true, notes:desc, source:'manual', deleted:false}, 'One-off charge added');
  closeModal(); toast('Charge recorded');
}

VIEWS.expenses = () => {
  const X = expenseItems().sort((a,b) => (b.recurring-a.recurring) || b.date.localeCompare(a.date));
  const y = today().slice(0,4); const occ = expensesIn(y+'-01-01', today());
  const byCat = Object.entries(groupBy(occ, x => x.category)).map(([k, xs]) => [k, sum(xs, x=>x.amount)]).sort((a,b)=>b[1]-a[1]);
  const subs = X.filter(x => x.recurring);
  return `<div class="head"><div><h1>Expenses</h1><p>Company overhead and direct client costs. Recurring rules expand into monthly charges automatically. Rows marked seeded are January to August estimates from the operating model; replace them with real transactions when you have them.</p></div><button class="btn pri" data-act="fin-new" data-k="expenses">Add expense</button></div>
  <div class="band"><div><div class="k">${y} to date</div><div class="v">${money(sum(occ,x=>x.amount))}</div></div><div><div class="k">Recurring per month</div><div class="v">${money(sum(subs.filter(x=>!x.endDate||x.endDate>=today()), x => x.amount/(FREQ_M[x.frequency]||1)))}</div><div class="s">${subs.length} subscriptions and retainers</div></div>
    ${byCat.slice(0,4).map(([k,v]) => `<div><div class="k">${esc(k)}</div><div class="v">${money(v)}</div></div>`).join('')}</div>
  ${subs.length ? `<div class="panel" style="margin-top:14px"><h3>Subscriptions and retainers</h3><table><thead><tr><th>Vendor</th><th>Category</th><th class="r">Amount</th><th>Frequency</th><th>Since</th><th>Owner</th><th>Renewal</th><th>Cancel by</th><th></th></tr></thead><tbody>${subs.map(x => `<tr><td><b>${esc(x.vendor)}</b>${x.needsReview?' <span class="chip warn">check</span>':''}</td><td>${esc(x.category)}</td><td class="r num">${money2(x.amount)}</td><td>${esc(x.frequency)}</td><td class="num">${dateLabel(x.date)}</td><td>${esc(x.owner?person(x.owner).name:'–')}</td><td class="num">${dateLabel(x.renewalDate)}</td><td class="num">${dateLabel(x.cancelNoticeDate)}</td><td><button class="btn sm ghost" data-act="fin-edit" data-k="expenses" data-id="${x.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="tw" style="margin-top:14px"><table><thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Allocation</th><th class="r">Amount</th><th>Notes</th><th></th></tr></thead><tbody>
  ${X.filter(x => !x.recurring).map(x => `<tr><td class="num">${dateLabel(x.date)}</td><td><b>${esc(x.vendor)}</b>${x.source==='seed'?' <span class="chip">seeded</span>':''}</td><td>${esc(x.category)}</td><td>${x.allocation==='client'?esc(clientName(x.clientId)):'Overhead'}</td><td class="r num">${money2(x.amount)}</td><td class="wrap muted">${esc((x.notes||'').slice(0,90))}</td><td><button class="btn sm ghost" data-act="fin-edit" data-k="expenses" data-id="${x.id}">Edit</button></td></tr>`).join('')}
  </tbody></table></div>`;
};

/* ---------- finance editors */
const FIN_FIELDS = {
  ledger: ['clientId','contractId','revenueType','serviceLine','invoiceDate','recognitionDate','expectedDate','paidDate','amount','paidAmount','status','poolEligible','notes'],
  contracts: ['clientId','contractType','start','end','amount','frequency','billingDay','renewalDate','lifecycle','includedServices','plannedMonthlyHours','notes'],
  expenses: ['vendor','category','amount','date','recurring','frequency','endDate','allocation','clientId','owner','renewalDate','cancelNoticeDate','notes'],
};
function finForm(kind, x){
  const inp = (k, label, type='text', extra='') => `<label class="field"><span>${label}</span><input class="in ${type==='number'?'num':''}" type="${type}" id="fx-${k}" value="${esc(x[k] ?? '')}" ${extra}></label>`;
  const sel = (k, label, opts) => `<label class="field"><span>${label}</span><select class="in" id="fx-${k}">${opts.map(([v,l]) => `<option value="${v}" ${String(x[k]??'')===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const clientSel = `<label class="field"><span>Client</span><select class="in" id="fx-clientId"><option value="">None</option>${clientOptions(x.clientId, false)}</select></label>`;
  if (kind === 'ledger') return `<div class="fg">${clientSel}
    <label class="field"><span>Contract</span><select class="in" id="fx-contractId"><option value="">None</option>${contractItems().map(c => `<option value="${c.id}" ${c.id===x.contractId?'selected':''}>${esc(clientName(c.clientId))} ${money(c.amount)}/${esc(c.frequency)} from ${dateLabel(c.start)}</option>`).join('')}</select></label>
    ${sel('revenueType','Revenue type',[['retainer','Retainer'],['one-off','One-off project'],['hourly','Hourly'],['ad fee','Ad management fee'],['commission','Commission'],['other income','Other income']])}
    <label class="field"><span>Service line</span><select class="in" id="fx-serviceLine"><option value="">–</option>${FAMILY_ORDER().map(f => `<option value="${f}" ${f===x.serviceLine?'selected':''}>${esc(famName(f))}</option>`).join('')}</select></label></div>
    <div class="fg">${inp('amount','Amount','number','step="0.01"')}${sel('status','Status',Object.entries(STATUS_LABEL))}${inp('paidAmount','Paid amount','number','step="0.01"')}</div>
    <div class="fg">${inp('invoiceDate','Invoice date','date')}${inp('recognitionDate','Recognition date','date')}${inp('expectedDate','Expected payment','date')}${inp('paidDate','Payment date','date')}</div>
    <label class="check"><input type="checkbox" id="fx-poolEligible" ${x.poolEligible!==false?'checked':''}> Counts toward the labor pool</label>${inp('notes','Notes')}`;
  if (kind === 'contracts') return `<div class="fg">${clientSel}${sel('contractType','Type',[['retainer','Retainer'],['project','Project'],['hourly','Hourly'],['ad fee','Ad fee']])}${inp('amount','Amount per billing','number','step="0.01"')}${sel('frequency','Billing frequency',[['monthly','Monthly'],['quarterly','Quarterly'],['semiannual','Every 6 months'],['annual','Annual']])}${inp('billingDay','Billing day','number','min="1" max="31"')}</div>
    <div class="fg">${inp('start','Start','date')}${inp('end','End','date')}${inp('renewalDate','Renewal date','date')}${sel('lifecycle','Lifecycle',[['pending','Pending'],['active','Active'],['renewing','Renewing'],['paused','Paused'],['churned','Churned'],['completed','Completed']])}${inp('plannedMonthlyHours','Planned hours / month','number','step="0.5"')}</div>
    ${inp('includedServices','Included services')}${inp('notes','Notes')}`;
  return `<div class="fg">${inp('vendor','Vendor')}${inp('category','Category','text','list="cats"')}<datalist id="cats">${[...new Set(expenseItems().map(e=>e.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>${inp('amount','Amount','number','step="0.01"')}${inp('date', x.recurring ? 'First charge' : 'Date','date')}</div>
    <div class="fg"><label class="check"><input type="checkbox" id="fx-recurring" ${x.recurring?'checked':''}> Recurring</label>${sel('frequency','Frequency',[['','–'],['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']])}${inp('endDate','Ends','date')}</div>
    <div class="fg">${sel('allocation','Allocation',[['overhead','Company overhead'],['client','Direct client cost']])}${clientSel}<label class="field"><span>Subscription owner</span><select class="in" id="fx-owner"><option value="">–</option>${personOptions(x.owner, true)}</select></label>${inp('renewalDate','Renewal date','date')}${inp('cancelNoticeDate','Cancellation notice by','date')}</div>${inp('notes','Notes')}`;
}
function openFin(kind, id){
  const x = id ? clone(S.fin[kind][id]) : {status:'paid', revenueType:'one-off', poolEligible:true, frequency:kind==='contracts'?'monthly':'', lifecycle:'active', contractType:'retainer', allocation:'overhead', recurring:false, date:today(), invoiceDate:today(), recognitionDate:today(), start:today()};
  UI.fin = {kind, x};
  const payoutKind = kind !== 'contracts';
  openModal(`<header><h2>${id?'Edit':'Add'} ${kind==='ledger'?'revenue':kind==='contracts'?'contract':'expense'}</h2><button class="btn ghost" data-act="close">Close</button></header>
  <div class="body">${x.source==='import'?`<div class="note">Imported from ${esc(x.importRef)}. The original stays in the read-only source records.</div>`:''}${(x.reviewNotes||[]).length?`<div class="note warn">${esc(x.reviewNotes.join(' '))}</div>`:''}
  ${finForm(kind, x)}
  ${id ? `<label class="field"><span>Reason for change ${payoutKind?'<span class="muted">(required: affects payouts)</span>':''}</span><input class="in" id="fx-reason"></label>` : ''}
  <div class="err" id="fx-err"></div></div>
  <footer><span>${id?`<button class="btn danger" data-act="fin-del">Delete</button>`:''}</span><span class="row">${x.needsReview?`<button class="btn" data-act="fin-save" data-ok="1">Save and clear flag</button>`:''}<button class="btn pri" data-act="fin-save">Save</button></span></footer>`, {wide:true});
}
async function saveFinForm(clearFlag, del){
  const {kind, x} = UI.fin; const err = $('#fx-err');
  const reason = $('#fx-reason')?.value?.trim() || '';
  if (x.id && kind !== 'contracts' && !reason) return err.textContent = 'Give a reason. Revenue and expense changes affect payouts.';
  if (del){ x.deleted = true; }
  else for (const k of FIN_FIELDS[kind]){
    const el = $('#fx-'+k); if (!el) continue;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = v === '' ? null : +v;
    if (v === '') v = null;
    x[k] = v;
  }
  if (!del){
    if (kind === 'ledger'){ if (!(x.amount > 0)) return err.textContent = 'Enter an amount.'; if (x.status==='paid' && !x.paidDate) return err.textContent = 'Paid revenue needs a payment date.'; if (x.status==='paid' && !x.paidAmount) x.paidAmount = x.amount; x.clientName = x.clientId ? clientName(x.clientId) : (x.clientName || ''); if (x.revenueType==='other income') x.poolEligible = false; }
    if (kind === 'contracts'){ if (!x.clientId || !x.start || !(x.amount > 0)) return err.textContent = 'Client, start date and amount are required.'; x.billingDay ||= +x.start.slice(8,10); }
    if (kind === 'expenses'){ if (!x.vendor || !(x.amount > 0) || !x.date) return err.textContent = 'Vendor, amount and date are required.'; if (x.recurring && !x.frequency) x.frequency = 'monthly'; }
    if (clearFlag){ x.needsReview = false; x.reviewNotes = []; }
  }
  const locked = kind !== 'contracts' && [x.paidDate, x.date, x.invoiceDate].filter(Boolean).some(d => isLocked(monthOf(d)));
  if (locked && x.id) return err.textContent = 'This falls in a locked payment period. Unlock it on Payouts first.';
  try { await saveFin(kind, x, reason || (del ? 'Deleted' : ''), FIN_FIELDS[kind].concat(['deleted'])); closeModal(); toast(del ? 'Deleted' : 'Saved'); }
  catch (e){ err.textContent = e.message || 'Could not save.'; }
}

/* ---------- client + task type editors */
function openClient(id){
  const c = id ? clone(S.clients[id]) : {name:'', aliases:[], active:true, kind:'client'};
  UI.cl = {id, c};
  openModal(`<header><h2>${id?'Edit client':'Add client'}</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body">
    <div class="fg"><label class="field"><span>Name</span><input class="in" id="cl-name" value="${esc(c.name)}"></label>
    <label class="field"><span>Kind</span><select class="in" id="cl-kind">${[['client','Client'],['prospect','Prospects / new business'],['internal','Internal']].map(([v,l]) => `<option value="${v}" ${v===c.kind?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Other names used in notes</span><input class="in" id="cl-aliases" value="${esc((c.aliases||[]).join(', '))}"><small>Comma separated. Used when importing and for quick log.</small></label>
    <label class="check"><input type="checkbox" id="cl-active" ${c.active!==false?'checked':''}> Active (shows in pickers)</label><div class="err" id="cl-err"></div></div>
    <footer><span></span><button class="btn pri" data-act="client-save">Save</button></footer>`);
}
async function saveClient(){
  const {id} = UI.cl; const name = $('#cl-name').value.trim(); if (!name) return $('#cl-err').textContent = 'Name the client.';
  const key = id || name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30) || uid('c');
  const c = {name, kind:$('#cl-kind').value, aliases:$('#cl-aliases').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean), active:$('#cl-active').checked};
  await S.db.doc('config/clients').update({items:{[key]:c}}); await audit('clients', key, [{field:id?'updated':'created', from:null, to:name}], ''); closeModal(); toast('Saved');
}
function openType(code){
  const t = code ? clone(ttype(code)) : {code:'', family:FAMILY_ORDER()[0], name:'', unit:'', planHours:1, source:'ESTIMATE', level:3, billable:true, payoutEligible:true, active:true, description:'', included:'', excluded:''};
  UI.ty = {code, t};
  openModal(`<header><h2>${code?'Edit task type':'Add task type'}</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body">
    <div class="fg"><label class="field"><span>Code</span><input class="in mono" id="ty-code" value="${esc(t.code)}" ${code?'disabled':''} placeholder="e.g. EM-10"></label>
    <label class="field"><span>Service family</span><select class="in" id="ty-family">${FAMILY_ORDER().map(f => `<option value="${f}" ${f===t.family?'selected':''}>${esc(famName(f))}</option>`).join('')}</select></label>
    <label class="field"><span>Name</span><input class="in" id="ty-name" value="${esc(t.name)}"></label><label class="field"><span>Default unit</span><input class="in" id="ty-unit" value="${esc(t.unit)}" placeholder="email, reel, call"></label></div>
    <div class="fg"><label class="field"><span>Planning standard (hours per unit)</span><input class="in num" type="number" step="0.01" id="ty-plan" value="${esc(t.planHours)}"></label>
    <label class="field"><span>Standard source</span><select class="in" id="ty-src">${['MEASURED','ESTIMATE','BENCHMARK','CONTRACT','MANUAL'].map(s => `<option ${s===t.source?'selected':''}>${s}</option>`).join('')}</select></label>
    <label class="field"><span>Skill level</span><select class="in" id="ty-level">${[1,2,3,4].map(l => `<option value="${l}" ${+t.level===l?'selected':''}>${l} · ${['Button-pushing','Template-based','Craft','Strategy / senior'][l-1]}</option>`).join('')}</select></label></div>
    <label class="field"><span>Description</span><input class="in" id="ty-desc" value="${esc(t.description)}"></label>
    <div class="fg"><label class="field"><span>Included work</span><textarea class="in" id="ty-inc" rows="2">${esc(t.included)}</textarea></label><label class="field"><span>Excluded work</span><textarea class="in" id="ty-exc" rows="2">${esc(t.excluded)}</textarea></label></div>
    <div class="row"><label class="check"><input type="checkbox" id="ty-bill" ${t.billable?'checked':''}> Billable by default</label><label class="check"><input type="checkbox" id="ty-pay" ${t.payoutEligible!==false?'checked':''}> Payout-eligible by default</label><label class="check"><input type="checkbox" id="ty-active" ${t.active!==false?'checked':''}> Active</label></div>
    <div class="err" id="ty-err"></div></div><footer><span></span><button class="btn pri" data-act="type-save">Save</button></footer>`, {wide:true});
}
async function saveType(){
  const {code} = UI.ty; const c = (code || $('#ty-code').value.trim().toUpperCase());
  if (!/^[A-Z]{2}-\d{2,3}$/.test(c)) return $('#ty-err').textContent = 'Use a code like EM-10.';
  if (!code && ttype(c)) return $('#ty-err').textContent = 'That code is taken.';
  const fam = $('#ty-family').value; const prev = ttype(c);
  const t = {code:c, family:fam, name:$('#ty-name').value.trim(), unit:$('#ty-unit').value.trim()||'unit', planHours:+$('#ty-plan').value||0, source:$('#ty-src').value, level:+$('#ty-level').value,
    description:$('#ty-desc').value, included:$('#ty-inc').value, excluded:$('#ty-exc').value, billable:$('#ty-bill').checked, payoutEligible:$('#ty-pay').checked, active:$('#ty-active').checked,
    cls:S.taxonomy.families[fam].cls, order: prev?.order ?? Object.keys(S.taxonomy.types).length};
  if (!t.name) return $('#ty-err').textContent = 'Name the task type.';
  await S.db.doc('config/taxonomy').update({types:{[c]:t}}); await audit('taxonomy', c, diff(prev, t, ['name','family','unit','planHours','billable','payoutEligible','active']), ''); closeModal(); toast('Saved');
}

/* ================================================================ SETTINGS */
VIEWS.settings = () => {
  const st = S.settings;
  return `<div class="head"><div><h1>Settings</h1><p>Payout rules, people and data. Every change that affects payouts asks for a reason and lands in the audit log.</p></div></div>
  <div class="grid g2">
    <div class="panel"><h3>Payout rules</h3><div class="stack">
      <div class="fg"><label class="field"><span>Labor pool %</span><input class="in num" type="number" step="1" min="0" max="100" id="s-pool" value="${Math.round(st.poolPct*100)}"></label>
      <label class="field"><span>Revenue basis</span><select class="in" id="s-basis">${Object.entries(BASIS_LABEL).map(([k,l]) => `<option value="${k}" ${k===st.revenueBasis?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Expenses come out</span><select class="in" id="s-exp"><option value="after" ${st.expenseTiming==='after'?'selected':''}>After the pool (from company share)</option><option value="before" ${st.expenseTiming==='before'?'selected':''}>Before the pool</option></select></label></div>
      <div class="fg"><label class="field"><span>Annual revenue goal</span><input class="in num" type="number" id="s-goal" value="${st.annualGoal}"></label><label class="field"><span>Goal year</span><input class="in num" type="number" id="s-year" value="${st.goalYear}"></label>
      <label class="field"><span>Approvals</span><select class="in" id="s-appr"><option value="partner" ${st.approvalMode==='partner'?'selected':''}>Partner approves</option><option value="self" ${st.approvalMode==='self'?'selected':''}>Submitting approves</option></select></label></div>
      <div class="fg"><label class="field"><span>Custom amount month</span><input class="in" type="month" id="s-cm" value="${today().slice(0,7)}"></label><label class="field"><span>Approved amount</span><input class="in num" type="number" step="0.01" id="s-ca" placeholder="only used on the manual basis"></label></div>
      <label class="field"><span>Reason for change</span><input class="in" id="s-reason" placeholder="Required for pool, basis or expense changes"></label>
      <div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="save-rules">Save rules</button></div><div class="err" id="s-err"></div>
    </div></div>
    <div class="panel"><h3>People</h3>
      <table><thead><tr><th>Person</th><th>Role</th><th>Pool</th><th class="r">Weekly capacity</th><th>Sign-in</th></tr></thead><tbody>
      ${Object.entries(S.people).map(([id,p]) => `<tr><td><b>${esc(p.name)}</b>${id===S.personId?' <span class="chip acc">you</span>':''}</td><td>${esc(p.role)}</td><td>${p.poolMember?'✓':'–'}</td><td class="r"><input class="in num" type="number" style="width:70px" data-cap="${id}" value="${p.weeklyCapacity||0}"></td><td>${p.userId?'<span class="chip good">linked</span>':'<span class="chip">not linked</span>'}${p.userId && S.me.isOwner && id!==S.personId?` <button class="btn sm ghost" data-act="unlink" data-id="${id}">Unlink</button>`:''}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Contractors and interns are paid as expenses, outside the pool. Share LS Command with Carter as a Contributor or Editor so he can track and approve.</p>
      ${!S.me.id ? `<div class="row"><span class="muted">Acting as ${esc(person(S.personId).name)} in this browser.</span><button class="btn sm" data-act="switch-person">Switch</button></div>` : ''}
    </div>
    <div class="panel"><h3>Timer and reminders</h3>
      <div class="fg"><label class="field"><span>Company time zone</span><input class="in" id="s-tz" value="${esc(st.timezone)}"></label><label class="field"><span>Long session nudge (hours)</span><input class="in num" type="number" id="s-long" value="${st.longTimerHours}"></label><label class="field"><span>Forgotten timer (hours)</span><input class="in num" type="number" id="s-forgot" value="${st.forgottenTimerHours}"></label><label class="field"><span>Idle check (minutes away)</span><input class="in num" type="number" id="s-idle" value="${st.idleMinutes}"></label></div>
      <div class="fg" style="margin-top:10px"><label class="check"><input type="checkbox" id="s-wh" ${st.workHours?.enabled?'checked':''}> Remind me when nothing is tracked during</label><input class="in" type="time" id="s-whs" value="${esc(st.workHours?.start||'09:00')}"><input class="in" type="time" id="s-whe" value="${esc(st.workHours?.end||'18:00')}"></div>
      <div class="row" style="margin-top:12px; justify-content:space-between"><button class="btn sm" data-act="notif">Allow browser notifications</button><button class="btn pri" data-act="save-timer">Save</button></div>
    </div>
    <div class="panel"><h3>Export and import</h3>
      <div class="row"><button class="btn" data-act="export-csv">Time entries (.csv)</button><button class="btn" data-act="export-xlsx">Full workbook (.xlsx)</button></div>
      <hr class="sep" style="margin:14px 0">
      <label class="field"><span>Import more time log rows (.xlsx or .csv)</span><input class="in" type="file" id="imp-file" accept=".xlsx,.csv"><small>Same columns as the old log: Date, Name, Start time, End time, Category, Task. Rows already imported are skipped; new rows land in Time Log as drafts.</small></label>
      <div id="imp-msg" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="panel"><h3>Original records</h3><p class="ink2" style="margin-top:0">The spreadsheets as imported, unchanged and read-only. LS Command keeps its own normalized copies; these stay as the reference.</p>
      <div class="row"><button class="btn" data-act="src" data-id="timelog">Time log (${'207'} rows)</button><button class="btn" data-act="src" data-id="ledger">Revenue ledger</button><button class="btn" data-act="src" data-id="contracts">Contracts</button></div></div>
  </div>`;
};
async function showSource(id){
  const snap = await S.db.doc('source/'+id).get(); if (!snap.exists) return toast('Source not found');
  const d = snap.data(); const rows = d.rows||[]; const cols = rows.length ? Object.keys(rows[0]) : [];
  openModal(`<header><h2>${esc(d.file)}${d.sheet?' · '+esc(d.sheet):''}</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body"><p class="muted" style="margin:0">Imported ${esc(new Date(d.importedAt).toLocaleDateString())}. Read-only.</p>
  <div class="tw" style="max-height:60vh"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`, {wide:true});
}

/* ================================================================ AUDIT */
VIEWS.audit = () => {
  const all = Object.values(S.auditDocs).flatMap(d => Object.values(d.items||{})).sort((a,b) => b.ts - a.ts);
  const f = UI.af ||= 'all'; const list = all.filter(a => f==='all' || (f==='payout' ? a.payoutImpact : a.entity===f)).slice(0, 400);
  const fmtV = v => v == null ? '–' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item(s)` : '{…}') : String(v).length > 40 ? String(v).slice(0,40)+'…' : String(v);
  return `<div class="head"><div><h1>Audit log</h1><p>Who changed what, when, from what to what, and why. Payout-impacting changes are marked.</p></div>
    <select class="in" id="af" style="width:auto">${[['all','Everything'],['payout','Payout-impacting'],['entry','Time entries'],['ledger','Revenue'],['contracts','Contracts'],['expenses','Expenses'],['settings','Settings'],['payouts','Payout locks']].map(([v,l]) => `<option value="${v}" ${v===f?'selected':''}>${l}</option>`).join('')}</select></div>
  ${list.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Changes</th><th>Reason</th></tr></thead><tbody>
  ${list.map(a => `<tr><td class="num" style="white-space:nowrap">${new Date(a.ts).toLocaleString()}</td><td>${esc(person(a.personId).name)}</td><td>${esc(a.entity)}${a.payoutImpact?' <span class="chip warn">payout</span>':''}<br><span class="code">${esc(a.entityId)}</span></td>
    <td class="wrap">${(a.changes||[]).map(c => `<div><b>${esc(c.field)}</b>: <span class="muted">${esc(fmtV(c.from))}</span> → ${esc(fmtV(c.to))}</div>`).join('')}</td><td class="wrap">${esc(a.reason||'')}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="panel empty">No changes recorded yet. Imported history starts clean; everything from here on is logged.</div>`}`;
};

/* ================================================================ actions */
async function lockPeriod(m){
  const P = payoutFor(m);
  const pend = sum(P.people, p => p.pending); const R = reviewItems();
  const snap = {pool:P.pool, eligible:P.rev.eligible, basis:P.basis, pct:P.pct, expenses:P.expTotal, contribution:P.contribution, people:P.people.map(p => ({id:p.id, approved:p.approved, payout:p.payout})), revenueLines:P.rev.lines.map(l => ({id:l.id, used:l.used}))};
  openModal(`<header><h2>Approve and lock ${monthLabel(m)}</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body">
    <div class="kv"><span>Labor pool</span><span>${money2(P.pool)}</span>${P.people.map(p => `<span>${esc(person(p.id).name)}: ${hrs(p.approved)} h</span><span>${money2(p.payout)}</span>`).join('')}</div>
    ${pend ? `<div class="note warn">${hrs(pend)} hours in ${monthShort(m)} aren't approved and won't be paid in this period.</div>` : ''}
    ${R.total ? `<div class="note">Time Log has ${R.total} entries to check. Some may affect this month.</div>` : ''}
    <label class="field"><span>Note</span><input class="in" id="lk-note" placeholder="e.g. Paid Oct 3 from Mercury"></label></div>
    <footer><span class="muted">Locking freezes entries and revenue in this month until someone unlocks it.</span><button class="btn pri" data-act="lock-go" data-m="${m}">Lock period</button></footer>`);
  UI.lockSnap = snap;
}
async function onClick(ev){
  if (!ev.target.closest('.combo')) closeCombos();
  const a = ev.target.closest('[data-act],[data-go],[data-f],[data-pick]'); if (!a) return;
  if (a.dataset.go){ ev.preventDefault(); return go(a.dataset.go); }
  if (a.dataset.f){ return setF({[a.dataset.f]: a.dataset.v}); }
  if (a.dataset.pick){ return; }   // handled on mousedown
  const act = a.dataset.act, id = a.dataset.id;
  try {
  switch (act){
    case 'scrim': if (ev.target === a && UI.downOnScrim) closeModal(); break;   // only a full click on the backdrop closes
    case 'close': closeModal(); break;
    case 'claim': await claimPerson(id); break;
    case 'theme': { const cur = document.documentElement.dataset.theme; const nx = !cur ? 'dark' : cur === 'dark' ? 'light' : ''; if (nx) document.documentElement.dataset.theme = nx; else delete document.documentElement.dataset.theme; lsSet('theme', nx); render(); break; }
    case 'start': openStart(); break;
    case 'scope-pick': {
      const sc = a.dataset.scope;
      UI.startScope = sc;
      const sw = $('#st-scope'); if (sw) sw.dataset.scope = sc;
      document.querySelectorAll('#st-scope .seg-b').forEach(b => b.classList.toggle('on', b.dataset.scope === sc));
      $('#st-fields').innerHTML = startFields(sc, {});
      $('#st-err').textContent = '';
      ($('#st-client') || $('#st-cat'))?.focus();
      break;
    }
    case 'bill-add': openBillModal(a.dataset.id); break;
    case 'bill-save': await saveBill(a.dataset.id); break;
    case 'admin-tab': UI.adminTab = a.dataset.tab; render(); break;
    case 'start-go': await startGo(); break;
    case 'quickstart': await startTimer({clientId:a.dataset.c, typeId:a.dataset.t}); break;
    case 'pause': await pauseTimer(); break;
    case 'resume': await resumeTimer(); break;
    case 'stop': stopTimer(); break;
    case 'log': openEntryEditor({personId:S.personId, date:today(), start:Date.now()-3600e3, end:Date.now(), status:'draft', source:'lucid', payoutEligible:true, billable:false}); break;
    case 'edit': { const e = entryById(id); if (e) openEntryEditor(e); break; }
    case 'ed-save': await saveEditor(a.dataset.status); break;
    case 'ed-discard': if (a.dataset.confirm){ await S.db.doc('timers/'+S.personId).set({running:false, updatedAt:Date.now()}); closeModal(); toast('Session discarded'); } else { a.dataset.confirm = '1'; a.textContent = 'Discard for sure'; } break;
    case 'ed-delete': {
      if (!a.dataset.confirm){ a.dataset.confirm = '1'; a.textContent = 'Confirm delete'; break; }
      const e = entryById(UI.edit.e.id); const reason = $('#ed-reason')?.value?.trim();
      if (e.status === 'approved' && !reason){ $('#ed-err').textContent = 'Give a reason before deleting approved time.'; break; }
      await upsertItem('entries', monthOf(e.date), e.id, {...e, deleted:true}); await audit('entry', e.id, [{field:'deleted', from:false, to:true}], reason||'', {payoutImpact:e.status==='approved'}); closeModal(); toast('Deleted'); break; }
    case 'alloc-add': readEditor(); UI.edit.e.allocations.push({clientId:UI.edit.e.clientId, typeId:UI.edit.e.typeId || Object.keys(S.taxonomy.types)[0], minutes:15, attention:'active'}); renderAllocs(); updateDur(); break;
    case 'alloc-del': UI.edit.e.allocations.splice(+a.dataset.i, 1); renderAllocs(); updateDur(); break;
    case 'status': await setStatus([id], a.dataset.s); break;
    case 'reject': openModal(`<header><h2>Send back</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body"><label class="field"><span>What needs fixing?</span><input class="in" id="rj-reason" autofocus></label></div><footer><span></span><button class="btn pri" data-act="reject-go" data-id="${id}">Send back</button></footer>`); break;
    case 'reject-go': await setStatus([id], 'rejected', $('#rj-reason').value); closeModal(); break;
    case 'submit-all': { const f = UI.tf; await setStatus(allEntries().filter(e => e.personId===S.personId && e.status==='draft' && monthOf(e.date)===f.month && e.clientId && e.typeId).map(e=>e.id), S.settings.approvalMode==='self'?'approved':'submitted'); break; }
    case 'approve-all': { const f = UI.tf; await setStatus(allEntries().filter(e => e.personId!==S.personId && e.status==='submitted' && monthOf(e.date)===f.month).map(e=>e.id), 'approved'); break; }
    case 'mark-ok': { const e = entryById(id); await upsertItem('entries', monthOf(e.date), id, {...e, needsReview:false, reviewNotes:[]}); await audit('entry', id, [{field:'mapping', from:'unconfirmed', to:'confirmed'}], 'Confirmed imported mapping'); break; }
    case 'merge': {
      const x = entryById(a.dataset.a), y = entryById(a.dataset.b); const start = Math.min(x.start, y.start), end = Math.max(x.end, y.end);
      const main = x.minutes >= y.minutes ? x : y, other = main === x ? y : x;
      const minutes = Math.round((end-start)/60000);
      openEntryEditor({...main, start, end, minutes, pausedMin:0, allocations:[...(main.allocations||[]), {clientId:other.clientId, typeId:other.typeId, minutes:Math.min(other.minutes, Math.round(minutes/2)), attention:'active', units:other.units||0}], _mergeFrom:other.id});
      UI.edit.mergeDelete = other.id; break; }
    case 'dismiss': UI.dismissed[a.dataset.k] = true; render(); break;
    case 'away-keep': UI.awayPrompt = null; render(); break;
    case 'away-drop': { const t = S.timers[S.personId]; await timerSet({pausedMs:(t.pausedMs||0) + UI.awayPrompt.minutes*60000}); UI.awayPrompt = null; toast('Away time removed'); break; }
    case 'fin-new': openFin(a.dataset.k); break;
    case 'fin-edit': openFin(a.dataset.k, id); break;
    case 'fin-save': await saveFinForm(!!a.dataset.ok); break;
    case 'fin-del': if (!a.dataset.confirm){ a.dataset.confirm='1'; a.textContent='Confirm delete'; } else await saveFinForm(false, true); break;
    case 'client-new': openClient(); break;
    case 'client-edit': openClient(id); break;
    case 'client-save': await saveClient(); break;
    case 'type-new': openType(); break;
    case 'type-edit': openType(id); break;
    case 'type-save': await saveType(); break;
    case 'pm': ev.preventDefault(); UI.pm = a.dataset.m; render(); break;
    case 'lock': await lockPeriod(a.dataset.m); break;
    case 'lock-go': { const m = a.dataset.m; await S.db.doc('payouts/'+m).set({locked:true, lockedAt:Date.now(), lockedBy:S.personId, note:$('#lk-note').value, snapshot:UI.lockSnap}); await audit('payouts', m, [{field:'locked', from:false, to:true}], $('#lk-note').value, {payoutImpact:true}); closeModal(); toast(`${monthLabel(m)} locked`); break; }
    case 'unlock': openModal(`<header><h2>Unlock ${monthLabel(a.dataset.m)}</h2><button class="btn ghost" data-act="close">Close</button></header><div class="body"><label class="field"><span>Reason (required)</span><input class="in" id="ul-reason" autofocus></label><div class="err" id="ul-err"></div></div><footer><span></span><button class="btn pri" data-act="unlock-go" data-m="${a.dataset.m}">Unlock</button></footer>`); break;
    case 'unlock-go': { const r = $('#ul-reason').value.trim(); if (!r){ $('#ul-err').textContent = 'Give a reason.'; break; } const m = a.dataset.m; await S.db.doc('payouts/'+m).update({locked:false, unlockedAt:Date.now(), unlockedBy:S.personId}); await audit('payouts', m, [{field:'locked', from:true, to:false}], r, {payoutImpact:true}); closeModal(); break; }
    case 'save-rules': await saveRules(); break;
    case 'save-timer': await saveConfig('settings', {timezone:$('#s-tz').value.trim()||'America/Los_Angeles', longTimerHours:+$('#s-long').value||3, forgottenTimerHours:+$('#s-forgot').value||10, idleMinutes:+$('#s-idle').value||30, workHours:{...S.settings.workHours, enabled:$('#s-wh').checked, start:$('#s-whs').value, end:$('#s-whe').value}}, 'Timer settings'); toast('Saved'); break;
    case 'notif': try { const p = await Notification.requestPermission(); toast(p==='granted'?'Notifications on':'Notifications not allowed in this view'); } catch { toast('Notifications are not available here'); } break;
    case 'unlink': await S.db.doc('config/people').update({items:{[id]:{userId:null}}}); await audit('people', id, [{field:'userId', from:'linked', to:null}], 'Unlinked sign-in'); break;
    case 'switch-person': lsSet('actingAs', null); S.personId = null; render(); break;
    case 'export-csv': await exportCSV(); break;
    case 'export-xlsx': await exportXLSX(); break;
    case 'src': await showSource(id); break;
  }
  } catch (e){ console.error(e); toast(e?.message || 'Something went wrong. Try again.'); }
}
async function saveRules(){
  const st = S.settings; const reason = $('#s-reason').value.trim(); const err = $('#s-err');
  const patch = {poolPct: Math.min(100, Math.max(0, +$('#s-pool').value))/100, revenueBasis:$('#s-basis').value, expenseTiming:$('#s-exp').value, annualGoal:+$('#s-goal').value||0, goalYear:+$('#s-year').value||+today().slice(0,4), approvalMode:$('#s-appr').value};
  const ca = $('#s-ca').value; if (ca !== '') patch.customAmounts = {[$('#s-cm').value]: +ca};
  const impact = patch.poolPct !== st.poolPct || patch.revenueBasis !== st.revenueBasis || patch.expenseTiming !== st.expenseTiming || patch.customAmounts;
  if (impact && !reason) return err.textContent = 'Give a reason. This changes payouts.';
  const locked = Object.values(S.payouts).filter(p => p.locked).length;
  await saveConfig('settings', patch, reason); toast(locked && impact ? 'Saved. Locked months keep their snapshots.' : 'Saved');
}
function onChange(ev){
  if (ev.target.id === 'ed-joint'){ const w = $('#ed-joint-wrap'); if (w) w.hidden = !ev.target.checked; }
  if (ev.target.id === 'st-cat' || ev.target.id === 'ed-cat'){
    const tid = ev.target.id === 'st-cat' ? 'st-type' : 'ed-type';
    const hidden = $('#'+tid), q = $('#'+tid+'-q');
    if (hidden && q){ hidden.value = ''; q.value = ''; }
    const wrap = $('#st-other-wrap'); if (wrap && tid === 'st-type') wrap.hidden = true;
  }

  const el = ev.target, id = el.id;
  if (id === 'f-person') setF({person:el.value}); else if (id === 'f-client') setF({client:el.value}); else if (id === 'f-family') setF({family:el.value}); else if (id === 'f-scope') setF({scope:el.value});
  else if (id === 'f-from') setF({from:el.value}); else if (id === 'f-to') setF({to:el.value});
  else if (id?.startsWith('tf-')){ UI.tf[id.slice(3)] = el.value; render(); }
  else if (id === 'pm'){ UI.pm = el.value; render(); }
  else if (id === 'me-month'){ UI.meMonth = el.value; render(); }
  else if (id === 'me-person'){ UI.mePerson = el.value; render(); }
  else if (id === 'af'){ UI.af = el.value; render(); }
  else if (id === 'tq'){ UI.tq = el.value; render(); }
  else if (id === 'ed-client'){ updateDur(); }
  else if (id === 'ed-type'){ const t = ttype(el.value); if (t){ $('#ed-unit').value = t.unit; $('#ed-cls').value = t.cls; $('#ed-bill').checked = defaultBillable(el.value, $('#ed-client').value); $('#ed-pay').checked = t.payoutEligible !== false; } }
  else if (id?.startsWith('ed-')) updateDur();
  else if (el.dataset.alloc){ const a = UI.edit.e.allocations[+el.dataset.alloc]; a[el.dataset.k] = el.dataset.k === 'minutes' ? Math.max(0, +el.value||0) : el.value; updateDur(); }
  else if (el.dataset.cap){ S.db.doc('config/people').update({items:{[el.dataset.cap]:{weeklyCapacity:+el.value||0}}}); }
  else if (id === 'imp-file' && el.files[0]) importFile(el.files[0]);
}
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id?.endsWith('-q') && el.closest('.combo')){ const id = el.closest('.combo').dataset.combo; comboList(id, el.value); }
  if (el.id === 'tf-q'){ clearTimeout(UI.qt); UI.qt = setTimeout(() => { UI.tf.q = el.value; render(); $('#tf-q')?.focus(); const q = $('#tf-q'); if (q) q.setSelectionRange(q.value.length, q.value.length); }, 350); }
  if (el.id === 'cmd-q') renderCmd(el.value);
});
/* the task-type list closes when you pick, click anywhere else, tab away or press Escape */
function closeCombos(except){
  for (const c of $$('.combo')){
    if (c === except) continue;
    const l = $('.list', c); if (!l || l.hidden) continue;
    l.hidden = true;
    const id = c.dataset.combo, v = $('#'+id)?.value, q = $('#'+id+'-q');
    if (q) q.value = v ? `${v} · ${typeName(v)}` : '';        // drop half-typed search text, keep the chosen type
  }
}
document.addEventListener('pointerdown', ev => { UI.downOnScrim = ev.target.classList?.contains('scrim'); }, true);
document.addEventListener('mousedown', ev => { const o = ev.target.closest('.combo .opt[data-pick]'); if (o){ ev.preventDefault(); pickType(o.dataset.pick, o.dataset.code); } }, true);
document.addEventListener('focusout', ev => { const c = ev.target.closest?.('.combo'); if (c) setTimeout(() => { if (!c.contains(document.activeElement)) closeCombos(); }, 120); });
document.addEventListener('click', ev => { const el = ev.target; if (el.id?.endsWith('-q') && el.closest('.combo') && $('.list', el.closest('.combo')).hidden){ el.select(); comboList(el.closest('.combo').dataset.combo, ''); } });
document.addEventListener('focusin', ev => { const el = ev.target; if (el.id?.endsWith('-q') && el.closest('.combo')){ el.select(); comboList(el.closest('.combo').dataset.combo, ''); } });
function onKey(ev){
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k'){ ev.preventDefault(); openCmd(); return; }
  if (ev.key === 'Escape' && $$('.combo .list').some(l => !l.hidden)){ closeCombos(); return; }
  if (ev.key === 'Escape' && UI.modal){ closeModal(); return; }
  const combo = ev.target.closest?.('.combo');
  if (combo && ev.key === 'Enter'){ ev.preventDefault(); const l = $('.list', combo); const hi = $('.opt.hi', l) || $('.opt', l); if (hi) pickType(combo.dataset.combo, hi.dataset.code); }
  if (combo && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')){ ev.preventDefault(); const opts = $$('.opt', combo); let i = opts.findIndex(o => o.classList.contains('hi')); opts[i]?.classList.remove('hi'); i = Math.max(0, Math.min(opts.length-1, i + (ev.key==='ArrowDown'?1:-1))); opts[i]?.classList.add('hi'); opts[i]?.scrollIntoView({block:'nearest'}); }
  if (UI.cmdOpen && (ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp')){ ev.preventDefault(); const opts = $$('#cmd .opt'); let i = opts.findIndex(o => o.classList.contains('hi')); if (ev.key === 'Enter'){ (opts[i] || opts[0])?.click(); return; } opts[i]?.classList.remove('hi'); i = Math.max(0, Math.min(opts.length-1, i + (ev.key==='ArrowDown'?1:-1))); opts[i]?.classList.add('hi'); }
}

/* ---------- command palette */
function cmdItems(){
  const run = S.timers[S.personId]?.running;
  return [...NAV.flatMap(([g, items]) => items.map(([id, label]) => ({label:'Go to ' + label, hint:g, fn:() => go(id)}))),
    {label: run ? 'Stop timer' : 'Start timer', hint:'Timer', fn:() => run ? stopTimer() : openStart()},
    {label:'Log past time', hint:'Timer', fn:() => openEntryEditor({personId:S.personId, date:today(), start:Date.now()-3600e3, end:Date.now(), status:'draft', source:'lucid', payoutEligible:true})},
    {label:'Add revenue', hint:'Money', fn:() => openFin('ledger')}, {label:'Add expense', hint:'Money', fn:() => openFin('expenses')},
    {label:'Export workbook', hint:'System', fn:() => exportXLSX()},
    ...Object.values(S.clients).slice(0).map(c => ({label:'Client: ' + c.name, hint:'Filter', fn:() => { setF({client:Object.keys(S.clients).find(k => S.clients[k]===c)}); go('company'); }}))];
}
function openCmd(){ UI.cmdOpen = true; openModal(`<div class="palette"><input class="in" id="cmd-q" placeholder="Jump to a page or action" autofocus style="border:0; border-bottom:1px solid var(--line); border-radius:0; padding:14px"><div id="cmd" style="max-height:50vh; overflow-y:auto"></div></div>`); renderCmd(''); }
function renderCmd(q){ q = q.toLowerCase(); UI.cmdList = cmdItems().filter(x => x.label.toLowerCase().includes(q)).slice(0, 14);
  $('#cmd').innerHTML = UI.cmdList.map((x,i) => `<div class="opt ${i===0?'hi':''}" data-act="cmd" data-i="${i}"><span>${esc(x.label)}</span><span class="muted">${esc(x.hint)}</span></div>`).join(''); }
document.addEventListener('click', ev => { const o = ev.target.closest('[data-act="cmd"]'); if (!o) return; const x = UI.cmdList[+o.dataset.i]; UI.cmdOpen = false; closeModal(); x?.fn(); }, true);

/* ClickUp sync removed for V1, spec section 4. */

function entryExportRows(){ return allEntries().map(e => ({Date:e.date, Person:person(e.personId).name, Start:e.start?timeKey(e.start):'', End:e.end?timeKey(e.end):'', Minutes:e.minutes, Hours:+hrs(e.minutes), Client:clientName(e.clientId), 'Service family':famName(famOf(e.typeId)), 'Task code':e.typeId||'', 'Task type':typeName(e.typeId), Units:e.units??'', Unit:e.unitType||'', Stage:e.stage||'', Complexity:e.complexity||'', AI:e.ai||'', Revision:e.revision??'', Billable:e.billable?'yes':'no', 'Payout eligible':e.payoutEligible!==false?'yes':'no', Class:e.cls||'', Status:e.status, Joint:e.joint?'yes':'', Splits:(e.allocations||[]).map(a => `${a.typeId} ${a.minutes}m ${a.attention}`).join('; '), Note:e.note||'', Source:e.source, 'Import ref':e.importRef||''})); }
async function saveFile(filename, data){
  if (!S.dl){ toast('Downloads aren\'t available in this view'); return; }
  try { await S.dl.save({filename, data}); } catch (e){ if (e?.code !== 'declined') toast(e?.code === 'rate_limited' ? 'A save prompt is already open' : 'Could not save the file'); }
}
async function exportCSV(){
  const rows = entryExportRows(); const cols = Object.keys(rows[0]||{Date:''});
  const q = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v; };
  await saveFile(`lucid-os-time-entries-${today()}.csv`, [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n'));
}
async function exportXLSX(){
  if (!window.XLSX){ toast('Spreadsheet library is still loading'); return; }
  const wb = XLSX.utils.book_new(); const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
  add('Time entries', entryExportRows());
  const ms = monthsIn(today().slice(0,4)+'-01-01', today());
  add('Payouts', ms.flatMap(m => { const P = payoutFor(m); return P.people.map(p => ({Month:m, Basis:BASIS_LABEL[P.basis], 'Eligible revenue':P.rev.eligible, 'Pool %':P.pct, Pool:P.pool, Partner:person(p.id).name, 'Approved hours':+hrs(p.approved), Share:+p.share.toFixed(4), Payout:p.payout, 'Per hour':r2(p.perHour), Expenses:P.expTotal, Contribution:P.contribution, Status:P.locked?'locked':P.reconstructed?'reconstructed':'open'})); }));
  add('Revenue', ledgerItems().map(l => ({Client:l.clientName||clientName(l.clientId), Type:l.revenueType, 'Invoice date':l.invoiceDate, 'Recognition date':l.recognitionDate, 'Expected date':l.expectedDate, 'Paid date':l.paidDate, Amount:l.amount, 'Paid amount':l.paidAmount, Status:STATUS_LABEL[l.status], 'Pool eligible':l.poolEligible!==false?'yes':'no', Notes:l.notes})));
  add('Contracts', contractItems().map(c => ({Client:clientName(c.clientId), Type:c.contractType, Amount:c.amount, Frequency:c.frequency, 'Billing day':c.billingDay, Start:c.start, End:c.end, Renewal:c.renewalDate, Lifecycle:c.lifecycle, 'Payments left':contractFuture(c).dates.length, 'Projected remaining':contractFuture(c).amount, Notes:c.notes})));
  add('Expenses', expenseItems().map(x => ({Vendor:x.vendor, Category:x.category, Amount:x.amount, Date:x.date, Recurring:x.recurring?'yes':'no', Frequency:x.frequency||'', Ends:x.endDate||'', Allocation:x.allocation, Client:x.clientId?clientName(x.clientId):'', Notes:x.notes, Source:x.source||''})));
  add('Task types', Object.values(S.taxonomy.types).map(t => { const b = benchmarks()[t.code]; return {Code:t.code, Family:famName(t.family), Name:t.name, Unit:t.unit, 'Planning hours':t.planHours, Source:t.source, 'Median min/unit':b?r2(b.median):'', 'P25':b?r2(b.p25):'', 'P75':b?r2(b.p75):'', Samples:b?.n||0}; }));
  add('Audit', Object.values(S.auditDocs).flatMap(d => Object.values(d.items||{})).sort((a,b)=>a.ts-b.ts).map(a => ({When:new Date(a.ts).toISOString(), Who:person(a.personId).name, Entity:a.entity, ID:a.entityId, Changes:(a.changes||[]).map(c => `${c.field}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`).join('; '), Reason:a.reason, 'Payout impact':a.payoutImpact?'yes':''})));
  const buf = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  await saveFile(`lucid-os-${today()}.xlsx`, new Blob([buf]));
}

/* ---------- import more time log rows */
async function importFile(file){
  const msg = $('#imp-msg'); if (!window.XLSX){ msg.textContent = 'Spreadsheet library is still loading.'; return; }
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {cellDates:true}); const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {raw:true, defval:null});
    const key = k => Object.keys(rows[0]||{}).find(c => c.toLowerCase().replace(/\s/g,'').startsWith(k));
    const K = {date:key('date'), name:key('name'), start:key('start'), end:key('end'), cat:key('category'), task:key('task')};
    if (!K.date || !K.name || !K.start || !K.end){ msg.textContent = 'Couldn\'t find Date, Name, Start and End columns.'; return; }
    const toDate = v => v instanceof Date ? v.toISOString().slice(0,10) : typeof v === 'number' ? new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10) : String(v||'').slice(0,10);
    const toTime = v => { if (v instanceof Date) return v.toISOString().slice(11,16); if (typeof v === 'number'){ const m = Math.round((v%1)*1440); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); } const s = String(v||'').trim(); const mm = s.match(/(\d{1,2}):(\d{2})\s*([ap]m)?/i); if (!mm) return null; let h = +mm[1]; if (mm[3]) h = h%12 + (/p/i.test(mm[3])?12:0); return String(h).padStart(2,'0')+':'+mm[2]; };
    const existing = new Set(allEntries().map(e => e.personId+'|'+e.start+'|'+e.end));
    let added = 0, skipped = 0;
    for (const r of rows){
      const d = toDate(r[K.date]), st = toTime(r[K.start]), en = toTime(r[K.end]); const pid = String(r[K.name]||'').trim().toLowerCase();
      if (!d || !st || !en || !S.people[pid]){ skipped++; continue; }
      const start = zoned(d, st); let end = zoned(d, en); if (end <= start) end = zoned(addDays(d,1), en);
      if (existing.has(pid+'|'+start+'|'+end)){ skipped++; continue; }
      const text = String(r[K.task]||''); const low = ' '+text.toLowerCase()+' ';
      const cid = Object.entries(S.clients).find(([,c]) => (c.aliases||[]).some(a => a && low.includes(a.trim())))?.[0] || null;
      const e = {id:uid('imp'), personId:pid, date:d, start, end, minutes:Math.round((end-start)/60000), clientId:cid, typeId:null, note:text, source:'import', importRef:`${file.name}`, importRaw:{category:r[K.cat]||'', task:text},
        status:'draft', needsReview:true, reviewNotes:['Imported: choose the task type'], billable:false, payoutEligible:true, joint:false};
      await upsertItem('entries', monthOf(d), e.id, e); existing.add(pid+'|'+start+'|'+end); added++;
    }
    await audit('import', file.name, [{field:'rows added', from:null, to:added}], `Imported ${file.name}`);
    msg.textContent = `Added ${added} rows as drafts in Time Log. Skipped ${skipped} (already imported or incomplete).`;
  } catch (e){ msg.textContent = 'Couldn\'t read that file: ' + (e.message||''); }
}

/* ================================================================ LS Command additions */

/* System Admin, spec section 45. Clients, Leads and Task types behind one
 * restricted door, rather than loose in the sidebar for everyone to see. */
VIEWS.admin = () => {
  if (!isAdmin()) return `<div class="head"><div><h1>System Admin</h1><p>You do not have access to this area.</p></div></div>`;
  const tab = UI.adminTab || 'clients';
  const tabs = [['clients','Clients and leads'],['tasks','Task types'],['audit','Audit log']];
  return `<div class="head"><div><h1>System Admin</h1><p>Clients, leads, task types and the change record. Admins only.</p></div></div>
  <div class="row" style="margin-bottom:14px">${tabs.map(([v,l]) =>
    `<button class="btn ${tab===v?'pri':''}" data-act="admin-tab" data-tab="${v}">${l}</button>`).join('')}</div>
  <div>${(VIEWS[tab] ? VIEWS[tab]() : '')}</div>`;
};
VIEWS.admin.after = () => { const t = UI.adminTab || 'clients'; VIEWS[t]?.after?.(); };

/* Company Projections, spec section 31. Forward-looking only: what is already
 * contracted, what it costs to run, and what that leaves. Nothing invented. */
VIEWS.projections = () => {
  if (!isAdmin()) return `<div class="head"><div><h1>Company Projections</h1><p>You do not have access to this area.</p></div></div>`;
  const rr = runRate();
  const months = [];
  let m = monthOf(today());
  for (let i = 0; i < 6; i++){ months.push(m); m = addMonths(m, 1); }
  const rows = months.map(mm => {
    const exp = expensesIn(mm+'-01', monthEnd(mm));
    const expTotal = r2(sum(exp, x => x.amount));
    const rev = r2(rr.recurringMonthly || 0);
    return {m: mm, rev, expTotal, net: r2(rev - expTotal)};
  });
  const anyExp = rows.some(r => r.expTotal > 0);
  return `<div class="head"><div><h1>Company Projections</h1><p>Six months ahead, from active contracts with a fixed billing cycle. Commission and per-deliverable work is excluded rather than estimated.</p></div></div>
  <div class="panel"><div class="tw"><table>
    <thead><tr><th>Month</th><th class="r">Expected revenue</th><th class="r">Expected costs</th><th class="r">Net</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${monthLabel(r.m)}</td><td class="r num">${money2(r.rev)}</td>
      <td class="r num">${anyExp ? money2(r.expTotal) : '<span class="muted">Insufficient data</span>'}</td>
      <td class="r num">${anyExp ? money2(r.net) : '<span class="muted">–</span>'}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
};

/* Tasks, spec sections 27 and 28. Work that is open, and work anyone can pick up.
 * Kept off the personal Dashboard on purpose so that page stays usable. */
VIEWS.board = () => {
  const open = allEntries().filter(e => e.completed === false && !e.deleted)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const mine = open.filter(e => e.personId === S.personId);
  const rest = open.filter(e => e.personId !== S.personId);
  const table = (list, empty) => list.length ? `<div class="tw"><table>
      <thead><tr><th>Task</th><th>Client or lead</th><th>Category</th><th>Owner</th><th>Last worked</th></tr></thead>
      <tbody>${list.slice(0,80).map(e => `<tr>
        <td><b>${esc(e.taskName || typeName(e.typeId))}</b></td>
        <td>${esc(e.scope === 'internal' || e.clientId === 'internal' ? 'Internal' : clientName(e.clientId))}</td>
        <td>${esc(e.category || '–')}</td>
        <td>${esc(person(e.personId).name)}</td>
        <td class="num">${dateLabel(e.date)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="muted">${empty}</div>`;
  return `<div class="head"><div><h1>Tasks</h1><p>Anything stopped without being marked finished. Pick one up and start a timer on it.</p></div></div>
  <div class="stack">
    <div class="panel"><h3>Yours to finish <span class="chip ${mine.length?'warn':'good'}">${mine.length || 'Clear'}</span></h3>${table(mine, 'Nothing of yours is open.')}</div>
    <div class="panel"><h3>Open across the team <span class="muted">${rest.length}</span></h3>${table(rest, 'Nothing open elsewhere.')}</div>
  </div>`;
};
