/** Disegna la FORMA di una distribuzione in tempo reale (sparkline della densità).
 *  Muovere sigma di una lognormale senza vedere la coda significa non capire cosa si fa. */
import { useMemo } from 'react';
import { sample } from '../engine/distributions.ts';
import { mulberry32 } from '../engine/random.ts';
import type { DistributionInput } from '../engine/types.ts';
import { CHART } from './charts/theme.tsx';

export function Sparkline({ dist, width = 220, height = 52, bins = 44 }: { dist: DistributionInput; width?: number; height?: number; bins?: number }) {
  const path = useMemo(() => {
    try {
      const rng = mulberry32(20260101);
      const n = 6000;
      const vals: number[] = new Array(n);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = sample(dist, rng);
        vals[i] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
      // ritaglia la coda al 99.5° percentile per non appiattire la forma
      vals.sort((a, b) => a - b);
      const hi = vals[Math.floor(n * 0.995)];
      const lo = vals[Math.floor(n * 0.005)];
      const range = hi - lo || 1;
      const counts = new Array(bins).fill(0);
      for (const v of vals) {
        let idx = Math.floor(((v - lo) / range) * bins);
        if (idx < 0) idx = 0;
        if (idx >= bins) idx = bins - 1;
        counts[idx]++;
      }
      const cmax = Math.max(...counts) || 1;
      const pts = counts.map((c, i) => {
        const x = (i / (bins - 1)) * width;
        const y = height - (c / cmax) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return { line: `M0,${height} L${pts.join(' L')} L${width},${height} Z`, stroke: `M${pts.join(' L')}` };
    } catch {
      return null;
    }
  }, [dist, width, height, bins]);

  if (!path) return <div style={{ height }} className="flex items-center text-xs" >—</div>;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CHART.accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={CHART.accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={path.line} fill="url(#spark)" />
      <path d={path.stroke} fill="none" stroke={CHART.accent} strokeWidth="1.6" />
    </svg>
  );
}
