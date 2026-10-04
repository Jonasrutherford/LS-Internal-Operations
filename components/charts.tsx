'use client';

// LS Command charts. Plain SVG, sized to their container, one y-axis each, with a
// hover layer on every mark. Colors come from CSS tokens only.

import { useEffect, useRef, useState } from 'react';
import { moneyShort, money } from '@/lib/format';

/** Formatters are named, not passed as functions, so server pages can render charts. */
export type Fmt = 'money' | 'moneyShort' | 'hours' | 'pct' | 'count';
const FMT: Record<Fmt, (n: number) => string> = {
  money: (n) => money(n),
  moneyShort,
  hours: (n) => `${Math.round(n * 10) / 10} h`,
  pct: (n) => `${Math.round(n * 100)}%`,
  count: (n) => `${Math.round(n)}`,
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Round a max up to a friendly axis ceiling and return ~4 ticks. */
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

interface Tip { x: number; y: number; content: React.ReactNode }
function TipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>;
}

// ---------------------------------------------------------------- bubble

export interface BubblePoint {
  id: string; label: string; x: number; y: number; size: number; tone: number;
  lines: Array<[string, string]>;
}

/** Scatter with area-scaled bubbles. tone is a margin in [-1, 1]: red below zero,
 *  neutral near zero, Lucid blue when healthy. */
export function BubbleChart({ points, xLabel, yLabel, xFmt, yFmt, height = 420, refSlope }: {
  points: BubblePoint[]; xLabel: string; yLabel: string; xFmt: Fmt; yFmt: Fmt;
  height?: number; refSlope?: { value: number; label: string } | null;
}) {
  const fmtX = FMT[xFmt]; const fmtY = FMT[yFmt];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const m = { t: 18, r: 24, b: 46, l: 64 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;
  const xt = niceTicks(Math.max(1, ...points.map((p) => p.x)) * 1.08);
  const yt = niceTicks(Math.max(1, ...points.map((p) => p.y)) * 1.1);
  const xs = (v: number) => m.l + (v / xt[xt.length - 1]) * W;
  const ys = (v: number) => m.t + H - (v / yt[yt.length - 1]) * H;
  const maxSize = Math.max(1, ...points.map((p) => Math.abs(p.size)));
  const rad = (s: number) => 7 + Math.sqrt(Math.abs(s) / maxSize) * Math.min(42, width / 18);
  const color = (t: number) => (t < -0.02 ? 'var(--crit)' : t < 0.15 ? 'var(--neutral)' : 'var(--s1)');
  const sorted = [...points].sort((a, b) => Math.abs(b.size) - Math.abs(a.size));
  const labelled = new Set(sorted.slice(0, 6).map((p) => p.id));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => { setTip(null); setHover(null); }}>
      <svg width={width} height={height} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        <g className="grid">{yt.map((v) => <line key={v} x1={m.l} x2={m.l + W} y1={ys(v)} y2={ys(v)} />)}</g>
        <g className="axis">
          {yt.map((v) => <text key={v} x={m.l - 10} y={ys(v) + 4} textAnchor="end">{fmtY(v)}</text>)}
          {xt.map((v) => <text key={v} x={xs(v)} y={m.t + H + 18} textAnchor="middle">{fmtX(v)}</text>)}
          <text x={m.l + W / 2} y={height - 6} textAnchor="middle">{xLabel}</text>
          <text transform={`translate(14 ${m.t + H / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        </g>
        {refSlope && refSlope.value > 0 && (() => {
          const xEnd = Math.min(xt[xt.length - 1], yt[yt.length - 1] / refSlope.value);
          return (
            <g>
              <line x1={xs(0)} y1={ys(0)} x2={xs(xEnd)} y2={ys(xEnd * refSlope.value)} stroke="var(--ink-4)" strokeDasharray="4 4" strokeWidth={1.5} />
              <text className="axis" x={xs(xEnd) - 4} y={ys(xEnd * refSlope.value) - 6} textAnchor="end">{refSlope.label}</text>
            </g>
          );
        })()}
        {sorted.map((p) => {
          const cx = xs(p.x); const cy = ys(p.y); const r = rad(p.size);
          const dim = hover && hover !== p.id;
          return (
            <g key={p.id} style={{ cursor: 'default' }}
              onMouseEnter={() => { setHover(p.id); setTip({ x: cx, y: cy - r, content: <><b>{p.label}</b>{p.lines.map(([k, v]) => <div key={k}><span className="k">{k}</span> {v}</div>)}</> }); }}>
              <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
              <circle cx={cx} cy={cy} r={r} fill={color(p.tone)} fillOpacity={dim ? 0.15 : 0.55} stroke="var(--panel)" strokeWidth={2} />
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={color(p.tone)} strokeWidth={1.5} opacity={dim ? 0.3 : 1} />
              {labelled.has(p.id) && !dim && (
                <text x={cx} y={cy - r - 6} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}>{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- columns

export interface Series { key: string; label: string; color: string }
export interface ColumnDatum { label: string; values: Record<string, number>; note?: string; muted?: boolean }

/** Vertical columns, stacked when there is more than one series, with an optional
 *  reference line (a target). */
export function Columns({ data, series, format, height = 280, target, targetLabel }: {
  data: ColumnDatum[]; series: Series[]; format: Fmt; height?: number;
  target?: number[] | null; targetLabel?: string;
}) {
  const fmt = FMT[format];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const m = { t: 14, r: 12, b: 34, l: 58 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;
  const totals = data.map((d) => series.reduce((a, s) => a + Math.max(0, d.values[s.key] ?? 0), 0));
  const yt = niceTicks(Math.max(1, ...totals, ...(target ?? [])) * 1.05);
  const top = yt[yt.length - 1];
  const ys = (v: number) => m.t + H - (v / top) * H;
  const band = W / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(46, band * 0.62));
  const every = Math.ceil(data.length / Math.max(1, Math.floor(W / 56)));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img">
        <g className="grid">{yt.map((v) => <line key={v} x1={m.l} x2={m.l + W} y1={ys(v)} y2={ys(v)} />)}</g>
        <g className="axis">
          {yt.map((v) => <text key={v} x={m.l - 8} y={ys(v) + 4} textAnchor="end">{fmt(v)}</text>)}
          {data.map((d, i) => i % every === 0 && <text key={i} x={m.l + band * i + band / 2} y={m.t + H + 18} textAnchor="middle">{d.label}</text>)}
        </g>
        {data.map((d, i) => {
          let acc = 0;
          const x = m.l + band * i + (band - bw) / 2;
          const segs = series.map((s) => {
            const v = Math.max(0, d.values[s.key] ?? 0);
            const y0 = ys(acc); acc += v; const y1 = ys(acc);
            return { s, v, y: y1, h: Math.max(0, y0 - y1) };
          }).filter((g) => g.h > 0);
          return (
            <g key={i}
              onMouseEnter={() => setTip({
                x: x + bw / 2, y: ys(totals[i]),
                content: <><b>{d.label}</b>{series.map((s) => <div key={s.key}><span className="k">{s.label}</span> {fmt(d.values[s.key] ?? 0)}</div>)}
                  {series.length > 1 && <div><span className="k">Total</span> {fmt(totals[i])}</div>}
                  {target?.[i] != null && <div><span className="k">{targetLabel ?? 'Target'}</span> {fmt(target[i])}</div>}
                  {d.note && <div className="k">{d.note}</div>}</>,
              })}>
              <rect x={m.l + band * i} y={m.t} width={band} height={H} fill="transparent" />
              {segs.map((g, j) => (
                <rect key={g.s.key} x={x} y={g.y + (j < segs.length - 1 ? 0 : 0)} width={bw} height={Math.max(1, g.h - (j > 0 ? 2 : 0))}
                  rx={j === segs.length - 1 ? Math.min(4, bw / 3) : 0} fill={g.s.color} opacity={d.muted ? 0.4 : 1} />
              ))}
            </g>
          );
        })}
        {target && target.length === data.length && (
          <polyline fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="5 4"
            points={target.map((t, i) => `${m.l + band * i + band / 2},${ys(t)}`).join(' ')} />
        )}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------- lines

export interface LineSeries { key: string; label: string; color: string; values: Array<number | null>; dashed?: boolean }

/** Lines over a shared x axis with a crosshair tooltip. Direct-labelled at the end. */
export function Lines({ labels, series, format, height = 300 }: { labels: string[]; series: LineSeries[]; format: Fmt; height?: number }) {
  const fmt = FMT[format];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { t: 16, r: 96, b: 34, l: 62 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const yt = niceTicks(Math.max(1, ...all) * 1.05);
  const top = yt[yt.length - 1];
  const n = labels.length;
  const xs = (i: number) => m.l + (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const ys = (v: number) => m.t + H - (v / top) * H;
  const every = Math.ceil(n / Math.max(1, Math.floor(W / 60)));
  const path = (vals: Array<number | null>) => {
    let d = ''; let pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xs(i)},${ys(v)} `; pen = true; });
    return d;
  };
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHi(null)}>
      <svg width={width} height={height} role="img">
        <g className="grid">{yt.map((v) => <line key={v} x1={m.l} x2={m.l + W} y1={ys(v)} y2={ys(v)} />)}</g>
        <g className="axis">
          {yt.map((v) => <text key={v} x={m.l - 8} y={ys(v) + 4} textAnchor="end">{fmt(v)}</text>)}
          {labels.map((l, i) => i % every === 0 && <text key={i} x={xs(i)} y={m.t + H + 18} textAnchor="middle">{l}</text>)}
        </g>
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2.25} strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) => {
          const last = s.values.reduce<number>((a, v, i) => (v != null ? i : a), -1);
          if (last < 0) return null;
          return (
            <g key={s.key}>
              <circle cx={xs(last)} cy={ys(s.values[last]!)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
              <text x={xs(last) + 8} y={ys(s.values[last]!) + 4} style={{ fontSize: 11.5, fontWeight: 700, fill: 'var(--ink-2)' }}>{s.label}</text>
            </g>
          );
        })}
        {hi != null && (
          <g>
            <line x1={xs(hi)} x2={xs(hi)} y1={m.t} y2={m.t + H} stroke="var(--ink-4)" strokeWidth={1} />
            {series.map((s) => s.values[hi] != null && <circle key={s.key} cx={xs(hi)} cy={ys(s.values[hi]!)} r={5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={m.l} y={m.t} width={W} height={H} fill="transparent" onMouseMove={onMove} />
      </svg>
      {hi != null && (
        <TipBox tip={{
          x: xs(hi), y: m.t + 8,
          content: <><b>{labels[hi]}</b>{series.map((s) => <div key={s.key}><span className="k">{s.label}</span> {s.values[hi] == null ? 'N/A' : fmt(s.values[hi]!)}</div>)}</>,
        }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

/** Grid of cells on the Lucid yellow to tangerine ramp. */
export function Heatmap({ rows, cols, data, format, rowLabelWidth = 120 }: {
  rows: Array<{ key: string; label: string }>; cols: Array<{ key: string; label: string }>;
  data: Record<string, Record<string, number>>; format: Fmt; rowLabelWidth?: number;
}) {
  const fmt = FMT[format];
  const value = (r: string, c: string) => data[r]?.[c] ?? 0;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const cells = rows.flatMap((r) => cols.map((c) => value(r.key, c.key)));
  const max = Math.max(0, ...cells);
  const cw = Math.max(10, (width - rowLabelWidth) / Math.max(1, cols.length));
  const ch = Math.min(30, Math.max(18, cw * 0.7));
  const height = rows.length * ch + 24;
  const step = (v: number) => (v <= 0 || !max ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999)));
  const every = Math.ceil(cols.length / Math.max(1, Math.floor((width - rowLabelWidth) / 34)));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img">
        {rows.map((r, i) => (
          <g key={r.key}>
            <text x={rowLabelWidth - 8} y={i * ch + ch / 2 + 4} textAnchor="end" className="axis" style={{ fontSize: 11.5 }}>{r.label}</text>
            {cols.map((c, j) => {
              const v = value(r.key, c.key);
              const x = rowLabelWidth + j * cw;
              const y = i * ch;
              return (
                <rect key={c.key} x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} rx={3} fill={`var(--heat-${step(v)})`}
                  onMouseEnter={() => setTip({ x: x + cw / 2, y, content: <><b>{r.label}</b><div><span className="k">{c.label}</span> {fmt(v)}</div></> })} />
              );
            })}
          </g>
        ))}
        {cols.map((c, j) => j % every === 0 && (
          <text key={c.key} x={rowLabelWidth + j * cw + cw / 2} y={rows.length * ch + 16} textAnchor="middle" className="axis">{c.label}</text>
        ))}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

export function HeatLegend({ low = 'Less', high = 'More' }: { low?: string; high?: string }) {
  return (
    <div className="legend" aria-hidden>
      <span>{low}</span>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: `var(--heat-${i})`, width: 16 }} />)}
      <span>{high}</span>
    </div>
  );
}
