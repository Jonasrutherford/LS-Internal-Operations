export const money = (n: number, cents = false) =>
  (n < 0 ? '-' : '') +
  Math.abs(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  });

/** Compact money for chart axes: $1.2k, $15k, $1.1M. */
export const moneyShort = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}k` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? '-' : ''}$${s}`;
};

/** 1.5 h style, one decimal. */
export const hours = (seconds: number, digits = 1) => `${(seconds / 3600).toFixed(digits)} h`;

/** 2h 05m style for durations a person reads, such as a single entry. */
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? 'N/A' : `${(x * 100).toFixed(digits)}%`;

export const minutesLabel = (m: number | null | undefined) => {
  if (m == null) return 'Not set';
  if (m < 60) return `${Math.round(m * 10) / 10} min`;
  const h = m / 60;
  return `${Math.round(h * 100) / 100} h`;
};

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export const SOURCE_LABEL: Record<string, string> = {
  measured: 'Measured', estimate: 'Estimate', benchmark: 'Benchmark', contract: 'Contract-defined',
};

export const REL_LABEL: Record<string, string> = {
  direct: 'Direct revenue', pipeline: 'Pipeline', operational: 'Operational',
};

export const REL_HELP: Record<string, string> = {
  direct: 'Delivering paid work for a client',
  pipeline: 'Winning, growing or keeping revenue',
  operational: 'Running Lucid Studio',
};

export const ENTITY_LABEL: Record<string, string> = { client: 'Client', prospect: 'Prospect', partner: 'Partner' };
export const ELIG_LABEL: Record<string, string> = { internal: 'Internal', external: 'External', both: 'Both' };
