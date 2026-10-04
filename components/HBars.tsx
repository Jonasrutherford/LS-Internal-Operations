/** Ranked horizontal bars. Label and value in ink; the bar carries magnitude only. */
export default function HBars({ rows, max, empty = 'No data in this range yet.' }: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; display: string; sub?: string; color?: string }>;
  max?: number; empty?: string;
}) {
  if (!rows.length) return <div className="empty"><p>{empty}</p></div>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'baseline' }}>
          <div style={{ fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}{r.sub && <span className="muted small" style={{ fontWeight: 400 }}> · {r.sub}</span>}
          </div>
          <div className="num strong small">{r.display}</div>
          <div className="bar-track" style={{ gridColumn: '1 / -1' }}>
            <div className="bar-fill" style={{ width: `${top > 0 ? Math.max(1.5, (r.value / top) * 100) : 0}%`, background: r.color ?? 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
