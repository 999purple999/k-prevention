/** Contesto dei dati utente: carica e decifra i blob, mantiene lo stato tipizzato,
 *  ripersiste ogni modifica (cifrandola). Il server vede solo blob opachi. */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api } from './api.ts';
import { useSession } from './session.tsx';
import type {
  IncomeStream,
  Expense,
  OrganicParameters,
  TaxModel,
  SimulationConfig,
  MonteCarloConfig,
  SimulationInput,
} from '../engine/types.ts';

export interface UnverifiedEntry {
  path: string;
  reason: string;
  verifyAt?: string;
  lastKnownValue?: unknown;
  lastKnownYear?: number;
  filledWithLastKnown?: boolean;
  blocksSimulation?: boolean;
}

export interface UserData {
  profile: { name: string; email?: string };
  incomeStreams: IncomeStream[];
  expenses: Expense[];
  organicParameters: OrganicParameters;
  taxModel: TaxModel & { _unverified?: UnverifiedEntry[] };
  simulationConfig: SimulationConfig;
  monteCarlo: MonteCarloConfig;
}

export type DataType = keyof UserData;

const DATA_TYPES: DataType[] = ['profile', 'incomeStreams', 'expenses', 'organicParameters', 'taxModel', 'simulationConfig', 'monteCarlo'];

export function defaultUserData(name = 'Nuovo utente'): UserData {
  return {
    profile: { name },
    incomeStreams: [],
    expenses: [],
    organicParameters: {
      monthlyFocusRate: { dist: 'beta', alpha: 6, beta: 2.6, scaleMin: 0.1, scaleMax: 1 },
      unforeseenEvents: { arrivals: { dist: 'poisson', lambda: 0.28 }, severity: { dist: 'lognormal', median: 320, sigma: 1.1, clampMax: 12000 } },
      clientPaymentDelayDays: { dist: 'triangular', min: 12, mode: 42, max: 130 },
      productivityDrop: { monthlyProbability: 0.12, durationDays: { dist: 'lognormal', median: 6, sigma: 0.8, clampMax: 45 }, severity: 0.55, persistenceFactor: 1.9 },
      incomeFocusCorrelation: 0.35,
    },
    taxModel: {
      regime: 'forfettario',
      paymentSchedule: { saldoMonth: 6, primoAccontoMonth: 6, secondoAccontoMonth: 11, accontoTotalPercent: 100, accontoSplit: [40, 60] },
      forfettario: {
        coefficienteRedditivita: 0.78, aliquotaSostitutiva: null, aliquotaPostAgevolazione: null, anniAliquotaRidotta: null,
        annoInizioAttivita: null, limiteRicaviEUR: null, sogliaUscitaImmediataEUR: null, cassaPrevidenziale: 'gestione_separata',
        gestioneSeparataPercent: null, riduzioneContributiPercent: null, speseDeducibili: false,
      },
      _unverified: [],
    },
    simulationConfig: { initialCapital: 10000, startDate: '2026-01-01', simulationHorizons: [12, 24, 36], ruinThresholdEUR: 1000, liquidityWarningMonths: 3 },
    monteCarlo: { iterations: 2000, seed: 20260101, percentiles: [5, 10, 25, 50, 75, 90, 95], convergenceCheck: { enabled: true, tolerance: 0.01 }, antitheticVariates: true },
  };
}

interface DataContextValue {
  data: UserData | null;
  loading: boolean;
  error: string | null;
  savingType: DataType | null;
  reload: () => Promise<void>;
  save: <K extends DataType>(type: K, value: UserData[K]) => Promise<void>;
  buildSimulationInput: () => SimulationInput | null;
}

const Ctx = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { isUnlocked, encryptFor, decryptFor, userId } = useSession();
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<DataType | null>(null);
  const loadedFor = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!isUnlocked) return;
    setLoading(true);
    setError(null);
    try {
      const blobs = await api.getAllData();
      const base = defaultUserData();
      const next: Partial<UserData> = {};
      for (const b of blobs) {
        if (!DATA_TYPES.includes(b.dataType as DataType)) continue;
        try {
          next[b.dataType as DataType] = (await decryptFor(b.dataType, b.encryptedBlob, b.iv)) as never;
        } catch {
          setError('Impossibile decifrare alcuni dati (chiave errata?).');
        }
      }
      setData({ ...base, ...next } as UserData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, decryptFor]);

  useEffect(() => {
    if (isUnlocked && userId && loadedFor.current !== userId) {
      loadedFor.current = userId;
      void reload();
    }
    if (!isUnlocked) {
      loadedFor.current = null;
      setData(null);
    }
  }, [isUnlocked, userId, reload]);

  const timers = useRef<Partial<Record<DataType, ReturnType<typeof setTimeout>>>>({});
  const save = useCallback(
    async <K extends DataType>(type: K, value: UserData[K]) => {
      // Aggiorna subito lo stato locale; ripersiste (cifrando) con debounce per tipo.
      setData((d) => (d ? { ...d, [type]: value } : d));
      if (timers.current[type]) clearTimeout(timers.current[type]);
      timers.current[type] = setTimeout(async () => {
        setSavingType(type);
        try {
          const { ciphertext, iv } = await encryptFor(type, value);
          await api.putData(type, ciphertext, iv);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Salvataggio fallito');
        } finally {
          setSavingType((s) => (s === type ? null : s));
        }
      }, 600);
    },
    [encryptFor],
  );

  const buildSimulationInput = useCallback((): SimulationInput | null => {
    if (!data) return null;
    return {
      simulationConfig: data.simulationConfig,
      incomeStreams: data.incomeStreams,
      expenses: data.expenses,
      organicParameters: data.organicParameters,
      taxModel: data.taxModel,
      monteCarlo: data.monteCarlo,
    };
  }, [data]);

  return (
    <Ctx.Provider value={{ data, loading, error, savingType, reload, save, buildSimulationInput }}>{children}</Ctx.Provider>
  );
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData fuori dal DataProvider');
  return ctx;
}
