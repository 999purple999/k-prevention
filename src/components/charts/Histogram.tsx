/** Istogramma del capitale finale all'orizzonte scelto, con la porzione sotto la
 *  soglia di rovina colorata di rosso. */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { CHART, axisTick } from './theme.tsx';
import { fmtEUR } from '../../lib/format.ts';

export function Histogram({ samples, ruinThreshold, bins = 50 }: { samples: number[]; ruinThreshold: number; bins?: number }) {
  if (!samples.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of samples) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) max = min + 1;
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of samples) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const rows = counts.map((c, i) => {
    const x0 = min + i * width;
    return { x0, mid: x0 + width / 2, count: c, belowRuin: x0 + width <= ruinThreshold };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="mid" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => fmtEUR(v)} minTickGap={40} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as { x0: number; count: number };
            return (
              <div className="panel rounded-lg px-3 py-2 text-xs">
                <div className="tnum">≈ {fmtEUR(r.x0)}</div>
                <div style={{ color: 'rgb(var(--text-dim))' }}>{r.count} scenari</div>
              </div>
            );
          }}
        />
        <ReferenceLine x={ruinThreshold} stroke={CHART.ruin} strokeDasharray="5 4" label={{ value: 'rovina', fill: CHART.ruin, fontSize: 10, position: 'top' }} />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.belowRuin ? CHART.ruin : CHART.accentDeep} fillOpacity={r.belowRuin ? 0.85 : 0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
