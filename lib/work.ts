// Pure calculations over time entries. No database access, so tests can run them.

import { expectedMinutes } from './taxonomy';
import { laDate } from './time';
import type { TaskType, TimeEntry } from './types';

/** Worked seconds, excluding pauses. A running entry counts up to now. */
export function entrySeconds(e: Pick<TimeEntry, 'started_at' | 'ended_at' | 'paused_at' | 'paused_seconds'>, now = Date.now()) {
  const end = e.ended_at ? new Date(e.ended_at).getTime() : e.paused_at ? new Date(e.paused_at).getTime() : now;
  const raw = (end - new Date(e.started_at).getTime()) / 1000;
  return Math.max(0, Math.round(raw - (e.paused_seconds || 0)));
}

/** Logged time that counts toward capacity: closed, not deleted, not background work. */
export const counts = (e: TimeEntry) => !e.deleted && !!e.ended_at && !e.parallel_of;

export function totalSeconds(entries: TimeEntry[]) {
  return entries.filter(counts).reduce((a, e) => a + entrySeconds(e), 0);
}

export function groupSeconds<K>(entries: TimeEntry[], key: (e: TimeEntry) => K) {
  const m = new Map<K, number>();
  for (const e of entries) {
    if (!counts(e)) continue;
    const k = key(e);
    m.set(k, (m.get(k) ?? 0) + entrySeconds(e));
  }
  return m;
}

/** Key that identifies "the same piece of work" across sessions. */
export const workKey = (e: TimeEntry) =>
  [e.person_id, e.work_type, e.entity_kind ?? '', e.client_id ?? e.prospect_id ?? e.partner_id ?? '',
    e.task_type_id ?? `custom:${(e.custom_task_name ?? '').trim().toLowerCase()}`].join('|');

export interface WorkItem {
  key: string;
  personId: string;
  taskTypeId: string | null;
  entries: TimeEntry[];
  actualSeconds: number;
  qty: number | null;
  expectedMinutes: number | null;
  finishedAt: string;
}

/** Completed pieces of work: consecutive in-progress sessions closed by a finished one.
 *  This is what expected against actual is measured on, so a website build spread over
 *  ten sessions is compared once, against its full expected time. */
export function completedWorkItems(entries: TimeEntry[], types: Map<string, TaskType>): WorkItem[] {
  const sorted = entries.filter(counts).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const open = new Map<string, TimeEntry[]>();
  const out: WorkItem[] = [];
  for (const e of sorted) {
    const k = workKey(e);
    const run = [...(open.get(k) ?? []), e];
    if (e.status === 'finished') {
      open.delete(k);
      const qtys = run.map((r) => r.deliverable_qty).filter((q): q is number => q != null);
      const qty = qtys.length ? qtys.reduce((a, b) => a + b, 0) : null;
      const t = e.task_type_id ? types.get(e.task_type_id) : undefined;
      out.push({
        key: k, personId: e.person_id, taskTypeId: e.task_type_id, entries: run,
        actualSeconds: run.reduce((a, r) => a + entrySeconds(r), 0),
        qty, expectedMinutes: expectedMinutes(t, qty), finishedAt: e.ended_at!,
      });
    } else {
      open.set(k, run);
    }
  }
  return out;
}

/** Work still in progress: the latest session for a piece of work is unfinished. */
export function openWork(entries: TimeEntry[]) {
  const latest = new Map<string, TimeEntry>();
  const spent = new Map<string, number>();
  const sorted = entries.filter((e) => !e.deleted && !e.parallel_of && e.ended_at)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const e of sorted) {
    const k = workKey(e);
    if (latest.get(k)?.status === 'finished') spent.set(k, 0);
    latest.set(k, e);
    spent.set(k, (spent.get(k) ?? 0) + entrySeconds(e));
  }
  return [...latest.entries()]
    .filter(([, e]) => e.status === 'in_progress')
    .map(([k, e]) => ({ key: k, last: e, seconds: spent.get(k) ?? 0 }))
    .sort((a, b) => b.last.started_at.localeCompare(a.last.started_at));
}

export interface VarianceSummary {
  n: number;
  expectedMin: number;
  actualMin: number;
  /** actual / expected - 1, so +0.25 is 25% over. */
  ratio: number | null;
  withinPct: number | null;
  medianRatio: number | null;
}

/** Within 15% of expected counts as on target. */
export const ON_TARGET = 0.15;

export function varianceSummary(items: WorkItem[]): VarianceSummary {
  const usable = items.filter((i) => i.expectedMinutes != null && i.expectedMinutes > 0);
  const n = usable.length;
  if (!n) return { n: 0, expectedMin: 0, actualMin: 0, ratio: null, withinPct: null, medianRatio: null };
  const expectedMin = usable.reduce((a, i) => a + i.expectedMinutes!, 0);
  const actualMin = usable.reduce((a, i) => a + i.actualSeconds / 60, 0);
  const ratios = usable.map((i) => i.actualSeconds / 60 / i.expectedMinutes! - 1).sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return {
    n, expectedMin, actualMin,
    ratio: actualMin / expectedMin - 1,
    withinPct: ratios.filter((r) => Math.abs(r) <= ON_TARGET).length / n,
    medianRatio: n % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2,
  };
}

/** Seconds per LA calendar day, for heatmaps and daily bars. */
export function secondsByDay(entries: TimeEntry[]) {
  return groupSeconds(entries, (e) => laDate(e.started_at));
}
