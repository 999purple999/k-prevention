/**
 * Modalità DEMO statica (build con VITE_DEMO=1, per GitHub Pages).
 * L'app gira interamente nel browser: nessun backend, nessuna cifratura reale, dati di
 * esempio precaricati (quelli di Francesco). Le modifiche persistono in localStorage.
 * La build di produzione (Cloud Run) NON usa nulla di tutto questo.
 */
import dataset from '../../data/francesco_dataset.json';
import type { UserData } from './data.tsx';
import { emptyLedger } from './ledger.ts';

export const DEMO: boolean = import.meta.env.VITE_DEMO === '1';

const DEMO_KEY = 'kp_demo_userdata';

export function demoUserData(): UserData {
  const ds = dataset as unknown as Record<string, unknown>;
  return {
    profile: { name: 'Francesco Pernice', email: 'francesco.pernice@k-prevention.app' },
    incomeStreams: ds.incomeStreams as UserData['incomeStreams'],
    expenses: ds.expenses as UserData['expenses'],
    organicParameters: ds.organicParameters as UserData['organicParameters'],
    taxModel: { ...(ds.taxModel as UserData['taxModel']), _unverified: (ds._unverified as never) ?? [] },
    simulationConfig: ds.simulationConfig as UserData['simulationConfig'],
    monteCarlo: ds.monteCarlo as UserData['monteCarlo'],
    ledger: emptyLedger(),
    goals: [],
  };
}

export function loadDemoData(): UserData {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved) return { ...demoUserData(), ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return demoUserData();
}

export function saveDemoData(data: UserData) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function resetDemoData() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
}
