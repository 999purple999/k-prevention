/**
 * Obiettivi personali + valutazione. L'utente fissa traguardi ("rovina sotto il 15%",
 * "almeno 20.000€ a 36 mesi", "autonomia di almeno 8 mesi") e l'app li valuta sul
 * risultato corrente della simulazione, generando avvisi proattivi.
 */
import type { SimulationOutput } from '../engine/types.ts';

export type GoalKind = 'ruinBelow' | 'capitalAtLeast' | 'runwayAtLeast';
export type GoalStatus = 'ok' | 'warn' | 'fail';

export interface Goal {
  id: string;
  kind: GoalKind;
  target: number; // ruinBelow: frazione 0..1 · capitalAtLeast: EUR · runwayAtLeast: mesi
  horizon?: number; // solo capitalAtLeast
  createdAt: number;
}

export interface GoalEval {
  goal: Goal;
  status: GoalStatus;
  actual: number;
  label: string;
  detail: string;
}

export const GOAL_META: Record<GoalKind, { label: string; unit: string; higherIsBetter: boolean }> = {
  ruinBelow: { label: 'Probabilità di rovina sotto', unit: '%', higherIsBetter: false },
  capitalAtLeast: { label: 'Capitale mediano almeno', unit: '€', higherIsBetter: true },
  runwayAtLeast: { label: 'Autonomia mediana almeno', unit: 'mesi', higherIsBetter: true },
};

export function newGoalId(): string {
  let s = '';
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** Valuta un obiettivo. `warn` = entro il 15% dal traguardo ma non ancora raggiunto. */
export function evaluateGoal(goal: Goal, out: SimulationOutput): GoalEval {
  const agg = out.aggregateResult;
  const m = GOAL_META[goal.kind];
  let actual: number;
  let label: string;
  let detail: string;
  let status: GoalStatus;

  if (goal.kind === 'ruinBelow') {
    actual = agg.probabilityOfRuin;
    label = `Rovina sotto il ${Math.round(goal.target * 100)}%`;
    if (actual <= goal.target) status = 'ok';
    else if (actual <= goal.target * 1.15 + 0.02) status = 'warn';
    else status = 'fail';
    detail = `attuale ${Math.round(actual * 100)}%`;
  } else if (goal.kind === 'capitalAtLeast') {
    const h = goal.horizon ?? 36;
    actual = agg.capitalAtHorizon[String(h)]?.p50 ?? 0;
    label = `≥ ${eur(goal.target)} a ${h} mesi`;
    if (actual >= goal.target) status = 'ok';
    else if (actual >= goal.target * 0.85) status = 'warn';
    else status = 'fail';
    detail = `mediana ${eur(actual)}`;
  } else {
    actual = agg.expectedRunwayMonths.p50;
    label = `Autonomia ≥ ${goal.target} mesi`;
    if (actual >= goal.target) status = 'ok';
    else if (actual >= goal.target * 0.85) status = 'warn';
    else status = 'fail';
    detail = `attuale ${actual.toFixed(1)} mesi`;
  }
  void m;
  return { goal, status, actual, label, detail };
}

export function evaluateGoals(goals: Goal[], out: SimulationOutput): GoalEval[] {
  return goals.map((g) => evaluateGoal(g, out));
}

function eur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}
