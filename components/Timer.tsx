'use client';

import { useEffect, useState } from 'react';
import { startTimer, pauseTimer, resumeTimer, stopTimer, cancelTimer } from '@/app/actions/time';
import { formatClock } from '@/lib/finance';
import type { Client, Person, Scope, TaskType, Timer as TimerRow } from '@/lib/types';
import s from './Timer.module.css';

interface Props {
  timer: TimerRow | null;
  clients: Client[];
  taskTypes: TaskType[];
  people: Person[];
  me: Person;
}

const isOther = (t: TaskType | undefined) => t?.code.startsWith('other_') ?? false;

export default function Timer({ timer, clients, taskTypes, people, me }: Props) {
  const [scope, setScope] = useState<Scope>('external');
  const [taskId, setTaskId] = useState('');
  const [stopping, setStopping] = useState(false);
  const [joint, setJoint] = useState(false);
  const [parallel, setParallel] = useState(false);
  const [parallelScope, setParallelScope] = useState<Scope>('external');
  const [tick, setTick] = useState(0);

  // Only re-render the clock while something is actually running.
  const running = Boolean(timer) && !timer?.paused_at;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const forScope = taskTypes.filter((t) => t.scope === scope && t.active);
  const selected = taskTypes.find((t) => t.id === taskId);

  if (timer) {
    const activeTask = taskTypes.find((t) => t.id === timer.task_type_id);
    const client = clients.find((c) => c.id === timer.client_id);
    const pausedExtra = timer.paused_at
      ? Math.max(0, Math.round((Date.now() - new Date(timer.paused_at).getTime()) / 1000))
      : 0;
    const elapsed = Math.max(
      0,
      Math.round((Date.now() - new Date(timer.started_at).getTime()) / 1000) -
        timer.paused_seconds - pausedExtra,
    );
    const isPaused = Boolean(timer.paused_at);
    const label = timer.custom_task_name ?? activeTask?.name ?? 'Task';

    return (
      <div className={s.wrap} key={tick}>
        <div className={s.live}>
          <div className={`${s.clock} ${isPaused ? s.paused : ''}`}>{formatClock(elapsed)}</div>

          <div className={s.what}>
            <span className={s.state}>
              <i className={`${s.dot} ${isPaused ? s.dotPaused : ''}`} />
              {isPaused ? 'Paused' : 'Running'}
            </span>
            <b>{label}</b>
            <span className="muted">
              {timer.scope === 'external' ? (client?.name ?? 'Client') : 'Internal'}
            </span>
          </div>

          <div className={s.actions}>
            {isPaused ? (
              <form action={resumeTimer}>
                <button type="submit" data-variant="primary">Resume</button>
              </form>
            ) : (
              <form action={pauseTimer}><button type="submit">Pause</button></form>
            )}
            <button type="button" data-variant="signal" onClick={() => setStopping(true)}>
              Stop
            </button>
          </div>
        </div>

        {stopping && (
          <form action={stopTimer} className={s.sheet}>
            <div className={s.checks}>
              <label className={s.check}>
                <input type="checkbox" name="completed" defaultChecked />
                Completed
              </label>

              <label className={s.check}>
                <input type="checkbox" name="contract_deliverable" />
                Contract deliverable
              </label>

              {/* Units appear only for task types that carry one. The unit itself is
                  derived from the task and is never editable. Section 26. */}
              {activeTask?.unit && (
                <label className={s.field} style={{ maxWidth: 200 }}>
                  <span>{activeTask.unit} completed</span>
                  <input type="number" name="unit_count" min={0} step={1} defaultValue={1} />
                </label>
              )}

              <label className={s.check}>
                <input type="checkbox" name="joint" checked={joint}
                       onChange={(e) => setJoint(e.target.checked)} />
                Joint
              </label>

              {joint && (
                <div className={s.sub}>
                  <span className="eyebrow">Participants</span>
                  <div className={s.people}>
                    {people.filter((p) => p.id !== me.id).map((p) => (
                      <label key={p.id} className={s.check}>
                        <input type="checkbox" name="participants" value={p.id} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className={s.check}>
                <input type="checkbox" checked={parallel}
                       onChange={(e) => setParallel(e.target.checked)} />
                I also worked on something else in the background
              </label>

              {parallel && (
                <div className={s.sub}>
                  <div className={s.toggle}>
                    {(['external', 'internal'] as Scope[]).map((v) => (
                      <button key={v} type="button"
                              className={parallelScope === v ? s.on : ''}
                              onClick={() => setParallelScope(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                  {parallelScope === 'external' && (
                    <label className={s.field}>
                      <span>Client</span>
                      <select name="parallel_client_id">
                        <option value="">Select a client</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={s.field}>
                    <span>Task</span>
                    <select name="parallel_task_type_id">
                      <option value="">Select a task</option>
                      {taskTypes.filter((t) => t.scope === parallelScope && t.active).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className={s.actions}>
              <button type="submit" data-variant="primary">Save and stop</button>
              <button type="button" onClick={() => setStopping(false)}>Back</button>
            </div>
          </form>
        )}

        {!stopping && (
          <form action={cancelTimer} style={{ marginTop: 10 }}>
            <button type="submit" className={s.out} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
              Discard this timer
            </button>
          </form>
        )}
      </div>
    );
  }

  const quickStart = taskTypes.filter((t) => t.quick_start && t.active);

  return (
    <div className={s.wrap}>
      <form action={startTimer}>
        <input type="hidden" name="scope" value={scope} />

        <div className={s.toggle}>
          {(['internal', 'external'] as Scope[]).map((v) => (
            <button key={v} type="button" className={scope === v ? s.on : ''}
                    onClick={() => { setScope(v); setTaskId(''); }}>
              {v}
            </button>
          ))}
        </div>

        <div className={s.row}>
          {scope === 'external' && (
            <label className={s.field}>
              <span>Client</span>
              <select name="client_id" required>
                <option value="">Select a client</option>
                {clients.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className={s.field}>
            <span>Task</span>
            <select name="task_type_id" required value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Select a task</option>
              {forScope.filter((t) => !isOther(t)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {forScope.filter(isOther).map((t) => (
                <option key={t.id} value={t.id}>Other</option>
              ))}
            </select>
          </label>

          {/* The custom name field only exists once Other is picked. Section 19. */}
          {isOther(selected) && (
            <label className={s.field}>
              <span>New task name</span>
              <input type="text" name="custom_task_name" required
                     placeholder="Name this task" />
            </label>
          )}

          <button type="submit" data-variant="primary">Start</button>
        </div>
      </form>

      {quickStart.length > 0 && (
        <div className={s.quick}>
          <span className="eyebrow">Quick start</span>
          <div className={s.quickRow}>
            {quickStart.map((t) => (
              <button key={t.id} type="button" className={s.chip}
                      onClick={() => { setScope(t.scope); setTaskId(t.id); }}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
