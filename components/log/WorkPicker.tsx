'use client';

import { useMemo } from 'react';
import { categoriesFor, CONTEXT_ORDER, tasksFor } from '@/lib/taxonomy';
import { minutesLabel, SOURCE_LABEL } from '@/lib/format';
import type { Catalog, EntityKind, TaskType, WorkType } from '@/lib/types';

export interface WorkState {
  work_type: WorkType | null;
  entity_kind: EntityKind | null;
  entity_id: string;
  category_id: string;
  task_type_id: string;
  custom_task_name: string;
  other: boolean;
}

export const emptyWork = (wt: WorkType | null = null): WorkState => ({
  work_type: wt, entity_kind: null, entity_id: '', category_id: '', task_type_id: '', custom_task_name: '', other: false,
});

export function isComplete(w: WorkState) {
  if (!w.work_type || !w.category_id) return false;
  if (w.work_type === 'external') {
    if (!w.entity_kind) return false;
    if (w.entity_kind === 'client' && !w.entity_id) return false;
  }
  return w.other ? w.custom_task_name.trim().length > 1 : !!w.task_type_id;
}

export function toInput(w: WorkState) {
  return {
    work_type: w.work_type!,
    entity_kind: w.work_type === 'external' ? w.entity_kind : null,
    entity_id: w.work_type === 'external' ? w.entity_id || null : null,
    category_id: w.category_id,
    task_type_id: w.other ? null : w.task_type_id || null,
    custom_task_name: w.other ? w.custom_task_name.trim() : null,
  };
}

const CONTEXT_LABEL: Record<EntityKind, string> = { client: 'Client', prospect: 'Prospect', partner: 'Partner' };

/** The one form for describing work. Fields appear only once the previous choice
 *  makes them relevant, and every list is filtered to the chosen work type, so
 *  internal work can never reach a client and external work never sees an
 *  internal-only category. Changing a choice clears everything after it. */
export default function WorkPicker({
  catalog, value, onChange, compact = false, idPrefix = 'w',
}: { catalog: Catalog; value: WorkState; onChange: (w: WorkState) => void; compact?: boolean; idPrefix?: string }) {
  const w = value;
  const set = (patch: Partial<WorkState>) => onChange({ ...w, ...patch });

  const contexts = useMemo(() => CONTEXT_ORDER.filter((k) =>
    catalog.categories.some((c) => c.active && c.eligibility !== 'internal' && c.contexts.includes(k))), [catalog]);

  const cats = useMemo(() => (w.work_type ? categoriesFor(catalog.categories, w.work_type, w.entity_kind) : []),
    [catalog, w.work_type, w.entity_kind]);
  const tasks = useMemo(() => (w.work_type && w.category_id ? tasksFor(catalog.taskTypes, w.category_id, w.work_type) : []),
    [catalog, w.work_type, w.category_id]);
  const task = tasks.find((t) => t.id === w.task_type_id);

  const entityOptions = w.entity_kind === 'client'
    ? catalog.clients.filter((c) => c.active || c.id === w.entity_id)
    : w.entity_kind === 'prospect'
      ? catalog.prospects.filter((p) => (p.active && p.stage === 'open') || p.id === w.entity_id)
      : w.entity_kind === 'partner'
        ? catalog.partners.filter((p) => p.active || p.id === w.entity_id)
        : [];

  const showCategory = w.work_type === 'internal' || (w.work_type === 'external' && !!w.entity_kind &&
    (w.entity_kind !== 'client' || !!w.entity_id));

  // Group tasks by service line when the category has them (Web, SEO, Email...).
  const lines = [...new Set(tasks.map((t) => t.service_line ?? ''))];
  const grouped = lines.length > 1 || (lines.length === 1 && lines[0] !== '');

  return (
    <div className="stack" style={{ gap: compact ? 12 : 16 }}>
      <div className="seg big" role="group" aria-label="Type of work">
        {(['internal', 'external'] as WorkType[]).map((wt) => (
          <button key={wt} type="button" data-wt={wt} aria-pressed={w.work_type === wt}
            onClick={() => w.work_type !== wt && onChange(emptyWork(wt))}>
            {wt === 'internal' ? 'Internal' : 'External'}
          </button>
        ))}
      </div>

      {w.work_type === 'external' && (
        <div className="field">
          <span>Who is it for?</span>
          <div className="seg" role="group" aria-label="Relationship">
            {contexts.map((k) => (
              <button key={k} type="button" aria-pressed={w.entity_kind === k}
                onClick={() => w.entity_kind !== k && onChange({ ...emptyWork('external'), entity_kind: k })}>
                {CONTEXT_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {w.work_type === 'external' && w.entity_kind && (
        <label className="field" htmlFor={`${idPrefix}-entity`}>
          <span>{CONTEXT_LABEL[w.entity_kind]}</span>
          <select id={`${idPrefix}-entity`} value={w.entity_id}
            onChange={(e) => set({ entity_id: e.target.value })}>
            <option value="">
              {w.entity_kind === 'client' ? 'Choose a client' : w.entity_kind === 'prospect' ? 'General prospecting (no specific prospect)' : 'General partnership work'}
            </option>
            {entityOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {w.entity_kind === 'client' && entityOptions.length === 0 && (
            <span className="hint">No active clients yet. An admin adds them in System Admin.</span>
          )}
        </label>
      )}

      {showCategory && (
        <label className="field" htmlFor={`${idPrefix}-cat`}>
          <span>{w.work_type === 'internal' ? 'Internal category' : 'Category'}</span>
          <select id={`${idPrefix}-cat`} value={w.category_id}
            onChange={(e) => set({ category_id: e.target.value, task_type_id: '', other: false, custom_task_name: '' })}>
            <option value="">Choose a category</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!compact && w.category_id && (
            <span className="hint">{cats.find((c) => c.id === w.category_id)?.description}</span>
          )}
        </label>
      )}

      {showCategory && w.category_id && (
        <label className="field" htmlFor={`${idPrefix}-task`}>
          <span>Task</span>
          <select id={`${idPrefix}-task`} value={w.other ? '__other' : w.task_type_id}
            onChange={(e) => e.target.value === '__other'
              ? set({ other: true, task_type_id: '' })
              : set({ other: false, task_type_id: e.target.value, custom_task_name: '' })}>
            <option value="">Choose a task</option>
            {grouped
              ? lines.map((line) => (
                <optgroup key={line || 'general'} label={line || 'General'}>
                  {tasks.filter((t) => (t.service_line ?? '') === line).map((t) => <TaskOption key={t.id} t={t} />)}
                </optgroup>
              ))
              : tasks.map((t) => <TaskOption key={t.id} t={t} />)}
            <option value="__other">Not listed: describe it</option>
          </select>
          {task && !compact && (
            <span className="hint">
              {task.expected_minutes != null
                ? `Expected ${minutesLabel(task.expected_minutes)}${task.has_deliverable ? ` per ${task.deliverable_unit}` : ''} · ${SOURCE_LABEL[task.expected_source ?? 'estimate']}`
                : 'No expected time set yet'}
            </span>
          )}
        </label>
      )}

      {w.other && (
        <label className="field" htmlFor={`${idPrefix}-custom`}>
          <span>What is the task?</span>
          <input id={`${idPrefix}-custom`} type="text" value={w.custom_task_name} maxLength={80} autoFocus
            placeholder="Short name, for example Podcast edit"
            onChange={(e) => set({ custom_task_name: e.target.value })} />
          <span className="hint">An admin reviews unlisted tasks and adds them to the taxonomy.</span>
        </label>
      )}
    </div>
  );
}

function TaskOption({ t }: { t: TaskType }) {
  return <option value={t.id}>{t.name}</option>;
}
