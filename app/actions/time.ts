'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePerson, assertAdmin, audit } from '@/lib/auth';
import type { Scope } from '@/lib/types';

/** Starting a task asks for three things only: internal or external, the client
 *  when external, and the task. Section 15. */
export async function startTimer(formData: FormData) {
  const person = await requirePerson();
  const supabase = await createClient();

  const scope = String(formData.get('scope') ?? 'external') as Scope;
  const clientId = String(formData.get('client_id') ?? '') || null;
  const taskTypeId = String(formData.get('task_type_id') ?? '');
  const customName = String(formData.get('custom_task_name') ?? '').trim() || null;

  if (!taskTypeId) throw new Error('Pick a task.');
  if (scope === 'external' && !clientId) throw new Error('External work needs a client.');

  // One running timer per person. Starting a new one replaces whatever was there.
  await supabase.from('timers').upsert({
    person_id: person.id,
    scope,
    client_id: scope === 'external' ? clientId : null,
    task_type_id: taskTypeId,
    custom_task_name: customName,
    started_at: new Date().toISOString(),
    paused_at: null,
    paused_seconds: 0,
  });

  revalidatePath('/', 'layout');
}

export async function pauseTimer() {
  const person = await requirePerson();
  const supabase = await createClient();

  const { data: timer } = await supabase
    .from('timers').select('*').eq('person_id', person.id).maybeSingle();
  if (!timer || timer.paused_at) return;

  await supabase.from('timers')
    .update({ paused_at: new Date().toISOString() })
    .eq('person_id', person.id);

  revalidatePath('/', 'layout');
}

export async function resumeTimer() {
  const person = await requirePerson();
  const supabase = await createClient();

  const { data: timer } = await supabase
    .from('timers').select('*').eq('person_id', person.id).maybeSingle();
  if (!timer?.paused_at) return;

  const extra = Math.max(
    0,
    Math.round((Date.now() - new Date(timer.paused_at).getTime()) / 1000),
  );

  await supabase.from('timers')
    .update({ paused_at: null, paused_seconds: timer.paused_seconds + extra })
    .eq('person_id', person.id);

  revalidatePath('/', 'layout');
}

export async function cancelTimer() {
  const person = await requirePerson();
  const supabase = await createClient();
  await supabase.from('timers').delete().eq('person_id', person.id);
  revalidatePath('/', 'layout');
}

/** Stopping never re-asks for person, date, start, end, client or task: the system
 *  already has all of it. Section 22. Only the genuinely new facts are collected. */
export async function stopTimer(formData: FormData) {
  const person = await requirePerson();
  const supabase = await createClient();

  const { data: timer } = await supabase
    .from('timers').select('*').eq('person_id', person.id).maybeSingle();
  if (!timer) throw new Error('No timer is running.');

  // A timer stopped while paused still banks the paused stretch.
  const pausedSeconds =
    timer.paused_seconds +
    (timer.paused_at
      ? Math.max(0, Math.round((Date.now() - new Date(timer.paused_at).getTime()) / 1000))
      : 0);

  const { data: taskType } = await supabase
    .from('task_types').select('unit').eq('id', timer.task_type_id).maybeSingle();

  // Units are only ever recorded for task types that carry one. Section 26.
  const rawCount = String(formData.get('unit_count') ?? '').trim();
  const unitCount = taskType?.unit && rawCount !== '' ? Math.max(0, Number(rawCount)) : null;

  const joint = formData.get('joint') === 'on';

  const { data: entry, error } = await supabase
    .from('time_entries')
    .insert({
      person_id: person.id,
      scope: timer.scope,
      client_id: timer.client_id,
      task_type_id: timer.task_type_id,
      custom_task_name: timer.custom_task_name,
      started_at: timer.started_at,
      ended_at: new Date().toISOString(),
      paused_seconds: pausedSeconds,
      completed: formData.get('completed') === 'on',
      contract_deliverable: formData.get('contract_deliverable') === 'on',
      unit_count: unitCount,
      joint,
      notes: null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  if (joint) {
    const participants = formData.getAll('participants').map(String).filter(Boolean);
    if (participants.length) {
      await supabase.from('entry_participants').insert(
        participants.map((pid) => ({ entry_id: entry.id, person_id: pid })),
      );
    }
  }

  // Background work done alongside the primary task. Section 23.
  const parallelTask = String(formData.get('parallel_task_type_id') ?? '');
  if (parallelTask) {
    await supabase.from('parallel_work').insert({
      entry_id: entry.id,
      client_id: String(formData.get('parallel_client_id') ?? '') || null,
      task_type_id: parallelTask,
    });
  }

  await supabase.from('timers').delete().eq('person_id', person.id);
  revalidatePath('/', 'layout');
}

/** Admin correction of any entry, with a reason recorded. Sections 32 and 34. */
export async function updateEntry(formData: FormData) {
  const admin = await assertAdmin();
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing entry.');

  const patch: Record<string, unknown> = {};
  const started = String(formData.get('started_at') ?? '');
  const ended = String(formData.get('ended_at') ?? '');
  if (started) patch.started_at = new Date(started).toISOString();
  if (ended) patch.ended_at = new Date(ended).toISOString();
  patch.completed = formData.get('completed') === 'on';
  patch.contract_deliverable = formData.get('contract_deliverable') === 'on';

  const { data: before } = await supabase
    .from('time_entries').select('*').eq('id', id).maybeSingle();

  const { error } = await supabase.from('time_entries').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  await audit({
    table_name: 'time_entries',
    record_id: id,
    field: 'entry',
    before_value: JSON.stringify({
      started_at: before?.started_at, ended_at: before?.ended_at,
      completed: before?.completed, contract_deliverable: before?.contract_deliverable,
    }),
    after_value: JSON.stringify(patch),
    reason: String(formData.get('reason') ?? '') || null,
  });

  revalidatePath('/time-log');
}
