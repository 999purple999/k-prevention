/**
 * Preset: bundle di parametri applicabili con un click per riconfigurare velocemente il
 * MODELLO (assunzioni organiche, buffer, fisco, precisione). NON toccano i tuoi redditi e
 * spese reali: quelli restano i tuoi. Ogni preset restituisce solo le sezioni da cambiare.
 */
import type { UserData } from './data.tsx';
import type { OrganicParameters, SimulationConfig, MonteCarloConfig } from '../engine/types.ts';

export type PresetPatch = Partial<{
  organicParameters: OrganicParameters;
  simulationConfig: SimulationConfig;
  monteCarlo: MonteCarloConfig;
  taxModel: UserData['taxModel'];
}>;

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  group: 'rischio' | 'fisco' | 'precisione';
  description: string;
  apply: (d: UserData) => PresetPatch;
}

// -- profili di rischio: cambiano SOLO le assunzioni organiche + il buffer di sicurezza --
function organicProfile(over: {
  focusAlpha: number; focusBeta: number;
  lambda: number; sevMedian: number; sevSigma: number;
  dropProb: number; dropPersist: number;
  correlation: number;
}): OrganicParameters {
  return {
    monthlyFocusRate: { dist: 'beta', alpha: over.focusAlpha, beta: over.focusBeta, scaleMin: 0.1, scaleMax: 1 },
    unforeseenEvents: {
      arrivals: { dist: 'poisson', lambda: over.lambda },
      severity: { dist: 'lognormal', median: over.sevMedian, sigma: over.sevSigma, clampMax: 12000 },
    },
    clientPaymentDelayDays: { dist: 'triangular', min: 12, mode: 42, max: 130 },
    productivityDrop: {
      monthlyProbability: over.dropProb,
      durationDays: { dist: 'lognormal', median: 6, sigma: 0.8, clampMax: 45 },
      severity: 0.55,
      persistenceFactor: over.dropPersist,
    },
    incomeFocusCorrelation: over.correlation,
  };
}

const withBuffer = (d: UserData, ruinThreshold: number, warningMonths: number): SimulationConfig => ({
  ...d.simulationConfig,
  ruinThresholdEUR: ruinThreshold,
  liquidityWarningMonths: warningMonths,
});

const forfettario2025 = (d: UserData): UserData['taxModel'] => ({
  ...d.taxModel,
  regime: 'forfettario',
  paymentSchedule: { saldoMonth: 6, primoAccontoMonth: 6, secondoAccontoMonth: 11, accontoTotalPercent: 100, accontoSplit: [40, 60] },
  forfettario: {
    coefficienteRedditivita: 0.78,
    aliquotaSostitutiva: 5,
    aliquotaPostAgevolazione: 15,
    anniAliquotaRidotta: 5,
    annoInizioAttivita: d.taxModel.forfettario?.annoInizioAttivita ?? 2024,
    limiteRicaviEUR: 85000,
    sogliaUscitaImmediataEUR: 100000,
    cassaPrevidenziale: 'gestione_separata',
    gestioneSeparataPercent: 26.07,
    riduzioneContributiPercent: null,
    speseDeducibili: false,
  },
});

export const PRESETS: Preset[] = [
  {
    id: 'prudente',
    name: 'Prudente',
    emoji: '🛡️',
    group: 'rischio',
    description: 'Assume condizioni difficili e un buffer ampio: più imprevisti, mesi brutti che si aggregano, soglia di rovina più alta. Il numero “da preparati al peggio”.',
    apply: (d) => ({
      organicParameters: organicProfile({ focusAlpha: 5, focusBeta: 3, lambda: 0.4, sevMedian: 450, sevSigma: 1.25, dropProb: 0.16, dropPersist: 2.2, correlation: 0.5 }),
      simulationConfig: withBuffer(d, 2500, 4),
    }),
  },
  {
    id: 'realista',
    name: 'Realista',
    emoji: '⚖️',
    group: 'rischio',
    description: 'Le assunzioni di default, calibrate su un libero professionista tipico. Il punto di partenza equilibrato.',
    apply: (d) => ({
      organicParameters: organicProfile({ focusAlpha: 6, focusBeta: 2.6, lambda: 0.28, sevMedian: 320, sevSigma: 1.1, dropProb: 0.12, dropPersist: 1.9, correlation: 0.35 }),
      simulationConfig: withBuffer(d, 1000, 3),
    }),
  },
  {
    id: 'ottimista',
    name: 'Ottimista',
    emoji: '☀️',
    group: 'rischio',
    description: 'Anno favorevole: pochi imprevisti e poco costosi, focus alto, buffer snello. Utile come limite superiore ragionevole.',
    apply: (d) => ({
      organicParameters: organicProfile({ focusAlpha: 7, focusBeta: 2.2, lambda: 0.18, sevMedian: 240, sevSigma: 0.9, dropProb: 0.08, dropPersist: 1.4, correlation: 0.2 }),
      simulationConfig: withBuffer(d, 500, 2),
    }),
  },
  {
    id: 'fisco2025',
    name: 'Fisco 2025 (forfettario)',
    emoji: '🧾',
    group: 'fisco',
    description: 'Riempie le aliquote del regime forfettario con i valori 2025 (coeff. 78%, aliquota agevolata 5%, gestione separata 26,07%). Da confermare con il commercialista, ma ti permette di simulare subito.',
    apply: (d) => ({ taxModel: forfettario2025(d) }),
  },
  {
    id: 'precisione-alta',
    name: 'Precisione alta',
    emoji: '🎯',
    group: 'precisione',
    description: '25.000 iterazioni: la probabilità di rovina si stabilizza al decimale. Più lento (qualche secondo), per la decisione finale.',
    apply: (d) => ({ monteCarlo: { ...d.monteCarlo, iterations: 25000 } }),
  },
  {
    id: 'precisione-veloce',
    name: 'Veloce',
    emoji: '⚡',
    group: 'precisione',
    description: '2.000 iterazioni: risultato in un lampo mentre esplori. Meno preciso, ottimo per provare tante configurazioni.',
    apply: (d) => ({ monteCarlo: { ...d.monteCarlo, iterations: 2000 } }),
  },
];

export const PRESET_GROUPS: { id: Preset['group']; label: string }[] = [
  { id: 'rischio', label: 'Profilo di rischio' },
  { id: 'fisco', label: 'Fisco' },
  { id: 'precisione', label: 'Precisione' },
];
