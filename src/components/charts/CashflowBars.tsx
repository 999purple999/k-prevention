/** Barre del flusso di cassa mensile (mediana): incasso positivo, uscite in negativo,
 *  con le IMPOSTE IN CASSA evidenziate — i picchi di giugno e novembre saltano all'occhio. */
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import type { SimulationOutput } from '../../engine/types.ts';
import { CHART, axisTick, CustomTooltip } from './theme.tsx';
import { monthLabel, fmtEUR } from '../../lib/format.ts';

export function CashflowBars({ output, horizon }: { output: SimulationOutput; horizon: number }) {
  const rows = output.monthlyResults.slice(0, horizon).map((m) => ({
    label: monthLabel(m.date),
    incasso: m.cashIncomeReceived.p50,
    spese: -m.totalExpensesCash.p50,
    imprevisti: -m.unforeseenCosts.p50,
    imposte: -m.taxesPaidCash.p50,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} stackOffset="sign">
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtEUR(v)} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.4} />
        <Bar dataKey="incasso" name="incasso" stackId="a" fill={CHART.income} radius={[2, 2, 0, 0]} />
        <Bar dataKey="spese" name="spese" stackId="a" fill={CHART.expense} />
        <Bar dataKey="imprevisti" name="imprevisti" stackId="a" fill={CHART.unforeseen} />
        <Bar dataKey="imposte" name="imposte in cassa" stackId="a" fill={CHART.tax}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.imposte < 0 ? CHART.tax : 'transparent'} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
