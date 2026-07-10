/**
 * Analisi di sensibilità (tornado): per ogni fattore chiave lo si porta a un estremo
 * "sfavorevole" e a uno "favorevole", si ri-simula, e si misura di quanto si muove la
 * probabilità di rovina. Le leve con lo swing maggiore sono quelle su cui agire davvero.
 * Puro e deterministico (stesso seed → stesso risultato).
 */
import { simulate } from './simulate.ts';
import { normalizeDist } from './distributions.ts';
import type { SimulationInput, Distribution, DistributionInput } from './types.ts';

export interface SensitivityRow {
  key: string;
  label: string;
  hint: string;
  baseRuin: number;
  lowRuin: number; // estremo favorevole (rovina più bassa)
  highRuin: number; // estremo sfavorevole (rovina più alta)
  swing: number; // |high - low| — l'impatto del fattore
}

/** Scala il valore centrale di una distribuzione (value/median/mode/mean e min/max). */
function scaleDist(d: DistributionInput, factor: number): Distribution {
  const dist = { ...normalizeDist(d) } as Distribution & Record<string, number>;
  for (const k of ['value', 'median', 'mode', 'mean', 'min', 'max', 'scaleMin', 'scaleMax']) {
    if (typeof dist[k] === 'number') dist[k] = dist[k] * factor;
  }
  return dist as Distribution;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

interface Factor {
  key: string;
  label: string;
  hint: string;
  fav: (i: SimulationInput) => SimulationInput; // scenario favorevole
  unfav: (i: SimulationInput) => SimulationInput; // scenario sfavorevole
}

const FACTORS: Factor[] = [
  {
    key: 'initialCapital',
    label: 'Capitale iniziale',
    hint: '±30% sul capitale di partenza.',
    fav: (i) => ({ ...i, simulationConfig: { ...i.simulationConfig, initialCapital: i.simulationConfig.initialCapital * 1.3 } }),
    unfav: (i) => ({ ...i, simulationConfig: { ...i.simulationConfig, initialCapital: i.simulationConfig.initialCapital * 0.7 } }),
  },
  {
    key: 'income',
    label: 'Ricavi (tutte le fonti)',
    hint: '±20% su tutti gli importi di reddito.',
    fav: (i) => ({ ...i, incomeStreams: clone(i.incomeStreams).map((s) => ({ ...s, amount: scaleDist(s.amount, 1.2) })) }),
    unfav: (i) => ({ ...i, incomeStreams: clone(i.incomeStreams).map((s) => ({ ...s, amount: scaleDist(s.amount, 0.8) })) }),
  },
  {
    key: 'expenses',
    label: 'Spese ricorrenti',
    hint: '±20% su tutti gli importi di spesa.',
    fav: (i) => ({ ...i, expenses: clone(i.expenses).map((e) => ({ ...e, amount: scaleDist(e.amount, 0.8) })) }),
    unfav: (i) => ({ ...i, expenses: clone(i.expenses).map((e) => ({ ...e, amount: scaleDist(e.amount, 1.2) })) }),
  },
  {
    key: 'unforeseenFreq',
    label: 'Frequenza imprevisti',
    hint: '±50% sul tasso di eventi imprevisti al mese.',
    fav: (i) => scaleOrganic(i, (o) => (o.unforeseenEvents.arrivals = scaleDist(o.unforeseenEvents.arrivals, 0.5))),
    unfav: (i) => scaleOrganic(i, (o) => (o.unforeseenEvents.arrivals = scaleDist(o.unforeseenEvents.arrivals, 1.5))),
  },
  {
    key: 'unforeseenCost',
    label: 'Costo imprevisti',
    hint: '±40% sulla severità mediana degli imprevisti.',
    fav: (i) => scaleOrganic(i, (o) => (o.unforeseenEvents.severity = scaleDist(o.unforeseenEvents.severity, 0.6))),
    unfav: (i) => scaleOrganic(i, (o) => (o.unforeseenEvents.severity = scaleDist(o.unforeseenEvents.severity, 1.4))),
  },
  {
    key: 'dropPersistence',
    label: 'Persistenza mesi brutti',
    hint: 'Da 1,0 (mesi brutti isolati) a 2,5 (il trimestre disastroso).',
    fav: (i) => scaleOrganic(i, (o) => (o.productivityDrop.persistenceFactor = 1.0)),
    unfav: (i) => scaleOrganic(i, (o) => (o.productivityDrop.persistenceFactor = 2.5)),
  },
  {
    key: 'paymentDelay',
    label: 'Ritardi di pagamento',
    hint: '±50% sul ritardo tipico di incasso.',
    fav: (i) => scaleOrganic(i, (o) => (o.clientPaymentDelayDays = scaleDist(o.clientPaymentDelayDays, 0.5))),
    unfav: (i) => scaleOrganic(i, (o) => (o.clientPaymentDelayDays = scaleDist(o.clientPaymentDelayDays, 1.5))),
  },
  {
    key: 'focusCorrelation',
    label: 'Correlazione focus↔reddito',
    hint: 'Da 0 (indipendenti) a 0,7 (i mesi brutti diventano brutti due volte).',
    fav: (i) => scaleOrganic(i, (o) => (o.incomeFocusCorrelation = 0)),
    unfav: (i) => scaleOrganic(i, (o) => (o.incomeFocusCorrelation = 0.7)),
  },
];

function scaleOrganic(i: SimulationInput, mutate: (o: SimulationInput['organicParameters']) => void): SimulationInput {
  const o = clone(i.organicParameters);
  mutate(o);
  return { ...i, organicParameters: o };
}

export interface SensitivityOptions {
  iterations?: number;
  onProgress?: (done: number, total: number) => void;
}

export function sensitivity(input: SimulationInput, opts: SensitivityOptions = {}): { baseRuin: number; rows: SensitivityRow[] } {
  const iterations = opts.iterations ?? 2500;
  const withIter = (i: SimulationInput): SimulationInput => ({ ...i, monteCarlo: { ...i.monteCarlo, iterations } });
  const ruin = (i: SimulationInput) => simulate(withIter(i)).aggregateResult.probabilityOfRuin;

  const baseRuin = ruin(input);
  const rows: SensitivityRow[] = [];
  const total = FACTORS.length * 2 + 1;
  let done = 1;
  opts.onProgress?.(done, total);
  for (const f of FACTORS) {
    const lowRuin = ruin(f.fav(input));
    done++; opts.onProgress?.(done, total);
    const highRuin = ruin(f.unfav(input));
    done++; opts.onProgress?.(done, total);
    rows.push({ key: f.key, label: f.label, hint: f.hint, baseRuin, lowRuin, highRuin, swing: Math.abs(highRuin - lowRuin) });
  }
  rows.sort((a, b) => b.swing - a.swing);
  return { baseRuin, rows };
}
