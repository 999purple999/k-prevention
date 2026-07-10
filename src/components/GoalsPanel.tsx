/** Obiettivi personali + valutazione live sul risultato corrente. Avvisi proattivi. */
import { useMemo, useState } from 'react';
import { useData } from '../lib/data.tsx';
import { evaluateGoals, newGoalId, type Goal, type GoalKind, type GoalStatus } from '../lib/goals.ts';
import type { SimulationOutput } from '../engine/types.ts';
import { Help } from './ui.tsx';

const STATUS_VAR: Record<GoalStatus, string> = { ok: '--ok', warn: '--warn', fail: '--danger' };
const STATUS_TXT: Record<GoalStatus, string> = { ok: 'in linea', warn: 'a rischio', fail: 'fuori rotta' };

export function GoalsPanel({ output }: { output: SimulationOutput }) {
  const { data, save, readOnly } = useData();
  const goals = data?.goals ?? [];
  const evals = useMemo(() => evaluateGoals(goals, output), [goals, output]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<GoalKind>('ruinBelow');
  const [target, setTarget] = useState('15');
  const [horizon, setHorizon] = useState(36);

  const horizons = data?.simulationConfig.simulationHorizons ?? [12, 24, 36];

  const add = async () => {
    const t = parseFloat(target.replace(',', '.'));
    if (!Number.isFinite(t)) return;
    const g: Goal = {
      id: newGoalId(),
      kind,
      target: kind === 'ruinBelow' ? t / 100 : t,
      horizon: kind === 'capitalAtLeast' ? horizon : undefined,
      createdAt: Date.now(),
    };
    await save('goals', [...goals, g]);
    setAdding(false);
    setTarget(kind === 'ruinBelow' ? '15' : kind === 'runwayAtLeast' ? '8' : '20000');
  };

  const remove = async (id: string) => { await save('goals', goals.filter((g) => g.id !== id)); };

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Obiettivi</h2>
          <Help text="Fissa traguardi (rovina, capitale, autonomia): l'app li valuta a ogni simulazione e ti avvisa quando sono a rischio." />
        </div>
        {!readOnly && !adding && (
          <button className="btn-ghost text-sm" onClick={() => setAdding(true)}>+ Obiettivo</button>
        )}
      </div>

      {goals.length === 0 && !adding && (
        <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          Nessun obiettivo. Fissane uno — es. «rovina sotto il 15%» o «≥ 20.000€ a 36 mesi» — per avvisi automatici.
        </p>
      )}

      <div className="space-y-2">
        {evals.map((e) => (
          <div key={e.goal.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'rgb(var(--panel-2))' }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(${STATUS_VAR[e.status]}))` }} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{e.label}</div>
                <div className="text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>{e.detail}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: `rgb(var(${STATUS_VAR[e.status]}))` }}>{STATUS_TXT[e.status]}</span>
              {!readOnly && <button className="text-xs opacity-60 hover:opacity-100" title="Rimuovi" onClick={() => remove(e.goal.id)}>✕</button>}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg p-3" style={{ background: 'rgb(var(--panel-2))' }}>
          <select className="field w-full text-sm" value={kind} onChange={(ev) => setKind(ev.target.value as GoalKind)}>
            <option value="ruinBelow">Probabilità di rovina sotto il…</option>
            <option value="capitalAtLeast">Capitale mediano almeno…</option>
            <option value="runwayAtLeast">Autonomia mediana almeno…</option>
          </select>
          <div className="flex items-center gap-2">
            <input className="field w-full text-sm" inputMode="decimal" value={target} onChange={(ev) => setTarget(ev.target.value)}
              placeholder={kind === 'ruinBelow' ? '15' : kind === 'runwayAtLeast' ? '8' : '20000'} />
            <span className="text-sm" style={{ color: 'rgb(var(--text-dim))' }}>{kind === 'ruinBelow' ? '%' : kind === 'runwayAtLeast' ? 'mesi' : '€'}</span>
            {kind === 'capitalAtLeast' && (
              <select className="field text-sm" value={horizon} onChange={(ev) => setHorizon(Number(ev.target.value))}>
                {horizons.map((h) => <option key={h} value={h}>{h}m</option>)}
              </select>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setAdding(false)}>Annulla</button>
            <button className="btn-primary text-sm" onClick={add}>Aggiungi</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Banner compatto: appare solo se ci sono obiettivi a rischio. Avviso proattivo. */
export function GoalAlertBanner({ output }: { output: SimulationOutput }) {
  const { data } = useData();
  const goals = data?.goals ?? [];
  const evals = useMemo(() => evaluateGoals(goals, output), [goals, output]);
  const atRisk = evals.filter((e) => e.status !== 'ok');
  if (atRisk.length === 0) return null;
  const worst = atRisk.some((e) => e.status === 'fail') ? 'fail' : 'warn';
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: `rgb(var(${STATUS_VAR[worst]}) / 0.12)`, border: `1px solid rgb(var(${STATUS_VAR[worst]}) / 0.4)` }}>
      <span>{worst === 'fail' ? '🔴' : '🟠'}</span>
      <span style={{ color: `rgb(var(${STATUS_VAR[worst]}))` }} className="font-medium">
        {atRisk.length} {atRisk.length === 1 ? 'obiettivo' : 'obiettivi'} {worst === 'fail' ? 'fuori rotta' : 'a rischio'}:
      </span>
      <span className="min-w-0 truncate" style={{ color: 'rgb(var(--text-dim))' }}>{atRisk.map((e) => e.label).join(' · ')}</span>
    </div>
  );
}
