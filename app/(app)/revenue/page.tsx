import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { revenueShareByClient, money } from '@/lib/finance';
import type { RevenueLine } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  await requireAdmin();
  const supabase = await createClient();

  const [linesRes, clientsRes] = await Promise.all([
    supabase.from('revenue_lines').select('*').eq('deleted', false).order('date', { ascending: false }),
    supabase.from('clients').select('id, name'),
  ]);

  const lines = (linesRes.data ?? []) as RevenueLine[];
  const names = new Map((clientsRes.data ?? []).map((c) => [c.id, c.name]));
  const shares = revenueShareByClient(lines);
  const total = lines.reduce((a, l) => a + Number(l.amount), 0);

  return (
    <>
      <header><div className="eyebrow">Finances</div><h1>Revenue</h1></header>

      <section style={{ marginTop: 18 }}>
        <h2>Revenue share by client</h2>
        {shares.length === 0 ? (
          <div className="panel muted" style={{ padding: 20, marginTop: 8 }}>
            No revenue recorded yet. Nothing is estimated here, so this stays empty
            until real lines are entered.
          </div>
        ) : (
          <div className="panel" style={{ padding: 16, marginTop: 8 }}>
            {/* Share bars use the Lucid orange ramp. Client brand colours are applied
                only on that client's own charts, section 36. */}
            <div style={{ display: 'grid', gap: 9 }}>
              {shares.map((s, i) => (
                <div key={s.client_id ?? 'none'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{s.client_id ? names.get(s.client_id) ?? 'Unknown' : 'Unattributed'}</span>
                    <span className="num">{money(s.amount)} · {Math.round(s.share * 100)}%</span>
                  </div>
                  <div style={{ height: 7, background: 'var(--panel-2)', borderRadius: 999, marginTop: 4 }}>
                    <div style={{
                      width: `${s.share * 100}%`, height: '100%', borderRadius: 999,
                      background: `var(--heat-${Math.min(5, 5 - Math.min(4, i))})`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
              <span className="eyebrow">Total</span>
              <span className="num" style={{ fontFamily: 'var(--f-display)', fontWeight: 600 }}>{money(total)}</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
