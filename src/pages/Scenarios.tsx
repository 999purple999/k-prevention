/** Scenari stile Git: rami del modello di pianificazione. Salva l'attuale come ramo,
 *  confronta due scenari, promuovi il migliore a principale, importa/esporta. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '../lib/data.tsx';
import { useSession } from '../lib/session.tsx';
import { api, type SimulationMeta } from '../lib/api.ts';
import { modelFromData, inputFromModel, isScenarioModel, SCENARIO_TYPES, type ScenarioModel } from '../lib/scenarios.ts';
import { simulate } from '../engine/simulate.ts';
import type { SimulationOutput } from '../engine/types.ts';
import { Spinner } from '../components/ui.tsx';
import { fmtEUR, fmtPct, fmtNum1, monthLabel } from '../lib/format.ts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART, axisTick, CustomTooltip } from '../components/charts/theme.tsx';

interface CompareCol {
  label: string;
  out: SimulationOutput;
}

const COMPARE_SEED = 20260101;
const COMPARE_HORIZONS = [12, 60, 120, 240, 360];
const COMPARE_WINDOWS = [
  { label: '1 anno', months: 12 },
  { label: '5 anni', months: 60 },
  { label: '10 anni', months: 120 },
  { label: '20 anni', months: 240 },
  { label: '30 anni', months: 360 },
];
const SERIES_COLORS = ['#22cee9', '#f59e0b', '#a78bfa'];

export function Scenarios() {
  const { data, save, scenariosRev, workspaces, activeWorkspace, isConsolidato } = useData();
  const { encryptFor, decryptFor } = useSession();
  const [list, setList] = useState<SimulationMeta[]>([]);
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [compare, setCompare] = useState<CompareCol[] | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [compareWin, setCompareWin] = useState(60);
  const fileRef = useRef<HTMLInputElement>(null);
  const ws = workspaces.find((w) => w.id === activeWorkspace);

  const refresh = useCallback(async () => {
    if (isConsolidato) { setList([]); return; }
    try {
      setList(await api.listSimulations(activeWorkspace));
    } catch {
      /* ignore */
    }
  }, [activeWorkspace, isConsolidato]);

  useEffect(() => {
    setCompare(null);
    setCompareSel([]);
    void refresh();
  }, [refresh, scenariosRev]);

  if (!data) return null;

  const mainId = list.find((s) => s.isMain)?.id ?? null;

  const getModel = async (id: string): Promise<ScenarioModel> => {
    const s = await api.getSimulation(id);
    return (await decryptFor('simulations', s.encryptedBlob, s.iv)) as ScenarioModel;
  };

  const saveCurrent = async () => {
    const nm = name.trim() || `Scenario ${new Date().toLocaleDateString('it-IT')}`;
    setBusy('save');
    try {
      const { ciphertext, iv } = await encryptFor('simulations', modelFromData(data));
      await api.saveSimulation(nm, ciphertext, iv, mainId, list.length === 0, activeWorkspace);
      setName('');
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const loadIntoWorkspace = async (id: string) => {
    setBusy(id);
    try {
      const model = await getModel(id);
      for (const t of SCENARIO_TYPES) await save(t, model[t] as never);
    } finally {
      setBusy('');
    }
  };

  const promote = async (id: string) => {
    setBusy(id);
    try {
      await loadIntoWorkspace(id);
      await api.promoteSimulation(id);
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const rename = async (id: string, current: string) => {
    const nn = prompt('Nuovo nome scenario', current);
    if (!nn) return;
    await api.updateSimulation(id, { name: nn });
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo scenario?')) return;
    await api.deleteSimulation(id);
    await refresh();
  };

  const overwriteWithCurrent = async (id: string) => {
    setBusy(id);
    try {
      const { ciphertext, iv } = await encryptFor('simulations', modelFromData(data));
      await api.updateSimulation(id, { encryptedBlob: ciphertext, iv });
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const exportOne = async (id: string, nm: string) => {
    const model = await getModel(id);
    downloadJson(`${slug(nm)}.json`, { _meta: { schemaVersion: '1.0.0', generatedBy: 'k-prevention-scenario', name: nm }, ...model });
  };

  const exportAll = async () => {
    setBusy('exportAll');
    try {
      const all = [];
      for (const s of list) all.push({ name: s.name, isMain: s.isMain, model: await getModel(s.id) });
      downloadJson('k-prevention-scenari.json', { _meta: { schemaVersion: '1.0.0', generatedBy: 'k-prevention-scenari' }, scenarios: all });
    } finally {
      setBusy('');
    }
  };

  const onImport = async (file: File) => {
    setBusy('import');
    try {
      const parsed = JSON.parse(await file.text());
      const items: { name: string; model: ScenarioModel }[] = [];
      if (Array.isArray(parsed.scenarios)) {
        for (const s of parsed.scenarios) if (isScenarioModel(s.model)) items.push({ name: s.name || 'Importato', model: s.model });
      } else if (isScenarioModel(parsed)) {
        items.push({ name: (parsed as { _meta?: { name?: string } })._meta?.name || file.name.replace(/\.json$/, ''), model: parsed });
      }
      for (const it of items) {
        const { ciphertext, iv } = await encryptFor('simulations', it.model);
        await api.saveSimulation(it.name, ciphertext, iv, null, false, activeWorkspace);
      }
      await refresh();
      if (!items.length) alert('Nessuno scenario valido nel file.');
    } catch {
      alert('File non valido.');
    } finally {
      setBusy('');
    }
  };

  // Confronto: TUTTI gli scenari girano allo stesso orizzonte massimo E con lo STESSO seed,
  // così le proiezioni sono davvero comparabili (le differenze vengono dal modello, non dal
  // rumore Monte Carlo). Le finestre 1/5/10/20/30 anni sono fette dello stesso run.
  const runCompare = async () => {
    setBusy('compare');
    try {
      const runOne = (model: ScenarioModel, label: string): CompareCol => {
        const inp = inputFromModel(model);
        return {
          label,
          out: simulate(
            {
              ...inp,
              monteCarlo: { ...inp.monteCarlo, seed: COMPARE_SEED },
              simulationConfig: { ...inp.simulationConfig, simulationHorizons: COMPARE_HORIZONS },
            },
            { iterationsOverride: 1500 },
          ),
        };
      };
      const cols: CompareCol[] = [runOne(modelFromData(data), 'Attuale (workspace)')];
      for (const id of compareSel) {
        const meta = list.find((s) => s.id === id);
        cols.push(runOne(await getModel(id), meta?.name ?? 'Scenario'));
      }
      setCompare(cols);
    } finally {
      setBusy('');
    }
  };

  const toggleCompare = (id: string) => setCompareSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : [s[1], id]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Scenari</h1>
            {ws && (
              <span className="chip inline-flex items-center gap-1.5" style={{ borderColor: ws.color }} title="Gli scenari sono separati per ogni workspace">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: ws.color }} />
                {ws.emoji} {ws.name}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
            Rami del tuo piano, separati per ogni workspace. Salva l'attuale come ramo, confronta, promuovi il migliore a principale — come su Git.
          </p>
        </div>
        {!isConsolidato && (
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Importa</button>
            <button className="btn-ghost" onClick={exportAll} disabled={!list.length || busy === 'exportAll'}>{busy === 'exportAll' ? <Spinner /> : null}Esporta tutti</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
        )}
      </div>

      {isConsolidato ? (
        <div className="panel p-8 text-center text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
          La vista Consolidata è in sola lettura: seleziona un workspace specifico per salvare e confrontare scenari.
        </div>
      ) : (
      /* Salva attuale */
      <div className="panel p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label mb-1">Salva lo stato attuale come nuovo scenario</label>
            <input className="field" placeholder="Nome (es. «senza Apollo», «studio a settembre»)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrent()} />
          </div>
          <button className="btn-primary" onClick={saveCurrent} disabled={busy === 'save'}>{busy === 'save' ? <Spinner /> : null}+ Salva ramo</button>
        </div>
      </div>
      )}

      {/* Confronto */}
      {compareSel.length > 0 && (
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Confronto: <strong>Attuale</strong>{compareSel.map((id) => ` · ${list.find((s) => s.id === id)?.name}`)}</span>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1 text-xs" onClick={() => { setCompareSel([]); setCompare(null); }}>Pulisci</button>
              <button className="btn-primary !py-1 text-xs" onClick={runCompare} disabled={busy === 'compare'}>{busy === 'compare' ? <Spinner /> : null}Confronta</button>
            </div>
          </div>
          {compare && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Finestra temporale (stessa per tutti gli scenari):</span>
                <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid rgb(var(--border-strong))' }}>
                  {COMPARE_WINDOWS.map((w) => (
                    <button key={w.months} onClick={() => setCompareWin(w.months)} className="px-2.5 py-1 text-xs font-medium transition"
                      style={compareWin === w.months ? { background: 'rgb(var(--accent))', color: '#04141a' } : { color: 'rgb(var(--text-dim))' }}>
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <CompareChart cols={compare} win={compareWin} />
              <CompareTable cols={compare} h={compareWin} />
              <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>
                Tutti gli scenari usano lo stesso seed e lo stesso run a 30 anni: le finestre sono fette dello stesso identico run, quindi comparabili. Se un scenario ha un conto investimento, la linea è il patrimonio netto (cassa + fondo).
              </p>
            </>
          )}
        </div>
      )}

      {/* Lista scenari */}
      <div className="space-y-2">
        {list.length === 0 && <div className="panel p-8 text-center text-sm" style={{ color: 'rgb(var(--text-dim))' }}>Nessuno scenario salvato. Salva lo stato attuale qui sopra per creare il primo ramo.</div>}
        {list.map((s) => (
          <div key={s.id} className="panel-flat p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={compareSel.includes(s.id)} onChange={() => toggleCompare(s.id)} />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {s.isMain && <span className="chip !py-0 text-[10px]" style={{ color: '#34d399', borderColor: 'rgb(16 185 129 / 0.4)' }}>principale</span>}
                </div>
                <div className="text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>agg. {new Date(s.updatedAt).toLocaleString('it-IT')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button className="btn-ghost !py-1 text-xs" onClick={() => loadIntoWorkspace(s.id)} disabled={busy === s.id}>{busy === s.id ? <Spinner /> : null}Carica</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => promote(s.id)} disabled={busy === s.id} title="Carica nello workspace e imposta come principale">Promuovi</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => overwriteWithCurrent(s.id)} title="Sovrascrivi con lo stato attuale (commit)">↑ Aggiorna</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => rename(s.id, s.name)}>Rinomina</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => exportOne(s.id, s.name)}>Esporta</button>
                <button className="btn-danger !py-1 text-xs" onClick={() => remove(s.id)}>Elimina</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sovrappone la mediana (patrimonio netto se c'è un fondo, altrimenti cassa) di ogni
 *  scenario sullo STESSO asse temporale, tagliato alla finestra scelta. */
function CompareChart({ cols, win }: { cols: CompareCol[]; win: number }) {
  const anyFund = cols.some((c) => c.out.monthlyResults.some((m) => m.netWorth));
  const n = Math.min(win, ...cols.map((c) => c.out.monthlyResults.length));
  const rows: Record<string, number | string>[] = [];
  for (let m = 0; m < n; m++) {
    const row: Record<string, number | string> = { label: monthLabel(cols[0].out.monthlyResults[m].date) };
    cols.forEach((c, i) => {
      const mr = c.out.monthlyResults[m];
      row[`s${i}`] = (anyFund && mr.netWorth ? mr.netWorth : mr.cumulativeCapital).p50;
    });
    rows.push(row);
  }
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {cols.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5" style={{ color: 'rgb(var(--text-dim))' }}>
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {c.label}
          </span>
        ))}
        <span className="ml-auto">{anyFund ? 'patrimonio netto (mediana)' : 'cassa (mediana)'}</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtEUR(v)} />
            <Tooltip content={<CustomTooltip />} />
            {cols.map((c, i) => (
              <Line key={i} type="monotone" dataKey={`s${i}`} name={c.label} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2.2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompareTable({ cols, h }: { cols: CompareCol[]; h: number }) {
  const nw = (o: SimulationOutput) => o.aggregateResult.netWorthAtHorizon?.[String(h)]?.p50;
  const rows: { label: string; get: (o: SimulationOutput) => string; best?: 'min' | 'max' }[] = [
    { label: 'Probabilità di rovina', get: (o) => fmtPct(o.aggregateResult.probabilityOfRuin), best: 'min' },
    { label: `Patrimonio netto p50 · ${h}m`, get: (o) => fmtEUR(nw(o) ?? o.aggregateResult.capitalAtHorizon[String(h)]?.p50 ?? 0), best: 'max' },
    { label: `Cassa p50 · ${h}m`, get: (o) => fmtEUR(o.aggregateResult.capitalAtHorizon[String(h)]?.p50 ?? 0), best: 'max' },
    { label: `Cassa p10 · ${h}m`, get: (o) => fmtEUR(o.aggregateResult.capitalAtHorizon[String(h)]?.p10 ?? 0), best: 'max' },
    { label: 'Autonomia mediana', get: (o) => `${fmtNum1(o.aggregateResult.expectedRunwayMonths.p50)} mesi`, best: 'max' },
    { label: 'Avvisi attivi', get: (o) => String(o.aggregateResult.activeFlags.length), best: 'min' },
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'rgb(var(--text-dim))' }}>
            <th className="p-2 text-left font-medium"></th>
            {cols.map((c, i) => <th key={i} className="p-2 text-right font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t" style={{ borderColor: 'rgb(var(--border))' }}>
              <td className="p-2" style={{ color: 'rgb(var(--text-dim))' }}>{r.label}</td>
              {cols.map((c, i) => <td key={i} className="p-2 text-right tnum font-medium">{r.get(c.out)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario';
}
function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
