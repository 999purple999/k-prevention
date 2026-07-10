/**
 * Proiezione a lungo termine con FINESTRE TEMPORALI COMPARABILI. Gira UNA sola simulazione
 * all'orizzonte massimo (30 anni) e le viste a 1/5/10/20/30 anni sono fette dello stesso run:
 * i primi 12 mesi della proiezione a 30 anni sono ESATTAMENTE gli stessi (stesso seed).
 * Mostra cassa, fondo investimento e patrimonio netto.
 */
import { useMemo, useState } from 'react';
import { useData } from '../lib/data.tsx';
import { useProjection } from '../hooks/useProjection.ts';
import { FanChart } from './charts/FanChart.tsx';
import { ChartCard } from './charts/theme.tsx';
import { Spinner, Help } from './ui.tsx';
import { fmtEUR, fmtPct } from '../lib/format.ts';

const WINDOWS = [
  { label: '1 anno', months: 12 },
  { label: '5 anni', months: 60 },
  { label: '10 anni', months: 120 },
  { label: '20 anni', months: 240 },
  { label: '30 anni', months: 360 },
];
const HORIZONS = WINDOWS.map((w) => w.months);

export function ProjectionPanel() {
  const { data, buildSimulationInput } = useData();
  const proj = useProjection();
  const [win, setWin] = useState(12);
  const [iters, setIters] = useState(2000);
  const input = useMemo(() => buildSimulationInput(), [buildSimulationInput]);
  const fund = !!data?.simulationConfig.investmentAccount?.enabled;
  const ruin = data?.simulationConfig.ruinThresholdEUR ?? 0;

  const out = proj.output;
  const atWin = out ? out.monthlyResults[Math.min(win, out.monthlyResults.length) - 1] : null;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Proiezione a lungo termine</h2>
          <Help text="Una sola simulazione fino a 30 anni: le finestre 1/5/10/20/30 anni sono fette dello STESSO run, quindi davvero comparabili (stesso seed, stesse estrazioni). Isola la sezione temporale che vuoi." />
        </div>
        <div className="flex items-center gap-2">
          <select className="field !w-auto !py-1 text-xs" value={iters} onChange={(e) => setIters(Number(e.target.value))} title="Più iterazioni = più preciso ma più lento">
            <option value={1000}>1.000 scenari</option>
            <option value={2000}>2.000 scenari</option>
            <option value={4000}>4.000 scenari</option>
          </select>
          <button className="btn-primary !py-1.5 text-sm" disabled={!input || proj.running} onClick={() => input && proj.run(input, HORIZONS, iters)}>
            {proj.running ? <Spinner /> : null}
            {out ? 'Ricalcola' : 'Proietta a 30 anni'}
          </button>
        </div>
      </div>

      {proj.running && (
        <div className="mt-3">
          <div className="mb-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Proiezione in corso… {Math.round(proj.progress * 100)}%</div>
          <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgb(var(--border))' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(proj.progress * 100)}%`, background: 'rgb(var(--accent))' }} />
          </div>
        </div>
      )}
      {proj.error && <div className="mt-3 text-xs" style={{ color: 'rgb(var(--danger))' }}>{proj.error}</div>}

      {!out && !proj.running && (
        <p className="mt-2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          Proietta il tuo piano fino a 30 anni{fund ? ' con il conto investimento' : ''} e isola la finestra temporale che vuoi vedere — le viste restano comparabili perché sono lo stesso identico run.
        </p>
      )}

      {out && (
        <>
          <div className="mt-3 inline-flex flex-wrap overflow-hidden rounded-lg" style={{ border: '1px solid rgb(var(--border-strong))' }}>
            {WINDOWS.map((w) => (
              <button key={w.months} onClick={() => setWin(w.months)} className="px-3 py-1.5 text-sm font-medium transition"
                style={win === w.months ? { background: 'rgb(var(--accent))', color: '#04141a' } : { color: 'rgb(var(--text-dim))' }}>
                {w.label}
              </button>
            ))}
          </div>

          {atWin && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={fund ? 'Patrimonio netto' : 'Cassa'} value={fmtEUR((fund && atWin.netWorth ? atWin.netWorth : atWin.cumulativeCapital).p50)} accent />
              {fund && <Kpi label="di cui fondo" value={fmtEUR(atWin.investmentBalance?.p50 ?? 0)} />}
              <Kpi label="Cassa" value={fmtEUR(atWin.cumulativeCapital.p50)} tone={atWin.cumulativeCapital.p50 < ruin ? 'danger' : undefined} />
              <Kpi label="Prob. cassa negativa" value={fmtPct(atWin.probabilityOfNegativeCapital)} tone={atWin.probabilityOfNegativeCapital > 0.3 ? 'danger' : undefined} />
            </div>
          )}

          <div className="mt-3">
            <ChartCard
              title={fund ? 'Patrimonio netto (cassa + fondo)' : 'Cassa cumulata'}
              subtitle={`Finestra ${WINDOWS.find((w) => w.months === win)?.label} · fetta dello stesso run a 30 anni · ${out.meta.iterations.toLocaleString('it-IT')} scenari`}
              tall
            >
              <FanChart output={out} horizon={win} ruinThreshold={ruin} preview={false} metric={fund ? 'netWorth' : 'capital'} showFund={fund} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: 'danger' }) {
  const color = tone === 'danger' ? 'rgb(var(--danger))' : accent ? 'rgb(var(--accent))' : 'rgb(var(--text))';
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'rgb(var(--panel-2))' }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold tnum" style={{ color }}>{value}</div>
    </div>
  );
}
