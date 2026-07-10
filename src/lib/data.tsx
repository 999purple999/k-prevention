/** Contesto dei dati utente: carica e decifra i blob, mantiene lo stato tipizzato,
 *  ripersiste ogni modifica (cifrandola). Il server vede solo blob opachi.
 *
 *  Multi-workspace: le mappe interne (versioni, basi, coda) sono chiavizzate per tipo
 *  COMPLETO sul server (`w_<id>_<tipo>` o nudo per il default), così i workspace non
 *  collidono mai. `UserData` contiene sempre il workspace ATTIVO, per tipo base. */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api, ApiError } from './api.ts';
import { merge3 } from './merge.ts';
import { useSession } from './session.tsx';
import { DEMO, loadDemoData, saveDemoData } from './demo.ts';
import { type Ledger, emptyLedger, anchorInput } from './ledger.ts';
import {
  type Workspace,
  DEFAULT_WORKSPACE,
  CONSOLIDATO_ID,
  typeForWs,
  baseTypeForWs,
} from './workspaces.ts';
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
const WS_INDEX_TYPE = 'workspaces';
const ACTIVE_WS_KEY = 'kp_active_ws';

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
  savingType: string | null;
  online: boolean;
  syncing: boolean;
  scenariosRev: number;
  // multi-workspace
  workspaces: Workspace[];
  activeWorkspace: string;
  isConsolidato: boolean;
  readOnly: boolean;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, kind: Workspace['kind']) => Promise<string>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
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
  const [savingType, setSavingType] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [scenariosRev, setScenariosRev] = useState(0);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WORKSPACE]);
  const [activeWorkspace, setActiveWorkspace] = useState<string>(() => (DEMO ? 'default' : localStorage.getItem(ACTIVE_WS_KEY) || 'default'));
  const activeRef = useRef(activeWorkspace);
  activeRef.current = activeWorkspace;
  const isConsolidato = activeWorkspace === CONSOLIDATO_ID;
  const readOnly = isConsolidato;

  const loadedFor = useRef<string | null>(null);
  const versions = useRef<Record<string, number>>({}); // per FULL type
  const bases = useRef<Record<string, unknown>>({}); // valore base per merge 3-vie, per FULL type
  const wsVersion = useRef<number | undefined>(undefined);
  const OFFLINE_KEY = 'kp_offline_queue';

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); // per FULL type
  const pending = useRef<Record<string, { baseType: DataType; value: unknown }>>({}); // per FULL type

  const prefix = useCallback((baseType: DataType) => typeForWs(activeRef.current, baseType), []);

  // ---- caricamento ----
  const decryptBlob = useCallback(
    async (fullType: string, encryptedBlob: string, iv: string) => decryptFor(fullType, encryptedBlob, iv),
    [decryptFor],
  );

  const loadWorkspaceData = useCallback(
    (blobs: { dataType: string; encryptedBlob: string; iv: string; lastModified: number }[], wsId: string) =>
      (async () => {
        const base = defaultUserData();
        const next: Partial<UserData> = {};
        for (const bt of DATA_TYPES) {
          const full = typeForWs(wsId, bt);
          const b = blobs.find((x) => x.dataType === full);
          if (!b) continue;
          try {
            const val = await decryptBlob(full, b.encryptedBlob, b.iv);
            next[bt] = val as never;
            versions.current[full] = b.lastModified;
            bases.current[full] = val;
          } catch {
            setError('Impossibile decifrare alcuni dati (chiave errata?).');
          }
        }
        return { ...base, ...next } as UserData;
      })(),
    [decryptBlob],
  );

  const buildConsolidato = useCallback(
    (blobs: { dataType: string; encryptedBlob: string; iv: string; lastModified: number }[], wsList: Workspace[]) =>
      (async () => {
        const incomeStreams: IncomeStream[] = [];
        const expenses: Expense[] = [];
        for (const w of wsList) {
          const incFull = typeForWs(w.id, 'incomeStreams');
          const expFull = typeForWs(w.id, 'expenses');
          const incBlob = blobs.find((x) => x.dataType === incFull);
          const expBlob = blobs.find((x) => x.dataType === expFull);
          try {
            if (incBlob) {
              const inc = (await decryptBlob(incFull, incBlob.encryptedBlob, incBlob.iv)) as IncomeStream[];
              for (const s of inc) incomeStreams.push({ ...s, id: `${w.id}__${s.id}`, name: `${s.name} · ${w.name}` });
            }
            if (expBlob) {
              const exp = (await decryptBlob(expFull, expBlob.encryptedBlob, expBlob.iv)) as Expense[];
              for (const e of exp) expenses.push({ ...e, id: `${w.id}__${e.id}`, name: `${e.name} · ${w.name}` });
            }
          } catch {
            /* salta workspace non decifrabile */
          }
        }
        // Assunzioni (organic/fisco/config/mc) dal workspace di default: la vista è un
        // overview di cassa aggregato. Il fisco combinato è approssimato (vedi UI).
        const defFull = (bt: DataType) => typeForWs('default', bt);
        const pick = async <T,>(bt: DataType, fallback: T): Promise<T> => {
          const b = blobs.find((x) => x.dataType === defFull(bt));
          if (!b) return fallback;
          try {
            return (await decryptBlob(defFull(bt), b.encryptedBlob, b.iv)) as T;
          } catch {
            return fallback;
          }
        };
        const d = defaultUserData('Consolidato');
        const agg: UserData = {
          profile: { name: 'Consolidato' },
          incomeStreams,
          expenses,
          organicParameters: await pick('organicParameters', d.organicParameters),
          taxModel: await pick('taxModel', d.taxModel),
          simulationConfig: await pick('simulationConfig', d.simulationConfig),
          monteCarlo: await pick('monteCarlo', d.monteCarlo),
          ledger: await pick('ledger', d.ledger),
        };
        return agg;
      })(),
    [decryptBlob],
  );

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
      // indice workspace
      const wsBlob = blobs.find((b) => b.dataType === WS_INDEX_TYPE);
      let wsList: Workspace[] = [DEFAULT_WORKSPACE];
      if (wsBlob) {
        try {
          const list = (await decryptBlob(WS_INDEX_TYPE, wsBlob.encryptedBlob, wsBlob.iv)) as Workspace[];
          wsList = list.some((w) => w.id === 'default') ? list : [DEFAULT_WORKSPACE, ...list];
          wsVersion.current = wsBlob.lastModified;
        } catch {
          /* usa default */
        }
      }
      setWorkspaces(wsList);
      const active = activeRef.current;
      if (active === CONSOLIDATO_ID) {
        setData(await buildConsolidato(blobs, wsList));
      } else {
        const exists = wsList.some((w) => w.id === active) || active === 'default';
        const targetWs = exists ? active : 'default';
        if (!exists) setActiveWorkspace('default');
        setData(await loadWorkspaceData(blobs, targetWs));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, decryptBlob, loadWorkspaceData, buildConsolidato]);

  // ---- coda offline (blob cifrati, per FULL type) ----
  interface QueueEntry { full: string; baseType: DataType; ciphertext: string; iv: string; baseVersion: number }
  const readQueue = (): QueueEntry[] => {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    } catch {
      return [];
    }
  };
  const writeQueue = (q: unknown[]) => localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  const enqueueOffline = (e: QueueEntry) => writeQueue([...readQueue().filter((x) => x.full !== e.full), e]);
  const dequeueOffline = (full: string) => writeQueue(readQueue().filter((x) => x.full !== full));

  const persist = useCallback(
    async (full: string, baseType: DataType, value: unknown) => {
      setSavingType(full);
      try {
        const { ciphertext, iv } = await encryptFor(full, value);
        const baseVersion = versions.current[full];
        try {
          const res = await api.putData(full, ciphertext, iv, baseVersion);
          versions.current[full] = res.lastModified;
          bases.current[full] = value;
          dequeueOffline(full);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            const cur = (e.body as { current?: { encryptedBlob: string; iv: string; lastModified: number } })?.current;
            if (cur) {
              const serverVal = await decryptFor(full, cur.encryptedBlob, cur.iv);
              const merged = merge3(baseType, bases.current[full], value, serverVal);
              if (baseTypeForWs(activeRef.current, full, DATA_TYPES)) setData((d) => (d ? { ...d, [baseType]: merged } : d));
              const enc2 = await encryptFor(full, merged);
              const res2 = await api.putData(full, enc2.ciphertext, enc2.iv, cur.lastModified);
              versions.current[full] = res2.lastModified;
              bases.current[full] = merged;
              dequeueOffline(full);
            }
          } else if (e instanceof ApiError) {
            throw e;
          } else {
            enqueueOffline({ full, baseType, ciphertext, iv, baseVersion: baseVersion ?? 0 });
            setOnline(false);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Salvataggio fallito');
      } finally {
        setSavingType((s) => (s === full ? null : s));
      }
    },
    [encryptFor, decryptFor],
  );

  const applyRemoteChange = useCallback(
    async (full: string) => {
      if (pending.current[full] !== undefined || timers.current[full]) return;
      try {
        const row = await api.getData(full);
        if (versions.current[full] && row.lastModified <= versions.current[full]) return;
        const val = await decryptFor(full, row.encryptedBlob, row.iv);
        versions.current[full] = row.lastModified;
        bases.current[full] = val;
        const bare = baseTypeForWs(activeRef.current, full, DATA_TYPES);
        if (bare) setData((d) => (d ? { ...d, [bare]: val } : d));
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
        const res = await api.putData(entry.full, entry.ciphertext, entry.iv, entry.baseVersion);
        versions.current[entry.full] = res.lastModified;
        dequeueOffline(entry.full);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          dequeueOffline(entry.full);
          const bare = baseTypeForWs(activeRef.current, entry.full, DATA_TYPES) as DataType | null;
          if (bare) setData((d) => { if (d) void persist(entry.full, bare, (d as unknown as Record<string, unknown>)[bare]); return d; });
        }
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

  // Sincronizzazione push (SSE) + polling di fallback.
  useEffect(() => {
    if (!isUnlocked || DEMO) return;
    const handle = (type: string, lastModified?: number) => {
      if (type === 'simulations') { setScenariosRev((r) => r + 1); return; }
      if (type === WS_INDEX_TYPE) { if (!wsVersion.current || (lastModified ?? Infinity) > wsVersion.current) void reload(); return; }
      if (activeRef.current === CONSOLIDATO_ID) { void reload(); return; }
      if (baseTypeForWs(activeRef.current, type, DATA_TYPES) && (!versions.current[type] || (lastModified ?? Infinity) > versions.current[type])) {
        void applyRemoteChange(type);
      }
    };
    const es = new EventSource('/api/sync/stream', { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const { type, lastModified } = JSON.parse(ev.data);
        handle(type, lastModified);
      } catch {
        /* ignore */
      }
    };
    const poll = async () => {
      try {
        const vs = await api.getVersions();
        for (const { dataType, lastModified } of vs) handle(dataType, lastModified);
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
  }, [isUnlocked, applyRemoteChange, reload]);

  // Stato online/offline.
  useEffect(() => {
    const onOnline = () => { setOnline(true); void flushOffline(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [flushOffline]);

  const save = useCallback(
    async <K extends DataType>(type: K, value: UserData[K]) => {
      if (readOnly) return; // il consolidato è di sola lettura
      setData((d) => {
        const next = d ? { ...d, [type]: value } : d;
        if (DEMO && next) saveDemoData(next);
        return next;
      });
      if (DEMO) return;
      const full = prefix(type);
      pending.current[full] = { baseType: type, value };
      if (timers.current[full]) clearTimeout(timers.current[full]);
      timers.current[full] = setTimeout(() => {
        delete timers.current[full];
        const p = pending.current[full];
        delete pending.current[full];
        if (p) void persist(full, p.baseType, p.value);
      }, 600);
    },
    [persist, prefix, readOnly],
  );

  const flushPending = useCallback(() => {
    for (const full of Object.keys(pending.current)) {
      const t = timers.current[full];
      if (t) { clearTimeout(t); delete timers.current[full]; }
      const p = pending.current[full];
      delete pending.current[full];
      if (p) void persist(full, p.baseType, p.value);
    }
  }, [persist]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushPending(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushPending);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flushPending);
      flushPending();
    };
  }, [flushPending]);

  // ---- gestione workspace ----
  const persistWorkspaces = useCallback(
    async (list: Workspace[]) => {
      if (DEMO) return; // la demo ha un solo workspace
      const { ciphertext, iv } = await encryptFor(WS_INDEX_TYPE, list);
      const res = await api.putData(WS_INDEX_TYPE, ciphertext, iv, wsVersion.current);
      wsVersion.current = res.lastModified;
    },
    [encryptFor],
  );

  const switchWorkspace = useCallback((id: string) => {
    flushPending();
    localStorage.setItem(ACTIVE_WS_KEY, id);
    setActiveWorkspace(id);
    activeRef.current = id;
    void reload();
  }, [flushPending, reload]);

  const createWorkspace = useCallback(
    async (name: string, kind: Workspace['kind']) => {
      const { newWorkspaceId } = await import('./workspaces.ts');
      const id = newWorkspaceId();
      const list = [...workspaces, { id, name: name.trim() || 'Nuovo workspace', kind }];
      setWorkspaces(list);
      await persistWorkspaces(list);
      switchWorkspace(id);
      return id;
    },
    [workspaces, persistWorkspaces, switchWorkspace],
  );

  const renameWorkspace = useCallback(
    async (id: string, name: string) => {
      const list = workspaces.map((w) => (w.id === id ? { ...w, name: name.trim() || w.name } : w));
      setWorkspaces(list);
      await persistWorkspaces(list);
    },
    [workspaces, persistWorkspaces],
  );

  const deleteWorkspace = useCallback(
    async (id: string) => {
      if (id === 'default') return;
      const list = workspaces.filter((w) => w.id !== id);
      setWorkspaces(list);
      await persistWorkspaces(list);
      // cancella i blob del workspace
      for (const bt of DATA_TYPES) {
        try { await api.deleteData(typeForWs(id, bt)); } catch { /* ignore */ }
      }
      if (activeRef.current === id) switchWorkspace('default');
    },
    [workspaces, persistWorkspaces, switchWorkspace],
  );

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
    return anchorInput(base, data.ledger);
  }, [data]);

  return (
    <Ctx.Provider
      value={{
        data, loading, error, savingType, online, syncing, scenariosRev,
        workspaces, activeWorkspace, isConsolidato, readOnly,
        switchWorkspace, createWorkspace, renameWorkspace, deleteWorkspace,
        reload, save, buildSimulationInput,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData fuori dal DataProvider');
  return ctx;
}
