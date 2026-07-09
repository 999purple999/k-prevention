/** Palette e primitive comuni ai grafici (leggibili in tema chiaro e scuro). */
import type { ReactNode } from 'react';
import { fmtEUR } from '../../lib/format.ts';

export const CHART = {
  accent: '#22cee9',
  accentDeep: '#0891b2',
  bandOuter: 'rgba(34, 206, 233, 0.14)',
  bandInner: 'rgba(34, 206, 233, 0.26)',
  median: '#22cee9',
  ruin: '#ef4444',
  tax: '#f59e0b',
  expense: '#64748b',
  unforeseen: '#fb7185',
  income: '#34d399',
  grid: 'rgba(148,163,184,0.16)',
  axis: '#94a3b8',
  neg: '#f87171',
  pos: '#34d399',
};

export const axisTick = { fill: CHART.axis, fontSize: 11 };

export function ChartCard({ title, subtitle, right, children, tall }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; tall?: boolean }) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div style={{ height: tall ? 320 : 240 }}>{children}</div>
    </div>
  );
}

export function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name?: string; value?: number | number[]; color?: string; dataKey?: string }[];
  label?: string;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatter ?? fmtEUR;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-panel" style={{ background: 'rgb(var(--panel))' }}>
      {label && <div className="mb-1 font-semibold">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((p, i) => {
          const v = Array.isArray(p.value) ? p.value : p.value;
          const display = Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(Number(v));
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: 'rgb(var(--text-dim))' }}>
                <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="tnum font-medium">{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
