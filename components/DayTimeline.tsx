import { describe } from '@/lib/describe';
import { laInstant, laTime } from '@/lib/time';
import type { Catalog, TimeEntry } from '@/lib/types';

/** One day, 6am to midnight, as blocks. External in Lucid blue, internal in orange. */
export default function DayTimeline({ date, entries, catalog }: { date: string; entries: TimeEntry[]; catalog: Catalog }) {
  const startMs = laInstant(date, '06:00').getTime();
  const endMs = laInstant(date, '23:59').getTime() + 60000;
  const span = endMs - startMs;
  const ticks = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  const tickLabel = (t: string) => { const h = Number(t.slice(0, 2)); return h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`; };
  const now = Date.now();

  return (
    <div>
      <div style={{ position: 'relative', height: 46, background: 'var(--panel-2)', borderRadius: 10, overflow: 'hidden' }}>
        {ticks.slice(1).map((t) => (
          <div key={t} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((laInstant(date, t).getTime() - startMs) / span) * 100}%`, width: 1, background: 'var(--line)' }} />
        ))}
        {entries.filter((e) => !e.deleted && !e.parallel_of).map((e) => {
          const s = Math.max(startMs, new Date(e.started_at).getTime());
          const en = Math.min(endMs, e.ended_at ? new Date(e.ended_at).getTime() : now);
          if (en <= s) return null;
          const d = describe(catalog, e);
          return (
            <div key={e.id} title={`${laTime(e.started_at)}${e.ended_at ? `–${laTime(e.ended_at)}` : ' (running)'} · ${d.task} · ${d.where}`}
              style={{
                position: 'absolute', top: 6, bottom: 6, left: `${((s - startMs) / span) * 100}%`,
                width: `max(3px, ${((en - s) / span) * 100}%)`, borderRadius: 5,
                background: e.work_type === 'internal' ? 'var(--int)' : 'var(--ext)', opacity: e.ended_at ? 0.9 : 0.55,
              }} />
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 18, marginTop: 4 }}>
        {ticks.map((t) => (
          <span key={t} className="muted small" style={{ position: 'absolute', left: `${((laInstant(date, t).getTime() - startMs) / span) * 100}%`, transform: 'translateX(-2px)' }}>{tickLabel(t)}</span>
        ))}
        <span className="muted small" style={{ position: 'absolute', right: 0 }}>12a</span>
      </div>
    </div>
  );
}
