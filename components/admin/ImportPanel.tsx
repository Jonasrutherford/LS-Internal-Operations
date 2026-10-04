'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importEntries, importFinance, importReference, recordImportDone, type ImportReport } from '@/app/actions/import';

type Store = Record<string, Record<string, unknown>>;
const KEY = 'lucidos.store.v1';

function summarize(store: Store) {
  const items = (k: string) => Object.keys((store[k]?.items as object) ?? {}).length;
  const months = Object.keys(store).filter((k) => /^entries\/\d{4}-\d{2}$/.test(k)).sort();
  return {
    clients: items('config/clients'),
    types: Object.keys((store['config/taxonomy']?.types as object) ?? {}).length,
    ledger: items('fin/ledger'), contracts: items('fin/contracts'), expenses: items('fin/expenses'),
    months, entries: months.reduce((a, m) => a + Object.keys((store[m]?.items as object) ?? {}).length, 0),
  };
}

/** Moves the previous app's data out of this browser and into Supabase. Safe to run
 *  again: every row carries a reference to its source and is never duplicated. */
export default function ImportPanel() {
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [from, setFrom] = useState<'browser' | 'file' | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ImportReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [withTime, setWithTime] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && Object.keys(s).length) { setStore(s); setFrom('browser'); } }
    } catch { /* storage blocked */ }
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      setStore(parsed.documents ?? parsed); setFrom('file'); setError(null);
    } catch (e) { setError(`Could not read that file: ${(e as Error).message}`); }
  };

  const go = async () => {
    if (!store) return;
    setBusy(true); setError(null); setLog([]);
    const out: ImportReport[] = [];
    try {
      const ref = await importReference({ clients: store['config/clients']?.items as never, taxonomy: store['config/taxonomy'] as never });
      if (!ref.ok) throw new Error(ref.error);
      out.push(...ref.reports); setLog([...out]);
      const fin = await importFinance({ ledger: store['fin/ledger']?.items as never, expenses: store['fin/expenses']?.items as never, contracts: store['fin/contracts']?.items as never });
      if (!fin.ok) throw new Error(fin.error);
      out.push(...fin.reports); setLog([...out]);
      if (withTime) {
        for (const m of summarize(store).months) {
          const r = await importEntries(m.slice(8), store[m].items as never);
          if (!r.ok) throw new Error(r.error);
          out.push(r.report); setLog([...out]);
        }
      }
      await recordImportDone(out.map((r) => `${r.section}: +${r.added}`).join('; '));
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const s = store ? summarize(store) : null;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="panel pad stack" style={{ gap: 12 }}>
        <h2>Bring over data from the previous app</h2>
        <p className="muted">The earlier version of this app kept revenue, expenses, contracts and time in each browser rather than in the cloud. Open this page in the browser you used before and this panel finds that data and moves it into the LS Command database, where everyone can see it and it is backed up. Run it once. Running it again adds nothing twice.</p>
        {s ? (
          <>
            <div className="notice good">Found {from === 'browser' ? 'data in this browser' : 'data in the file'}: {s.ledger} revenue lines, {s.expenses} expenses, {s.contracts} contracts, {s.clients} client records, {s.types} task standards and {s.entries} time entries across {s.months.length} months.</div>
            <label className="check"><input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} />
              Include historical time entries <span className="hint">reconstructed pre-October time, used for client labor history. October 1, 2026 stays the clean baseline for analytics.</span></label>
            <div><button className="btn primary" disabled={busy} onClick={go}>{busy ? 'Importing…' : 'Import into LS Command'}</button></div>
          </>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="notice">No previous data in this browser. If you have the seed file, choose it here.</div>
            <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}
        {error && <div className="notice crit">{error}</div>}
      </section>
      {log.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Import results</h2></div>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Section</th><th className="n">Added</th><th className="n">Updated</th><th className="n">Skipped</th><th>Notes</th></tr></thead>
            <tbody>{log.map((r, i) => (
              <tr key={i}><td className="primary">{r.section}</td><td className="n">{r.added}</td><td className="n">{r.updated}</td><td className="n">{r.skipped}</td>
                <td className="small muted">{r.notes.slice(0, 4).join(' · ')}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}
