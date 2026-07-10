import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data.tsx';
import { useSimulation } from '../hooks/useSimulation.ts';
import { validateTaxModel } from '../engine/tax.ts';
import { RiskPanel } from '../components/RiskPanel.tsx';
import { SensitivityPanel } from '../components/SensitivityPanel.tsx';
import { PlanVsActual } from '../components/PlanVsActual.tsx';
import { FanChart } from '../components/charts/FanChart.tsx';
import { CashflowBars } from '../components/charts/CashflowBars.tsx';
import { Histogram } from '../components/charts/Histogram.tsx';
import { Waterfall, waterfallTitle } from '../components/charts/Waterfall.tsx';
import { ChartCard } from '../components/charts/theme.tsx';
import { IncomeManager } from '../components/managers/IncomeManager.tsx';
import { ExpenseManager } from '../components/managers/ExpenseManager.tsx';
import { OrganicSliders } from '../components/managers/OrganicSliders.tsx';
import { TaxSelector } from '../components/managers/TaxSelector.tsx';
import { Spinner } from '../components/ui.tsx';
import { fmtEUR, monthLabel } from '../lib/format.ts';

const TABS = [
  { id: 'redditi', label: 'Redditi' },
  { id: 'spese', label: 'Spese' },
  { id: 'organici', label: 'Parametri organici' },
  { id: 'fiscalita', label: 'Fiscalità' },
  { id: 'scenario', label: 'Scenario' },
] as const;

export function Dashboard() {
  const { data, loading, error, save, buildSimulationInput, isConsolidato } = useData();
  const sim = useSimulation();
  const [horizon, setHorizon] = useState(36);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('redditi');
  const [wfMonth, setWfMonth] = useState<number | null>(null);
  const ranOnce = useRef(false);

  const input = useMemo(() => buildSimulationInput(), [buildSimulationInput]);
  const inputKey = input ? JSON.stringify(input) : null;

  const blocked = useMemo(() => {
    if (!input) return { blocked: true, msg: 'Nessun dato.' };
    try {
      validateTaxModel(input.taxModel);
      if (input.incomeStreams.filter((s) => s.enabled !== false).length === 0)
        return { blocked: true, msg: 'Aggiungi almeno una fonte di reddito.' };
      return { blocked: false, msg: '' };
    } catch (e) {
      return { blocked: true, msg: e instanceof Error ? e.message : 'Configurazione fiscale incompleta.' };
    }
  }, [input]);

  const horizons = data?.simulationConfig.simulationHorizons ?? [12, 24, 36];
  useEffect(() => {
    if (!horizons.includes(horizon)) setHorizon(horizons[horizons.length - 1]);
  }, [horizons, horizon]);

  // Prima esecuzione: simulazione completa. Poi ogni modifica → anteprima con debounce.
  useEffect(() => {
    if (!input || blocked.blocked) return;
    if (!ranOnce.current) {
      ranOnce.current = true;
      sim.run(input, 'full');
      return;
    }
    const t = setTimeout(() => sim.run(input, 'preview'), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, blocked.blocked]);

  const out = sim.output;
  const preview = sim.mode === 'preview';
  const worst = out?.aggregateResult.worstMonthIndex ?? 0;
  const wfIndex = wfMonth ?? worst;

  if (loading && !data) {
    return <div className="flex items-center justify-center gap-2 py-24 text-sm" style={{ color: 'rgb(var(--text-dim))' }}><Spinner /> Decifratura dei tuoi dati…</div>;
  }

  const incomeSum = data?.incomeStreams.filter((s) => s.enabled !== false).length ?? 0;
  const expenseSum = data?.expenses.filter((e) => e.enabled !== false).length ?? 0;
  const realCapital = data?.ledger?.currentCapital ?? null;
  const asOfMonth = data?.ledger?.asOfMonth ?? null;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ciao, {data?.profile?.name?.split(' ')[0] ?? 'utente'}.</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
            {incomeSum} fonti di reddito · {expenseSum} spese attive ·{' '}
            {realCapital != null ? (
              <>saldo reale <span className="font-semibold" style={{ color: 'rgb(var(--text))' }}>{fmtEUR(realCapital)}</span></>
            ) : (
              <>capitale iniziale {fmtEUR(data?.simulationConfig.initialCapital ?? 0)}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/registra" className="btn-ghost">Registra</Link>
          <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid rgb(var(--border-strong))' }}>
            {horizons.map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className="px-3 py-1.5 text-sm font-medium transition"
                style={horizon === h ? { background: 'rgb(var(--accent))', color: '#04141a' } : { color: 'rgb(var(--text-dim))' }}>
                {h}m
              </button>
            ))}
          </div>
          <button className="btn-primary" disabled={blocked.blocked || sim.running} onClick={() => input && sim.run(input, 'full')}>
            {sim.running && !preview ? <Spinner /> : null}
            Simula
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgb(239 68 68 / 0.12)', color: '#fca5a5' }}>{error}</div>}

      {isConsolidato && (
        <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)', color: 'rgb(var(--text-dim))' }}>
          <strong style={{ color: 'rgb(var(--accent))' }}>Vista consolidata</strong> · redditi e spese di tutti i tuoi workspace insieme, in sola lettura.
          Il modello fiscale è quello del workspace «Personale»: il fisco combinato tra regimi diversi è un'approssimazione, usa la vista per l'overview di cassa.
        </div>
      )}

      {blocked.blocked ? (
        <div className="panel p-8 text-center">
          <p className="text-sm" style={{ color: 'rgb(var(--text-dim))' }}>{blocked.msg}</p>
          <p className="mt-2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
            Completa la configurazione qui sotto, oppure <Link to="/import" style={{ color: 'rgb(var(--accent))' }}>importa un modello</Link>.
          </p>
        </div>
      ) : out ? (
        <>
          <RiskPanel output={out} horizon={horizon} preview={preview} />

          {asOfMonth && <PlanVsActual month={asOfMonth} />}

          {sim.running && preview && (
            <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgb(var(--border))' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(sim.progress * 100)}%`, background: 'rgb(var(--accent))' }} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <ChartCard title="Capitale cumulato — fascio di traiettorie" subtitle={`Banda p10–p90 e p25–p75, mediana come linea · orizzonte ${horizon} mesi · ${out.meta.iterations.toLocaleString('it-IT')} scenari${preview ? ' (anteprima)' : ''}`} tall
                right={<span className="chip">{out.meta.runtimeMs ? `${out.meta.runtimeMs} ms` : ''}</span>}>
                <FanChart output={out} horizon={horizon} ruinThreshold={data!.simulationConfig.ruinThresholdEUR} preview={preview} />
              </ChartCard>
            </div>

            <div className="lg:col-span-2">
              <ChartCard title="Flusso di cassa mensile (mediana)" subtitle="Incasso, spese, imprevisti e imposte in cassa — i picchi di giugno e novembre sono le scadenze fiscali.">
                <CashflowBars output={out} horizon={horizon} />
              </ChartCard>
            </div>
            <ChartCard title={`Capitale finale · ${horizon}m`} subtitle={`${(out.samples.capitalAtHorizon[String(horizon)]?.length ?? 0).toLocaleString('it-IT')} scenari; in rosso sotto la soglia di rovina.`}>
              <Histogram samples={out.samples.capitalAtHorizon[String(horizon)] ?? []} ruinThreshold={data!.simulationConfig.ruinThresholdEUR} />
            </ChartCard>

            <div className="lg:col-span-3">
              <ChartCard title={waterfallTitle(out.monthlyResults[wfIndex])} subtitle="Scomposizione del mese: incassato → spese → imprevisti → imposte → netto."
                right={
                  <select className="field !w-auto !py-1 text-xs" value={wfIndex} onChange={(e) => setWfMonth(Number(e.target.value))}>
                    {out.monthlyResults.slice(0, horizon).map((m, i) => (
                      <option key={i} value={i}>{monthLabel(m.date)}{i === worst ? ' · mese peggiore' : ''}</option>
                    ))}
                  </select>
                }>
                <Waterfall month={out.monthlyResults[wfIndex]} />
              </ChartCard>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'rgb(var(--text-dim))' }}><Spinner /> Prima simulazione in corso…</div>
      )}

      {/* Analisi di sensibilità */}
      {data && !isConsolidato && !blocked.blocked && <SensitivityPanel />}

      {/* Editors */}
      {data && !isConsolidato && (
        <div className="panel p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className="rounded-lg px-3 py-1.5 text-sm font-medium transition"
                style={tab === t.id ? { background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border-strong))' } : { color: 'rgb(var(--text-dim))' }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'redditi' && <IncomeManager streams={data.incomeStreams} onChange={(s) => save('incomeStreams', s)} />}
          {tab === 'spese' && <ExpenseManager expenses={data.expenses} onChange={(e) => save('expenses', e)} forfettario={data.taxModel.regime === 'forfettario'} />}
          {tab === 'organici' && <OrganicSliders org={data.organicParameters} onChange={(o) => save('organicParameters', o)} />}
          {tab === 'fiscalita' && <TaxSelector tax={data.taxModel} onChange={(t) => save('taxModel', t)} />}
          {tab === 'scenario' && <ScenarioEditor />}
        </div>
      )}
    </div>
  );
}

function ScenarioEditor() {
  const { data, save } = useData();
  if (!data) return null;
  const c = data.simulationConfig;
  const mc = data.monteCarlo;
  const setC = (patch: Partial<typeof c>) => save('simulationConfig', { ...c, ...patch });
  const setMC = (patch: Partial<typeof mc>) => save('monteCarlo', { ...mc, ...patch });
  const Field = ({ label, value, onChange, step = 100, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string }) => (
    <label className="block">
      <span className="label mb-1">{label}</span>
      <div className="relative">
        <input type="number" step={step} className="field tnum" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>{suffix}</span>}
      </div>
    </label>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Capitale iniziale" value={c.initialCapital} onChange={(v) => setC({ initialCapital: v })} suffix="€" />
      <Field label="Soglia di rovina" value={c.ruinThresholdEUR} onChange={(v) => setC({ ruinThresholdEUR: v })} suffix="€" />
      <Field label="Autonomia minima" value={c.liquidityWarningMonths ?? 3} onChange={(v) => setC({ liquidityWarningMonths: v })} step={1} suffix="mesi" />
      <label className="block">
        <span className="label mb-1">Data di inizio</span>
        <input type="date" className="field" value={c.startDate} onChange={(e) => setC({ startDate: e.target.value })} />
      </label>
      <Field label="Iterazioni" value={mc.iterations} onChange={(v) => setMC({ iterations: v })} step={500} />
      <Field label="Seed" value={mc.seed} onChange={(v) => setMC({ seed: v })} step={1} />
    </div>
  );
}
