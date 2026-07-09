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
import { fmtEUR, fmtPct, fmtNum1 } from '../lib/format.ts';

interface CompareCol {
  label: string;
  out: SimulationOutput;
}

export function Scenarios() {
  const { data, save, scenariosRev } = useData();
  const { encryptFor, decryptFor } = useSession();
  const [list, setList] = useState<SimulationMeta[]>([]);
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [compare, setCompare] = useState<CompareCol[] | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await api.listSimulations());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
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
      await api.saveSimulation(nm, ciphertext, iv, mainId, list.length === 0);
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
        await api.saveSimulation(it.name, ciphertext, iv, null, false);
      }
      await refresh();
      if (!items.length) alert('Nessuno scenario valido nel file.');
    } catch {
      alert('File non valido.');
    } finally {
      setBusy('');
    }
  };

  const runCompare = async () => {
    setBusy('compare');
    try {
      const cols: CompareCol[] = [];
      cols.push({ label: 'Attuale (workspace)', out: simulate(inputFromModel(modelFromData(data)), { iterationsOverride: 2000 }) });
      for (const id of compareSel) {
        const meta = list.find((s) => s.id === id);
        const model = await getModel(id);
        cols.push({ label: meta?.name ?? 'Scenario', out: simulate(inputFromModel(model), { iterationsOverride: 2000 }) });
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
          <h1 className="text-2xl font-semibold tracking-tight">Scenari</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
            Rami del tuo piano. Salva l'attuale come ramo, confronta, promuovi il migliore a principale — come su Git.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Importa</button>
          <button className="btn-ghost" onClick={exportAll} disabled={!list.length || busy === 'exportAll'}>{busy === 'exportAll' ? <Spinner /> : null}Esporta tutti</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
      </div>

      {/* Salva attuale */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label mb-1">Salva lo stato attuale come nuovo scenario</label>
            <input className="field" placeholder="Nome (es. «senza Apollo», «studio a settembre»)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrent()} />
          </div>
          <button className="btn-primary" onClick={saveCurrent} disabled={busy === 'save'}>{busy === 'save' ? <Spinner /> : null}+ Salva ramo</button>
        </div>
      </div>

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
          {compare && <CompareTable cols={compare} />}
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

function CompareTable({ cols }: { cols: CompareCol[] }) {
  const h = 36;
  const rows: { label: string; get: (o: SimulationOutput) => string; best?: 'min' | 'max' }[] = [
    { label: 'Probabilità di rovina', get: (o) => fmtPct(o.aggregateResult.probabilityOfRuin), best: 'min' },
    { label: `Capitale p50 · ${h}m`, get: (o) => fmtEUR(o.aggregateResult.capitalAtHorizon[String(h)]?.p50 ?? 0), best: 'max' },
    { label: 'Capitale p10 · ' + h + 'm', get: (o) => fmtEUR(o.aggregateResult.capitalAtHorizon[String(h)]?.p10 ?? 0), best: 'max' },
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
