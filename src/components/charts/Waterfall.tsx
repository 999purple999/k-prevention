/** Waterfall di un singolo mese: incassato → spese → imprevisti → imposte → netto. */
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell, ReferenceLine } from 'recharts';
import type { MonthlyResult } from '../../engine/types.ts';
import { CHART, axisTick } from './theme.tsx';
import { fmtEUR, monthLabel } from '../../lib/format.ts';

export function Waterfall({ month }: { month: MonthlyResult }) {
  const steps = [
    { name: 'Incassato', delta: month.cashIncomeReceived.p50, color: CHART.income },
    { name: 'Spese', delta: -month.totalExpensesCash.p50, color: CHART.expense },
    { name: 'Imprevisti', delta: -month.unforeseenCosts.p50, color: CHART.unforeseen },
    { name: 'Imposte', delta: -month.taxesPaidCash.p50, color: CHART.tax },
  ];
  let cum = 0;
  const rows = steps.map((s) => {
    const start = cum;
    cum += s.delta;
    return { name: s.name, base: Math.min(start, cum), value: Math.abs(s.delta), color: s.color, delta: s.delta };
  });
  rows.push({ name: 'Netto', base: Math.min(0, cum), value: Math.abs(cum), color: cum >= 0 ? CHART.accent : CHART.neg, delta: cum });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtEUR(v)} />
        <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.4} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as { name: string; delta: number };
            return (
              <div className="panel rounded-lg px-3 py-2 text-xs">
                <div className="font-semibold">{r.name}</div>
                <div className="tnum">{r.delta >= 0 ? '+' : ''}{fmtEUR(r.delta)}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="value" stackId="w" radius={[2, 2, 2, 2]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function waterfallTitle(month: MonthlyResult) {
  return `Scomposizione di ${monthLabel(month.date)}`;
}
