/** Hook che pilota il Web Worker della simulazione (nessuna simulate() in un componente).
 *  Un solo listener persistente; i messaggi sono instradati per runId, così i risultati
 *  di run superate vengono scartati senza accumulare listener (nessun memory leak). */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationInput, SimulationOutput } from '../engine/types.ts';

export type RunMode = 'preview' | 'full';

interface State {
  output: SimulationOutput | null;
  mode: RunMode | null;
  running: boolean;
  progress: number; // 0..1
  error: string | null;
}

// Anteprima con abbastanza scenari da rendere l'istogramma leggibile mentre modifichi
// (200 erano troppo pochi: barre da 5-6 scenari). 2500 girano comunque in ~0,3s nel worker.
const PREVIEW_ITERATIONS = 2500;

export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const modeRef = useRef<Record<number, RunMode>>({});
  const [state, setState] = useState<State>({ output: null, mode: null, running: false, progress: 0, error: null });

  useEffect(() => {
    const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (typeof msg?.runId !== 'number' || msg.runId !== runIdRef.current) return; // scarta run obsolete
      const mode = modeRef.current[msg.runId] ?? 'full';
      if (msg.type === 'progress') {
        setState((s) => ({ ...s, progress: msg.total ? msg.done / msg.total : 0 }));
      } else if (msg.type === 'result') {
        setState({ output: msg.output, mode, running: false, progress: 1, error: null });
        delete modeRef.current[msg.runId];
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, running: false, error: msg.message }));
        delete modeRef.current[msg.runId];
      }
    };
    worker.addEventListener('message', onMessage);
    return () => {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((input: SimulationInput, mode: RunMode = 'full') => {
    const worker = workerRef.current;
    if (!worker) return;
    const runId = ++runIdRef.current;
    modeRef.current[runId] = mode;
    setState((s) => ({ ...s, running: true, progress: 0, error: null, mode }));
    worker.postMessage({ type: 'run', runId, input, iterationsOverride: mode === 'preview' ? PREVIEW_ITERATIONS : undefined });
  }, []);

  const cancel = useCallback(() => {
    // Invalida la run corrente: i suoi messaggi verranno ignorati dal listener.
    runIdRef.current++;
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, run, cancel };
}
