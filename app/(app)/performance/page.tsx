import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { loadCatalog, loadEntries } from '@/lib/data';
import { fmtDate, laDate, resolveRange, weekStart, addDays } from '@/lib/time';
import { completedWorkItems, counts, entrySeconds, groupSeconds, varianceSummary, ON_TARGET } from '@/lib/work';
import { describe } from '@/lib/describe';
import { hours, minutesLabel, pct, REL_LABEL } from '@/lib/format';
import { categoriesForFilter, unitLabel } from '@/lib/taxonomy';
import { ParamSelect, ParamSeg, RangePicker } from '@/components/controls';
import { Columns, Heatmap, HeatLegend } from '@/components/charts';
import HBars from '@/components/HBars';
import type { RevenueRel, WorkType } from '@/lib/types';

export const metadata: Metadata = { title: 'Performance' };
type SP = Record<string, string | undefined>;

const REL_COLOR: Record<RevenueRel, string> = { direct: 'var(--rel-direct)', pipeline: 'var(--rel-pipeline)', operational: 'var(--rel-operational)' };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePerson();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to, 'month');
  const wt = (sp.wt === 'internal' || sp.wt === 'external' ? sp.wt : 'all') as WorkType | 'all';
  const [catalog, raw] = await Promise.all([loadCatalog(), loadEntries(range)]);
  const types = new Map(catalog.taskTypes.map((t) => [t.id, t]));

  const all = raw.filter((e) =>
    (wt === 'all' || e.work_type === wt) && (!sp.person || e.person_id === sp.person) && (!sp.client || e.client_id === sp.client));
  const live = all.filter(counts);
  const totalSecs = live.reduce((a, e) => a + entrySeconds(e), 0);
  const ext = live.filter((e) => e.work_type === 'external').reduce((a, e) => a + entrySeconds(e), 0);
  const rel = groupSeconds(live, (e) => (e.revenue_relationship ?? 'operational') as RevenueRel);
  const ai = live.filter((e) => e.ai_assisted).reduce((a, e) => a + entrySeconds(e), 0);
  const items = completedWorkItems(all, types);
  const vs = varianceSummary(items);

  // ---------------------------------------------------------------- per person
  const people = catalog.people.filter((p) => live.some((e) => e.person_id === p.id) || (p.active && !sp.person));
  const days = Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1);
  const personRows = people.map((p) => {
    const pe = live.filter((e) => e.person_id === p.id);
    const secs = pe.reduce((a, e) => a + entrySeconds(e), 0);
    const r = groupSeconds(pe, (e) => (e.revenue_relationship ?? 'operational') as RevenueRel);
    const pi = items.filter((i) => i.personId === p.id);
    const v = varianceSummary(pi);
    const cap = p.weekly_capacity_hours ? Number(p.weekly_capacity_hours) * 3600 * (days / 7) : null;
    return {
      p, secs, cap,
      ext: pe.filter((e) => e.work_type === 'external').reduce((a, e) => a + entrySeconds(e), 0),
      rel: r, finished: pi.length, deliverables: pe.reduce((a, e) => a + (e.deliverable_qty ?? 0), 0),
      ai: pe.filter((e) => e.ai_assisted).reduce((a, e) => a + entrySeconds(e), 0), v,
      clients: new Set(pe.map((e) => e.client_id).filter(Boolean)).size,
    };
  }).sort((a, b) => b.secs - a.secs);

  // ---------------------------------------------------------------- distributions
  const byCat = [...groupSeconds(live, (e) => e.category_id)].sort((a, b) => b[1] - a[1]);
  const byClient = [...groupSeconds(live.filter((e) => e.entity_kind === 'client'), (e) => e.client_id!)].sort((a, b) => b[1] - a[1]);
  const catName = (id: string) => catalog.categories.find((c) => c.id === id)?.name ?? 'Unknown';
  const topCats = byCat.slice(0, 10).map(([id]) => id);
  const heat: Record<string, Record<string, number>> = {};
  for (const e of live) {
    if (!topCats.includes(e.category_id)) continue;
    heat[e.person_id] ??= {};
    heat[e.person_id][e.category_id] = (heat[e.person_id][e.category_id] ?? 0) + entrySeconds(e) / 3600;
  }

  // Weekly time by revenue relationship.
  const weeks: string[] = [];
  for (let w = weekStart(range.from); w <= range.to; w = addDays(w, 7)) weeks.push(w);
  const weekly = weeks.map((w) => {
    const inW = live.filter((e) => { const d = laDate(e.started_at); return d >= w && d < addDays(w, 7); });
    const g = groupSeconds(inW, (e) => (e.revenue_relationship ?? 'operational') as RevenueRel);
    return { label: fmtDate(w), values: { direct: (g.get('direct') ?? 0) / 3600, pipeline: (g.get('pipeline') ?? 0) / 3600, operational: (g.get('operational') ?? 0) / 3600 } };
  });

  // ---------------------------------------------------------------- task variance
  const byTask = new Map<string, typeof items>();
  for (const i of items) if (i.taskTypeId && i.expectedMinutes) byTask.set(i.taskTypeId, [...(byTask.get(i.taskTypeId) ?? []), i]);
  const taskRows = [...byTask.entries()].map(([id, list]) => ({ t: types.get(id)!, v: varianceSummary(list), list }))
    .filter((r) => r.t).sort((a, b) => Math.abs(b.v.ratio ?? 0) * b.v.n - Math.abs(a.v.ratio ?? 0) * a.v.n);

  const cats = categoriesForFilter(catalog.categories, wt);
  void cats;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Insight</div>
          <h1>Team Performance</h1>
          <p className="lede">Where the team&apos;s time goes and how it compares to what tasks are expected to take. Built for workload, capacity and estimate accuracy, not for ranking people.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <RangePicker value={range.key} from={range.from} to={range.to} keys={['week', 'month', 'last_month', '90d', 'ytd', 'custom']} />
        <div className="toolbar">
          <ParamSelect name="person" label="Person" value={sp.person ?? ''} allLabel="Everyone" options={catalog.people.map((p) => ({ value: p.id, label: p.name }))} />
          <ParamSeg name="wt" value={wt === 'all' ? '' : wt} clears={['client']}
            options={[{ value: '', label: 'All work' }, { value: 'internal', label: 'Internal' }, { value: 'external', label: 'External' }]} />
          {wt !== 'internal' && (
            <ParamSelect name="client" label="Client" value={sp.client ?? ''} allLabel="All clients"
              options={catalog.clients.map((c) => ({ value: c.id, label: c.name, group: c.active ? 'Active' : 'Former' }))} />
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Total logged</div><div className="value">{hours(totalSecs)}</div><div className="sub">{range.label}</div></div>
        <div className="kpi"><div className="label">External</div><div className="value">{totalSecs ? pct(ext / totalSecs) : 'N/A'}</div><div className="sub">{hours(ext)} · internal {hours(totalSecs - ext)}</div></div>
        <div className="kpi"><div className="label">Direct revenue work</div><div className="value">{totalSecs ? pct((rel.get('direct') ?? 0) / totalSecs) : 'N/A'}</div><div className="sub">pipeline {totalSecs ? pct((rel.get('pipeline') ?? 0) / totalSecs) : 'N/A'}</div></div>
        <div className="kpi"><div className="label">Within expected time</div><div className="value">{vs.withinPct == null ? 'N/A' : pct(vs.withinPct)}</div><div className="sub">{vs.n ? `${vs.n} finished tasks with an estimate` : 'No finished tasks with an estimate yet'}</div></div>
        <div className="kpi"><div className="label">AI assisted</div><div className="value">{totalSecs ? pct(ai / totalSecs) : 'N/A'}</div><div className="sub">of logged time</div></div>
      </div>

      {totalSecs === 0 ? (
        <div className="panel"><div className="empty"><h3>No logged time in this view</h3><p>Performance fills in as the team logs time. Widen the range or clear filters. October 1, 2026 is the clean baseline for these figures.</p></div></div>
      ) : (<>
        <section className="panel">
          <div className="panel-head"><div><h2>Team comparison</h2><p>Capacity is weekly capacity prorated to this range. Variance compares finished work to its expected time.</p></div></div>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Person</th><th className="n">Logged</th><th className="n">Of capacity</th><th>Time mix</th><th className="n">External</th><th className="n">Clients</th><th className="n">Finished</th><th className="n">Deliverables</th><th className="n">Within expected</th><th className="n">Avg variance</th><th className="n">AI</th></tr></thead>
            <tbody>
              {personRows.map((r) => (
                <tr key={r.p.id}>
                  <td className="primary">{r.p.name}<span className="sub">{r.p.title ?? ''}</span></td>
                  <td className="n strong">{hours(r.secs)}</td>
                  <td className="n">{r.cap ? pct(r.secs / r.cap) : 'N/A'}</td>
                  <td style={{ minWidth: 140 }}>
                    {r.secs > 0 ? (
                      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2, background: 'var(--panel-2)' }} title={(['direct', 'pipeline', 'operational'] as RevenueRel[]).map((k) => `${REL_LABEL[k]} ${hours(r.rel.get(k) ?? 0)}`).join(' · ')}>
                        {(['direct', 'pipeline', 'operational'] as RevenueRel[]).map((k) => (r.rel.get(k) ?? 0) > 0 && (
                          <div key={k} style={{ width: `${((r.rel.get(k) ?? 0) / r.secs) * 100}%`, background: REL_COLOR[k] }} />
                        ))}
                      </div>
                    ) : <span className="muted">No time</span>}
                  </td>
                  <td className="n">{r.secs ? pct(r.ext / r.secs) : 'N/A'}</td>
                  <td className="n">{r.clients}</td>
                  <td className="n">{r.finished}</td>
                  <td className="n">{r.deliverables}</td>
                  <td className="n">{r.v.withinPct == null ? <span className="muted">N/A</span> : pct(r.v.withinPct)}</td>
                  <td className="n">{r.v.ratio == null ? <span className="muted">N/A</span> : <span className={`tag ${r.v.ratio > ON_TARGET ? 'crit' : r.v.ratio < -ON_TARGET ? 'good' : ''}`}>{r.v.ratio >= 0 ? '+' : ''}{pct(r.v.ratio)}</span>}</td>
                  <td className="n">{r.secs ? pct(r.ai / r.secs) : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="panel-foot legend">
            {(['direct', 'pipeline', 'operational'] as RevenueRel[]).map((k) => <span key={k}><i style={{ background: REL_COLOR[k] }} />{REL_LABEL[k]}</span>)}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>Revenue-producing vs overhead, by week</h2><p>Hours by the revenue relationship of the task. A growing gray band means overhead is growing.</p></div></div>
          <div className="panel-body">
            <Columns format="hours" data={weekly} series={[
              { key: 'direct', label: REL_LABEL.direct, color: REL_COLOR.direct },
              { key: 'pipeline', label: REL_LABEL.pipeline, color: REL_COLOR.pipeline },
              { key: 'operational', label: REL_LABEL.operational, color: REL_COLOR.operational },
            ]} />
            <div className="legend" style={{ marginTop: 8 }}>
              {(['direct', 'pipeline', 'operational'] as RevenueRel[]).map((k) => <span key={k}><i style={{ background: REL_COLOR[k] }} />{REL_LABEL[k]}</span>)}
            </div>
          </div>
        </section>

        <div className="grid-2">
          <section className="panel">
            <div className="panel-head"><div><h2>Time by category</h2><p>{wt === 'all' ? 'Internal and external categories' : wt === 'internal' ? 'Internal categories only' : 'External categories only'}</p></div></div>
            <div className="panel-body">
              <HBars rows={byCat.slice(0, 12).map(([id, s]) => {
                const c = catalog.categories.find((x) => x.id === id);
                return { key: id, label: c?.name ?? 'Unknown', value: s, display: hours(s), sub: totalSecs ? pct(s / totalSecs) : undefined, color: c?.eligibility === 'internal' ? 'var(--int)' : 'var(--ext)' };
              })} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Time by client</h2><p>Client work only. Prospects and partners are not clients.</p></div></div>
            <div className="panel-body">
              <HBars empty={wt === 'internal' ? 'Internal work has no client.' : 'No client time in this range.'}
                rows={byClient.slice(0, 12).map(([id, s]) => {
                  const c = catalog.clients.find((x) => x.id === id);
                  return { key: id, label: c?.name ?? 'Unknown', value: s, display: hours(s), color: c?.brand_color ?? 'var(--ext)' };
                })} />
            </div>
          </section>
        </div>

        {topCats.length > 0 && personRows.length > 0 && (
          <section className="panel">
            <div className="panel-head"><div><h2>Specialization map</h2><p>Hours per person in the ten busiest categories. Darker means more time.</p></div><HeatLegend /></div>
            <div className="panel-body">
              <Heatmap format="hours" rowLabelWidth={110}
                rows={personRows.filter((r) => r.secs > 0).map((r) => ({ key: r.p.id, label: r.p.name }))}
                cols={topCats.map((id) => ({ key: id, label: catName(id) }))}
                data={heat} />
              <p className="muted small" style={{ marginTop: 8 }}>Columns, left to right: {topCats.map(catName).join(', ')}.</p>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-head"><div><h2>Expected vs actual, by task</h2><p>Finished work only, all sessions on a task combined. On target means within {Math.round(ON_TARGET * 100)}% of expected.</p></div></div>
          {taskRows.length ? (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Task</th><th className="n">Finished</th><th className="n">Expected</th><th className="n">Actual</th><th style={{ minWidth: 200 }}>Variance</th><th className="n">On target</th></tr></thead>
              <tbody>
                {taskRows.slice(0, 20).map(({ t, v, list }) => {
                  const r = v.ratio ?? 0;
                  const per = t.has_deliverable ? list.reduce((a, i) => a + (i.qty ?? 0), 0) : list.length;
                  return (
                    <tr key={t.id}>
                      <td className="primary">{t.name}<span className="sub">{catName(t.category_id)}{t.has_deliverable ? ` · per ${t.deliverable_unit}` : ''}</span></td>
                      <td className="n">{v.n}{t.has_deliverable && <span className="sub">{per} {unitLabel(t.deliverable_unit, per)}</span>}</td>
                      <td className="n">{minutesLabel(v.expectedMin / Math.max(1, per))}<span className="sub">{t.expected_source}</span></td>
                      <td className="n">{minutesLabel(v.actualMin / Math.max(1, per))}</td>
                      <td>
                        <div style={{ position: 'relative', height: 14 }}>
                          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--ink-4)' }} />
                          <div style={{
                            position: 'absolute', top: 3, height: 8, borderRadius: 4,
                            left: r < 0 ? `${50 + Math.max(-50, r * 50)}%` : '50%', width: `${Math.min(50, Math.abs(r) * 50)}%`,
                            background: r > ON_TARGET ? 'var(--crit)' : r < -ON_TARGET ? 'var(--good)' : 'var(--neutral)',
                          }} />
                        </div>
                        <span className="small strong">{r >= 0 ? '+' : ''}{pct(r)}</span>
                      </td>
                      <td className="n">{v.withinPct == null ? 'N/A' : pct(v.withinPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <div className="empty"><h3>Not enough finished work yet</h3><p>When tasks with an expected time are marked Finished, this shows which ones run long and which run efficiently. Bars right of center ran over.</p></div>}
        </section>

        {(() => {
          const custom = live.filter((e) => !e.task_type_id);
          if (!custom.length) return null;
          return <div className="notice">{custom.length} entr{custom.length === 1 ? 'y uses' : 'ies use'} an unlisted task, e.g. &quot;{describe(catalog, custom[0]).task}&quot;. Admins can add these to the taxonomy so they are measured.</div>;
        })()}
      </>)}
    </div>
  );
}
