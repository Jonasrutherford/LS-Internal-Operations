'use client';

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import WorkPicker, { emptyWork, isComplete, toInput, type WorkState } from './WorkPicker';
import {
  archiveEntry, discardTimer, logPastTime, startTimer, stopTimer, updateEntry,
  type FinishInput, type Result,
} from '@/app/actions/time';
import { describe } from '@/lib/describe';
import { entrySeconds } from '@/lib/work';
import { duration } from '@/lib/format';
import { unitLabel } from '@/lib/taxonomy';
import { laDate, laTime } from '@/lib/time';
import type { Catalog, EntryStatus, Person, TimeEntry, WorkType } from '@/lib/types';

interface LogApi {
  catalog: Catalog;
  me: Person;
  running: TimeEntry | null;
  openStart: (prefill?: Partial<WorkState>) => void;
  openStop: () => void;
  openPast: (prefill?: Partial<WorkState>) => void;
  openEdit: (entry: TimeEntry) => void;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  busy: boolean;
}

const Ctx = createContext<LogApi | null>(null);
export const useLog = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLog outside LogProvider');
  return v;
};

type Open =
  | { kind: 'start'; work: WorkState }
  | { kind: 'stop' }
  | { kind: 'past'; work: WorkState }
  | { kind: 'edit'; entry: TimeEntry }
  | null;

export function workFromEntry(e: Pick<TimeEntry, 'work_type' | 'entity_kind' | 'client_id' | 'prospect_id' | 'partner_id' | 'category_id' | 'task_type_id' | 'custom_task_name'>): WorkState {
  return {
    work_type: e.work_type, entity_kind: e.entity_kind,
    entity_id: e.client_id ?? e.prospect_id ?? e.partner_id ?? '',
    category_id: e.category_id, task_type_id: e.task_type_id ?? '',
    custom_task_name: e.custom_task_name ?? '', other: !e.task_type_id,
  };
}

export function LogProvider({ catalog, running, me, children }: { catalog: Catalog; running: TimeEntry | null; me: Person; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => { setOpen(null); setError(null); }, []);

  const run = useCallback((fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setError(r.error); return; }
      after?.();
      router.refresh();
    });
  }, [router]);

  const api = useMemo<LogApi>(() => ({
    catalog, me, running, busy, run,
    openStart: (p) => { setError(null); setOpen({ kind: 'start', work: { ...emptyWork(), ...p } }); },
    openStop: () => { setError(null); setOpen({ kind: 'stop' }); },
    openPast: (p) => { setError(null); setOpen({ kind: 'past', work: { ...emptyWork(), ...p } }); },
    openEdit: (entry) => { setError(null); setOpen({ kind: 'edit', entry }); },
  }), [catalog, me, running, busy, run]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === 'start' && <StartSheet initial={open.work} onClose={close} error={error} />}
      {open?.kind === 'stop' && running && <StopSheet entry={running} onClose={close} error={error} />}
      {open?.kind === 'past' && <PastSheet initial={open.work} onClose={close} error={error} />}
      {open?.kind === 'edit' && <EditSheet entry={open.entry} onClose={close} error={error} />}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- start

function StartSheet({ initial, onClose, error }: { initial: WorkState; onClose: () => void; error: string | null }) {
  const { catalog, run, busy, running } = useLog();
  const [work, setWork] = useState(initial);
  const ready = isComplete(work);
  return (
    <Modal title="Start timer" onClose={onClose} error={error ?? (running ? 'You already have a timer running. Stop it first.' : null)}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary lg" disabled={!ready || busy || !!running}
          onClick={() => run(() => startTimer(toInput(work)), onClose)}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </>}>
      <WorkPicker catalog={catalog} value={work} onChange={setWork} idPrefix="start" />
    </Modal>
  );
}

// ---------------------------------------------------------------- finish fields (stop and past)

interface FinishState {
  status: EntryStatus;
  qty: string;
  contract: boolean;
  ai: boolean;
  joint: boolean;
  participants: string[];
  parallelOn: boolean;
  parallel: WorkState;
}
const emptyFinish = (): FinishState => ({
  status: 'finished', qty: '', contract: false, ai: false, joint: false, participants: [], parallelOn: false, parallel: emptyWork(),
});

function finishInput(f: FinishState): FinishInput {
  return {
    status: f.status,
    deliverable_qty: f.qty === '' ? null : Number(f.qty),
    contract_deliverable: f.contract,
    ai_assisted: f.ai,
    joint: f.joint && f.participants.length > 0,
    participants: f.joint ? f.participants : [],
    parallel: f.parallelOn && isComplete(f.parallel) ? toInput(f.parallel) : null,
  };
}
const finishReady = (f: FinishState) => !(f.parallelOn && !isComplete(f.parallel)) && !(f.joint && f.participants.length === 0);

function FinishFields({ f, set, work }: { f: FinishState; set: (f: FinishState) => void; work: { work_type: WorkType | null; entity_kind: string | null; task_type_id: string } }) {
  const { catalog, me } = useLog();
  const task = catalog.taskTypes.find((t) => t.id === work.task_type_id);
  const teammates = catalog.people.filter((p) => p.active && p.id !== me.id);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="field">
        <span>Status</span>
        <div className="seg" role="group" aria-label="Status">
          <button type="button" aria-pressed={f.status === 'finished'} onClick={() => set({ ...f, status: 'finished' })}>Finished</button>
          <button type="button" aria-pressed={f.status === 'in_progress'} onClick={() => set({ ...f, status: 'in_progress' })}>In Progress</button>
        </div>
      </div>

      {task?.has_deliverable && (
        <label className="field">
          <span>How many {unitLabel(task.deliverable_unit)}?</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={f.qty} placeholder="0"
            onChange={(e) => set({ ...f, qty: e.target.value })} style={{ maxWidth: 160 }} />
        </label>
      )}

      <div className="stack" style={{ gap: 2 }}>
        {work.work_type === 'external' && work.entity_kind === 'client' && (
          <label className="check"><input type="checkbox" checked={f.contract} onChange={(e) => set({ ...f, contract: e.target.checked })} />
            Contract deliverable <span className="hint">counts toward what the client is contracted to receive</span></label>
        )}
        <label className="check"><input type="checkbox" checked={f.ai} onChange={(e) => set({ ...f, ai: e.target.checked })} />
          AI assisted <span className="hint">AI did a meaningful part of this work</span></label>
        {teammates.length > 0 && (
          <label className="check"><input type="checkbox" checked={f.joint} onChange={(e) => set({ ...f, joint: e.target.checked, participants: e.target.checked ? f.participants : [] })} />
            Joint work <span className="hint">done together with a teammate</span></label>
        )}
        {f.joint && (
          <div className="row" style={{ paddingLeft: 27, paddingBottom: 6 }}>
            {teammates.map((p) => {
              const on = f.participants.includes(p.id);
              return (
                <button key={p.id} type="button" className={`btn sm ${on ? 'navy' : ''}`}
                  onClick={() => set({ ...f, participants: on ? f.participants.filter((x) => x !== p.id) : [...f.participants, p.id] })}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <label className="check"><input type="checkbox" checked={f.parallelOn} onChange={(e) => set({ ...f, parallelOn: e.target.checked, parallel: emptyWork() })} />
          Parallel task <span className="hint">something else ran in the background during this time</span></label>
      </div>

      {f.parallelOn && (
        <div className="panel pad" style={{ background: 'var(--panel-2)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Parallel task</div>
          <WorkPicker catalog={catalog} value={f.parallel} onChange={(p) => set({ ...f, parallel: p })} compact idPrefix="par" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stop

function StopSheet({ entry, onClose, error }: { entry: TimeEntry; onClose: () => void; error: string | null }) {
  const { catalog, run, busy } = useLog();
  const [f, setF] = useState(emptyFinish);
  const d = describe(catalog, entry);
  const secs = entrySeconds(entry);
  return (
    <Modal title="Stop timer" onClose={onClose} error={error}
      footer={<>
        <button className="btn ghost danger" disabled={busy}
          onClick={() => { if (confirm('Discard this timer? The time will not be logged.')) run(() => discardTimer(entry.id), onClose); }}>
          Discard
        </button>
        <span className="spacer" />
        <button className="btn primary lg" disabled={busy || !finishReady(f)}
          onClick={() => run(() => stopTimer(entry.id, finishInput(f)), onClose)}>
          {busy ? 'Saving…' : 'Save time'}
        </button>
      </>}>
      <div className="panel pad" style={{ background: 'var(--panel-2)', display: 'grid', gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>{d.task}</b>
          <span className="num strong" style={{ fontSize: 16 }}>{duration(secs)}</span>
        </div>
        <div className="muted small">
          <span className={`tag ${entry.work_type === 'internal' ? 'int' : 'ext'}`}>{entry.work_type === 'internal' ? 'Internal' : 'External'}</span>{' '}
          {d.entity && <>{d.entity} · </>}{d.category} · started {laTime(entry.started_at)}
        </div>
      </div>
      <FinishFields f={f} set={setF} work={{ work_type: entry.work_type, entity_kind: entry.entity_kind, task_type_id: entry.task_type_id ?? '' }} />
    </Modal>
  );
}

// ---------------------------------------------------------------- past

function PastSheet({ initial, onClose, error }: { initial: WorkState; onClose: () => void; error: string | null }) {
  const { catalog, run, busy, me } = useLog();
  const [work, setWork] = useState(initial);
  const [f, setF] = useState(emptyFinish);
  const [date, setDate] = useState(laDate());
  const [startT, setStartT] = useState('09:00');
  const [endT, setEndT] = useState('10:00');
  const [who, setWho] = useState(me.id);
  const ready = isComplete(work) && finishReady(f) && !!date && !!startT && !!endT;
  return (
    <Modal title="Log past time" onClose={onClose} error={error} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary lg" disabled={!ready || busy}
          onClick={() => run(() => logPastTime({ ...toInput(work), ...finishInput(f), date, start: startT, end: endT, person_id: who }), onClose)}>
          {busy ? 'Saving…' : 'Save time'}
        </button>
      </>}>
      <div className="grid-3" style={{ gap: 12 }}>
        <label className="field"><span>Date</span><input type="date" value={date} max={laDate()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Start</span><input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} /></label>
        <label className="field"><span>End</span><input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} /></label>
      </div>
      {me.role === 'admin' && (
        <label className="field"><span>Person</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            {catalog.people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === me.id ? ' (you)' : ''}</option>)}
          </select>
        </label>
      )}
      <WorkPicker catalog={catalog} value={work} onChange={setWork} idPrefix="past" />
      {isComplete(work) && <FinishFields f={f} set={setF} work={work} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- edit

function EditSheet({ entry, onClose, error }: { entry: TimeEntry; onClose: () => void; error: string | null }) {
  const { catalog, run, busy, me } = useLog();
  const [work, setWork] = useState(workFromEntry(entry));
  const [date, setDate] = useState(laDate(entry.started_at));
  const [startT, setStartT] = useState(laTime(entry.started_at));
  const [endT, setEndT] = useState(entry.ended_at ? laTime(entry.ended_at) : laTime(new Date()));
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [qty, setQty] = useState(entry.deliverable_qty == null ? '' : String(entry.deliverable_qty));
  const [contract, setContract] = useState(entry.contract_deliverable);
  const [ai, setAi] = useState(entry.ai_assisted);
  const [reason, setReason] = useState('');
  const task = catalog.taskTypes.find((t) => t.id === work.task_type_id);
  const someoneElse = entry.person_id !== me.id;
  const owner = catalog.people.find((p) => p.id === entry.person_id)?.name ?? 'Unknown';

  return (
    <Modal title={someoneElse ? `Edit ${owner}'s entry` : 'Edit entry'} onClose={onClose} error={error} wide
      footer={<>
        <button className="btn ghost danger" disabled={busy}
          onClick={() => { if (confirm('Remove this entry? It leaves every total but stays in the change log.')) run(() => archiveEntry(entry.id, reason || undefined), onClose); }}>
          Remove
        </button>
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !isComplete(work)}
          onClick={() => run(() => updateEntry(entry.id, {
            ...toInput(work), date, start: startT, end: endT, status,
            deliverable_qty: task?.has_deliverable && qty !== '' ? Number(qty) : null,
            contract_deliverable: contract, ai_assisted: ai, reason: reason || undefined,
          }), onClose)}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </>}>
      {entry.parallel_of && <div className="notice">This is a parallel task recorded alongside another session.</div>}
      <div className="grid-3" style={{ gap: 12 }}>
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>Start</span><input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} /></label>
        <label className="field"><span>End</span><input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} /></label>
      </div>
      <WorkPicker catalog={catalog} value={work} onChange={setWork} idPrefix="edit" />
      <div className="field">
        <span>Status</span>
        <div className="seg">
          <button type="button" aria-pressed={status === 'finished'} onClick={() => setStatus('finished')}>Finished</button>
          <button type="button" aria-pressed={status === 'in_progress'} onClick={() => setStatus('in_progress')}>In Progress</button>
        </div>
      </div>
      {task?.has_deliverable && (
        <label className="field"><span>How many {unitLabel(task.deliverable_unit)}?</span>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} style={{ maxWidth: 160 }} /></label>
      )}
      <div className="stack" style={{ gap: 2 }}>
        {work.work_type === 'external' && work.entity_kind === 'client' && (
          <label className="check"><input type="checkbox" checked={contract} onChange={(e) => setContract(e.target.checked)} /> Contract deliverable</label>
        )}
        <label className="check"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> AI assisted</label>
      </div>
      {someoneElse && (
        <label className="field"><span>Reason for the change <span className="hint">recorded in the change log</span></span>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: wrong client selected" /></label>
      )}
    </Modal>
  );
}
