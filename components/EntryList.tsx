import { describe } from '@/lib/describe';
import { entrySeconds } from '@/lib/work';
import { duration } from '@/lib/format';
import { unitLabel } from '@/lib/taxonomy';
import { fmtDate, laDate, laTime } from '@/lib/time';
import { EditButton } from './log/buttons';
import type { Catalog, TimeEntry } from '@/lib/types';

/** Compact list of entries with edit, used on Start / Log and the Dashboard. */
export default function EntryList({ entries, catalog, showDate = false, showPerson = false, canEdit }: {
  entries: TimeEntry[]; catalog: Catalog; showDate?: boolean; showPerson?: boolean; canEdit: (e: TimeEntry) => boolean;
}) {
  if (!entries.length) return null;
  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>
          {entries.map((e) => {
            const d = describe(catalog, e);
            const person = catalog.people.find((p) => p.id === e.person_id)?.name;
            return (
              <tr key={e.id}>
                <td className="nowrap muted small hide-sm" style={{ width: 1 }}>
                  {showDate && <>{fmtDate(laDate(e.started_at), { weekday: 'short', month: 'short', day: 'numeric' })}<br /></>}
                  {laTime(e.started_at)}{e.ended_at ? `–${laTime(e.ended_at)}` : ''}
                </td>
                <td className="primary">
                  {d.task}
                  {d.custom && <span className="tag warn" style={{ marginLeft: 6 }}>Unlisted</span>}
                  <span className="sub">
                    <span className="show-sm">{laTime(e.started_at)}{e.ended_at ? `–${laTime(e.ended_at)}` : ''} · </span>
                    {showPerson && person ? `${person} · ` : ''}{d.where} · {d.category}
                    {e.deliverable_qty ? ` · ${e.deliverable_qty} ${unitLabel(d.taskType?.deliverable_unit ?? '', e.deliverable_qty)}` : ''}
                    {e.parallel_of ? ' · parallel' : ''}{e.joint ? ' · joint' : ''}
                  </span>
                </td>
                <td className="hide-sm" style={{ width: 1 }}>
                  <span className={`tag ${e.work_type === 'internal' ? 'int' : 'ext'}`}>{e.work_type === 'internal' ? 'Internal' : 'External'}</span>
                </td>
                <td style={{ width: 1 }}>
                  {!e.ended_at ? <span className="tag warn">Running</span>
                    : e.status === 'finished' ? <span className="tag good">Finished</span> : <span className="tag">In Progress</span>}
                </td>
                <td className="n nowrap strong" style={{ width: 1 }}>{duration(entrySeconds(e))}</td>
                <td style={{ width: 1 }}>{e.ended_at && canEdit(e) ? <EditButton entry={e} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
