'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RANGE_LABEL, type RangeKey } from '@/lib/time';

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') p.delete(k); else p.set(k, v);
    }
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
}

/** Date range presets plus a custom range. State lives in the URL so views are shareable. */
export function RangePicker({ value, from, to, keys }: { value: RangeKey; from: string; to: string; keys: RangeKey[] }) {
  const set = useParamSetter();
  const [cf, setCf] = useState(from);
  const [ct, setCt] = useState(to);
  return (
    <div className="row" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label="Date range">
        {keys.map((k) => (
          <button key={k} type="button" aria-pressed={value === k}
            onClick={() => set(k === 'custom' ? { range: 'custom', from: cf, to: ct } : { range: k, from: null, to: null })}>
            {k === 'custom' ? 'Custom' : RANGE_LABEL[k]}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="row" style={{ gap: 6 }}>
          <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} style={{ width: 150 }} aria-label="From" />
          <span className="muted">to</span>
          <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} style={{ width: 150 }} aria-label="To" />
          <button className="btn sm" onClick={() => set({ range: 'custom', from: cf, to: ct })}>Apply</button>
        </div>
      )}
    </div>
  );
}

/** A select whose value is a URL search param. Clearing params that depend on it
 *  keeps filters coherent: switching to Internal drops a client filter. */
export function ParamSelect({
  name, value, options, label, clears = [], allLabel = 'All',
}: {
  name: string; value: string; label: string; clears?: string[]; allLabel?: string | null;
  options: Array<{ value: string; label: string; group?: string }>;
}) {
  const set = useParamSetter();
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <select aria-label={label} value={value} onChange={(e) => set({ [name]: e.target.value || null, ...Object.fromEntries(clears.map((c) => [c, null])) })}>
      {allLabel != null && <option value="">{allLabel}</option>}
      {groups.length > 1
        ? groups.map((g) => (
          <optgroup key={g} label={g}>
            {options.filter((o) => (o.group ?? '') === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))
        : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ParamSeg({ name, value, options, clears = [] }: { name: string; value: string; options: Array<{ value: string; label: string }>; clears?: string[] }) {
  const set = useParamSetter();
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value}
          onClick={() => set({ [name]: o.value || null, ...Object.fromEntries(clears.map((c) => [c, null])) })}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
