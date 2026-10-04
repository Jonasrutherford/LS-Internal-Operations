'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { audit, currentPerson } from '@/lib/auth';
import { laInstant } from '@/lib/time';
import type { EntityKind, EntryStatus, WorkType } from '@/lib/types';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export interface WorkInput {
  work_type: WorkType;
  entity_kind?: EntityKind | null;
  entity_id?: string | null;
  category_id: string;
  task_type_id?: string | null;
  custom_task_name?: string | null;
}

export interface FinishInput {
  status: EntryStatus;
  deliverable_qty?: number | null;
  contract_deliverable?: boolean;
  ai_assisted?: boolean;
  joint?: boolean;
  participants?: string[];
  parallel?: WorkInput | null;
}

/** Turns form input into a row that can only describe one kind of work. Internal
 *  work never carries a client, prospect or partner, whatever the form sent. */
function workRow(w: WorkInput) {
  const internal = w.work_type === 'internal';
  const kind = internal ? null : (w.entity_kind ?? null);
  const id = internal ? null : (w.entity_id || null);
  const custom = (w.custom_task_name ?? '').trim();
  return {
    work_type: w.work_type,
    entity_kind: kind,
    client_id: kind === 'client' ? id : null,
    prospect_id: kind === 'prospect' ? id : null,
    partner_id: kind === 'partner' ? id : null,
    category_id: w.category_id,
    task_type_id: w.task_type_id || null,
    custom_task_name: w.task_type_id ? null : custom || null,
  };
}

function checkWork(w: WorkInput): string | null {
  if (w.work_type !== 'internal' && w.work_type !== 'external') return 'Choose Internal or External.';
  if (w.work_type === 'external') {
    if (!w.entity_kind) return 'Choose who the work is for.';
    if (w.entity_kind === 'client' && !w.entity_id) return 'Choose the client.';
  }
  if (!w.category_id) return 'Choose a category.';
  if (!w.task_type_id && !(w.custom_task_name ?? '').trim()) return 'Choose a task.';
  return null;
}

/** Database errors in words a person can act on. */
function friendly(message: string) {
  if (/one_running_timer/.test(message)) return 'You already have a timer running. Stop it first.';
  if (/not available for|does not apply to|is not in category/.test(message)) return message.replace(/^.*?ERROR:\s*/, '');
  if (/row-level security/.test(message)) return 'You do not have permission to do that.';
  if (/ends_after_start/.test(message)) return 'The end time is before the start time.';
  return message;
}

function done(): Result { revalidatePath('/', 'layout'); return { ok: true }; }

async function me() {
  const p = await currentPerson();
  if (!p) throw new Error('Not signed in');
  return p;
}

export async function startTimer(w: WorkInput): Promise<Result> {
  const person = await me();
  const bad = checkWork(w);
  if (bad) return { ok: false, error: bad };
  const sb = await createClient();
  const { error } = await sb.from('time_entries').insert({
    ...workRow(w), person_id: person.id, started_at: new Date().toISOString(), source: 'timer', status: 'in_progress',
  });
  if (error) return { ok: false, error: friendly(error.message) };
  return done();
}

async function ownRunning(id: string) {
  const person = await me();
  const sb = await createClient();
  const { data, error } = await sb.from('time_entries').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('That timer no longer exists.');
  if (data.person_id !== person.id) throw new Error('That is not your timer.');
  if (data.ended_at) throw new Error('That timer has already stopped.');
  return { sb, entry: data, person };
}

export async function pauseTimer(id: string): Promise<Result> {
  try {
    const { sb, entry } = await ownRunning(id);
    if (entry.paused_at) return { ok: true };
    const { error } = await sb.from('time_entries').update({ paused_at: new Date().toISOString() }).eq('id', id);
    if (error) return { ok: false, error: friendly(error.message) };
    return done();
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function resumeTimer(id: string): Promise<Result> {
  try {
    const { sb, entry } = await ownRunning(id);
    if (!entry.paused_at) return { ok: true };
    const extra = Math.round((Date.now() - new Date(entry.paused_at).getTime()) / 1000);
    const { error } = await sb.from('time_entries')
      .update({ paused_at: null, paused_seconds: (entry.paused_seconds ?? 0) + Math.max(0, extra) }).eq('id', id);
    if (error) return { ok: false, error: friendly(error.message) };
    return done();
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Throws away a timer started by mistake. Kept as a deleted row, not erased. */
export async function discardTimer(id: string): Promise<Result> {
  try {
    const { sb } = await ownRunning(id);
    const { error } = await sb.from('time_entries')
      .update({ deleted: true, ended_at: new Date().toISOString(), paused_at: null }).eq('id', id);
    if (error) return { ok: false, error: friendly(error.message) };
    return done();
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function writeFinish(
  sb: Awaited<ReturnType<typeof createClient>>, entryId: string, personId: string,
  window: { started_at: string; ended_at: string; paused_seconds: number }, f: FinishInput, source: 'timer' | 'manual',
): Promise<string | null> {
  const others = [...new Set((f.participants ?? []).filter((p) => p && p !== personId))];
  const joint = !!f.joint && others.length > 0;

  if (joint) {
    const { error } = await sb.from('entry_participants').insert(others.map((p) => ({ entry_id: entryId, person_id: p })));
    if (error) return friendly(error.message);
  }

  if (f.parallel) {
    const bad = checkWork(f.parallel);
    if (bad) return `Parallel task: ${bad}`;
    const { error } = await sb.from('time_entries').insert({
      ...workRow(f.parallel), person_id: personId, parallel_of: entryId, source,
      started_at: window.started_at, ended_at: window.ended_at, paused_seconds: window.paused_seconds,
      status: f.status === 'finished' ? 'finished' : 'in_progress',
    });
    if (error) return `Parallel task: ${friendly(error.message)}`;
  }
  return null;
}

function finishFields(f: FinishInput) {
  const qty = f.deliverable_qty == null || Number.isNaN(Number(f.deliverable_qty)) ? null : Math.max(0, Math.round(Number(f.deliverable_qty)));
  return {
    status: f.status === 'finished' ? 'finished' : 'in_progress',
    deliverable_qty: qty,
    contract_deliverable: !!f.contract_deliverable,
    ai_assisted: !!f.ai_assisted,
    joint: !!f.joint && (f.participants ?? []).length > 0,
  };
}

export async function stopTimer(id: string, f: FinishInput): Promise<Result> {
  try {
    const { sb, entry, person } = await ownRunning(id);
    const now = new Date();
    let paused = entry.paused_seconds ?? 0;
    if (entry.paused_at) paused += Math.max(0, Math.round((now.getTime() - new Date(entry.paused_at).getTime()) / 1000));
    const window = { started_at: entry.started_at, ended_at: now.toISOString(), paused_seconds: paused };
    const { error } = await sb.from('time_entries')
      .update({ ...finishFields(f), ended_at: window.ended_at, paused_at: null, paused_seconds: paused }).eq('id', id);
    if (error) return { ok: false, error: friendly(error.message) };
    const extra = await writeFinish(sb, id, person.id, window, f, 'timer');
    if (extra) return { ok: false, error: `Time saved, but: ${extra}` };
    return done();
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export interface PastInput extends WorkInput, FinishInput {
  date: string;
  start: string;
  end: string;
  person_id?: string;
}

export async function logPastTime(input: PastInput): Promise<Result> {
  const person = await me();
  const bad = checkWork(input);
  if (bad) return { ok: false, error: bad };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
    return { ok: false, error: 'Enter a date, a start time and an end time.' };
  }
  const forId = person.role === 'admin' && input.person_id ? input.person_id : person.id;
  const startAt = laInstant(input.date, input.start);
  let endAt = laInstant(input.date, input.end);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86400000); // ran past midnight
  if (endAt.getTime() - startAt.getTime() > 16 * 3600000) return { ok: false, error: 'That is longer than 16 hours. Check the times.' };
  if (startAt.getTime() > Date.now()) return { ok: false, error: 'That time is in the future. Use Start timer instead.' };

  const sb = await createClient();
  const window = { started_at: startAt.toISOString(), ended_at: endAt.toISOString(), paused_seconds: 0 };
  const { data, error } = await sb.from('time_entries').insert({
    ...workRow(input), ...finishFields(input), ...window, person_id: forId, source: 'manual',
  }).select('id').single();
  if (error) return { ok: false, error: friendly(error.message) };
  const extra = await writeFinish(sb, data.id, forId, window, input, 'manual');
  if (extra) return { ok: false, error: `Time saved, but: ${extra}` };
  if (forId !== person.id) {
    await audit({ table_name: 'time_entries', record_id: data.id, field: 'created', after_value: `${input.date} ${input.start}-${input.end}`, reason: 'Logged on behalf of a teammate' });
  }
  return done();
}

/** Starts a new session on the same work as an earlier entry. */
export async function resumeWork(entryId: string): Promise<Result> {
  const sb = await createClient();
  const { data, error } = await sb.from('time_entries').select('*').eq('id', entryId).maybeSingle();
  if (error || !data) return { ok: false, error: 'That entry no longer exists.' };
  return startTimer({
    work_type: data.work_type, entity_kind: data.entity_kind,
    entity_id: data.client_id ?? data.prospect_id ?? data.partner_id,
    category_id: data.category_id, task_type_id: data.task_type_id, custom_task_name: data.custom_task_name,
  });
}

export interface EditInput extends WorkInput {
  date: string;
  start: string;
  end: string;
  status: EntryStatus;
  deliverable_qty?: number | null;
  contract_deliverable?: boolean;
  ai_assisted?: boolean;
  reason?: string;
}

/** Edit a closed entry. People edit their own; admins edit anyone's, with an audit row. */
export async function updateEntry(id: string, input: EditInput): Promise<Result> {
  const person = await me();
  const sb = await createClient();
  const { data: before, error: e1 } = await sb.from('time_entries').select('*').eq('id', id).maybeSingle();
  if (e1 || !before) return { ok: false, error: 'That entry no longer exists.' };
  if (before.person_id !== person.id && person.role !== 'admin') return { ok: false, error: 'You can only edit your own time.' };
  if (!before.ended_at) return { ok: false, error: 'Stop the timer before editing it.' };
  const bad = checkWork(input);
  if (bad) return { ok: false, error: bad };

  const startAt = laInstant(input.date, input.start);
  let endAt = laInstant(input.date, input.end);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86400000);

  const patch = {
    ...workRow(input),
    started_at: startAt.toISOString(), ended_at: endAt.toISOString(),
    status: input.status, deliverable_qty: input.deliverable_qty ?? null,
    contract_deliverable: !!input.contract_deliverable, ai_assisted: !!input.ai_assisted,
  };
  const { error } = await sb.from('time_entries').update(patch).eq('id', id);
  if (error) return { ok: false, error: friendly(error.message) };

  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => String(before[k] ?? '') !== String(patch[k] ?? ''));
  for (const k of changed) {
    await audit({
      table_name: 'time_entries', record_id: id, field: k,
      before_value: before[k] == null ? null : String(before[k]), after_value: patch[k] == null ? null : String(patch[k]),
      reason: input.reason || (before.person_id === person.id ? 'Edited own entry' : 'Admin correction'),
    });
  }
  return done();
}

/** Archive an entry. It disappears from totals but stays in the database and the change log. */
export async function archiveEntry(id: string, reason?: string): Promise<Result> {
  const person = await me();
  const sb = await createClient();
  const { data: before } = await sb.from('time_entries').select('person_id, ended_at').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'That entry no longer exists.' };
  if (before.person_id !== person.id && person.role !== 'admin') return { ok: false, error: 'You can only remove your own time.' };
  const { error } = await sb.from('time_entries').update({ deleted: true }).or(`id.eq.${id},parallel_of.eq.${id}`);
  if (error) return { ok: false, error: friendly(error.message) };
  await audit({ table_name: 'time_entries', record_id: id, field: 'deleted', before_value: 'false', after_value: 'true', reason: reason || 'Removed' });
  return done();
}
