'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { useAction } from './useAction';
import { promoteCustomTask, saveCategory, saveTaskType } from '@/app/actions/admin';
import { ELIG_LABEL, ENTITY_LABEL, minutesLabel, REL_HELP, REL_LABEL, SOURCE_LABEL } from '@/lib/format';
import type { Category, EntityKind, Eligibility, TaskType } from '@/lib/types';

interface Usage { byType: Record<string, number>; byCat: Record<string, number>; custom: Array<{ name: string; category_id: string; count: number; last: string }> }

export default function TaxonomyAdmin({ categories, taskTypes, usage }: { categories: Category[]; taskTypes: TaskType[]; usage: Usage }) {
  const [filter, setFilter] = useState<'all' | Eligibility>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editTask, setEditTask] = useState<Partial<TaskType> | null>(null);
  const [promote, setPromote] = useState<Usage['custom'][number] | null>(null);

  const query = q.trim().toLowerCase();
  const cats = useMemo(() => categories
    .filter((c) => showArchived || c.active)
    .filter((c) => filter === 'all' || c.eligibility === filter)
    .filter((c) => !query || c.name.toLowerCase().includes(query) || taskTypes.some((t) => t.category_id === c.id && t.name.toLowerCase().includes(query)))
    .sort((a, b) => a.sort_order - b.sort_order), [categories, taskTypes, filter, showArchived, query]);

  const withEstimate = taskTypes.filter((t) => t.active && t.expected_minutes != null).length;
  const measured = taskTypes.filter((t) => t.active && t.expected_source === 'measured').length;
  const activeTypes = taskTypes.filter((t) => t.active).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpis">
        <div className="kpi"><div className="label">Categories</div><div className="value">{categories.filter((c) => c.active).length}</div>
          <div className="sub">{(['internal', 'external', 'both'] as Eligibility[]).map((e) => `${categories.filter((c) => c.active && c.eligibility === e).length} ${ELIG_LABEL[e].toLowerCase()}`).join(' · ')}</div></div>
        <div className="kpi"><div className="label">Task types</div><div className="value">{activeTypes}</div><div className="sub">{taskTypes.length - activeTypes} archived</div></div>
        <div className="kpi"><div className="label">With expected time</div><div className="value">{activeTypes ? Math.round((withEstimate / activeTypes) * 100) : 0}%</div><div className="sub">{measured} measured, {withEstimate - measured} other sources</div></div>
        <div className="kpi"><div className="label">Unlisted tasks to review</div><div className="value">{usage.custom.length}</div><div className="sub">typed in by the team</div></div>
      </div>

      {usage.custom.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Unlisted tasks</h2><p>Work logged with &quot;Not listed&quot;. Add it to the taxonomy so it gets an expected time and shows up in analytics.</p></div></div>
          <div className="table-wrap"><table className="data"><tbody>
            {usage.custom.map((c) => (
              <tr key={c.category_id + c.name}>
                <td className="primary">{c.name}<span className="sub">{categories.find((x) => x.id === c.category_id)?.name}</span></td>
                <td className="n">{c.count} entr{c.count === 1 ? 'y' : 'ies'}</td>
                <td style={{ width: 1 }}><button className="btn sm" onClick={() => setPromote(c)}>Add to taxonomy</button></td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      )}

      <div className="toolbar">
        <div className="seg">
          {(['all', 'external', 'internal', 'both'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : ELIG_LABEL[f]}</button>
          ))}
        </div>
        <input type="search" placeholder="Search categories and tasks" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <label className="check small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        <span className="spacer" />
        <button className="btn" onClick={() => setEditTask({ active: true, eligibility: 'external', has_deliverable: false, quick_start: false })}>New task</button>
        <button className="btn primary" onClick={() => setEditCat({ active: true, eligibility: 'internal', contexts: [], revenue_relationship: 'operational' })}>New category</button>
      </div>

      <div className="panel">
        {cats.map((c) => {
          const tasks = taskTypes.filter((t) => t.category_id === c.id && (showArchived || t.active))
            .filter((t) => !query || c.name.toLowerCase().includes(query) || t.name.toLowerCase().includes(query))
            .sort((a, b) => (a.service_line ?? '').localeCompare(b.service_line ?? '') || a.sort_order - b.sort_order);
          const open = openCat === c.id || !!query;
          return (
            <div key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
              <div className="row" style={{ padding: '14px 20px', cursor: 'pointer', opacity: c.active ? 1 : 0.55 }} onClick={() => setOpenCat(open && !query ? null : c.id)}>
                <span className="muted" style={{ width: 14 }}>{open ? '▾' : '▸'}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ fontFamily: 'var(--f-display)', fontSize: 15 }}>{c.name}</b>{!c.active && <span className="tag" style={{ marginLeft: 8 }}>Archived</span>}
                  <div className="muted small">{c.description}</div>
                </div>
                <span className={`tag ${c.eligibility === 'internal' ? 'int' : c.eligibility === 'external' ? 'ext' : 'navy'}`}>{ELIG_LABEL[c.eligibility]}</span>
                {c.contexts.length > 0 && <span className="tag">{c.contexts.map((k) => ENTITY_LABEL[k]).join(', ')}</span>}
                <span className="tag" title={REL_HELP[c.revenue_relationship]}>{REL_LABEL[c.revenue_relationship]}</span>
                <span className="muted small nowrap" style={{ width: 120, textAlign: 'right' }}>{tasks.length} tasks · {usage.byCat[c.id] ?? 0} logs</span>
                <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setEditCat(c); }}>Edit</button>
              </div>
              {open && (
                <div style={{ background: 'var(--panel-2)', padding: '4px 0 12px' }}>
                  <table className="data">
                    <thead><tr><th style={{ paddingLeft: 48 }}>Task</th><th>Eligibility</th><th>Deliverable</th><th className="n">Expected</th><th>Source</th><th className="n">Logs</th><th /></tr></thead>
                    <tbody>
                      {tasks.map((t) => (
                        <tr key={t.id} className={t.active ? '' : 'dim'}>
                          <td className="primary" style={{ paddingLeft: 48 }}>{t.name}
                            <span className="sub">{t.code}{t.service_line ? ` · ${t.service_line}` : ''}{t.quick_start ? ' · Quick Start' : ''}{!t.active ? ' · archived' : ''}</span></td>
                          <td>{ELIG_LABEL[t.eligibility]}</td>
                          <td>{t.has_deliverable ? `per ${t.deliverable_unit}` : <span className="muted">None</span>}</td>
                          <td className="n">{t.expected_minutes != null ? minutesLabel(t.expected_minutes) : <span className="muted">Not set</span>}</td>
                          <td>{t.expected_source ? <span className={`tag ${t.expected_source === 'measured' ? 'good' : ''}`}>{SOURCE_LABEL[t.expected_source]}</span> : null}</td>
                          <td className="n">{usage.byType[t.id] ?? 0}</td>
                          <td style={{ width: 1 }}><button className="btn ghost sm" onClick={() => setEditTask(t)}>Edit</button></td>
                        </tr>
                      ))}
                      <tr><td colSpan={7} style={{ paddingLeft: 48 }}>
                        <button className="btn sm" onClick={() => setEditTask({ category_id: c.id, eligibility: c.eligibility, active: true, has_deliverable: false, quick_start: false })}>Add task to {c.name}</button>
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {cats.length === 0 && <div className="empty"><p>No categories match.</p></div>}
      </div>

      {editCat && <CategoryForm initial={editCat} usage={editCat.id ? usage.byCat[editCat.id] ?? 0 : 0} onClose={() => setEditCat(null)} />}
      {editTask && <TaskForm initial={editTask} categories={categories} usage={editTask.id ? usage.byType[editTask.id] ?? 0 : 0} onClose={() => setEditTask(null)} />}
      {promote && <PromoteForm item={promote} categories={categories} onClose={() => setPromote(null)} />}
    </div>
  );
}

function CategoryForm({ initial, usage, onClose }: { initial: Partial<Category>; usage: number; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({
    name: initial.name ?? '', description: initial.description ?? '', eligibility: (initial.eligibility ?? 'internal') as Eligibility,
    contexts: (initial.contexts ?? []) as EntityKind[], revenue_relationship: initial.revenue_relationship ?? 'operational', active: initial.active ?? true,
  });
  const toggleCtx = (k: EntityKind) => setV({ ...v, contexts: v.contexts.includes(k) ? v.contexts.filter((x) => x !== k) : [...v.contexts, k] });
  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'New category'} onClose={onClose} error={error}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveCategory({ id: initial.id, ...v }), onClose)}>Save</button>
      </>}>
      <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="field"><span>Definition <span className="hint">what belongs here, in one sentence</span></span>
        <input type="text" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
      <div className="field"><span>Eligibility <span className="hint">Both means the same work happens for clients and for Lucid itself</span></span>
        <div className="seg">
          {(['internal', 'external', 'both'] as Eligibility[]).map((e) => (
            <button key={e} type="button" aria-pressed={v.eligibility === e}
              onClick={() => setV({ ...v, eligibility: e, contexts: e === 'internal' ? [] : v.contexts.length ? v.contexts : ['client'] })}>{ELIG_LABEL[e]}</button>
          ))}
        </div>
      </div>
      {v.eligibility !== 'internal' && (
        <div className="field"><span>Applies to <span className="hint">which external relationships can use it</span></span>
          <div className="row">
            {(['client', 'prospect', 'partner'] as EntityKind[]).map((k) => (
              <label key={k} className="check"><input type="checkbox" checked={v.contexts.includes(k)} onChange={() => toggleCtx(k)} /> {ENTITY_LABEL[k]}</label>
            ))}
          </div>
        </div>
      )}
      <label className="field"><span>Revenue relationship</span>
        <select value={v.revenue_relationship} onChange={(e) => setV({ ...v, revenue_relationship: e.target.value as Category['revenue_relationship'] })}>
          {Object.keys(REL_LABEL).map((k) => <option key={k} value={k}>{REL_LABEL[k]}: {REL_HELP[k]}</option>)}
        </select>
        <span className="hint">Internal entries are never counted as direct revenue, even in a Both category.</span>
      </label>
      {initial.id && (
        <label className="check"><input type="checkbox" checked={!v.active} onChange={(e) => setV({ ...v, active: !e.target.checked })} />
          Archived <span className="hint">{usage ? `${usage} logs keep their history; it just stops appearing when logging` : 'hidden from logging'}</span></label>
      )}
    </Modal>
  );
}

function TaskForm({ initial, categories, usage, onClose }: { initial: Partial<TaskType>; categories: Category[]; usage: number; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState({
    category_id: initial.category_id ?? '', name: initial.name ?? '', description: initial.description ?? '',
    eligibility: (initial.eligibility ?? 'external') as Eligibility, revenue_relationship: initial.revenue_relationship ?? '',
    service_line: initial.service_line ?? '', has_deliverable: initial.has_deliverable ?? false, deliverable_unit: initial.deliverable_unit ?? '',
    expected: initial.expected_minutes != null ? String(initial.expected_minutes) : '', expected_unit: 'min' as 'min' | 'h',
    expected_source: initial.expected_source ?? (initial.expected_minutes != null ? 'estimate' : ''),
    quick_start: initial.quick_start ?? false, active: initial.active ?? true,
  });
  const cat = categories.find((c) => c.id === v.category_id);
  const allowed: Eligibility[] = !cat ? ['internal', 'external', 'both'] : cat.eligibility === 'both' ? ['internal', 'external', 'both'] : [cat.eligibility];
  const minutes = v.expected === '' ? null : Number(v.expected) * (v.expected_unit === 'h' ? 60 : 1);

  return (
    <Modal title={initial.id ? `Edit ${initial.name}` : 'New task'} onClose={onClose} error={error} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveTaskType({
          id: initial.id, category_id: v.category_id, name: v.name, description: v.description, eligibility: allowed.includes(v.eligibility) ? v.eligibility : allowed[0],
          revenue_relationship: v.revenue_relationship || null, service_line: v.service_line, has_deliverable: v.has_deliverable,
          deliverable_unit: v.deliverable_unit, expected_minutes: minutes, expected_source: v.expected_source || null,
          quick_start: v.quick_start, active: v.active,
        }), onClose)}>Save</button>
      </>}>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Name</span><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="For example Reel edit (manual)" /></label>
        <label className="field"><span>Category</span>
          <select value={v.category_id} onChange={(e) => {
            const c = categories.find((x) => x.id === e.target.value);
            setV({ ...v, category_id: e.target.value, eligibility: c && c.eligibility !== 'both' ? c.eligibility : v.eligibility });
          }}>
            <option value="">Choose a category</option>
            {(['external', 'both', 'internal'] as Eligibility[]).map((g) => (
              <optgroup key={g} label={ELIG_LABEL[g]}>
                {categories.filter((c) => c.eligibility === g && (c.active || c.id === v.category_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field"><span>Eligibility</span>
          <div className="seg">
            {allowed.map((e) => <button key={e} type="button" aria-pressed={v.eligibility === e || allowed.length === 1} onClick={() => setV({ ...v, eligibility: e })}>{ELIG_LABEL[e]}</button>)}
          </div>
          {cat && cat.eligibility !== 'both' && <span className="hint">Set by the category: a task can never be broader than its category.</span>}
        </div>
        <label className="field"><span>Service line <span className="hint">optional grouping, such as Web or Email</span></span>
          <input type="text" value={v.service_line} onChange={(e) => setV({ ...v, service_line: e.target.value })} /></label>
      </div>
      <label className="field"><span>Revenue relationship</span>
        <select value={v.revenue_relationship} onChange={(e) => setV({ ...v, revenue_relationship: e.target.value })}>
          <option value="">Same as category{cat ? ` (${REL_LABEL[cat.revenue_relationship]})` : ''}</option>
          {Object.keys(REL_LABEL).map((k) => <option key={k} value={k}>{REL_LABEL[k]}</option>)}
        </select>
      </label>

      <div className="panel pad" style={{ background: 'var(--panel-2)', display: 'grid', gap: 12 }}>
        <label className="check"><input type="checkbox" checked={v.has_deliverable} onChange={(e) => setV({ ...v, has_deliverable: e.target.checked, deliverable_unit: e.target.checked ? v.deliverable_unit : '' })} />
          Has a discrete deliverable <span className="hint">people enter a count when they finish; the unit is fixed here, never typed while logging</span></label>
        {v.has_deliverable && (
          <label className="field"><span>Deliverable unit <span className="hint">singular: email, post, graphic, reel, video, shot, carousel, newsletter, proposal</span></span>
            <input type="text" value={v.deliverable_unit} onChange={(e) => setV({ ...v, deliverable_unit: e.target.value })} style={{ maxWidth: 220 }} /></label>
        )}
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><span>Expected time {v.has_deliverable && v.deliverable_unit ? `per ${v.deliverable_unit}` : 'per finished task'}</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="number" min={0} step="any" value={v.expected} onChange={(e) => setV({ ...v, expected: e.target.value })} placeholder="Not set" />
              <div className="seg">{(['min', 'h'] as const).map((u) => <button key={u} type="button" aria-pressed={v.expected_unit === u} onClick={() => setV({ ...v, expected_unit: u })}>{u}</button>)}</div>
            </div>
          </div>
          <label className="field"><span>Source</span>
            <select value={v.expected_source} onChange={(e) => setV({ ...v, expected_source: e.target.value as TaskType['expected_source'] & string })}>
              <option value="">Choose</option>
              {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span className="hint">Prefer Measured: a timed trial beats a guess.</span>
          </label>
        </div>
        {initial.expected_updated_at && <span className="hint">Expected time last changed {new Date(initial.expected_updated_at).toLocaleDateString()}.</span>}
      </div>

      <label className="check"><input type="checkbox" checked={v.quick_start} onChange={(e) => setV({ ...v, quick_start: e.target.checked })} />
        Quick Start <span className="hint">a small, frequently repeated deliverable worth one-click starts</span></label>
      {initial.id && (
        <label className="check"><input type="checkbox" checked={!v.active} onChange={(e) => setV({ ...v, active: !e.target.checked })} />
          Archived <span className="hint">{usage ? `${usage} logs keep their history and name` : 'hidden from logging'}; nothing referenced is ever deleted</span></label>
      )}
    </Modal>
  );
}

function PromoteForm({ item, categories, onClose }: { item: Usage['custom'][number]; categories: Category[]; onClose: () => void }) {
  const { run, busy, error } = useAction();
  const cat = categories.find((c) => c.id === item.category_id);
  const [name, setName] = useState(item.name);
  const [elig, setElig] = useState<Eligibility>(cat?.eligibility === 'both' ? 'both' : cat?.eligibility ?? 'external');
  return (
    <Modal title="Add to taxonomy" onClose={onClose} error={error}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => run(() => promoteCustomTask({ custom_name: item.name, category_id: item.category_id, name, eligibility: elig }), onClose)}>Create task and link {item.count} entr{item.count === 1 ? 'y' : 'ies'}</button>
      </>}>
      <p className="muted">Creates a task in <b>{cat?.name}</b> and points the {item.count} matching entr{item.count === 1 ? 'y' : 'ies'} at it. Set its expected time afterwards.</p>
      <label className="field"><span>Task name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {cat?.eligibility === 'both' && (
        <div className="field"><span>Eligibility</span><div className="seg">
          {(['internal', 'external', 'both'] as Eligibility[]).map((e) => <button key={e} type="button" aria-pressed={elig === e} onClick={() => setElig(e)}>{ELIG_LABEL[e]}</button>)}
        </div></div>
      )}
    </Modal>
  );
}
