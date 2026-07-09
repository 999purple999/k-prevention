/** Editor compatto di una Distribution: sceglie il tipo e ne mostra i parametri. */
import type { Distribution, DistributionInput } from '../engine/types.ts';
import { normalizeDist } from '../engine/distributions.ts';

type DistKind = Distribution['dist'];

const KINDS: { value: DistKind; label: string }[] = [
  { value: 'fixed', label: 'Fisso' },
  { value: 'triangular', label: 'Triangolare' },
  { value: 'lognormal', label: 'Lognormale' },
  { value: 'normal', label: 'Normale' },
  { value: 'uniform', label: 'Uniforme' },
  { value: 'beta', label: 'Beta' },
  { value: 'poisson', label: 'Poisson' },
  { value: 'bernoulli', label: 'Bernoulli' },
];

function defaultsFor(kind: DistKind, prev: Distribution): Distribution {
  const v = (prev as { value?: number }).value ?? (prev as { median?: number }).median ?? (prev as { mode?: number }).mode ?? 100;
  switch (kind) {
    case 'fixed': return { dist: 'fixed', value: v };
    case 'uniform': return { dist: 'uniform', min: v * 0.7, max: v * 1.3 };
    case 'triangular': return { dist: 'triangular', min: v * 0.6, mode: v, max: v * 1.6 };
    case 'normal': return { dist: 'normal', mean: v, sd: Math.max(1, v * 0.2), clampMin: null, clampMax: null };
    case 'lognormal': return { dist: 'lognormal', median: Math.max(1, v), sigma: 0.5, clampMax: null };
    case 'beta': return { dist: 'beta', alpha: 6, beta: 2.6, scaleMin: 0.1, scaleMax: 1 };
    case 'poisson': return { dist: 'poisson', lambda: 0.3 };
    case 'bernoulli': return { dist: 'bernoulli', p: 0.5 };
  }
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number | null | undefined; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>{label}</span>
      <input type="number" step={step} className="field !py-1.5 tnum" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function DistributionEditor({ value, onChange, unit = '€' }: { value: DistributionInput; onChange: (d: Distribution) => void; unit?: string }) {
  const d = normalizeDist(value);
  const set = (patch: Partial<Distribution>) => onChange({ ...d, ...patch } as Distribution);

  return (
    <div className="space-y-2">
      <select
        className="field !py-1.5"
        value={d.dist}
        onChange={(e) => onChange(defaultsFor(e.target.value as DistKind, d))}
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>{k.label}</option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        {d.dist === 'fixed' && <Num label={`Valore (${unit})`} value={d.value} onChange={(v) => set({ value: v })} />}
        {d.dist === 'uniform' && (<><Num label="Min" value={d.min} onChange={(v) => set({ min: v })} /><Num label="Max" value={d.max} onChange={(v) => set({ max: v })} /></>)}
        {d.dist === 'triangular' && (<><Num label="Min" value={d.min} onChange={(v) => set({ min: v })} /><Num label="Moda" value={d.mode} onChange={(v) => set({ mode: v })} /><Num label="Max" value={d.max} onChange={(v) => set({ max: v })} /></>)}
        {d.dist === 'normal' && (<><Num label="Media" value={d.mean} onChange={(v) => set({ mean: v })} /><Num label="Dev. std" value={d.sd} onChange={(v) => set({ sd: v })} /></>)}
        {d.dist === 'lognormal' && (<><Num label="Mediana" value={d.median} onChange={(v) => set({ median: v })} /><Num label="Sigma" value={d.sigma} step={0.05} onChange={(v) => set({ sigma: v })} /></>)}
        {d.dist === 'beta' && (<><Num label="Alpha" value={d.alpha} step={0.1} onChange={(v) => set({ alpha: v })} /><Num label="Beta" value={d.beta} step={0.1} onChange={(v) => set({ beta: v })} /><Num label="Min" value={d.scaleMin} step={0.05} onChange={(v) => set({ scaleMin: v })} /><Num label="Max" value={d.scaleMax} step={0.05} onChange={(v) => set({ scaleMax: v })} /></>)}
        {d.dist === 'poisson' && <Num label="Lambda" value={d.lambda} step={0.05} onChange={(v) => set({ lambda: v })} />}
        {d.dist === 'bernoulli' && <Num label="p" value={d.p} step={0.05} onChange={(v) => set({ p: v })} />}
      </div>
    </div>
  );
}
