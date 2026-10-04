'use client';

import { useEffect, useState } from 'react';
import { useLog } from './LogProvider';
import { pauseTimer, resumeTimer } from '@/app/actions/time';
import { describe } from '@/lib/describe';
import { entrySeconds } from '@/lib/work';
import { clock } from '@/lib/format';
import s from './TimerBar.module.css';

export default function TimerBar() {
  const { running, catalog, openStart, openStop, openPast, run, busy } = useLog();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running || running.paused_at) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!running) {
    return (
      <div className={s.bar}>
        <div className={s.idle}>
          <span className={s.dotIdle} aria-hidden />
          <div><b>No timer running</b><span>Start one when you begin a task</span></div>
        </div>
        <div className={s.actions}>
          <button className="btn" onClick={() => openPast()}>Log past time</button>
          <button className="btn primary" onClick={() => openStart()}>Start timer</button>
        </div>
      </div>
    );
  }

  const d = describe(catalog, running);
  const paused = !!running.paused_at;
  return (
    <div className={s.bar}>
      <div className={`${s.live} ${paused ? s.paused : ''}`}>
        <span className={paused ? s.dotPaused : s.dotLive} aria-hidden />
        <div className={s.what}>
          <b>{d.task}</b>
          <span>{paused ? 'Paused · ' : ''}{d.where}{d.category ? ` · ${d.category}` : ''}</span>
        </div>
        <span className={s.clock} aria-live="off">{clock(entrySeconds(running))}</span>
      </div>
      <div className={s.actions}>
        <button className="btn" disabled={busy}
          onClick={() => run(() => (paused ? resumeTimer(running.id) : pauseTimer(running.id)))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn navy" onClick={openStop}>Stop</button>
      </div>
    </div>
  );
}
