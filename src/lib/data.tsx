/** Contesto dei dati utente: carica e decifra i blob, mantiene lo stato tipizzato,
 *  ripersiste ogni modifica (cifrandola). Il server vede solo blob opachi. */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api, ApiError } from './api.ts';
import { merge3 } from './merge.ts';
import { useSession } from './session.tsx';
import { DEMO, loadDemoData, saveDemoData } from './demo.ts';
import { type Ledger, emptyLedger, anchorInput } from './ledger.ts';
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
  ledger: Ledger;
}

export type DataType = keyof UserData;

const DATA_TYPES: DataType[] = ['profile', 'incomeStreams', 'expenses', 'organicParameters', 'taxModel', 'simulationConfig', 'monteCarlo', 'ledger'];

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
    monteCarlo: { iterations: 10000, seed: 20260101, percentiles: [5, 10, 25, 50, 75, 90, 95], convergenceCheck: { enabled: true, tolerance: 0.01 }, antitheticVariates: true },
    ledger: emptyLedger(),
  };
}

interface DataContextValue {
  data: UserData | null;
  loading: boolean;
  error: string | null;
  savingType: DataType | null;
  online: boolean;
  syncing: boolean;
  /** Contatore che aumenta quando gli scenari cambiano su un altro dispositivo. */
  scenariosRev: number;
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
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [scenariosRev, setScenariosRev] = useState(0);
  const loadedFor = useRef<string | null>(null);
  const versions = useRef<Partial<Record<DataType, number>>>({}); // ultima versione sincronizzata
  const bases = useRef<Partial<Record<DataType, unknown>>>({}); // valore base per il merge 3-vie
  const OFFLINE_KEY = 'kp_offline_queue';

  const timers = useRef<Partial<Record<DataType, ReturnType<typeof setTimeout>>>>({});
  const pending = useRef<Partial<Record<DataType, unknown>>>({});

  const reload = useCallback(async () => {
    if (!isUnlocked) return;
    if (DEMO) {
      setData(loadDemoData());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const blobs = await api.getAllData();
      const base = defaultUserData();
      const next: Partial<UserData> = {};
      for (const b of blobs) {
        if (!DATA_TYPES.includes(b.dataType as DataType)) continue;
        try {
          const val = await decryptFor(b.dataType, b.encryptedBlob, b.iv);
          next[b.dataType as DataType] = val as never;
          versions.current[b.dataType as DataType] = b.lastModified;
          bases.current[b.dataType as DataType] = val;
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

  // ---- coda offline (blob cifrati, E2E-safe a riposo) ----
  const readQueue = (): { type: DataType; ciphertext: string; iv: string; baseVersion: number }[] => {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    } catch {
      return [];
    }
  };
  const writeQueue = (q: unknown[]) => localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  const enqueueOffline = (e: { type: DataType; ciphertext: string; iv: string; baseVersion: number }) =>
    writeQueue([...readQueue().filter((x) => x.type !== e.type), e]);
  const dequeueOffline = (type: DataType) => writeQueue(readQueue().filter((x) => x.type !== type));

  const persist = useCallback(
    async (type: DataType, value: unknown) => {
      setSavingType(type);
      try {
        const { ciphertext, iv } = await encryptFor(type, value);
        const baseVersion = versions.current[type];
        try {
          const res = await api.putData(type, ciphertext, iv, baseVersion);
          versions.current[type] = res.lastModified;
          bases.current[type] = value;
          dequeueOffline(type);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            // Conflitto: prendi il server, mergia a 3 vie, riprova con la versione corrente.
            const cur = (e.body as { current?: { encryptedBlob: string; iv: string; lastModified: number } })?.current;
            if (cur) {
              const serverVal = await decryptFor(type, cur.encryptedBlob, cur.iv);
              const merged = merge3(type, bases.current[type], value, serverVal);
              setData((d) => (d ? { ...d, [type]: merged } : d));
              const enc2 = await encryptFor(type, merged);
              const res2 = await api.putData(type, enc2.ciphertext, enc2.iv, cur.lastModified);
              versions.current[type] = res2.lastModified;
              bases.current[type] = merged;
              dequeueOffline(type);
            }
          } else if (e instanceof ApiError) {
            throw e; // errore server reale
          } else {
            // errore di rete → offline: accoda per la riconnessione
            enqueueOffline({ type, ciphertext, iv, baseVersion: baseVersion ?? 0 });
            setOnline(false);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Salvataggio fallito');
      } finally {
        setSavingType((s) => (s === type ? null : s));
      }
    },
    [encryptFor, decryptFor],
  );

  /** Applica una modifica remota (SSE/polling) se più recente e senza una modifica locale in corso. */
  const applyRemoteChange = useCallback(
    async (type: DataType) => {
      if (pending.current[type] !== undefined || timers.current[type]) return; // sto editando quel tipo
      try {
        const row = await api.getData(type);
        if (versions.current[type] && row.lastModified <= versions.current[type]!) return;
        const val = await decryptFor(type, row.encryptedBlob, row.iv);
        versions.current[type] = row.lastModified;
        bases.current[type] = val;
        setData((d) => (d ? { ...d, [type]: val } : d));
      } catch {
        /* 404 = eliminato altrove; ignora */
      }
    },
    [decryptFor],
  );

  const flushOffline = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return;
    setSyncing(true);
    for (const entry of q) {
      try {
        const res = await api.putData(entry.type, entry.ciphertext, entry.iv, entry.baseVersion);
        versions.current[entry.type] = res.lastModified;
        dequeueOffline(entry.type);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          dequeueOffline(entry.type);
          setData((d) => {
            if (d && entry.type in d) void persist(entry.type, (d as unknown as Record<string, unknown>)[entry.type]);
            return d;
          });
        }
        // altri errori: lascia in coda per il prossimo online
      }
    }
    setSyncing(false);
  }, [persist]);

  useEffect(() => {
    if (isUnlocked && userId && loadedFor.current !== userId) {
      loadedFor.current = userId;
      void reload().then(() => flushOffline());
    }
    if (!isUnlocked) {
      loadedFor.current = null;
      versions.current = {};
      bases.current = {};
      setData(null);
    }
  }, [isUnlocked, userId, reload, flushOffline]);

  // Sincronizzazione push (SSE) + polling di fallback su focus/intervallo.
  useEffect(() => {
    if (!isUnlocked || DEMO) return;
    const es = new EventSource('/api/sync/stream', { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const { type, lastModified } = JSON.parse(ev.data);
        if (type === 'simulations') {
          setScenariosRev((r) => r + 1);
          return;
        }
        if ((DATA_TYPES as readonly string[]).includes(type) && (!versions.current[type as DataType] || lastModified > versions.current[type as DataType]!)) {
          void applyRemoteChange(type as DataType);
        }
      } catch {
        /* ignore */
      }
    };
    const poll = async () => {
      try {
        const vs = await api.getVersions();
        for (const { dataType, lastModified } of vs) {
          if ((DATA_TYPES as readonly string[]).includes(dataType) && (!versions.current[dataType as DataType] || lastModified > versions.current[dataType as DataType]!)) {
            void applyRemoteChange(dataType as DataType);
          }
        }
      } catch {
        /* ignore */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && poll();
    const interval = setInterval(poll, 20_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', poll);
    return () => {
      es.close();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', poll);
    };
  }, [isUnlocked, applyRemoteChange]);

  // Stato online/offline + flush della coda alla riconnessione.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushOffline();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushOffline]);

  const save = useCallback(
    async <K extends DataType>(type: K, value: UserData[K]) => {
      // Aggiorna subito lo stato locale; ripersiste (cifrando) con debounce per tipo.
      setData((d) => {
        const next = d ? { ...d, [type]: value } : d;
        if (DEMO && next) saveDemoData(next);
        return next;
      });
      if (DEMO) return; // in demo si persiste solo in localStorage
      pending.current[type] = value;
      if (timers.current[type]) clearTimeout(timers.current[type]);
      timers.current[type] = setTimeout(() => {
        delete timers.current[type];
        const v = pending.current[type];
        delete pending.current[type];
        void persist(type, v);
      }, 600);
    },
    [persist],
  );

  // Flush dei salvataggi in sospeso quando la tab passa in background o si smonta:
  // così una modifica seguita da chiusura/cambio-scheda non viene persa nel debounce.
  const flushPending = useCallback(() => {
    for (const type of Object.keys(pending.current) as DataType[]) {
      const t = timers.current[type];
      if (t) {
        clearTimeout(t);
        delete timers.current[type];
      }
      const v = pending.current[type];
      delete pending.current[type];
      void persist(type, v);
    }
  }, [persist]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushPending);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flushPending);
      flushPending();
    };
  }, [flushPending]);

  const buildSimulationInput = useCallback((): SimulationInput | null => {
    if (!data) return null;
    const base: SimulationInput = {
      simulationConfig: data.simulationConfig,
      incomeStreams: data.incomeStreams,
      expenses: data.expenses,
      organicParameters: data.organicParameters,
      taxModel: data.taxModel,
      monteCarlo: data.monteCarlo,
    };
    // Ri-àncora la proiezione al saldo reale / mese corrente del consuntivo, se impostati.
    return anchorInput(base, data.ledger);
  }, [data]);

  return (
    <Ctx.Provider value={{ data, loading, error, savingType, online, syncing, scenariosRev, reload, save, buildSimulationInput }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData fuori dal DataProvider');
  return ctx;
}
