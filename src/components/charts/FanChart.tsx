/** Fan chart del capitale cumulato: banda p10–p90, banda p25–p75, mediana come linea.
 *  Una singola linea butterebbe via l'intera ragione della simulazione Monte Carlo. */
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { SimulationOutput } from '../../engine/types.ts';
import { CHART, axisTick, CustomTooltip } from './theme.tsx';
import { monthLabel, fmtEUR } from '../../lib/format.ts';

export function FanChart({ output, horizon, ruinThreshold, preview }: { output: SimulationOutput; horizon: number; ruinThreshold: number; preview: boolean }) {
  const rows = output.monthlyResults.slice(0, horizon).map((m) => ({
    label: monthLabel(m.date),
    outer: [m.cumulativeCapital.p10, m.cumulativeCapital.p90] as [number, number],
    inner: [m.cumulativeCapital.p25, m.cumulativeCapital.p75] as [number, number],
    p50: m.cumulativeCapital.p50,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtEUR(v)} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="outer" name="p10–p90" stroke="none" fill={CHART.bandOuter} isAnimationActive={!preview} connectNulls />
        <Area type="monotone" dataKey="inner" name="p25–p75" stroke="none" fill={CHART.bandInner} isAnimationActive={!preview} connectNulls />
        <Line type="monotone" dataKey="p50" name="mediana" stroke={CHART.median} strokeWidth={preview ? 1.5 : 2.4} strokeDasharray={preview ? '4 3' : undefined} dot={false} isAnimationActive={!preview} />
        <ReferenceLine y={ruinThreshold} stroke={CHART.ruin} strokeDasharray="5 4" strokeWidth={1.3} label={{ value: 'soglia di rovina', fill: CHART.ruin, fontSize: 10, position: 'insideBottomLeft' }} />
        <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.35} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
