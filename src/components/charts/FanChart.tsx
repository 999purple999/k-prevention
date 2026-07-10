/** Fan chart del capitale cumulato: banda p10–p90, banda p25–p75, mediana come linea.
 *  Una singola linea butterebbe via l'intera ragione della simulazione Monte Carlo. */
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { SimulationOutput } from '../../engine/types.ts';
import { CHART, axisTick, CustomTooltip } from './theme.tsx';
import { monthLabel, fmtEUR } from '../../lib/format.ts';

export function FanChart({
  output,
  horizon,
  ruinThreshold,
  preview,
  metric = 'capital',
  showFund = false,
  startMonth = 0,
}: {
  output: SimulationOutput;
  horizon: number;
  ruinThreshold: number;
  preview: boolean;
  /** Quale grandezza mostrare nel fascio: cassa cumulata o patrimonio netto (cassa+fondo). */
  metric?: 'capital' | 'netWorth';
  /** Se true, sovrappone la linea del fondo investimento (mediana). */
  showFund?: boolean;
  /** Primo mese della finestra (per isolare una sezione temporale dello STESSO run). */
  startMonth?: number;
}) {
  const pick = (m: (typeof output.monthlyResults)[number]) =>
    metric === 'netWorth' && m.netWorth ? m.netWorth : m.cumulativeCapital;
  const rows = output.monthlyResults.slice(startMonth, horizon).map((m) => ({
    label: monthLabel(m.date),
    outer: [pick(m).p10, pick(m).p90] as [number, number],
    inner: [pick(m).p25, pick(m).p75] as [number, number],
    p50: pick(m).p50,
    fund: showFund && m.investmentBalance ? m.investmentBalance.p50 : undefined,
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
        <Line type="monotone" dataKey="p50" name={metric === 'netWorth' ? 'patrimonio (mediana)' : 'mediana'} stroke={CHART.median} strokeWidth={preview ? 1.5 : 2.4} strokeDasharray={preview ? '4 3' : undefined} dot={false} isAnimationActive={!preview} />
        {showFund && <Line type="monotone" dataKey="fund" name="fondo" stroke={CHART.pos} strokeWidth={1.8} dot={false} isAnimationActive={!preview} connectNulls />}
        <ReferenceLine y={ruinThreshold} stroke={CHART.ruin} strokeDasharray="5 4" strokeWidth={1.3} label={{ value: 'soglia di rovina', fill: CHART.ruin, fontSize: 10, position: 'insideBottomLeft' }} />
        <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.35} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
