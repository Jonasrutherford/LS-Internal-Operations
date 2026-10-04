'use client';

import { useLog, workFromEntry } from './LogProvider';
import { resumeWork, startTimer } from '@/app/actions/time';
import { toInput } from './WorkPicker';
import type { TimeEntry } from '@/lib/types';
import type { WorkState } from './WorkPicker';

export function StartButton({ label = 'Start timer', className = 'btn primary', prefill }: { label?: string; className?: string; prefill?: Partial<WorkState> }) {
  const { openStart } = useLog();
  return <button className={className} onClick={() => openStart(prefill)}>{label}</button>;
}

export function PastButton({ label = 'Log past time', className = 'btn' }: { label?: string; className?: string }) {
  const { openPast } = useLog();
  return <button className={className} onClick={() => openPast()}>{label}</button>;
}

/** One click: starts the same work again, no form. */
export function QuickStart({ entry, children, className }: { entry: TimeEntry; children: React.ReactNode; className?: string }) {
  const { run, busy, running, openStart } = useLog();
  return (
    <button className={className} disabled={busy}
      onClick={() => running ? openStart(workFromEntry(entry)) : run(() => startTimer(toInput(workFromEntry(entry))))}>
      {children}
    </button>
  );
}

export function ResumeButton({ entryId, className = 'btn sm' }: { entryId: string; className?: string }) {
  const { run, busy, running } = useLog();
  return (
    <button className={className} disabled={busy || !!running} title={running ? 'Stop your running timer first' : undefined}
      onClick={() => run(() => resumeWork(entryId))}>
      Resume
    </button>
  );
}

export function EditButton({ entry, className = 'btn ghost sm', children = 'Edit' }: { entry: TimeEntry; className?: string; children?: React.ReactNode }) {
  const { openEdit } = useLog();
  return <button className={className} onClick={() => openEdit(entry)}>{children}</button>;
}
