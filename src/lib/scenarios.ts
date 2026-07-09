/** Scenari (stile Git): uno snapshot completo del modello di pianificazione. */
import type { UserData } from './data.tsx';
import type { SimulationInput } from '../engine/types.ts';
import { anchorInput, type Ledger } from './ledger.ts';

export interface ScenarioModel {
  incomeStreams: UserData['incomeStreams'];
  expenses: UserData['expenses'];
  organicParameters: UserData['organicParameters'];
  taxModel: UserData['taxModel'];
  simulationConfig: UserData['simulationConfig'];
  monteCarlo: UserData['monteCarlo'];
  ledger: Ledger;
}

export const SCENARIO_TYPES = ['incomeStreams', 'expenses', 'organicParameters', 'taxModel', 'simulationConfig', 'monteCarlo', 'ledger'] as const;

/** Estrae lo snapshot del modello dai dati correnti (esclude il profilo). */
export function modelFromData(data: UserData): ScenarioModel {
  return {
    incomeStreams: data.incomeStreams,
    expenses: data.expenses,
    organicParameters: data.organicParameters,
    taxModel: data.taxModel,
    simulationConfig: data.simulationConfig,
    monteCarlo: data.monteCarlo,
    ledger: data.ledger,
  };
}

/** Costruisce l'input di simulazione da uno scenario (ri-ancorato al consuntivo). */
export function inputFromModel(m: ScenarioModel): SimulationInput {
  return anchorInput(
    {
      simulationConfig: m.simulationConfig,
      incomeStreams: m.incomeStreams,
      expenses: m.expenses,
      organicParameters: m.organicParameters,
      taxModel: m.taxModel,
      monteCarlo: m.monteCarlo,
    },
    m.ledger,
  );
}

/** Valida grossolanamente un modello importato. */
export function isScenarioModel(o: unknown): o is ScenarioModel {
  if (!o || typeof o !== 'object') return false;
  const m = o as Record<string, unknown>;
  return Array.isArray(m.incomeStreams) && Array.isArray(m.expenses) && !!m.taxModel && !!m.simulationConfig && !!m.monteCarlo;
}
